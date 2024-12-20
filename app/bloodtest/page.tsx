// app/admin/pathology/page.tsx

"use client";

import React, { useState, useEffect, useRef } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
// import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { db } from "../../lib/firebase";
import { ref, push, set, onValue } from "firebase/database";
import Head from "next/head";
import {
  AiOutlineUser,
  AiOutlinePhone,
  AiOutlineFieldBinary,
  AiOutlineDollarCircle,
} from "react-icons/ai";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

interface IPatientFormInput {
  name: string;
  phone: string;
  age: number;
  bloodTestName: string;
  amount: number;
  paymentId?: string; // Optional string without Maybe
}

interface IBloodTestEntry {
  bloodTestName: string;
  // Add other fields if necessary
}

// const patientSchema = yup
//   .object({
//     name: yup.string().required("Patient name is required"),
//     phone: yup.string().required("Patient phone number is required"),
//     age: yup
//       .number()
//       .typeError("Age must be a number")
//       .positive("Age must be positive")
//       .integer("Age must be an integer")
//       .required("Age is required"),
//     bloodTestName: yup.string().required("Blood test name is required"),
//     amount: yup
//       .number()
//       .typeError("Amount must be a number")
//       .positive("Amount must be positive")
//       .required("Amount is required"),
//     paymentId: yup.string().notRequired(), // Optional string
//   })
//   .required();

const PathologyEntryPage: React.FC = () => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm<IPatientFormInput>({
    // resolver: yupResolver(patientSchema),
    defaultValues: {
      name: "",
      phone: "",
      age: undefined,
      bloodTestName: "",
      amount: undefined,
      paymentId: "", // Initialize as empty string
    },
  });

  const [loading, setLoading] = useState(false);
  const [bloodTestOptions, setBloodTestOptions] = useState<string[]>([]);
  const [filteredOptions, setFilteredOptions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionBoxRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const bloodTestsRef = ref(db, "bloodTests");
    const unsubscribe = onValue(bloodTestsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Ensure data is of type Record<string, IBloodTestEntry>
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

  const handleBloodTestInputChange = (value: string) => {
    if (value) {
      const filtered = bloodTestOptions.filter((test) =>
        test.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredOptions(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setFilteredOptions([]);
      setShowSuggestions(false);
    }
  };

  const onSubmit: SubmitHandler<IPatientFormInput> = async (data) => {
    setLoading(true);
    try {
      const bloodTestsRef = ref(db, "bloodTests");
      const newTestRef = push(bloodTestsRef);
      await set(newTestRef, {
        name: data.name,
        phone: data.phone,
        age: data.age,
        bloodTestName: data.bloodTestName,
        amount: data.amount,
        paymentId: data.paymentId || null, // Include Payment ID if provided
        timestamp: Date.now(),
      });

      toast.success("Patient added successfully!", {
        position: "top-right",
        autoClose: 5000,
      });

      reset({
        name: "",
        phone: "",
        age: undefined,
        bloodTestName: "",
        amount: undefined,
        paymentId: "", // Reset Payment ID field
      });
      setShowSuggestions(false);
    } catch (error) {
      console.error("Error adding patient:", error);
      toast.error("Failed to add patient. Please try again.", {
        position: "top-right",
        autoClose: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setValue("bloodTestName", suggestion, { shouldValidate: true });
    setShowSuggestions(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionBoxRef.current &&
        !suggestionBoxRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <>
      <Head>
        <title>Admin - Pathology Entry</title>
        <meta name="description" content="Add patient details and blood tests" />
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
            {/* Patient Name */}
            <div className="relative">
              <AiOutlineUser className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                {...register("name")}
                placeholder="Patient Name"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  errors.name ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
              />
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

            {/* Blood Test Name */}
            <div className="relative">
              <AiOutlineFieldBinary className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                {...register("bloodTestName")}
                placeholder="Blood Test Name"
                onChange={(e) => handleBloodTestInputChange(e.target.value)}
                autoComplete="off"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  errors.bloodTestName ? "border-red-500" : "border-gray-300"
                } transition duration-200`}
              />
              {showSuggestions && filteredOptions.length > 0 && (
                <ul
                  ref={suggestionBoxRef}
                  className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg mt-1 max-h-60 overflow-y-auto shadow-lg"
                >
                  {filteredOptions.map((suggestion, index) => (
                    <li
                      key={index}
                      onClick={() => handleSuggestionClick(suggestion)}
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
                type="text" // Payment ID is typically alphanumeric
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
