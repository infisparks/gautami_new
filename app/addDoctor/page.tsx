// app/admin/doctors/page.tsx

"use client";

import React, { useState, useEffect } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { db } from '../../lib/firebase';
import { ref, push, update, onValue, remove } from 'firebase/database';
import Head from 'next/head';
import { AiOutlineUser, AiOutlineDollarCircle, AiOutlineDelete } from 'react-icons/ai';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Define the shape of your form inputs
interface IDoctorFormInput {
  name: string;
  amount: number;
}

// Define the validation schema using Yup
const doctorSchema = yup.object({
  name: yup.string().required('Doctor name is required'),
  amount: yup.number().typeError('Amount must be a number').positive('Amount must be positive').required('Amount is required'),
}).required();

interface IDoctor {
  id: string;
  name: string;
  amount: number;
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
    },
  });

  const [loading, setLoading] = useState(false);
  const [doctors, setDoctors] = useState<IDoctor[]>([]);

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
      });

      toast.success('Doctor added successfully!', {
        position: "top-right",
        autoClose: 5000,
      });

      reset({
        name: '',
        amount: 0,
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
                  <li key={doctor.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="text-lg font-medium">{doctor.name}</p>
                      <p className="text-gray-600">Amount: Rs {doctor.amount}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(doctor.id)}
                      className="flex items-center justify-center bg-red-600 text-white p-2 rounded-lg hover:bg-red-700 transition duration-200"
                    >
                      <AiOutlineDelete size={20} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </>
  );
};

export default AdminDoctorsPage;
