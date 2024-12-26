'use client'

import React, { useEffect, useState, useRef, useMemo } from 'react'
import { db } from '@/lib/firebase'
import { ref, onValue } from 'firebase/database'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { format, isSameDay, parseISO } from 'date-fns'
import { motion } from 'framer-motion'
import {
  FaBed,
  FaUserInjured,
  FaHospital,
  FaProcedures,
  FaArrowDown,
  FaArrowUp,
  FaDownload,
} from 'react-icons/fa'
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

  // Ref for offscreen multi-page PDF container
  const reportRef = useRef<HTMLDivElement>(null)

  // =================== Fetch Data ===================
  useEffect(() => {
    const unsubArray: Array<() => void> = []

    // Bookings (OPD)
    const bookingsRef = ref(db, 'bookings')
    unsubArray.push(
      onValue(bookingsRef, (snapshot) => {
        const data = snapshot.val()
        setBookings(data ? (Object.values(data) as Booking[]) : [])
      })
    )

    // IPD Bookings
    const ipdRef = ref(db, 'ipd_bookings')
    unsubArray.push(
      onValue(ipdRef, (snapshot) => {
        const data = snapshot.val()
        setIpdBookings(data ? (Object.values(data) as IPDBooking[]) : [])
      })
    )

    // Surgeries
    const surgeriesRef = ref(db, 'surgeries')
    unsubArray.push(
      onValue(surgeriesRef, (snapshot) => {
        const data = snapshot.val()
        setSurgeries(data ? (Object.values(data) as Surgery[]) : [])
      })
    )

    // Beds
    const bedsRef = ref(db, 'beds')
    unsubArray.push(
      onValue(bedsRef, (snapshot) => {
        const data = snapshot.val()
        setBeds(data || {})
      })
    )

    // Mortality
    const mortalityRef = ref(db, 'mortalityReports')
    unsubArray.push(
      onValue(mortalityRef, (snapshot) => {
        const data = snapshot.val()
        setMortalityReports(data ? (Object.values(data) as MortalityReport[]) : [])
      })
    )

    // Cleanup
    return () => {
      unsubArray.forEach((u) => u())
    }
  }, [])

  // =================== Calculate Today's Metrics ===================
  useEffect(() => {
    const today = new Date()

    // OPD Today
    const totalOPD = bookings.filter((bk) => isSameDay(parseISO(bk.date), today)).length

    // IPD Admissions
    const totalIPDAdmissions = ipdBookings.filter((ipd) =>
      isSameDay(parseISO(ipd.date), today)
    ).length

    // IPD Discharges
    const totalIPDDischarges = ipdBookings.filter((ipd) => {
      if (!ipd.dischargeDate) return false
      return isSameDay(parseISO(ipd.dischargeDate), today)
    }).length

    // IPD Referrals
    const totalIPDReferrals = ipdBookings.filter((ipd) => {
      if (!ipd.referralDoctor) return false
      // Assume referral date is createdAt
      return isSameDay(parseISO(ipd.createdAt), today)
    }).length

    // Surgeries
    const totalSurgeries = surgeries.filter((srg) =>
      isSameDay(parseISO(srg.surgeryDate), today)
    ).length

    // Mortality
    const totalMortalityReports = mortalityReports.filter((mr) =>
      isSameDay(parseISO(mr.dateOfDeath), today)
    ).length

    // Beds
    let totalBeds = 0
    let bedsOccupied = 0
    let bedsAvailable = 0
    Object.keys(beds).forEach((ward) => {
      Object.keys(beds[ward]).forEach((bedKey) => {
        totalBeds++
        if (beds[ward][bedKey].status.toLowerCase() === 'occupied') {
          bedsOccupied++
        } else {
          bedsAvailable++
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

  // =================== Derived Data ===================
  const bedDetails = useMemo(() => {
    const details: Array<{
      ward: string
      bedNumber?: string
      bedKey: string
      status: string
      type?: string
    }> = []

    Object.keys(beds).forEach((ward) => {
      Object.keys(beds[ward]).forEach((bedKey) => {
        details.push({
          ward,
          bedNumber: beds[ward][bedKey].bedNumber,
          bedKey,
          status: beds[ward][bedKey].status,
          type: beds[ward][bedKey].type,
        })
      })
    })
    return details
  }, [beds])

  const todayMortalityReports = useMemo(() => {
    return mortalityReports.filter((mr) => isSameDay(parseISO(mr.dateOfDeath), new Date()))
  }, [mortalityReports])

  // =================== Download DPR (Multi-page) ===================
  const handleDownloadReport = async () => {
    if (!reportRef.current) {
      toast.error('Report content not found.', { position: 'top-right', autoClose: 5000 })
      return
    }
    try {
      await new Promise((resolve) => setTimeout(resolve, 100)) // small delay

      const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' })
      const pages = reportRef.current.children

      for (let i = 0; i < pages.length; i++) {
        if (i > 0) pdf.addPage()
        const canvas = await html2canvas(pages[i] as HTMLElement, {
          scale: 3,
          useCORS: true,
        })
        const imgData = canvas.toDataURL('image/png')
        // A4 @72DPI => 595 width x 842 height
        pdf.addImage(imgData, 'PNG', 0, 0, 595, 842, '', 'FAST')
      }

      pdf.save(`DPR_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`)
      toast.success('DPR downloaded successfully!', { position: 'top-right', autoClose: 3000 })
    } catch (error) {
      console.error('Error generating PDF:', error)
      toast.error('Failed to generate PDF. Please try again.', { position: 'top-right', autoClose: 5000 })
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-100 p-6">
      <ToastContainer />
      <div className="max-w-7xl mx-auto bg-white rounded-3xl shadow-2xl overflow-hidden p-8">
        <h1 className="text-4xl font-bold text-green-800 mb-8 text-center">Daily Performance Report</h1>

        {/* ========== Metrics Cards ========== */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* OPD */}
          <motion.div
            className="bg-white rounded-xl shadow-md p-6 flex items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <FaHospital className="text-green-500 text-4xl mr-4" />
            <div>
              <p className="text-lg font-semibold">{metrics.totalOPD}</p>
              <p className="text-gray-500 text-xs">Total OPD Today</p>
            </div>
          </motion.div>

          {/* IPD Admissions */}
          <motion.div
            className="bg-white rounded-xl shadow-md p-6 flex items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <FaUserInjured className="text-blue-500 text-4xl mr-4" />
            <div>
              <p className="text-lg font-semibold">{metrics.totalIPDAdmissions}</p>
              <p className="text-gray-500 text-xs">IPD Admissions Today</p>
            </div>
          </motion.div>

          {/* IPD Discharges */}
          <motion.div
            className="bg-white rounded-xl shadow-md p-6 flex items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <FaArrowDown className="text-red-500 text-4xl mr-4" />
            <div>
              <p className="text-lg font-semibold">{metrics.totalIPDDischarges}</p>
              <p className="text-gray-500 text-xs">IPD Discharges Today</p>
            </div>
          </motion.div>

          {/* IPD Referrals */}
          <motion.div
            className="bg-white rounded-xl shadow-md p-6 flex items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <FaArrowUp className="text-purple-500 text-4xl mr-4" />
            <div>
              <p className="text-lg font-semibold">{metrics.totalIPDReferrals}</p>
              <p className="text-gray-500 text-xs">IPD Referrals Today</p>
            </div>
          </motion.div>

          {/* Surgeries */}
          <motion.div
            className="bg-white rounded-xl shadow-md p-6 flex items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <FaProcedures className="text-yellow-500 text-4xl mr-4" />
            <div>
              <p className="text-lg font-semibold">{metrics.totalSurgeries}</p>
              <p className="text-gray-500 text-xs">Surgeries Today</p>
            </div>
          </motion.div>

          {/* Mortality */}
          <motion.div
            className="bg-white rounded-xl shadow-md p-6 flex items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <FaUserInjured className="text-red-700 text-4xl mr-4" />
            <div>
              <p className="text-lg font-semibold">{metrics.totalMortalityReports}</p>
              <p className="text-gray-500 text-xs">Mortality Reports Today</p>
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
              <p className="text-lg font-semibold">{metrics.totalBeds}</p>
              <p className="text-gray-500 text-xs">Total Beds</p>
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
              <p className="text-lg font-semibold">{metrics.bedsOccupied}</p>
              <p className="text-gray-500 text-xs">Beds Occupied</p>
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
              <p className="text-lg font-semibold">{metrics.bedsAvailable}</p>
              <p className="text-gray-500 text-xs">Beds Available</p>
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
                  <th className="px-2 py-1 text-left text-xs align-middle">Ward</th>
                  <th className="px-2 py-1 text-left text-xs align-middle">Bed Number</th>
                  <th className="px-2 py-1 text-left text-xs align-middle">Type</th>
                  <th className="px-2 py-1 text-left text-xs align-middle">Status</th>
                </tr>
              </thead>
              <tbody>
                {bedDetails.map((bed, index) => (
                  <tr key={index} className="border-t">
                    <td className="px-2 py-1 capitalize text-xs align-middle">{bed.ward.replace(/_/g, ' ')}</td>
                    <td className="px-2 py-1 text-xs align-middle">{bed.bedNumber || bed.bedKey}</td>
                    <td className="px-2 py-1 capitalize text-xs align-middle">{bed.type || 'Standard'}</td>
                    <td
                      className={`px-2 py-1 capitalize text-xs align-middle ${
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

        {/* Mortality Reports */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <h2 className="text-2xl font-semibold text-red-700 mb-4">Mortality Reports Today</h2>
          {todayMortalityReports.length === 0 ? (
            <p className="text-gray-500 text-xs">No mortality reports today.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-red-100">
                  <tr>
                    <th className="px-2 py-1 text-left text-xs align-middle">Name</th>
                    <th className="px-2 py-1 text-left text-xs align-middle">Age</th>
                    <th className="px-2 py-1 text-left text-xs align-middle">Date of Death</th>
                    <th className="px-2 py-1 text-left text-xs align-middle">Medical Findings</th>
                    <th className="px-2 py-1 text-left text-xs align-middle">Time Span (Days)</th>
                  </tr>
                </thead>
                <tbody>
                  {todayMortalityReports.map((mr, index) => (
                    <tr key={index} className="border-t">
                      <td className="px-2 py-1 text-xs align-middle">{mr.name}</td>
                      <td className="px-2 py-1 text-xs align-middle">{mr.age}</td>
                      <td className="px-2 py-1 text-xs align-middle">
                        {format(parseISO(mr.dateOfDeath), 'dd MMM yyyy')}
                      </td>
                      <td className="px-2 py-1 text-xs align-middle">{mr.medicalFindings}</td>
                      <td className="px-2 py-1 text-xs align-middle">{mr.timeSpanDays}</td>
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
            Download DPR
          </button>
        </div>

        {/* Offscreen Multi-Page Container */}
        <div ref={reportRef} style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <DPRMultiPage
            metrics={metrics}
            bedDetails={bedDetails}
            mortalityReports={todayMortalityReports}
          />
        </div>
      </div>
    </div>
  )
}

// =================== Multi-page DPR Content ===================
interface DPRMultiPageProps {
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

/**
 * DPRMultiPage breaks the content into multiple A4 pages:
 * - The letterhead covers the full 595x842.
 * - The content is placed 70px from the top and 70px from the bottom.
 */
function DPRMultiPage({ metrics, bedDetails, mortalityReports }: DPRMultiPageProps) {
  const [pages, setPages] = useState<React.ReactNode[]>([])

  // Pair metrics for two items per row
  const pairedMetrics = useMemo(() => {
    const metricsArray = [
      { label: 'Total OPD Today', value: metrics.totalOPD },
      { label: 'IPD Admissions', value: metrics.totalIPDAdmissions },
      { label: 'IPD Discharges', value: metrics.totalIPDDischarges },
      { label: 'IPD Referrals', value: metrics.totalIPDReferrals },
      { label: 'Surgeries Today', value: metrics.totalSurgeries },
      { label: 'Mortality Reports', value: metrics.totalMortalityReports },
      { label: 'Total Beds', value: metrics.totalBeds },
      { label: 'Beds Occupied', value: metrics.bedsOccupied },
      { label: 'Beds Available', value: metrics.bedsAvailable },
    ]

    const pairs = []
    for (let i = 0; i < metricsArray.length; i += 2) {
      pairs.push(metricsArray.slice(i, i + 2))
    }
    return pairs
  }, [metrics])

  useEffect(() => {
    const pageWidth = 595
    const pageHeight = 842

    // Content area
    const topOffset = 90
    const bottomOffset = 70
    const maxContentHeight = pageHeight - (topOffset + bottomOffset) // 702

    const contentPages: React.ReactNode[] = []
    let currentPage: React.ReactNode[] = []
    let currentHeight = 0

    // Helper to push content blocks onto the current page or create a new page if needed.
    const addToPage = (element: React.ReactNode, blockHeight: number) => {
      if (currentHeight + blockHeight > maxContentHeight) {
        contentPages.push(
          <div
            key={contentPages.length}
            style={{
              position: 'relative',
              width: `${pageWidth}px`,
              height: `${pageHeight}px`,
              overflow: 'hidden',
            }}
          >
            <DPRPageLayout topOffset={topOffset} bottomOffset={bottomOffset}>
              {currentPage}
            </DPRPageLayout>
          </div>
        )
        currentPage = []
        currentHeight = 0
      }
      currentPage.push(element)
      currentHeight += blockHeight
    }

    // ========== 1. Header ( ~40px ) ==========
    addToPage(
      <div key="header" style={{ marginBottom: '8px' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '18px', fontWeight: '700', margin: '0' }}>Daily Performance Report</h1>
          <p style={{ fontSize: '10px', color: '#555', margin: '4px 0 0 0' }}>
            Date: {format(new Date(), 'dd MMM yyyy')}
          </p>
        </div>
      </div>,
      40
    )

    // ========== 2. Metrics Table ( ~120px ) ==========
    const metricsContent = (
      <div key="metrics" style={{ marginBottom: '12px' }}>
        <h2 style={{ fontSize: '12px', fontWeight: '600', marginBottom: '6px' }}>Today’s Metrics</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8px' }}>
          <tbody>
            {pairedMetrics.map((pair, idx) => (
              <tr key={idx}>
                {pair.map((item, index) => (
                  <React.Fragment key={index}>
                    <td
                      style={{
                        border: '1px solid #ddd',
                        padding: '4px',
                        fontWeight: '500',
                        verticalAlign: 'middle', // Vertically center content
                      }}
                    >
                      {item.label}
                    </td>
                    <td
                      style={{
                        border: '1px solid #ddd',
                        padding: '4px',
                        textAlign: 'center',
                        verticalAlign: 'middle', // Vertically center content
                      }}
                    >
                      {item.value}
                    </td>
                  </React.Fragment>
                ))}
                {/* If odd number, add empty cells */}
                {pair.length === 1 && (
                  <>
                    <td
                      style={{
                        border: '1px solid #ddd',
                        padding: '4px',
                        verticalAlign: 'middle',
                      }}
                    ></td>
                    <td
                      style={{
                        border: '1px solid #ddd',
                        padding: '4px',
                        verticalAlign: 'middle',
                      }}
                    ></td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
    addToPage(metricsContent, 120)

    // ========== 3. Detailed Bed Status ==========
    // Approximate height estimation
    const bedHeaderH = 24
    const bedRowHeight = 12
    const bedBodyH = bedDetails.length * bedRowHeight + bedHeaderH
    addToPage(
      <div key="beds" style={{ marginBottom: '12px' }}>
        <h2 style={{ fontSize: '12px', fontWeight: '600', marginBottom: '6px' }}>Detailed Bed Status</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f0f4f8' }}>
              <th
                style={{
                  border: '1px solid #ddd',
                  padding: '2px',
                  textAlign: 'left',
                  verticalAlign: 'middle', // Vertically center header
                }}
              >
                Ward
              </th>
              <th
                style={{
                  border: '1px solid #ddd',
                  padding: '2px',
                  textAlign: 'left',
                  verticalAlign: 'middle', // Vertically center header
                }}
              >
                Bed Number
              </th>
              <th
                style={{
                  border: '1px solid #ddd',
                  padding: '2px',
                  textAlign: 'left',
                  verticalAlign: 'middle', // Vertically center header
                }}
              >
                Type
              </th>
              <th
                style={{
                  border: '1px solid #ddd',
                  padding: '2px',
                  textAlign: 'left',
                  verticalAlign: 'middle', // Vertically center header
                }}
              >
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {bedDetails.map((bed, index) => (
              <tr key={index} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '2px', textTransform: 'capitalize', verticalAlign: 'middle' }}>
                  {bed.ward.replace(/_/g, ' ')}
                </td>
                <td style={{ padding: '2px', verticalAlign: 'middle' }}>{bed.bedNumber || bed.bedKey}</td>
                <td style={{ padding: '2px', textTransform: 'capitalize', verticalAlign: 'middle' }}>
                  {bed.type || 'Standard'}
                </td>
                <td
                  style={{
                    padding: '2px',
                    textTransform: 'capitalize',
                    color: bed.status.toLowerCase() === 'occupied' ? '#e74c3c' : '#2ecc71',
                    verticalAlign: 'middle',
                  }}
                >
                  {bed.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
      bedBodyH
    )

    // ========== 4. Mortality Reports ==========
    const mortalityContent = (
      <div key="mortality" style={{ marginBottom: '12px' }}>
        <h2 style={{ fontSize: '12px', fontWeight: '600', color: '#e74c3c', marginBottom: '6px' }}>
          Mortality Reports Today
        </h2>
        {mortalityReports.length === 0 ? (
          <p style={{ fontSize: '8px', color: '#555' }}>No mortality reports today.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8px' }}>
            <thead>
              <tr style={{ backgroundColor: '#fdecea' }}>
                <th
                  style={{
                    border: '1px solid #ddd',
                    padding: '2px',
                    textAlign: 'left',
                    verticalAlign: 'middle', // Vertically center header
                  }}
                >
                  Name
                </th>
                <th
                  style={{
                    border: '1px solid #ddd',
                    padding: '2px',
                    textAlign: 'left',
                    verticalAlign: 'middle', // Vertically center header
                  }}
                >
                  Age
                </th>
                <th
                  style={{
                    border: '1px solid #ddd',
                    padding: '2px',
                    textAlign: 'left',
                    verticalAlign: 'middle', // Vertically center header
                  }}
                >
                  Date of Death
                </th>
                <th
                  style={{
                    border: '1px solid #ddd',
                    padding: '2px',
                    textAlign: 'left',
                    verticalAlign: 'middle', // Vertically center header
                  }}
                >
                  Medical Findings
                </th>
                <th
                  style={{
                    border: '1px solid #ddd',
                    padding: '2px',
                    textAlign: 'left',
                    verticalAlign: 'middle', // Vertically center header
                  }}
                >
                  Time Span (Days)
                </th>
              </tr>
            </thead>
            <tbody>
              {mortalityReports.map((mr, index) => (
                <tr key={index} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: '2px', verticalAlign: 'middle' }}>{mr.name}</td>
                  <td style={{ padding: '2px', verticalAlign: 'middle' }}>{mr.age}</td>
                  <td style={{ padding: '2px', verticalAlign: 'middle' }}>
                    {format(parseISO(mr.dateOfDeath), 'dd MMM yyyy')}
                  </td>
                  <td style={{ padding: '2px', verticalAlign: 'middle' }}>{mr.medicalFindings}</td>
                  <td style={{ padding: '2px', verticalAlign: 'middle' }}>{mr.timeSpanDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    )
    // Approximate height estimation
    const mortHeaderH = 24
    const mortRowHeight = 12
    const mortBodyH = mortalityReports.length * mortRowHeight + mortHeaderH
    addToPage(mortalityContent, mortBodyH)

    // ========== 5. Footer ~30px ==========
    addToPage(
      <div key="footer" style={{ textAlign: 'center', fontSize: '6px', color: '#666', marginTop: '8px' }}>
        <p>This is a computer-generated report and does not require a signature.</p>
        <p>Thank you for choosing Our Hospital. We are committed to your health and well-being.</p>
      </div>,
      30
    )

    // If there's any content left in currentPage, create the final page
    if (currentPage.length > 0) {
      contentPages.push(
        <div
          key={contentPages.length}
          style={{
            position: 'relative',
            width: `${pageWidth}px`,
            height: `${pageHeight}px`,
            overflow: 'hidden',
          }}
        >
          <DPRPageLayout topOffset={topOffset} bottomOffset={bottomOffset}>
            {currentPage}
          </DPRPageLayout>
        </div>
      )
    }

    setPages(contentPages)
  }, [pairedMetrics, bedDetails, mortalityReports])

  return <>{pages.map((page, idx) => <React.Fragment key={idx}>{page}</React.Fragment>)}</>
}

// =================== Page Layout with Full Letterhead ===================
interface DPRPageLayoutProps {
  children: React.ReactNode
  topOffset: number
  bottomOffset: number
}

/**
 * DPRPageLayout fills the entire 595x842 page with the letterhead image,
 * and places the content within an absolutely positioned container
 * at top=70px, bottom=70px, left/right=16px.
 */
function DPRPageLayout({ children, topOffset, bottomOffset }: DPRPageLayoutProps) {
  return (
    <div
      style={{
        width: '595px',   // A4 width
        height: '842px',  // A4 height
        backgroundImage: 'url(/letterhead.png)', // Full-page letterhead
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        position: 'relative',
        boxSizing: 'border-box',
      }}
    >
      {/* Content container with top/bottom offsets */}
      <div
        style={{
          position: 'absolute',
          top: `${topOffset}px`,       // 70px from top
          left: '16px',
          right: '16px',
          bottom: `${bottomOffset}px`, // 70px from bottom
          overflow: 'hidden',
          padding: '8px', // Add padding for better spacing
        }}
      >
        {children}
      </div>
    </div>
  )
}
