// app/admin/mortality-dashboard/page.tsx

"use client";

import React, { useState, useEffect } from "react";
import Head from "next/head";
import { ref, onValue } from "firebase/database";
import { db } from "../../lib/firebase";
import { format, isSameDay, parseISO, startOfMonth, endOfMonth, getDaysInMonth } from "date-fns";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { AiOutlineCalendar } from "react-icons/ai";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// TypeScript Interface for Mortality Reports
interface IMortalityReport {
  id: string; // Composite key: `${uhid}_mortality_${mortalityKey}`
  name: string;
  admissionDate: string; // ISO date string from mortality data
  age: number;
  dateOfDeath: string; // ISO date string from mortality data
  medicalFindings: string;
  timeSpanDays: number;
  timestamp: number; // Unix timestamp from mortality data
}

const MortalityDashboardPage: React.FC = () => {
  const [reports, setReports] = useState<IMortalityReport[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterDate, setFilterDate] = useState<string>(""); // When empty, show all reports
  const [totalDeathsToday, setTotalDeathsToday] = useState<number>(0);
  const [monthlyData, setMonthlyData] = useState<{ [key: string]: number }>({});
  const [searchQuery, setSearchQuery] = useState<string>(""); // For search functionality

  // Fetch mortality reports by extracting them from each patient record in the "patients" node.
  useEffect(() => {
    const patientsRef = ref(db, "patients");
    onValue(
      patientsRef,
      (snapshot) => {
        const data = snapshot.val();
        const fetchedReports: IMortalityReport[] = [];
        if (data) {
          Object.entries(data).forEach(([uhid, patientData]: [string, any]) => {
            // If a patient record has mortality data, extract it.
            if (patientData.mortality) {
              Object.entries(patientData.mortality).forEach(
                ([mortalityKey, mortalityData]: [string, any]) => {
                  fetchedReports.push({
                    id: `${uhid}_mortality_${mortalityKey}`,
                    name: patientData.name,
                    admissionDate: mortalityData.admissionDate,
                    age: patientData.age,
                    dateOfDeath: mortalityData.dateOfDeath,
                    medicalFindings: mortalityData.medicalFindings,
                    timeSpanDays: mortalityData.timeSpanDays,
                    timestamp: mortalityData.timestamp,
                  });
                }
              );
            }
          });
        }
        setReports(fetchedReports);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching mortality reports:", error);
        toast.error("Failed to fetch mortality reports.", {
          position: "top-right",
          autoClose: 5000,
        });
        setLoading(false);
      }
    );
  }, []);

  // Calculate total deaths today (using dateOfDeath)
  useEffect(() => {
    const today = new Date();
    const count = reports.filter((report) =>
      isSameDay(parseISO(report.dateOfDeath), today)
    ).length;
    setTotalDeathsToday(count);
  }, [reports]);

  // Calculate monthly deaths for the current month for charting
  useEffect(() => {
    const currentMonthStart = startOfMonth(new Date());
    const currentMonthEnd = endOfMonth(new Date());
    const monthlyReports = reports.filter((report) => {
      const deathDate = parseISO(report.dateOfDeath);
      return deathDate >= currentMonthStart && deathDate <= currentMonthEnd;
    });

    const daysInMonth = getDaysInMonth(new Date());
    const data: { [key: string]: number } = {};

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentMonthStart);
      date.setDate(day);
      const formattedDate = format(date, "yyyy-MM-dd");
      const count = monthlyReports.filter(
        (report) => report.dateOfDeath === formattedDate
      ).length;
      data[day.toString()] = count;
    }

    setMonthlyData(data);
  }, [reports]);

  // Chart Data for Monthly Deaths
  const chartData = {
    labels: Object.keys(monthlyData).map((day) => `Day ${day}`),
    datasets: [
      {
        label: "Total Deaths",
        data: Object.values(monthlyData),
        backgroundColor: "rgba(220, 38, 38, 0.7)", // red-600 with opacity
      },
    ],
  };

  // Chart Options
  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: "top" as const },
      title: { display: true, text: "Total Deaths This Month" },
    },
  };

  // Filter reports based on filterDate and searchQuery.
  // If filterDate is empty, all reports are shown.
  const filteredReports = reports
    .filter((report) => {
      if (filterDate) {
        return report.dateOfDeath === filterDate;
      }
      return true;
    })
    .filter((report) => {
      if (searchQuery) {
        return report.name.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    });

  return (
    <>
      <Head>
        <title>Admin - Mortality Dashboard</title>
        <meta name="description" content="View and analyze mortality reports" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ToastContainer />

      <main className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold text-center text-gray-800 mb-8">
            Mortality Dashboard
          </h1>

          {/* Total Deaths Today */}
          <div className="bg-white shadow rounded-lg p-6 mb-8">
            <h2 className="text-2xl font-semibold text-gray-700 mb-4">
              Total Deaths Today
            </h2>
            <p className="text-5xl font-bold text-red-600">
              {totalDeathsToday}
            </p>
          </div>

          {/* Monthly Deaths Graph */}
          <div className="bg-white shadow rounded-lg p-6 mb-8">
            <Bar data={chartData} options={chartOptions} />
          </div>

          {/* Filters */}
          <div className="flex flex-col md:flex-row items-center justify-between mb-6 space-y-4 md:space-y-0">
            {/* Date Filter */}
            <div className="flex items-center space-x-2">
              <AiOutlineCalendar className="text-gray-500" />
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              {filterDate && (
                <button
                  onClick={() => setFilterDate("")}
                  className="text-red-500 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Search by Patient Name */}
            <div className="flex items-center space-x-2">
              <AiOutlineCalendar className="text-gray-500" />
              <input
                type="text"
                placeholder="Search by patient name"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-red-500 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Reports List */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-2xl font-semibold text-gray-700 mb-4">
              Mortality Reports{" "}
              {filterDate && `for ${format(parseISO(filterDate), "PPP")}`}
            </h2>
            {loading ? (
              <p className="text-center text-gray-500">Loading reports...</p>
            ) : filteredReports.length === 0 ? (
              <p className="text-center text-gray-500">No reports found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Patient Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Admission Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Age
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date of Death
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Time Span (Days)
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Medical Findings
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredReports.map((report) => (
                      <tr key={report.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {report.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {format(parseISO(report.admissionDate), "PPP")}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {report.age}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {format(parseISO(report.dateOfDeath), "PPP")}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {report.timeSpanDays}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {report.medicalFindings}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
};

export default MortalityDashboardPage;
