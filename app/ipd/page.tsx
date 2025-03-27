"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useForm, SubmitHandler, Controller } from "react-hook-form";
import { db } from "../../lib/firebase"; // Gautami DB
import { db as dbMedford } from "../../lib/firebaseMedford"; // Medford DB
import { ref, push, update, onValue, set } from "firebase/database";
import Head from "next/head";
import {
  FaUser,
  FaPhone,
  FaTransgender,
  FaCalendarAlt,
  FaClock,
  FaHome,
  FaUserFriends,
  FaStethoscope,
  FaCheckCircle,
  FaTimesCircle,
} from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import Select from "react-select";
import IPDSignaturePDF from "./ipdsignaturepdf"; // If you're using a PDF component

/* ---------------------------------------------------------------------
  1) Types & Interfaces
------------------------------------------------------------------------ */
export interface IPDFormInput {
  // Basic Patient
  name: string;
  phone: string;
  gender: { label: string; value: string } | null;
  age: number;
  address?: string;

  // Relative
  relativeName: string;
  relativePhone: string;
  relativeAddress?: string;

  // IPD
  date: Date;
  time: string;
  roomType: { label: string; value: string } | null;
  bed: { label: string; value: string } | null;
  doctor: { label: string; value: string } | null;
  referDoctor?: string;
  admissionType: { label: string; value: string } | null;
}

interface PatientRecord {
  id: string;
  name: string;
  phone: string;
  gender?: string;
  age?: number;
  address?: string;
  createdAt?: string;
}

interface MedfordPatient {
  patientId: string;
  name: string;
  contact: string;
  dob: string;
  gender: string;
  hospitalName: string;
}

interface CombinedPatient {
  id: string;
  name: string;
  phone?: string;
  source: "gautami" | "medford";
  data: PatientRecord | MedfordPatient;
}

interface PatientSuggestion {
  label: string;
  value: string;
  source: "gautami" | "medford";
}

/* ---------------------------------------------------------------------
  2) Constants & Utility Functions
------------------------------------------------------------------------ */
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
  hours = hours || 12; // hour '0' => '12'
  minutes = minutes < 10 ? "0" + minutes : minutes;
  return `${hours}:${minutes} ${ampm}`;
}

/** Generate a random 10-char alphanumeric ID */
function generatePatientId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/* ---------------------------------------------------------------------
  3) Main IPD Component
------------------------------------------------------------------------ */
const IPDBookingPage: React.FC = () => {
  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    watch,
    formState: { errors },
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

  // Loading / preview states
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<IPDFormInput | null>(null);

  // Auto-complete states
  const [patientNameInput, setPatientNameInput] = useState("");
  const [patientSuggestions, setPatientSuggestions] = useState<PatientSuggestion[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<CombinedPatient | null>(null);

  // Doctor & Bed data
  const [doctors, setDoctors] = useState<{ label: string; value: string }[]>([]);
  const [beds, setBeds] = useState<{ label: string; value: string }[]>([]);

  // Patient lists from both DBs
  const [gautamiPatients, setGautamiPatients] = useState<CombinedPatient[]>([]);
  const [medfordPatients, setMedfordPatients] = useState<CombinedPatient[]>([]);

  // Current selected room type from the form
  const selectedRoomType = watch("roomType");

  /* -----------------------------------------------------------------
     3A) Fetching data: Doctors, Patients, etc.
  ------------------------------------------------------------------ */
  // Doctors (IPD or both)
  useEffect(() => {
    const doctorsRef = ref(db, "doctors");
    const unsubscribe = onValue(doctorsRef, (snapshot) => {
      if (!snapshot.exists()) {
        setDoctors([]);
        return;
      }
      const data = snapshot.val();
      const docsList = Object.keys(data)
        .filter((key) => {
          const department = String(data[key].department || "").toLowerCase();
          return department === "ipd" || department === "both";
        })
        .map((key) => ({
          label: data[key].name,
          value: key,
        }));
      setDoctors(docsList);
    });
    return () => unsubscribe();
  }, []);

  // Gautami Patients
  useEffect(() => {
    const patientsRef = ref(db, "patients");
    const unsubscribe = onValue(patientsRef, (snapshot) => {
      if (!snapshot.exists()) {
        setGautamiPatients([]);
        return;
      }
      const data = snapshot.val();
      const loaded: CombinedPatient[] = [];
      for (const key in data) {
        loaded.push({
          id: key,
          name: data[key].name,
          phone: data[key].phone,
          source: "gautami",
          data: { ...data[key], id: key },
        });
      }
      setGautamiPatients(loaded);
    });
    return () => unsubscribe();
  }, []);

  // Medford Patients
  useEffect(() => {
    const medfordRef = ref(dbMedford, "patients");
    const unsubscribe = onValue(medfordRef, (snapshot) => {
      if (!snapshot.exists()) {
        setMedfordPatients([]);
        return;
      }
      const data = snapshot.val();
      const loaded: CombinedPatient[] = [];
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
      setMedfordPatients(loaded);
    });
    return () => unsubscribe();
  }, []);

  // Combine the two arrays (memoized to avoid a new array reference every render)
  const combinedPatients = useMemo(() => {
    return [...gautamiPatients, ...medfordPatients];
  }, [gautamiPatients, medfordPatients]);

  /* -----------------------------------------------------------------
     3B) Patient auto-suggest logic
  ------------------------------------------------------------------ */
  function filterPatientSuggestions(name: string) {
    if (name.length < 2) {
      if (patientSuggestions.length > 0) setPatientSuggestions([]);
      return;
    }
    const lower = name.toLowerCase();
    const matched = combinedPatients.filter((p) =>
      p.name.toLowerCase().includes(lower)
    );
    const suggestions: PatientSuggestion[] = matched.map((p) => ({
      label: `${p.name} - ${p.phone || ""}`,
      value: p.id,
      source: p.source,
    }));
    if (
      suggestions.length !== patientSuggestions.length ||
      suggestions.some((s, i) => s.value !== patientSuggestions[i]?.value)
    ) {
      setPatientSuggestions(suggestions);
    }
  }

  useEffect(() => {
    if (selectedPatient) {
      if (patientNameInput !== selectedPatient.name) {
        setSelectedPatient(null);
      }
      setPatientSuggestions([]);
      return;
    }
    filterPatientSuggestions(patientNameInput);
  }, [patientNameInput, combinedPatients, selectedPatient]);

  const handlePatientNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPatientNameInput(val);
    setValue("name", val);
  };

  const handleSelectPatient = (patientId: string) => {
    const found = combinedPatients.find((p) => p.id === patientId);
    if (!found) return;
    setSelectedPatient(found);
    setPatientNameInput(found.name);
    setValue("name", found.name);
    setValue("phone", found.phone || "");
    if (found.source === "gautami") {
      const rec = found.data as PatientRecord;
      setValue("age", rec.age || 0);
      setValue("address", rec.address || "");
      if (rec.gender) {
        const match = GenderOptions.find(
          (g) => g.value.toLowerCase() === rec.gender?.toLowerCase()
        );
        setValue("gender", match || null);
      }
    } else {
      const med = found.data as MedfordPatient;
      if (med.gender) {
        const match = GenderOptions.find(
          (g) => g.value.toLowerCase() === med.gender.toLowerCase()
        );
        setValue("gender", match || null);
      }
    }
    setPatientSuggestions([]);
    toast.info(`Patient ${found.name} selected from ${found.source.toUpperCase()}!`);
  };

  /* -----------------------------------------------------------------
     3C) Beds fetching logic depends on selectedRoomType
  ------------------------------------------------------------------ */
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
        .filter((k) => data[k].status === "Available")
        .map((k) => ({
          label: `Bed ${data[k].bedNumber}`,
          value: k,
        }));
      setBeds(bedList);
      if (bedList.length === 0) {
        setValue("bed", null);
      }
    });
    return () => unsubscribe();
  }, [selectedRoomType, setValue]);

  /* -----------------------------------------------------------------
     3D) Helper: WhatsApp message sender function
  ------------------------------------------------------------------ */
  const sendWhatsAppMessage = async (number: string, message: string) => {
    const payload = {
      token: "99583991572",
      number: `91${number}`,
      message,
    };
    try {
      const response = await fetch("https://wa.medblisss.com/send-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        console.error("Failed to send message", await response.text());
      }
    } catch (err) {
      console.error("Error sending message", err);
    }
  };

  /* -----------------------------------------------------------------
     3E) Submission Logic
  ------------------------------------------------------------------ */
  const onSubmit: SubmitHandler<IPDFormInput> = async (data) => {
    setLoading(true);
    try {
      // 1) Occupy the selected bed
      if (data.roomType?.value && data.bed?.value) {
        const bedRef = ref(db, `beds/${data.roomType.value}/${data.bed.value}`);
        await update(bedRef, { status: "Occupied" });
      }

      // 2) Prepare IPD data
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
        createdAt: new Date().toISOString(),
      };

      // 3) Create or update patient record
      let patientId: string;
      if (selectedPatient) {
        patientId = selectedPatient.id;
        await update(ref(db, `patients/${patientId}`), {
          name: data.name,
          phone: data.phone,
          gender: data.gender?.value || "",
          age: data.age,
          address: data.address || "",
        });
      } else {
        const newId = generatePatientId();
        await set(ref(db, `patients/${newId}`), {
          name: data.name,
          phone: data.phone,
          gender: data.gender?.value || "",
          age: data.age,
          address: data.address || "",
          createdAt: new Date().toISOString(),
          uhid: newId,
        });
        await set(ref(dbMedford, `patients/${newId}`), {
          name: data.name,
          contact: data.phone,
          gender: data.gender?.value || "",
          dob: "",
          patientId: newId,
          hospitalName: "MEDFORD",
        });
        patientId = newId;
      }

      // 4) Push IPD data under that patient in Gautami
      const newIpdRef = push(ref(db, `patients/${patientId}/ipd`));
      await update(newIpdRef, ipdData);

      // 5) Construct and send WhatsApp messages using the provided format
      const patientMessage = `MedZeal Official: Dear ${data.name}, your IPD admission appointment is confirmed. Your bed: ${data.bed?.label || "N/A"} in ${data.roomType?.label || "N/A"} has been allocated. Thank you for choosing our hospital.`;
      const relativeMessage = `MedZeal Official: Dear ${data.relativeName}, this is to inform you that the IPD admission for ${data.name} has been scheduled. The allocated bed is ${data.bed?.label || "N/A"} in ${data.roomType?.label || "N/A"}. Please contact us for further details.`;

      await sendWhatsAppMessage(data.phone, patientMessage);
      await sendWhatsAppMessage(data.relativePhone, relativeMessage);

      toast.success("IPD Admission created successfully!", {
        position: "top-right",
        autoClose: 5000,
      });

      // 6) Reset the form
      reset({
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
      });
      setPatientNameInput("");
      setSelectedPatient(null);
      setPreviewData(null);
    } catch (err) {
      console.error("Error in IPD booking:", err);
      toast.error("Error: Failed to book IPD admission.", {
        position: "top-right",
        autoClose: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  /* -----------------------------------------------------------------
     3F) Preview Handling
  ------------------------------------------------------------------ */
  const handlePreview = () => {
    setPreviewData(watch());
  };

  /* -----------------------------------------------------------------
     3G) The Render
  ------------------------------------------------------------------ */
  return (
    <>
      <Head>
        <title>IPD Admission</title>
        <meta name="description" content="IPD Admission form with auto-complete" />
      </Head>

      <ToastContainer />

      <main className="min-h-screen bg-gradient-to-r from-cyan-100 to-blue-200 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl bg-white rounded-3xl shadow-xl p-10">
          <h2 className="text-3xl font-bold text-center text-blue-700 mb-8">
            IPD Admission
          </h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* ============== Patient Name + Suggestions ============== */}
            <div className="relative">
              <FaUser className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                value={patientNameInput}
                onChange={handlePatientNameChange}
                placeholder="Patient Name"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.name ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
              />
              {errors.name && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.name.message}
                </p>
              )}

              {patientSuggestions.length > 0 && !selectedPatient && (
                <ul className="absolute z-10 bg-white border border-gray-300 w-full mt-1 max-h-40 overflow-auto rounded-lg shadow-lg">
                  {patientSuggestions.map((sug) => (
                    <li
                      key={sug.value}
                      onClick={() => handleSelectPatient(sug.value)}
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex justify-between items-center"
                    >
                      <span>{sug.label}</span>
                      {sug.source === "gautami" ? (
                        <FaCheckCircle color="green" />
                      ) : (
                        <FaTimesCircle color="red" />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ============== Phone ============== */}
            <div className="relative">
              <FaPhone className="absolute top-3 left-3 text-gray-400" />
              <input
                type="tel"
                {...register("phone", {
                  required: "Phone number is required",
                  pattern: {
                    value: /^[0-9]{10}$/,
                    message: "Must be a valid 10-digit phone number",
                  },
                })}
                placeholder="Patient Phone Number"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.phone ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
              />
              {errors.phone && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.phone.message}
                </p>
              )}
            </div>

            {/* ============== Gender ============== */}
            <div>
              <label className="block text-gray-700 mb-2">Gender</label>
              <Controller
                control={control}
                name="gender"
                rules={{ required: "Gender is required" }}
                render={({ field }) => (
                  <Select
                    {...field}
                    options={GenderOptions}
                    placeholder="Select Gender"
                    classNamePrefix="react-select"
                    onChange={(val) => field.onChange(val)}
                  />
                )}
              />
              {errors.gender && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.gender.message}
                </p>
              )}
            </div>

            {/* ============== Age & Address ============== */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="relative">
                <FaTransgender className="absolute top-3 left-3 text-gray-400" />
                <input
                  type="number"
                  {...register("age", {
                    required: "Age is required",
                    min: { value: 1, message: "Age must be positive" },
                  })}
                  placeholder="Age"
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.age ? "border-red-500" : "border-gray-300"
                  } transition duration-200`}
                />
                {errors.age && (
                  <p className="text-red-500 text-sm mt-1">{errors.age.message}</p>
                )}
              </div>
              <div className="relative">
                <FaHome className="absolute top-3 left-3 text-gray-400" />
                <input
                  type="text"
                  {...register("address")}
                  placeholder="Patient Address (Optional)"
                  className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300 transition duration-200"
                />
              </div>
            </div>

            {/* ============== Relative Name & Phone ============== */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="relative">
                <FaUserFriends className="absolute top-3 left-3 text-gray-400" />
                <input
                  type="text"
                  {...register("relativeName", {
                    required: "Relative name is required",
                  })}
                  placeholder="Relative Name"
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.relativeName ? "border-red-500" : "border-gray-300"
                  } transition duration-200`}
                />
                {errors.relativeName && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.relativeName.message}
                  </p>
                )}
              </div>
              <div className="relative">
                <FaPhone className="absolute top-3 left-3 text-gray-400" />
                <input
                  type="tel"
                  {...register("relativePhone", {
                    required: "Relative phone is required",
                    pattern: {
                      value: /^[0-9]{10}$/,
                      message: "Must be a valid 10-digit phone number",
                    },
                  })}
                  placeholder="Relative Phone Number"
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.relativePhone ? "border-red-500" : "border-gray-300"
                  } transition duration-200`}
                />
                {errors.relativePhone && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.relativePhone.message}
                  </p>
                )}
              </div>
            </div>

            {/* ============== Relative Address (Optional) ============== */}
            <div className="relative">
              <FaHome className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                {...register("relativeAddress")}
                placeholder="Relative Address (Optional)"
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300 transition duration-200"
              />
            </div>

            {/* ============== Date & Time ============== */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="relative">
                <FaCalendarAlt className="absolute top-3 left-3 text-gray-400" />
                <Controller
                  control={control}
                  name="date"
                  rules={{ required: "Date is required" }}
                  render={({ field }) => (
                    <DatePicker
                      selected={field.value}
                      onChange={(dt) => dt && field.onChange(dt)}
                      dateFormat="dd/MM/yyyy"
                      placeholderText="Select Date"
                      className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.date ? "border-red-500" : "border-gray-300"
                      } transition duration-200`}
                    />
                  )}
                />
                {errors.date && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.date.message}
                  </p>
                )}
              </div>
              <div className="relative">
                <FaClock className="absolute top-3 left-3 text-gray-400" />
                <input
                  type="text"
                  {...register("time", { required: "Time is required" })}
                  placeholder="Time"
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.time ? "border-red-500" : "border-gray-300"
                  } transition duration-200`}
                  defaultValue={formatAMPM(new Date())}
                />
                {errors.time && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.time.message}
                  </p>
                )}
              </div>
            </div>

            {/* ============== Room Type & Bed ============== */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-gray-700 mb-2">Room Type</label>
                <Controller
                  control={control}
                  name="roomType"
                  rules={{ required: "Room Type is required" }}
                  render={({ field }) => (
                    <Select
                      {...field}
                      options={RoomTypeOptions}
                      placeholder="Select Room Type"
                      classNamePrefix="react-select"
                      onChange={(val) => field.onChange(val)}
                    />
                  )}
                />
                {errors.roomType && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.roomType.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-gray-700 mb-2">Bed</label>
                <Controller
                  control={control}
                  name="bed"
                  rules={{ required: "Bed selection is required" }}
                  render={({ field }) => (
                    <Select
                      {...field}
                      options={beds}
                      placeholder={
                        beds.length > 0 ? "Select Bed" : "No Beds Available"
                      }
                      classNamePrefix="react-select"
                      onChange={(val) => field.onChange(val)}
                      isDisabled={!selectedRoomType || beds.length === 0}
                    />
                  )}
                />
                {errors.bed && (
                  <p className="text-red-500 text-sm mt-1">{errors.bed.message}</p>
                )}
              </div>
            </div>

            {/* ============== Doctor & Referral Doctor ============== */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-gray-700 mb-2">
                  Under Care of Doctor
                </label>
                <Controller
                  control={control}
                  name="doctor"
                  rules={{ required: "Doctor selection is required" }}
                  render={({ field }) => (
                    <Select
                      {...field}
                      options={doctors}
                      placeholder="Select Doctor"
                      classNamePrefix="react-select"
                      onChange={(val) => field.onChange(val)}
                    />
                  )}
                />
                {errors.doctor && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.doctor.message}
                  </p>
                )}
              </div>
              <div className="relative">
                <FaStethoscope className="absolute top-3 left-3 text-gray-400" />
                <input
                  type="text"
                  {...register("referDoctor")}
                  placeholder="Referral Doctor (Optional)"
                  className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300 transition duration-200"
                />
              </div>
            </div>

            {/* ============== Admission Type ============== */}
            <div>
              <label className="block text-gray-700 mb-2">Admission Type</label>
              <Controller
                control={control}
                name="admissionType"
                rules={{ required: "Admission Type is required" }}
                render={({ field }) => (
                  <Select
                    {...field}
                    options={AdmissionTypeOptions}
                    placeholder="Select Admission Type"
                    classNamePrefix="react-select"
                    onChange={(val) => field.onChange(val)}
                  />
                )}
              />
              {errors.admissionType && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.admissionType.message}
                </p>
              )}
            </div>

            {/* ============== Preview & Submit ============== */}
            <button
              type="button"
              onClick={handlePreview}
              className="w-full py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Preview
            </button>

            {previewData && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-3xl overflow-auto max-h-screen">
                  <h3 className="text-2xl font-semibold mb-4">
                    Preview IPD Admission
                  </h3>
                  <div className="space-y-2">
                    <p>
                      <strong>Patient Name:</strong> {previewData.name}
                    </p>
                    <p>
                      <strong>Phone:</strong> {previewData.phone}
                    </p>
                    <p>
                      <strong>Gender:</strong> {previewData.gender?.label}
                    </p>
                    <p>
                      <strong>Age:</strong> {previewData.age}
                    </p>
                    {previewData.address && (
                      <p>
                        <strong>Address:</strong> {previewData.address}
                      </p>
                    )}
                    <p>
                      <strong>Relative Name:</strong> {previewData.relativeName}
                    </p>
                    <p>
                      <strong>Relative Phone:</strong> {previewData.relativePhone}
                    </p>
                    {previewData.relativeAddress && (
                      <p>
                        <strong>Relative Address:</strong> {previewData.relativeAddress}
                      </p>
                    )}
                    <p>
                      <strong>Admission Date:</strong> {previewData.date.toLocaleDateString()}
                    </p>
                    <p>
                      <strong>Admission Time:</strong> {previewData.time}
                    </p>
                    {previewData.roomType && (
                      <p>
                        <strong>Room Type:</strong> {previewData.roomType.label}
                      </p>
                    )}
                    {previewData.bed && (
                      <p>
                        <strong>Bed:</strong> {previewData.bed.label}
                      </p>
                    )}
                    {previewData.doctor && (
                      <p>
                        <strong>Under Care of Doctor:</strong> {previewData.doctor.label}
                      </p>
                    )}
                    {previewData.referDoctor && (
                      <p>
                        <strong>Referral Doctor:</strong> {previewData.referDoctor}
                      </p>
                    )}
                    {previewData.admissionType && (
                      <p>
                        <strong>Admission Type:</strong> {previewData.admissionType.label}
                      </p>
                    )}
                  </div>
                  <div className="mt-6 flex flex-wrap gap-4 justify-end">
                    <button
                      type="button"
                      onClick={() => setPreviewData(null)}
                      className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition duration-200"
                    >
                      Cancel
                    </button>
                    {previewData && <IPDSignaturePDF data={previewData} />}
                    <button
                      type="submit"
                      className={`px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200 ${
                        loading ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                      disabled={loading}
                    >
                      {loading ? "Submitting..." : "Confirm & Submit"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                loading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {loading ? "Submitting..." : "Submit Admission"}
            </button>
          </form>
        </div>
      </main>
    </>
  );
};

export default IPDBookingPage;
