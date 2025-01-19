"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useForm, SubmitHandler, Controller } from 'react-hook-form';
import { db } from '../../lib/firebase';
import { ref, push, update, get, onValue } from 'firebase/database';
import Head from 'next/head';
import { 
  FaUser, 
  FaEnvelope, 
  FaPhone, 
  FaCalendarAlt, 
  FaClock, 
  FaRegCommentDots, 
  FaDollarSign, 
  FaInfoCircle,
  FaMicrophone,
  FaMicrophoneSlash
} from 'react-icons/fa';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Select, { ActionMeta, SingleValue } from 'react-select';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';

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

const PaymentOptions = [
  { value: 'cash', label: 'Cash' },
  { value: 'online', label: 'Online' },
];

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
  const [listening, setListening] = useState(false);
  const [doctorMenuIsOpen, setDoctorMenuIsOpen] = useState(false); // State to control dropdown
  const doctorSelectRef = useRef<any>(null); // Reference to the doctor Select component

  // Define voice commands with alternative phrases
  const commands = [
    // Name Commands
    {
      command: 'name *',
      callback: (name: string) => {
        const trimmedName = name.trim().replace(/\s+/g, ' ');
        setValue('name', trimmedName, { shouldValidate: true });
        toast.info(`Name set to: ${trimmedName}`);
      },
    },
    {
      command: 'mera naam *',
      callback: (name: string) => {
        const trimmedName = name.trim().replace(/\s+/g, ' ');
        setValue('name', trimmedName, { shouldValidate: true });
        toast.info(`Name set to: ${trimmedName}`);
      },
    },
    {
      command: 'my name *',
      callback: (name: string) => {
        const trimmedName = name.trim().replace(/\s+/g, ' ');
        setValue('name', trimmedName, { shouldValidate: true });
        toast.info(`Name set to: ${trimmedName}`);
      },
    },

    // Email Commands
    {
      command: 'email *',
      callback: (email: string) => {
        const trimmedEmail = email.trim().replace(/\s+/g, '');
        setValue('email', trimmedEmail, { shouldValidate: true });
        toast.info(`Email set to: ${trimmedEmail}`);
      },
    },
    {
      command: 'mera email *',
      callback: (email: string) => {
        const trimmedEmail = email.trim().replace(/\s+/g, '');
        setValue('email', trimmedEmail, { shouldValidate: true });
        toast.info(`Email set to: ${trimmedEmail}`);
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

    // Date Commands
    {
      command: 'Set date to *',
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
      command: 'Set time to *',
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
        toast.info(`Message set.`);
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

        // Attempt to handle minor spelling mistakes by using partial matching
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
          setDoctorMenuIsOpen(false); // Close the dropdown after selection
          toast.info(`Doctor set to: ${selectedDoctor.label}`);
        } else {
          toast.error(`Doctor "${doctorName}" not found.`);
        }
      },
    },
    // Additional doctor commands to handle common misspellings
    {
      command: 'select doctor number *',
      callback: (doctorNumber: string) => {
        // Assuming each doctor has a unique number, this can be implemented if such data exists
        // For now, we'll notify that this feature is not implemented
        toast.error('Selecting doctor by number is not implemented.');
      },
    },

    // Preview Command
    {
      command: 'preview',
      callback: () => {
        handlePreview();
        toast.info('Form previewed.');
      },
    },

    // Cancel Preview Command
    {
      command: 'cancel',
      callback: () => {
        setPreviewData(null);
        toast.info('Preview canceled.');
      },
    },

    // Submit Command
    {
      command: 'submit',
      callback: () => {
        handleSubmit(onSubmit)();
      },
    },
  ];

  // Initialize Speech Recognition with commands
  const {
    transcript,
    resetTranscript,
    browserSupportsSpeechRecognition,
    listening: micListening,
  } = useSpeechRecognition({ commands });

  // Start listening automatically if desired
  useEffect(() => {
    if (browserSupportsSpeechRecognition) {
      // Optionally start listening automatically
      // SpeechRecognition.startListening({ continuous: true });
    } else {
      toast.error('Browser does not support speech recognition.');
    }
  }, [browserSupportsSpeechRecognition]);

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

  const fetchDoctorAmount = useCallback(async (doctorId: string) => {
    try {
      const doctorRef = ref(db, `doctors/${doctorId}`);
      const snapshot = await get(doctorRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
        setValue('amount', data.amount);
      } else {
        setValue('amount', 0);
      }
    } catch (error) {
      console.error('Error fetching doctor amount:', error);
      setValue('amount', 0);
    }
  }, [setValue]);

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
      resetTranscript();
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

  // Handle form preview
  const handlePreview = () => {
    setPreviewData(watch());
  };

  // Start/Stop Listening
  const toggleListening = () => {
    if (micListening) {
      SpeechRecognition.stopListening();
      setListening(false);
      toast.info('Voice recognition stopped.');
    } else {
      if (browserSupportsSpeechRecognition) {
        SpeechRecognition.startListening({ continuous: true });
        setListening(true);
        toast.info('Voice recognition started.');
      } else {
        toast.error('Browser does not support speech recognition.');
      }
    }
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
          
          {/* Voice Control Buttons */}
          <div className="flex justify-center mb-6 space-x-4">
            <button
              type="button"
              onClick={toggleListening}
              className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {micListening ? <FaMicrophoneSlash className="mr-2" /> : <FaMicrophone className="mr-2" />}
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
            {/* Name Field */}
            <div className="relative">
              <FaUser className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                {...register('name', { required: 'Name is required' })}
                placeholder="Name"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
              />
              {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>}
            </div>

            {/* Email Field */}
            <div className="relative">
              <FaEnvelope className="absolute top-3 left-3 text-gray-400" />
              <input
                type="email"
                {...register('email', { pattern: { value: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: 'Invalid email' } })}
                placeholder="Email (Optional)"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  errors.email ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
              />
              {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
            </div>

            {/* Phone Field */}
            <div className="relative">
              <FaPhone className="absolute top-3 left-3 text-gray-400" />
              <input
                type="tel"
                {...register('phone', {
                  required: 'Phone number is required',
                  pattern: { value: /^[0-9]{10}$/, message: 'Phone number must be 10 digits' }
                })}
                placeholder="Phone Number"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  errors.phone ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
              />
              {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone.message}</p>}
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
              {errors.time && <p className="text-red-500 text-sm mt-1">{errors.time.message}</p>}
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
              {errors.message && <p className="text-red-500 text-sm mt-1">{errors.message.message}</p>}
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
                    className={`${errors.paymentMethod ? 'border-red-500' : 'border-gray-300'}`}
                    onChange={(value) => field.onChange(value)}
                  />
                )}
              />
              {errors.paymentMethod && <p className="text-red-500 text-sm mt-1">{errors.paymentMethod.message}</p>}
            </div>

            {/* Amount Field */}
            <div className="relative">
              <FaDollarSign className="absolute top-3 left-3 text-gray-400" />
              <input
                type="number"
                {...register('amount', { 
                  required: 'Amount is required',
                  min: { value: 0, message: 'Amount must be positive' } 
                })}
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
              <FaInfoCircle className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                {...register('serviceName', { required: 'Service name is required' })}
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
                rules={{ required: 'Doctor selection is required' }}
                render={({ field }) => (
                  <Select
                    {...field}
                    options={doctors}
                    placeholder="Select Doctor or No Doctor"
                    classNamePrefix="react-select"
                    className={`${errors.doctor ? 'border-red-500' : 'border-gray-300'}`}
                    isClearable
                    onChange={(value) => field.onChange(value)}
                    menuIsOpen={doctorMenuIsOpen}
                    onMenuClose={() => setDoctorMenuIsOpen(false)}
                    onMenuOpen={() => setDoctorMenuIsOpen(true)}
                    ref={doctorSelectRef}
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
