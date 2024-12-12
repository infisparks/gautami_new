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

// Define the shape of your booking data
interface IBookingEntry {
  id: string; // Firebase unique key
  name: string;
  number: string; // Assuming 'number' refers to 'phone'
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
  phone: string; // Phone number
  serviceName: string;
  time: string; // Formatted time
}

interface IDoctor {
  id: string;
  name: string;
  // Add other doctor fields if necessary
}

const DashboardPage: React.FC = () => {
  const [bookings, setBookings] = useState<IBookingEntry[]>([]);
  const [doctors, setDoctors] = useState<IDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  ); // Default to today
  const [totalRevenue, setTotalRevenue] = useState<number>(0);
  const [bookingsOnSelectedDate, setBookingsOnSelectedDate] = useState<
    IBookingEntry[]
  >([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filteredBookings, setFilteredBookings] = useState<IBookingEntry[]>(
    []
  );
  const [selectedBooking, setSelectedBooking] = useState<IBookingEntry | null>(
    null
  ); // For viewing details

  // Fetch bookings from Firebase
  useEffect(() => {
    const bookingsRef = ref(db, "bookings");
    const unsubscribeBookings = onValue(bookingsRef, (snapshot) => {
      const data = snapshot.val();
      const bookingsList: IBookingEntry[] = [];
      if (data) {
        Object.keys(data).forEach((key) => {
          const entry = data[key];
          bookingsList.push({
            id: key,
            name: entry.name,
            number: entry.number, // Ensure 'number' corresponds to 'phone'
            age: entry.age,
            bloodTestName: entry.serviceName || entry.bloodTestName, // Adjust based on your data
            amount: entry.amount,
            timestamp: new Date(entry.date).getTime(), // Use 'date' field
            createdAt: entry.createdAt,
            date: entry.date,
            doctor: entry.doctor,
            email: entry.email,
            message: entry.message,
            paymentMethod: entry.paymentMethod,
            phone: entry.phone,
            serviceName: entry.serviceName,
            time: entry.time,
          });
        });
      }
      setBookings(bookingsList);
      setLoading(false);
    });

    return () => unsubscribeBookings();
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
            // Add other fields if necessary
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

  // Filter bookings based on selected date
  useEffect(() => {
    const parsedDate = parseISO(selectedDate);
    const filtered = bookings.filter((booking) =>
      isSameDay(new Date(booking.date), parsedDate)
    );
    setBookingsOnSelectedDate(filtered);

    // Calculate total revenue
    const revenue = filtered.reduce((acc, booking) => acc + booking.amount, 0);
    setTotalRevenue(revenue);
  }, [selectedDate, bookings]);

  // Handle search without debounce
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim() === "") {
      setFilteredBookings([]);
    } else {
      const lowerQuery = query.toLowerCase();
      const filtered = bookings.filter(
        (booking) =>
          booking.name.toLowerCase().includes(lowerQuery) ||
          booking.phone.toLowerCase().includes(lowerQuery)
      );
      setFilteredBookings(filtered);
    }
  };

  // Calculate last 10 days for charts
  const last10Days = Array.from({ length: 10 }, (_, i) =>
    subDays(new Date(), 9 - i)
  );

  // Bookings count over last 10 days
  const bookingsLast10Days = last10Days.map((day) => {
    return bookings.filter((booking) =>
      isSameDay(new Date(booking.date), day)
    ).length;
  });

  // Revenue over last 10 days
  const revenueLast10Days = last10Days.map((day) => {
    return bookings
      .filter((booking) => isSameDay(new Date(booking.date), day))
      .reduce((acc, booking) => acc + booking.amount, 0);
  });

  // Delete booking
  const deleteBooking = async (id: string) => {
    if (confirm("Are you sure you want to delete this booking?")) {
      try {
        const bookingRef = ref(db, `bookings/${id}`);
        await remove(bookingRef);
        toast.success("Booking deleted successfully!", {
          position: "top-right",
          autoClose: 3000,
        });
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
        <title>Admin Dashboard - OPD Bookings</title>
        <meta name="description" content="OPD Bookings Admin Dashboard" />
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
                {/* Total Bookings Today */}
                <div className="bg-white p-6 rounded-lg shadow">
                  <h2 className="text-xl font-semibold text-gray-700 mb-4">
                    Bookings Today
                  </h2>
                  <p className="text-3xl font-bold text-green-600">
                    {bookings.filter((booking) =>
                      isSameDay(new Date(booking.date), new Date())
                    ).length}
                  </p>
                </div>

                {/* Total Revenue for Selected Date */}
                <div className="bg-white p-6 rounded-lg shadow">
                  <h2 className="text-xl font-semibold text-gray-700 mb-4">
                    Total Revenue on
                  </h2>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  {selectedDate && (
                    <p className="mt-4 text-2xl font-bold text-green-600">
                      Rs {totalRevenue}
                    </p>
                  )}
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

              {/* Bookings on Selected Date */}
              {selectedDate && (
                <div className="bg-white p-6 rounded-lg shadow mb-10">
                  <h2 className="text-xl font-semibold text-gray-700 mb-4">
                    Bookings on {format(parseISO(selectedDate), "PPP")}
                  </h2>
                  {bookingsOnSelectedDate.length === 0 ? (
                    <p className="text-gray-500">No bookings on this date.</p>
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
                          {bookingsOnSelectedDate.map((booking) => (
                            <tr key={booking.id} className="text-center">
                              <td className="py-2 px-4 border-b">{booking.name}</td>
                              <td className="py-2 px-4 border-b">{booking.phone}</td>
                              <td className="py-2 px-4 border-b">{booking.serviceName}</td>
                              <td className="py-2 px-4 border-b">
                                {doctorMap.current[booking.doctor] || "N/A"}
                              </td>
                              <td className="py-2 px-4 border-b">{booking.amount}</td>
                              <td className="py-2 px-4 border-b">{booking.paymentMethod}</td>
                              <td className="py-2 px-4 border-b flex justify-center space-x-2">
                                <button
                                  onClick={() => setSelectedBooking(booking)}
                                  className="text-blue-500 hover:text-blue-700"
                                  title="View Details"
                                >
                                  <AiOutlineEye size={20} />
                                </button>
                                <button
                                  onClick={() => deleteBooking(booking.id)}
                                  className="text-red-500 hover:text-red-700"
                                  title="Delete Booking"
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

              {/* Bookings Chart and Revenue Chart */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
                {/* Bookings in Last 10 Days */}
                <div className="bg-white p-6 rounded-lg shadow">
                  <h2 className="text-xl font-semibold text-gray-700 mb-4">
                    Bookings in Last 10 Days
                  </h2>
                  <Line
                    data={{
                      labels: last10Days.map((day) =>
                        format(day, "MMM dd")
                      ),
                      datasets: [
                        {
                          label: "Bookings",
                          data: bookingsLast10Days,
                          fill: false,
                          backgroundColor: "rgba(16, 185, 129, 0.6)",
                          borderColor: "rgba(16, 185, 129, 1)",
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: {
                          position: "top" as const,
                        },
                        title: {
                          display: false,
                        },
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
                      labels: last10Days.map((day) =>
                        format(day, "MMM dd")
                      ),
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
                        legend: {
                          position: "top" as const,
                        },
                        title: {
                          display: false,
                        },
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                        },
                      },
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
                  {filteredBookings.length === 0 ? (
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
                          {filteredBookings.map((booking) => (
                            <tr key={booking.id} className="text-center">
                              <td className="py-2 px-4 border-b">{booking.name}</td>
                              <td className="py-2 px-4 border-b">{booking.phone}</td>
                              <td className="py-2 px-4 border-b">{booking.serviceName}</td>
                              <td className="py-2 px-4 border-b">
                                {doctorMap.current[booking.doctor] || "N/A"}
                              </td>
                              <td className="py-2 px-4 border-b">{booking.amount}</td>
                              <td className="py-2 px-4 border-b">{booking.paymentMethod}</td>
                              <td className="py-2 px-4 border-b">
                                {format(parseISO(booking.date), "PPP")}
                              </td>
                              <td className="py-2 px-4 border-b flex justify-center space-x-2">
                                <button
                                  onClick={() => setSelectedBooking(booking)}
                                  className="text-blue-500 hover:text-blue-700"
                                  title="View Details"
                                >
                                  <AiOutlineEye size={20} />
                                </button>
                                <button
                                  onClick={() => deleteBooking(booking.id)}
                                  className="text-red-500 hover:text-red-700"
                                  title="Delete Booking"
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

              {/* Booking Details Modal */}
              {selectedBooking && (
                <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
                  <div className="bg-white rounded-lg shadow-lg w-11/12 md:w-1/2 lg:w-1/3 p-6 relative">
                    <button
                      onClick={() => setSelectedBooking(null)}
                      className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
                      title="Close"
                    >
                      &times;
                    </button>
                    <h2 className="text-2xl font-semibold mb-4">Booking Details</h2>
                    <div className="space-y-2">
                      <p>
                        <span className="font-semibold">Patient Name:</span> {selectedBooking.name}
                      </p>
                      <p>
                        <span className="font-semibold">Patient Number:</span> {selectedBooking.phone}
                      </p>
                      {selectedBooking.age !== undefined && (
                        <p>
                          <span className="font-semibold">Age:</span> {selectedBooking.age}
                        </p>
                      )}
                      <p>
                        <span className="font-semibold">Service Name:</span> {selectedBooking.serviceName}
                      </p>
                      <p>
                        <span className="font-semibold">Doctor:</span> {doctorMap.current[selectedBooking.doctor] || "N/A"}
                      </p>
                      <p>
                        <span className="font-semibold">Amount (Rs):</span> {selectedBooking.amount}
                      </p>
                      <p>
                        <span className="font-semibold">Payment Method:</span> {selectedBooking.paymentMethod}
                      </p>
                      <p>
                        <span className="font-semibold">Email:</span> {selectedBooking.email}
                      </p>
                      <p>
                        <span className="font-semibold">Phone:</span> {selectedBooking.phone}
                      </p>
                      <p>
                        <span className="font-semibold">Message:</span> {selectedBooking.message || "N/A"}
                      </p>
                      <p>
                        <span className="font-semibold">Date:</span> {format(parseISO(selectedBooking.date), "PPP")}
                      </p>
                      <p>
                        <span className="font-semibold">Time:</span> {selectedBooking.time}
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
