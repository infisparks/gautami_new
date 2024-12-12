// app/admin/dashboard/page.tsx

"use client";

import React, { useState, useEffect, useRef } from "react";
import { db } from "../../lib/firebase";
import { ref, onValue, remove } from "firebase/database";
import Head from "next/head";
import { format, isSameDay, parseISO } from "date-fns";
import { AiOutlineSearch, AiOutlineDelete, AiOutlineEye, AiOutlineDownload, AiOutlineFilePdf } from "react-icons/ai";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// Define the shape of your booking data
interface IBookingEntry {
  id: string; // Firebase unique key
  name: string;
  phone: string;
  age?: number;
  bloodTestName: string;
  amount: number;
  timestamp: number;
  createdAt: string; // ISO string
  date: string; // ISO string
  doctor: string;
  email: string;
  message: string;
  paymentMethod: string;
  serviceName: string;
  time: string; // Formatted time
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

const DashboardPage: React.FC = () => {
  const [bookings, setBookings] = useState<IBookingEntry[]>([]);
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
      const bookingsList: IBookingEntry[] = [];
      if (data) {
        Object.keys(data).forEach((key) => {
          bookingsList.push({
            id: key,
            name: data[key].name,
            phone: data[key].phone,
            age: data[key].age,
            bloodTestName: data[key].serviceName || data[key].bloodTestName,
            amount: data[key].amount,
            timestamp: new Date(data[key].date).getTime(),
            createdAt: data[key].createdAt,
            date: data[key].date,
            doctor: data[key].doctor,
            email: data[key].email,
            message: data[key].message,
            paymentMethod: data[key].paymentMethod,
            serviceName: data[key].serviceName,
            time: data[key].time,
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
    const mergedPatients: IPatient[] = [];

    bookings.forEach((booking) => {
      mergedPatients.push({
        id: booking.id,
        name: booking.name,
        phone: booking.phone,
        type: "OPD",
        date: booking.date,
        doctor: booking.doctor,
      });
    });

    ipdBookings.forEach((ipd) => {
      mergedPatients.push({
        id: ipd.id,
        name: ipd.name,
        phone: ipd.phone,
        type: "IPD",
        date: ipd.date,
        doctor: ipd.doctor,
      });
    });

    bloodTests.forEach((bt) => {
      mergedPatients.push({
        id: bt.id,
        name: bt.name,
        phone: bt.phone,
        type: "Blood Test",
        date: bt.date,
        doctor: bt.doctor,
      });
    });

    setPatients(mergedPatients);
    setFilteredPatients(mergedPatients);
  }, [bookings, ipdBookings, bloodTests]);

  // Create doctor map
  const doctorMap = useRef<{ [key: string]: string }>({});

  useEffect(() => {
    const map: { [key: string]: string } = {};
    doctors.forEach((doctor) => {
      map[doctor.id] = doctor.name;
    });
    doctorMap.current = map;
  }, [doctors]);

  // Handle search and filters
  useEffect(() => {
    let tempPatients = [...patients];

    // Filter by type
    if (selectedType !== "all") {
      tempPatients = tempPatients.filter(
        (patient) => patient.type.toLowerCase() === selectedType
      );
    }

    // Filter by date
    if (selectedDate) {
      const parsedDate = parseISO(selectedDate);
      tempPatients = tempPatients.filter((patient) =>
        isSameDay(new Date(patient.date), parsedDate)
      );
    }

    // Search by name or phone
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

  // Handle search input without debounce
  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  // Export to Excel
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
  };

  // Export to PDF
  const exportToPDF = () => {
    const doc = new jsPDF();
    const tableColumn = ["Patient Name", "Phone Number", "Type", "Date", "Doctor"];
    const tableRows: string[][] = [];

    filteredPatients.forEach((patient) => {
      const patientData: string[] = [
        patient.name,
        patient.phone,
        patient.type,
        format(parseISO(patient.date), "PPP"),
        doctorMap.current[patient.doctor] || "N/A",
      ];
      tableRows.push(patientData);
    });

    // Add title
    doc.text("Patient Management Report", 14, 15);
    
    // Add table
    // doc.autoTable({
    //   head: [tableColumn],
    //   body: tableRows,
    //   startY: 20,
    //   theme: 'grid',
    //   styles: {
    //     font: 'helvetica',
    //     fontSize: 10,
    //     textColor: [0, 0, 0],
    //   },
    // });

    doc.save(`Patient_Management_${format(new Date(), "yyyyMMdd_HHmmss")}.pdf`);
  };

  // Delete patient booking (if needed)
  const deletePatient = async (id: string, type: string) => {
    if (confirm("Are you sure you want to delete this booking?")) {
      try {
        let path = "";
        if (type === "OPD" || type === "Blood Test") {
          path = type === "Blood Test" ? `bloodTests/${id}` : `bookings/${id}`;
        } else if (type === "IPD") {
          path = `ipd_bookings/${id}`;
        }
        if (path) {
          const bookingRef = ref(db, path);
          await remove(bookingRef);
          toast.success("Booking deleted successfully!", {
            position: "top-right",
            autoClose: 3000,
          });
        }
      } catch (error) {
        console.error("Error deleting booking:", error);
        toast.error("Failed to delete booking.", {
          position: "top-right",
          autoClose: 3000,
        });
      }
    }
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
            <div className="flex justify-center items-center">
              <div className="loader ease-linear rounded-full border-8 border-t-8 border-gray-200 h-16 w-16"></div>
            </div>
          ) : (
            <>
              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
                {/* Search */}
                <div className="bg-white p-4 rounded-lg shadow flex items-center">
                  <AiOutlineSearch className="text-gray-400 mr-2" size={24} />
                  <input
                    type="text"
                    placeholder="Search by Name or Phone"
                    onChange={(e) => handleSearch(e.target.value)}
                    className="w-full px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                {/* Type Filter */}
                <div className="bg-white p-4 rounded-lg shadow">
                  <label className="block text-gray-700 mb-2">Filter by Type</label>
                  <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="w-full px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="all">All</option>
                    <option value="opd">OPD</option>
                    <option value="ipd">IPD</option>
                    <option value="blood test">Blood Test</option>
                  </select>
                </div>

                {/* Date Filter */}
                <div className="bg-white p-4 rounded-lg shadow">
                  <label className="block text-gray-700 mb-2">Filter by Date</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                {/* Export Buttons */}
                <div className="bg-white p-4 rounded-lg shadow flex flex-col space-y-2 justify-end">
                  <button
                    onClick={exportToExcel}
                    className="flex items-center bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition duration-200"
                  >
                    <AiOutlineDownload className="mr-2" size={20} />
                    Download Excel
                  </button>
                  <button
                    onClick={exportToPDF}
                    className="flex items-center bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition duration-200"
                  >
                    <AiOutlineFilePdf className="mr-2" size={20} />
                    Download PDF
                  </button>
                </div>
              </div>

              {/* Patients Table */}
              <div className="bg-white p-6 rounded-lg shadow overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className="py-2 px-4 border-b">Name</th>
                      <th className="py-2 px-4 border-b">Phone Number</th>
                      <th className="py-2 px-4 border-b">Type</th>
                      <th className="py-2 px-4 border-b">Date</th>
                      <th className="py-2 px-4 border-b">Doctor</th>
                      <th className="py-2 px-4 border-b">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPatients.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-4">
                          No patients found.
                        </td>
                      </tr>
                    ) : (
                      filteredPatients.map((patient) => (
                        <tr key={patient.id} className="text-center">
                          <td className="py-2 px-4 border-b">{patient.name}</td>
                          <td className="py-2 px-4 border-b">{patient.phone}</td>
                          <td className="py-2 px-4 border-b">{patient.type}</td>
                          <td className="py-2 px-4 border-b">
                            {format(parseISO(patient.date), "PPP")}
                          </td>
                          <td className="py-2 px-4 border-b">
                            {doctorMap.current[patient.doctor] || "N/A"}
                          </td>
                          <td className="py-2 px-4 border-b flex justify-center space-x-2">
                            <button
                              onClick={() => {
                                // Implement view details if needed
                                toast.info("View Details feature not implemented.", {
                                  position: "top-right",
                                  autoClose: 3000,
                                });
                              }}
                              className="text-blue-500 hover:text-blue-700"
                              title="View Details"
                            >
                              <AiOutlineEye size={20} />
                            </button>
                            <button
                              onClick={() => deletePatient(patient.id, patient.type)}
                              className="text-red-500 hover:text-red-700"
                              title="Delete Booking"
                            >
                              <AiOutlineDelete size={20} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
};

export default DashboardPage;
