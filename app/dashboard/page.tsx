// app/dashboard/page.tsx
"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../../lib/firebase';
import { ref, onValue } from 'firebase/database';
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

// Register Chart.js components
ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

interface Appointment {
  id: string;
  name: string;
  email: string;
  phone: string;
  date: string; // ISO string
  time: string;
  doctor: string;
  symptoms: string;
  age: number;
  gender: string;
  address: string;
  preferredLanguage: string;
  appointmentType: string;
  insurance: string;
  priority: string;
  attachments: string[]; // File names
}

const DashboardPage: React.FC = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [filteredAppointments, setFilteredAppointments] = useState<Appointment[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isTodayFilter, setIsTodayFilter] = useState<boolean>(false);
  const [monthsData, setMonthsData] = useState<{ [key: string]: number }>({});

  useEffect(() => {
    const appointmentsRef = ref(db, 'bookings');
    onValue(appointmentsRef, (snapshot) => {
      const data = snapshot.val();

      if (data) {
        // Explicitly define the expected type for Firebase data
        const dataTyped = data as Record<string, Omit<Appointment, 'id'>>;

        const appointmentsArray: Appointment[] = Object.entries(dataTyped).map(
          ([id, value]) => ({
            id,
            name: value.name,
            email: value.email,
            phone: value.phone,
            date: value.date,
            time: value.time,
            doctor: value.doctor,
            symptoms: value.symptoms,
            age: value.age,
            gender: value.gender,
            address: value.address,
            preferredLanguage: value.preferredLanguage,
            appointmentType: value.appointmentType,
            insurance: value.insurance,
            priority: value.priority,
            attachments: value.attachments || [],
          })
        );

        setAppointments(appointmentsArray);
        setFilteredAppointments(appointmentsArray);
        generateMonthsData(appointmentsArray);
      } else {
        setAppointments([]);
        setFilteredAppointments([]);
        setMonthsData({});
      }
    });
  }, []);

  const generateMonthsData = (appointments: Appointment[]) => {
    const data: { [key: string]: number } = {};
    appointments.forEach((appointment) => {
      const month = format(parseISO(appointment.date), 'MMMM');
      if (data[month]) {
        data[month] += 1;
      } else {
        data[month] = 1;
      }
    });
    setMonthsData(data);
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const month = e.target.value;
    setSelectedMonth(month);
    setIsTodayFilter(false); // Reset today filter when changing month
    applyFilters(searchQuery, month, false);
  };

  const handleTodayFilter = () => {
    setIsTodayFilter(true);
    setSelectedMonth('All'); // Reset month filter when applying today filter
    applyFilters(searchQuery, 'All', true);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    applyFilters(query, selectedMonth, isTodayFilter);
  };

  // Debounce the search input to optimize performance
  const debouncedSearch = useMemo(
    () => debounce(handleSearchChange, 300),
    [selectedMonth, isTodayFilter]
  );

  const applyFilters = (query: string, month: string, today: boolean) => {
    let tempAppointments = [...appointments];

    // Apply search filter
    if (query) {
      const lowerQuery = query.toLowerCase();
      tempAppointments = tempAppointments.filter(
        (appointment) =>
          appointment.name.toLowerCase().includes(lowerQuery) ||
          appointment.email.toLowerCase().includes(lowerQuery) ||
          appointment.phone.includes(query)
      );
    }

    // Apply month filter
    if (month !== 'All') {
      tempAppointments = tempAppointments.filter((appointment) => {
        const appointmentMonth = format(parseISO(appointment.date), 'MMMM');
        return appointmentMonth === month;
      });
    }

    // Apply today filter
    if (today) {
      tempAppointments = tempAppointments.filter((appointment) =>
        isToday(parseISO(appointment.date))
      );
    }

    setFilteredAppointments(tempAppointments);
    generateMonthsData(tempAppointments);
  };

  const todayAppointments = appointments.filter((appointment) =>
    isToday(parseISO(appointment.date))
  );

  // Prepare data for the bar chart
  const chartData = {
    labels: Object.keys(monthsData),
    datasets: [
      {
        label: 'Number of Appointments',
        data: Object.values(monthsData),
        backgroundColor: 'rgba(79, 70, 229, 0.6)',
        borderColor: 'rgba(79, 70, 229, 1)',
        borderWidth: 1,
      },
    ],
  };

  return (
    <>
      <Head>
        <title>Dashboard - Hospital OPD Booking</title>
        <meta name="description" content="View and manage all OPD appointments" />
      </Head>

      <ToastContainer />

      <main className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold text-indigo-600 mb-6 text-center">OPD Appointments Dashboard</h1>

          {/* Search and Filter Section */}
          <div className="flex flex-col md:flex-row justify-between items-center mb-6 space-y-4 md:space-y-0">
            {/* Search Bar */}
            <div className="relative w-full md:w-1/3">
              <AiOutlineSearch className="absolute top-3 left-3 text-gray-400" />
              <input
                type="text"
                placeholder="Search by Name, Email, or Phone"
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
                  setSearchQuery('');
                  setFilteredAppointments(appointments);
                  generateMonthsData(appointments);
                }}
                className={`px-4 py-2 rounded-lg border ${
                  !isTodayFilter && selectedMonth === 'All'
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
                Today’s Appointments
              </button>
            </div>
          </div>

          {/* Month Filter */}
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

          {/* Appointments Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
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

            {/* Today's Appointments */}
            <div className="bg-white shadow rounded-lg p-6 flex items-center">
              <div className="p-3 bg-indigo-100 rounded-full mr-4">
                <AiOutlineCalendar className="text-indigo-600 text-2xl" />
              </div>
              <div>
                <p className="text-gray-600">Today Appointments</p>
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
          </div>

          {/* Appointments Table */}
          <div className="bg-white shadow rounded-lg overflow-x-auto mb-6">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-indigo-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Doctor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Symptoms</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAppointments.length > 0 ? (
                  filteredAppointments.map((appointment) => (
                    <tr key={appointment.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{appointment.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{appointment.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{appointment.phone}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {format(parseISO(appointment.date), 'dd MMM yyyy')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{appointment.time}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {appointment.doctor.replace(/_/g, ' ').toUpperCase()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{appointment.symptoms}</td>
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

          {/* Appointments Chart */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">Appointments by Month</h2>
            {Object.keys(monthsData).length > 0 ? (
              <Bar
                data={chartData}
                options={{
                  responsive: true,
                  plugins: {
                    legend: {
                      position: 'top' as const,
                    },
                    title: {
                      display: false,
                      text: 'Appointments by Month',
                    },
                  },
                }}
              />
            ) : (
              <p className="text-gray-500">No data available to display the chart.</p>
            )}
          </div>
        </div>
      </main>
    </>
  );
};

// Wrap the DashboardPage with ProtectedRoute
const DashboardPageWithProtection: React.FC = () => (
  <ProtectedRoute>
    <DashboardPage />
  </ProtectedRoute>
);

export default DashboardPageWithProtection;
