// app/admin/mortality-report/page.tsx

"use client";

import React, { useState, useEffect, useRef } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
// import { yupResolver } from "@hookform/resolvers/yup";
// import * as yup from "yup";
import { db } from "../../lib/firebase";
import { ref, push, set, onValue, update } from "firebase/database";
import Head from "next/head";
import {
  AiOutlineUser,
  AiOutlinePhone,
  AiOutlineFieldBinary,
  AiOutlineCalendar,
  AiOutlineFileText,
} from "react-icons/ai";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// Interfaces for form inputs and Firebase storage

interface IMortalityReportInput {
  // Personal Details
  name: string;
  phone: string;
  age?: number;
  address: string;
  gender: string;
  // Mortality-specific Details
  admissionDate: string;
  dateOfDeath: string;
  medicalFindings: string;
}

interface IFirebaseMortalityReport {
  admissionDate: string;
  dateOfDeath: string;
  medicalFindings: string;
  timeSpanDays: number;
  timestamp: number;
}

// Patient record interface – personal details stored outside mortality node
interface PatientRecord {
  uhid: string;
  name: string;
  phone: string;
  age?: number;
  address: string;
  gender: string;
  createdAt: number;
  ipd?: any;
  mortality?: Record<string, IFirebaseMortalityReport>;
}

// Helper function to generate a 10-character alphanumeric UHID
function generatePatientId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const MortalityReportPage: React.FC = () => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm<IMortalityReportInput>({
    // resolver: yupResolver(mortalityReportSchema),
    defaultValues: {
      name: "",
      phone: "",
      age: undefined,
      address: "",
      gender: "",
      admissionDate: "",
      dateOfDeath: new Date().toISOString().split("T")[0],
      medicalFindings: "",
    },
  });

  const [loading, setLoading] = useState(false);

  // --- Auto-Complete for Patient Name ---
  const [allPatients, setAllPatients] = useState<PatientRecord[]>([]);
  const [patientNameInput, setPatientNameInput] = useState("");
  const [patientSuggestions, setPatientSuggestions] = useState<
    { label: string; value: string }[]
  >([]);
  const [selectedPatient, setSelectedPatient] = useState<{
    id: string;
    data: PatientRecord;
  } | null>(null);
  const patientSuggestionBoxRef = useRef<HTMLUListElement>(null);

  // Load existing patient records from Firebase
  useEffect(() => {
    const patientsRef = ref(db, "patients");
    const unsubscribe = onValue(patientsRef, (snapshot) => {
      const data = snapshot.val();
      const loaded: PatientRecord[] = [];
      if (data) {
        for (const key in data) {
          loaded.push({ uhid: key, ...data[key] });
        }
      }
      setAllPatients(loaded);
    });
    return () => unsubscribe();
  }, []);

  // Filter suggestions based on patient name input (min. 2 characters)
  useEffect(() => {
    if (patientNameInput.length >= 2) {
      const lower = patientNameInput.toLowerCase();
      const suggestions = allPatients
        .filter((p) => p.name.toLowerCase().includes(lower))
        .map((p) => ({
          label: `${p.name} - ${p.phone}`,
          value: p.uhid,
        }));
      setPatientSuggestions(suggestions);
    } else {
      setPatientSuggestions([]);
    }
  }, [patientNameInput, allPatients]);

  // When a suggestion is clicked, auto-fill the personal details
  const handlePatientSuggestionClick = (uhid: string) => {
    const found = allPatients.find((p) => p.uhid === uhid);
    if (!found) return;
    setSelectedPatient({ id: found.uhid, data: found });
    setValue("name", found.name);
    setValue("phone", found.phone);
    setValue("age", found.age);
    setValue("address", found.address);
    setValue("gender", found.gender);
    setPatientNameInput(found.name);
    setPatientSuggestions([]);
    toast.info(`Patient ${found.name} selected.`);
  };

  // Close suggestion dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        patientSuggestionBoxRef.current &&
        !patientSuggestionBoxRef.current.contains(event.target as Node)
      ) {
        setPatientSuggestions([]);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // --- onSubmit Handler ---
  const onSubmit: SubmitHandler<IMortalityReportInput> = async (data) => {
    setLoading(true);
    try {
      // Parse the admission and death dates
      const admissionDateObj = new Date(data.admissionDate);
      const dateOfDeathObj = new Date(data.dateOfDeath);
      const timeSpanMs = dateOfDeathObj.getTime() - admissionDateObj.getTime();
      const timeSpanDays = Math.floor(timeSpanMs / (1000 * 60 * 60 * 24));

      const mortalityData: IFirebaseMortalityReport = {
        admissionDate: data.admissionDate,
        dateOfDeath: data.dateOfDeath,
        medicalFindings: data.medicalFindings,
        timeSpanDays,
        timestamp: Date.now(),
      };

      let uhid: string;
      if (selectedPatient) {
        // Update existing patient record with personal details
        uhid = selectedPatient.id;
        const patientRef = ref(db, `patients/${uhid}`);
        await update(patientRef, {
          name: data.name,
          phone: data.phone,
          age: data.age,
          address: data.address,
          gender: data.gender,
        });
      } else {
        // Create new patient record with generated UHID
        uhid = generatePatientId();
        await set(ref(db, `patients/${uhid}`), {
          name: data.name,
          phone: data.phone,
          age: data.age,
          address: data.address,
          gender: data.gender,
          createdAt: Date.now(),
          uhid: uhid,
          ipd: {},
        });
      }

      // Save mortality details under the patient's record
      const mortalityRef = ref(db, `patients/${uhid}/mortality`);
      const newMortalityRef = push(mortalityRef);
      await set(newMortalityRef, mortalityData);

      toast.success("Mortality report saved successfully!", {
        position: "top-right",
        autoClose: 5000,
      });

      // Reset the form; dateOfDeath resets to current date
      reset({
        name: "",
        phone: "",
        age: undefined,
        address: "",
        gender: "",
        admissionDate: "",
        dateOfDeath: new Date().toISOString().split("T")[0],
        medicalFindings: "",
      });
      setPatientNameInput("");
      setSelectedPatient(null);
      setPatientSuggestions([]);
    } catch (error) {
      console.error("Error saving mortality report:", error);
      toast.error("Failed to save report. Please try again.", {
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
        <title>Admin - Mortality Report</title>
        <meta name="description" content="Submit mortality reports" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ToastContainer />

      <main className="min-h-screen bg-gradient-to-r from-red-100 to-red-200 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl bg-white rounded-3xl shadow-xl p-10">
          <h2 className="text-3xl font-bold text-center text-red-600 mb-8">
            Mortality Report
          </h2>
          <div className="mb-6 text-center text-gray-600">
            {new Date().toLocaleString()}
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Patient Name with Auto-Complete */}
            <div className="relative">
              <label
                htmlFor="name"
                className="block text-gray-700 font-medium mb-1"
              >
                Patient Name <span className="text-red-500">*</span>
              </label>
              <AiOutlineUser className="absolute top-9 left-3 text-gray-400" />
              <input
                id="name"
                type="text"
                value={patientNameInput}
                onChange={(e) => {
                  setPatientNameInput(e.target.value);
                  setValue("name", e.target.value, { shouldValidate: true });
                  setSelectedPatient(null);
                }}
                placeholder="Patient Name"
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 transition duration-200"
              />
              {patientSuggestions.length > 0 && (
                <ul
                  ref={patientSuggestionBoxRef}
                  className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg mt-1 max-h-60 overflow-y-auto shadow-lg"
                >
                  {patientSuggestions.map((suggestion) => (
                    <li
                      key={suggestion.value}
                      onClick={() =>
                        handlePatientSuggestionClick(suggestion.value)
                      }
                      className="px-4 py-2 hover:bg-red-100 cursor-pointer"
                    >
                      {suggestion.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Patient Phone */}
            <div className="relative">
              <label
                htmlFor="phone"
                className="block text-gray-700 font-medium mb-1"
              >
                Phone <span className="text-red-500">*</span>
              </label>
              <AiOutlinePhone className="absolute top-9 left-3 text-gray-400" />
              <input
                id="phone"
                type="text"
                {...register("phone")}
                placeholder="Patient Phone Number"
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 transition duration-200"
              />
            </div>

            {/* Age */}
            <div className="relative">
              <label
                htmlFor="age"
                className="block text-gray-700 font-medium mb-1"
              >
                Age <span className="text-red-500">*</span>
              </label>
              <AiOutlineFieldBinary className="absolute top-9 left-3 text-gray-400" />
              <input
                id="age"
                type="number"
                {...register("age", { valueAsNumber: true })}
                placeholder="Age"
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 transition duration-200"
                min="0"
              />
            </div>

            {/* Address */}
            <div className="relative">
              <label
                htmlFor="address"
                className="block text-gray-700 font-medium mb-1"
              >
                Address <span className="text-red-500">*</span>
              </label>
              <AiOutlineUser className="absolute top-9 left-3 text-gray-400" />
              <input
                id="address"
                type="text"
                {...register("address")}
                placeholder="Address"
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 transition duration-200"
              />
            </div>

            {/* Gender (Drop-Down) */}
            <div className="relative">
              <label
                htmlFor="gender"
                className="block text-gray-700 font-medium mb-1"
              >
                Gender <span className="text-red-500">*</span>
              </label>
              <AiOutlineUser className="absolute top-9 left-3 text-gray-400" />
              <select
                id="gender"
                {...register("gender")}
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 transition duration-200"
              >
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Admission Date */}
            <div className="relative">
              <label
                htmlFor="admissionDate"
                className="block text-gray-700 font-medium mb-1"
              >
                Admission Date <span className="text-red-500">*</span>
              </label>
              <AiOutlineCalendar className="absolute top-9 left-3 text-gray-400" />
              <input
                id="admissionDate"
                type="date"
                {...register("admissionDate")}
                placeholder="Admission Date"
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 transition duration-200"
                max={new Date().toISOString().split("T")[0]}
              />
            </div>

            {/* Date of Death */}
            <div className="relative">
              <label
                htmlFor="dateOfDeath"
                className="block text-gray-700 font-medium mb-1"
              >
                Date of Death <span className="text-red-500">*</span>
              </label>
              <AiOutlineCalendar className="absolute top-9 left-3 text-gray-400" />
              <input
                id="dateOfDeath"
                type="date"
                {...register("dateOfDeath")}
                placeholder="Date of Death"
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 transition duration-200"
                max={new Date().toISOString().split("T")[0]}
              />
            </div>

            {/* Medical Findings */}
            <div className="relative">
              <label
                htmlFor="medicalFindings"
                className="block text-gray-700 font-medium mb-1"
              >
                Medical Findings <span className="text-red-500">*</span>
              </label>
              <AiOutlineFileText className="absolute top-9 left-3 text-gray-400" />
              <textarea
                id="medicalFindings"
                {...register("medicalFindings")}
                placeholder="Medical Findings"
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 h-32 resize-none transition duration-200"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 ${
                loading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {loading ? "Submitting..." : "Submit Report"}
            </button>
          </form>
        </div>
      </main>
    </>
  );
};

export default MortalityReportPage;
