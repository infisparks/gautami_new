// app/admin/blood-tests/page.tsx

"use client";

import React, { useState, useEffect, useRef } from "react";
import { db } from "../../lib/firebase";
import { ref, onValue, remove } from "firebase/database";
import Head from "next/head";
import { format, isSameDay, parseISO } from "date-fns";
import { AiOutlineSearch, AiOutlineDelete, AiOutlineDownload, AiOutlineFilePdf } from "react-icons/ai";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";

// Define the shape of your blood test data
interface IBloodTest {
  id: string;
  name: string;
  phone: string;
  bloodTestName: string;
  amount: number;
  date: string; // ISO string
  doctor: string;
}

interface IDoctor {
  id: string;
  name: string;
}

const BloodTestsAdmin: React.FC = () => {
  const [bloodTests, setBloodTests] = useState<IBloodTest[]>([]);
  const [doctors, setDoctors] = useState<IDoctor[]>([]);
  const [filteredBloodTests, setFilteredBloodTests] = useState<IBloodTest[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
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

  // Fetch blood tests
  useEffect(() => {
    const bloodTestsRef = ref(db, "bloodTests");
    const unsubscribe = onValue(bloodTestsRef, (snapshot) => {
      const data = snapshot.val();
      const bloodTestList: IBloodTest[] = [];
      if (data) {
        Object.keys(data).forEach((key) => {
          const entry = data[key];
          bloodTestList.push({
            id: key,
            name: entry.name,
            phone: entry.phone,
            bloodTestName: entry.bloodTestName,
            amount: entry.amount,
            date: entry.date
              ? entry.date
              : entry.timestamp
              ? new Date(entry.timestamp).toISOString()
              : new Date().toISOString(),
            doctor: entry.doctor || "N/A",
          });
        });
      }
      setBloodTests(bloodTestList);
      setFilteredBloodTests(bloodTestList);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Create doctor map
  const doctorMap = useRef<{ [key: string]: string }>({});

  useEffect(() => {
    const map: { [key: string]: string } = {};
    doctors.forEach((doctor) => {
      map[doctor.id] = doctor.name;
    });
    doctorMap.current = map;
  }, [doctors]);

  // Handle search and date filter
  useEffect(() => {
    let tempBloodTests = [...bloodTests];

    // Filter by date
    if (selectedDate) {
      const parsedDate = parseISO(selectedDate);
      tempBloodTests = tempBloodTests.filter((bt) =>
        isSameDay(new Date(bt.date), parsedDate)
      );
    }

    // Search by name, phone, or blood test name
    if (searchQuery.trim() !== "") {
      const lowerQuery = searchQuery.toLowerCase();
      tempBloodTests = tempBloodTests.filter(
        (bt) =>
          bt.name.toLowerCase().includes(lowerQuery) ||
          bt.phone.includes(lowerQuery) ||
          bt.bloodTestName.toLowerCase().includes(lowerQuery)
      );
    }

    setFilteredBloodTests(tempBloodTests);
  }, [searchQuery, selectedDate, bloodTests]);

  // Export to Excel
  const exportToExcel = () => {
    const dataToExport = filteredBloodTests.map((bt) => ({
      "Patient Name": bt.name,
      "Phone Number": bt.phone,
      "Blood Test Name": bt.bloodTestName,
      Amount: bt.amount,
      Date: format(parseISO(bt.date), "PPP"),
      Doctor: doctorMap.current[bt.doctor] || "N/A",
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Blood Tests");
    XLSX.writeFile(workbook, "Blood_Tests_Report.xlsx");
  };

  // Export to PDF
  const exportToPDF = () => {
    const doc = new jsPDF();
    const tableColumn = ["Patient Name", "Phone Number", "Blood Test Name", "Amount", "Date", "Doctor"];
    const tableRows: string[][] = [];

    filteredBloodTests.forEach((bt) => {
      const btData: string[] = [
        bt.name,
        bt.phone,
        bt.bloodTestName,
        bt.amount.toString(),
        format(parseISO(bt.date), "PPP"),
        doctorMap.current[bt.doctor] || "N/A",
      ];
      tableRows.push(btData);
    });

    // Add title
    doc.text("Blood Tests Report", 14, 15);

    // Add table
   
    doc.save(`Blood_Tests_Report_${format(new Date(), "yyyyMMdd_HHmmss")}.pdf`);
  };

  // Delete blood test entry
  const deleteBloodTest = async (id: string) => {
    if (confirm("Are you sure you want to delete this blood test entry?")) {
      try {
        const btRef = ref(db, `bloodTests/${id}`);
        await remove(btRef);
        toast.success("Blood test entry deleted successfully!", {
          position: "top-right",
          autoClose: 3000,
        });
      } catch (error) {
        console.error("Error deleting blood test entry:", error);
        toast.error("Failed to delete blood test entry.", {
          position: "top-right",
          autoClose: 3000,
        });
      }
    }
  };

  // Calculate total amount
  const totalAmount = filteredBloodTests.reduce((acc, bt) => acc + bt.amount, 0);

  return (
    <>
      <Head>
        <title>Blood Tests - Admin Dashboard</title>
        <meta name="description" content="Admin Dashboard for Blood Tests Management" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ToastContainer />

      <main className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold text-center text-blue-600 mb-10">
            Blood Tests Management Dashboard
          </h1>

          {loading ? (
            <div className="flex justify-center items-center">
              <div className="loader ease-linear rounded-full border-8 border-t-8 border-gray-200 h-16 w-16"></div>
            </div>
          ) : (
            <>
              {/* Filters and Export Buttons */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-10">
                {/* Search */}
                <div className="bg-white p-4 rounded-lg shadow flex items-center">
                  <AiOutlineSearch className="text-gray-400 mr-2" size={24} />
                  <input
                    type="text"
                    placeholder="Search by Name, Phone, or Test"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Date Filter */}
                <div className="bg-white p-4 rounded-lg shadow">
                  <label className="block text-gray-700 mb-2">Filter by Date</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Total Amount */}
                <div className="bg-white p-4 rounded-lg shadow flex items-center">
                  <span className="text-gray-700 font-semibold">Total Amount: </span>
                  <span className="ml-2 text-green-600 font-bold">  RS {totalAmount}</span>
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

              {/* Blood Tests Table */}
              <div className="bg-white p-6 rounded-lg shadow overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className="py-2 px-4 border-b">Name</th>
                      <th className="py-2 px-4 border-b">Phone Number</th>
                      <th className="py-2 px-4 border-b">Blood Test</th>
                      <th className="py-2 px-4 border-b">Amount</th>
                      <th className="py-2 px-4 border-b">Date</th>
                      <th className="py-2 px-4 border-b">Doctor</th>
                      <th className="py-2 px-4 border-b">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBloodTests.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-4">
                          No blood tests found.
                        </td>
                      </tr>
                    ) : (
                      filteredBloodTests.map((bt) => (
                        <tr key={bt.id} className="text-center">
                          <td className="py-2 px-4 border-b">{bt.name}</td>
                          <td className="py-2 px-4 border-b">{bt.phone}</td>
                          <td className="py-2 px-4 border-b">{bt.bloodTestName}</td>
                          <td className="py-2 px-4 border-b">RS {bt.amount}</td>
                          <td className="py-2 px-4 border-b">
                            {format(parseISO(bt.date), "PPP")}
                          </td>
                          <td className="py-2 px-4 border-b">
                            {doctorMap.current[bt.doctor] || "N/A"}
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
                              <AiOutlineSearch size={20} />
                            </button>
                            <button
                              onClick={() => deleteBloodTest(bt.id)}
                              className="text-red-500 hover:text-red-700"
                              title="Delete Blood Test"
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

export default BloodTestsAdmin;
