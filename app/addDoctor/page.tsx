// app/admin/doctors/page.tsx

"use client";

import React, { useState, useEffect } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { db } from '../../lib/firebase';
import { ref, push, update, onValue, remove } from 'firebase/database';
import Head from 'next/head';
import { AiOutlineUser, AiOutlineDollarCircle, AiOutlineDelete, AiOutlineEdit } from 'react-icons/ai';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Define the shape of your form inputs
interface IDoctorFormInput {
  name: string;
  amount: number;
  specialist: string;
  department: 'OPD' | 'IPD' | 'Both';
}

// Define the validation schema using Yup
const doctorSchema = yup.object({
  name: yup.string().required('Doctor name is required'),
  amount: yup
    .number()
    .typeError('Amount must be a number')
    .positive('Amount must be positive')
    .required('Amount is required'),
  specialist: yup.string().required('Specialist is required'),
  department: yup
    .mixed<'OPD' | 'IPD' | 'Both'>()
    .oneOf(['OPD', 'IPD', 'Both'], 'Select a valid department')
    .required('Department is required'),
}).required();

interface IDoctor {
  id: string;
  name: string;
  amount: number;
  specialist: string;
  department: 'OPD' | 'IPD' | 'Both';
}

const AdminDoctorsPage: React.FC = () => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<IDoctorFormInput>({
    resolver: yupResolver(doctorSchema),
    defaultValues: {
      name: '',
      amount: 0,
      specialist: '',
      department: 'OPD',
    },
  });

  const [loading, setLoading] = useState(false);
  const [doctors, setDoctors] = useState<IDoctor[]>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentDoctor, setCurrentDoctor] = useState<IDoctor | null>(null);

  // Fetch doctors from Firebase
  useEffect(() => {
    const doctorsRef = ref(db, 'doctors');
    const unsubscribe = onValue(doctorsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const doctorsList: IDoctor[] = Object.keys(data).map(key => ({
          id: key,
          name: data[key].name,
          amount: data[key].amount,
          specialist: data[key].specialist,
          department: data[key].department,
        }));
        setDoctors(doctorsList);
      } else {
        setDoctors([]);
      }
    });

    return () => unsubscribe();
  }, []);

  const onSubmit: SubmitHandler<IDoctorFormInput> = async (data) => {
    setLoading(true);
    try {
      const doctorsRef = ref(db, 'doctors');
      const newDoctorRef = push(doctorsRef);
      await update(newDoctorRef, {
        name: data.name,
        amount: data.amount,
        specialist: data.specialist,
        department: data.department,
      });

      toast.success('Doctor added successfully!', {
        position: "top-right",
        autoClose: 5000,
      });

      reset({
        name: '',
        amount: 0,
        specialist: '',
        department: 'OPD',
      });
    } catch (error) {
      console.error('Error adding doctor:', error);
      toast.error('Failed to add doctor. Please try again.', {
        position: "top-right",
        autoClose: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (doctorId: string) => {
    if (confirm('Are you sure you want to delete this doctor?')) {
      try {
        const doctorRef = ref(db, `doctors/${doctorId}`);
        await remove(doctorRef);
        toast.success('Doctor deleted successfully!', {
          position: "top-right",
          autoClose: 5000,
        });
      } catch (error) {
        console.error('Error deleting doctor:', error);
        toast.error('Failed to delete doctor. Please try again.', {
          position: "top-right",
          autoClose: 5000,
        });
      }
    }
  };

  const openEditModal = (doctor: IDoctor) => {
    setCurrentDoctor(doctor);
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setCurrentDoctor(null);
    setIsEditModalOpen(false);
  };

  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    formState: { errors: errorsEdit },
    // reset: resetEdit,
  } = useForm<IDoctorFormInput>({
    resolver: yupResolver(doctorSchema),
    defaultValues: {
      name: '',
      amount: 0,
      specialist: '',
      department: 'OPD',
    },
  });

  const onEditSubmit: SubmitHandler<IDoctorFormInput> = async (data) => {
    if (!currentDoctor) return;

    setLoading(true);
    try {
      const doctorRef = ref(db, `doctors/${currentDoctor.id}`);
      await update(doctorRef, {
        name: data.name,
        amount: data.amount,
        specialist: data.specialist,
        department: data.department,
      });

      toast.success('Doctor updated successfully!', {
        position: "top-right",
        autoClose: 5000,
      });

      closeEditModal();
    } catch (error) {
      console.error('Error updating doctor:', error);
      toast.error('Failed to update doctor. Please try again.', {
        position: "top-right",
        autoClose: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  // Define available specialists (you can modify this list as needed)
  const specialists = [
    'Cardiology',
    'Neurology',
    'Orthopedics',
    'Pediatrics',
    'Dermatology',
    'Oncology',
    'Psychiatry',
    'Gastroenterology',
    'Ophthalmology',
    'Radiology',
    // Add more specialties as required
  ];

  return (
    <>
      <Head>
        <title>Admin - Manage Doctors</title>
        <meta name="description" content="Add or remove doctors" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ToastContainer />

      <main className="min-h-screen bg-gradient-to-r from-yellow-100 to-yellow-200 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl bg-white rounded-3xl shadow-xl p-10">
          <h2 className="text-3xl font-bold text-center text-yellow-600 mb-8">Manage Doctors</h2>
          
          {/* Add Doctor Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mb-10">
            {/* Doctor Name Field */}
            <div className="relative">
              <AiOutlineUser className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                {...register('name')}
                placeholder="Doctor Name"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
              />
              {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>}
            </div>

            {/* Amount Field */}
            <div className="relative">
              <AiOutlineDollarCircle className="absolute top-3 left-3 text-gray-400" />
              <input
                type="number"
                {...register('amount')}
                placeholder="Amount (Rs)"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                  errors.amount ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
                min="0"
              />
              {errors.amount && <p className="text-red-500 text-sm mt-1">{errors.amount.message}</p>}
            </div>

            {/* Specialist Field */}
            <div className="relative">
              <select
                {...register('specialist')}
                className={`w-full pl-3 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                  errors.specialist ? 'border-red-500' : 'border-gray-300'
                } transition duration-200 appearance-none bg-white`}
              >
                <option value="">Select Specialist</option>
                {specialists.map((spec) => (
                  <option key={spec} value={spec}>{spec}</option>
                ))}
              </select>
              {errors.specialist && <p className="text-red-500 text-sm mt-1">{errors.specialist.message}</p>}
              {/* Add a down arrow icon */}
              <svg
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                width={20}
                height={20}
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {/* Department Field */}
            <div className="relative">
              <select
                {...register('department')}
                className={`w-full pl-3 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                  errors.department ? 'border-red-500' : 'border-gray-300'
                } transition duration-200 appearance-none bg-white`}
              >
                <option value="OPD">OPD</option>
                <option value="IPD">IPD</option>
                <option value="Both">Both</option>
              </select>
              {errors.department && <p className="text-red-500 text-sm mt-1">{errors.department.message}</p>}
              {/* Add a down arrow icon */}
              <svg
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                width={20}
                height={20}
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loading ? 'Adding...' : 'Add Doctor'}
            </button>
          </form>

          {/* Doctors List */}
          <div>
            <h3 className="text-2xl font-semibold text-gray-700 mb-4">Existing Doctors</h3>
            {doctors.length === 0 ? (
              <p className="text-gray-500">No doctors available.</p>
            ) : (
              <ul className="space-y-4">
                {doctors.map(doctor => (
                  <li key={doctor.id} className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <p className="text-lg font-medium">{doctor.name}</p>
                      <p className="text-gray-600">Amount: Rs {doctor.amount}</p>
                      <p className="text-gray-600">Specialist: {doctor.specialist}</p>
                      <p className="text-gray-600">Department: {doctor.department}</p>
                    </div>
                    <div className="flex space-x-2 mt-4 md:mt-0">
                      {/* Edit Button */}
                      <button
                        type="button"
                        onClick={() => openEditModal(doctor)}
                        className="flex items-center justify-center bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition duration-200"
                      >
                        <AiOutlineEdit size={20} />
                      </button>
                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => handleDelete(doctor.id)}
                        className="flex items-center justify-center bg-red-600 text-white p-2 rounded-lg hover:bg-red-700 transition duration-200"
                      >
                        <AiOutlineDelete size={20} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Edit Modal */}
        {isEditModalOpen && currentDoctor && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-3xl shadow-xl p-10 w-full max-w-lg relative">
              <h2 className="text-2xl font-bold text-center text-blue-600 mb-6">Edit Doctor</h2>
              <form onSubmit={handleSubmitEdit(onEditSubmit)} className="space-y-6">
                {/* Doctor Name Field */}
                <div className="relative">
                  <AiOutlineUser className="absolute top-3 left-3 text-gray-400" />
                  <input
                    type="text"
                    {...registerEdit('name')}
                    placeholder="Doctor Name"
                    defaultValue={currentDoctor.name}
                    className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errorsEdit.name ? 'border-red-500' : 'border-gray-300'
                    } transition duration-200`}
                  />
                  {errorsEdit.name && <p className="text-red-500 text-sm mt-1">{errorsEdit.name.message}</p>}
                </div>

                {/* Amount Field */}
                <div className="relative">
                  <AiOutlineDollarCircle className="absolute top-3 left-3 text-gray-400" />
                  <input
                    type="number"
                    {...registerEdit('amount')}
                    placeholder="Amount (Rs)"
                    defaultValue={currentDoctor.amount}
                    className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errorsEdit.amount ? 'border-red-500' : 'border-gray-300'
                    } transition duration-200`}
                    min="0"
                  />
                  {errorsEdit.amount && <p className="text-red-500 text-sm mt-1">{errorsEdit.amount.message}</p>}
                </div>

                {/* Specialist Field */}
                <div className="relative">
                  <select
                    {...registerEdit('specialist')}
                    defaultValue={currentDoctor.specialist}
                    className={`w-full pl-3 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errorsEdit.specialist ? 'border-red-500' : 'border-gray-300'
                    } transition duration-200 appearance-none bg-white`}
                  >
                    <option value="">Select Specialist</option>
                    {specialists.map((spec) => (
                      <option key={spec} value={spec}>{spec}</option>
                    ))}
                  </select>
                  {errorsEdit.specialist && <p className="text-red-500 text-sm mt-1">{errorsEdit.specialist.message}</p>}
                  {/* Add a down arrow icon */}
                  <svg
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    width={20}
                    height={20}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Department Field */}
                <div className="relative">
                  <select
                    {...registerEdit('department')}
                    defaultValue={currentDoctor.department}
                    className={`w-full pl-3 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errorsEdit.department ? 'border-red-500' : 'border-gray-300'
                    } transition duration-200 appearance-none bg-white`}
                  >
                    <option value="OPD">OPD</option>
                    <option value="IPD">IPD</option>
                    <option value="Both">Both</option>
                  </select>
                  {errorsEdit.department && <p className="text-red-500 text-sm mt-1">{errorsEdit.department.message}</p>}
                  {/* Add a down arrow icon */}
                  <svg
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    width={20}
                    height={20}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    loading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {loading ? 'Updating...' : 'Update Doctor'}
                </button>

                {/* Cancel Button */}
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="w-full py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </>
  );
};

export default AdminDoctorsPage;
