"use client";

import React, { useState, useEffect, useRef } from "react";
import { db } from "../../lib/firebase";
import { ref, onValue } from "firebase/database";
import Head from "next/head";
import { format, isSameDay, parseISO } from "date-fns";
import { Search, Download, FileText, Calendar, User, Activity,  Users } from 'lucide-react';
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";

// Interfaces remain unchanged
interface IBooking {
  id: string;
  name: string;
  phone: string;
  serviceName: string;
  amount: number;
  date: string;
  doctor: string;
}

interface IIPDBooking {
  id: string;
  name: string;
  phone: string;
  admissionType: string;
  amount: number;
  date: string;
  doctor: string;
}

interface IBloodTest {
  id: string;
  name: string;
  phone: string;
  bloodTestName: string;
  amount: number;
  date: string;
  doctor: string;
}

interface IDoctor {
  id: string;
  name: string;
}

interface IPatient {
  id: string;
  name: string;
  phone: string;
  type: string;
  date: string;
  doctor: string;
}

const PatientManagement: React.FC = () => {
  const [bookings, setBookings] = useState<IBooking[]>([]);
  const [ipdBookings, setIPDBookings] = useState<IIPDBooking[]>([]);
  const [bloodTests, setBloodTests] = useState<IBloodTest[]>([]);
  const [doctors, setDoctors] = useState<IDoctor[]>([]);
  const [patients, setPatients] = useState<IPatient[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<IPatient[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  // Fetch doctors
  useEffect(() => {
    const doctorsRef = ref(db, "doctors");
    const unsubscribe = onValue(doctorsRef, (snapshot) => {
      const data = snapshot.val();
      const doctorsList: IDoctor[] = [];
      if (data) {
        Object.keys(data).forEach((key) => {
          doctorsList.push({
            id: key,
            name: data[key].name,
          });
        });
      }
      setDoctors(doctorsList);
    });
    return () => unsubscribe();
  }, []);

  // Fetch bookings
  useEffect(() => {
    const bookingsRef = ref(db, "bookings");
    const unsubscribe = onValue(bookingsRef, (snapshot) => {
      const data = snapshot.val();
      const bookingsList: IBooking[] = [];
      if (data) {
        Object.keys(data).forEach((key) => {
          bookingsList.push({
            id: key,
            name: data[key].name,
            phone: data[key].phone,
            serviceName: data[key].serviceName,
            amount: data[key].amount,
            date: data[key].date,
            doctor: data[key].doctor,
          });
        });
      }
      setBookings(bookingsList);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch IPD bookings
  useEffect(() => {
    const ipdRef = ref(db, "ipd_bookings");
    const unsubscribe = onValue(ipdRef, (snapshot) => {
      const data = snapshot.val();
      const ipdList: IIPDBooking[] = [];
      if (data) {
        Object.keys(data).forEach((key) => {
          ipdList.push({
            id: key,
            name: data[key].name,
            phone: data[key].mobileNumber,
            admissionType: data[key].admissionType,
            amount: parseFloat(data[key].amount),
            date: data[key].date,
            doctor: data[key].doctor,
          });
        });
      }
      setIPDBookings(ipdList);
    });
    return () => unsubscribe();
  }, []);

  // Fetch Blood Tests
  useEffect(() => {
    const bloodTestsRef = ref(db, "bloodTests");
    const unsubscribe = onValue(bloodTestsRef, (snapshot) => {
      const data = snapshot.val();
      const bloodTestList: IBloodTest[] = [];
      if (data) {
        Object.keys(data).forEach((key) => {
          bloodTestList.push({
            id: key,
            name: data[key].name,
            phone: data[key].phone,
            bloodTestName: data[key].bloodTestName,
            amount: data[key].amount,
            date: data[key].date || new Date().toISOString(),
            doctor: data[key].doctor,
          });
        });
      }
      setBloodTests(bloodTestList);
    });
    return () => unsubscribe();
  }, []);

  // Merge all patients
  useEffect(() => {
    const mergedPatients: IPatient[] = [
      ...bookings.map((booking) => ({
        id: booking.id,
        name: booking.name,
        phone: booking.phone,
        type: "OPD",
        date: booking.date,
        doctor: booking.doctor,
      })),
      ...ipdBookings.map((ipd) => ({
        id: ipd.id,
        name: ipd.name,
        phone: ipd.phone,
        type: "IPD",
        date: ipd.date,
        doctor: ipd.doctor,
      })),
      ...bloodTests.map((bt) => ({
        id: bt.id,
        name: bt.name,
        phone: bt.phone,
        type: "Pathology",
        date: bt.date,
        doctor: bt.doctor,
      })),
    ];

    setPatients(mergedPatients);
    setFilteredPatients(mergedPatients);
  }, [bookings, ipdBookings, bloodTests]);

  // Create doctor map
  const doctorMap = useRef<{ [key: string]: string }>({});

  useEffect(() => {
    doctorMap.current = doctors.reduce((acc, doctor) => {
      acc[doctor.id] = doctor.name;
      return acc;
    }, {} as { [key: string]: string });
  }, [doctors]);

  // Handle search and filters
  useEffect(() => {
    let tempPatients = patients;

    if (selectedType !== "all") {
      tempPatients = tempPatients.filter(
        (patient) => patient.type.toLowerCase() === selectedType
      );
    }

    if (selectedDate) {
      const parsedDate = parseISO(selectedDate);
      tempPatients = tempPatients.filter((patient) =>
        isSameDay(new Date(patient.date), parsedDate)
      );
    }

    if (searchQuery.trim() !== "") {
      const lowerQuery = searchQuery.toLowerCase();
      tempPatients = tempPatients.filter(
        (patient) =>
          patient.name.toLowerCase().includes(lowerQuery) ||
          patient.phone.includes(lowerQuery)
      );
    }

    setFilteredPatients(tempPatients);
  }, [searchQuery, selectedType, selectedDate, patients]);

  const handleSearchInput = (query: string) => {
    setSearchQuery(query);
  };

  const exportToExcel = () => {
    const dataToExport = filteredPatients.map((patient) => ({
      "Patient Name": patient.name,
      "Phone Number": patient.phone,
      Type: patient.type,
      Date: format(parseISO(patient.date), "PPP"),
      Doctor: doctorMap.current[patient.doctor] || "N/A",
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Patients");
    XLSX.writeFile(workbook, "Patient_Management.xlsx");
    toast.success("Excel file downloaded successfully!");
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Patient Management Report", 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);

    const tableColumn = ["Name", "Phone", "Type", "Date", "Doctor"];
    const tableRows = filteredPatients.map((patient) => [
      patient.name,
      patient.phone,
      patient.type,
      format(parseISO(patient.date), "PPP"),
      doctorMap.current[patient.doctor] || "N/A",
    ]);

    (doc as any).autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: 30,
      headStyles: { fillColor: [22, 160, 133] },
      alternateRowStyles: { fillColor: [242, 242, 242] },
      styles: { fontSize: 9 },
    });

    doc.save(`Patient_Management_${format(new Date(), "yyyyMMdd_HHmmss")}.pdf`);
    toast.success("PDF file downloaded successfully!");
  };

  return (
    <>
      <Head>
        <title>Patient Management - Admin Dashboard</title>
        <meta name="description" content="Admin Dashboard for Patient Management" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ToastContainer />

      <main className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold text-center text-green-600 mb-10">
            Patient Management Dashboard
          </h1>

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-green-500"></div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                <div className="bg-white p-6 rounded-lg shadow-md">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-gray-800">Total Patients</h2>
                    <Users className="text-green-500" size={24} />
                  </div>
                  <p className="text-3xl font-bold text-gray-900">{patients.length}</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-md">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-gray-800">OPD Patients</h2>
                    <User className="text-blue-500" size={24} />
                  </div>
                  <p className="text-3xl font-bold text-gray-900">
                    {patients.filter((p) => p.type === "OPD").length}
                  </p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-md">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-gray-800">IPD Patients</h2>
                    <Activity className="text-red-500" size={24} />
                  </div>
                  <p className="text-3xl font-bold text-gray-900">
                    {patients.filter((p) => p.type === "IPD").length}
                  </p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-md">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-gray-800">Pathology Tests</h2>
                    <FileText className="text-yellow-500" size={24} />
                  </div>
                  <p className="text-3xl font-bold text-gray-900">
                    {patients.filter((p) => p.type === "Pathology").length}
                  </p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-md mb-10">
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
                  <div className="col-span-1 md:col-span-3 lg:col-span-2">
                    <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
                      Search Patients
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        id="search"
                        placeholder="Search by Name or Phone"
                        onChange={(e) => handleSearchInput(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                      <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
                      Filter by Type
                    </label>
                    <select
                      id="type"
                      value={selectedType}
                      onChange={(e) => setSelectedType(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="all">All</option>
                      <option value="opd">OPD</option>
                      <option value="ipd">IPD</option>
                      <option value="pathology">Pathology</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">
                      Filter by Date
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        id="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                      <Calendar className="absolute left-3 top-2.5 text-gray-400" size={20} />
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={exportToExcel}
                      className="flex items-center justify-center bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600 transition duration-300 ease-in-out w-full"
                    >
                      <Download className="mr-2" size={20} />
                      Excel
                    </button>
                    <button
                      onClick={exportToPDF}
                      className="flex items-center justify-center bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition duration-300 ease-in-out w-full"
                    >
                      <FileText className="mr-2" size={20} />
                      PDF
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Phone Number
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Doctor
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredPatients.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                            No patients found.
                          </td>
                        </tr>
                      ) : (
                        filteredPatients.map((patient) => (
                          <tr key={patient.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="flex-shrink-0 h-10 w-10">
                                  <User className="h-10 w-10 rounded-full text-gray-300" />
                                </div>
                                <div className="ml-4">
                                  <div className="text-sm font-medium text-gray-900">{patient.name}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{patient.phone}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                patient.type === 'OPD' ? 'bg-green-100 text-green-800' :
                                patient.type === 'IPD' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-blue-100 text-blue-800'
                              }`}>
                                {patient.type}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {format(parseISO(patient.date), "PPP")}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {doctorMap.current[patient.doctor] || "N/A"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
};

export default PatientManagement;

