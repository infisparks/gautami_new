// app/admin/dashboard/page.tsx

"use client";

import React, { useState, useEffect, useRef } from "react";
import { db } from "../../lib/firebase";
import { ref, onValue, remove } from "firebase/database";
import Head from "next/head";
import { format, isSameDay, subDays, parseISO } from "date-fns";
import { Line, Bar } from "react-chartjs-2";
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
import { AiOutlineSearch, AiOutlineDelete, AiOutlineEye } from "react-icons/ai";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

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

// Define the shape of an OPD appointment from the new data structure
interface IOPDEntry {
  id: string; // Composite key: `${uhid}_opd_${opdKey}`
  uhid: string; // Patient UID (key from "patients")
  opdKey: string; // The key of the OPD entry under the patient node
  name: string;
  phone: string;
  serviceName: string;
  amount: number;
  createdAt: string;
  date: string; // ISO string
  doctor: string; // Doctor ID
  message: string;
  paymentMethod: string;
  time: string;
}

interface IDoctor {
  id: string;
  name: string;
  opdCharge?: number;
  // Other doctor fields if needed
}

const DashboardPage: React.FC = () => {
  // Set selectedDate default to empty to show all appointments by default.
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [opdAppointments, setOpdAppointments] = useState<IOPDEntry[]>([]);
  const [doctors, setDoctors] = useState<IDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalRevenue, setTotalRevenue] = useState<number>(0);
  const [appointmentsOnSelectedDate, setAppointmentsOnSelectedDate] = useState<IOPDEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filteredAppointments, setFilteredAppointments] = useState<IOPDEntry[]>([]);
  const [selectedAppointment, setSelectedAppointment] = useState<IOPDEntry | null>(null);

  // Fetch OPD appointments from "patients" node
  useEffect(() => {
    const patientsRef = ref(db, "patients");
    const unsubscribePatients = onValue(patientsRef, (snapshot) => {
      const data = snapshot.val();
      const opdList: IOPDEntry[] = [];
      if (data) {
        // Loop over each patient
        Object.entries(data).forEach(([uhid, patientData]: [string, any]) => {
          const patient = patientData;
          // Check if the patient has OPD appointments
          if (patient.opd) {
            Object.entries(patient.opd).forEach(([opdKey, opdEntry]: [string, any]) => {
              opdList.push({
                id: `${uhid}_opd_${opdKey}`,
                uhid,
                opdKey,
                name: patient.name,
                phone: patient.phone,
                serviceName: opdEntry.serviceName || "",
                amount: Number(opdEntry.amount) || 0,
                createdAt: opdEntry.createdAt,
                date: opdEntry.date,
                doctor: opdEntry.doctor,
                message: opdEntry.message || "",
                paymentMethod: opdEntry.paymentMethod || "cash",
                time: opdEntry.time || "",
              });
            });
          }
        });
      }
      setOpdAppointments(opdList);
      setLoading(false);
    });

    return () => unsubscribePatients();
  }, []);

  // Fetch doctors from Firebase
  useEffect(() => {
    const doctorsRef = ref(db, "doctors");
    const unsubscribeDoctors = onValue(doctorsRef, (snapshot) => {
      const data = snapshot.val();
      const doctorsList: IDoctor[] = [];
      if (data) {
        Object.keys(data).forEach((key) => {
          const entry = data[key];
          doctorsList.push({
            id: key,
            name: entry.name,
            opdCharge: entry.opdCharge,
          });
        });
      }
      setDoctors(doctorsList);
    });

    return () => unsubscribeDoctors();
  }, []);

  // Create a map of doctor IDs to names for easy lookup
  const doctorMap = useRef<{ [key: string]: string }>({});

  useEffect(() => {
    const map: { [key: string]: string } = {};
    doctors.forEach((doctor) => {
      map[doctor.id] = doctor.name;
    });
    doctorMap.current = map;
  }, [doctors]);

  // Filter appointments based on the selected date.
  // If no date is selected (empty string), show all appointments.
  useEffect(() => {
    if (selectedDate === "") {
      setAppointmentsOnSelectedDate(opdAppointments);
      const revenue = opdAppointments.reduce((acc, appt) => acc + appt.amount, 0);
      setTotalRevenue(revenue);
    } else {
      const parsedDate = parseISO(selectedDate);
      const filtered = opdAppointments.filter((appt) =>
        isSameDay(new Date(appt.date), parsedDate)
      );
      setAppointmentsOnSelectedDate(filtered);
      const revenue = filtered.reduce((acc, appt) => acc + appt.amount, 0);
      setTotalRevenue(revenue);
    }
  }, [selectedDate, opdAppointments]);

  // Handle search by patient name or phone
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim() === "") {
      setFilteredAppointments([]);
    } else {
      const lowerQuery = query.toLowerCase();
      const filtered = opdAppointments.filter(
        (appt) =>
          appt.name.toLowerCase().includes(lowerQuery) ||
          appt.phone.toLowerCase().includes(lowerQuery)
      );
      setFilteredAppointments(filtered);
    }
  };

  // Calculate last 10 days for charts
  const last10Days = Array.from({ length: 10 }, (_, i) =>
    subDays(new Date(), 9 - i)
  );

  // Count of appointments over the last 10 days
  const appointmentsLast10Days = last10Days.map((day) =>
    opdAppointments.filter((appt) => isSameDay(new Date(appt.date), day)).length
  );

  // Revenue over the last 10 days
  const revenueLast10Days = last10Days.map((day) =>
    opdAppointments
      .filter((appt) => isSameDay(new Date(appt.date), day))
      .reduce((acc, appt) => acc + appt.amount, 0)
  );

  // Delete an OPD appointment
  const deleteAppointment = async (uhid: string, opdKey: string) => {
    if (confirm("Are you sure you want to delete this OPD appointment?")) {
      try {
        const opdRef = ref(db, `patients/${uhid}/opd/${opdKey}`);
        await remove(opdRef);
        toast.success("OPD appointment deleted successfully!", {
          position: "top-right",
          autoClose: 3000,
        });
      } catch (error) {
        console.error("Error deleting OPD appointment:", error);
        toast.error("Failed to delete OPD appointment.", {
          position: "top-right",
          autoClose: 3000,
        });
      }
    }
  };

  return (
    <>
      <Head>
        <title>Admin Dashboard - OPD Appointments</title>
        <meta name="description" content="OPD Appointments Admin Dashboard" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ToastContainer />

      <main className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold text-center text-green-600 mb-10">
            OPD Admin Dashboard
          </h1>

          {loading ? (
            <div className="flex justify-center items-center">
              <div className="loader ease-linear rounded-full border-8 border-t-8 border-gray-200 h-16 w-16"></div>
            </div>
          ) : (
            <>
              {/* Top Filters and Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                {/* Total Appointments Today */}
                <div className="bg-white p-6 rounded-lg shadow">
                  <h2 className="text-xl font-semibold text-gray-700 mb-4">
                    Appointments Today
                  </h2>
                  <p className="text-3xl font-bold text-green-600">
                    {opdAppointments.filter((appt) =>
                      isSameDay(new Date(appt.date), new Date())
                    ).length}
                  </p>
                </div>

                {/* Total Revenue */}
                <div className="bg-white p-6 rounded-lg shadow">
                  <h2 className="text-xl font-semibold text-gray-700 mb-4">
                    {selectedDate === ""
                      ? "All Appointments Revenue"
                      : `Total Revenue on ${format(parseISO(selectedDate), "PPP")}`}
                  </h2>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 mb-4"
                  />
                  <p className="text-2xl font-bold text-green-600">
                    Rs {totalRevenue}
                  </p>
                </div>

                {/* Search Functionality */}
                <div className="bg-white p-6 rounded-lg shadow flex items-center">
                  <AiOutlineSearch className="text-gray-400 mr-2" size={24} />
                  <input
                    type="text"
                    placeholder="Search by Patient Name or Phone Number"
                    onChange={(e) => handleSearch(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              {/* Appointments on Selected Date / All Appointments */}
              <div className="bg-white p-6 rounded-lg shadow mb-10">
                <h2 className="text-xl font-semibold text-gray-700 mb-4">
                  {selectedDate === ""
                    ? "All Appointments"
                    : `Appointments on ${format(parseISO(selectedDate), "PPP")}`}
                </h2>
                {appointmentsOnSelectedDate.length === 0 ? (
                  <p className="text-gray-500">No appointments found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full bg-white">
                      <thead>
                        <tr>
                          <th className="py-2 px-4 border-b">Patient Name</th>
                          <th className="py-2 px-4 border-b">Patient Number</th>
                          <th className="py-2 px-4 border-b">Service Name</th>
                          <th className="py-2 px-4 border-b">Doctor</th>
                          <th className="py-2 px-4 border-b">Amount (Rs)</th>
                          <th className="py-2 px-4 border-b">Payment Method</th>
                          <th className="py-2 px-4 border-b">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {appointmentsOnSelectedDate.map((appt) => (
                          <tr key={appt.id} className="text-center">
                            <td className="py-2 px-4 border-b">{appt.name}</td>
                            <td className="py-2 px-4 border-b">{appt.phone}</td>
                            <td className="py-2 px-4 border-b">{appt.serviceName}</td>
                            <td className="py-2 px-4 border-b">
                              {doctorMap.current[appt.doctor] || "N/A"}
                            </td>
                            <td className="py-2 px-4 border-b">{appt.amount}</td>
                            <td className="py-2 px-4 border-b">{appt.paymentMethod}</td>
                            <td className="py-2 px-4 border-b flex justify-center space-x-2">
                              <button
                                onClick={() => setSelectedAppointment(appt)}
                                className="text-blue-500 hover:text-blue-700"
                                title="View Details"
                              >
                                <AiOutlineEye size={20} />
                              </button>
                              <button
                                onClick={() => deleteAppointment(appt.uhid, appt.opdKey)}
                                className="text-red-500 hover:text-red-700"
                                title="Delete Appointment"
                              >
                                <AiOutlineDelete size={20} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
                {/* Appointments in Last 10 Days */}
                <div className="bg-white p-6 rounded-lg shadow">
                  <h2 className="text-xl font-semibold text-gray-700 mb-4">
                    Appointments in Last 10 Days
                  </h2>
                  <Line
                    data={{
                      labels: last10Days.map((day) => format(day, "MMM dd")),
                      datasets: [
                        {
                          label: "Appointments",
                          data: appointmentsLast10Days,
                          fill: false,
                          backgroundColor: "rgba(16, 185, 129, 0.6)",
                          borderColor: "rgba(16, 185, 129, 1)",
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: { position: "top" as const },
                        title: { display: false },
                      },
                    }}
                  />
                </div>

                {/* Revenue in Last 10 Days */}
                <div className="bg-white p-6 rounded-lg shadow">
                  <h2 className="text-xl font-semibold text-gray-700 mb-4">
                    Revenue in Last 10 Days
                  </h2>
                  <Bar
                    data={{
                      labels: last10Days.map((day) => format(day, "MMM dd")),
                      datasets: [
                        {
                          label: "Revenue (Rs)",
                          data: revenueLast10Days,
                          backgroundColor: "rgba(34, 197, 94, 0.6)",
                          borderColor: "rgba(34, 197, 94, 1)",
                          borderWidth: 1,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: { position: "top" as const },
                        title: { display: false },
                      },
                      scales: { y: { beginAtZero: true } },
                    }}
                  />
                </div>
              </div>

              {/* Search Results */}
              {searchQuery.trim() !== "" && (
                <div className="bg-white p-6 rounded-lg shadow">
                  <h2 className="text-xl font-semibold text-gray-700 mb-4">
                    Search Results
                  </h2>
                  {filteredAppointments.length === 0 ? (
                    <p className="text-gray-500">No results found.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full bg-white">
                        <thead>
                          <tr>
                            <th className="py-2 px-4 border-b">Patient Name</th>
                            <th className="py-2 px-4 border-b">Patient Number</th>
                            <th className="py-2 px-4 border-b">Service Name</th>
                            <th className="py-2 px-4 border-b">Doctor</th>
                            <th className="py-2 px-4 border-b">Amount (Rs)</th>
                            <th className="py-2 px-4 border-b">Payment Method</th>
                            <th className="py-2 px-4 border-b">Date</th>
                            <th className="py-2 px-4 border-b">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAppointments.map((appt) => (
                            <tr key={appt.id} className="text-center">
                              <td className="py-2 px-4 border-b">{appt.name}</td>
                              <td className="py-2 px-4 border-b">{appt.phone}</td>
                              <td className="py-2 px-4 border-b">{appt.serviceName}</td>
                              <td className="py-2 px-4 border-b">
                                {doctorMap.current[appt.doctor] || "N/A"}
                              </td>
                              <td className="py-2 px-4 border-b">{appt.amount}</td>
                              <td className="py-2 px-4 border-b">{appt.paymentMethod}</td>
                              <td className="py-2 px-4 border-b">
                                {format(parseISO(appt.date), "PPP")}
                              </td>
                              <td className="py-2 px-4 border-b flex justify-center space-x-2">
                                <button
                                  onClick={() => setSelectedAppointment(appt)}
                                  className="text-blue-500 hover:text-blue-700"
                                  title="View Details"
                                >
                                  <AiOutlineEye size={20} />
                                </button>
                                <button
                                  onClick={() => deleteAppointment(appt.uhid, appt.opdKey)}
                                  className="text-red-500 hover:text-red-700"
                                  title="Delete Appointment"
                                >
                                  <AiOutlineDelete size={20} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Appointment Details Modal */}
              {selectedAppointment && (
                <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
                  <div className="bg-white rounded-lg shadow-lg w-11/12 md:w-1/2 lg:w-1/3 p-6 relative">
                    <button
                      onClick={() => setSelectedAppointment(null)}
                      className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
                      title="Close"
                    >
                      &times;
                    </button>
                    <h2 className="text-2xl font-semibold mb-4">Appointment Details</h2>
                    <div className="space-y-2">
                      <p>
                        <span className="font-semibold">Patient Name:</span> {selectedAppointment.name}
                      </p>
                      <p>
                        <span className="font-semibold">Patient Number:</span> {selectedAppointment.phone}
                      </p>
                      <p>
                        <span className="font-semibold">Service Name:</span> {selectedAppointment.serviceName}
                      </p>
                      <p>
                        <span className="font-semibold">Doctor:</span> {doctorMap.current[selectedAppointment.doctor] || "N/A"}
                      </p>
                      <p>
                        <span className="font-semibold">Amount (Rs):</span> {selectedAppointment.amount}
                      </p>
                      <p>
                        <span className="font-semibold">Payment Method:</span> {selectedAppointment.paymentMethod}
                      </p>
                      <p>
                        <span className="font-semibold">Message:</span> {selectedAppointment.message || "N/A"}
                      </p>
                      <p>
                        <span className="font-semibold">Date:</span> {format(parseISO(selectedAppointment.date), "PPP")}
                      </p>
                      <p>
                        <span className="font-semibold">Time:</span> {selectedAppointment.time}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
};

export default DashboardPage;
