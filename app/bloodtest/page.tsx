"use client";

import React, { useState, useEffect, useRef } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { ref, push, set, onValue, update } from "firebase/database";
import Head from "next/head";
import {
  AiOutlineUser,
  AiOutlinePhone,
  AiOutlineFieldBinary,
  AiOutlineDollarCircle,
} from "react-icons/ai";
import { FaCheckCircle, FaTimesCircle } from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// Import the main (Gautami) Firebase database and the Medford one
import { db as dbGautami } from "../../lib/firebase";
import { db as dbMedford } from "../../lib/firebaseMedford";

interface IPatientFormInput {
  name: string;
  phone: string;
  age?: number;
  address: string;
  gender: string;
  bloodTestName: string;
  amount: number;
  paymentId?: string;
  doctor?: string;
}

// Patient record in Gautami (full details)

// Minimal record in Medford Family (only minimal details)
interface MedfordPatient {
  patientId: string;
  name: string;
  contact: string;
  dob: string;
  gender: string;
  hospitalName: string;
}

// Combined type for auto‑complete suggestions
interface CombinedPatient {
  id: string;
  name: string;
  phone?: string;
  source: "gautami" | "medford";
  data: any;
}

interface IBloodTestEntry {
  bloodTestName: string;
}

interface Doctor {
  id: string;
  name: string;
}

function generatePatientId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const PathologyEntryPage: React.FC = () => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm<IPatientFormInput>({
    defaultValues: {
      name: "",
      phone: "",
      age: undefined,
      address: "",
      gender: "",
      bloodTestName: "",
      amount: 0,
      paymentId: "",
      doctor: "",
    },
  });

  const [loading, setLoading] = useState(false);

  // Blood test suggestions
  const [bloodTestOptions, setBloodTestOptions] = useState<string[]>([]);
  const [filteredBloodTests, setFilteredBloodTests] = useState<string[]>([]);
  const [showBloodTestSuggestions, setShowBloodTestSuggestions] =
    useState(false);
  const bloodTestSuggestionBoxRef = useRef<HTMLUListElement>(null);

  // Patient auto-complete state (from both databases)
  const [gautamiPatients, setGautamiPatients] = useState<CombinedPatient[]>([]);
  const [medfordPatients, setMedfordPatients] = useState<CombinedPatient[]>([]);
  const [patientNameInput, setPatientNameInput] = useState("");
  const [patientSuggestions, setPatientSuggestions] = useState<
    CombinedPatient[]
  >([]);
  const [selectedPatient, setSelectedPatient] =
    useState<CombinedPatient | null>(null);
  const patientSuggestionBoxRef = useRef<HTMLUListElement>(null);

  // Doctor auto-complete state
  const [doctorOptions, setDoctorOptions] = useState<Doctor[]>([]);
  const [doctorReferInput, setDoctorReferInput] = useState("");
  const [filteredDoctors, setFilteredDoctors] = useState<
    { label: string; value: string }[]
  >([]);
  const doctorSuggestionBoxRef = useRef<HTMLUListElement>(null);

  // Fetch available blood tests from Gautami DB
  useEffect(() => {
    const bloodTestsRef = ref(dbGautami, "bloodTests");
    const unsubscribe = onValue(bloodTestsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const typedData = data as Record<string, IBloodTestEntry>;
        const tests: string[] = Object.values(typedData).map(
          (entry: IBloodTestEntry) => entry.bloodTestName
        );
        const uniqueTests = Array.from(new Set(tests));
        setBloodTestOptions(uniqueTests);
      } else {
        setBloodTestOptions([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch doctors from Gautami DB
  useEffect(() => {
    const doctorsRef = ref(dbGautami, "doctors");
    const unsubscribe = onValue(doctorsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const docsArray = Object.values(data) as Doctor[];
        setDoctorOptions(docsArray);
      } else {
        setDoctorOptions([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch patients from Gautami DB
  useEffect(() => {
    const patientsRef = ref(dbGautami, "patients");
    const unsubscribe = onValue(patientsRef, (snapshot) => {
      const data = snapshot.val();
      const loaded: CombinedPatient[] = [];
      if (data) {
        for (const key in data) {
          loaded.push({
            id: key,
            name: data[key].name,
            phone: data[key].phone,
            source: "gautami",
            data: data[key],
          });
        }
      }
      setGautamiPatients(loaded);
    });
    return () => unsubscribe();
  }, []);

  // Fetch patients from Medford Family DB
  useEffect(() => {
    const medfordPatientsRef = ref(dbMedford, "patients");
    const unsubscribe = onValue(medfordPatientsRef, (snapshot) => {
      const data = snapshot.val();
      const loaded: CombinedPatient[] = [];
      if (data) {
        for (const key in data) {
          const rec: MedfordPatient = data[key];
          loaded.push({
            id: rec.patientId,
            name: rec.name,
            phone: rec.contact,
            source: "medford",
            data: rec,
          });
        }
      }
      setMedfordPatients(loaded);
    });
    return () => unsubscribe();
  }, []);

  // Combine patients from both databases for suggestions
  const allCombinedPatients = [...gautamiPatients, ...medfordPatients];

  // Filter patient suggestions when name input changes
  useEffect(() => {
    if (patientNameInput.length >= 2) {
      const lower = patientNameInput.toLowerCase();
      const suggestions = allCombinedPatients.filter((p) =>
        p.name.toLowerCase().includes(lower)
      );
      setPatientSuggestions(suggestions);
    } else {
      setPatientSuggestions([]);
    }
  }, [patientNameInput, allCombinedPatients]);

  // Filter blood test suggestions
  const handleBloodTestInputChange = (value: string) => {
    if (value) {
      const filtered = bloodTestOptions.filter((test) =>
        test.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredBloodTests(filtered);
      setShowBloodTestSuggestions(filtered.length > 0);
    } else {
      setFilteredBloodTests([]);
      setShowBloodTestSuggestions(false);
    }
  };

  // Filter doctor suggestions
  const handleDoctorReferInputChange = (value: string) => {
    setDoctorReferInput(value);
    if (value) {
      const filtered = doctorOptions.filter((doc) =>
        doc.name.toLowerCase().includes(value.toLowerCase())
      );
      const suggestions = filtered.map((doc) => ({
        label: doc.name,
        value: doc.id,
      }));
      setFilteredDoctors(suggestions);
    } else {
      setFilteredDoctors([]);
    }
  };

  // When a patient suggestion is clicked, populate the form
  const handlePatientSuggestionClick = (patient: CombinedPatient) => {
    setSelectedPatient(patient);
    setValue("name", patient.name);
    setValue("phone", patient.phone || "");
    if (patient.source === "gautami") {
      setValue("address", patient.data.address);
      setValue("age", patient.data.age);
      setValue("gender", patient.data.gender);
    } else {
      setValue("gender", patient.data.gender);
    }
    setPatientNameInput(patient.name);
    setPatientSuggestions([]);
    toast.info(
      `Patient ${patient.name} selected from ${patient.source.toUpperCase()}!`
    );
  };

  // When a doctor suggestion is clicked
  const handleDoctorSuggestionClick = (id: string, name: string) => {
    setDoctorReferInput(name);
    setValue("doctor", id, { shouldValidate: true });
    setFilteredDoctors([]);
  };

  // Hide suggestion boxes on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        patientSuggestionBoxRef.current &&
        !patientSuggestionBoxRef.current.contains(event.target as Node)
      ) {
        setPatientSuggestions([]);
      }
      if (
        bloodTestSuggestionBoxRef.current &&
        !bloodTestSuggestionBoxRef.current.contains(event.target as Node)
      ) {
        setShowBloodTestSuggestions(false);
      }
      if (
        doctorSuggestionBoxRef.current &&
        !doctorSuggestionBoxRef.current.contains(event.target as Node)
      ) {
        setFilteredDoctors([]);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // onSubmit handler
  const onSubmit: SubmitHandler<IPatientFormInput> = async (data) => {
    setLoading(true);
    try {
      let patientId: string;
      // If a patient is selected, update the full details in the Gautami database
      if (selectedPatient) {
        patientId = selectedPatient.id;
        const patientRef = ref(dbGautami, `patients/${patientId}`);
        await update(patientRef, {
          name: data.name,
          phone: data.phone,
          address: data.address,
          age: data.age,
          gender: data.gender,
        });
      } else {
        // New patient: create full record in Gautami DB and minimal record in Medford DB
        patientId = generatePatientId();
        // Save full details in Gautami
        await set(ref(dbGautami, `patients/${patientId}`), {
          name: data.name,
          phone: data.phone,
          address: data.address,
          age: data.age,
          gender: data.gender,
          createdAt: new Date().toISOString(),
          uhid: patientId,
          ipd: {},
        });
        // Save minimal details in Medford (only contact, dob, gender, name, patientId)
        await set(ref(dbMedford, `patients/${patientId}`), {
          name: data.name,
          contact: data.phone,
          gender: data.gender,
          dob: "", // Use empty string or set a proper value if available
          patientId: patientId,
          hospitalName: "MEDFORD",
        });
      }
      // Save pathology entry under the patient record in Gautami DB
      const pathologyRef = ref(dbGautami, `patients/${patientId}/pathology`);
      const newPathologyRef = push(pathologyRef);
      await set(newPathologyRef, {
        bloodTestName: data.bloodTestName,
        amount: data.amount,
        paymentId: data.paymentId || null,
        createdAt: new Date().toISOString(),
        doctor: data.doctor || "",
      });

      toast.success("Patient pathology entry saved successfully!", {
        position: "top-right",
        autoClose: 5000,
      });

      reset({
        name: "",
        phone: "",
        age: undefined,
        address: "",
        gender: "",
        bloodTestName: "",
        amount: 0,
        paymentId: "",
        doctor: "",
      });
      setPatientNameInput("");
      setDoctorReferInput("");
      setSelectedPatient(null);
      setPatientSuggestions([]);
    } catch (error) {
      console.error("Error saving patient pathology entry:", error);
      toast.error("Failed to save entry. Please try again.", {
        position: "top-right",
        autoClose: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Admin - Pathology Entry</title>
        <meta
          name="description"
          content="Add patient details and blood tests"
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ToastContainer />

      <main className="min-h-screen bg-gradient-to-r from-green-100 to-green-200 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl bg-white rounded-3xl shadow-xl p-10">
          <h2 className="text-3xl font-bold text-center text-green-600 mb-8">
            Pathology Entry
          </h2>
          <div className="mb-6 text-center text-gray-600">
            {new Date().toLocaleString()}
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Patient Name with Auto-Complete */}
            <div className="relative">
              <AiOutlineUser className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                value={patientNameInput}
                onChange={(e) => {
                  setPatientNameInput(e.target.value);
                  setValue("name", e.target.value, { shouldValidate: true });
                  setSelectedPatient(null);
                }}
                placeholder="Patient Name"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  errors.name ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
              />
              {patientSuggestions.length > 0 && (
                <ul
                  ref={patientSuggestionBoxRef}
                  className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg mt-1 max-h-60 overflow-y-auto shadow-lg"
                >
                  {patientSuggestions.map((patient) => (
                    <li
                      key={patient.id}
                      onClick={() => handlePatientSuggestionClick(patient)}
                      className="px-4 py-2 hover:bg-green-100 cursor-pointer flex justify-between items-center"
                    >
                      <span>{`${patient.name} - ${
                        patient.phone || ""
                      }`}</span>
                      {patient.source === "gautami" ? (
                        <FaCheckCircle color="green" />
                      ) : (
                        <FaTimesCircle color="red" />
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {errors.name && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.name.message}
                </p>
              )}
            </div>

            {/* Patient Phone */}
            <div className="relative">
              <AiOutlinePhone className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                {...register("phone")}
                placeholder="Patient Phone Number"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  errors.phone ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
              />
              {errors.phone && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.phone.message}
                </p>
              )}
            </div>

            {/* Age */}
            <div className="relative">
              <AiOutlineFieldBinary className="absolute top-3 left-3 text-gray-400" />
              <input
                type="number"
                {...register("age", { valueAsNumber: true })}
                placeholder="Age"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  errors.age ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
                min="0"
              />
              {errors.age && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.age.message}
                </p>
              )}
            </div>

            {/* Address */}
            <div className="relative">
              <AiOutlineUser className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                {...register("address")}
                placeholder="Address"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  errors.address ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
              />
              {errors.address && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.address.message}
                </p>
              )}
            </div>

            {/* Gender (Drop-Down) */}
            <div className="relative">
              <AiOutlineUser className="absolute top-3 left-3 text-gray-400" />
              <select
                {...register("gender")}
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  errors.gender ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
              >
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
              {errors.gender && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.gender.message}
                </p>
              )}
            </div>

            {/* Blood Test Name with Suggestions */}
            <div className="relative">
              <AiOutlineFieldBinary className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                {...register("bloodTestName")}
                placeholder="Blood Test Name"
                onChange={(e) => {
                  handleBloodTestInputChange(e.target.value);
                  setValue("bloodTestName", e.target.value, { shouldValidate: true });
                }}
                autoComplete="off"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  errors.bloodTestName ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
              />
              {showBloodTestSuggestions && filteredBloodTests.length > 0 && (
                <ul
                  ref={bloodTestSuggestionBoxRef}
                  className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg mt-1 max-h-60 overflow-y-auto shadow-lg"
                >
                  {filteredBloodTests.map((suggestion, index) => (
                    <li
                      key={index}
                      onClick={() => {
                        setValue("bloodTestName", suggestion, { shouldValidate: true });
                        setShowBloodTestSuggestions(false);
                      }}
                      className="px-4 py-2 hover:bg-green-100 cursor-pointer"
                    >
                      {suggestion}
                    </li>
                  ))}
                </ul>
              )}
              {errors.bloodTestName && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.bloodTestName.message}
                </p>
              )}
            </div>

            {/* Payment ID (Optional) */}
            <div className="relative">
              <AiOutlineDollarCircle className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                {...register("paymentId")}
                placeholder="Payment ID (Optional)"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  errors.paymentId ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
              />
              {errors.paymentId && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.paymentId.message}
                </p>
              )}
            </div>

            {/* Doctor Refer with Auto-Complete */}
            <div className="relative">
              <AiOutlineUser className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                value={doctorReferInput}
                onChange={(e) => {
                  handleDoctorReferInputChange(e.target.value);
                  setValue("doctor", "", { shouldValidate: true });
                }}
                placeholder="Doctor Refer"
                autoComplete="off"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  errors.doctor ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
              />
              {filteredDoctors.length > 0 && (
                <ul
                  ref={doctorSuggestionBoxRef}
                  className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg mt-1 max-h-60 overflow-y-auto shadow-lg"
                >
                  {filteredDoctors.map((suggestion) => (
                    <li
                      key={suggestion.value}
                      onClick={() =>
                        handleDoctorSuggestionClick(
                          suggestion.value,
                          suggestion.label
                        )
                      }
                      className="px-4 py-2 hover:bg-green-100 cursor-pointer"
                    >
                      {suggestion.label}
                    </li>
                  ))}
                </ul>
              )}
              {errors.doctor && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.doctor.message}
                </p>
              )}
            </div>

            {/* Amount */}
            <div className="relative">
              <AiOutlineDollarCircle className="absolute top-3 left-3 text-gray-400" />
              <input
                type="number"
                {...register("amount", { valueAsNumber: true })}
                placeholder="Amount (Rs)"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  errors.amount ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
                min="0"
              />
              {errors.amount && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.amount.message}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 ${
                loading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {loading ? "Adding..." : "Add Patient"}
            </button>
          </form>
        </div>
      </main>
    </>
  );
};

export default PathologyEntryPage;
