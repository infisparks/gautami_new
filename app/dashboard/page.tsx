"use client";

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { db } from '../../lib/firebase';
import { ref, onValue, DataSnapshot } from 'firebase/database';
import Head from 'next/head';
import { format, parseISO } from 'date-fns';
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

// ----- Type Definitions -----

// Doctor Interface
interface Doctor {
  name: string;
  amount?: number;
  department?: string;
  specialist?: string;
}

// OPD Appointment Data Structure (from nested patient.opd)
interface OPDData {
  amount?: number;
  createdAt?: string;
  date?: string;
  time?: string;
  doctor?: string; // doctor id
  serviceName?: string;
  paymentMethod?: string;
}

// IPD Appointment Data Structure (from patient.ipd)
interface IPDData {
  admissionType?: string;
  age?: number | string;
  bloodGroup?: string;
  date?: string;
  time?: string;
  doctor?: string; // doctor id
  dateOfBirth?: string;
  dischargeDate?: string;
  emergencyMobileNumber?: string;
  gender?: string;
  membershipType?: string;
  paymentMode?: string;
  paymentType?: string;
  referralDoctor?: string;
  roomType?: string;
  amount?: number;
  payments?: Record<string, { amount: number; paymentType: string; date?: string }>;
  services?: IPDService[];
  address?: string;
}

// IPD Service Structure
interface IPDService {
  amount: number;
  createdAt: string;
  serviceName: string;
  status: string;
}

// Pathology Appointment Data Structure (from patient.pathology)
interface PathologyData {
  amount?: number;
  bloodTestName?: string;
  timestamp?: number;
}

// Surgery Appointment Data Structure (from patient.surgery)
interface SurgeryData {
  finalDiagnosis?: string;
  surgeryDate?: string;
  surgeryTitle?: string;
  timestamp?: number;
}

// Patient Record stored under "patients"
interface PatientRecord {
  uhid: string;
  name: string;
  phone: string;
  age?: number;
  address: string;
  gender: string;
  createdAt: number | string;
  opd?: Record<string, OPDData>;
  ipd?: Record<string, IPDData>;
  pathology?: Record<string, PathologyData>;
  surgery?: Record<string, SurgeryData>;
}

// Base Appointment for unified view
interface BaseAppointment {
  id: string;
  name: string;
  phone: string;
  date: string; // ISO string
  time: string;
  doctor: string; // resolved doctor name (or N/A)
  appointmentType: 'OPD' | 'IPD' | 'Pathology' | 'Surgery';
}

// Extended types
interface OPDAppointment extends BaseAppointment {
  appointmentType: 'OPD';
  amount: number;
  serviceName?: string;
  paymentMethod?: string;
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
  amount: number;
  payments?: Record<string, { amount: number; paymentType: string; date?: string }>;
  services: IPDService[];
}

interface PathologyAppointment extends BaseAppointment {
  appointmentType: 'Pathology';
  bloodTestName: string;
  amount: number;
  age: number;
}

interface SurgeryAppointment extends BaseAppointment {
  appointmentType: 'Surgery';
  surgeryTitle: string;
  finalDiagnosis: string;
}

type Appointment = OPDAppointment | IPDAppointment | PathologyAppointment | SurgeryAppointment;

// ----- Helper Functions -----

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);
};

const getDoctorName = (doctorId?: string, doctors?: { [key: string]: Doctor }): string => {
  if (!doctorId || !doctors) return 'Unknown';
  return doctors[doctorId]?.name || 'Unknown';
};

// Get the paid amount for an appointment (for IPD, sum payments if available)
const getPaidAmount = (appointment: Appointment): number => {
  if (appointment.appointmentType === 'IPD') {
    const ipdApp = appointment as IPDAppointment;
    if (ipdApp.payments) {
      return Object.values(ipdApp.payments).reduce((sum, p) => sum + Number(p.amount), 0);
    }
    return ipdApp.amount || 0;
  }
  if (appointment.appointmentType === 'OPD' || appointment.appointmentType === 'Pathology') {
    return appointment.amount || 0;
  }
  return 0;
};

// Calculate total amounts (sums) and counts from a set of appointments
const calculateTotals = (apps: Appointment[]) => {
  let totalOpdCount = 0,
    totalOpdAmount = 0;
  let totalIpdCount = 0,
    totalIpdAmount = 0;
  let totalPathologyCount = 0,
    totalPathologyAmount = 0;
  apps.forEach((appointment) => {
    if (appointment.appointmentType === 'OPD') {
      totalOpdCount++;
      totalOpdAmount += appointment.amount || 0;
    } else if (appointment.appointmentType === 'IPD') {
      totalIpdCount++;
      totalIpdAmount += getPaidAmount(appointment);
    } else if (appointment.appointmentType === 'Pathology') {
      totalPathologyCount++;
      totalPathologyAmount += appointment.amount || 0;
    }
  });
  return { totalOpdCount, totalOpdAmount, totalIpdCount, totalIpdAmount, totalPathologyCount, totalPathologyAmount };
};

// Calculate payment breakdown (cash and online) for OPD and IPD appointments
const calculatePaymentBreakdowns = (apps: Appointment[]) => {
  let opdCash = 0,
    opdOnline = 0,
    ipdCash = 0,
    ipdOnline = 0;
  apps.forEach((appointment) => {
    if (appointment.appointmentType === 'OPD') {
      const opdApp = appointment as OPDAppointment;
      if (opdApp.paymentMethod?.toLowerCase() === 'cash') {
        opdCash += opdApp.amount;
      } else if (opdApp.paymentMethod?.toLowerCase() === 'online') {
        opdOnline += opdApp.amount;
      }
    } else if (appointment.appointmentType === 'IPD') {
      const ipdApp = appointment as IPDAppointment;
      if (ipdApp.payments) {
        Object.values(ipdApp.payments).forEach((p) => {
          if (p.paymentType.toLowerCase() === 'cash') {
            ipdCash += Number(p.amount);
          } else if (p.paymentType.toLowerCase() === 'online') {
            ipdOnline += Number(p.amount);
          }
        });
      }
    }
  });
  return { opdCash, opdOnline, ipdCash, ipdOnline };
};

// ----- Dashboard Component -----

const DashboardPage: React.FC = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [filteredAppointments, setFilteredAppointments] = useState<Appointment[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isTodayFilter, setIsTodayFilter] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [monthsDataOPD, setMonthsDataOPD] = useState<{ [key: string]: number }>({});
  const [monthsDataIPD, setMonthsDataIPD] = useState<{ [key: string]: number }>({});

  // Totals for amounts (from calculateTotals are kept for backwards compatibility)
  const [totalAmountIPD, setTotalAmountIPD] = useState<number>(0);
  const [totalAmountOPD, setTotalAmountOPD] = useState<number>(0);
  const [totalAmountPathology, setTotalAmountPathology] = useState<number>(0);

  // New state for counts and payment breakdowns
  const [opdCount, setOpdCount] = useState<number>(0);
  const [ipdCount, setIpdCount] = useState<number>(0);
  const [pathologyCount, setPathologyCount] = useState<number>(0);
  const [opdCash, setOpdCash] = useState<number>(0);
  const [opdOnline, setOpdOnline] = useState<number>(0);
  const [ipdCash, setIpdCash] = useState<number>(0);
  const [ipdOnline, setIpdOnline] = useState<number>(0);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  // Doctors data
  const [doctors, setDoctors] = useState<{ [key: string]: Doctor }>({});

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

  // Fetch all appointments from "patients" node and flatten nested appointments
  useEffect(() => {
    const patientsRef = ref(db, 'patients');
    const unsubscribePatients = onValue(patientsRef, (snapshot) => {
      const data = snapshot.val();
      const allAppointments: Appointment[] = [];
      if (data) {
        Object.entries(data).forEach(([uhid, patientData]: [string, any]) => {
          const patient: PatientRecord = { uhid, ...patientData };

          // OPD Appointments
          if (patient.opd) {
            Object.entries(patient.opd).forEach(([id, opdEntry]) => {
              const appointment: OPDAppointment = {
                id: `${uhid}_opd_${id}`,
                name: patient.name,
                phone: patient.phone,
                date: opdEntry.date || '',
                time: opdEntry.time || '-',
                doctor: getDoctorName(opdEntry.doctor, doctors),
                appointmentType: 'OPD',
                amount: Number(opdEntry.amount) || 0,
                serviceName: opdEntry.serviceName || '',
                paymentMethod: opdEntry.paymentMethod || 'cash',
              };
              allAppointments.push(appointment);
            });
          }
          // IPD Appointments
          if (patient.ipd) {
            Object.entries(patient.ipd).forEach(([id, ipdEntry]) => {
              const appointment: IPDAppointment = {
                id: `${uhid}_ipd_${id}`,
                name: patient.name,
                phone: patient.phone,
                date: ipdEntry.date || '',
                time: ipdEntry.time || '-',
                doctor: getDoctorName(ipdEntry.doctor, doctors),
                appointmentType: 'IPD',
                admissionType: ipdEntry.admissionType || '',
                age: Number(ipdEntry.age) || 0,
                bloodGroup: ipdEntry.bloodGroup || '',
                dateOfBirth: ipdEntry.dateOfBirth || '',
                dischargeDate: ipdEntry.dischargeDate || '',
                emergencyMobileNumber: ipdEntry.emergencyMobileNumber || '',
                gender: ipdEntry.gender || '',
                membershipType: ipdEntry.membershipType || '',
                paymentMode: ipdEntry.paymentMode || '',
                paymentType: ipdEntry.paymentType || '',
                referralDoctor: ipdEntry.referralDoctor || '',
                roomType: ipdEntry.roomType || '',
                amount: Number(ipdEntry.amount) || 0,
                payments: ipdEntry.payments || {},
                services: Array.isArray(ipdEntry.services) ? ipdEntry.services : [],
              };
              allAppointments.push(appointment);
            });
          }
          // Pathology Appointments
          if (patient.pathology) {
            Object.entries(patient.pathology).forEach(([id, pathologyEntry]) => {
              const appointment: PathologyAppointment = {
                id: `${uhid}_path_${id}`,
                name: patient.name,
                phone: patient.phone,
                date: pathologyEntry.timestamp
                  ? new Date(pathologyEntry.timestamp).toISOString()
                  : new Date().toISOString(),
                time: '',
                doctor: 'N/A',
                appointmentType: 'Pathology',
                bloodTestName: pathologyEntry.bloodTestName || '',
                amount: Number(pathologyEntry.amount) || 0,
                age: Number(patient.age) || 0,
              };
              allAppointments.push(appointment);
            });
          }
          // Surgery Appointments
          if (patient.surgery) {
            Object.entries(patient.surgery).forEach(([id, surgeryEntry]) => {
              const appointment: SurgeryAppointment = {
                id: `${uhid}_surg_${id}`,
                name: patient.name,
                phone: patient.phone,
                date: surgeryEntry.surgeryDate || '',
                time: '',
                doctor: 'N/A',
                appointmentType: 'Surgery',
                surgeryTitle: surgeryEntry.surgeryTitle || '',
                finalDiagnosis: surgeryEntry.finalDiagnosis || '',
              };
              allAppointments.push(appointment);
            });
          }
        });
      }
      setAppointments(allAppointments);
      setFilteredAppointments(allAppointments);
      generateMonthsData(allAppointments);
      const totals = calculateTotals(allAppointments);
      setTotalAmountIPD(totals.totalIpdAmount);
      setTotalAmountOPD(totals.totalOpdAmount);
      setTotalAmountPathology(totals.totalPathologyAmount);
      setOpdCount(totals.totalOpdCount);
      setIpdCount(totals.totalIpdCount);
      setPathologyCount(totals.totalPathologyCount);

      const paymentBreakdown = calculatePaymentBreakdowns(allAppointments);
      setOpdCash(paymentBreakdown.opdCash);
      setOpdOnline(paymentBreakdown.opdOnline);
      setIpdCash(paymentBreakdown.ipdCash);
      setIpdOnline(paymentBreakdown.ipdOnline);
    });
    return () => {
      unsubscribePatients();
    };
  }, [doctors]);

  // Generate monthly data for charts (OPD & IPD)
  const generateMonthsData = (apps: Appointment[]) => {
    const dataOPD: { [key: string]: number } = {};
    const dataIPD: { [key: string]: number } = {};
    apps.forEach((appointment) => {
      if (!appointment.date) return;
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

  // Apply filters with updated date filter logic for IPD appointments
  const applyFilters = useCallback(
    (query: string, month: string, today: boolean, date: string) => {
      let temp = [...appointments];
      if (query) {
        const lowerQuery = query.toLowerCase();
        temp = temp.filter(
          (app) =>
            app.name.toLowerCase().includes(lowerQuery) ||
            app.phone.includes(query)
        );
      }
      if (month !== 'All') {
        temp = temp.filter((app) => {
          const appMonth = format(parseISO(app.date), 'MMMM');
          return appMonth === month;
        });
      }
      if (today && date === '') {
        // If "today" filter is applied without a specific date,
        // we compare with the current system date.
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        temp = temp.filter(
          (app) => format(parseISO(app.date), 'yyyy-MM-dd') === todayStr
        );
      }
      if (date) {
        temp = temp.filter((app) => {
          const appointmentDate = format(parseISO(app.date), 'yyyy-MM-dd');
          if (app.appointmentType === 'IPD') {
            const ipdApp = app as IPDAppointment;
            const paymentDateMatch =
              ipdApp.payments &&
              Object.values(ipdApp.payments).some(
                (p) => p.date && format(parseISO(p.date), 'yyyy-MM-dd') === date
              );
            return appointmentDate === date || paymentDateMatch;
          }
          return appointmentDate === date;
        });
      }
      setFilteredAppointments(temp);
      generateMonthsData(temp);
      const totals = calculateTotals(temp);
      setTotalAmountIPD(totals.totalIpdAmount);
      setTotalAmountOPD(totals.totalOpdAmount);
      setTotalAmountPathology(totals.totalPathologyAmount);
      setOpdCount(totals.totalOpdCount);
      setIpdCount(totals.totalIpdCount);
      setPathologyCount(totals.totalPathologyCount);
      const paymentBreakdown = calculatePaymentBreakdowns(temp);
      setOpdCash(paymentBreakdown.opdCash);
      setOpdOnline(paymentBreakdown.opdOnline);
      setIpdCash(paymentBreakdown.ipdCash);
      setIpdOnline(paymentBreakdown.ipdOnline);
    },
    [appointments]
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      setSearchQuery(q);
      applyFilters(q, selectedMonth, isTodayFilter, selectedDate);
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
    const d = e.target.value;
    setSelectedDate(d);
    setIsTodayFilter(false);
    setSelectedMonth('All');
    applyFilters(searchQuery, 'All', false, d);
  };

  // For "today" appointments display, we use current system date
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayAppointments = useMemo(() => {
    return appointments.filter(
      (app) => format(parseISO(app.date), 'yyyy-MM-dd') === todayStr
    );
  }, [appointments, todayStr]);

  // Chart data for OPD and IPD
  const chartDataOPD = {
    labels: Object.keys(monthsDataOPD),
    datasets: [
      {
        label: 'OPD Appointments',
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
        label: 'IPD Appointments',
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
        <meta name="description" content="View and manage all OPD, IPD, Pathology, and Surgery appointments" />
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
                  const totals = calculateTotals(appointments);
                  setTotalAmountIPD(totals.totalIpdAmount);
                  setTotalAmountOPD(totals.totalOpdAmount);
                  setTotalAmountPathology(totals.totalPathologyAmount);
                  setOpdCount(totals.totalOpdCount);
                  setIpdCount(totals.totalIpdCount);
                  setPathologyCount(totals.totalPathologyCount);
                  const paymentBreakdown = calculatePaymentBreakdowns(appointments);
                  setOpdCash(paymentBreakdown.opdCash);
                  setOpdOnline(paymentBreakdown.opdOnline);
                  setIpdCash(paymentBreakdown.ipdCash);
                  setIpdOnline(paymentBreakdown.ipdOnline);
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
                Today Appointments
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

            {/* OPD Appointments Card */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-700 mb-2">OPD Appointments</h2>
              <p className="text-gray-600">Total Count: <span className="font-bold">{opdCount}</span></p>
              <p className="text-gray-600">Total Amount: <span className="font-bold text-indigo-600">{formatCurrency(totalAmountOPD)}</span></p>
              <p className="text-gray-600">Cash: <span className="font-bold">{formatCurrency(opdCash)}</span></p>
              <p className="text-gray-600">Online: <span className="font-bold">{formatCurrency(opdOnline)}</span></p>
            </div>

            {/* IPD Appointments Card */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-700 mb-2">IPD Appointments</h2>
              <p className="text-gray-600">Total Count: <span className="font-bold">{ipdCount}</span></p>
              <p className="text-gray-600">Total Amount: <span className="font-bold text-green-600">{formatCurrency(totalAmountIPD)}</span></p>
              <p className="text-gray-600">Cash: <span className="font-bold">{formatCurrency(ipdCash)}</span></p>
              <p className="text-gray-600">Online: <span className="font-bold">{formatCurrency(ipdOnline)}</span></p>
            </div>

            {/* Pathology Appointments Card */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-700 mb-2">Pathology Tests</h2>
              <p className="text-gray-600">Total Count: <span className="font-bold">{pathologyCount}</span></p>
              <p className="text-gray-600">Total Amount: <span className="font-bold text-yellow-600">{formatCurrency(totalAmountPathology)}</span></p>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
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
                        {appointment.doctor.toUpperCase()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{appointment.appointmentType}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(getPaidAmount(appointment))}
                      </td>
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
                    <td colSpan={8} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
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
                      position: 'top',
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
                      position: 'top',
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
                              <p><strong>Total Amount Paid:</strong> {formatCurrency(getPaidAmount(ipd))}</p>
                              {ipd.payments && (
                                <>
                                  <strong>Payment Breakdown:</strong>
                                  <ul className="list-disc list-inside space-y-1">
                                    {Object.values(ipd.payments).map((p, index) => (
                                      <li key={index} className="text-gray-700">
                                        {p.paymentType}: {formatCurrency(p.amount)}
                                      </li>
                                    ))}
                                  </ul>
                                </>
                              )}
                              <strong>Services:</strong>
                              <ul className="list-disc list-inside space-y-1">
                                {ipd.services.map((service, index) => (
                                  <li key={index} className="text-gray-700">
                                    {service.serviceName} - {formatCurrency(service.amount)} - {service.status}
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
                            <p><strong>Service Name:</strong> {opd.serviceName || '-'}</p>
                            <p><strong>Payment Method:</strong> {opd.paymentMethod}</p>
                            <p><strong>Amount Paid:</strong> {formatCurrency(opd.amount)}</p>
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
                            <p><strong>Amount Paid:</strong> {formatCurrency(path.amount)}</p>
                            <p><strong>Age:</strong> {path.age}</p>
                          </div>
                        );
                      })()}
                    </>
                  )}

                  {selectedAppointment.appointmentType === 'Surgery' && (
                    <>
                      <Dialog.Title className="text-2xl font-bold mb-4 text-gray-800">Surgery Appointment Details</Dialog.Title>
                      {(() => {
                        const surg = selectedAppointment as SurgeryAppointment;
                        return (
                          <div className="space-y-2">
                            <p><strong>Name:</strong> {surg.name}</p>
                            <p><strong>Phone:</strong> {surg.phone}</p>
                            <p><strong>Date:</strong> {format(parseISO(surg.date), 'dd MMM yyyy')}</p>
                            <p><strong>Surgery Title:</strong> {surg.surgeryTitle}</p>
                            <p><strong>Final Diagnosis:</strong> {surg.finalDiagnosis}</p>
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
