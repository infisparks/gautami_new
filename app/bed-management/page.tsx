"use client";

import React, { useState, useEffect } from 'react';
import { useForm, SubmitHandler, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { db } from '../../lib/firebase';
import { ref, push, update, onValue, remove } from 'firebase/database';
import Head from 'next/head';
import {
  AiOutlinePlus,
  AiOutlineEdit,
  AiOutlineDelete,
  AiOutlineCheckCircle,
  AiOutlineCloseCircle,
  AiOutlineUser,
  AiOutlineInfoCircle,
} from 'react-icons/ai';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Select from 'react-select';
import { SchemaOf } from 'yup';

// Define the shape of your form inputs
interface BedFormInput {
  roomType: { label: string; value: string } | null;
  bedNumber: string;
  type: string;
  status: { label: string; value: string } | null;
}

// Define the validation schema using Yup
const bedSchema: SchemaOf<BedFormInput> = yup.object({
  roomType: yup
    .object({
      label: yup.string().required(),
      value: yup.string().required(),
    })
    .nullable()
    .required('Room Type is required'),
  bedNumber: yup.string().required('Bed Number is required'),
  type: yup.string().required('Bed Type is required'),
  status: yup
    .object({
      label: yup.string().required(),
      value: yup.string().required(),
    })
    .nullable()
    .required('Status is required'),
}).required();

const RoomTypeOptions = [
  { value: 'female_ward', label: 'Female Ward' },
  { value: 'icu', label: 'ICU' },
  { value: 'male_ward', label: 'Male Ward' },
  { value: 'deluxe', label: 'Deluxe' },
  { value: 'nicu', label: 'NICU' },
];

const StatusOptions = [
  { value: 'Available', label: 'Available' },
  { value: 'Occupied', label: 'Occupied' },
];

interface Bed {
  id: string;
  bedNumber: string;
  type: string;
  status: string;
}

interface RoomType {
  roomName: string;
  beds: Bed[];
}

const BedManagementPage: React.FC = () => {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    reset,
  } = useForm<BedFormInput>({
    resolver: yupResolver(bedSchema),
    defaultValues: {
      roomType: null,
      bedNumber: '',
      type: '',
      status: null,
    },
  });

  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingBed, setEditingBed] = useState<{ roomType: string; bedId: string; data: Bed } | null>(null);

  // Fetch beds from Firebase
  useEffect(() => {
    const bedsRef = ref(db, 'beds');
    const unsubscribe = onValue(bedsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const roomTypesList: RoomType[] = Object.keys(data).map((roomKey) => ({
          roomName: roomKey.replace('_', ' ').toUpperCase(),
          beds: Object.keys(data[roomKey]).map((bedKey) => ({
            id: bedKey,
            bedNumber: data[roomKey][bedKey].bedNumber,
            type: data[roomKey][bedKey].type,
            status: data[roomKey][bedKey].status,
          })),
        }));
        setRoomTypes(roomTypesList);
      } else {
        setRoomTypes([]);
      }
    });

    return () => unsubscribe();
  }, []);

  const onSubmit: SubmitHandler<BedFormInput> = async (data) => {
    setLoading(true);
    try {
      if (editingBed) {
        // Update existing bed
        const bedRef = ref(db, `beds/${editingBed.roomType}/${editingBed.bedId}`);
        await update(bedRef, {
          bedNumber: data.bedNumber,
          type: data.type,
          status: data.status?.value,
        });
        toast.success('Bed updated successfully!', {
          position: 'top-right',
          autoClose: 5000,
        });
        setEditingBed(null);
      } else {
        // Add new bed
        if (data.roomType) {
          const bedsRef = ref(db, `beds/${data.roomType.value}`);
          const newBedRef = push(bedsRef);
          await update(newBedRef, {
            bedNumber: data.bedNumber,
            type: data.type,
            status: data.status?.value,
          });
          toast.success('Bed added successfully!', {
            position: 'top-right',
            autoClose: 5000,
          });
        }
      }
      reset({
        roomType: null,
        bedNumber: '',
        type: '',
        status: null,
      });
    } catch (error) {
      console.error('Error managing bed:', error);
      toast.error('Failed to manage bed. Please try again.', {
        position: 'top-right',
        autoClose: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (roomType: string, bed: Bed) => {
    setEditingBed({ roomType, bedId: bed.id, data: bed });
    reset({
      roomType: RoomTypeOptions.find((rt) => rt.value === roomType) || null,
      bedNumber: bed.bedNumber,
      type: bed.type,
      status: StatusOptions.find((status) => status.value === bed.status) || null,
    });
  };

  const handleDelete = async (roomType: string, bedId: string) => {
    if (confirm('Are you sure you want to delete this bed?')) {
      try {
        const bedRef = ref(db, `beds/${roomType}/${bedId}`);
        await remove(bedRef);
        toast.success('Bed deleted successfully!', {
          position: 'top-right',
          autoClose: 5000,
        });
      } catch (error) {
        console.error('Error deleting bed:', error);
        toast.error('Failed to delete bed. Please try again.', {
          position: 'top-right',
          autoClose: 5000,
        });
      }
    }
  };

  return (
    <>
      <Head>
        <title>IPD Bed Management</title>
        <meta name="description" content="Add and manage beds for IPD admissions" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ToastContainer />

      <main className="min-h-screen bg-gradient-to-r from-green-100 to-teal-200 flex flex-col items-center justify-start p-6">
        {/* Bed Management Form */}
        <div className="w-full max-w-6xl bg-white rounded-3xl shadow-xl p-10 mb-10">
          <h2 className="text-3xl font-bold text-center text-teal-600 mb-8">IPD Bed Management</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Room Type Field */}
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
                    className={`${
                      errors.roomType ? 'border-red-500' : 'border-gray-300'
                    }`}
                    isDisabled={!!editingBed} // Disable room type selection when editing
                    onChange={(value) => field.onChange(value)}
                  />
                )}
              />
              {errors.roomType && <p className="text-red-500 text-sm mt-1">{errors.roomType.message}</p>}
            </div>

            {/* Bed Number Field */}
            <div className="relative">
              <AiOutlineUser className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                {...register('bedNumber')}
                placeholder="Bed Number"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  errors.bedNumber ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
              />
              {errors.bedNumber && <p className="text-red-500 text-sm mt-1">{errors.bedNumber.message}</p>}
            </div>

            {/* Bed Type Field */}
            <div className="relative">
              <AiOutlineInfoCircle className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                {...register('type')}
                placeholder="Bed Type (e.g., Standard, ICU)"
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  errors.type ? 'border-red-500' : 'border-gray-300'
                } transition duration-200`}
              />
              {errors.type && <p className="text-red-500 text-sm mt-1">{errors.type.message}</p>}
            </div>

            {/* Status Field */}
            <div>
              <label className="block text-gray-700 mb-2">Status</label>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select
                    {...field}
                    options={StatusOptions}
                    placeholder="Select Status"
                    classNamePrefix="react-select"
                    className={`${
                      errors.status ? 'border-red-500' : 'border-gray-300'
                    }`}
                    onChange={(value) => field.onChange(value)}
                  />
                )}
              />
              {errors.status && <p className="text-red-500 text-sm mt-1">{errors.status.message}</p>}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition duration-200 flex items-center justify-center ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loading
                ? 'Processing...'
                : editingBed
                ? (
                  <>
                    <AiOutlineEdit className="mr-2" />
                    Update Bed
                  </>
                )
                : (
                  <>
                    <AiOutlinePlus className="mr-2" />
                    Add Bed
                  </>
                )}
            </button>
          </form>
        </div>

        {/* Existing Beds Table */}
        <div className="w-full max-w-6xl bg-white rounded-3xl shadow-xl p-10">
          <h3 className="text-2xl font-semibold text-center text-teal-600 mb-6">Existing Beds</h3>
          {roomTypes.length === 0 ? (
            <p className="text-gray-500">No beds available.</p>
          ) : (
            <div className="space-y-8">
              {roomTypes.map((room, index) => (
                <div key={index}>
                  <h4 className="text-xl font-medium text-gray-700 mb-4">{room.roomName}</h4>
                  <table className="w-full table-auto border-collapse">
                    <thead>
                      <tr>
                        <th className="border px-4 py-2">Bed Number</th>
                        <th className="border px-4 py-2">Type</th>
                        <th className="border px-4 py-2">Status</th>
                        <th className="border px-4 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {room.beds.map((bed, bedIndex) => (
                        <tr key={bedIndex} className="text-center">
                          <td className="border px-4 py-2">{bed.bedNumber}</td>
                          <td className="border px-4 py-2">{bed.type}</td>
                          <td className="border px-4 py-2">
                            {bed.status === 'Available' ? (
                              <div className="flex items-center justify-center text-green-500">
                                <AiOutlineCheckCircle size={20} className="mr-2" />
                                Available
                              </div>
                            ) : (
                              <div className="flex items-center justify-center text-red-500">
                                <AiOutlineCloseCircle size={20} className="mr-2" />
                                Occupied
                              </div>
                            )}
                          </td>
                          <td className="border px-4 py-2">
                            <button
                              onClick={() => handleEdit(room.roomName.toLowerCase().replace(' ', '_'), bed)}
                              className="text-blue-500 hover:text-blue-700 mr-4"
                            >
                              <AiOutlineEdit size={20} />
                            </button>
                            <button
                              onClick={() => handleDelete(room.roomName.toLowerCase().replace(' ', '_'), bed.id)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <AiOutlineDelete size={20} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );

};

export default BedManagementPage;
