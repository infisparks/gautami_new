// app/admin/pathology/page.tsx

"use client";

import React, { useState, useEffect, useRef } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { db } from "../../lib/firebase";
import { ref, push, set, onValue, update } from "firebase/database";
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
  age?: number;
  address: string;
  gender: string;
  bloodTestName: string;
  amount: number;
  paymentId?: string;
}

interface IBloodTestEntry {
  bloodTestName: string;
  // Add other fields if necessary
}

interface PatientRecord {
  uhid: string;
  name: string;
  phone: string;
  address: string;
  age?: number;
  gender: string;
  createdAt: number;
  ipd?: any;
  pathology?: any;
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
    },
  });

  const [loading, setLoading] = useState(false);

  // State for blood test suggestions (kept from your original code)
  const [bloodTestOptions, setBloodTestOptions] = useState<string[]>([]);
  const [filteredBloodTests, setFilteredBloodTests] = useState<string[]>([]);
  const [showBloodTestSuggestions, setShowBloodTestSuggestions] =
    useState(false);
  const bloodTestSuggestionBoxRef = useRef<HTMLUListElement>(null);

  // State for patient auto-complete
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

  // Fetch available blood tests
  useEffect(() => {
    const bloodTestsRef = ref(db, "bloodTests");
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

  // Filter blood test suggestions based on input
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

  // Fetch all patients for auto-complete
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

  // Filter patient suggestions when name input changes
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

  // Handle clicking a patient suggestion
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

  // Hide patient suggestion box when clicking outside
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

  // Hide blood test suggestion box when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        bloodTestSuggestionBoxRef.current &&
        !bloodTestSuggestionBoxRef.current.contains(event.target as Node)
      ) {
        setShowBloodTestSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // onSubmit handler: create/update patient record and add pathology entry
  const onSubmit: SubmitHandler<IPatientFormInput> = async (data) => {
    setLoading(true);
    try {
      let uhid: string;
      if (selectedPatient) {
        // Existing patient: update details and add new pathology entry
        uhid = selectedPatient.id;
        const patientRef = ref(db, `patients/${uhid}`);
        // Update patient basic details (keeping createdAt intact)
        await update(patientRef, {
          name: data.name,
          phone: data.phone,
          address: data.address,
          age: data.age,
          gender: data.gender,
        });
      } else {
        // New patient: generate a new UHID and create a patient record
        uhid = generatePatientId();
        await set(ref(db, `patients/${uhid}`), {
          name: data.name,
          phone: data.phone,
          address: data.address,
          age: data.age,
          gender: data.gender,
          createdAt: Date.now(),
          uhid: uhid,
          ipd: {},
        });
      }
      // Save pathology entry under the patient's record (using push so multiple entries can exist)
      const pathologyRef = ref(db, `patients/${uhid}/pathology`);
      const newPathologyRef = push(pathologyRef);
      await set(newPathologyRef, {
        bloodTestName: data.bloodTestName,
        amount: data.amount,
        paymentId: data.paymentId || null,
        timestamp: Date.now(),
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
      });
      setPatientNameInput("");
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
                  {patientSuggestions.map((suggestion) => (
                    <li
                      key={suggestion.value}
                      onClick={() =>
                        handlePatientSuggestionClick(suggestion.value)
                      }
                      className="px-4 py-2 hover:bg-green-100 cursor-pointer"
                    >
                      {suggestion.label}
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
