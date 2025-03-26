"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { ref, push, set, onValue, update } from "firebase/database";
import Head from "next/head";
import {
  AiOutlineUser,
  AiOutlinePhone,
  AiOutlineFieldBinary,
  AiOutlineCalendar,
  AiOutlineFileText,
} from "react-icons/ai";
import { FaCheckCircle, FaTimesCircle } from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// Import the main (Gautami) Firebase database and the Medford Family one
import { db as dbGautami } from "../../lib/firebase";
import { db as dbMedford } from "../../lib/firebaseMedford";

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

// Minimal patient record stored in Medford Family (only minimal details)
interface MedfordPatient {
  patientId: string;
  name: string;
  contact: string;
  dob: string;
  gender: string;
  hospitalName: string;
}

// Combined patient type for auto-complete suggestions
interface CombinedPatient {
  id: string;
  name: string;
  phone?: string;
  source: "gautami" | "medford";
  data: any;
}

// Helper function to generate a 10-character alphanumeric ID
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
    reset,
    setValue,
  } = useForm<IMortalityReportInput>({
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

  // --- Auto-Complete for Patient Name (from both databases) ---
  const [gautamiPatients, setGautamiPatients] = useState<CombinedPatient[]>([]);
  const [medfordPatients, setMedfordPatients] = useState<CombinedPatient[]>([]);
  const [patientNameInput, setPatientNameInput] = useState("");
  const [patientSuggestions, setPatientSuggestions] = useState<CombinedPatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<CombinedPatient | null>(null);
  const patientSuggestionBoxRef = useRef<HTMLUListElement>(null);

  // Fetch patients from Gautami DB (full details)
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

  // Fetch patients from Medford Family DB (minimal details)
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

  // Use useMemo to avoid recreating the array on every render
  const allCombinedPatients = useMemo(
    () => [...gautamiPatients, ...medfordPatients],
    [gautamiPatients, medfordPatients]
  );

  // Filter suggestions based on input.
  // If a patient is already selected and the input matches, then hide suggestions.
  useEffect(() => {
    if (selectedPatient && patientNameInput === selectedPatient.name) {
      setPatientSuggestions([]);
    } else if (patientNameInput.length >= 2) {
      const lower = patientNameInput.toLowerCase();
      const suggestions = allCombinedPatients.filter((p) =>
        p.name.toLowerCase().includes(lower)
      );
      setPatientSuggestions(suggestions);
    } else {
      setPatientSuggestions([]);
    }
  }, [patientNameInput, allCombinedPatients, selectedPatient]);

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

  // When a patient suggestion is clicked, auto-fill the personal details
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
    toast.info(`Patient ${patient.name} selected from ${patient.source.toUpperCase()}!`);
  };

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
        // Update existing patient record in Gautami DB
        uhid = selectedPatient.id;
        const patientRef = ref(dbGautami, `patients/${uhid}`);
        await update(patientRef, {
          name: data.name,
          phone: data.phone,
          age: data.age,
          address: data.address,
          gender: data.gender,
        });
      } else {
        // New patient: create full record in Gautami and minimal record in Medford Family
        uhid = generatePatientId();
        // Save full details in Gautami DB
        await set(ref(dbGautami, `patients/${uhid}`), {
          name: data.name,
          phone: data.phone,
          age: data.age,
          address: data.address,
          gender: data.gender,
          createdAt: new Date().toISOString(),
          uhid: uhid,
          ipd: {},
        });
        // Save minimal details in Medford Family DB (only contact, dob, gender, name, patientId)
        await set(ref(dbMedford, `patients/${uhid}`), {
          name: data.name,
          contact: data.phone,
          gender: data.gender,
          dob: "", // Set to empty string or update with proper value if available
          patientId: uhid,
          hospitalName: "MEDFORD",
        });
      }

      // Save mortality details under the patient's record in Gautami DB
      const mortalityRef = ref(dbGautami, `patients/${uhid}/mortality`);
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
              <label htmlFor="name" className="block text-gray-700 font-medium mb-1">
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
                  {patientSuggestions.map((patient) => (
                    <li
                      key={patient.id}
                      onClick={() => handlePatientSuggestionClick(patient)}
                      className="px-4 py-2 hover:bg-red-100 cursor-pointer flex justify-between items-center"
                    >
                      <span>{`${patient.name} - ${patient.phone || ""}`}</span>
                      {patient.source === "gautami" ? (
                        <FaCheckCircle color="green" />
                      ) : (
                        <FaTimesCircle color="red" />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Patient Phone */}
            <div className="relative">
              <label htmlFor="phone" className="block text-gray-700 font-medium mb-1">
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
              <label htmlFor="age" className="block text-gray-700 font-medium mb-1">
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
              <label htmlFor="address" className="block text-gray-700 font-medium mb-1">
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
              <label htmlFor="gender" className="block text-gray-700 font-medium mb-1">
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
              <label htmlFor="admissionDate" className="block text-gray-700 font-medium mb-1">
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
              <label htmlFor="dateOfDeath" className="block text-gray-700 font-medium mb-1">
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
              <label htmlFor="medicalFindings" className="block text-gray-700 font-medium mb-1">
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
