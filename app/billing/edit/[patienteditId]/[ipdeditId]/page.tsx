"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { ref, onValue, update } from "firebase/database";
import { db } from "@/lib/firebase";
import Select from "react-select";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { toast } from "react-toastify";
import { FaUser, FaPhone, FaCalendarAlt, FaClock, FaHome, FaUserFriends, FaStethoscope, FaInfoCircle } from "react-icons/fa";

/* ---------------------------
   Types & Options
--------------------------- */
export interface IPDFormInput {
  name: string;
  phone: string;
  gender: { label: string; value: string } | null;
  age: number;
  address?: string;
  relativeName: string;
  relativePhone: string;
  relativeAddress?: string;
  date: Date;
  time: string;
  roomType: { label: string; value: string } | null;
  bed: { label: string; value: string } | null;
  doctor: { label: string; value: string } | null;
  referDoctor?: string;
  admissionType: { label: string; value: string } | null;
}

const GenderOptions = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

const AdmissionTypeOptions = [
  { value: "general", label: "General" },
  { value: "surgery", label: "Surgery" },
  { value: "accident_emergency", label: "Accident/Emergency" },
  { value: "day_observation", label: "Day Observation" },
];

const RoomTypeOptions = [
  { value: "female_ward", label: "Female Ward" },
  { value: "icu", label: "ICU" },
  { value: "male_ward", label: "Male Ward" },
  { value: "deluxe", label: "Deluxe" },
  { value: "nicu", label: "NICU" },
];

function formatAMPM(date: Date): string {
  let hours = date.getHours();
  let minutes: string | number = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours || 12;
  minutes = minutes < 10 ? "0" + minutes : minutes;
  return `${hours}:${minutes} ${ampm}`;
}

/* ---------------------------
   Edit IPD Record Component
--------------------------- */
export default function EditIPDPage() {
  const { patienteditId, ipdeditId } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [doctors, setDoctors] = useState<{ label: string; value: string }[]>([]);
  const [beds, setBeds] = useState<{ label: string; value: string }[]>([]);
  const [showBedsPopup, setShowBedsPopup] = useState(false);
  const [allBeds, setAllBeds] = useState<any[]>([]);
  // Save the originally selected bed so we can update its status if needed.
  const [oldBedInfo, setOldBedInfo] = useState<{ roomType: string; bedId: string } | null>(null);

  const {
    control,
    register,
    handleSubmit,
    setValue,
    watch,
  } = useForm<IPDFormInput>({
    defaultValues: {
      name: "",
      phone: "",
      gender: null,
      age: 0,
      address: "",
      relativeName: "",
      relativePhone: "",
      relativeAddress: "",
      date: new Date(),
      time: formatAMPM(new Date()),
      roomType: null,
      bed: null,
      doctor: null,
      referDoctor: "",
      admissionType: null,
    },
  });

  /* ---------------------------
     Fetch Doctors
  --------------------------- */
  useEffect(() => {
    const doctorsRef = ref(db, "doctors");
    const unsubscribe = onValue(doctorsRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.val();
      const docsList = Object.keys(data)
        .filter((key) => {
          const dept = String(data[key].department || "").toLowerCase();
          return dept === "ipd" || dept === "both";
        })
        .map((key) => ({ label: data[key].name, value: key }));
      setDoctors(docsList);
    });
    return () => unsubscribe();
  }, []);

  /* ---------------------------
     Fetch Existing IPD Record Data
  --------------------------- */
  useEffect(() => {
    if (!patienteditId || !ipdeditId) return;
    const ipdRef = ref(db, `patients/${patienteditId}/ipd/${ipdeditId}`);
    const unsubscribe = onValue(ipdRef, (snapshot) => {
      if (!snapshot.exists()) {
        toast.error("IPD record not found.");
        return;
      }
      const data = snapshot.val();
      setValue("name", data.name);
      setValue("phone", data.phone);
      const genderMatch = GenderOptions.find(
        (g) => g.value.toLowerCase() === (data.gender || "").toLowerCase()
      );
      setValue("gender", genderMatch || null);
      setValue("age", data.age);
      setValue("address", data.address);
      setValue("relativeName", data.relativeName);
      setValue("relativePhone", data.relativePhone);
      setValue("relativeAddress", data.relativeAddress);
      setValue("date", new Date(data.date));
      setValue("time", data.time);
      const roomTypeMatch = RoomTypeOptions.find(
        (r) => r.value === data.roomType
      );
      setValue("roomType", roomTypeMatch || null);
      setOldBedInfo(data.bed ? { roomType: data.roomType, bedId: data.bed } : null);
      if (data.bed) {
        setValue("bed", { label: `Bed ${data.bed}`, value: data.bed });
      }
      const doctorMatch = doctors.find((d) => d.value === data.doctor);
      setValue("doctor", doctorMatch || null);
      setValue("referDoctor", data.referDoctor);
      const admissionTypeMatch = AdmissionTypeOptions.find(
        (a) => a.value === data.admissionType
      );
      setValue("admissionType", admissionTypeMatch || null);
    });
    return () => unsubscribe();
  }, [patienteditId, ipdeditId, setValue, doctors]);

  /* ---------------------------
     Fetch Beds Based on Selected Room Type
  --------------------------- */
  const selectedRoomType = watch("roomType");
  useEffect(() => {
    if (!selectedRoomType?.value) {
      setBeds([]);
      setValue("bed", null);
      return;
    }
    const bedsRef = ref(db, `beds/${selectedRoomType.value}`);
    const unsubscribe = onValue(bedsRef, (snapshot) => {
      if (!snapshot.exists()) {
        setBeds([]);
        setValue("bed", null);
        return;
      }
      const data = snapshot.val();
      const bedList = Object.keys(data)
        // Allow available beds or the one already assigned.
        .filter(
          (k) =>
            data[k].status === "Available" ||
            (oldBedInfo && k === oldBedInfo.bedId)
        )
        .map((k) => ({
          label: `Bed ${data[k].bedNumber}`,
          value: k,
        }));
      setBeds(bedList);
      const currentBed = watch("bed");
      if (currentBed && !bedList.find((b) => b.value === currentBed.value)) {
        setValue("bed", null);
      }
    });
    return () => unsubscribe();
  }, [selectedRoomType, setValue, oldBedInfo, watch]);

  /* ---------------------------
     Beds Popup – List all beds in the selected room type
  --------------------------- */
  useEffect(() => {
    if (!selectedRoomType?.value) return;
    const bedsRef = ref(db, `beds/${selectedRoomType.value}`);
    const unsubscribe = onValue(bedsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const list = Object.keys(data).map((k) => ({
          id: k,
          bedNumber: data[k].bedNumber,
          status: data[k].status,
        }));
        setAllBeds(list);
      } else {
        setAllBeds([]);
      }
    });
    return () => unsubscribe();
  }, [selectedRoomType]);

  const toggleBedsPopup = () => {
    setShowBedsPopup(!showBedsPopup);
  };

  /* ---------------------------
     Form Submission
  --------------------------- */
  const onSubmit = async (data: IPDFormInput) => {
    setLoading(true);
    try {
      // If the bed has changed, update the status of the old bed to “Available” and the new one to “Occupied.”
      if (
        oldBedInfo &&
        data.roomType?.value &&
        data.bed?.value &&
        data.bed.value !== oldBedInfo.bedId
      ) {
        const oldBedRef = ref(db, `beds/${oldBedInfo.roomType}/${oldBedInfo.bedId}`);
        await update(oldBedRef, { status: "Available" });
        const newBedRef = ref(db, `beds/${data.roomType.value}/${data.bed.value}`);
        await update(newBedRef, { status: "Occupied" });
      } else if (!oldBedInfo && data.roomType?.value && data.bed?.value) {
        const newBedRef = ref(db, `beds/${data.roomType.value}/${data.bed.value}`);
        await update(newBedRef, { status: "Occupied" });
      }

      // Update the IPD record.
      const ipdRef = ref(db, `patients/${patienteditId}/ipd/${ipdeditId}`);
      const ipdData = {
        name: data.name,
        phone: data.phone,
        gender: data.gender?.value || "",
        age: data.age,
        address: data.address || "",
        relativeName: data.relativeName,
        relativePhone: data.relativePhone,
        relativeAddress: data.relativeAddress || "",
        date: data.date.toISOString(),
        time: data.time,
        roomType: data.roomType?.value || "",
        bed: data.bed?.value || "",
        doctor: data.doctor?.value || "",
        referDoctor: data.referDoctor || "",
        admissionType: data.admissionType?.value || "",
        updatedAt: new Date().toISOString(),
      };
      await update(ipdRef, ipdData);
      toast.success("IPD record updated successfully!");
      router.push("/billing");
    } catch (err) {
      console.error("Error updating record:", err);
      toast.error("Error updating IPD record.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto bg-white shadow-lg rounded-lg p-8">
        <h1 className="text-3xl font-bold text-indigo-800 mb-6 flex items-center gap-2">
          <FaInfoCircle className="text-indigo-600" />
          Edit IPD Record
        </h1>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Patient Basic Details */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Patient Name</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center">
                <FaUser className="text-gray-400" />
              </span>
              <input type="text" {...register("name")} className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center">
                  <FaPhone className="text-gray-400" />
                </span>
                <input type="text" {...register("phone")} className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Age</label>
              <input type="number" {...register("age")} className="block w-full pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
            <Controller
              control={control}
              name="gender"
              render={({ field }) => (
                <Select 
                  {...field} 
                  options={GenderOptions} 
                  placeholder="Select Gender" 
                  classNamePrefix="react-select" 
                  styles={{
                    control: (provided) => ({ ...provided, borderColor: "#D1D5DB" }),
                  }}
                  onChange={(val) => field.onChange(val)}
                />
              )}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center">
                <FaHome className="text-gray-400" />
              </span>
              <input type="text" {...register("address")} className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
          </div>
          {/* Relative Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Relative Name</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center">
                  <FaUserFriends className="text-gray-400" />
                </span>
                <input type="text" {...register("relativeName")} className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Relative Phone</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center">
                  <FaPhone className="text-gray-400" />
                </span>
                <input type="text" {...register("relativePhone")} className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Relative Address</label>
            <input type="text" {...register("relativeAddress")} className="block w-full pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
          </div>
          {/* Date & Time */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admission Date</label>
              <Controller
                control={control}
                name="date"
                render={({ field }) => (
                  <DatePicker
                    selected={field.value}
                    onChange={(dt) => dt && field.onChange(dt)}
                    dateFormat="dd/MM/yyyy"
                    className="block w-full pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  />
                )}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admission Time</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center">
                  <FaClock className="text-gray-400" />
                </span>
                <input type="text" {...register("time")} className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
            </div>
          </div>
          {/* Room Type & Bed */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Room Type</label>
              <Controller
                control={control}
                name="roomType"
                render={({ field }) => (
                  <Select
                    {...field}
                    options={RoomTypeOptions}
                    placeholder="Select Room Type"
                    classNamePrefix="react-select"
                    styles={{
                      control: (provided) => ({ ...provided, borderColor: "#D1D5DB" }),
                    }}
                    onChange={(val) => {
                      field.onChange(val);
                      setValue("bed", null);
                    }}
                  />
                )}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bed</label>
              <Controller
                control={control}
                name="bed"
                render={({ field }) => (
                  <Select 
                    {...field}
                    options={beds}
                    placeholder={beds.length ? "Select Bed" : "No Beds Available"}
                    classNamePrefix="react-select"
                    styles={{
                      control: (provided) => ({ ...provided, borderColor: "#D1D5DB" }),
                    }}
                    onChange={(val) => field.onChange(val)}
                    isDisabled={!selectedRoomType}
                  />
                )}
              />
              <button type="button" onClick={toggleBedsPopup} className="mt-2 text-sm text-blue-600 hover:underline flex items-center gap-1">
                <FaInfoCircle /> View Beds
              </button>
            </div>
          </div>
          {/* Doctor & Referral */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Under Care of Doctor</label>
              <Controller
                control={control}
                name="doctor"
                render={({ field }) => (
                  <Select
                    {...field}
                    options={doctors}
                    placeholder="Select Doctor"
                    classNamePrefix="react-select"
                    styles={{
                      control: (provided) => ({ ...provided, borderColor: "#D1D5DB" }),
                    }}
                    onChange={(val) => field.onChange(val)}
                  />
                )}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Referral Doctor</label>
              <input type="text" {...register("referDoctor")} className="block w-full pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
          </div>
          {/* Admission Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Admission Type</label>
            <Controller
              control={control}
              name="admissionType"
              render={({ field }) => (
                <Select
                  {...field}
                  options={AdmissionTypeOptions}
                  placeholder="Select Admission Type"
                  classNamePrefix="react-select"
                  styles={{
                    control: (provided) => ({ ...provided, borderColor: "#D1D5DB" }),
                  }}
                  onChange={(val) => field.onChange(val)}
                />
              )}
            />
          </div>
          <button type="submit" disabled={loading} className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-md shadow hover:bg-indigo-700 transition-colors">
            {loading ? "Updating..." : "Update Record"}
          </button>
        </form>
      </div>

      {/* Beds Popup */}
      {showBedsPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
            <h2 className="text-xl font-bold text-indigo-800 mb-4">
              Beds in {selectedRoomType?.label}
            </h2>
            <table className="min-w-full">
              <thead>
                <tr className="bg-indigo-100">
                  <th className="px-3 py-2 text-left text-sm font-medium">Bed Number</th>
                  <th className="px-3 py-2 text-left text-sm font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {allBeds.map((bed) => (
                  <tr key={bed.id} className="border-b">
                    <td className="px-3 py-2 text-sm">Bed {bed.bedNumber}</td>
                    <td className="px-3 py-2 text-sm">{bed.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={toggleBedsPopup} className="mt-4 w-full py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
