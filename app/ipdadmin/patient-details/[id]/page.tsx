// app/ipdadmin/patient-details/[id]/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Download, Phone, Mail, ArrowLeft } from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { format, subDays, isSameDay } from 'date-fns';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// Define the interfaces
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

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

// Define the currency formatter
const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
});

const PatientPaymentDetails: React.FC = () => {
  const [record, setRecord] = useState<BillingRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [chartData, setChartData] = useState<any>(null);
  const [totalPayments, setTotalPayments] = useState<number>(0);
  const [mostSellDay, setMostSellDay] = useState<string>('');

 
  const url = typeof window !== 'undefined' ? window.location.pathname : '';
  const id = url.split('/').pop() || '';

  useEffect(() => {
    if (!id) {
      toast.error('No patient ID provided.', { position: 'top-right', autoClose: 5000 });
      setLoading(false);
      return;
    }

    const recordRef = ref(db, `ipd_bookings/${id}`);
    const unsubscribe = onValue(recordRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const completedServicesAmount = data.services
          ? data.services.filter((s: Service) => s.status === 'completed').reduce((sum: number, s: Service) => sum + Number(s.amount), 0)
          : 0;

        const payments: Payment[] = data.payments
          ? Object.keys(data.payments).map((payKey) => ({
              amount: Number(data.payments[payKey].amount),
              paymentType: data.payments[payKey].paymentType,
              date: data.payments[payKey].date,
            }))
          : [];

        const billingRecord: BillingRecord = {
          id: id,
          name: data.name,
          mobileNumber: data.mobileNumber || '',
          amount: Number(data.amount || 0),
          totalPaid: completedServicesAmount,
          paymentType: data.paymentType || 'deposit',
          roomType: data.roomType,
          bed: data.bed,
          services: data.services
            ? data.services.map((service: any) => ({
                ...service,
                amount: Number(service.amount),
              }))
            : [],
          payments: payments,
          dischargeDate: data.dischargeDate || undefined,
        };

        setRecord(billingRecord);
        setLoading(false);
      } else {
        toast.error('Patient record not found.', { position: 'top-right', autoClose: 5000 });
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [id]);

  useEffect(() => {
    if (!record) return;

    // Calculate total payments
    const total = record.payments.reduce((sum, p) => sum + p.amount, 0);
    setTotalPayments(total);

    // Prepare data for the last 7 days
    const last7Days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), i)).reverse();
    const paymentAmounts = last7Days.map((day) => {
      return record.payments
        .filter((p) => p.date && isSameDay(new Date(p.date), day))
        .reduce((sum, p) => sum + p.amount, 0);
    });

    // Find the day with the highest sales
    const salesByDay = last7Days.map((day, index) => ({
      day: format(day, 'EEE dd MMM'),
      amount: paymentAmounts[index],
    }));

    const maxSale = Math.max(...paymentAmounts);
    const maxDay = salesByDay.find((s) => s.amount === maxSale)?.day || '';

    setMostSellDay(maxDay);

    // Prepare chart data
    setChartData({
      labels: salesByDay.map((s) => s.day),
      datasets: [
        {
          label: 'Payments (Rs)',
          data: salesByDay.map((s) => s.amount),
          backgroundColor: 'rgba(59, 130, 246, 0.5)', // Blue-500
          borderColor: 'rgba(59, 130, 246, 1)',
          borderWidth: 1,
        },
      ],
    });
  }, [record]);

  const handleDownloadInvoice = async () => {
    if (!record) return;
    const invoiceElement = document.getElementById('invoice');
    if (!invoiceElement) {
      toast.error('Invoice element not found.', { position: 'top-right', autoClose: 5000 });
      return;
    }

    try {
      const canvas = await html2canvas(invoiceElement, { scale: 3, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, '', 'FAST');
      const fileName = record.dischargeDate
        ? `Final_Invoice_${record.name}_${record.id}.pdf`
        : `Provisional_Invoice_${record.name}_${record.id}.pdf`;
      pdf.save(fileName);
    } catch (err) {
      console.error('Error generating PDF:', err);
      toast.error('Failed to generate PDF. Please try again.', { position: 'top-right', autoClose: 5000 });
    }
  };

  const getInvoiceDate = () => {
    return format(new Date(), 'dd MMM yyyy');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xl text-gray-700">Loading...</p>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xl text-red-500">Patient record not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <ToastContainer />
      <div className="max-w-7xl mx-auto bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-8">
          <h1 className="text-4xl font-bold text-indigo-800 mb-8 text-center">Patient Payment Details</h1>

          {/* Back to Payments Overview */}
          <div className="mb-4">
            <Link href="/ipdadmin">
              <button className="flex items-center text-indigo-600 hover:text-indigo-800 transition duration-300">
                <ArrowLeft size={20} className="mr-2" />
                Back to Payments Overview
              </button>
            </Link>
          </div>

          {/* Patient Details */}
          <div className="bg-indigo-50 rounded-xl p-6 mb-8">
            <h2 className="text-2xl font-semibold text-indigo-800 mb-4">Patient Details for {record.name}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p><strong>Name:</strong> {record.name}</p>
                <p><strong>Mobile:</strong> {record.mobileNumber}</p>
                <p><strong>Payment Type at Admission:</strong> {record.paymentType.charAt(0).toUpperCase() + record.paymentType.slice(1)}</p>
              </div>
              <div>
                <p><strong>Total Amount:</strong> {currencyFormatter.format(record.amount)}</p>
                <p><strong>Total Paid:</strong> {currencyFormatter.format(totalPayments)}</p>
                <p><strong>Discharge Date:</strong> {record.dischargeDate ? new Date(record.dischargeDate).toLocaleDateString() : 'N/A'}</p>
              </div>
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
                    legend: {
                      position: 'top' as const,
                    },
                    title: {
                      display: false,
                      text: 'Payments in Last 7 Days',
                    },
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
            {record.payments.length === 0 ? (
              <p className="text-gray-500 text-center">No payments recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-indigo-100">
                      <th className="px-4 py-2 text-left">#</th>
                      <th className="px-4 py-2 text-left">Payment Type</th>
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">Amount (Rs)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.payments.map((payment, index) => (
                      <tr key={index} className="border-t">
                        <td className="px-4 py-2">{index + 1}</td>
                        <td className="px-4 py-2 capitalize">{payment.paymentType}</td>
                        <td className="px-4 py-2">{format(new Date(payment.date), 'dd MMM yyyy')}</td>
                        <td className="px-4 py-2">{currencyFormatter.format(payment.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Download Invoice Button */}
          <div className="flex justify-center mt-8">
            <button
              onClick={handleDownloadInvoice}
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition duration-300 flex items-center"
            >
              <Download size={20} className="mr-2" />
              Download Invoice
            </button>
          </div>
        </div>

        {/* Hidden Invoice for PDF Generation */}
        <div id="invoice" className="hidden">
          <div className="max-w-4xl mx-auto bg-white text-gray-800 font-sans p-8">
            <div className="flex items-start justify-between mb-8">
              {/* Left: Logo */}
              <div className="flex-shrink-0 mr-4">
                {/* Replace with your actual logo */}
                <img src="/path-to-your-logo.png" alt="Hospital Logo" width={64} height={64} />
              </div>

              {/* Right: Hospital Details */}
              <div className="text-right">
                <h1 className="text-2xl font-bold">Your Hospital Name</h1>
                <p className="text-sm">1234 Health St, Wellness City, Country</p>
                <div className="flex items-center justify-end text-sm mt-1">
                  <Phone size={14} className="mr-2" />
                  <span>+1 (234) 567-8900</span>
                </div>
                <div className="flex items-center justify-end text-sm mt-1">
                  <Mail size={14} className="mr-2" />
                  <span>info@yourhospital.com</span>
                </div>
              </div>
            </div>

            {/* Invoice Details */}
            <div className="mb-6">
              <h2 className="text-xl font-semibold uppercase tracking-wide border-b pb-2 mb-4">Patient Invoice</h2>
              <div className="flex justify-between">
                <div>
                  <p className="text-sm"><strong>Patient Name:</strong> {record.name}</p>
                  <p className="text-sm"><strong>Patient ID:</strong> {record.id}</p>
                  <p className="text-sm"><strong>Mobile:</strong> {record.mobileNumber}</p>
                  <p className="text-sm">
                    <strong>Admission Date:</strong>{' '}
                    {record.services[0]?.createdAt
                      ? format(new Date(record.services[0].createdAt), 'dd MMM yyyy')
                      : 'N/A'}
                  </p>
                  {record.dischargeDate && (
                    <p className="text-sm">
                      <strong>Discharge Date:</strong>{' '}
                      {format(new Date(record.dischargeDate), 'dd MMM yyyy')}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-sm"><strong>Invoice #:</strong> {record.id}</p>
                  <p className="text-sm"><strong>Generated On:</strong> {getInvoiceDate()}</p>
                  <p className="text-sm"><strong>Payment Type:</strong> {record.paymentType.charAt(0).toUpperCase() + record.paymentType.slice(1)}</p>
                </div>
              </div>
            </div>

            {/* Payment History */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">Payment History</h3>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 font-medium">Payment Type</th>
                    <th className="py-2 font-medium">Date</th>
                    <th className="py-2 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Payments */}
                  {record.payments.map((payment, index) => (
                    <tr key={index} className="border-b">
                      <td className="py-2 capitalize">{payment.paymentType.charAt(0).toUpperCase() + payment.paymentType.slice(1)}</td>
                      <td className="py-2">{format(new Date(payment.date), 'dd MMM yyyy')}</td>
                      <td className="py-2 text-right">{currencyFormatter.format(payment.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Services Rendered */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">Services Rendered</h3>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 font-medium">Service</th>
                    <th className="py-2 font-medium">Date</th>
                    <th className="py-2 font-medium text-right">Amount</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {record.services.map((service, index) => (
                    <tr key={index} className="border-b">
                      <td className="py-2">{service.serviceName}</td>
                      <td className="py-2">{service.createdAt ? format(new Date(service.createdAt), 'dd MMM yyyy') : 'N/A'}</td>
                      <td className="py-2 text-right">{currencyFormatter.format(service.amount)}</td>
                      <td className="py-2 capitalize">
                        {service.status === 'completed' ? (
                          <span className="text-green-600 font-semibold">Completed</span>
                        ) : (
                          <span className="text-yellow-600 font-semibold">Pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary Section */}
            <div className="mb-6">
              <div className="flex justify-between text-sm mb-1">
                <span>Total Services Amount:</span>
                <span className="font-semibold">{currencyFormatter.format(record.services.reduce((sum, s) => sum + s.amount, 0))}</span>
              </div>
              <div className="flex justify-between text-sm mb-1">
                <span>Total Amount:</span>
                <span className="font-semibold">{currencyFormatter.format(record.amount)}</span>
              </div>
              <div className="flex justify-between text-sm mb-1">
                <span>Total Payments:</span>
                <span className="font-semibold text-red-600">{currencyFormatter.format(totalPayments)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Outstanding Amount:</span>
                <span className="font-semibold text-red-600">
                  {currencyFormatter.format(record.amount - totalPayments)}
                </span>
              </div>
            </div>

            {/* Notes Section */}
            <div className="text-sm text-gray-600">
              <p>This is a computer-generated invoice and does not require a signature.</p>
              <p>Thank you for choosing our hospital. We wish you a speedy recovery and continued good health.</p>
            </div>
          </div>

          {/* Payment Graphs */}
          <div className="p-8">
            <h2 className="text-2xl font-bold text-indigo-800 mb-4 text-center">Payments in Last 7 Days</h2>
            {chartData ? (
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
                      text: 'Payments in Last 7 Days',
                    },
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
        </div>
      </div>
    </div>
  );
};

export default PatientPaymentDetails;
