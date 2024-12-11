// app/ipd/page.tsx

"use client";

import React, { useState, useEffect } from 'react';
import { useForm, SubmitHandler, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { db } from '../../lib/firebase';
import { ref, push, update, onValue } from 'firebase/database';
import Head from 'next/head';
import { 
  AiOutlineUser, 
  AiOutlinePhone, 
  AiOutlineCalendar, 
  AiOutlineClockCircle, 
  AiOutlineInfoCircle 
} from 'react-icons/ai';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Select from 'react-select';

interface IPDFormInput {
  name: string;
  gender: { label: string; value: string };
  dateOfBirth: Date;
  age: number;
  bloodGroup: { label: string; value: string };
  date: Date;
  time: string;
  mobileNumber: string;
  emergencyMobileNumber?: string;
  membershipType: { label: string; value: string };
  roomType: { label: string; value: string };
  bed: { label: string; value: string };
  doctor: { label: string; value: string };
  referralDoctor?: string;
  admissionType: { label: string; value: string };
  amount: number;
  paymentType: { label: string; value: string };
  paymentMode: { label: string; value: string };
}

const schema = yup.object({
  name: yup.string().required('Full Name is required'),
  gender: yup.object({
    label: yup.string().required(),
    value: yup.string().required(),
  }).required('Gender is required'),
  dateOfBirth: yup.date().required('Date of Birth is required'),
  age: yup.number()
    .typeError('Age must be a number')
    .positive('Age must be positive')
    .integer('Age must be an integer')
    .required('Age is required'),
  bloodGroup: yup.object({
    label: yup.string().required(),
    value: yup.string().required(),
  }).required('Blood Group is required'),
  date: yup.date().required('Date is required'),
  time: yup.string().required('Time is required'),
  mobileNumber: yup.string()
    .matches(/^[0-9]{10}$/, 'Mobile number must be 10 digits')
    .required('Mobile Number is required'),
  emergencyMobileNumber: yup.string()
    .matches(/^[0-9]{10}$/, 'Emergency Mobile number must be 10 digits')
    .notRequired(),
  membershipType: yup.object({
    label: yup.string().required(),
    value: yup.string().required(),
  }).required('Membership Type is required'),
  roomType: yup.object({
    label: yup.string().required(),
    value: yup.string().required(),
  }).required('Room Type is required'),
  bed: yup.object({
    label: yup.string().required(),
    value: yup.string().required(),
  }).required('Bed selection is required'),
  doctor: yup.object({
    label: yup.string().required(),
    value: yup.string().required(),
  }).required('Doctor selection is required'),
  referralDoctor: yup.string().notRequired(),
  admissionType: yup.object({
    label: yup.string().required(),
    value: yup.string().required(),
  }).required('Admission Type is required'),
  amount: yup.number()
    .typeError('Amount must be a number')
    .positive('Amount must be positive')
    .required('Amount is required'),
  paymentType: yup.object({
    label: yup.string().required(),
    value: yup.string().required(),
  }).required('Payment Type is required'),
  paymentMode: yup.object({
    label: yup.string().required(),
    value: yup.string().required(),
  }).required('Payment Mode is required'),
}).required();

const AdmissionTypes = [
  { value: 'general', label: 'General' },
  { value: 'surgery', label: 'Surgery' },
  { value: 'accident_emergency', label: 'Accident/Emergency' },
  { value: 'day_observation', label: 'Day Observation' },
];

const GenderOptions = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const BloodGroupOptions = [
  { value: 'A+', label: 'A+' },
  { value: 'A-', label: 'A-' },
  { value: 'B+', label: 'B+' },
  { value: 'B-', label: 'B-' },
  { value: 'AB+', label: 'AB+' },
  { value: 'AB-', label: 'AB-' },
  { value: 'O+', label: 'O+' },
  { value: 'O-', label: 'O-' },
];

const MembershipTypeOptions = [
  { value: 'regular', label: 'Regular' },
  { value: 'premium', label: 'Premium' },
  { value: 'vip', label: 'VIP' },
];

const RoomTypeOptions = [
  { value: 'female_ward', label: 'Female Ward (5 Rooms)' },
  { value: 'icu', label: 'ICU (3 Beds)' },
  { value: 'male_ward', label: 'Male Ward (5 Beds)' },
  { value: 'deluxe', label: 'Deluxe (2 Beds)' },
  { value: 'nicu', label: 'NICU (1 Bed)' },
];

const PaymentTypeOptions = [
  { value: 'deposit', label: 'Deposit' },
  { value: 'settlement', label: 'Settlement' },
];

const PaymentModeOptions = [
  { value: 'cash', label: 'Cash' },
  { value: 'online', label: 'Online' },
];

function formatAMPM(date: Date): string {
  let hours = date.getHours();
  let minutes: string | number = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; 
  minutes = minutes < 10 ? '0' + minutes : minutes;
  return `${hours}:${minutes} ${ampm}`;
}

const IPDBookingPage: React.FC = () => {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    reset,
    watch,
    setValue,
  } = useForm<IPDFormInput>({
    // resolver: yupResolver(schema),
    defaultValues: {
      date: new Date(),
      time: formatAMPM(new Date()),
      gender: { label: 'Male', value: 'male' },
      bloodGroup: { label: 'A+', value: 'A+' },
      membershipType: { label: 'Regular', value: 'regular' },
      roomType: { label: 'Female Ward (5 Rooms)', value: 'female_ward' },
      bed: { label: 'Bed 1', value: 'bed_1' },
      doctor: { label: 'Select Doctor', value: '' },
      admissionType: { label: 'General', value: 'general' },
      age: 0,
      dateOfBirth: new Date(),
      amount: 0,
      paymentType: { label: 'Deposit', value: 'deposit' },
      paymentMode: { label: 'Cash', value: 'cash' },
      mobileNumber: '',
      referralDoctor: '',
    },
  });

  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<IPDFormInput | null>(null);
  const [doctors, setDoctors] = useState<{ label: string; value: string }[]>([]);
  const [beds, setBeds] = useState<{ label: string; value: string }[]>([]);
  const [selectedRoomType, setSelectedRoomType] = useState<{ label: string; value: string } | null>(null);

  useEffect(() => {
    const doctorsRef = ref(db, 'doctors');
    const unsubscribe = onValue(doctorsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const doctorsList = Object.keys(data).map(key => ({
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

  useEffect(() => {
    if (selectedRoomType) {
      const bedsRef = ref(db, `beds/${selectedRoomType.value}`);
      const unsubscribe = onValue(bedsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const bedsList = Object.keys(data)
            .filter(key => data[key].status === "Available")
            .map(key => ({
              label: `Bed ${data[key].bedNumber}`,
              value: key,
            }));
          setBeds(bedsList);
          if (bedsList.length > 0) {
            setValue('bed', bedsList[0]);
          } else {
            setValue('bed', { label: 'No Bed', value: '' });
          }
        } else {
          setBeds([]);
          setValue('bed', { label: 'No Bed', value: '' });
        }
      });
      return () => unsubscribe();
    } else {
      setBeds([]);
      setValue('bed', { label: 'No Bed', value: '' });
    }
  }, [selectedRoomType, setValue]);

  const dateOfBirth = watch('dateOfBirth');

  useEffect(() => {
    if (dateOfBirth) {
      const calculatedAge = calculateAge(dateOfBirth);
      setValue('age', calculatedAge);
    }
  }, [dateOfBirth, setValue]);

  const calculateAge = (dob: Date): number => {
    const diffMs = Date.now() - dob.getTime();
    const ageDate = new Date(diffMs);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
  };

  const onSubmit: SubmitHandler<IPDFormInput> = async (data) => {
    setLoading(true);
    try {
      if (data.bed && data.bed.value) {
        const bedRef = ref(db, `beds/${data.roomType.value}/${data.bed.value}`);
        await update(bedRef, { status: "Occupied" });
      }

      const admissionData = {
        name: data.name,
        gender: data.gender.value,
        dateOfBirth: data.dateOfBirth.toISOString(),
        age: data.age,
        bloodGroup: data.bloodGroup.value,
        date: data.date.toISOString(),
        time: data.time,
        mobileNumber: data.mobileNumber,
        emergencyMobileNumber: data.emergencyMobileNumber || '',
        membershipType: data.membershipType.value,
        roomType: data.roomType.value,
        bed: data.bed.value,
        doctor: data.doctor.value,
        referralDoctor: data.referralDoctor || '',
        admissionType: data.admissionType.value,
        amount: data.amount,
        paymentType: data.paymentType.value,
        paymentMode: data.paymentMode.value,
        totalPaid: data.paymentType.value === 'deposit' ? data.amount : 0,
        serviceAmount: 0,
        dischargeDate: '',
        createdAt: new Date().toISOString(),
      };

      const ipdRef = ref(db, 'ipd_bookings');
      const newIpdRef = push(ipdRef);
      await update(newIpdRef, admissionData);

      toast.success('IPD Admission booked successfully!', {
        position: "top-right",
        autoClose: 5000,
      });

      reset({
        date: new Date(),
        time: formatAMPM(new Date()),
        gender: { label: 'Male', value: 'male' },
        bloodGroup: { label: 'A+', value: 'A+' },
        membershipType: { label: 'Regular', value: 'regular' },
        roomType: { label: 'Female Ward (5 Rooms)', value: 'female_ward' },
        bed: { label: 'Bed 1', value: 'bed_1' },
        doctor: { label: 'Select Doctor', value: '' },
        admissionType: { label: 'General', value: 'general' },
        age: 0,
        dateOfBirth: new Date(),
        amount: 0,
        paymentType: { label: 'Deposit', value: 'deposit' },
        paymentMode: { label: 'Cash', value: 'cash' },
        mobileNumber: '',
        referralDoctor: '',
      });
      setPreviewData(null);
    } catch (error) {
      console.error('Error booking IPD admission:', error);
      toast.error('Failed to book IPD admission. Please try again.', {
        position: "top-right",
        autoClose: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = () => {
    setPreviewData(watch());
  };

  return (
    <>
      <Head>
        <title>IPD Admission Form</title>
        <meta name="description" content="Book your IPD admission easily" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ToastContainer />

      <main className="min-h-screen bg-gradient-to-r from-purple-100 to-pink-200 flex items-center justify-center p-6">
        <div className="w-full max-w-5xl bg-white rounded-3xl shadow-xl p-10">
          <h2 className="text-3xl font-bold text-center text-pink-600 mb-8">IPD Admission Form</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="relative">
              <AiOutlineUser className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                {...register('name')}
                placeholder="Full Name"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
              />
              {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-gray-700 mb-2">Gender</label>
              <Controller
                control={control}
                name="gender"
                render={({ field }) => (
                  <Select
                    {...field}
                    options={GenderOptions}
                    placeholder="Select Gender"
                    classNamePrefix="react-select"
                    className={`${errors.gender ? 'border-red-500' : 'border-gray-300'}`}
                    onChange={(value) => field.onChange(value)}
                    value={field.value}
                  />
                )}
              />
              {errors.gender && <p className="text-red-500 text-sm mt-1">{errors.gender.message}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="relative">
                <AiOutlineCalendar className="absolute top-3 left-3 text-gray-400" />
                <Controller
                  control={control}
                  name="dateOfBirth"
                  render={({ field }) => (
                    <DatePicker
                      selected={field.value}
                      onChange={(date: Date | null) => {
                        if (date) field.onChange(date);
                      }}
                      dateFormat="dd/MM/yyyy"
                      placeholderText="Select Date of Birth"
                      className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 ${
                        errors.dateOfBirth ? 'border-red-500' : 'border-gray-300'
                      } transition duration-200`}
                      showYearDropdown
                      scrollableYearDropdown
                      yearDropdownItemNumber={100}
                      maxDate={new Date()}
                    />
                  )}
                />
                {errors.dateOfBirth && <p className="text-red-500 text-sm mt-1">{errors.dateOfBirth.message}</p>}
              </div>

              <div className="relative">
                <AiOutlineInfoCircle className="absolute top-3 left-3 text-gray-400" />
                <input
                  type="number"
                  {...register('age')}
                  placeholder="Age"
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 ${
                    errors.age ? 'border-red-500' : 'border-gray-300'
                  } transition duration-200`}
                  readOnly
                />
                {errors.age && <p className="text-red-500 text-sm mt-1">{errors.age.message}</p>}
              </div>
            </div>

            <div>
              <label className="block text-gray-700 mb-2">Blood Group</label>
              <Controller
                control={control}
                name="bloodGroup"
                render={({ field }) => (
                  <Select
                    {...field}
                    options={BloodGroupOptions}
                    placeholder="Select Blood Group"
                    classNamePrefix="react-select"
                    className={`${errors.bloodGroup ? 'border-red-500' : 'border-gray-300'}`}
                    onChange={(value) => field.onChange(value)}
                    value={field.value}
                  />
                )}
              />
              {errors.bloodGroup && <p className="text-red-500 text-sm mt-1">{errors.bloodGroup.message}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="relative">
                <AiOutlineCalendar className="absolute top-3 left-3 text-gray-400" />
                <Controller
                  control={control}
                  name="date"
                  render={({ field }) => (
                    <DatePicker
                      selected={field.value}
                      onChange={(date: Date | null) => {
                        if (date) field.onChange(date);
                      }}
                      dateFormat="dd/MM/yyyy"
                      placeholderText="Select Date"
                      className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 ${
                        errors.date ? 'border-red-500' : 'border-gray-300'
                      } transition duration-200`}
                      maxDate={new Date()}
                    />
                  )}
                />
                {errors.date && <p className="text-red-500 text-sm mt-1">{errors.date.message}</p>}
              </div>

              <div className="relative">
                <AiOutlineClockCircle className="absolute top-3 left-3 text-gray-400" />
                <input
                  type="text"
                  {...register('time')}
                  placeholder="Time"
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 ${
                    errors.time ? 'border-red-500' : 'border-gray-300'
                  } transition duration-200`}
                  defaultValue={formatAMPM(new Date())}
                />
                {errors.time && <p className="text-red-500 text-sm mt-1">{errors.time.message}</p>}
              </div>
            </div>

            <div className="relative">
              <AiOutlinePhone className="absolute top-3 left-3 text-gray-400" />
              <input
                type="tel"
                {...register('mobileNumber')}
                placeholder="Mobile Number"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 ${
                  errors.mobileNumber ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
              />
              {errors.mobileNumber && <p className="text-red-500 text-sm mt-1">{errors.mobileNumber.message}</p>}
            </div>

            <div className="relative">
              <AiOutlinePhone className="absolute top-3 left-3 text-gray-400" />
              <input
                type="tel"
                {...register('emergencyMobileNumber')}
                placeholder="Emergency Mobile Number (Optional)"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 ${
                  errors.emergencyMobileNumber ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
              />
              {errors.emergencyMobileNumber && <p className="text-red-500 text-sm mt-1">{errors.emergencyMobileNumber.message}</p>}
            </div>

            <div>
              <label className="block text-gray-700 mb-2">Membership Type</label>
              <Controller
                control={control}
                name="membershipType"
                render={({ field }) => (
                  <Select
                    {...field}
                    options={MembershipTypeOptions}
                    placeholder="Select Membership Type"
                    classNamePrefix="react-select"
                    className={`${errors.membershipType ? 'border-red-500' : 'border-gray-300'}`}
                    onChange={(value) => field.onChange(value)}
                    value={field.value}
                  />
                )}
              />
              {errors.membershipType && <p className="text-red-500 text-sm mt-1">{errors.membershipType.message}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-gray-700 mb-2">Room Type</label>
                <Controller
                  control={control}
                  name="roomType"
                  render={({ field }) => (
                    <Select
                      {...field}
                      options={RoomTypeOptions}
                      placeholder="Select Room Type"
                      classNamePrefix="react-select"
                      className={`${errors.roomType ? 'border-red-500' : 'border-gray-300'}`}
                      onChange={(value) => {
                        field.onChange(value);
                        setSelectedRoomType(value);
                      }}
                      value={field.value}
                    />
                  )}
                />
                {errors.roomType && <p className="text-red-500 text-sm mt-1">{errors.roomType.message}</p>}
              </div>

              <div>
                <label className="block text-gray-700 mb-2">Select Bed</label>
                <Controller
                  control={control}
                  name="bed"
                  render={({ field }) => (
                    <Select
                      {...field}
                      options={beds}
                      placeholder={beds.length > 0 ? "Select Bed" : "No Beds Available"}
                      classNamePrefix="react-select"
                      className={`${errors.bed ? 'border-red-500' : 'border-gray-300'}`}
                      isDisabled={!selectedRoomType || beds.length === 0}
                      onChange={(value) => field.onChange(value)}
                      value={field.value}
                    />
                  )}
                />
                {errors.bed && <p className="text-red-500 text-sm mt-1">{errors.bed.message}</p>}
              </div>
            </div>

            <div>
              <label className="block text-gray-700 mb-2">Under Care of Doctor</label>
              <Controller
                control={control}
                name="doctor"
                render={({ field }) => (
                  <Select
                    {...field}
                    options={doctors}
                    placeholder="Select Doctor"
                    classNamePrefix="react-select"
                    className={`${errors.doctor ? 'border-red-500' : 'border-gray-300'}`}
                    onChange={(value) => field.onChange(value)}
                    value={field.value}
                  />
                )}
              />
              {errors.doctor && <p className="text-red-500 text-sm mt-1">{errors.doctor.message}</p>}
            </div>

            <div className="relative">
              <AiOutlineUser className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                {...register('referralDoctor')}
                placeholder="Referral Doctor (Optional)"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 ${
                  errors.referralDoctor ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
              />
              {errors.referralDoctor && <p className="text-red-500 text-sm mt-1">{errors.referralDoctor.message}</p>}
            </div>

            <div>
              <label className="block text-gray-700 mb-2">Admission Type</label>
              <Controller
                control={control}
                name="admissionType"
                render={({ field }) => (
                  <Select
                    {...field}
                    options={AdmissionTypes}
                    placeholder="Select Admission Type"
                    classNamePrefix="react-select"
                    className={`${errors.admissionType ? 'border-red-500' : 'border-gray-300'}`}
                    onChange={(value) => field.onChange(value)}
                    value={field.value}
                  />
                )}
              />
              {errors.admissionType && <p className="text-red-500 text-sm mt-1">{errors.admissionType.message}</p>}
            </div>

            <div className="relative">
              <AiOutlineInfoCircle className="absolute top-3 left-3 text-gray-400" />
              <input
                type="number"
                {...register('amount')}
                placeholder="Amount (Services)"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 ${
                  errors.amount ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
              />
              {errors.amount && <p className="text-red-500 text-sm mt-1">{errors.amount.message}</p>}
            </div>

            <div>
              <label className="block text-gray-700 mb-2">Payment Type</label>
              <Controller
                control={control}
                name="paymentType"
                render={({ field }) => (
                  <Select
                    {...field}
                    options={PaymentTypeOptions}
                    placeholder="Select Payment Type"
                    classNamePrefix="react-select"
                    className={`${errors.paymentType ? 'border-red-500' : 'border-gray-300'}`}
                    onChange={(value) => field.onChange(value)}
                    value={field.value}
                  />
                )}
              />
              {errors.paymentType && <p className="text-red-500 text-sm mt-1">{errors.paymentType.message}</p>}
            </div>

            <div>
              <label className="block text-gray-700 mb-2">Payment Mode</label>
              <Controller
                control={control}
                name="paymentMode"
                render={({ field }) => (
                  <Select
                    {...field}
                    options={PaymentModeOptions}
                    placeholder="Select Payment Mode"
                    classNamePrefix="react-select"
                    className={`${errors.paymentMode ? 'border-red-500' : 'border-gray-300'}`}
                    onChange={(value) => field.onChange(value)}
                    value={field.value}
                  />
                )}
              />
              {errors.paymentMode && <p className="text-red-500 text-sm mt-1">{errors.paymentMode.message}</p>}
            </div>

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
                  <h3 className="text-2xl font-semibold mb-4">Preview IPD Admission</h3>
                  <div className="space-y-2">
                    <p><strong>Full Name:</strong> {previewData.name}</p>
                    <p><strong>Gender:</strong> {previewData.gender.label}</p>
                    <p><strong>Date of Birth:</strong> {previewData.dateOfBirth.toLocaleDateString()}</p>
                    <p><strong>Age:</strong> {previewData.age}</p>
                    <p><strong>Blood Group:</strong> {previewData.bloodGroup.label}</p>
                    <p><strong>Date:</strong> {previewData.date.toLocaleDateString()}</p>
                    <p><strong>Time:</strong> {previewData.time}</p>
                    <p><strong>Mobile Number:</strong> {previewData.mobileNumber}</p>
                    {previewData.emergencyMobileNumber && <p><strong>Emergency Mobile Number:</strong> {previewData.emergencyMobileNumber}</p>}
                    <p><strong>Membership Type:</strong> {previewData.membershipType.label}</p>
                    <p><strong>Room Type:</strong> {previewData.roomType.label}</p>
                    <p><strong>Bed:</strong> {previewData.bed.label}</p>
                    <p><strong>Under Care of Doctor:</strong> {previewData.doctor.label}</p>
                    {previewData.referralDoctor && <p><strong>Referral Doctor:</strong> {previewData.referralDoctor}</p>}
                    <p><strong>Admission Type:</strong> {previewData.admissionType.label}</p>
                    <p><strong>Amount (Services):</strong> Rs. {previewData.amount}</p>
                    <p><strong>Payment Type:</strong> {previewData.paymentType.label}</p>
                    <p><strong>Payment Mode:</strong> {previewData.paymentMode.label}</p>
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
                      className={`px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition duration-200 ${
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

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-pink-500 ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loading ? 'Submitting...' : 'Submit Admission'}
            </button>
          </form>
        </div>
      </main>
    </>
  );
};

export default IPDBookingPage;
