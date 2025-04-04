"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useForm, SubmitHandler, Controller } from "react-hook-form";
import { db } from "../../lib/firebase"; // Gautami DB
import { db as dbMedford } from "../../lib/firebaseMedford"; // Medford DB
import { ref, push, update, onValue, set } from "firebase/database";
import Head from "next/head";

// UPDATED IMPORTS:
import { User, Phone, UserRound, Calendar, Clock, Home, Users, Stethoscope, CheckCircle, XCircle, Eye, Bed, ChevronRight, AlertCircle, Send, FileText, ArrowLeft } from 'lucide-react';

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
  source: "gautami" | "other";
  data: PatientRecord | MedfordPatient;
}

interface PatientSuggestion {
  label: string;
  value: string;
  source: "gautami" | "other";
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

  // Auto-complete states for name
  const [patientNameInput, setPatientNameInput] = useState("");
  const [patientSuggestions, setPatientSuggestions] = useState<PatientSuggestion[]>([]);
  // Auto-complete states for phone
  const [patientPhoneInput, setPatientPhoneInput] = useState("");
  const [phoneSuggestions, setPhoneSuggestions] = useState<PatientSuggestion[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<CombinedPatient | null>(null);

  // Doctor & Bed data
  const [doctors, setDoctors] = useState<{ label: string; value: string }[]>([]);
  const [beds, setBeds] = useState<{ label: string; value: string }[]>([]);

  // Patient lists from both DBs
  const [gautamiPatients, setGautamiPatients] = useState<CombinedPatient[]>([]);
  const [medfordPatients, setMedfordPatients] = useState<CombinedPatient[]>([]);

  // Watch the currently selected room type (used below)
  const selectedRoomType = watch("roomType");

  // NEW: All bed data for the "View Bed Availability" popup
  const [allBedData, setAllBedData] = useState<any>({});
  const [showBedPopup, setShowBedPopup] = useState(false);
  
  // Form step state for multi-step form
  const [formStep, setFormStep] = useState(0);

  /* -----------------------------------------------------------------
     3A) Fetching data: Doctors, Patients, All Beds
  ------------------------------------------------------------------ */
  // Doctors
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
          source: "other",
          data: rec,
        });
      }
      setMedfordPatients(loaded);
    });
    return () => unsubscribe();
  }, []);

  // Combine the two arrays (memoized to avoid unnecessary re-renders)
  const combinedPatients = useMemo(() => {
    return [...gautamiPatients, ...medfordPatients];
  }, [gautamiPatients, medfordPatients]);

  // NEW: Fetch all bed data once for the "View Bed Availability" popup
  useEffect(() => {
    const allBedsRef = ref(db, "beds");
    const unsub = onValue(allBedsRef, (snapshot) => {
      if (snapshot.exists()) {
        setAllBedData(snapshot.val());
      } else {
        setAllBedData({});
      }
    });
    return () => unsub();
  }, []);

  /* -----------------------------------------------------------------
     3B) Patient auto-suggest logic for Name
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

  /* -----------------------------------------------------------------
     3B2) Patient auto-suggest logic for Phone
  ------------------------------------------------------------------ */
  function filterPatientSuggestionsByPhone(phone: string) {
    if (phone.length < 2) {
      if (phoneSuggestions.length > 0) setPhoneSuggestions([]);
      return;
    }
    const matched = combinedPatients.filter((p) =>
      p.phone && p.phone.includes(phone)
    );
    const suggestions: PatientSuggestion[] = matched.map((p) => ({
      label: `${p.name} - ${p.phone || ""}`,
      value: p.id,
      source: p.source,
    }));
    if (
      suggestions.length !== phoneSuggestions.length ||
      suggestions.some((s, i) => s.value !== phoneSuggestions[i]?.value)
    ) {
      setPhoneSuggestions(suggestions);
    }
  }

  useEffect(() => {
    if (selectedPatient) {
      if (patientPhoneInput !== selectedPatient.phone) {
        setSelectedPatient(null);
      }
      setPhoneSuggestions([]);
      return;
    }
    filterPatientSuggestionsByPhone(patientPhoneInput);
  }, [patientPhoneInput, combinedPatients, selectedPatient]);

  const handlePatientPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPatientPhoneInput(val);
    setValue("phone", val);
  };

  const handleSelectPatient = (patientId: string) => {
    const found = combinedPatients.find((p) => p.id === patientId);
    if (!found) return;
    setSelectedPatient(found);
    setPatientNameInput(found.name);
    setPatientPhoneInput(found.phone || "");
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
    setPhoneSuggestions([]);
    toast.info(`Patient ${found.name} selected from ${found.source.toUpperCase()}!`);
  };

  /* -----------------------------------------------------------------
     3C) Beds fetching logic if user selects a Room Type normally
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
      token: "99583991572", // example token
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
        // If the user chose an existing patient
        patientId = selectedPatient.id;
        await update(ref(db, `patients/${patientId}`), {
          name: data.name,
          phone: data.phone,
          gender: data.gender?.value || "",
          age: data.age,
          address: data.address || "",
        });
      } else {
        // If the user is creating a brand-new patient
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
        // Also add to Medford DB
        await set(ref(dbMedford, `patients/${newId}`), {
          name: data.name,
          contact: data.phone,
          gender: data.gender?.value || "",
          dob: "",
          patientId: newId,
          hospitalName: "other",
        });
        patientId = newId;
      }

      // 4) Push IPD data under that patient in Gautami
      const newIpdRef = push(ref(db, `patients/${patientId}/ipd`));
      await update(newIpdRef, ipdData);

      // 5) Construct and send WhatsApp messages
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
      setPatientPhoneInput("");
      setSelectedPatient(null);
      setPreviewData(null);
      setFormStep(0);
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

  // Custom styles for react-select
  const customSelectStyles = {
    control: (provided: any) => ({
      ...provided,
      borderRadius: '0.5rem',
      borderColor: '#e2e8f0',
      minHeight: '48px',
      boxShadow: 'none',
      '&:hover': {
        borderColor: '#3b82f6',
      },
    }),
    option: (provided: any, state: any) => ({
      ...provided,
      backgroundColor: state.isSelected ? '#3b82f6' : state.isFocused ? '#e2e8f0' : 'white',
      color: state.isSelected ? 'white' : '#1e293b',
      cursor: 'pointer',
      padding: '10px 12px',
    }),
    placeholder: (provided: any) => ({
      ...provided,
      color: '#94a3b8',
    }),
  };

  // Custom styles for DatePicker
  const datePickerWrapperClass = `
    w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 
    ${errors.date ? "border-red-500" : "border-gray-300"} transition duration-200
  `;

  /* -----------------------------------------------------------------
     3G) Render
  ------------------------------------------------------------------ */
  return (
    <>
      <Head>
        <title>IPD Admission</title>
        <meta name="description" content="IPD Admission form with auto-complete" />
      </Head>

      <ToastContainer />

      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4 md:p-6">
        <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl md:text-3xl font-bold">IPD Admission</h2>
              <div className="flex items-center space-x-2">
                <span className="text-xs md:text-sm bg-white/20 py-1 px-3 rounded-full">
                  {formStep === 0 ? "Patient Details" : formStep === 1 ? "Relative Details" : "Admission Details"}
                </span>
              </div>
            </div>
            <div className="mt-4 flex justify-between">
              <div className="flex space-x-1">
                <div className={`h-1 w-10 rounded-full ${formStep >= 0 ? "bg-white" : "bg-white/30"}`}></div>
                <div className={`h-1 w-10 rounded-full ${formStep >= 1 ? "bg-white" : "bg-white/30"}`}></div>
                <div className={`h-1 w-10 rounded-full ${formStep >= 2 ? "bg-white" : "bg-white/30"}`}></div>
              </div>
              <div className="text-sm text-white/80">Step {formStep + 1} of 3</div>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="p-6">
            {/* Step 1: Patient Details */}
            {formStep === 0 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Patient Name + Suggestions */}
                  <div className="relative col-span-full">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Patient Name</label>
                    <div className="relative">
                      <User className="absolute top-3 left-3 text-gray-400 h-5 w-5" />
                      <input
                        type="text"
                        value={patientNameInput}
                        onChange={handlePatientNameChange}
                        placeholder="Enter patient's full name"
                        className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          errors.name ? "border-red-500" : "border-gray-300"
                        } transition duration-200`}
                      />
                      {patientNameInput.length > 0 && (
                        <button 
                          type="button"
                          onClick={() => {
                            setPatientNameInput("");
                            setValue("name", "");
                          }}
                          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
                        >
                          <XCircle className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                    {errors.name && (
                      <p className="text-red-500 text-sm mt-1 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.name.message}
                      </p>
                    )}

                    {patientSuggestions.length > 0 && !selectedPatient && (
                      <ul className="absolute z-10 bg-white border border-gray-300 w-full mt-1 max-h-40 overflow-auto rounded-lg shadow-lg">
                        {patientSuggestions.map((sug) => (
                          <li
                            key={sug.value}
                            onClick={() => handleSelectPatient(sug.value)}
                            className="px-4 py-3 hover:bg-blue-50 cursor-pointer flex justify-between items-center border-b border-gray-100 last:border-b-0"
                          >
                            <div className="flex items-center">
                              <UserRound className="h-5 w-5 mr-2 text-gray-400" />
                              <span>{sug.label}</span>
                            </div>
                            <div className="flex items-center">
                              <span className={`text-xs px-2 py-1 rounded-full ${sug.source === "gautami" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}>
                                {sug.source === "gautami" ? "Gautami" : "other"}
                              </span>
                              <ChevronRight className="h-4 w-4 ml-2 text-gray-400" />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Phone with Auto-Complete */}
                  <div className="relative col-span-full">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute top-3 left-3 text-gray-400 h-5 w-5" />
                      <input
                        type="tel"
                        value={patientPhoneInput}
                        onChange={handlePatientPhoneChange}
                        placeholder="10-digit mobile number"
                        className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          errors.phone ? "border-red-500" : "border-gray-300"
                        } transition duration-200`}
                      />
                      {patientPhoneInput.length > 0 && (
                        <button 
                          type="button"
                          onClick={() => {
                            setPatientPhoneInput("");
                            setValue("phone", "");
                          }}
                          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
                        >
                          <XCircle className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                    {errors.phone && (
                      <p className="text-red-500 text-sm mt-1 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.phone.message}
                      </p>
                    )}
                    {phoneSuggestions.length > 0 && !selectedPatient && (
                      <ul className="absolute z-10 bg-white border border-gray-300 w-full mt-1 max-h-40 overflow-auto rounded-lg shadow-lg">
                        {phoneSuggestions.map((sug) => (
                          <li
                            key={sug.value}
                            onClick={() => handleSelectPatient(sug.value)}
                            className="px-4 py-3 hover:bg-blue-50 cursor-pointer flex justify-between items-center border-b border-gray-100 last:border-b-0"
                          >
                            <div className="flex items-center">
                              <UserRound className="h-5 w-5 mr-2 text-gray-400" />
                              <span>{sug.label}</span>
                            </div>
                            <div className="flex items-center">
                              <span className={`text-xs px-2 py-1 rounded-full ${sug.source === "gautami" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}>
                                {sug.source === "gautami" ? "Gautami" : "other"}
                              </span>
                              <ChevronRight className="h-4 w-4 ml-2 text-gray-400" />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Gender */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                    <Controller
                      control={control}
                      name="gender"
                      rules={{ required: "Gender is required" }}
                      render={({ field }) => (
                        <Select
                          {...field}
                          options={GenderOptions}
                          placeholder="Select Gender"
                          styles={customSelectStyles}
                          onChange={(val) => field.onChange(val)}
                        />
                      )}
                    />
                    {errors.gender && (
                      <p className="text-red-500 text-sm mt-1 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.gender.message}
                      </p>
                    )}
                  </div>

                  {/* Age */}
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Age</label>
                    <div className="relative">
                      <UserRound className="absolute top-3 left-3 text-gray-400 h-5 w-5" />
                      <input
                        type="number"
                        {...register("age", {
                          required: "Age is required",
                          min: { value: 1, message: "Age must be positive" },
                        })}
                        placeholder="Patient's age"
                        className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          errors.age ? "border-red-500" : "border-gray-300"
                        } transition duration-200`}
                      />
                    </div>
                    {errors.age && (
                      <p className="text-red-500 text-sm mt-1 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.age.message}
                      </p>
                    )}
                  </div>

                  {/* Address */}
                  <div className="relative col-span-full">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address (Optional)</label>
                    <div className="relative">
                      <Home className="absolute top-3 left-3 text-gray-400 h-5 w-5" />
                      <input
                        type="text"
                        {...register("address")}
                        placeholder="Patient's residential address"
                        className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300 transition duration-200"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setFormStep(1)}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center"
                  >
                    Next: Relative Details
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Relative Details */}
            {formStep === 1 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Relative Name */}
                  <div className="relative col-span-full">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Relative Name</label>
                    <div className="relative">
                      <Users className="absolute top-3 left-3 text-gray-400 h-5 w-5" />
                      <input
                        type="text"
                        {...register("relativeName", {
                          required: "Relative name is required",
                        })}
                        placeholder="Enter relative's full name"
                        className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          errors.relativeName ? "border-red-500" : "border-gray-300"
                        } transition duration-200`}
                      />
                    </div>
                    {errors.relativeName && (
                      <p className="text-red-500 text-sm mt-1 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.relativeName.message}
                      </p>
                    )}
                  </div>

                  {/* Relative Phone */}
                  <div className="relative col-span-full">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Relative Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute top-3 left-3 text-gray-400 h-5 w-5" />
                      <input
                        type="tel"
                        {...register("relativePhone", {
                          required: "Relative phone is required",
                          pattern: {
                            value: /^[0-9]{10}$/,
                            message: "Must be a valid 10-digit phone number",
                          },
                        })}
                        placeholder="10-digit mobile number"
                        className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          errors.relativePhone ? "border-red-500" : "border-gray-300"
                        } transition duration-200`}
                      />
                    </div>
                    {errors.relativePhone && (
                      <p className="text-red-500 text-sm mt-1 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.relativePhone.message}
                      </p>
                    )}
                  </div>

                  {/* Relative Address */}
                  <div className="relative col-span-full">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Relative Address (Optional)</label>
                    <div className="relative">
                      <Home className="absolute top-3 left-3 text-gray-400 h-5 w-5" />
                      <input
                        type="text"
                        {...register("relativeAddress")}
                        placeholder="Relative's residential address"
                        className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300 transition duration-200"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex justify-between">
                  <button
                    type="button"
                    onClick={() => setFormStep(0)}
                    className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 flex items-center"
                  >
                    <ArrowLeft className="mr-2 h-5 w-5" />
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormStep(2)}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center"
                  >
                    Next: Admission Details
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Admission Details */}
            {formStep === 2 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Date & Time */}
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Admission Date</label>
                    <div className="relative">
                      <Calendar className="absolute top-3 left-3 text-gray-400 h-5 w-5 z-10" />
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
                            className={datePickerWrapperClass}
                          />
                        )}
                      />
                    </div>
                    {errors.date && (
                      <p className="text-red-500 text-sm mt-1 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.date.message}
                      </p>
                    )}
                  </div>
                  
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Admission Time</label>
                    <div className="relative">
                      <Clock className="absolute top-3 left-3 text-gray-400 h-5 w-5" />
                      <input
                        type="text"
                        {...register("time", { required: "Time is required" })}
                        placeholder="Time"
                        className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          errors.time ? "border-red-500" : "border-gray-300"
                        } transition duration-200`}
                        defaultValue={formatAMPM(new Date())}
                      />
                    </div>
                    {errors.time && (
                      <p className="text-red-500 text-sm mt-1 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.time.message}
                      </p>
                    )}
                  </div>

                  {/* Room Type & Bed */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-medium text-gray-700">Room Type</label>
                      <button
                        type="button"
                        onClick={() => setShowBedPopup(true)}
                        className="text-blue-600 hover:text-blue-800 text-sm flex items-center"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View Availability
                      </button>
                    </div>
                    <Controller
                      control={control}
                      name="roomType"
                      rules={{ required: "Room Type is required" }}
                      render={({ field }) => (
                        <Select
                          {...field}
                          options={RoomTypeOptions}
                          placeholder="Select Room Type"
                          styles={customSelectStyles}
                          onChange={(val) => field.onChange(val)}
                        />
                      )}
                    />
                    {errors.roomType && (
                      <p className="text-red-500 text-sm mt-1 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.roomType.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bed</label>
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
                          styles={customSelectStyles}
                          onChange={(val) => field.onChange(val)}
                          isDisabled={!selectedRoomType || beds.length === 0}
                        />
                      )}
                    />
                    {errors.bed && (
                      <p className="text-red-500 text-sm mt-1 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.bed.message}
                      </p>
                    )}
                  </div>

                  {/* Doctor & Referral Doctor */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
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
                          styles={customSelectStyles}
                          onChange={(val) => field.onChange(val)}
                        />
                      )}
                    />
                    {errors.doctor && (
                      <p className="text-red-500 text-sm mt-1 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.doctor.message}
                      </p>
                    )}
                  </div>
                  
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Referral Doctor (Optional)</label>
                    <div className="relative">
                      <Stethoscope className="absolute top-3 left-3 text-gray-400 h-5 w-5" />
                      <input
                        type="text"
                        {...register("referDoctor")}
                        placeholder="Name of referring doctor"
                        className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300 transition duration-200"
                      />
                    </div>
                  </div>

                  {/* Admission Type */}
                  <div className="col-span-full">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Admission Type</label>
                    <Controller
                      control={control}
                      name="admissionType"
                      rules={{ required: "Admission Type is required" }}
                      render={({ field }) => (
                        <Select
                          {...field}
                          options={AdmissionTypeOptions}
                          placeholder="Select Admission Type"
                          styles={customSelectStyles}
                          onChange={(val) => field.onChange(val)}
                        />
                      )}
                    />
                    {errors.admissionType && (
                      <p className="text-red-500 text-sm mt-1 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.admissionType.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-4 flex justify-between">
                  <button
                    type="button"
                    onClick={() => setFormStep(1)}
                    className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 flex items-center"
                  >
                    <ArrowLeft className="mr-2 h-5 w-5" />
                    Back
                  </button>
                  
                  <div className="flex space-x-3">
                    <button
                      type="button"
                      onClick={handlePreview}
                      className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center"
                    >
                      <FileText className="mr-2 h-5 w-5" />
                      Preview
                    </button>
                    
                    <button
                      type="submit"
                      disabled={loading}
                      className={`px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center ${
                        loading ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                    >
                      <Send className="mr-2 h-5 w-5" />
                      {loading ? "Submitting..." : "Submit Admission"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>
      </main>

      {/* Preview Modal */}
      {previewData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-3xl overflow-auto max-h-screen">
            <div className="flex justify-between items-center mb-4 border-b pb-4">
              <h3 className="text-2xl font-semibold text-blue-700">
                Preview IPD Admission
              </h3>
              <button 
                onClick={() => setPreviewData(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              <div className="space-y-2">
                <h4 className="font-medium text-gray-500 text-sm">Patient Information</h4>
                <p className="flex justify-between">
                  <span className="text-gray-600">Name:</span>
                  <span className="font-medium">{previewData.name}</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-gray-600">Phone:</span>
                  <span className="font-medium">{previewData.phone}</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-gray-600">Gender:</span>
                  <span className="font-medium">{previewData.gender?.label}</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-gray-600">Age:</span>
                  <span className="font-medium">{previewData.age}</span>
                </p>
                {previewData.address && (
                  <p className="flex justify-between">
                    <span className="text-gray-600">Address:</span>
                    <span className="font-medium">{previewData.address}</span>
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <h4 className="font-medium text-gray-500 text-sm">Relative Information</h4>
                <p className="flex justify-between">
                  <span className="text-gray-600">Name:</span>
                  <span className="font-medium">{previewData.relativeName}</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-gray-600">Phone:</span>
                  <span className="font-medium">{previewData.relativePhone}</span>
                </p>
                {previewData.relativeAddress && (
                  <p className="flex justify-between">
                    <span className="text-gray-600">Address:</span>
                    <span className="font-medium">{previewData.relativeAddress}</span>
                  </p>
                )}
              </div>
              
              <div className="space-y-2 col-span-full mt-4">
                <h4 className="font-medium text-gray-500 text-sm">Admission Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                  <p className="flex justify-between">
                    <span className="text-gray-600">Date:</span>
                    <span className="font-medium">{previewData.date.toLocaleDateString()}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-gray-600">Time:</span>
                    <span className="font-medium">{previewData.time}</span>
                  </p>
                  {previewData.roomType && (
                    <p className="flex justify-between">
                      <span className="text-gray-600">Room Type:</span>
                      <span className="font-medium">{previewData.roomType.label}</span>
                    </p>
                  )}
                  {previewData.bed && (
                    <p className="flex justify-between">
                      <span className="text-gray-600">Bed:</span>
                      <span className="font-medium">{previewData.bed.label}</span>
                    </p>
                  )}
                  {previewData.doctor && (
                    <p className="flex justify-between">
                      <span className="text-gray-600">Doctor:</span>
                      <span className="font-medium">{previewData.doctor.label}</span>
                    </p>
                  )}
                  {previewData.referDoctor && (
                    <p className="flex justify-between">
                      <span className="text-gray-600">Referral Doctor:</span>
                      <span className="font-medium">{previewData.referDoctor}</span>
                    </p>
                  )}
                  {previewData.admissionType && (
                    <p className="flex justify-between">
                      <span className="text-gray-600">Admission Type:</span>
                      <span className="font-medium">{previewData.admissionType.label}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="mt-8 flex flex-wrap gap-4 justify-end border-t pt-4">
              <button
                type="button"
                onClick={() => setPreviewData(null)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition duration-200 flex items-center"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Cancel
              </button>
              
              {/* Render your PDF button or component */}
              {previewData && <IPDSignaturePDF data={previewData} />}

              <button
                type="button"
                onClick={handleSubmit(onSubmit)}
                className={`px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200 flex items-center ${
                  loading ? "opacity-50 cursor-not-allowed" : ""
                }`}
                disabled={loading}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {loading ? "Submitting..." : "Confirm & Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bed Availability Popup */}
      {showBedPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-4xl max-h-[80vh] overflow-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-blue-700 flex items-center">
                <Bed className="h-5 w-5 mr-2" />
                Bed Availability
              </h2>
              <button
                onClick={() => setShowBedPopup(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>

            {Object.keys(allBedData).length === 0 && (
              <div className="flex flex-col items-center justify-center py-8">
                <AlertCircle className="h-12 w-12 text-gray-400 mb-2" />
                <p className="text-gray-500">No bed data available</p>
              </div>
            )}

            <div className="space-y-6">
              {Object.keys(allBedData).map((roomKey) => {
                const roomBeds = allBedData[roomKey];
                const availableBeds = Object.values(roomBeds).filter((bed: any) => bed.status === "Available").length;
                const totalBeds = Object.keys(roomBeds).length;
                
                return (
                  <div key={roomKey} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 p-4 border-b">
                      <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold capitalize">
                          {roomKey.replace("_", " ")}
                        </h3>
                        <span className={`px-3 py-1 rounded-full text-sm ${
                          availableBeds > 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                        }`}>
                          {availableBeds} of {totalBeds} available
                        </span>
                      </div>
                    </div>
                    
                    <div className="p-4">
                      <div className="flex flex-wrap gap-4">
                        {Object.keys(roomBeds).map((bedId) => {
                          const bedInfo = roomBeds[bedId];
                          const isAvailable = bedInfo.status === "Available";
                          return (
                            <div
                              key={bedId}
                              className={`flex flex-col items-center justify-center w-20 h-20 rounded-lg cursor-pointer border-2 transition-all ${
                                isAvailable 
                                  ? "border-green-500 bg-green-50 hover:bg-green-100" 
                                  : "border-red-300 bg-red-50 opacity-60"
                              }`}
                              onClick={() => {
                                if (!isAvailable) return;
                                // Auto-fill form with this bed & room
                                const rtOption = RoomTypeOptions.find(
                                  (opt) => opt.value === roomKey
                                );
                                setValue("roomType", rtOption || null);
                                // Overwrite the bed dropdown
                                setBeds([
                                  {
                                    label: `Bed ${bedInfo.bedNumber}`,
                                    value: bedId,
                                  },
                                ]);
                                setValue("bed", {
                                  label: `Bed ${bedInfo.bedNumber}`,
                                  value: bedId,
                                });
                                setShowBedPopup(false);
                              }}
                            >
                              <Bed
                                size={24}
                                className={
                                  isAvailable ? "text-green-600" : "text-red-500"
                                }
                              />
                              <span className="text-sm mt-1 font-medium">
                                Bed {bedInfo.bedNumber}
                              </span>
                              <span className="text-xs">
                                {isAvailable ? "Available" : "Occupied"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default IPDBookingPage;
