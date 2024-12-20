// app/admin/mortality-report/page.tsx

"use client";

import React, { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup"; // Ensure this import is present
import * as yup from "yup";
import { db } from "../../lib/firebase";
import { ref, push, set } from "firebase/database";
import Head from "next/head";
import {
  AiOutlineUser,
  AiOutlineCalendar,
  AiOutlineFieldBinary,
  AiOutlineFileText,
} from "react-icons/ai";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// TypeScript Interface for Form Inputs
interface IMortalityReportInput {
  name: string;
  admissionDate: string;
  age: number;
  dateOfDeath: string;
  medicalFindings: string;
}

// TypeScript Interface for Data to be Stored in Firebase
interface IFirebaseMortalityReport extends IMortalityReportInput {
  timeSpanDays: number;
  timestamp: number;
}

// Yup Validation Schema
const mortalityReportSchema = yup
  .object({
    name: yup
      .string()
      .required("Patient name is required")
      .matches(/^[A-Za-z\s]+$/, "Name can only contain letters and spaces"),
    admissionDate: yup
      .date()
      .typeError("Admission date must be a valid date")
      .max(new Date(), "Admission date cannot be in the future")
      .required("Admission date is required"),
    age: yup
      .number()
      .typeError("Age must be a number")
      .positive("Age must be positive")
      .integer("Age must be an integer")
      .required("Age is required"),
    dateOfDeath: yup
      .date()
      .typeError("Date of death must be a valid date")
      .min(yup.ref("admissionDate"), "Date of death cannot be before admission date")
      .max(new Date(), "Date of death cannot be in the future")
      .required("Date of death is required"),
    medicalFindings: yup
      .string()
      .required("Medical findings are required")
      .min(10, "Medical findings must be at least 10 characters"),
  })
  .required();

const MortalityReportPage: React.FC = () => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<IMortalityReportInput>({
    // resolver: yupResolver(mortalityReportSchema), // ✅ Added resolver here
    defaultValues: {
      name: "",
      admissionDate: "",
      age: undefined,
      dateOfDeath: new Date().toISOString().split("T")[0], // Current date
      medicalFindings: "",
    },
  });

  const [loading, setLoading] = useState(false);

  const onSubmit: SubmitHandler<IMortalityReportInput> = async (data) => {
    setLoading(true);
    try {
      // Parse dates
      const admissionDate = new Date(data.admissionDate);
      const dateOfDeath = new Date(data.dateOfDeath);

      // Calculate time span in days
      const timeSpanMs = dateOfDeath.getTime() - admissionDate.getTime();
      const timeSpanDays = Math.floor(timeSpanMs / (1000 * 60 * 60 * 24));

      // Prepare data to store
      const reportData: IFirebaseMortalityReport = {
        ...data,
        timeSpanDays,
        timestamp: Date.now(),
      };

      // Push data to Firebase
      const mortalityReportsRef = ref(db, "mortalityReports");
      const newReportRef = push(mortalityReportsRef);
      await set(newReportRef, reportData);

      // Success notification
      toast.success("Mortality report submitted successfully!", {
        position: "top-right",
        autoClose: 5000,
      });

      // Reset form with default date of death as current date
      reset({
        name: "",
        admissionDate: "",
        age: undefined,
        dateOfDeath: new Date().toISOString().split("T")[0],
        medicalFindings: "",
      });
    } catch (error) {
      console.error("Error submitting mortality report:", error);
      toast.error("Failed to submit mortality report. Please try again.", {
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
            {/* Patient Name */}
            <div className="relative">
              <label htmlFor="name" className="block text-gray-700 font-medium mb-1">
                Patient Name <span className="text-red-500">*</span>
              </label>
              <AiOutlineUser className="absolute top-9 left-3 text-gray-400" />
              <input
                id="name"
                type="text"
                {...register("name")}
                placeholder="Patient Name"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 ${
                  errors.name ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
              />
              {errors.name && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.name.message}
                </p>
              )}
            </div>

            {/* Admission Date with Label */}
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
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 ${
                  errors.admissionDate ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
                max={new Date().toISOString().split("T")[0]} // Prevent future dates
              />
              {errors.admissionDate && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.admissionDate.message}
                </p>
              )}
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
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 ${
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

            {/* Date of Death with Label */}
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
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 ${
                  errors.dateOfDeath ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
                max={new Date().toISOString().split("T")[0]} // Prevent future dates
              />
              {errors.dateOfDeath && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.dateOfDeath.message}
                </p>
              )}
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
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 h-32 resize-none ${
                  errors.medicalFindings ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
              />
              {errors.medicalFindings && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.medicalFindings.message}
                </p>
              )}
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
