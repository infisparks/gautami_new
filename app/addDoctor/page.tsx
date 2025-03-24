"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { db } from "../../lib/firebase";
import { ref, push, update, onValue, remove } from "firebase/database";
import Head from "next/head";
import { AiOutlineDelete, AiOutlineEdit } from "react-icons/ai";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// -----------------------------------------------------------------------------
// Interfaces
// -----------------------------------------------------------------------------

// IPD charges interface; keys = room types from DB
interface IIPDCharges {
  [key: string]: number;
}

// Form input interface
interface IDoctorFormInput {
  name: string;
  specialist: string;
  department: "OPD" | "IPD" | "Both";
  opdCharge?: number;
  ipdCharges?: IIPDCharges;
}

// Doctor interface for Firebase
interface IDoctor {
  id: string;
  name: string;
  specialist: string;
  department: "OPD" | "IPD" | "Both";
  opdCharge?: number;
  ipdCharges?: IIPDCharges;
}

const AdminDoctorsPage: React.FC = () => {
  // ---------------------------------------------------------------------------
  // 1) Fetch dynamic roomTypes from "beds" in Firebase
  // ---------------------------------------------------------------------------
  const [roomTypes, setRoomTypes] = useState<string[]>([]);
  useEffect(() => {
    const bedsRef = ref(db, "beds");
    const unsubscribeBeds = onValue(bedsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const rooms = Object.keys(data);
        setRoomTypes(rooms);
      } else {
        setRoomTypes([]);
      }
    });
    return () => unsubscribeBeds();
  }, []);

  // ---------------------------------------------------------------------------
  // 2) Build a lazy schema for IPD charges dynamically
  // ---------------------------------------------------------------------------
  const dynamicIPDChargesSchema = useMemo(() => {
    return yup.lazy(() => {
      // If no room types, just return an empty object
      if (!roomTypes.length) {
        return yup.object({});
      }
      // Build a shape requiring each room
      const shape: Record<string, yup.NumberSchema> = {};
      roomTypes.forEach((room) => {
        shape[room] = yup
          .number()
          .typeError("Must be a number")
          .positive("Must be positive")
          .required(`${room} charge is required`);
      });
      // Return an object with the shape
      return yup.object().shape(shape);
    });
  }, [roomTypes]);

  // ---------------------------------------------------------------------------
  // 3) Our main Yup schema with function-style .when() calls
  // ---------------------------------------------------------------------------
  const schema = useMemo(() => {
    return yup.object({
      name: yup.string().required("Doctor name is required"),
      specialist: yup.string().required("Specialist is required"),
      department: yup
        .mixed<"OPD" | "IPD" | "Both">()
        .oneOf(["OPD", "IPD", "Both"], "Select a valid department")
        .required("Department is required"),

      // For OPD or Both -> require an OPD charge
      opdCharge: yup.number().when("department", ([dept], schema) => {
        if (dept === "OPD" || dept === "Both") {
          return schema
            .typeError("OPD amount must be a number")
            .positive("OPD amount must be positive")
            .required("OPD amount is required");
        }
        return schema.notRequired();
      }),

      // For IPD or Both -> apply the lazy IPD schema
      ipdCharges: yup.mixed().when("department", ([dept], schema) => {
        if (dept === "IPD" || dept === "Both") {
          return dynamicIPDChargesSchema;
        }
        // Otherwise, not required
        return schema.notRequired();
      }),
    });
  }, [dynamicIPDChargesSchema]);

  // ---------------------------------------------------------------------------
  // 4) useForm for Adding a Doctor
  // ---------------------------------------------------------------------------
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<IDoctorFormInput>({
    resolver: yupResolver(schema),
    defaultValues: {
      name: "",
      specialist: "",
      department: "OPD",
      opdCharge: 0,
      ipdCharges: {},
    },
  });
  const departmentValue = watch("department");

  // ---------------------------------------------------------------------------
  // 5) useForm for Editing a Doctor
  // ---------------------------------------------------------------------------
  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    formState: { errors: errorsEdit },
    reset: resetEdit,
    watch: watchEdit,
  } = useForm<IDoctorFormInput>({
    resolver: yupResolver(schema),
    defaultValues: {
      name: "",
      specialist: "",
      department: "OPD",
      opdCharge: 0,
      ipdCharges: {},
    },
  });
  const departmentValueEdit = watchEdit("department");

  // ---------------------------------------------------------------------------
  // Local states: doctors, loading, modals
  // ---------------------------------------------------------------------------
  const [loading, setLoading] = useState(false);
  const [doctors, setDoctors] = useState<IDoctor[]>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentDoctor, setCurrentDoctor] = useState<IDoctor | null>(null);

  // ---------------------------------------------------------------------------
  // 6) Fetch doctors from Firebase
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const doctorsRef = ref(db, "doctors");
    const unsubscribe = onValue(doctorsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const loadedDoctors: IDoctor[] = Object.keys(data).map((key) => ({
          id: key,
          name: data[key].name,
          specialist: data[key].specialist,
          department: data[key].department,
          opdCharge: data[key].opdCharge,
          ipdCharges: data[key].ipdCharges,
        }));
        setDoctors(loadedDoctors);
      } else {
        setDoctors([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // ---------------------------------------------------------------------------
  // 7) Add Doctor
  // ---------------------------------------------------------------------------
  const onSubmit: SubmitHandler<IDoctorFormInput> = async (formData) => {
    setLoading(true);
    try {
      const doctorsRef = ref(db, "doctors");
      const newDoctorRef = push(doctorsRef);

      const newDoctor: IDoctor = {
        id: newDoctorRef.key || "",
        name: formData.name,
        specialist: formData.specialist,
        department: formData.department,
      };

      if (formData.department === "OPD" || formData.department === "Both") {
        newDoctor.opdCharge = formData.opdCharge;
      }
      if (formData.department === "IPD" || formData.department === "Both") {
        newDoctor.ipdCharges = formData.ipdCharges;
      }

      await update(newDoctorRef, newDoctor);

      toast.success("Doctor added successfully!", {
        position: "top-right",
        autoClose: 5000,
      });

      // Reset the form
      reset({
        name: "",
        specialist: "",
        department: "OPD",
        opdCharge: 0,
        ipdCharges: {},
      });
    } catch (error) {
      console.error("Error adding doctor:", error);
      toast.error("Failed to add doctor. Please try again.", {
        position: "top-right",
        autoClose: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 8) Delete Doctor
  // ---------------------------------------------------------------------------
  const handleDelete = async (doctorId: string) => {
    if (!confirm("Are you sure you want to delete this doctor?")) return;
    try {
      const doctorRef = ref(db, `doctors/${doctorId}`);
      await remove(doctorRef);
      toast.success("Doctor deleted successfully!", {
        position: "top-right",
        autoClose: 5000,
      });
    } catch (error) {
      console.error("Error deleting doctor:", error);
      toast.error("Failed to delete doctor. Please try again.", {
        position: "top-right",
        autoClose: 5000,
      });
    }
  };

  // ---------------------------------------------------------------------------
  // 9) Edit Doctor
  // ---------------------------------------------------------------------------
  const openEditModal = (doctor: IDoctor) => {
    setCurrentDoctor(doctor);
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setCurrentDoctor(null);
    setIsEditModalOpen(false);
  };

  // Initialize form when a doc is chosen for edit
  useEffect(() => {
    if (currentDoctor) {
      resetEdit({
        name: currentDoctor.name,
        specialist: currentDoctor.specialist,
        department: currentDoctor.department,
        opdCharge: currentDoctor.opdCharge ?? 0,
        ipdCharges: currentDoctor.ipdCharges ?? {},
      });
    }
  }, [currentDoctor, resetEdit]);

  // Submit the edited doc
  const onEditSubmit: SubmitHandler<IDoctorFormInput> = async (formData) => {
    if (!currentDoctor) return;
    setLoading(true);
    try {
      const doctorRef = ref(db, `doctors/${currentDoctor.id}`);

      const updatedDoctor: Partial<IDoctor> = {
        name: formData.name,
        specialist: formData.specialist,
        department: formData.department,
      };

      if (formData.department === "OPD" || formData.department === "Both") {
        updatedDoctor.opdCharge = formData.opdCharge;
      }
      if (formData.department === "IPD" || formData.department === "Both") {
        updatedDoctor.ipdCharges = formData.ipdCharges;
      }
      if (formData.department === "IPD") {
        delete updatedDoctor.opdCharge;
      }
      if (formData.department === "OPD") {
        delete updatedDoctor.ipdCharges;
      }

      await update(doctorRef, updatedDoctor);

      toast.success("Doctor updated successfully!", {
        position: "top-right",
        autoClose: 5000,
      });
      closeEditModal();
    } catch (error) {
      console.error("Error updating doctor:", error);
      toast.error("Failed to update doctor. Please try again.", {
        position: "top-right",
        autoClose: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  // Sample list of specialists
  const specialists = [
    "Cardiology",
    "Neurology",
    "Orthopedics",
    "Pediatrics",
    "Dermatology",
    "Oncology",
    "Psychiatry",
    "Gastroenterology",
    "Ophthalmology",
    "Radiology",
  ];

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------
  return (
    <>
      <Head>
        <title>Admin - Manage Doctors</title>
        <meta name="description" content="Add or remove doctors" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ToastContainer />

      <main className="min-h-screen bg-gradient-to-r from-yellow-100 to-yellow-200 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl bg-white rounded-3xl shadow-xl p-10">
          <h2 className="text-3xl font-bold text-center text-yellow-600 mb-8">
            Manage Doctors
          </h2>

          {/* Add Doctor Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mb-10">
            {/* Doctor Name */}
            <div className="relative">
              <input
                type="text"
                {...register("name")}
                placeholder="Doctor Name"
                className={`w-full pl-4 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                  errors.name ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
              />
              {errors.name && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.name.message}
                </p>
              )}
            </div>

            {/* Specialist */}
            <div className="relative">
              <select
                {...register("specialist")}
                className={`w-full pl-3 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                  errors.specialist ? "border-red-500" : "border-gray-300"
                } transition duration-200 appearance-none bg-white`}
              >
                <option value="">Select Specialist</option>
                {specialists.map((spec) => (
                  <option key={spec} value={spec}>
                    {spec}
                  </option>
                ))}
              </select>
              {errors.specialist && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.specialist.message}
                </p>
              )}
            </div>

            {/* Department */}
            <div className="relative">
              <select
                {...register("department")}
                className={`w-full pl-3 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                  errors.department ? "border-red-500" : "border-gray-300"
                } transition duration-200 appearance-none bg-white`}
              >
                <option value="OPD">OPD</option>
                <option value="IPD">IPD</option>
                <option value="Both">Both</option>
              </select>
              {errors.department && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.department.message}
                </p>
              )}
            </div>

            {/* OPD Charge */}
            {(departmentValue === "OPD" || departmentValue === "Both") && (
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  {...register("opdCharge")}
                  placeholder="OPD Charge (in Rs.)"
                  className={`w-full pl-4 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                    errors.opdCharge ? "border-red-500" : "border-gray-300"
                  } transition duration-200`}
                />
                {errors.opdCharge && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.opdCharge.message}
                  </p>
                )}
              </div>
            )}

            {/* IPD Charges */}
            {(departmentValue === "IPD" || departmentValue === "Both") &&
              roomTypes.length > 0 && (
                <div className="border p-4 rounded-lg space-y-4">
                  <p className="font-semibold text-gray-800">
                    Enter IPD Ward Charges:
                  </p>
                  {roomTypes.map((room) => {
                    // If there's an error for a particular room
                    const roomError =
                      errors.ipdCharges && (errors.ipdCharges as any)[room];
                    return (
                      <div key={room}>
                        <label className="block text-sm">
                          {room.replace(/_/g, " ").toUpperCase()} Charge
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          {...register(`ipdCharges.${room}` as const)}
                          placeholder={`${room} Charge`}
                          className={`w-full mt-1 pl-4 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                            roomError ? "border-red-500" : "border-gray-300"
                          } transition duration-200`}
                        />
                        {roomError && (
                          <p className="text-red-500 text-sm mt-1">
                            {roomError.message}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                loading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {loading ? "Adding..." : "Add Doctor"}
            </button>
          </form>

          {/* Existing Doctors */}
          <div>
            <h3 className="text-2xl font-semibold text-gray-700 mb-4">
              Existing Doctors
            </h3>
            {doctors.length === 0 ? (
              <p className="text-gray-500">No doctors available.</p>
            ) : (
              <ul className="space-y-4">
                {doctors.map((doctor) => (
                  <li
                    key={doctor.id}
                    className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="text-lg font-medium">{doctor.name}</p>
                      <p className="text-gray-600">
                        Specialist: {doctor.specialist}
                      </p>
                      <p className="text-gray-600">
                        Department: {doctor.department}
                      </p>
                      {doctor.opdCharge != null && (
                        <p className="text-gray-600">
                          OPD Charge: Rs {doctor.opdCharge}
                        </p>
                      )}
                      {doctor.ipdCharges && (
                        <div className="mt-2">
                          <p className="font-semibold">IPD Charges:</p>
                          <ul className="list-disc list-inside text-gray-600">
                            {Object.keys(doctor.ipdCharges).map((roomKey) => (
                              <li key={roomKey}>
                                {roomKey.replace(/_/g, " ").toUpperCase()}:
                                {"  "}
                                {doctor.ipdCharges
                                  ? doctor.ipdCharges[roomKey]
                                  : "N/A"}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    <div className="flex space-x-2 mt-4 md:mt-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(doctor)}
                        className="flex items-center justify-center bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition duration-200"
                      >
                        <AiOutlineEdit size={20} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(doctor.id)}
                        className="flex items-center justify-center bg-red-600 text-white p-2 rounded-lg hover:bg-red-700 transition duration-200"
                      >
                        <AiOutlineDelete size={20} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Edit Modal */}
        {isEditModalOpen && currentDoctor && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-3xl shadow-xl p-10 w-full max-w-lg relative">
              <h2 className="text-2xl font-bold text-center text-blue-600 mb-6">
                Edit Doctor
              </h2>
              <form
                onSubmit={handleSubmitEdit(onEditSubmit)}
                className="space-y-6"
              >
                {/* Doctor Name */}
                <div className="relative">
                  <input
                    type="text"
                    {...registerEdit("name")}
                    placeholder="Doctor Name"
                    className={`w-full pl-4 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errorsEdit.name ? "border-red-500" : "border-gray-300"
                    } transition duration-200`}
                  />
                  {errorsEdit.name && (
                    <p className="text-red-500 text-sm mt-1">
                      {errorsEdit.name.message}
                    </p>
                  )}
                </div>

                {/* Specialist */}
                <div className="relative">
                  <select
                    {...registerEdit("specialist")}
                    className={`w-full pl-3 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errorsEdit.specialist
                        ? "border-red-500"
                        : "border-gray-300"
                    } transition duration-200 appearance-none bg-white`}
                  >
                    <option value="">Select Specialist</option>
                    {specialists.map((spec) => (
                      <option key={spec} value={spec}>
                        {spec}
                      </option>
                    ))}
                  </select>
                  {errorsEdit.specialist && (
                    <p className="text-red-500 text-sm mt-1">
                      {errorsEdit.specialist.message}
                    </p>
                  )}
                </div>

                {/* Department */}
                <div className="relative">
                  <select
                    {...registerEdit("department")}
                    className={`w-full pl-3 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errorsEdit.department
                        ? "border-red-500"
                        : "border-gray-300"
                    } transition duration-200 appearance-none bg-white`}
                  >
                    <option value="OPD">OPD</option>
                    <option value="IPD">IPD</option>
                    <option value="Both">Both</option>
                  </select>
                  {errorsEdit.department && (
                    <p className="text-red-500 text-sm mt-1">
                      {errorsEdit.department.message}
                    </p>
                  )}
                </div>

                {/* OPD Charge */}
                {(departmentValueEdit === "OPD" ||
                  departmentValueEdit === "Both") && (
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      {...registerEdit("opdCharge")}
                      placeholder="OPD Charge (in Rs.)"
                      className={`w-full pl-4 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errorsEdit.opdCharge
                          ? "border-red-500"
                          : "border-gray-300"
                      } transition duration-200`}
                    />
                    {errorsEdit.opdCharge && (
                      <p className="text-red-500 text-sm mt-1">
                        {errorsEdit.opdCharge.message}
                      </p>
                    )}
                  </div>
                )}

                {/* IPD Charges */}
                {(departmentValueEdit === "IPD" ||
                  departmentValueEdit === "Both") &&
                  roomTypes.length > 0 && (
                    <div className="border p-4 rounded-lg space-y-4">
                      <p className="font-semibold text-gray-800">
                        Enter IPD Ward Charges:
                      </p>
                      {roomTypes.map((room) => {
                        const roomError =
                          errorsEdit.ipdCharges && (errorsEdit.ipdCharges as any)[room];
                        return (
                          <div key={room}>
                            <label className="block text-sm">
                              {room.replace(/_/g, " ").toUpperCase()} Charge
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              {...registerEdit(`ipdCharges.${room}` as const)}
                              placeholder={`${room} Charge`}
                              className={`w-full mt-1 pl-4 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                roomError ? "border-red-500" : "border-gray-300"
                              } transition duration-200`}
                            />
                            {roomError && (
                              <p className="text-red-500 text-sm mt-1">
                                {roomError.message}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                {/* Update Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    loading ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  {loading ? "Updating..." : "Update Doctor"}
                </button>

                {/* Cancel Button */}
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="w-full py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </>
  );
};

export default AdminDoctorsPage;
