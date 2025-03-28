'use client';

import React, { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Search } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { format, subDays, isSameDay } from 'date-fns';
import Link from 'next/link';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// Define interfaces
interface Service {
  serviceName: string;
  amount: number;
  status: 'pending' | 'completed';
  createdAt?: string;
}

interface Payment {
  amount: number;
  paymentType: string;
  date: string;
}

interface BillingRecord {
  id: string;
  name: string;
  mobileNumber: string;
  amount: number;
  totalPaid: number;
  paymentType: string;
  roomType?: string;
  bed?: string;
  services: Service[];
  payments: Payment[];
  dischargeDate?: string;
}

interface PaymentWithUser extends Payment {
  userId: string;
  name: string;
}

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
});

const PaymentsOverview: React.FC = () => {
  const [allRecords, setAllRecords] = useState<BillingRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredPayments, setFilteredPayments] = useState<PaymentWithUser[]>([]);
  const [totalCollected, setTotalCollected] = useState<number>(0);
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('');
  const [chartData, setChartData] = useState<any>(null);
  const [mostSellDay, setMostSellDay] = useState<string>('');

  useEffect(() => {
    // Read from "patients" node and extract IPD records
    const patientsRef = ref(db, 'patients');
    const unsubscribe = onValue(patientsRef, (snapshot) => {
      const data = snapshot.val();
      const records: BillingRecord[] = [];
      if (data) {
        Object.keys(data).forEach((patientId) => {
          const patient = data[patientId];
          if (patient.ipd) {
            Object.keys(patient.ipd).forEach((ipdKey) => {
              const ipdEntry = patient.ipd[ipdKey];
              const completedServicesAmount = ipdEntry.services
                ? ipdEntry.services
                    .filter((s: any) => s.status === 'completed')
                    .reduce((sum: number, s: any) => sum + Number(s.amount), 0)
                : 0;
              const payments: Payment[] = ipdEntry.payments
                ? Object.keys(ipdEntry.payments).map((payKey) => ({
                    amount: Number(ipdEntry.payments[payKey].amount),
                    paymentType: ipdEntry.payments[payKey].paymentType,
                    date: ipdEntry.payments[payKey].date,
                  }))
                : [];
              records.push({
                id: `${patientId}_${ipdKey}`,
                name: patient.name,
                mobileNumber: patient.phone || '',
                amount: Number(ipdEntry.amount) || 0,
                totalPaid: completedServicesAmount,
                paymentType: ipdEntry.paymentType || 'deposit',
                roomType: ipdEntry.roomType,
                bed: ipdEntry.bed,
                services: ipdEntry.services
                  ? ipdEntry.services.map((service: any) => ({
                      ...service,
                      amount: Number(service.amount),
                    }))
                  : [],
                payments: payments,
                dischargeDate: ipdEntry.dischargeDate || undefined,
              });
            });
          }
        });
      }
      setAllRecords(records);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Aggregate all payments
    const aggregatedPayments: PaymentWithUser[] = [];
    allRecords.forEach((rec) => {
      rec.payments.forEach((payment) => {
        aggregatedPayments.push({
          userId: rec.id,
          name: rec.name,
          paymentType: payment.paymentType,
          amount: payment.amount,
          date: payment.date,
        });
      });
    });
    let payments = aggregatedPayments;
    if (searchTerm.trim() !== '') {
      const term = searchTerm.trim().toLowerCase();
      payments = payments.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.userId.toLowerCase().includes(term)
      );
    }
    if (selectedDateFilter) {
      payments = payments.filter((p) => {
        const paymentDate = p.date ? new Date(p.date) : null;
        const filterDate = new Date(selectedDateFilter);
        return paymentDate && isSameDay(paymentDate, filterDate);
      });
    }
    setFilteredPayments(payments);
    const total = payments.reduce((sum, p) => sum + p.amount, 0);
    setTotalCollected(total);

    // Prepare chart data for last 7 days
    const last7Days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), i)).reverse();
    const paymentAmounts = last7Days.map((day) =>
      payments
        .filter((p) => p.date && isSameDay(new Date(p.date), day))
        .reduce((sum, p) => sum + p.amount, 0)
    );
    const salesByDay = last7Days.map((day, index) => ({
      day: format(day, 'EEE dd MMM'),
      amount: paymentAmounts[index],
    }));
    const maxSale = Math.max(...paymentAmounts);
    const maxDay = salesByDay.find((s) => s.amount === maxSale)?.day || '';
    setMostSellDay(maxDay);
    setChartData({
      labels: salesByDay.map((s) => s.day),
      datasets: [
        {
          label: 'Payments (Rs)',
          data: salesByDay.map((s) => s.amount),
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
          borderColor: 'rgba(59, 130, 246, 1)',
          borderWidth: 1,
        },
      ],
    });
  }, [allRecords, searchTerm, selectedDateFilter]);

  // Today filter option: set selected date to today's date.
  const handleTodayFilter = () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    setSelectedDateFilter(todayStr);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <ToastContainer />
      <div className="max-w-7xl mx-auto bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-8">
          <h1 className="text-4xl font-bold text-indigo-800 mb-8 text-center">Payments Overview</h1>
          {/* Search and Filter Section */}
          <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
            {/* Search Bar */}
            <div className="flex items-center bg-gray-100 rounded-full p-2 w-full md:w-1/2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by Name or Admission ID"
                className="flex-grow bg-transparent px-4 py-2 focus:outline-none"
              />
              <button
                onClick={() => {}}
                className="bg-indigo-600 text-white rounded-full p-2 hover:bg-indigo-700 transition duration-300"
              >
                <Search size={24} />
              </button>
            </div>
            {/* Date Filter & Today Button */}
            <div className="flex items-center space-x-4">
              <input
                type="date"
                value={selectedDateFilter}
                onChange={(e) => setSelectedDateFilter(e.target.value)}
                className="px-4 py-2 rounded bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                title="Filter by Payment Date"
              />
              <button
                onClick={handleTodayFilter}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition duration-300"
              >
                Today
              </button>
              {selectedDateFilter && (
                <button
                  onClick={() => setSelectedDateFilter('')}
                  className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition duration-300"
                >
                  Clear Filter
                </button>
              )}
            </div>
          </div>
          {/* Total Collected */}
          <div className="mb-6 flex justify-end">
            <div className="bg-green-100 rounded-lg p-4">
              <p className="text-green-800 font-semibold">
                Total Collected: {currencyFormatter.format(totalCollected)}
              </p>
            </div>
          </div>
          {/* Payment Graphs */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-indigo-800 mb-4 text-center">Payments in Last 7 Days</h2>
            {chartData ? (
              <Bar
                data={chartData}
                options={{
                  responsive: true,
                  plugins: {
                    legend: { position: 'top' as const },
                    title: { display: false, text: 'Payments in Last 7 Days' },
                  },
                }}
              />
            ) : (
              <p className="text-gray-500 text-center">Loading chart...</p>
            )}
            {mostSellDay && (
              <p className="mt-4 text-center text-lg font-semibold">
                Most Sell Day: <span className="text-blue-600">{mostSellDay}</span>
              </p>
            )}
          </div>
          {/* Payment History Table */}
          <div>
            <h2 className="text-2xl font-bold text-indigo-800 mb-4 text-center">Payment History</h2>
            {filteredPayments.length === 0 ? (
              <p className="text-gray-500 text-center">No payment records found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-indigo-100">
                      <th className="px-4 py-2 text-left">#</th>
                      <th className="px-4 py-2 text-left">Patient Name</th>
                      <th className="px-4 py-2 text-left">Payment Type</th>
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">Amount (Rs)</th>
                      <th className="px-4 py-2 text-left">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayments.map((payment, index) => (
                      <tr key={index} className="border-t hover:bg-indigo-50">
                        <td className="px-4 py-2">{index + 1}</td>
                        <td className="px-4 py-2">{payment.name}</td>
                        <td className="px-4 py-2 capitalize">{payment.paymentType}</td>
                        <td className="px-4 py-2">
                          {payment.date ? new Date(payment.date).toLocaleString() : 'N/A'}
                        </td>
                        <td className="px-4 py-2">{currencyFormatter.format(payment.amount)}</td>
                        <td className="px-4 py-2">
                          <Link href={`/ipdadmin/patient-details/${payment.userId}`}>
                            <button className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition duration-300">
                              View Details
                            </button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentsOverview;
