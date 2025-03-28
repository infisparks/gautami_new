"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useForm, SubmitHandler, Controller } from 'react-hook-form';
import { db } from '../../lib/firebase'; // Gautami DB
import { db as dbMedford } from '../../lib/firebaseMedford'; // Medford Family DB
import {
  ref,
  push,
  update,
  get,
  onValue,
  set
} from 'firebase/database';
import Head from 'next/head';
import {
  FaUser,
  FaPhone,
  FaBirthdayCake,
  FaMapMarkerAlt,
  FaCalendarAlt,
  FaClock,
  FaRegCommentDots,
  FaDollarSign,
  FaInfoCircle,
  FaMicrophone,
  FaMicrophoneSlash,
  FaCheckCircle,
  FaTimesCircle
} from 'react-icons/fa';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Select from 'react-select';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';

/** ---------------------------
 *   TYPE & CONSTANT DEFINITIONS
 *  ---------------------------
 */
interface IFormInput {
  name: string;
  phone: string;
  age: number;
  gender: { label: string; value: string } | null;
  address?: string;
  date: Date;
  time: string;
  message?: string;
  paymentMethod: { label: string; value: string } | null;
  amount: number;
  serviceName: string;
  doctor: { label: string; value: string } | null;
}

interface PatientRecord {
  id: string;
  name: string;
  phone: string;
  age?: number;
  gender?: string;
  address?: string;
  createdAt?: string;
  opd?: any; // Extra subfields
}

// Minimal patient record from Medford Family
interface MedfordPatient {
  patientId: string;
  name: string;
  contact: string;
  dob: string;
  gender: string;
  hospitalName: string;
}

// Combined patient type for auto‑suggestions
interface CombinedPatient {
  id: string;
  name: string;
  phone?: string;
  source: "gautami" | "medford";
  data: PatientRecord | MedfordPatient;
}

const PaymentOptions = [
  { value: 'cash', label: 'Cash' },
  { value: 'online', label: 'Online' },
];

const GenderOptions = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

/**
 * Utility function: Format a Date to 12-hour time with AM/PM
 */
function formatAMPM(date: Date): string {
  let hours = date.getHours();
  let minutes: string | number = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  minutes = minutes < 10 ? '0' + minutes : minutes;
  return `${hours}:${minutes} ${ampm}`;
}

/** Helper function to generate a 10-character alphanumeric UHID */
function generatePatientId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/** ---------------
 *    MAIN COMPONENT
 *  ---------------
 */
const OPDBookingPage: React.FC = () => {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    reset,
    watch,
    setValue,
  } = useForm<IFormInput>({
    defaultValues: {
      name: '',
      phone: '',
      age: 0,
      gender: null,
      address: '',
      date: new Date(),
      time: formatAMPM(new Date()),
      message: '',
      paymentMethod: null,
      amount: 0,
      serviceName: '',
      doctor: null,
    },
  });

  // States for voice recognition, loading, preview modal, and doctors
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<IFormInput | null>(null);
  const [doctors, setDoctors] = useState<{ label: string; value: string }[]>([]);
  const [doctorMenuIsOpen, setDoctorMenuIsOpen] = useState(false);
  const doctorSelectRef = useRef<any>(null);

  // States for patient auto-suggest & selection using combined data from both databases
  const [patientNameInput, setPatientNameInput] = useState('');
  const [patientSuggestions, setPatientSuggestions] = useState<CombinedPatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<CombinedPatient | null>(null);

  // We'll store patients from both databases separately
  const [gautamiPatients, setGautamiPatients] = useState<CombinedPatient[]>([]);
  const [medfordPatients, setMedfordPatients] = useState<CombinedPatient[]>([]);

  /** ---------------------------
   *  SPEECH RECOGNITION COMMANDS
   *  ---------------------------
   */
  const commands = [
    // Name Commands
    {
      command: 'name *',
      callback: (name: string) => {
        setPatientNameInput(name.trim());
        setValue('name', name.trim(), { shouldValidate: true });
        toast.info(`Name set to: ${name.trim()}`);
      },
    },
    {
      command: 'mera naam *',
      callback: (name: string) => {
        setPatientNameInput(name.trim());
        setValue('name', name.trim(), { shouldValidate: true });
        toast.info(`Name set to: ${name.trim()}`);
      },
    },
    {
      command: 'my name *',
      callback: (name: string) => {
        setPatientNameInput(name.trim());
        setValue('name', name.trim(), { shouldValidate: true });
        toast.info(`Name set to: ${name.trim()}`);
      },
    },
    // Phone Commands
    {
      command: 'number *',
      callback: (phone: string) => {
        const sanitizedPhone = phone.replace(/\D/g, '').trim();
        setValue('phone', sanitizedPhone, { shouldValidate: true });
        toast.info(`Phone number set to: ${sanitizedPhone}`);
      },
    },
    {
      command: 'mera number *',
      callback: (phone: string) => {
        const sanitizedPhone = phone.replace(/\D/g, '').trim();
        setValue('phone', sanitizedPhone, { shouldValidate: true });
        toast.info(`Phone number set to: ${sanitizedPhone}`);
      },
    },
    {
      command: 'my number *',
      callback: (phone: string) => {
        const sanitizedPhone = phone.replace(/\D/g, '').trim();
        setValue('phone', sanitizedPhone, { shouldValidate: true });
        toast.info(`Phone number set to: ${sanitizedPhone}`);
      },
    },
    // Age Command
    {
      command: 'age *',
      callback: (age: string) => {
        const numericAge = parseInt(age.replace(/\D/g, ''), 10);
        if (!isNaN(numericAge) && numericAge > 0) {
          setValue('age', numericAge, { shouldValidate: true });
          toast.info(`Age set to: ${numericAge}`);
        } else {
          toast.error('Invalid age. Please try again.');
        }
      },
    },
    // Gender Command
    {
      command: 'gender *',
      callback: (gender: string) => {
        const normalizedGender = gender.trim().toLowerCase();
        const option = GenderOptions.find(
          (opt) => opt.label.toLowerCase() === normalizedGender
        );
        if (option) {
          setValue('gender', option, { shouldValidate: true });
          toast.info(`Gender set to: ${option.label}`);
        } else {
          toast.error(`Gender "${gender}" not recognized.`);
        }
      },
    },
    // Address Command
    {
      command: 'address *',
      callback: (address: string) => {
        const trimmedAddress = address.trim();
        setValue('address', trimmedAddress, { shouldValidate: false });
        toast.info('Address set.');
      },
    },
    // Date Commands
    {
      command: 'set date to *',
      callback: (date: string) => {
        const parsedDate = new Date(Date.parse(date));
        if (!isNaN(parsedDate.getTime())) {
          setValue('date', parsedDate, { shouldValidate: true });
          toast.info(`Date set to: ${parsedDate.toLocaleDateString()}`);
        } else {
          toast.error('Invalid date format. Please try again.');
        }
      },
    },
    // Time Commands
    {
      command: 'set time to *',
      callback: (time: string) => {
        setValue('time', time.trim(), { shouldValidate: true });
        toast.info(`Time set to: ${time.trim()}`);
      },
    },
    // Message Commands
    {
      command: 'message *',
      callback: (message: string) => {
        const trimmedMessage = message.trim();
        setValue('message', trimmedMessage, { shouldValidate: false });
        toast.info('Message set.');
      },
    },
    // Payment Method Commands
    {
      command: 'payment method *',
      callback: (method: string) => {
        const option = PaymentOptions.find(
          (opt) => opt.label.toLowerCase() === method.toLowerCase()
        );
        if (option) {
          setValue('paymentMethod', option, { shouldValidate: true });
          toast.info(`Payment method set to: ${option.label}`);
        } else {
          toast.error(`Payment method "${method}" not recognized.`);
        }
      },
    },
    // Amount Commands
    {
      command: 'amount *',
      callback: (amount: string) => {
        const numericAmount = parseFloat(amount.replace(/[^0-9.]/g, ''));
        if (!isNaN(numericAmount)) {
          setValue('amount', numericAmount, { shouldValidate: true });
          toast.info(`Amount set to: Rs ${numericAmount}`);
        } else {
          toast.error('Invalid amount. Please try again.');
        }
      },
    },
    // Service Name Commands
    {
      command: 'service *',
      callback: (serviceName: string) => {
        const trimmedServiceName = serviceName.trim().replace(/\s+/g, ' ');
        setValue('serviceName', trimmedServiceName, { shouldValidate: true });
        toast.info(`Service name set to: ${trimmedServiceName}`);
      },
    },
    {
      command: 'mera service *',
      callback: (serviceName: string) => {
        const trimmedServiceName = serviceName.trim().replace(/\s+/g, ' ');
        setValue('serviceName', trimmedServiceName, { shouldValidate: true });
        toast.info(`Service name set to: ${trimmedServiceName}`);
      },
    },
    {
      command: 'my service *',
      callback: (serviceName: string) => {
        const trimmedServiceName = serviceName.trim().replace(/\s+/g, ' ');
        setValue('serviceName', trimmedServiceName, { shouldValidate: true });
        toast.info(`Service name set to: ${trimmedServiceName}`);
      },
    },
    // Doctor Commands
    {
      command: 'drop down',
      callback: () => {
        setDoctorMenuIsOpen(true);
        toast.info('Doctor dropdown opened.');
      },
    },
    {
      command: 'select doctor *',
      callback: (doctorName: string) => {
        const normalizedDoctorName = doctorName.trim().toLowerCase();
        let selectedDoctor = doctors.find(
          (doc) => doc.label.toLowerCase() === normalizedDoctorName
        );
        if (!selectedDoctor) {
          selectedDoctor = doctors.find(
            (doc) => doc.label.toLowerCase().includes(normalizedDoctorName)
          );
        }
        if (selectedDoctor) {
          setValue('doctor', selectedDoctor, { shouldValidate: true });
          setDoctorMenuIsOpen(false);
          toast.info(`Doctor set to: ${selectedDoctor.label}`);
        } else {
          toast.error(`Doctor "${doctorName}" not found.`);
        }
      },
    },
    // Preview & Submit Commands
    {
      command: 'preview',
      callback: () => {
        handlePreview();
        toast.info('Form previewed.');
      },
    },
    {
      command: 'cancel',
      callback: () => {
        setPreviewData(null);
        toast.info('Preview canceled.');
      },
    },
    {
      command: 'submit',
      callback: () => {
        handleSubmit(onSubmit)();
      },
    },
  ];

  /** ------------------------------
   *  HOOKS: SPEECH RECOGNITION INIT
   *  ------------------------------ */
  const {
    transcript,
    resetTranscript,
    browserSupportsSpeechRecognition,
    listening: micListening,
  } = useSpeechRecognition({ commands });

  useEffect(() => {
    if (!browserSupportsSpeechRecognition) {
      toast.error('Browser does not support speech recognition.');
    }
  }, [browserSupportsSpeechRecognition]);

  /** ----------------
   *   FETCH DOCTORS
   *  ----------------
   */
  useEffect(() => {
    const doctorsRef = ref(db, 'doctors');
    const unsubscribe = onValue(doctorsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const doctorsList = Object.keys(data).map((key) => ({
          label: data[key].name,
          value: key,
        }));
        doctorsList.unshift({ label: 'No Doctor', value: 'no_doctor' });
        setDoctors(doctorsList);
      } else {
        setDoctors([{ label: 'No Doctor', value: 'no_doctor' }]);
      }
    });
    return () => unsubscribe();
  }, []);

  /** -------------------------------
   *  FETCH PATIENTS FROM BOTH DATABASES
   *  -------------------------------
   */
  // Fetch patients from Gautami DB
  useEffect(() => {
    const patientsRef = ref(db, 'patients');
    const unsubscribe = onValue(patientsRef, (snapshot) => {
      const data = snapshot.val();
      const loaded: CombinedPatient[] = [];
      if (data) {
        for (const key in data) {
          loaded.push({
            id: key,
            name: data[key].name,
            phone: data[key].phone,
            source: 'gautami',
            data: { ...data[key], id: key }
          });
        }
      }
      setGautamiPatients(loaded);
    });
    return () => unsubscribe();
  }, []);

  // Fetch patients from Medford Family DB
  useEffect(() => {
    const medfordRef = ref(dbMedford, 'patients');
    const unsubscribe = onValue(medfordRef, (snapshot) => {
      const data = snapshot.val();
      const loaded: CombinedPatient[] = [];
      if (data) {
        for (const key in data) {
          const rec: MedfordPatient = data[key];
          loaded.push({
            id: rec.patientId,
            name: rec.name,
            phone: rec.contact,
            source: 'medford',
            data: rec,
          });
        }
      }
      setMedfordPatients(loaded);
    });
    return () => unsubscribe();
  }, []);

  // Combined suggestions from both sources
  useEffect(() => {
    const allCombined = [...gautamiPatients, ...medfordPatients];
    if (patientNameInput.length >= 2) {
      // If a patient is selected and the input exactly matches, clear suggestions.
      if (selectedPatient && patientNameInput === selectedPatient.name) {
        setPatientSuggestions([]);
      } else {
        const lower = patientNameInput.toLowerCase();
        const suggestions = allCombined.filter((p) =>
          p.name.toLowerCase().includes(lower)
        );
        setPatientSuggestions(suggestions);
      }
    } else {
      setPatientSuggestions([]);
    }
  }, [patientNameInput, gautamiPatients, medfordPatients, selectedPatient]);

  /** -------------------------------------------
   *  SELECT PATIENT FROM DROPDOWN, AUTO-FILL FORM
   *  -------------------------------------------
   */
  const handlePatientSuggestionClick = (patient: CombinedPatient) => {
    setSelectedPatient(patient);
    setValue('name', patient.name);
    setValue('phone', patient.phone || '');
    // For gender and address, populate if available (from Gautami)
    if (patient.source === 'gautami') {
      setValue('address', (patient.data as PatientRecord).address);
      setValue('age', (patient.data as PatientRecord).age || 0);
      setValue('gender', GenderOptions.find(opt => opt.value === (patient.data as PatientRecord).gender) || null);
    } else {
      // For Medford, we may have only gender available
      setValue('gender', GenderOptions.find(opt => opt.value === (patient.data as MedfordPatient).gender) || null);
    }
    setPatientNameInput(patient.name);
    setPatientSuggestions([]);
    toast.info(`Patient ${patient.name} selected from ${patient.source.toUpperCase()}!`);
  };

  /** -----------------------------------------
   *  FETCH DOCTOR AMOUNT WHEN DOCTOR CHANGES
   *  ----------------------------------------- */
  const selectedDoctor = watch('doctor');
  const fetchDoctorAmount = useCallback(
    async (doctorId: string) => {
      try {
        const doctorRef = ref(db, `doctors/${doctorId}`);
        const snapshot = await get(doctorRef);
        if (snapshot.exists()) {
          const data = snapshot.val();
          // Use opdCharge from the doctor record as per your firebase DB structure
          setValue('amount', data.opdCharge || 0);
        } else {
          setValue('amount', 0);
        }
      } catch (error) {
        console.error('Error fetching doctor amount:', error);
        setValue('amount', 0);
      }
    },
    [setValue]
  );

  useEffect(() => {
    if (selectedDoctor) {
      if (selectedDoctor.value === 'no_doctor') {
        setValue('amount', 0);
      } else {
        fetchDoctorAmount(selectedDoctor.value);
      }
    } else {
      setValue('amount', 0);
    }
  }, [selectedDoctor, setValue, fetchDoctorAmount]);

  /** ---------------------------------------------------------
   *  SUBMISSION LOGIC:
   *  1. If an existing patient is selected, push OPD data.
   *  2. Otherwise, create a new patient record in Gautami DB (full details)
   *     and a minimal record in Medford DB, then push OPD data.
   *  --------------------------------------------------------- */
  const onSubmit: SubmitHandler<IFormInput> = async (data) => {
    setLoading(true);
    try {
      // OPD appointment data
      const appointmentData = {
        date: data.date.toISOString(),
        time: data.time,
        paymentMethod: data.paymentMethod?.value || '',
        amount: data.amount,
        serviceName: data.serviceName,
        doctor: data.doctor?.value || 'no_doctor',
        message: data.message || '',
        createdAt: new Date().toISOString(),
      };

      let patientId = '';
      if (selectedPatient) {
        // Existing patient
        patientId = selectedPatient.id;
        // Optionally update patient info in Gautami DB here if needed...
        const patientRef = ref(db, `patients/${patientId}`);
        await update(patientRef, {
          name: data.name,
          phone: data.phone,
          age: data.age,
          address: data.address,
          gender: data.gender?.value || ''
        });
      } else {
        // New patient: create full record in Gautami and minimal record in Medford
        const newPatientId = generatePatientId();
        const newPatientData = {
          name: data.name,
          phone: data.phone,
          age: data.age,
          gender: data.gender?.value || '',
          address: data.address || '',
          createdAt: new Date().toISOString(),
          uhid: newPatientId,
        };
        await set(ref(db, `patients/${newPatientId}`), newPatientData);
        // Minimal record for Medford Family DB
        await set(ref(dbMedford, `patients/${newPatientId}`), {
          name: data.name,
          contact: data.phone,
          gender: data.gender?.value || '',
          dob: "", // Set to empty or update with proper value if available
          patientId: newPatientId,
          hospitalName: "MEDFORD",
        });
        patientId = newPatientId;
      }

      // Push appointment data under patients/{patientId}/opd/{unique_opd_key}
      const opdRef = ref(db, `patients/${patientId}/opd`);
      const newOpdRef = push(opdRef);
      await update(newOpdRef, appointmentData);

      toast.success('Appointment booked successfully!', {
        position: "top-right",
        autoClose: 5000,
      });

      // Reset form & states
      reset({
        name: '',
        phone: '',
        age: 0,
        gender: null,
        address: '',
        date: new Date(),
        time: formatAMPM(new Date()),
        paymentMethod: null,
        amount: 0,
        message: '',
        serviceName: '',
        doctor: null,
      });
      setPreviewData(null);
      resetTranscript();
      setSelectedPatient(null);
      setPatientNameInput('');
    } catch (error) {
      console.error('Error booking appointment:', error);
      toast.error('Failed to book appointment. Please try again.', {
        position: "top-right",
        autoClose: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  /** -------------
   *  FORM PREVIEW
   *  -------------
   */
  const handlePreview = () => {
    setPreviewData(watch());
  };

  /** -------------------------------
   *  TOGGLE START/STOP VOICE CONTROL
   *  ------------------------------- */
  const toggleListening = () => {
    if (micListening) {
      SpeechRecognition.stopListening();
      toast.info('Voice recognition stopped.');
    } else {
      if (browserSupportsSpeechRecognition) {
        SpeechRecognition.startListening({ continuous: true });
        toast.info('Voice recognition started.');
      } else {
        toast.error('Browser does not support speech recognition.');
      }
    }
  };

  /** -----------
   *   RENDER UI
   *  -----------
   */
  return (
    <>
      <Head>
        <title>Simple OPD Booking</title>
        <meta name="description" content="Book your OPD appointment easily" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ToastContainer />

      <main className="min-h-screen bg-gradient-to-r from-green-100 to-teal-200 flex items-center justify-center p-6">
        <div className="w-full max-w-3xl bg-white rounded-3xl shadow-xl p-10">
          <h2 className="text-3xl font-bold text-center text-teal-600 mb-8">
            Book an Appointment
          </h2>

          {/* Voice Control Buttons */}
          <div className="flex justify-center mb-6 space-x-4">
            <button
              type="button"
              onClick={toggleListening}
              className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {micListening ? (
                <FaMicrophoneSlash className="mr-2" />
              ) : (
                <FaMicrophone className="mr-2" />
              )}
              {micListening ? 'Stop Listening' : 'Start Voice Control'}
            </button>
            <button
              type="button"
              onClick={() => {
                resetTranscript();
                toast.info('Transcript cleared.');
              }}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition duration-200 focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              Reset Transcript
            </button>
          </div>

          {/* Display Transcript */}
          {micListening && (
            <div className="mb-6 p-4 bg-gray-100 rounded-lg">
              <h3 className="text-lg font-semibold mb-2">Listening...</h3>
              <p className="text-gray-700">{transcript}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Patient Name Field with Auto-Suggest */}
            <div className="relative">
              <FaUser className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                value={patientNameInput}
                onChange={(e) => {
                  setPatientNameInput(e.target.value);
                  setValue('name', e.target.value, { shouldValidate: true });
                  setSelectedPatient(null);
                }}
                placeholder="Name"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
              />
              {errors.name && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.name.message}
                </p>
              )}
              {/* Suggestions Dropdown with Tick Icons */}
              {patientSuggestions.length > 0 && !selectedPatient && (
                <ul className="absolute z-10 bg-white border border-gray-300 w-full mt-1 max-h-40 overflow-auto">
                  {patientSuggestions.map((suggestion) => (
                    <li
                      key={suggestion.id}
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex justify-between items-center"
                      onClick={() => handlePatientSuggestionClick(suggestion)}
                    >
                      <span>{`${suggestion.name} - ${suggestion.phone || ""}`}</span>
                      {suggestion.source === "gautami" ? (
                        <FaCheckCircle color="green" />
                      ) : (
                        <FaTimesCircle color="red" />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Phone Field */}
            <div className="relative">
              <FaPhone className="absolute top-3 left-3 text-gray-400" />
              <input
                type="tel"
                {...register('phone', {
                  required: 'Phone number is required',
                  pattern: {
                    value: /^[0-9]{10}$/,
                    message: 'Phone number must be 10 digits',
                  },
                })}
                placeholder="Phone Number"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  errors.phone ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
              />
              {errors.phone && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.phone.message}
                </p>
              )}
            </div>

            {/* Age Field */}
            <div className="relative">
              <FaBirthdayCake className="absolute top-3 left-3 text-gray-400" />
              <input
                type="number"
                {...register('age', {
                  required: 'Age is required',
                  min: { value: 1, message: 'Age must be positive' },
                })}
                placeholder="Age"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  errors.age ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
              />
              {errors.age && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.age.message}
                </p>
              )}
            </div>

            {/* Gender Field */}
            <div>
              <label className="block text-gray-700 mb-2">Gender</label>
              <Controller
                control={control}
                name="gender"
                rules={{ required: 'Gender is required' }}
                render={({ field }) => (
                  <Select
                    {...field}
                    options={GenderOptions}
                    placeholder="Select Gender"
                    classNamePrefix="react-select"
                    onChange={(value) => field.onChange(value)}
                  />
                )}
              />
              {errors.gender && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.gender.message}
                </p>
              )}
            </div>

            {/* Address Field */}
            <div className="relative">
              <FaMapMarkerAlt className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                {...register('address')}
                placeholder="Address (Optional)"
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 border-gray-300 transition duration-200"
              />
            </div>

            {/* Date Field */}
            <div className="relative">
              <FaCalendarAlt className="absolute top-3 left-3 text-gray-400" />
              <Controller
                control={control}
                name="date"
                rules={{ required: 'Date is required' }}
                render={({ field }) => (
                  <DatePicker
                    selected={field.value}
                    onChange={(date: Date | null) =>
                      date && field.onChange(date)
                    }
                    dateFormat="dd/MM/yyyy"
                    placeholderText="Select Date"
                    className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                      errors.date ? 'border-red-500' : 'border-gray-300'
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

            {/* Time Field */}
            <div className="relative">
              <FaClock className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                {...register('time', { required: 'Time is required' })}
                placeholder="Time"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  errors.time ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
                defaultValue={formatAMPM(new Date())}
              />
              {errors.time && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.time.message}
                </p>
              )}
            </div>

            {/* Message Field */}
            <div className="relative">
              <FaRegCommentDots className="absolute top-3 left-3 text-gray-400" />
              <textarea
                {...register('message')}
                placeholder="Message (Optional)"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  errors.message ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
                rows={3}
              ></textarea>
              {errors.message && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.message.message}
                </p>
              )}
            </div>

            {/* Payment Method Field */}
            <div>
              <label className="block text-gray-700 mb-2">Payment Method</label>
              <Controller
                control={control}
                name="paymentMethod"
                rules={{ required: 'Payment method is required' }}
                render={({ field }) => (
                  <Select
                    {...field}
                    options={PaymentOptions}
                    placeholder="Select Payment Method"
                    classNamePrefix="react-select"
                    className={`${
                      errors.paymentMethod ? 'border-red-500' : 'border-gray-300'
                    }`}
                    onChange={(value) => field.onChange(value)}
                  />
                )}
              />
              {errors.paymentMethod && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.paymentMethod.message}
                </p>
              )}
            </div>

            {/* Service Name Field */}
            <div className="relative">
              <FaInfoCircle className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                {...register('serviceName', {
                  required: 'Service name is required',
                })}
                placeholder="Service Name"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  errors.serviceName ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
              />
              {errors.serviceName && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.serviceName.message}
                </p>
              )}
            </div>

            {/* Doctor Selection Field (moved before Amount) */}
            <div>
              <label className="block text-gray-700 mb-2">Select Doctor</label>
              <Controller
                control={control}
                name="doctor"
                rules={{ required: 'Doctor selection is required' }}
                render={({ field }) => (
                  <Select
                    {...field}
                    options={doctors}
                    placeholder="Select Doctor or No Doctor"
                    classNamePrefix="react-select"
                    className={`${
                      errors.doctor ? 'border-red-500' : 'border-gray-300'
                    }`}
                    isClearable
                    onChange={(value) => field.onChange(value)}
                    menuIsOpen={doctorMenuIsOpen}
                    onMenuClose={() => setDoctorMenuIsOpen(false)}
                    onMenuOpen={() => setDoctorMenuIsOpen(true)}
                    ref={doctorSelectRef}
                  />
                )}
              />
              {errors.doctor && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.doctor.message}
                </p>
              )}
            </div>

            {/* Amount Field (now below Doctor Selection) */}
            <div className="relative">
              <FaDollarSign className="absolute top-3 left-3 text-gray-400" />
              <input
                type="number"
                {...register('amount', {
                  required: 'Amount is required',
                  min: { value: 0, message: 'Amount must be positive' },
                })}
                placeholder="Amount (Rs)"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  errors.amount ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
                min="0"
              />
              {errors.amount && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.amount.message}
                </p>
              )}
            </div>

            {/* Preview Button */}
            <button
              type="button"
              onClick={handlePreview}
              className="w-full py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Preview
            </button>

            {/* Preview Modal */}
            {previewData && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg">
                  <h3 className="text-2xl font-semibold mb-4">
                    Preview Appointment
                  </h3>
                  <div className="space-y-2">
                    <p>
                      <strong>Name:</strong> {previewData.name}
                    </p>
                    <p>
                      <strong>Phone:</strong> {previewData.phone}
                    </p>
                    <p>
                      <strong>Age:</strong> {previewData.age}
                    </p>
                    <p>
                      <strong>Gender:</strong> {previewData.gender?.label}
                    </p>
                    {previewData.address && (
                      <p>
                        <strong>Address:</strong> {previewData.address}
                      </p>
                    )}
                    <p>
                      <strong>Date:</strong>{' '}
                      {previewData.date.toLocaleDateString()}
                    </p>
                    <p>
                      <strong>Time:</strong> {previewData.time}
                    </p>
                    {previewData.message && (
                      <p>
                        <strong>Message:</strong> {previewData.message}
                      </p>
                    )}
                    <p>
                      <strong>Payment Method:</strong>{' '}
                      {previewData.paymentMethod?.label}
                    </p>
                    <p>
                      <strong>Service Name:</strong> {previewData.serviceName}
                    </p>
                    <p>
                      <strong>Doctor:</strong> {previewData.doctor?.label}
                    </p>
                    <p>
                      <strong>Amount:</strong> Rs {previewData.amount}
                    </p>
                  </div>
                  <div className="mt-6 flex justify-end space-x-4">
                    <button
                      type="button"
                      onClick={() => setPreviewData(null)}
                      className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition duration-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className={`px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition duration-200 ${
                        loading ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      disabled={loading}
                    >
                      {loading ? 'Submitting...' : 'Confirm & Submit'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loading ? 'Submitting...' : 'Submit Appointment'}
            </button>
          </form>
        </div>
      </main>
    </>
  );
};

export default OPDBookingPage;
