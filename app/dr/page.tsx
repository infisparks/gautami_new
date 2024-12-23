// DailyPerformanceReport.tsx

'use client'

import React, { useEffect, useState, useRef } from 'react'
import { db } from '@/lib/firebase'
import { ref, onValue } from 'firebase/database'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { format, isSameDay, parseISO } from 'date-fns'
import { motion } from 'framer-motion'
import { FaBed, FaUserInjured, FaHospital, FaProcedures, FaArrowDown, FaArrowUp, FaDownload } from 'react-icons/fa'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

// =================== Interfaces ===================
interface Booking {
  amount: number
  createdAt: string
  date: string
  doctor: string
  email: string
  message: string
  name: string
  paymentMethod: string
  phone: string
  serviceName: string
  time: string
}

interface IPDBooking {
  admissionType: string
  age: number
  amount: number
  bed: string
  bloodGroup: string
  createdAt: string
  date: string
  dateOfBirth: string
  dischargeDate?: string
  discountPercentage?: number
  doctor: string
  email: string
  emergencyMobileNumber: string
  gender: string
  membershipType: string
  mobileNumber: string
  name: string
  payments: Record<
    string,
    {
      amount: number
      date: string
      paymentType: string
    }
  >
  referralDoctor: string
  roomType: string
  services: Array<{
    amount: number
    createdAt: string
    serviceName: string
    status: string
  }>
  time: string
  totalPaid: number
}

interface Surgery {
  age: number
  finalDiagnosis: string
  gender: string
  name: string
  surgeryDate: string
  surgeryTitle: string
  timestamp: number
}

interface Bed {
  bedNumber?: string
  status: string
  type?: string
}

interface MortalityReport {
  admissionDate: string
  age: number
  dateOfDeath: string
  medicalFindings: string
  name: string
  timeSpanDays: number
  timestamp: number
}

// =================== Main Component ===================
export default function DailyPerformanceReport() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [ipdBookings, setIpdBookings] = useState<IPDBooking[]>([])
  const [surgeries, setSurgeries] = useState<Surgery[]>([])
  const [beds, setBeds] = useState<Record<string, Record<string, Bed>>>({})
  const [mortalityReports, setMortalityReports] = useState<MortalityReport[]>([])

  const [metrics, setMetrics] = useState({
    totalOPD: 0,
    totalIPDAdmissions: 0,
    totalIPDDischarges: 0,
    totalIPDReferrals: 0,
    totalSurgeries: 0,
    totalMortalityReports: 0,
    totalBeds: 0,
    bedsOccupied: 0,
    bedsAvailable: 0,
  })

  const reportRef = useRef<HTMLDivElement>(null)

  // =================== Fetch Data ===================
  // Fetch Bookings (OPD)
  useEffect(() => {
    const bookingsRef = ref(db, 'bookings')
    const unsubscribe = onValue(bookingsRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const fetchedBookings: Booking[] = Object.values(data)
        setBookings(fetchedBookings)
      } else {
        setBookings([])
      }
    })

    return () => unsubscribe()
  }, [])

  // Fetch IPD Bookings
  useEffect(() => {
    const ipdBookingsRef = ref(db, 'ipd_bookings')
    const unsubscribe = onValue(ipdBookingsRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const fetchedIPDBookings: IPDBooking[] = Object.values(data)
        setIpdBookings(fetchedIPDBookings)
      } else {
        setIpdBookings([])
      }
    })

    return () => unsubscribe()
  }, [])

  // Fetch Surgeries
  useEffect(() => {
    const surgeriesRef = ref(db, 'surgeries')
    const unsubscribe = onValue(surgeriesRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const fetchedSurgeries: Surgery[] = Object.values(data)
        setSurgeries(fetchedSurgeries)
      } else {
        setSurgeries([])
      }
    })

    return () => unsubscribe()
  }, [])

  // Fetch Beds
  useEffect(() => {
    const bedsRef = ref(db, 'beds')
    const unsubscribe = onValue(bedsRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        setBeds(data)
      } else {
        setBeds({})
      }
    })

    return () => unsubscribe()
  }, [])

  // Fetch Mortality Reports
  useEffect(() => {
    const mortalityRef = ref(db, 'mortalityReports')
    const unsubscribe = onValue(mortalityRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const fetchedMortalityReports: MortalityReport[] = Object.values(data)
        setMortalityReports(fetchedMortalityReports)
      } else {
        setMortalityReports([])
      }
    })

    return () => unsubscribe()
  }, [])

  // =================== Calculate Metrics ===================
  useEffect(() => {
    const today = new Date()

    // Total OPD Today
    const totalOPD = bookings.filter((booking) => {
      const bookingDate = parseISO(booking.date)
      return isSameDay(bookingDate, today)
    }).length

    // Total IPD Admissions Today
    const totalIPDAdmissions = ipdBookings.filter((ipd) => {
      const admissionDate = parseISO(ipd.date)
      return isSameDay(admissionDate, today)
    }).length

    // Total IPD Discharges Today
    const totalIPDDischarges = ipdBookings.filter((ipd) => {
      if (!ipd.dischargeDate) return false
      const dischargeDate = parseISO(ipd.dischargeDate)
      return isSameDay(dischargeDate, today)
    }).length

    // Total IPD Referrals Today
    const totalIPDReferrals = ipdBookings.filter((ipd) => {
      if (!ipd.referralDoctor) return false
      const referralDate = parseISO(ipd.createdAt)
      return isSameDay(referralDate, today)
    }).length

    // Total Surgeries Today
    const totalSurgeries = surgeries.filter((surgery) => {
      const surgeryDate = parseISO(surgery.surgeryDate)
      return isSameDay(surgeryDate, today)
    }).length

    // Total Mortality Reports Today
    const totalMortalityReports = mortalityReports.filter((mr) => {
      const deathDate = parseISO(mr.dateOfDeath)
      return isSameDay(deathDate, today)
    }).length

    // Bed Status
    let totalBeds = 0
    let bedsOccupied = 0
    let bedsAvailable = 0

    Object.keys(beds).forEach((ward) => {
      Object.keys(beds[ward]).forEach((bedKey) => {
        totalBeds += 1
        if (beds[ward][bedKey].status.toLowerCase() === 'occupied') {
          bedsOccupied += 1
        } else {
          bedsAvailable += 1
        }
      })
    })

    setMetrics({
      totalOPD,
      totalIPDAdmissions,
      totalIPDDischarges,
      totalIPDReferrals,
      totalSurgeries,
      totalMortalityReports,
      totalBeds,
      bedsOccupied,
      bedsAvailable,
    })
  }, [bookings, ipdBookings, surgeries, beds, mortalityReports])

  // =================== Detailed Bed Status ===================
  const getBedDetails = () => {
    const bedDetails: Array<{
      ward: string
      bedNumber?: string
      bedKey: string
      status: string
      type?: string
    }> = []

    Object.keys(beds).forEach((ward) => {
      Object.keys(beds[ward]).forEach((bedKey) => {
        bedDetails.push({
          ward,
          bedNumber: beds[ward][bedKey].bedNumber,
          bedKey,
          status: beds[ward][bedKey].status,
          type: beds[ward][bedKey].type,
        })
      })
    })

    return bedDetails
  }

  // =================== Download Report ===================
  const handleDownloadReport = async () => {
    if (!reportRef.current) {
      toast.error('Report content not found.', {
        position: 'top-right',
        autoClose: 5000,
      })
      return
    }

    try {
      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true })
      const imgData = canvas.toDataURL('image/png')

      const pdf = new jsPDF('p', 'pt', 'a4')
      const imgProps = pdf.getImageProperties(imgData)
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
      pdf.save(`Daily_Performance_Report_${format(new Date(), 'yyyyMMdd')}.pdf`)
    } catch (error) {
      console.error('Error generating PDF:', error)
      toast.error('Failed to generate PDF. Please try again.', {
        position: 'top-right',
        autoClose: 5000,
      })
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-100 p-6">
      <ToastContainer />
      <div className="max-w-7xl mx-auto bg-white rounded-3xl shadow-2xl overflow-hidden p-8">
        <h1 className="text-4xl font-bold text-green-800 mb-8 text-center">Daily Performance Report</h1>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total OPD Today */}
          <motion.div
            className="bg-white rounded-xl shadow-md p-6 flex items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <FaHospital className="text-green-500 text-4xl mr-4" />
            <div>
              <p className="text-xl font-semibold">{metrics.totalOPD}</p>
              <p className="text-gray-500">Total OPD Today</p>
            </div>
          </motion.div>

          {/* Total IPD Admissions Today */}
          <motion.div
            className="bg-white rounded-xl shadow-md p-6 flex items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <FaUserInjured className="text-blue-500 text-4xl mr-4" />
            <div>
              <p className="text-xl font-semibold">{metrics.totalIPDAdmissions}</p>
              <p className="text-gray-500">IPD Admissions Today</p>
            </div>
          </motion.div>

          {/* Total IPD Discharges Today */}
          <motion.div
            className="bg-white rounded-xl shadow-md p-6 flex items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <FaArrowDown className="text-red-500 text-4xl mr-4" />
            <div>
              <p className="text-xl font-semibold">{metrics.totalIPDDischarges}</p>
              <p className="text-gray-500">IPD Discharges Today</p>
            </div>
          </motion.div>

          {/* Total IPD Referrals Today */}
          <motion.div
            className="bg-white rounded-xl shadow-md p-6 flex items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <FaArrowUp className="text-purple-500 text-4xl mr-4" />
            <div>
              <p className="text-xl font-semibold">{metrics.totalIPDReferrals}</p>
              <p className="text-gray-500">IPD Referrals Today</p>
            </div>
          </motion.div>

          {/* Total Surgeries Today */}
          <motion.div
            className="bg-white rounded-xl shadow-md p-6 flex items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <FaProcedures className="text-yellow-500 text-4xl mr-4" />
            <div>
              <p className="text-xl font-semibold">{metrics.totalSurgeries}</p>
              <p className="text-gray-500">Surgeries Today</p>
            </div>
          </motion.div>

          {/* Total Mortality Reports Today */}
          <motion.div
            className="bg-white rounded-xl shadow-md p-6 flex items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <FaUserInjured className="text-red-700 text-4xl mr-4" />
            <div>
              <p className="text-xl font-semibold">{metrics.totalMortalityReports}</p>
              <p className="text-gray-500">Mortality Reports Today</p>
            </div>
          </motion.div>

          {/* Total Beds */}
          <motion.div
            className="bg-white rounded-xl shadow-md p-6 flex items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <FaBed className="text-indigo-500 text-4xl mr-4" />
            <div>
              <p className="text-xl font-semibold">{metrics.totalBeds}</p>
              <p className="text-gray-500">Total Beds</p>
            </div>
          </motion.div>

          {/* Beds Occupied */}
          <motion.div
            className="bg-white rounded-xl shadow-md p-6 flex items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <FaBed className="text-red-500 text-4xl mr-4" />
            <div>
              <p className="text-xl font-semibold">{metrics.bedsOccupied}</p>
              <p className="text-gray-500">Beds Occupied</p>
            </div>
          </motion.div>

          {/* Beds Available */}
          <motion.div
            className="bg-white rounded-xl shadow-md p-6 flex items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <FaBed className="text-green-500 text-4xl mr-4" />
            <div>
              <p className="text-xl font-semibold">{metrics.bedsAvailable}</p>
              <p className="text-gray-500">Beds Available</p>
            </div>
          </motion.div>
        </div>

        {/* Detailed Bed Status */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <h2 className="text-2xl font-semibold text-indigo-800 mb-4">Detailed Bed Status</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-indigo-100">
                <tr>
                  <th className="px-4 py-2 text-left">Ward</th>
                  <th className="px-4 py-2 text-left">Bed Number</th>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {getBedDetails().map((bed, index) => (
                  <tr key={index} className="border-t">
                    <td className="px-4 py-2 capitalize">{bed.ward.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2">{bed.bedNumber || bed.bedKey}</td>
                    <td className="px-4 py-2 capitalize">{bed.type || 'Standard'}</td>
                    <td
                      className={`px-4 py-2 capitalize ${
                        bed.status.toLowerCase() === 'occupied' ? 'text-red-600' : 'text-green-600'
                      }`}
                    >
                      {bed.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mortality Reports Section */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <h2 className="text-2xl font-semibold text-red-700 mb-4">Mortality Reports Today</h2>
          {metrics.totalMortalityReports === 0 ? (
            <p className="text-gray-500">No mortality reports today.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-red-100">
                  <tr>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Age</th>
                    <th className="px-4 py-2 text-left">Date of Death</th>
                    <th className="px-4 py-2 text-left">Medical Findings</th>
                    <th className="px-4 py-2 text-left">Time Span (Days)</th>
                  </tr>
                </thead>
                <tbody>
                  {mortalityReports
                    .filter((mr) => {
                      const deathDate = parseISO(mr.dateOfDeath)
                      return isSameDay(deathDate, new Date())
                    })
                    .map((mr, index) => (
                      <tr key={index} className="border-t">
                        <td className="px-4 py-2">{mr.name}</td>
                        <td className="px-4 py-2">{mr.age}</td>
                        <td className="px-4 py-2">{format(parseISO(mr.dateOfDeath), 'dd MMM yyyy')}</td>
                        <td className="px-4 py-2">{mr.medicalFindings}</td>
                        <td className="px-4 py-2">{mr.timeSpanDays}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Download Button */}
        <div className="flex justify-end mb-8">
          <button
            onClick={handleDownloadReport}
            className="flex items-center bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition duration-300"
          >
            <FaDownload className="mr-2" />
            Download Report
          </button>
        </div>

        {/* Hidden Report Content for PDF Generation */}
        <div ref={reportRef} className="hidden">
          <ReportContent metrics={metrics} bedDetails={getBedDetails()} mortalityReports={mortalityReports.filter((mr) => isSameDay(parseISO(mr.dateOfDeath), new Date()))} />
        </div>
      </div>
    </div>
  )
}

// =================== Report Content Component ===================
interface ReportContentProps {
  metrics: {
    totalOPD: number
    totalIPDAdmissions: number
    totalIPDDischarges: number
    totalIPDReferrals: number
    totalSurgeries: number
    totalMortalityReports: number
    totalBeds: number
    bedsOccupied: number
    bedsAvailable: number
  }
  bedDetails: Array<{
    ward: string
    bedNumber?: string
    bedKey: string
    status: string
    type?: string
  }>
  mortalityReports: MortalityReport[]
}

const ReportContent: React.FC<ReportContentProps> = ({ metrics, bedDetails, mortalityReports }) => {
  return (
    <div className="w-full" style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* Letterhead */}
      <div className="flex items-center justify-center mb-4">
        <img src="/letterhead.png" alt="Hospital Letterhead" className="w-64" /> {/* Ensure this path is correct */}
      </div>

      {/* Report Title */}
      <h1 className="text-center text-2xl font-bold mb-6">Daily Performance Report</h1>

      {/* Report Date */}
      <p className="text-center mb-8">Date: {format(new Date(), 'dd MMMM yyyy')}</p>

      {/* Metrics Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div>
          <h2 className="text-xl font-semibold">Total OPD Today</h2>
          <p className="text-2xl">{metrics.totalOPD}</p>
        </div>
        <div>
          <h2 className="text-xl font-semibold">IPD Admissions Today</h2>
          <p className="text-2xl">{metrics.totalIPDAdmissions}</p>
        </div>
        <div>
          <h2 className="text-xl font-semibold">IPD Discharges Today</h2>
          <p className="text-2xl">{metrics.totalIPDDischarges}</p>
        </div>
        <div>
          <h2 className="text-xl font-semibold">IPD Referrals Today</h2>
          <p className="text-2xl">{metrics.totalIPDReferrals}</p>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Surgeries Today</h2>
          <p className="text-2xl">{metrics.totalSurgeries}</p>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Mortality Reports Today</h2>
          <p className="text-2xl">{metrics.totalMortalityReports}</p>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Total Beds</h2>
          <p className="text-2xl">{metrics.totalBeds}</p>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Beds Occupied</h2>
          <p className="text-2xl">{metrics.bedsOccupied}</p>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Beds Available</h2>
          <p className="text-2xl">{metrics.bedsAvailable}</p>
        </div>
      </div>

      {/* Detailed Bed Status */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Detailed Bed Status</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="border px-4 py-2">Ward</th>
              <th className="border px-4 py-2">Bed Number</th>
              <th className="border px-4 py-2">Type</th>
              <th className="border px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {bedDetails.map((bed, index) => (
              <tr key={index}>
                <td className="border px-4 py-2 capitalize">{bed.ward.replace(/_/g, ' ')}</td>
                <td className="border px-4 py-2">{bed.bedNumber || bed.bedKey}</td>
                <td className="border px-4 py-2 capitalize">{bed.type || 'Standard'}</td>
                <td
                  className={`border px-4 py-2 capitalize ${
                    bed.status.toLowerCase() === 'occupied' ? 'text-red-600' : 'text-green-600'
                  }`}
                >
                  {bed.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mortality Reports Section */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Mortality Reports Today</h2>
        {mortalityReports.length === 0 ? (
          <p className="text-gray-500">No mortality reports today.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="border px-4 py-2">Name</th>
                <th className="border px-4 py-2">Age</th>
                <th className="border px-4 py-2">Date of Death</th>
                <th className="border px-4 py-2">Medical Findings</th>
                <th className="border px-4 py-2">Time Span (Days)</th>
              </tr>
            </thead>
            <tbody>
              {mortalityReports.map((mr, index) => (
                <tr key={index}>
                  <td className="border px-4 py-2">{mr.name}</td>
                  <td className="border px-4 py-2">{mr.age}</td>
                  <td className="border px-4 py-2">{format(parseISO(mr.dateOfDeath), 'dd MMM yyyy')}</td>
                  <td className="border px-4 py-2">{mr.medicalFindings}</td>
                  <td className="border px-4 py-2">{mr.timeSpanDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-sm text-gray-600">
        <p>This is a computer-generated report and does not require a signature.</p>
        <p>Thank you for choosing Our Hospital. We are committed to your health and well-being.</p>
      </div>
    </div>
  )
}
