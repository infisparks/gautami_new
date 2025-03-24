"use client";

import React, { useState, useEffect, } from 'react';
import { useForm, SubmitHandler, Controller } from 'react-hook-form';
import { db } from '../../lib/firebase'; // <-- adjust path as needed
import {
  ref,
  push,
  update,
  onValue,
 
} from 'firebase/database';
import Head from 'next/head';
import {
  FaUser,
  FaPhone,
  FaTransgender,
  FaCalendarAlt,
  FaClock,
  FaHome,
  FaUserFriends,
 
  FaStethoscope
} from 'react-icons/fa';

import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Select from 'react-select';

/** ---------------------------
 *   TYPE & CONSTANT DEFINITIONS
 *  ---------------------------
 */
interface IPDFormInput {
  /** Basic Patient Info */
  name: string;
  phone: string;
  gender: { label: string; value: string } | null;
  age: number;
  address?: string;

  /** Relative Info */
  relativeName: string;
  relativePhone: string;
  relativeAddress?: string;

  /** IPD Details */
  date: Date;
  time: string;
  roomType: { label: string; value: string } | null;
  bed: { label: string; value: string } | null;
  doctor: { label: string; value: string } | null;
  referDoctor?: string;
  admissionType: { label: string; value: string } | null;
}

/** Gender, Admission, Room Type, etc. */
const GenderOptions = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const AdmissionTypeOptions = [
  { value: 'general', label: 'General' },
  { value: 'surgery', label: 'Surgery' },
  { value: 'accident_emergency', label: 'Accident/Emergency' },
  { value: 'day_observation', label: 'Day Observation' },
];

const RoomTypeOptions = [
  { value: 'female_ward', label: 'Female Ward (5 Rooms)' },
  { value: 'icu', label: 'ICU (3 Beds)' },
  { value: 'male_ward', label: 'Male Ward (5 Beds)' },
  { value: 'deluxe', label: 'Deluxe (2 Beds)' },
  { value: 'nicu', label: 'NICU (1 Bed)' },
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

/** Representation of local patient data */
interface PatientRecord {
  id: string;
  name: string;
  phone: string;
  gender?: string;
  age?: number;
  address?: string;
  // Potentially other fields, e.g., OPD / IPD subfields
}

/** ---------------
 *    MAIN COMPONENT
 *  --------------- */
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
      name: '',
      phone: '',
      gender: null,
      age: 0,
      address: '',
      relativeName: '',
      relativePhone: '',
      relativeAddress: '',
      date: new Date(),
      time: formatAMPM(new Date()),
      roomType: null,
      bed: null,
      doctor: null,
      referDoctor: '',
      admissionType: null,
    },
  });

  // For loading, preview, doctors, bed list, etc.
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<IPDFormInput | null>(null);
  const [doctors, setDoctors] = useState<{ label: string; value: string }[]>([]);
  const [beds, setBeds] = useState<{ label: string; value: string }[]>([]);

  // Watch for changes to room type so we can load available beds
  const selectedRoomType = watch('roomType');

  // For local patient data & auto-suggestion
  const [allPatients, setAllPatients] = useState<PatientRecord[]>([]);
  const [patientNameInput, setPatientNameInput] = useState('');
  const [patientSuggestions, setPatientSuggestions] = useState<
    { label: string; value: string }[]
  >([]);
  const [selectedPatient, setSelectedPatient] = useState<{
    id: string;
    data: PatientRecord;
  } | null>(null);

  /** -------------
   *   FETCH DOCTORS
   *  ------------- */
  useEffect(() => {
    const doctorsRef = ref(db, 'doctors');
    const unsubscribe = onValue(doctorsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Filter IPD or both
        const doctorsList = Object.keys(data)
          .filter((key) => {
            const department = String(data[key].department || '').toLowerCase();
            return department === 'ipd' || department === 'both';
          })
          .map((key) => ({
            label: data[key].name,
            value: key,
          }));
        setDoctors(doctorsList);
      } else {
        setDoctors([]);
      }
    });
    return () => unsubscribe();
  }, []);

  /** ---------------------------
   *  FETCH ALL PATIENTS AT START
   *  --------------------------- */
  useEffect(() => {
    const patientsRef = ref(db, 'patients');
    const unsubscribe = onValue(patientsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setAllPatients([]);
        return;
      }
      const loaded: PatientRecord[] = [];
      for (const key in data) {
        loaded.push({
          id: key,
          name: data[key].name,
          phone: data[key].phone,
          gender: data[key].gender,
          age: data[key].age,
          address: data[key].address,
        });
      }
      setAllPatients(loaded);
    });
    return () => unsubscribe();
  }, []);

  /** --------------------------------
   *  CLIENT-SIDE FILTER FOR SUGGESTIONS
   *  -------------------------------- */
  const filterPatientSuggestions = (name: string) => {
    if (name.length < 2) {
      setPatientSuggestions([]);
      return;
    }
    const lower = name.toLowerCase();
    const matched = allPatients.filter((p) =>
      p.name.toLowerCase().includes(lower)
    );
    const suggestions = matched.map((p) => ({
      label: `${p.name} - ${p.phone}`,
      value: p.id,
    }));
    setPatientSuggestions(suggestions);
  };

  // Watch name input to filter suggestions unless a patient is already selected
  useEffect(() => {
    if (!selectedPatient) {
      filterPatientSuggestions(patientNameInput);
    }
  }, [patientNameInput, selectedPatient, allPatients]);

  /** -------------------------
   *  AUTO-FILL ON PATIENT SELECT
   *  ------------------------- */
  const handleSelectPatient = (patientId: string) => {
    const found = allPatients.find((p) => p.id === patientId);
    if (!found) return;

    setSelectedPatient({ id: found.id, data: found });
    setValue('name', found.name);
    setValue('phone', found.phone || '');
    setValue('age', found.age || 0);

    // Convert gender string -> { label, value }
    if (found.gender) {
      const g = GenderOptions.find(
        (opt) => opt.value?.toLowerCase() === found.gender?.toLowerCase()
      );
      setValue('gender', g || null);
    } else {
      setValue('gender', null);
    }

    setValue('address', found.address || '');
    setPatientNameInput(found.name);
    setPatientSuggestions([]);
    toast.info(`Patient ${found.name} selected.`);
  };

  /** ---------------------
   *   LOAD AVAILABLE BEDS
   *  --------------------- */
  useEffect(() => {
    if (selectedRoomType?.value) {
      const bedsRef = ref(db, `beds/${selectedRoomType.value}`);
      const unsubscribe = onValue(bedsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const bedList = Object.keys(data)
            .filter((key) => data[key].status === 'Available')
            .map((key) => ({
              label: `Bed ${data[key].bedNumber}`,
              value: key,
            }));
          setBeds(bedList);

          // If we already had a bed selected, we might want to reset it
          if (bedList.length === 0) {
            setValue('bed', null);
          }
        } else {
          setBeds([]);
          setValue('bed', null);
        }
      });
      return () => unsubscribe();
    } else {
      setBeds([]);
      setValue('bed', null);
    }
  }, [selectedRoomType, setValue]);

  /** --------
   *   SUBMIT
   *  -------- */
  const onSubmit: SubmitHandler<IPDFormInput> = async (data) => {
    setLoading(true);
    try {
      // 1) Occupy the bed if user selected one
      if (data.roomType?.value && data.bed?.value) {
        const bedRef = ref(db, `beds/${data.roomType.value}/${data.bed.value}`);
        await update(bedRef, { status: 'Occupied' });
      }

      // 2) IPD data to store under patients/{patientId}/ipd
      const ipdData = {
        name: data.name,
        phone: data.phone,
        gender: data.gender?.value || '',
        age: data.age,
        address: data.address || '',
        relativeName: data.relativeName,
        relativePhone: data.relativePhone,
        relativeAddress: data.relativeAddress || '',
        date: data.date.toISOString(),
        time: data.time,
        roomType: data.roomType?.value || '',
        bed: data.bed?.value || '',
        doctor: data.doctor?.value || '',
        referDoctor: data.referDoctor || '',
        admissionType: data.admissionType?.value || '',
        createdAt: new Date().toISOString(),
      };

      // 3) Check if we have an existing patient or need to create a new one
      let patientId: string;
      if (selectedPatient) {
        patientId = selectedPatient.id;
      } else {
        // create new patient node
        const newPatientRef = push(ref(db, 'patients'));
        await update(newPatientRef, {
          name: data.name,
          phone: data.phone,
          gender: data.gender?.value || '',
          age: data.age,
          address: data.address || '',
          createdAt: new Date().toISOString(),
        });
        patientId = newPatientRef.key as string;
      }

      // 4) push IPD record under that patient
      const ipdRef = ref(db, `patients/${patientId}/ipd`);
      const newIpdRef = push(ipdRef);
      await update(newIpdRef, ipdData);

      toast.success('IPD Admission created successfully!', {
        position: 'top-right',
        autoClose: 5000,
      });

      // 5) Reset everything
      reset({
        name: '',
        phone: '',
        gender: null,
        age: 0,
        address: '',
        relativeName: '',
        relativePhone: '',
        relativeAddress: '',
        date: new Date(),
        time: formatAMPM(new Date()),
        roomType: null,
        bed: null,
        doctor: null,
        referDoctor: '',
        admissionType: null,
      });
      setPreviewData(null);
      setPatientNameInput('');
      setSelectedPatient(null);
    } catch (err) {
      console.error('Error in IPD booking:', err);
      toast.error('Error: Failed to book IPD admission.', {
        position: 'top-right',
        autoClose: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  /** --------
   *   PREVIEW
   *  -------- */
  const handlePreview = () => {
    // Just show what’s in the form
    setPreviewData(watch());
  };

  /** -----------------
   *   BEDS AVAILABLE?
   *  ----------------- */
  const bedsAvailable = beds.length > 0;

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
            {/* Patient Name + Auto-Suggest */}
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
                placeholder="Patient Name"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
              />
              {errors.name && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.name.message}
                </p>
              )}

              {/* Suggestions Dropdown */}
              {patientSuggestions.length > 0 && !selectedPatient && (
                <ul className="absolute z-10 bg-white border border-gray-300 w-full mt-1 max-h-40 overflow-auto">
                  {patientSuggestions.map((sug) => (
                    <li
                      key={sug.value}
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                      onClick={() => handleSelectPatient(sug.value)}
                    >
                      {sug.label}
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
                    message: 'Must be a valid 10-digit phone number',
                  },
                })}
                placeholder="Patient Phone Number"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.phone ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
              />
              {errors.phone && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.phone.message}
                </p>
              )}
            </div>

            {/* Gender */}
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
                    className={`${errors.gender ? 'border-red-500' : ''}`}
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

            {/* Age & Address */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Age */}
              <div className="relative">
                <FaTransgender className="absolute top-3 left-3 text-gray-400" />
                <input
                  type="number"
                  {...register('age', {
                    required: 'Age is required',
                    min: { value: 1, message: 'Age must be positive' },
                  })}
                  placeholder="Age"
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.age ? 'border-red-500' : 'border-gray-300'
                  } transition duration-200`}
                />
                {errors.age && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.age.message}
                  </p>
                )}
              </div>

              {/* Address (Optional) */}
              <div className="relative">
                <FaHome className="absolute top-3 left-3 text-gray-400" />
                <input
                  type="text"
                  {...register('address')}
                  placeholder="Patient Address (Optional)"
                  className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300 transition duration-200"
                />
              </div>
            </div>

            {/* Relative Name & Phone & Address */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Relative Name */}
              <div className="relative">
                <FaUserFriends className="absolute top-3 left-3 text-gray-400" />
                <input
                  type="text"
                  {...register('relativeName', {
                    required: 'Relative name is required',
                  })}
                  placeholder="Relative Name"
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.relativeName ? 'border-red-500' : 'border-gray-300'
                  } transition duration-200`}
                />
                {errors.relativeName && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.relativeName.message}
                  </p>
                )}
              </div>

              {/* Relative Phone */}
              <div className="relative">
                <FaPhone className="absolute top-3 left-3 text-gray-400" />
                <input
                  type="tel"
                  {...register('relativePhone', {
                    required: 'Relative phone is required',
                    pattern: {
                      value: /^[0-9]{10}$/,
                      message: 'Must be a valid 10-digit phone number',
                    },
                  })}
                  placeholder="Relative Phone Number"
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.relativePhone ? 'border-red-500' : 'border-gray-300'
                  } transition duration-200`}
                />
                {errors.relativePhone && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.relativePhone.message}
                  </p>
                )}
              </div>
            </div>

            {/* Relative Address (optional) */}
            <div className="relative">
              <FaHome className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                {...register('relativeAddress')}
                placeholder="Relative Address (Optional)"
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300 transition duration-200"
              />
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Date */}
              <div className="relative">
                <FaCalendarAlt className="absolute top-3 left-3 text-gray-400" />
                <Controller
                  control={control}
                  name="date"
                  rules={{ required: 'Date is required' }}
                  render={({ field }) => (
                    <DatePicker
                      selected={field.value}
                      onChange={(dt) => dt && field.onChange(dt)}
                      dateFormat="dd/MM/yyyy"
                      placeholderText="Select Date"
                      className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
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

              {/* Time */}
              <div className="relative">
                <FaClock className="absolute top-3 left-3 text-gray-400" />
                <input
                  type="text"
                  {...register('time', {
                    required: 'Time is required',
                  })}
                  placeholder="Time"
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
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
            </div>

            {/* Room Type & Bed */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Room Type */}
              <div>
                <label className="block text-gray-700 mb-2">Room Type</label>
                <Controller
                  control={control}
                  name="roomType"
                  rules={{ required: 'Room Type is required' }}
                  render={({ field }) => (
                    <Select
                      {...field}
                      options={RoomTypeOptions}
                      placeholder="Select Room Type"
                      classNamePrefix="react-select"
                      className={errors.roomType ? 'border-red-500' : ''}
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

              {/* Bed */}
              <div>
                <label className="block text-gray-700 mb-2">Bed</label>
                <Controller
                  control={control}
                  name="bed"
                  rules={{ required: 'Bed selection is required' }}
                  render={({ field }) => (
                    <Select
                      {...field}
                      options={beds}
                      placeholder={
                        beds.length > 0 ? 'Select Bed' : 'No Beds Available'
                      }
                      classNamePrefix="react-select"
                      className={errors.bed ? 'border-red-500' : ''}
                      onChange={(val) => field.onChange(val)}
                      isDisabled={!selectedRoomType || beds.length === 0}
                    />
                  )}
                />
                {errors.bed && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.bed.message}
                  </p>
                )}
              </div>
            </div>

            {/* Doctor & ReferDoctor */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Under Care of Doctor */}
              <div>
                <label className="block text-gray-700 mb-2">
                  Under Care of Doctor
                </label>
                <Controller
                  control={control}
                  name="doctor"
                  rules={{ required: 'Doctor selection is required' }}
                  render={({ field }) => (
                    <Select
                      {...field}
                      options={doctors}
                      placeholder="Select Doctor"
                      classNamePrefix="react-select"
                      className={errors.doctor ? 'border-red-500' : ''}
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

              {/* Referral Doctor (optional) */}
              <div className="relative">
                <FaStethoscope className="absolute top-3 left-3 text-gray-400" />
                <input
                  type="text"
                  {...register('referDoctor')}
                  placeholder="Referral Doctor (Optional)"
                  className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300 transition duration-200"
                />
              </div>
            </div>

            {/* Admission Type */}
            <div>
              <label className="block text-gray-700 mb-2">Admission Type</label>
              <Controller
                control={control}
                name="admissionType"
                rules={{ required: 'Admission Type is required' }}
                render={({ field }) => (
                  <Select
                    {...field}
                    options={AdmissionTypeOptions}
                    placeholder="Select Admission Type"
                    classNamePrefix="react-select"
                    className={errors.admissionType ? 'border-red-500' : ''}
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

            {/* Preview Button */}
            <button
              type="button"
              onClick={handlePreview}
              className="w-full py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
              disabled={!bedsAvailable}
            >
              Preview
            </button>

            {/* Preview Modal */}
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
                        <strong>Relative Address:</strong>{' '}
                        {previewData.relativeAddress}
                      </p>
                    )}
                    <p>
                      <strong>Admission Date:</strong>{' '}
                      {previewData.date.toLocaleDateString()}
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
                        <strong>Under Care of Doctor:</strong>{' '}
                        {previewData.doctor.label}
                      </p>
                    )}
                    {previewData.referDoctor && (
                      <p>
                        <strong>Referral Doctor:</strong>{' '}
                        {previewData.referDoctor}
                      </p>
                    )}
                    {previewData.admissionType && (
                      <p>
                        <strong>Admission Type:</strong>{' '}
                        {previewData.admissionType.label}
                      </p>
                    )}
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
                      className={`px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200 ${
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
              disabled={loading || !bedsAvailable}
              className={`w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                loading || !bedsAvailable ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loading ? 'Submitting...' : 'Submit Admission'}
            </button>

            {/* No Beds Available Warning */}
            {!bedsAvailable && (
              <p className="text-red-500 text-center mt-4">
                No beds are available for the selected room type. Please choose
                a different room type.
              </p>
            )}
          </form>
        </div>
      </main>
    </>
  );
};

export default IPDBookingPage;
