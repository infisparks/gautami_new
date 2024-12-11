// app/opd/page.tsx

"use client";

import React, { useState, useEffect } from 'react';
import { useForm, SubmitHandler, Controller} from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { db } from '../../lib/firebase';
import { ref, push, update, get, onValue } from 'firebase/database';
import Head from 'next/head';
import { 
  AiOutlineUser, 
  AiOutlineMail, 
  AiOutlinePhone, 
  AiOutlineCalendar, 
  AiOutlineClockCircle, 
  AiOutlineMessage, 
  AiOutlineDollarCircle, 
  AiOutlineInfoCircle
} from 'react-icons/ai';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Select from 'react-select';

// Define the shape of your form inputs
interface IFormInput {
  name: string;
  email?: string;
  phone: string;
  date: Date;
  time: string;
  message?: string;
  paymentMethod: { label: string; value: string } | null;
  amount: number;
  serviceName: string;
  doctor: { label: string; value: string } | null;
}

// Define the validation schema using Yup
const schema = yup.object({
  name: yup.string().required('Name is required'),
  email: yup.string().email('Invalid email').notRequired(),
  phone: yup.string().matches(/^[0-9]{10}$/, 'Phone number must be 10 digits').required('Phone number is required'),
  date: yup.date().required('Date is required'),
  time: yup.string().required('Time is required'),
  message: yup.string().notRequired(),
  paymentMethod: yup.object({
    label: yup.string().required(),
    value: yup.string().required(),
  }).nullable().required('Payment method is required'),
  amount: yup.number().typeError('Amount must be a number').positive('Amount must be positive').required('Amount is required'),
  serviceName: yup.string().required('Service name is required'),
  doctor: yup.object({
    label: yup.string().required(),
    value: yup.string().required(),
  }).nullable().required('Doctor selection is required'),
}).required();

const PaymentOptions = [
  { value: 'cash', label: 'Cash' },
  { value: 'online', label: 'Online' },
];

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
    // resolver: yupResolver(schema),
    defaultValues: {
      date: new Date(),
      time: formatAMPM(new Date()),
      paymentMethod: null,
      amount: 0,
      message: '',
      email: '',
      doctor: null,
      serviceName: '',
    },
  });

  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<IFormInput | null>(null);
  const [doctors, setDoctors] = useState<{ label: string; value: string }[]>([]);
  // const [amountFetched, setAmountFetched] = useState<number>(0);

  // Fetch doctors from Firebase
  useEffect(() => {
    const doctorsRef = ref(db, 'doctors');
    const unsubscribe = onValue(doctorsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const doctorsList = Object.keys(data).map(key => ({
          label: data[key].name,
          value: key,
        }));
        // Add 'No Doctor' option
        doctorsList.unshift({ label: 'No Doctor', value: 'no_doctor' });
        setDoctors(doctorsList);
      } else {
        setDoctors([{ label: 'No Doctor', value: 'no_doctor' }]);
      }
    });

    return () => unsubscribe();
  }, []);

  // Watch doctor field to auto-fetch amount
  const selectedDoctor = watch('doctor');

  useEffect(() => {
    if (selectedDoctor) {
      if (selectedDoctor.value === 'no_doctor') {
        setValue('amount', 0);
        // setAmountFetched(0);
      } else {
        fetchDoctorAmount(selectedDoctor.value);
      }
    } else {
      setValue('amount', 0);
      // setAmountFetched(0);
    }
  }, [selectedDoctor, setValue]);

  const fetchDoctorAmount = async (doctorId: string) => {
    try {
      const doctorRef = ref(db, `doctors/${doctorId}`);
      const snapshot = await get(doctorRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
        // setAmountFetched(data.amount);
        setValue('amount', data.amount);
      } else {
        // setAmountFetched(0);
        setValue('amount', 0);
      }
    } catch (error) {
      console.error('Error fetching doctor amount:', error);
      // setAmountFetched(0);
      setValue('amount', 0);
    }
  };

  const onSubmit: SubmitHandler<IFormInput> = async (data) => {
    setLoading(true);
    try {
      const appointmentData = {
        name: data.name,
        email: data.email || '',
        phone: data.phone,
        date: data.date.toISOString(),
        time: data.time,
        message: data.message || '',
        paymentMethod: data.paymentMethod?.value || '',
        amount: data.amount,
        serviceName: data.serviceName,
        doctor: data.doctor?.value || 'no_doctor',
        createdAt: new Date().toISOString(),
      };

      const bookingsRef = ref(db, 'bookings');
      const newBookingRef = push(bookingsRef);
      await update(newBookingRef, appointmentData);

      toast.success('Appointment booked successfully!', {
        position: "top-right",
        autoClose: 5000,
      });

      reset({
        date: new Date(),
        time: formatAMPM(new Date()),
        paymentMethod: null,
        amount: 0,
        message: '',
        email: '',
        doctor: null,
        serviceName: '',
      });
      setPreviewData(null);
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

  // Function to format time to 12-hour format with AM/PM
  function formatAMPM(date: Date): string {
    let hours = date.getHours();
    let minutes: string | number = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    minutes = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${minutes} ${ampm}`;
  }

  // Handle form preview
  const handlePreview = () => {
    setPreviewData(watch());
  };

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
          <h2 className="text-3xl font-bold text-center text-teal-600 mb-8">Book an Appointment</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* User Name Field */}
            <div className="relative">
              <AiOutlineUser className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                {...register('name')}
                placeholder="Name"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
              />
              {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>}
            </div>

            {/* Email Field */}
            <div className="relative">
              <AiOutlineMail className="absolute top-3 left-3 text-gray-400" />
              <input
                type="email"
                {...register('email')}
                placeholder="Email (Optional)"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  errors.email ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
              />
              {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
            </div>

            {/* Phone Number Field */}
            <div className="relative">
              <AiOutlinePhone className="absolute top-3 left-3 text-gray-400" />
              <input
                type="tel"
                {...register('phone')}
                placeholder="Phone Number"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  errors.phone ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
              />
              {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone.message}</p>}
            </div>

            {/* Date Field */}
            <div className="relative">
              <AiOutlineCalendar className="absolute top-3 left-3 text-gray-400" />
              <Controller
                control={control}
                name="date"
                render={({ field }) => (
                  <DatePicker
                    selected={field.value}
                    onChange={(date: Date | null) => date && field.onChange(date)}
                    dateFormat="dd/MM/yyyy"
                    placeholderText="Select Date"
                    className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                      errors.date ? 'border-red-500' : 'border-gray-300'
                    } transition duration-200`}
                  />
                )}
              />
              {errors.date && <p className="text-red-500 text-sm mt-1">{errors.date.message}</p>}
            </div>

            {/* Time Field */}
            <div className="relative">
              <AiOutlineClockCircle className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                {...register('time')}
                placeholder="Time"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  errors.time ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
                defaultValue={formatAMPM(new Date())}
              />
              {errors.time && <p className="text-red-500 text-sm mt-1">{errors.time.message}</p>}
            </div>

            {/* Message Field */}
            <div className="relative">
              <AiOutlineMessage className="absolute top-3 left-3 text-gray-400" />
              <textarea
                {...register('message')}
                placeholder="Message (Optional)"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  errors.message ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
                rows={3}
              ></textarea>
              {errors.message && <p className="text-red-500 text-sm mt-1">{errors.message.message}</p>}
            </div>

            {/* Payment Method Field */}
            <div>
              <label className="block text-gray-700 mb-2">Payment Method</label>
              <Controller
                control={control}
                name="paymentMethod"
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
              {errors.paymentMethod && <p className="text-red-500 text-sm mt-1">{errors.paymentMethod.message}</p>}
            </div>

            {/* Amount Field */}
            <div className="relative">
              <AiOutlineDollarCircle className="absolute top-3 left-3 text-gray-400" />
              <input
                type="number"
                {...register('amount')}
                placeholder="Amount (Rs)"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  errors.amount ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
                min="0"
              />
              {errors.amount && <p className="text-red-500 text-sm mt-1">{errors.amount.message}</p>}
            </div>

            {/* Service Name Field */}
            <div className="relative">
              <AiOutlineInfoCircle className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                {...register('serviceName')}
                placeholder="Service Name"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  errors.serviceName ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
              />
              {errors.serviceName && <p className="text-red-500 text-sm mt-1">{errors.serviceName.message}</p>}
            </div>

            {/* Doctor Selection Field */}
            <div>
              <label className="block text-gray-700 mb-2">Select Doctor</label>
              <Controller
                control={control}
                name="doctor"
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
                  />
                )}
              />
              {errors.doctor && <p className="text-red-500 text-sm mt-1">{errors.doctor.message}</p>}
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
                  <h3 className="text-2xl font-semibold mb-4">Preview Appointment</h3>
                  <div className="space-y-2">
                    <p><strong>Name:</strong> {previewData.name}</p>
                    {previewData.email && <p><strong>Email:</strong> {previewData.email}</p>}
                    <p><strong>Phone:</strong> {previewData.phone}</p>
                    <p><strong>Date:</strong> {previewData.date.toLocaleDateString()}</p>
                    <p><strong>Time:</strong> {previewData.time}</p>
                    {previewData.message && <p><strong>Message:</strong> {previewData.message}</p>}
                    <p><strong>Payment Method:</strong> {previewData.paymentMethod?.label}</p>
                    <p><strong>Amount:</strong> Rs {previewData.amount}</p>
                    <p><strong>Service Name:</strong> {previewData.serviceName}</p>
                    <p><strong>Doctor:</strong> {previewData.doctor?.label}</p>
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
