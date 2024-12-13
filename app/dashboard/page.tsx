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

// Doctor Interface
interface Doctor {
  name: string;
  amount?: number;
  department?: string;
  specialist?: string;
}

// OPD Data Structure
interface OPDData {
  name: string;
  phone: string;
  date: string;
  time: string;
  doctor: string; // doctor ID
  amount?: number;
  serviceName?: string;
}

// IPD Service Structure
interface IPDService {
  amount: number;
  createdAt: string;
  serviceName: string;
  status: string;
}

// IPD Data Structure
interface IPDData {
  name: string;
  mobileNumber?: string;
  emergencyMobileNumber?: string;
  date: string;
  time: string;
  doctor: string; // doctor ID
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
  amount: number; // Assuming this includes services
  services?: IPDService[];
}

// Pathology (Blood Test) Data Structure
interface PathologyData {
  name: string;
  phone: string;
  bloodTestName: string;
  amount: number;
  timestamp: number;
  age: number;
}

// Unified Appointment Types
interface BaseAppointment {
  id: string;
  name: string;
  phone: string;
  date: string;
  time: string;
  doctor: string; // Resolved to Doctor name
  appointmentType: 'OPD' | 'IPD' | 'Pathology';
}

interface OPDAppointment extends BaseAppointment {
  appointmentType: 'OPD';
  amount: number;
  serviceName?: string;
}

interface IPDAppointment extends BaseAppointment {
  appointmentType: 'IPD';
  admissionType: string;
  age: number;
  bloodGroup: string;
  dateOfBirth: string;
  dischargeDate: string;
  emergencyMobileNumber: string;
  gender: string;
  membershipType: string;
  paymentMode: string;
  paymentType: string;
  referralDoctor: string;
  roomType: string;
  amount: number; // Assuming this includes services
  services: IPDService[];
}

interface PathologyAppointment extends BaseAppointment {
  appointmentType: 'Pathology';
  bloodTestName: string;
  amount: number;
  age: number;
}

type Appointment = OPDAppointment | IPDAppointment | PathologyAppointment;

// Helper function for currency formatting
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);
};

const DashboardPage: React.FC = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [filteredAppointments, setFilteredAppointments] = useState<Appointment[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isTodayFilter, setIsTodayFilter] = useState<boolean>(false);
  const [monthsDataOPD, setMonthsDataOPD] = useState<{ [key: string]: number }>({});
  const [monthsDataIPD, setMonthsDataIPD] = useState<{ [key: string]: number }>({});
  const [todayAmountIPD, setTodayAmountIPD] = useState<number>(0);
  const [todayAmountOPD, setTodayAmountOPD] = useState<number>(0);
  const [todayAmountPathology, setTodayAmountPathology] = useState<number>(0);
  const [selectedDate, setSelectedDate] = useState<string>('');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  // Doctors data
  const [doctors, setDoctors] = useState<{ [key: string]: Doctor }>({});

  // Helper function to get Doctor name from ID
  const getDoctorName = (doctorId?: string): string => {
    if (!doctorId) return 'Unknown';
    return doctors[doctorId]?.name || 'Unknown';
  };

  // Fetch doctors
  useEffect(() => {
    const doctorsRef = ref(db, 'doctors');
    const unsubscribeDoctors = onValue(doctorsRef, (snapshot: DataSnapshot) => {
      const data = snapshot.val() as Record<string, Doctor | undefined>;
      const doctorsData: { [key: string]: Doctor } = data
        ? Object.entries(data).reduce((acc, [id, value]) => {
            if (value) {
              acc[id] = value;
            }
            return acc;
          }, {} as { [key: string]: Doctor })
        : {};
      setDoctors(doctorsData);
    });

    return () => {
      unsubscribeDoctors();
    };
  }, []);

  // Fetch all appointments once doctors are loaded
  useEffect(() => {
    if (Object.keys(doctors).length === 0) return;

    const bookingsRef = ref(db, 'bookings');
    const ipdBookingsRef = ref(db, 'ipd_bookings');
    const bloodTestsRef = ref(db, 'bloodTests');

    let allAppointments: Appointment[] = [];

    onValue(bookingsRef, (bookingsSnapshot) => {
      const opdData = bookingsSnapshot.val() as Record<string, OPDData | undefined>;
      const opdAppointments: OPDAppointment[] = opdData
        ? Object.entries(opdData).map(([id, val]) => ({
            id,
            name: val?.name ?? '',
            phone: val?.phone ?? '',
            date: val?.date ?? '',
            time: val?.time ?? '',
            doctor: getDoctorName(val?.doctor),
            appointmentType: 'OPD',
            amount: val?.amount || 0,
            serviceName: val?.serviceName,
          }))
        : [];

      onValue(ipdBookingsRef, (ipdSnapshot) => {
        const ipdData = ipdSnapshot.val() as Record<string, IPDData | undefined>;
        const ipdAppointments: IPDAppointment[] = ipdData
          ? Object.entries(ipdData).map(([id, val]) => ({
              id,
              name: val?.name ?? '',
              phone: val?.mobileNumber || val?.emergencyMobileNumber || '',
              date: val?.date ?? '',
              time: val?.time ?? '',
              doctor: getDoctorName(val?.doctor),
              appointmentType: 'IPD',
              admissionType: val?.admissionType ?? '',
              age: val?.age ?? 0,
              bloodGroup: val?.bloodGroup ?? '',
              dateOfBirth: val?.dateOfBirth ?? '',
              dischargeDate: val?.dischargeDate ?? '',
              emergencyMobileNumber: val?.emergencyMobileNumber ?? '',
              gender: val?.gender ?? '',
              membershipType: val?.membershipType ?? '',
              paymentMode: val?.paymentMode ?? '',
              paymentType: val?.paymentType ?? '',
              referralDoctor: val?.referralDoctor ?? '',
              roomType: val?.roomType ?? '',
              amount: val?.amount || 0, // Assuming 'amount' includes services
              services: Array.isArray(val?.services) ? val?.services : [],
            }))
          : [];

        onValue(bloodTestsRef, (bloodSnapshot) => {
          const bloodData = bloodSnapshot.val() as Record<string, PathologyData | undefined>;
          const pathologyAppointments: PathologyAppointment[] = bloodData
            ? Object.entries(bloodData).map(([id, val]) => ({
                id,
                name: val?.name ?? '',
                phone: val?.phone ?? '',
                date: val?.timestamp ? new Date(val.timestamp).toISOString() : new Date().toISOString(),
                time: '', // No time in pathology data
                doctor: 'N/A', // If there's no doctor assigned in bloodTests
                appointmentType: 'Pathology',
                bloodTestName: val?.bloodTestName ?? '',
                amount: val?.amount ?? 0,
                age: val?.age ?? 0,
              }))
            : [];

          allAppointments = [...opdAppointments, ...ipdAppointments, ...pathologyAppointments];
          setAppointments(allAppointments);
          setFilteredAppointments(allAppointments);
          generateMonthsData(allAppointments);
          calculateTodayAmounts(allAppointments); // Updated function
        });
      });
    });
  }, [doctors]);

  // Generate monthly data for charts
  const generateMonthsData = (appointments: Appointment[]) => {
    const dataOPD: { [key: string]: number } = {};
    const dataIPD: { [key: string]: number } = {};

    appointments.forEach((appointment) => {
      const parsedDate = parseISO(appointment.date);
      const month = format(parsedDate, 'MMMM');
      if (appointment.appointmentType === 'OPD') {
        dataOPD[month] = (dataOPD[month] || 0) + 1;
      } else if (appointment.appointmentType === 'IPD') {
        dataIPD[month] = (dataIPD[month] || 0) + 1;
      }
    });

    setMonthsDataOPD(dataOPD);
    setMonthsDataIPD(dataIPD);
  };

  // Calculate today's amounts for IPD, OPD, and Pathology
  const calculateTodayAmounts = (appointments: Appointment[]) => {
    let ipdTotal = 0;
    let opdTotal = 0;
    let pathologyTotal = 0;

    const todayDate = new Date();
    const todayDateString = format(todayDate, 'yyyy-MM-dd');

    appointments.forEach((appointment) => {
      const appointmentDate = parseISO(appointment.date);
      const appointmentDateFormatted = format(appointmentDate, 'yyyy-MM-dd');

      if (appointmentDateFormatted === todayDateString) {
        if (appointment.appointmentType === 'IPD') {
          const ipd = appointment as IPDAppointment;
          ipdTotal += ipd.amount; // Assuming 'amount' includes services
        } else if (appointment.appointmentType === 'OPD') {
          const opd = appointment as OPDAppointment;
          opdTotal += opd.amount;
        } else if (appointment.appointmentType === 'Pathology') {
          const pathology = appointment as PathologyAppointment;
          pathologyTotal += pathology.amount;
        }
      }
    });

    setTodayAmountIPD(ipdTotal);
    setTodayAmountOPD(opdTotal);
    setTodayAmountPathology(pathologyTotal);
  };

  // Apply all filters
  const applyFilters = useCallback(
    (query: string, month: string, today: boolean, date: string) => {
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
      calculateTodayAmounts(tempAppointments);
    },
    [appointments]
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const query = e.target.value;
      setSearchQuery(query);
      applyFilters(query, selectedMonth, isTodayFilter, selectedDate);
    },
    [selectedMonth, isTodayFilter, selectedDate, applyFilters]
  );

  const debouncedSearch = useMemo(() => debounce(handleSearchChange, 300), [handleSearchChange]);

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

  // Charts data
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

  // Modal handlers
  const openModal = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setSelectedAppointment(null);
    setIsModalOpen(false);
  };

  return (
    <>
      <Head>
        <title>Dashboard - Hospital Appointments</title>
        <meta name="description" content="View and manage all OPD, IPD, and Pathology appointments" />
      </Head>

      <ToastContainer />

      <main className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold text-indigo-600 mb-6 text-center">Appointments Dashboard</h1>

          {/* Search and Filter Controls */}
          <div className="flex flex-col md:flex-row justify-between items-center mb-6 space-y-4 md:space-y-0">
            {/* Search Bar */}
            <div className="relative w-full md:w-1/3">
              <AiOutlineSearch className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                placeholder="Search by Name or Phone"
                onChange={debouncedSearch}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition duration-200"
              />
            </div>

            {/* Filter Buttons */}
            <div className="flex space-x-4">
              <button
                onClick={() => {
                  setIsTodayFilter(false);
                  setSelectedMonth('All');
                  setSelectedDate('');
                  setSearchQuery('');
                  setFilteredAppointments(appointments);
                  generateMonthsData(appointments);
                  calculateTodayAmounts(appointments);
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

          {/* Date Picker */}
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

          {/* Month Selector */}
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

          {/* Dashboard Statistics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            {/* All Appointments */}
            <div className="bg-white shadow rounded-lg p-6 flex items-center">
              <div className="p-3 bg-indigo-100 rounded-full mr-4">
                <AiOutlineUser className="text-indigo-600 text-2xl" />
              </div>
              <div>
                <p className="text-gray-600">All Appointments</p>
                <p className="text-2xl font-bold text-indigo-600">{appointments.length}</p>
              </div>
            </div>

            {/* Today's Appointments Count */}
            <div className="bg-white shadow rounded-lg p-6 flex items-center">
              <div className="p-3 bg-indigo-100 rounded-full mr-4">
                <AiOutlineCalendar className="text-indigo-600 text-2xl" />
              </div>
              <div>
                <p className="text-gray-600">Today's Appointments</p>
                <p className="text-2xl font-bold text-indigo-600">{todayAppointments.length}</p>
              </div>
            </div>

            {/* Filtered Appointments */}
            <div className="bg-white shadow rounded-lg p-6 flex items-center">
              <div className="p-3 bg-indigo-100 rounded-full mr-4">
                <AiOutlineFileText className="text-indigo-600 text-2xl" />
              </div>
              <div>
                <p className="text-gray-600">Filtered Appointments</p>
                <p className="text-2xl font-bold text-indigo-600">{filteredAppointments.length}</p>
              </div>
            </div>

            {/* Today's IPD Amount */}
            <div className="bg-white shadow rounded-lg p-6 flex items-center">
              <div className="p-3 bg-green-100 rounded-full mr-4">
                {/* You can choose a different icon for IPD */}
                <AiOutlineFileText className="text-green-600 text-2xl" />
              </div>
              <div>
                <p className="text-gray-600">Today's IPD Amount</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(todayAmountIPD)}</p>
              </div>
            </div>

            {/* Today's OPD Amount */}
            <div className="bg-white shadow rounded-lg p-6 flex items-center">
              <div className="p-3 bg-blue-100 rounded-full mr-4">
                {/* You can choose a different icon for OPD */}
                <AiOutlineFileText className="text-blue-600 text-2xl" />
              </div>
              <div>
                <p className="text-gray-600">Today's OPD Amount</p>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(todayAmountOPD)}</p>
              </div>
            </div>

            {/* Today's Pathology Amount */}
            <div className="bg-white shadow rounded-lg p-6 flex items-center">
              <div className="p-3 bg-yellow-100 rounded-full mr-4">
                {/* You can choose a different icon for Pathology */}
                <AiOutlineFileText className="text-yellow-600 text-2xl" />
              </div>
              <div>
                <p className="text-gray-600">Today's Pathology Amount</p>
                <p className="text-2xl font-bold text-yellow-600">{formatCurrency(todayAmountPathology)}</p>
              </div>
            </div>
          </div>

          {/* Appointments Table */}
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{appointment.time || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {appointment.doctor.replace(/_/g, ' ').toUpperCase()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{appointment.appointmentType}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <button
                          onClick={() => openModal(appointment)}
                          className="text-indigo-600 hover:text-indigo-900 underline"
                        >
                          View Details
                        </button>
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

          {/* OPD Appointments Chart */}
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

          {/* IPD Appointments Chart */}
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

          {/* Appointment Details Modal */}
          <Dialog open={isModalOpen} onClose={closeModal} className="fixed z-10 inset-0 overflow-y-auto">
            {isModalOpen && selectedAppointment && (
              <div className="flex items-center justify-center min-h-screen px-4">
                <div className="fixed inset-0 bg-black bg-opacity-40 transition-opacity" aria-hidden="true"></div>
                <Dialog.Panel className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 transform transition-all">
                  <button onClick={closeModal} className="absolute top-3 right-3 text-gray-500 hover:text-gray-700">
                    ✕
                  </button>

                  {selectedAppointment.appointmentType === 'IPD' && (
                    <>
                      <Dialog.Title className="text-2xl font-bold mb-4 text-gray-800">IPD Appointment Details</Dialog.Title>
                      {(() => {
                        const ipd = selectedAppointment as IPDAppointment;
                        return (
                          <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <p><strong>Name:</strong> {ipd.name}</p>
                                <p><strong>Phone:</strong> {ipd.phone}</p>
                                <p><strong>Date:</strong> {format(parseISO(ipd.date), 'dd MMM yyyy')}</p>
                                <p><strong>Time:</strong> {ipd.time || '-'}</p>
                                <p><strong>Doctor:</strong> {ipd.doctor.toUpperCase()}</p>
                                <p><strong>Admission Type:</strong> {ipd.admissionType}</p>
                                <p><strong>Age:</strong> {ipd.age}</p>
                                <p><strong>Blood Group:</strong> {ipd.bloodGroup}</p>
                              </div>
                              <div className="space-y-2">
                                <p><strong>Date of Birth:</strong> {ipd.dateOfBirth ? format(parseISO(ipd.dateOfBirth), 'dd MMM yyyy') : '-'}</p>
                                <p><strong>Discharge Date:</strong> {ipd.dischargeDate ? format(parseISO(ipd.dischargeDate), 'dd MMM yyyy') : '-'}</p>
                                <p><strong>Emergency Number:</strong> {ipd.emergencyMobileNumber || '-'}</p>
                                <p><strong>Gender:</strong> {ipd.gender}</p>
                                <p><strong>Membership Type:</strong> {ipd.membershipType}</p>
                                <p><strong>Payment Mode:</strong> {ipd.paymentMode}</p>
                                <p><strong>Payment Type:</strong> {ipd.paymentType}</p>
                                <p><strong>Referral Doctor:</strong> {ipd.referralDoctor || '-'}</p>
                              </div>
                            </div>
                            <div className="mt-4 space-y-2">
                              <p><strong>Room Type:</strong> {ipd.roomType}</p>
                              <p><strong>Service Amount:</strong> ₹{formatCurrency(ipd.amount)}</p>
                              <strong>Services:</strong>
                              <ul className="list-disc list-inside space-y-1">
                                {ipd.services.map((service, index) => (
                                  <li key={index} className="text-gray-700">
                                    {service.serviceName} - ₹{service.amount} - {service.status}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </>
                        );
                      })()}
                    </>
                  )}

                  {selectedAppointment.appointmentType === 'OPD' && (
                    <>
                      <Dialog.Title className="text-2xl font-bold mb-4 text-gray-800">OPD Appointment Details</Dialog.Title>
                      {(() => {
                        const opd = selectedAppointment as OPDAppointment;
                        return (
                          <div className="space-y-2">
                            <p><strong>Name:</strong> {opd.name}</p>
                            <p><strong>Phone:</strong> {opd.phone}</p>
                            <p><strong>Date:</strong> {format(parseISO(opd.date), 'dd MMM yyyy')}</p>
                            <p><strong>Time:</strong> {opd.time || '-'}</p>
                            <p><strong>Doctor:</strong> {opd.doctor.toUpperCase()}</p>
                            <p><strong>Amount:</strong> ₹{formatCurrency(opd.amount)}</p>
                            <p><strong>Service Name:</strong> {opd.serviceName || '-'}</p>
                          </div>
                        );
                      })()}
                    </>
                  )}

                  {selectedAppointment.appointmentType === 'Pathology' && (
                    <>
                      <Dialog.Title className="text-2xl font-bold mb-4 text-gray-800">Pathology Test Details</Dialog.Title>
                      {(() => {
                        const path = selectedAppointment as PathologyAppointment;
                        return (
                          <div className="space-y-2">
                            <p><strong>Name:</strong> {path.name}</p>
                            <p><strong>Phone:</strong> {path.phone}</p>
                            <p><strong>Date:</strong> {format(parseISO(path.date), 'dd MMM yyyy')}</p>
                            <p><strong>Blood Test Name:</strong> {path.bloodTestName}</p>
                            <p><strong>Amount:</strong> ₹{formatCurrency(path.amount)}</p>
                            <p><strong>Age:</strong> {path.age}</p>
                          </div>
                        );
                      })()}
                    </>
                  )}
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

