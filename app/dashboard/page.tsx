// app/dashboard/page.tsx
"use client";

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { db } from '../../lib/firebase';
import { ref, onValue, DataSnapshot } from 'firebase/database';
import Head from 'next/head';
import { format, isToday, parseISO } from 'date-fns';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
import {
  AiOutlineUser,
  AiOutlineCalendar,
  AiOutlineFileText,
  AiOutlineSearch,
} from 'react-icons/ai';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import debounce from 'lodash/debounce';
import ProtectedRoute from './../../components/ProtectedRoute';
import { Dialog } from '@headlessui/react';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

interface OPDData {
  name: string;
  phone: string;
  date: string;
  time: string;
  doctor: string;
  amount?: number;
}

interface IPDService {
  amount: number;
  createdAt: string;
  serviceName: string;
  status: string;
}

interface IPDData {
  name: string;
  mobileNumber?: string;
  emergencyMobileNumber?: string;
  date: string;
  time: string;
  doctor: string;
  admissionType: string;
  age: number;
  bloodGroup: string;
  dateOfBirth: string;
  dischargeDate: string;
  gender: string;
  membershipType: string;
  paymentMode: string;
  paymentType: string;
  referralDoctor?: string;
  roomType: string;
  serviceAmount?: number;
  services?: IPDService[];
}

interface OPDAppointment {
  id: string;
  name: string;
  phone: string;
  date: string;
  time: string;
  doctor: string;
  appointmentType: 'OPD';
  amount: number;
}

interface IPDAppointment {
  id: string;
  name: string;
  phone: string;
  date: string;
  time: string;
  doctor: string;
  appointmentType: 'IPD';
  admissionType: string;
  age: number;
  bloodGroup: string;
  dateOfBirth: string;
  dischargeDate: string;
  emergencyMobileNumber: string;
  gender: string;
  membershipType: string;
  mobileNumber: string;
  paymentMode: string;
  paymentType: string;
  referralDoctor: string;
  roomType: string;
  serviceAmount: number;
  services: IPDService[];
}

type Appointment = OPDAppointment | IPDAppointment;

const DashboardPage: React.FC = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [filteredAppointments, setFilteredAppointments] = useState<Appointment[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isTodayFilter, setIsTodayFilter] = useState<boolean>(false);
  const [monthsDataOPD, setMonthsDataOPD] = useState<{ [key: string]: number }>({});
  const [monthsDataIPD, setMonthsDataIPD] = useState<{ [key: string]: number }>({});
  // const [totalAmountOPD, setTotalAmountOPD] = useState<number>(0);
  const [totalAmountIPD, setTotalAmountIPD] = useState<number>(0);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedIPDAppointment, setSelectedIPDAppointment] = useState<IPDAppointment | null>(null);

  useEffect(() => {
    const bookingsRef = ref(db, 'bookings');
    const ipdBookingsRef = ref(db, 'ipd_bookings');

    const handleBookings = (snapshot: DataSnapshot) => {
      const data = snapshot.val() as Record<string, OPDData | undefined>;
      const opdAppointments: OPDAppointment[] = data
        ? Object.entries(data).map(([id, value]) => ({
            id,
            name: value?.name ?? '',
            phone: value?.phone ?? '',
            date: value?.date ?? '',
            time: value?.time ?? '',
            doctor: value?.doctor ?? '',
            appointmentType: 'OPD',
            amount: value?.amount || 0,
          }))
        : [];
      return opdAppointments;
    };

    const handleIPDBookings = (snapshot: DataSnapshot) => {
      const data = snapshot.val() as Record<string, IPDData | undefined>;
      const ipdAppointments: IPDAppointment[] = data
        ? Object.entries(data).map(([id, value]) => ({
            id,
            name: value?.name ?? '',
            phone: value?.mobileNumber || value?.emergencyMobileNumber || '',
            date: value?.date ?? '',
            time: value?.time ?? '',
            doctor: value?.doctor ?? '',
            appointmentType: 'IPD',
            admissionType: value?.admissionType ?? '',
            age: value?.age ?? 0,
            bloodGroup: value?.bloodGroup ?? '',
            dateOfBirth: value?.dateOfBirth ?? '',
            dischargeDate: value?.dischargeDate ?? '',
            emergencyMobileNumber: value?.emergencyMobileNumber ?? '',
            gender: value?.gender ?? '',
            membershipType: value?.membershipType ?? '',
            mobileNumber: value?.mobileNumber ?? '',
            paymentMode: value?.paymentMode ?? '',
            paymentType: value?.paymentType ?? '',
            referralDoctor: value?.referralDoctor ?? '',
            roomType: value?.roomType ?? '',
            serviceAmount: value?.serviceAmount || 0,
            services: Array.isArray(value?.services) ? value!.services : [],
          }))
        : [];
      return ipdAppointments;
    };

    const unsubscribeBookings = onValue(bookingsRef, (snapshot) => {
      const opdAppointments = handleBookings(snapshot);
      onValue(ipdBookingsRef, (ipdSnapshot) => {
        const ipdAppointments = handleIPDBookings(ipdSnapshot);
        const allAppointments: Appointment[] = [...opdAppointments, ...ipdAppointments];
        setAppointments(allAppointments);
        setFilteredAppointments(allAppointments);
        generateMonthsData(allAppointments);
        calculateTotalAmount(allAppointments);
      });
    });

    return () => {
      unsubscribeBookings();
    };
  }, []);

  const generateMonthsData = (appointments: Appointment[]) => {
    const dataOPD: { [key: string]: number } = {};
    const dataIPD: { [key: string]: number } = {};

    appointments.forEach((appointment) => {
      const month = format(parseISO(appointment.date), 'MMMM');
      if (appointment.appointmentType === 'OPD') {
        dataOPD[month] = (dataOPD[month] || 0) + 1;
      } else if (appointment.appointmentType === 'IPD') {
        dataIPD[month] = (dataIPD[month] || 0) + 1;
      }
    });

    setMonthsDataOPD(dataOPD);
    setMonthsDataIPD(dataIPD);
  };

  const calculateTotalAmount = (appointments: Appointment[]) => {
    let totalOPD = 0;
    let totalIPD = 0;

    appointments.forEach((appointment) => {
      if (appointment.appointmentType === 'OPD') {
        totalOPD += appointment.amount;
      } else if (appointment.appointmentType === 'IPD') {
        const ipdApp = appointment as IPDAppointment;
        totalIPD += ipdApp.serviceAmount + ipdApp.services.reduce((acc, service) => acc + service.amount, 0);
      }
    });

    // setTotalAmountOPD(totalOPD);
    setTotalAmountIPD(totalIPD);
  };

  const applyFilters = useCallback((query: string, month: string, today: boolean, date: string) => {
    let tempAppointments = [...appointments];

    if (query) {
      const lowerQuery = query.toLowerCase();
      tempAppointments = tempAppointments.filter(
        (appointment) =>
          appointment.name.toLowerCase().includes(lowerQuery) ||
          appointment.phone.includes(query)
      );
    }

    if (month !== 'All') {
      tempAppointments = tempAppointments.filter((appointment) => {
        const appointmentMonth = format(parseISO(appointment.date), 'MMMM');
        return appointmentMonth === month;
      });
    }

    if (today) {
      tempAppointments = tempAppointments.filter((appointment) =>
        isToday(parseISO(appointment.date))
      );
    }

    if (date) {
      tempAppointments = tempAppointments.filter(
        (appointment) => format(parseISO(appointment.date), 'yyyy-MM-dd') === date
      );
    }

    setFilteredAppointments(tempAppointments);
    generateMonthsData(tempAppointments);
    calculateTotalAmount(tempAppointments);
  }, [appointments]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    applyFilters(query, selectedMonth, isTodayFilter, selectedDate);
  }, [selectedMonth, isTodayFilter, selectedDate, applyFilters]);

  const debouncedSearch = useMemo(
    () => debounce(handleSearchChange, 300),
    [handleSearchChange]
  );

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const month = e.target.value;
    setSelectedMonth(month);
    setIsTodayFilter(false);
    setSelectedDate('');
    applyFilters(searchQuery, month, false, '');
  };

  const handleTodayFilter = () => {
    setIsTodayFilter(true);
    setSelectedMonth('All');
    setSelectedDate('');
    applyFilters(searchQuery, 'All', true, '');
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = e.target.value;
    setSelectedDate(date);
    setIsTodayFilter(false);
    setSelectedMonth('All');
    applyFilters(searchQuery, 'All', false, date);
  };

  const todayAppointments = appointments.filter((appointment) =>
    isToday(parseISO(appointment.date))
  );

  const chartDataOPD = {
    labels: Object.keys(monthsDataOPD),
    datasets: [
      {
        label: 'Number of OPD Appointments',
        data: Object.values(monthsDataOPD),
        backgroundColor: 'rgba(79, 70, 229, 0.6)',
        borderColor: 'rgba(79, 70, 229, 1)',
        borderWidth: 1,
      },
    ],
  };

  const chartDataIPD = {
    labels: Object.keys(monthsDataIPD),
    datasets: [
      {
        label: 'Number of IPD Appointments',
        data: Object.values(monthsDataIPD),
        backgroundColor: 'rgba(229, 115, 115, 0.6)',
        borderColor: 'rgba(229, 115, 115, 1)',
        borderWidth: 1,
      },
    ],
  };

  const openModal = (appointment: IPDAppointment) => {
    setSelectedIPDAppointment(appointment);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setSelectedIPDAppointment(null);
    setIsModalOpen(false);
  };

  return (
    <>
      <Head>
        <title>Dashboard - Hospital Appointments</title>
        <meta name="description" content="View and manage all OPD and IPD appointments" />
      </Head>

      <ToastContainer />

      <main className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold text-indigo-600 mb-6 text-center">Appointments Dashboard</h1>

          <div className="flex flex-col md:flex-row justify-between items-center mb-6 space-y-4 md:space-y-0">
            <div className="relative w-full md:w-1/3">
              <AiOutlineSearch className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                placeholder="Search by Name or Phone"
                onChange={debouncedSearch}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition duration-200"
              />
            </div>

            <div className="flex space-x-4">
              <button
                onClick={() => {
                  setIsTodayFilter(false);
                  setSelectedMonth('All');
                  setSelectedDate('');
                  setSearchQuery('');
                  setFilteredAppointments(appointments);
                  generateMonthsData(appointments);
                  calculateTotalAmount(appointments);
                }}
                className={`px-4 py-2 rounded-lg border ${
                  !isTodayFilter && selectedMonth === 'All' && !selectedDate
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-indigo-600'
                } focus:outline-none focus:ring-2 focus:ring-indigo-500 transition duration-200`}
              >
                All Appointments
              </button>
              <button
                onClick={handleTodayFilter}
                className={`px-4 py-2 rounded-lg border ${
                  isTodayFilter ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-600'
                } focus:outline-none focus:ring-2 focus:ring-indigo-500 transition duration-200`}
              >
                Today&apos;s Appointments
              </button>
            </div>
          </div>

          <div className="flex justify-end mb-6">
            <div className="w-1/3">
              <label htmlFor="date" className="block text-gray-700 font-semibold mb-2">
                Filter by Date
              </label>
              <input
                type="date"
                id="date"
                value={selectedDate}
                onChange={handleDateChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex justify-end mb-6">
            <div className="w-1/3">
              <label htmlFor="month" className="block text-gray-700 font-semibold mb-2">
                Filter by Month
              </label>
              <select
                id="month"
                value={selectedMonth}
                onChange={handleFilterChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="All">All Months</option>
                {Array.from({ length: 12 }, (_, i) => format(new Date(0, i), 'MMMM')).map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div className="bg-white shadow rounded-lg p-6 flex items-center">
              <div className="p-3 bg-indigo-100 rounded-full mr-4">
                <AiOutlineUser className="text-indigo-600 text-2xl" />
              </div>
              <div>
                <p className="text-gray-600">All Appointments</p>
                <p className="text-2xl font-bold text-indigo-600">{appointments.length}</p>
              </div>
            </div>
            <div className="bg-white shadow rounded-lg p-6 flex items-center">
              <div className="p-3 bg-indigo-100 rounded-full mr-4">
                <AiOutlineCalendar className="text-indigo-600 text-2xl" />
              </div>
              <div>
                <p className="text-gray-600">Today&apos;s Appointments</p>
                <p className="text-2xl font-bold text-indigo-600">{todayAppointments.length}</p>
              </div>
            </div>
            <div className="bg-white shadow rounded-lg p-6 flex items-center">
              <div className="p-3 bg-indigo-100 rounded-full mr-4">
                <AiOutlineFileText className="text-indigo-600 text-2xl" />
              </div>
              <div>
                <p className="text-gray-600">Filtered Appointments</p>
                <p className="text-2xl font-bold text-indigo-600">{filteredAppointments.length}</p>
              </div>
            </div>
            <div className="bg-white shadow rounded-lg p-6 flex items-center">
              <div className="p-3 bg-indigo-100 rounded-full mr-4">
                <AiOutlineFileText className="text-indigo-600 text-2xl" />
              </div>
              <div>
                <p className="text-gray-600">Total IPD Amount</p>
                <p className="text-2xl font-bold text-indigo-600">rs{totalAmountIPD}</p>
              </div>
            </div>
          </div>

          <div className="bg-white shadow rounded-lg overflow-x-auto mb-6">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-indigo-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Doctor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAppointments.length > 0 ? (
                  filteredAppointments.map((appointment) => (
                    <tr key={appointment.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{appointment.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{appointment.phone}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {format(parseISO(appointment.date), 'dd MMM yyyy')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{appointment.time}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {appointment.doctor.replace(/_/g, ' ').toUpperCase()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{appointment.appointmentType}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {appointment.appointmentType === 'IPD' && (
                          <button
                            onClick={() => openModal(appointment as IPDAppointment)}
                            className="text-indigo-600 hover:text-indigo-900 underline"
                          >
                            View Details
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                      No appointments found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">OPD Appointments by Month</h2>
            {Object.keys(monthsDataOPD).length > 0 ? (
              <Bar
                data={chartDataOPD}
                options={{
                  responsive: true,
                  plugins: {
                    legend: {
                      position: 'top' as const,
                    },
                    title: {
                      display: false,
                    },
                  },
                }}
              />
            ) : (
              <p className="text-gray-500">No OPD data available to display the chart.</p>
            )}
          </div>

          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">IPD Appointments by Month</h2>
            {Object.keys(monthsDataIPD).length > 0 ? (
              <Bar
                data={chartDataIPD}
                options={{
                  responsive: true,
                  plugins: {
                    legend: {
                      position: 'top' as const,
                    },
                    title: {
                      display: false,
                    },
                  },
                }}
              />
            ) : (
              <p className="text-gray-500">No IPD data available to display the chart.</p>
            )}
          </div>

          <Dialog open={isModalOpen} onClose={closeModal} className="fixed z-10 inset-0 overflow-y-auto">
            {isModalOpen && selectedIPDAppointment && (
              <div className="flex items-center justify-center min-h-screen px-4">
                <div className="fixed inset-0 bg-black bg-opacity-40 transition-opacity" aria-hidden="true"></div>
                <Dialog.Panel className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 transform transition-all">
                  <button onClick={closeModal} className="absolute top-3 right-3 text-gray-500 hover:text-gray-700">
                    ✕
                  </button>
                  <Dialog.Title className="text-2xl font-bold mb-4 text-gray-800">IPD Appointment Details</Dialog.Title>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p><strong>Name:</strong> {selectedIPDAppointment.name}</p>
                      <p><strong>Phone:</strong> {selectedIPDAppointment.phone}</p>
                      <p><strong>Date:</strong> {format(parseISO(selectedIPDAppointment.date), 'dd MMM yyyy')}</p>
                      <p><strong>Time:</strong> {selectedIPDAppointment.time}</p>
                      <p><strong>Doctor:</strong> {selectedIPDAppointment.doctor.replace(/_/g, ' ').toUpperCase()}</p>
                      <p><strong>Admission Type:</strong> {selectedIPDAppointment.admissionType}</p>
                      <p><strong>Age:</strong> {selectedIPDAppointment.age}</p>
                      <p><strong>Blood Group:</strong> {selectedIPDAppointment.bloodGroup}</p>
                    </div>
                    <div className="space-y-2">
                      <p><strong>Date of Birth:</strong> {selectedIPDAppointment.dateOfBirth ? format(parseISO(selectedIPDAppointment.dateOfBirth), 'dd MMM yyyy') : '-'}</p>
                      <p><strong>Discharge Date:</strong> {selectedIPDAppointment.dischargeDate ? format(parseISO(selectedIPDAppointment.dischargeDate), 'dd MMM yyyy') : '-'}</p>
                      <p><strong>Emergency Number:</strong> {selectedIPDAppointment.emergencyMobileNumber}</p>
                      <p><strong>Gender:</strong> {selectedIPDAppointment.gender}</p>
                      <p><strong>Membership Type:</strong> {selectedIPDAppointment.membershipType}</p>
                      <p><strong>Payment Mode:</strong> {selectedIPDAppointment.paymentMode}</p>
                      <p><strong>Payment Type:</strong> {selectedIPDAppointment.paymentType}</p>
                      <p><strong>Referral Doctor:</strong> {selectedIPDAppointment.referralDoctor || '-'}</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <p><strong>Room Type:</strong> {selectedIPDAppointment.roomType}</p>
                    <p><strong>Service Amount:</strong> rs{selectedIPDAppointment.serviceAmount}</p>
                    <strong>Services:</strong>
                    <ul className="list-disc list-inside space-y-1">
                      {selectedIPDAppointment.services.map((service, index) => (
                        <li key={index} className="text-gray-700">
                          {service.serviceName} - rs{service.amount} - {service.status}
                        </li>
                      ))}
                    </ul>
                  </div>
                </Dialog.Panel>
              </div>
            )}
          </Dialog>
        </div>
      </main>
    </>
  );
};

const DashboardPageWithProtection: React.FC = () => (
  <ProtectedRoute>
    <DashboardPage />
  </ProtectedRoute>
);

export default DashboardPageWithProtection;
