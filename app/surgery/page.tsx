// app/admin/surgery/page.tsx

"use client";

import React, { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { db } from "../../lib/firebase";
import { ref, push, set } from "firebase/database";
import Head from "next/head";
import {
  AiOutlineUser,
  AiOutlineFieldBinary,
  AiOutlineCalendar,
  AiOutlineFileText,
} from "react-icons/ai";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

interface ISurgeryFormInput {
  name: string;
  gender: string;
  age: number;
  surgeryDate: string; // ISO string for date
  surgeryTitle: string;
  finalDiagnosis: string;
}

const surgerySchema = yup
  .object({
    name: yup.string().required("Patient name is required"),
    gender: yup
      .string()
      .oneOf(["Male", "Female", "Other"], "Select a valid gender")
      .required("Gender is required"),
    age: yup
      .number()
      .typeError("Age must be a number")
      .positive("Age must be positive")
      .integer("Age must be an integer")
      .required("Age is required"),
    surgeryDate: yup
      .date()
      .typeError("Invalid date")
      .required("Surgery date is required"),
    surgeryTitle: yup.string().required("Title of surgery is required"),
    finalDiagnosis: yup.string().required("Final diagnosis is required"),
  })
  .required();

const SurgeryEntryPage: React.FC = () => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ISurgeryFormInput>({
    // resolver: yupResolver(surgerySchema),
    defaultValues: {
      name: "",
      gender: "",
      age: undefined,
      surgeryDate: new Date().toISOString().split("T")[0], // YYYY-MM-DD format
      surgeryTitle: "",
      finalDiagnosis: "",
    },
  });

  const [loading, setLoading] = useState(false);

  const onSubmit: SubmitHandler<ISurgeryFormInput> = async (data) => {
    setLoading(true);
    try {
      const surgeriesRef = ref(db, "surgeries");
      const newSurgeryRef = push(surgeriesRef);
      await set(newSurgeryRef, {
        name: data.name,
        gender: data.gender,
        age: data.age,
        surgeryDate: data.surgeryDate,
        surgeryTitle: data.surgeryTitle,
        finalDiagnosis: data.finalDiagnosis,
        timestamp: Date.now(),
      });

      toast.success("Surgery entry added successfully!", {
        position: "top-right",
        autoClose: 5000,
      });

      reset({
        name: "",
        gender: "",
        age: undefined,
        surgeryDate: new Date().toISOString().split("T")[0],
        surgeryTitle: "",
        finalDiagnosis: "",
      });
    } catch (error) {
      console.error("Error adding surgery entry:", error);
      toast.error("Failed to add surgery entry. Please try again.", {
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
        <title>Admin - Surgery Entry</title>
        <meta name="description" content="Add patient surgery details" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ToastContainer />

      <main className="min-h-screen bg-gradient-to-r from-blue-100 to-blue-200 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl bg-white rounded-3xl shadow-xl p-10">
          <h2 className="text-3xl font-bold text-center text-blue-600 mb-8">
            Surgery Entry
          </h2>
          <div className="mb-6 text-center text-gray-600">
            {new Date().toLocaleString()}
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Patient Name */}
            <div className="relative">
              <AiOutlineUser className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                {...register("name")}
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
            </div>

            {/* Gender */}
            <div className="relative">
              <AiOutlineFieldBinary className="absolute top-3 left-3 text-gray-400" />
              <select
                {...register("gender")}
                className={`w-full pl-10 pr-4 py-3 border rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 ${
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

            {/* Age */}
            <div className="relative">
              <AiOutlineFieldBinary className="absolute top-3 left-3 text-gray-400" />
              <input
                type="number"
                {...register("age", { valueAsNumber: true })}
                placeholder="Age"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
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

            {/* Surgery Date */}
            <div className="relative">
              <AiOutlineCalendar className="absolute top-3 left-3 text-gray-400" />
              <input
                type="date"
                {...register("surgeryDate")}
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.surgeryDate ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
              />
              {errors.surgeryDate && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.surgeryDate.message}
                </p>
              )}
            </div>

            {/* Title of Surgery */}
            <div className="relative">
              <AiOutlineFieldBinary className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                {...register("surgeryTitle")}
                placeholder="Title of Surgery"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.surgeryTitle ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
              />
              {errors.surgeryTitle && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.surgeryTitle.message}
                </p>
              )}
            </div>

            {/* Final Diagnosis */}
            <div className="relative">
              <AiOutlineFileText className="absolute top-3 left-3 text-gray-400" />
              <textarea
                {...register("finalDiagnosis")}
                placeholder="Final Diagnosis"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.finalDiagnosis ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
                rows={4}
              ></textarea>
              {errors.finalDiagnosis && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.finalDiagnosis.message}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                loading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {loading ? "Adding..." : "Add Surgery Entry"}
            </button>
          </form>
        </div>
      </main>
    </>
  );
};

export default SurgeryEntryPage;
