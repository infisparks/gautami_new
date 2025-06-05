"use client"

import React, { useEffect, useState, useRef, useMemo } from "react"
import { db } from "@/lib/firebase"
import { ref, query, orderByChild, onValue, startAt, endAt } from "firebase/database"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import { format, isSameDay, parseISO } from "date-fns"
import { motion } from "framer-motion"
import {
  FaBed,
  FaUserInjured,
  FaHospital,
  FaArrowUp,
  FaDownload,
  FaUserMd,
  FaPhoneAlt,
  FaChartLine,
} from "react-icons/fa"
import { jsPDF } from "jspdf"
import html2canvas from "html2canvas"

// =================== Interfaces ===================

interface Doctor {
  id: string
  name: string
  department: string
  specialist: string
  opdCharge: number
  ipdCharges: Record<string, number>
}

interface Bed {
  bedNumber: string
  status: string
  type: string
}

interface OPDAppointment {
  amount: number
  appointmentType: string
  createdAt: string
  date: string
  doctor: string
  gender: string
  message?: string
  name: string
  paymentMethod?: string
  phone: string
  serviceName?: string
  time: string
  referredBy?: string
}

interface OnCallAppointment {
  age: string
  appointmentType: string
  createdAt: string
  date: string
  doctor?: string
  gender: string
  name: string
  phone: string
  serviceName?: string
  time: string
}

interface IPDAdmission {
  admissionDate: string
  admissionSource: string
  admissionTime: string
  admissionType: string
  bed: string
  createdAt: string
  dischargeDate?: string
  doctor: string
  name: string
  phone: string
  referDoctor?: string
  relativeAddress: string
  relativeName: string
  relativePhone: string
  roomType: string
  status: string
  uhid: string
}

interface MortalityReport {
  admissionDate: string
  dateOfDeath: string
  medicalFindings: string
  timeSpanDays: number
  createdAt: string
  enteredBy: string
  patientId: string
  patientName: string
}

interface PatientInfo {
  name: string
  gender: string
  age: string
  phone: string
  address?: string
  uhid: string
}

// =================== Main Component ===================

export default function DailyPerformanceReport() {
  // States for data
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [beds, setBeds] = useState<Record<string, Record<string, Bed>>>({})
  const [onCallAppointments, setOnCallAppointments] = useState<OnCallAppointment[]>([])
  const [opdAppointments, setOpdAppointments] = useState<OPDAppointment[]>([])
  const [ipdAdmissions, setIpdAdmissions] = useState<IPDAdmission[]>([])
  const [mortalityReports, setMortalityReports] = useState<MortalityReport[]>([])
  const [patientInfo, setPatientInfo] = useState<Record<string, PatientInfo>>({})

  // UI states
  const [loading, setLoading] = useState(true)

  const [metrics, setMetrics] = useState({
    totalOPD: 0,
    totalOnCall: 0,
    totalIPDAdmissions: 0,
    totalIPDDischarges: 0,
    totalIPDReferrals: 0,
    totalMortality: 0,
    totalBeds: 0,
    bedsOccupied: 0,
    bedsAvailable: 0,
  })

  // Ref for offscreen multi-page PDF container
  const reportRef = useRef<HTMLDivElement>(null)

  // =================== Fetch Doctors ===================
  useEffect(() => {
    const doctorsRef = ref(db, "doctors")
    const unsubscribe = onValue(doctorsRef, (snapshot) => {
      const data = snapshot.val()
      const doctorsList: Doctor[] = []

      if (data) {
        Object.entries(data).forEach(([id, doctorData]: [string, any]) => {
          doctorsList.push({
            id,
            name: doctorData.name || "",
            department: doctorData.department || "",
            specialist: doctorData.specialist || "",
            opdCharge: Number(doctorData.opdCharge) || 0,
            ipdCharges: doctorData.ipdCharges || {},
          })
        })
      }

      setDoctors(doctorsList)
    })

    return () => unsubscribe()
  }, [])

  // =================== Fetch Beds ===================
  useEffect(() => {
    const bedsRef = ref(db, "beds")
    const unsubscribe = onValue(bedsRef, (snapshot) => {
      const data = snapshot.val()
      setBeds(data || {})
    })

    return () => unsubscribe()
  }, [])

  // =================== Fetch OnCall Appointments ===================
  useEffect(() => {
    // Get today's date in ISO format for query
    const today = new Date()
    const todayStr = format(today, "yyyy-MM-dd")

    const onCallRef = ref(db, "oncall")
    // Use query to filter by date to reduce data download
    const onCallQuery = query(
      onCallRef,
      orderByChild("date"),
      startAt(todayStr + "T00:00:00"),
      endAt(todayStr + "T23:59:59"),
    )

    const unsubscribe = onValue(onCallQuery, (snapshot) => {
      const data = snapshot.val()
      const onCallList: OnCallAppointment[] = []

      if (data) {
        Object.values(data).forEach((appointmentData: any) => {
          onCallList.push({
            age: appointmentData.age || "",
            appointmentType: appointmentData.appointmentType || "oncall",
            createdAt: appointmentData.createdAt || "",
            date: appointmentData.date || "",
            doctor: appointmentData.doctor || "",
            gender: appointmentData.gender || "",
            name: appointmentData.name || "",
            phone: appointmentData.phone || "",
            serviceName: appointmentData.serviceName || "",
            time: appointmentData.time || "",
          })
        })
      }

      setOnCallAppointments(onCallList)
    })

    return () => unsubscribe()
  }, [])

  // =================== Fetch OPD Appointments ===================
  useEffect(() => {
    // Get today's date in ISO format for query
    const today = new Date()
    const todayStr = format(today, "yyyy-MM-dd")

    const opdList: OPDAppointment[] = []

    // Using the new structure: patients/opddetail/{patientId}/{appointmentId}
    const opdRef = ref(db, "patients/opddetail")

    // We'll use a more efficient approach by querying with date index
    const unsubscribe = onValue(opdRef, (snapshot) => {
      const data = snapshot.val()

      if (data) {
        Object.entries(data).forEach(([patientId, appointments]: [string, any]) => {
          Object.entries(appointments).forEach(([appointmentId, appt]: [string, any]) => {
            // Check if appointment is for today
            if (appt.date && isSameDay(parseISO(appt.date), today)) {
              opdList.push({
                amount: Number(appt.amount) || 0,
                appointmentType: appt.appointmentType || "visithospital",
                createdAt: appt.createdAt || "",
                date: appt.date || "",
                doctor: appt.doctor || "",
                gender: appt.gender || "",
                message: appt.message || "",
                name: appt.name || "",
                paymentMethod: appt.paymentMethod || "cash",
                phone: appt.phone || "",
                serviceName: appt.serviceName || "",
                time: appt.time || "",
                referredBy: appt.referredBy || appt.referBy || "", // Check both possible keys
              })
            }
          })
        })
      }

      setOpdAppointments(opdList)
    })

    return () => unsubscribe()
  }, [])

  // =================== Fetch IPD Admissions ===================
  useEffect(() => {
    // Get today's date for filtering
    const today = new Date()

    const ipdList: IPDAdmission[] = []

    // Using the new structure: patients/ipddetail/userinfoipd/{patientId}/{ipdId}
    const ipdRef = ref(db, "patients/ipddetail/userinfoipd")

    const unsubscribe = onValue(ipdRef, (snapshot) => {
      const data = snapshot.val()

      if (data) {
        Object.entries(data).forEach(([patientId, admissions]: [string, any]) => {
          Object.entries(admissions).forEach(([ipdId, ipd]: [string, any]) => {
            // Check if admission is for today
            if (ipd.admissionDate && isSameDay(parseISO(ipd.admissionDate), today)) {
              ipdList.push({
                admissionDate: ipd.admissionDate || "",
                admissionSource: ipd.admissionSource || "",
                admissionTime: ipd.admissionTime || "",
                admissionType: ipd.admissionType || "",
                bed: ipd.bed || "",
                createdAt: ipd.createdAt || "",
                dischargeDate: ipd.dischargeDate || "",
                doctor: ipd.doctor || "",
                name: ipd.name || "",
                phone: ipd.phone || "",
                referDoctor: ipd.referDoctor || ipd.referralDoctor || "", // Check both possible keys
                relativeAddress: ipd.relativeAddress || "",
                relativeName: ipd.relativeName || "",
                relativePhone: ipd.relativePhone || "",
                roomType: ipd.roomType || "",
                status: ipd.status || "",
                uhid: patientId,
              })
            }
          })
        })
      }

      setIpdAdmissions(ipdList)
    })

    return () => unsubscribe()
  }, [])

  // =================== Fetch Mortality Reports ===================
  useEffect(() => {
    // Get today's date for filtering
    const today = new Date()

    const mortalityList: MortalityReport[] = []

    // Using the new structure: patients/mortalitydetail/{patientId}/{mortalityId}
    const mortalityRef = ref(db, "patients/mortalitydetail")

    const unsubscribe = onValue(mortalityRef, (snapshot) => {
      const data = snapshot.val()

      if (data) {
        Object.entries(data).forEach(([patientId, reports]: [string, any]) => {
          Object.entries(reports).forEach(([mortalityId, report]: [string, any]) => {
            // Check if death date is today
            if (report.dateOfDeath && isSameDay(parseISO(report.dateOfDeath), today)) {
              mortalityList.push({
                admissionDate: report.admissionDate || "",
                dateOfDeath: report.dateOfDeath || "",
                medicalFindings: report.medicalFindings || "",
                timeSpanDays: report.timeSpanDays || 0,
                createdAt: report.createdAt || "",
                enteredBy: report.enteredBy || "",
                patientId,
                patientName: report.patientName || "",
              })
            }
          })
        })
      }

      setMortalityReports(mortalityList)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  // =================== Fetch Patient Info ===================
  useEffect(() => {
    const patientInfoRef = ref(db, "patients/patientinfo")

    const unsubscribe = onValue(patientInfoRef, (snapshot) => {
      const data = snapshot.val()
      setPatientInfo(data || {})
    })

    return () => unsubscribe()
  }, [])

  // =================== Calculate Today's Metrics ===================
  useEffect(() => {
    const today = new Date()

    // OPD and OnCall appointments today
    const totalOPD = opdAppointments.length
    const totalOnCall = onCallAppointments.length

    // IPD metrics
    const totalIPDAdmissions = ipdAdmissions.length

    // For discharges, we check the dischargeDate field
    const totalIPDDischarges = ipdAdmissions.filter(
      (ipd) => ipd.dischargeDate && isSameDay(parseISO(ipd.dischargeDate), today),
    ).length

    // For referrals, check the referDoctor field
    const totalIPDReferrals = ipdAdmissions.filter((ipd) => ipd.referDoctor).length

    // Mortality today
    const totalMortality = mortalityReports.length

    // Bed statistics
    let totalBeds = 0
    let bedsOccupied = 0
    let bedsAvailable = 0

    Object.keys(beds).forEach((ward) => {
      Object.keys(beds[ward]).forEach((bedKey) => {
        totalBeds++
        if (beds[ward][bedKey].status.toLowerCase() === "occupied") {
          bedsOccupied++
        } else {
          bedsAvailable++
        }
      })
    })

    setMetrics({
      totalOPD,
      totalOnCall,
      totalIPDAdmissions,
      totalIPDDischarges,
      totalIPDReferrals,
      totalMortality,
      totalBeds,
      bedsOccupied,
      bedsAvailable,
    })
  }, [opdAppointments, onCallAppointments, ipdAdmissions, mortalityReports, beds])

  // =================== Derived Data ===================
  const bedDetails = useMemo(() => {
    const details: Array<{
      ward: string
      bedNumber: string
      bedKey: string
      status: string
      type: string
    }> = []

    Object.keys(beds).forEach((ward) => {
      Object.keys(beds[ward]).forEach((bedKey) => {
        details.push({
          ward,
          bedNumber: beds[ward][bedKey].bedNumber || "",
          bedKey,
          status: beds[ward][bedKey].status || "Available",
          type: beds[ward][bedKey].type || "standard",
        })
      })
    })

    return details
  }, [beds])

  const todayMortalityReports = useMemo(() => {
    return mortalityReports
  }, [mortalityReports])

  const todayIPDReferrals = useMemo(() => {
    return ipdAdmissions.filter((ipd) => ipd.referDoctor)
  }, [ipdAdmissions])

  // =================== Download DPR (Multi-page) ===================
  const handleDownloadReport = async () => {
    if (!reportRef.current) {
      toast.error("Report content not found.", { position: "top-right", autoClose: 5000 })
      return
    }
    try {
      await new Promise((resolve) => setTimeout(resolve, 100)) // small delay

      const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" })
      const pages = reportRef.current.children

      for (let i = 0; i < pages.length; i++) {
        if (i > 0) pdf.addPage()
        const canvas = await html2canvas(pages[i] as HTMLElement, {
          scale: 3,
          useCORS: true,
        })
        const imgData = canvas.toDataURL("image/png")
        // A4 @72DPI => 595 width x 842 height
        pdf.addImage(imgData, "PNG", 0, 0, 595, 842, "", "FAST")
      }

      pdf.save(`DPR_${format(new Date(), "yyyyMMdd_HHmmss")}.pdf`)
      toast.success("DPR downloaded successfully!", { position: "top-right", autoClose: 3000 })
    } catch (error) {
      console.error("Error generating PDF:", error)
      toast.error("Failed to generate PDF. Please try again.", { position: "top-right", autoClose: 5000 })
    }
  }

  // Function to get doctor name by ID
  const getDoctorName = (doctorId: string) => {
    const doctor = doctors.find((d) => d.id === doctorId)
    return doctor ? doctor.name : "Unknown Doctor"
  }

  // =================== Render ===================
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-blue-50 p-6">
      <ToastContainer />
      <div className="max-w-7xl mx-auto bg-white rounded-3xl shadow-xl overflow-hidden">
        {/* Header with gradient background */}
        <div className="bg-gradient-to-r from-teal-500 to-blue-600 p-8 text-white">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <h1 className="text-4xl font-bold mb-2">Daily Performance Report</h1>
              <p className="text-teal-100">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleDownloadReport}
                className="flex items-center bg-white text-blue-600 px-6 py-3 rounded-lg hover:bg-blue-50 transition duration-300 shadow-md"
              >
                <FaDownload className="mr-2" />
                Download Report
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center p-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500"></div>
          </div>
        ) : (
          <div className="p-8">
            {/* Summary Cards */}
            <div className="mb-10">
              <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
                <FaChartLine className="mr-2 text-teal-500" />
                Todays Summary
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* OPD */}
                <motion.div
                  className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl shadow-md p-6 border-l-4 border-green-500"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider">OPD Visits</p>
                      <p className="text-3xl font-bold text-gray-800 mt-1">{metrics.totalOPD}</p>
                    </div>
                    <div className="bg-green-200 p-3 rounded-full">
                      <FaHospital className="text-green-600 text-xl" />
                    </div>
                  </div>
                </motion.div>

                {/* OnCall */}
                <motion.div
                  className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-md p-6 border-l-4 border-blue-500"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider">OnCall Requests</p>
                      <p className="text-3xl font-bold text-gray-800 mt-1">{metrics.totalOnCall}</p>
                    </div>
                    <div className="bg-blue-200 p-3 rounded-full">
                      <FaPhoneAlt className="text-blue-600 text-xl" />
                    </div>
                  </div>
                </motion.div>

                {/* IPD Admissions */}
                <motion.div
                  className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl shadow-md p-6 border-l-4 border-purple-500"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider">IPD Admissions</p>
                      <p className="text-3xl font-bold text-gray-800 mt-1">{metrics.totalIPDAdmissions}</p>
                    </div>
                    <div className="bg-purple-200 p-3 rounded-full">
                      <FaUserInjured className="text-purple-600 text-xl" />
                    </div>
                  </div>
                </motion.div>

                {/* IPD Referrals */}
                <motion.div
                  className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl shadow-md p-6 border-l-4 border-indigo-500"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7 }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider">IPD Referrals</p>
                      <p className="text-3xl font-bold text-gray-800 mt-1">{metrics.totalIPDReferrals}</p>
                    </div>
                    <div className="bg-indigo-200 p-3 rounded-full">
                      <FaArrowUp className="text-indigo-600 text-xl" />
                    </div>
                  </div>
                </motion.div>

                {/* Mortality */}
                <motion.div
                  className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl shadow-md p-6 border-l-4 border-red-500"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Mortality</p>
                      <p className="text-3xl font-bold text-gray-800 mt-1">{metrics.totalMortality}</p>
                    </div>
                    <div className="bg-red-200 p-3 rounded-full">
                      <FaUserMd className="text-red-600 text-xl" />
                    </div>
                  </div>
                </motion.div>

                {/* IPD Discharges */}
                <motion.div
                  className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl shadow-md p-6 border-l-4 border-amber-500"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider">IPD Discharges</p>
                      <p className="text-3xl font-bold text-gray-800 mt-1">{metrics.totalIPDDischarges}</p>
                    </div>
                    <div className="bg-amber-200 p-3 rounded-full">
                      <FaUserMd className="text-amber-600 text-xl" />
                    </div>
                  </div>
                </motion.div>

                {/* Bed Occupancy */}
                <motion.div
                  className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-xl shadow-md p-6 border-l-4 border-teal-500"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8 }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Bed Occupancy</p>
                      <div className="flex items-end mt-1">
                        <p className="text-3xl font-bold text-gray-800">{metrics.bedsOccupied}</p>
                        <p className="text-sm text-gray-500 ml-1 mb-1">/ {metrics.totalBeds}</p>
                      </div>
                    </div>
                    <div className="bg-teal-200 p-3 rounded-full">
                      <FaBed className="text-teal-600 text-xl" />
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>

            {/* Detailed Bed Status */}
            <div className="bg-white rounded-xl shadow-md p-6 mb-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                <FaBed className="mr-2 text-teal-500" />
                Bed Status
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gradient-to-r from-teal-100 to-blue-100 text-gray-700">
                      <th className="px-4 py-3 text-left font-semibold rounded-tl-lg">Ward</th>
                      <th className="px-4 py-3 text-left font-semibold">Bed Number</th>
                      <th className="px-4 py-3 text-left font-semibold">Type</th>
                      <th className="px-4 py-3 text-left font-semibold rounded-tr-lg">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bedDetails.map((bed, index) => (
                      <tr
                        key={index}
                        className={`border-b ${index % 2 === 0 ? "bg-gray-50" : "bg-white"} hover:bg-gray-100 transition-colors`}
                      >
                        <td className="px-4 py-3 capitalize">{bed.ward.replace(/_/g, " ")}</td>
                        <td className="px-4 py-3">{bed.bedNumber || bed.bedKey}</td>
                        <td className="px-4 py-3 capitalize">{bed.type || "Standard"}</td>
                        <td
                          className={`px-4 py-3 capitalize font-medium ${
                            bed.status.toLowerCase() === "occupied" ? "text-red-600" : "text-green-600"
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

            {/* Mortality Reports Today */}
            <div className="bg-white rounded-xl shadow-md p-6 mb-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                <FaUserMd className="mr-2 text-red-500" />
                Todays Mortality Reports
              </h2>
              {todayMortalityReports.length === 0 ? (
                <div className="bg-red-50 p-6 rounded-lg text-center">
                  <p className="text-gray-600">No mortality reports for today.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gradient-to-r from-red-100 to-pink-100 text-gray-700">
                        <th className="px-4 py-3 text-left font-semibold rounded-tl-lg">Patient Name</th>
                        <th className="px-4 py-3 text-left font-semibold">Admission Date</th>
                        <th className="px-4 py-3 text-left font-semibold">Date of Death</th>
                        <th className="px-4 py-3 text-left font-semibold">Days in Hospital</th>
                        <th className="px-4 py-3 text-left font-semibold rounded-tr-lg">Medical Findings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {todayMortalityReports.map((report, index) => (
                        <tr
                          key={index}
                          className={`border-b ${index % 2 === 0 ? "bg-gray-50" : "bg-white"} hover:bg-gray-100 transition-colors`}
                        >
                          <td className="px-4 py-3 font-medium">{report.patientName}</td>
                          <td className="px-4 py-3">{format(parseISO(report.admissionDate), "MMM dd, yyyy")}</td>
                          <td className="px-4 py-3">{format(parseISO(report.dateOfDeath), "MMM dd, yyyy")}</td>
                          <td className="px-4 py-3">{report.timeSpanDays}</td>
                          <td className="px-4 py-3 truncate max-w-xs">{report.medicalFindings}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* IPD Referrals */}
            <div className="bg-white rounded-xl shadow-md p-6 mb-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                <FaArrowUp className="mr-2 text-indigo-500" />
                Todays IPD Referrals
              </h2>
              {todayIPDReferrals.length === 0 ? (
                <div className="bg-indigo-50 p-6 rounded-lg text-center">
                  <p className="text-gray-600">No IPD referrals for today.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gradient-to-r from-indigo-100 to-purple-100 text-gray-700">
                        <th className="px-4 py-3 text-left font-semibold rounded-tl-lg">Patient Name</th>
                        <th className="px-4 py-3 text-left font-semibold">Room Type</th>
                        <th className="px-4 py-3 text-left font-semibold">Referred By</th>
                        <th className="px-4 py-3 text-left font-semibold rounded-tr-lg">Admission Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {todayIPDReferrals.map((ipd, index) => (
                        <tr
                          key={index}
                          className={`border-b ${index % 2 === 0 ? "bg-gray-50" : "bg-white"} hover:bg-gray-100 transition-colors`}
                        >
                          <td className="px-4 py-3 font-medium">{ipd.name}</td>
                          <td className="px-4 py-3 capitalize">{ipd.roomType.replace(/_/g, " ")}</td>
                          <td className="px-4 py-3">
                            {ipd.referDoctor ? getDoctorName(ipd.referDoctor) : "Not specified"}
                          </td>
                          <td className="px-4 py-3">{ipd.admissionTime}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Offscreen Multi-Page Container */}
        <div ref={reportRef} style={{ position: "absolute", left: "-9999px", top: 0 }}>
          <DPRMultiPage
            metrics={metrics}
            bedDetails={bedDetails}
            mortalityReports={todayMortalityReports}
            ipdReferrals={todayIPDReferrals}
            doctors={doctors}
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
    totalOnCall: number
    totalIPDAdmissions: number
    totalIPDDischarges: number
    totalIPDReferrals: number
    totalMortality: number
    totalBeds: number
    bedsOccupied: number
    bedsAvailable: number
  }
  bedDetails: Array<{
    ward: string
    bedNumber: string
    bedKey: string
    status: string
    type: string
  }>
  mortalityReports: MortalityReport[]
  ipdReferrals: IPDAdmission[]
  doctors: Doctor[]
}

function DPRMultiPage({ metrics, bedDetails, mortalityReports, ipdReferrals, doctors }: DPRMultiPageProps) {
  const [pages, setPages] = useState<React.ReactNode[]>([])

  // Function to get doctor name by ID
  const getDoctorName = (doctorId: string) => {
    const doctor = doctors.find((d) => d.id === doctorId)
    return doctor ? doctor.name : "Unknown Doctor"
  }

  // Pair metrics for two items per row
  const pairedMetrics = useMemo(() => {
    const metricsArray = [
      { label: "Total OPD Today", value: metrics.totalOPD },
      { label: "Total OnCall Today", value: metrics.totalOnCall },
      { label: "IPD Admissions", value: metrics.totalIPDAdmissions },
      { label: "IPD Discharges", value: metrics.totalIPDDischarges },
      { label: "IPD Referrals", value: metrics.totalIPDReferrals },
      { label: "Mortality Today", value: metrics.totalMortality },
      { label: "Total Beds", value: metrics.totalBeds },
      { label: "Beds Occupied", value: metrics.bedsOccupied },
      { label: "Beds Available", value: metrics.bedsAvailable },
    ]

    const pairs = []
    for (let i = 0; i < metricsArray.length; i += 2) {
      pairs.push(metricsArray.slice(i, i + 2))
    }
    return pairs
  }, [metrics])

  // PDF page layout constants
  useEffect(() => {
    const pageWidth = 595
    const pageHeight = 842
    const topOffset = 70
    const bottomOffset = 70
    const maxContentHeight = pageHeight - (topOffset + bottomOffset)

    const contentPages: React.ReactNode[] = []
    let currentPage: React.ReactNode[] = []
    let currentHeight = 0

    const addToPage = (element: React.ReactNode, blockHeight: number) => {
      if (currentHeight + blockHeight > maxContentHeight) {
        contentPages.push(
          <div
            key={contentPages.length}
            style={{
              position: "relative",
              width: `${pageWidth}px`,
              height: `${pageHeight}px`,
              overflow: "hidden",
            }}
          >
            <DPRPageLayout topOffset={topOffset} bottomOffset={bottomOffset}>
              {currentPage}
            </DPRPageLayout>
          </div>,
        )
        currentPage = []
        currentHeight = 0
      }
      currentPage.push(element)
      currentHeight += blockHeight
    }

    // 1. Header (~40px)
    addToPage(
      <div key="header" style={{ marginBottom: "12px" }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: "20px", fontWeight: "700", margin: "0", color: "#0f766e" }}>
            Daily Performance Report
          </h1>
          <p style={{ fontSize: "10px", color: "#555", margin: "4px 0 0 0" }}>
            Date: {format(new Date(), "dd MMM yyyy")}
          </p>
        </div>
      </div>,
      40,
    )

    // 2. Metrics Table (~120px)
    const metricsContent = (
      <div key="metrics" style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "8px", color: "#0f766e" }}>Todays Metrics</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9px", border: "1px solid #e5e7eb" }}>
          <tbody>
            {pairedMetrics.map((pair, idx) => (
              <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? "#f9fafb" : "#ffffff" }}>
                {pair.map((item, index) => (
                  <React.Fragment key={index}>
                    <td
                      style={{
                        border: "1px solid #e5e7eb",
                        padding: "6px",
                        fontWeight: "500",
                        verticalAlign: "middle",
                      }}
                    >
                      {item.label}
                    </td>
                    <td
                      style={{
                        border: "1px solid #e5e7eb",
                        padding: "6px",
                        textAlign: "center",
                        verticalAlign: "middle",
                        fontWeight: "600",
                      }}
                    >
                      {item.value}
                    </td>
                  </React.Fragment>
                ))}
                {pair.length === 1 && (
                  <>
                    <td style={{ border: "1px solid #e5e7eb", padding: "6px", verticalAlign: "middle" }}></td>
                    <td style={{ border: "1px solid #e5e7eb", padding: "6px", verticalAlign: "middle" }}></td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
    addToPage(metricsContent, 140)

    // 3. Detailed Bed Status
    const bedHeaderH = 30
    const bedRowHeight = 16
    const bedBodyH = bedDetails.length * bedRowHeight + bedHeaderH
    addToPage(
      <div key="beds" style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "8px", color: "#0f766e" }}>
          Detailed Bed Status
        </h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9px", border: "1px solid #e5e7eb" }}>
          <thead>
            <tr style={{ backgroundColor: "#e6f7f5" }}>
              <th
                style={{
                  border: "1px solid #e5e7eb",
                  padding: "6px",
                  textAlign: "left",
                  verticalAlign: "middle",
                  color: "#0f766e",
                }}
              >
                Ward
              </th>
              <th
                style={{
                  border: "1px solid #e5e7eb",
                  padding: "6px",
                  textAlign: "left",
                  verticalAlign: "middle",
                  color: "#0f766e",
                }}
              >
                Bed Number
              </th>
              <th
                style={{
                  border: "1px solid #e5e7eb",
                  padding: "6px",
                  textAlign: "left",
                  verticalAlign: "middle",
                  color: "#0f766e",
                }}
              >
                Type
              </th>
              <th
                style={{
                  border: "1px solid #e5e7eb",
                  padding: "6px",
                  textAlign: "left",
                  verticalAlign: "middle",
                  color: "#0f766e",
                }}
              >
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {bedDetails.map((bed, index) => (
              <tr key={index} style={{ backgroundColor: index % 2 === 0 ? "#f9fafb" : "#ffffff" }}>
                <td
                  style={{
                    padding: "6px",
                    textTransform: "capitalize",
                    verticalAlign: "middle",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  {bed.ward.replace(/_/g, " ")}
                </td>
                <td style={{ padding: "6px", verticalAlign: "middle", border: "1px solid #e5e7eb" }}>
                  {bed.bedNumber || bed.bedKey}
                </td>
                <td
                  style={{
                    padding: "6px",
                    textTransform: "capitalize",
                    verticalAlign: "middle",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  {bed.type || "Standard"}
                </td>
                <td
                  style={{
                    padding: "6px",
                    textTransform: "capitalize",
                    color: bed.status.toLowerCase() === "occupied" ? "#dc2626" : "#16a34a",
                    verticalAlign: "middle",
                    fontWeight: "600",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  {bed.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
      bedBodyH,
    )

    // 4. Mortality Reports
    const mortalityContent = (
      <div key="mortality" style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "14px", fontWeight: "600", color: "#dc2626", marginBottom: "8px" }}>
          Mortality Reports Today
        </h2>
        {mortalityReports.length === 0 ? (
          <p
            style={{
              fontSize: "9px",
              color: "#555",
              fontStyle: "italic",
              textAlign: "center",
              padding: "8px",
              backgroundColor: "#fee2e2",
            }}
          >
            No mortality reports for today.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9px", border: "1px solid #e5e7eb" }}>
            <thead>
              <tr style={{ backgroundColor: "#fee2e2" }}>
                <th
                  style={{
                    border: "1px solid #e5e7eb",
                    padding: "6px",
                    textAlign: "left",
                    verticalAlign: "middle",
                    color: "#b91c1c",
                  }}
                >
                  Patient Name
                </th>
                <th
                  style={{
                    border: "1px solid #e5e7eb",
                    padding: "6px",
                    textAlign: "left",
                    verticalAlign: "middle",
                    color: "#b91c1c",
                  }}
                >
                  Admission Date
                </th>
                <th
                  style={{
                    border: "1px solid #e5e7eb",
                    padding: "6px",
                    textAlign: "left",
                    verticalAlign: "middle",
                    color: "#b91c1c",
                  }}
                >
                  Date of Death
                </th>
                <th
                  style={{
                    border: "1px solid #e5e7eb",
                    padding: "6px",
                    textAlign: "left",
                    verticalAlign: "middle",
                    color: "#b91c1c",
                  }}
                >
                  Days in Hospital
                </th>
                <th
                  style={{
                    border: "1px solid #e5e7eb",
                    padding: "6px",
                    textAlign: "left",
                    verticalAlign: "middle",
                    color: "#b91c1c",
                  }}
                >
                  Medical Findings
                </th>
              </tr>
            </thead>
            <tbody>
              {mortalityReports.map((report, index) => (
                <tr key={index} style={{ backgroundColor: index % 2 === 0 ? "#f9fafb" : "#ffffff" }}>
                  <td
                    style={{ padding: "6px", verticalAlign: "middle", fontWeight: "600", border: "1px solid #e5e7eb" }}
                  >
                    {report.patientName}
                  </td>
                  <td style={{ padding: "6px", verticalAlign: "middle", border: "1px solid #e5e7eb" }}>
                    {format(parseISO(report.admissionDate), "MMM dd, yyyy")}
                  </td>
                  <td style={{ padding: "6px", verticalAlign: "middle", border: "1px solid #e5e7eb" }}>
                    {format(parseISO(report.dateOfDeath), "MMM dd, yyyy")}
                  </td>
                  <td style={{ padding: "6px", verticalAlign: "middle", border: "1px solid #e5e7eb" }}>
                    {report.timeSpanDays}
                  </td>
                  <td style={{ padding: "6px", verticalAlign: "middle", border: "1px solid #e5e7eb" }}>
                    {report.medicalFindings.length > 50
                      ? `${report.medicalFindings.substring(0, 50)}...`
                      : report.medicalFindings}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    )
    const mortalityHeaderH = 30
    const mortalityRowHeight = 16
    const mortalityBodyH =
      (mortalityReports.length > 0 ? mortalityReports.length * mortalityRowHeight : 30) + mortalityHeaderH
    addToPage(mortalityContent, mortalityBodyH)

    // 5. IPD Referrals
    const referralsContent = (
      <div key="referrals" style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "14px", fontWeight: "600", color: "#6366f1", marginBottom: "8px" }}>
          IPD Referrals Today
        </h2>
        {ipdReferrals.length === 0 ? (
          <p
            style={{
              fontSize: "9px",
              color: "#555",
              fontStyle: "italic",
              textAlign: "center",
              padding: "8px",
              backgroundColor: "#e0e7ff",
            }}
          >
            No IPD referrals for today.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9px", border: "1px solid #e5e7eb" }}>
            <thead>
              <tr style={{ backgroundColor: "#e0e7ff" }}>
                <th
                  style={{
                    border: "1px solid #e5e7eb",
                    padding: "6px",
                    textAlign: "left",
                    verticalAlign: "middle",
                    color: "#4f46e5",
                  }}
                >
                  Patient Name
                </th>
                <th
                  style={{
                    border: "1px solid #e5e7eb",
                    padding: "6px",
                    textAlign: "left",
                    verticalAlign: "middle",
                    color: "#4f46e5",
                  }}
                >
                  Room Type
                </th>
                <th
                  style={{
                    border: "1px solid #e5e7eb",
                    padding: "6px",
                    textAlign: "left",
                    verticalAlign: "middle",
                    color: "#4f46e5",
                  }}
                >
                  Referred By
                </th>
                <th
                  style={{
                    border: "1px solid #e5e7eb",
                    padding: "6px",
                    textAlign: "left",
                    verticalAlign: "middle",
                    color: "#4f46e5",
                  }}
                >
                  Admission Time
                </th>
              </tr>
            </thead>
            <tbody>
              {ipdReferrals.map((ipd, index) => (
                <tr key={index} style={{ backgroundColor: index % 2 === 0 ? "#f9fafb" : "#ffffff" }}>
                  <td
                    style={{ padding: "6px", verticalAlign: "middle", fontWeight: "600", border: "1px solid #e5e7eb" }}
                  >
                    {ipd.name}
                  </td>
                  <td
                    style={{
                      padding: "6px",
                      verticalAlign: "middle",
                      textTransform: "capitalize",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    {ipd.roomType.replace(/_/g, " ")}
                  </td>
                  <td style={{ padding: "6px", verticalAlign: "middle", border: "1px solid #e5e7eb" }}>
                    {ipd.referDoctor ? getDoctorName(ipd.referDoctor) : "Not specified"}
                  </td>
                  <td style={{ padding: "6px", verticalAlign: "middle", border: "1px solid #e5e7eb" }}>
                    {ipd.admissionTime}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    )
    const referralHeaderH = 30
    const referralRowHeight = 16
    const referralBodyH = (ipdReferrals.length > 0 ? ipdReferrals.length * referralRowHeight : 30) + referralHeaderH
    addToPage(referralsContent, referralBodyH)

    // 6. Footer (~30px)
    addToPage(
      <div
        key="footer"
        style={{
          textAlign: "center",
          fontSize: "8px",
          color: "#666",
          marginTop: "16px",
          borderTop: "1px solid #e5e7eb",
          paddingTop: "8px",
        }}
      >
        <p>This is a computer-generated report and does not require a signature.</p>
        <p>Generated on {format(new Date(), "dd MMM yyyy 'at' hh:mm a")}</p>
        <p>Thank you for choosing Our Hospital. We are committed to your health and well-being.</p>
      </div>,
      40,
    )

    // If any content remains, add the final page
    if (currentPage.length > 0) {
      contentPages.push(
        <div
          key={contentPages.length}
          style={{
            position: "relative",
            width: `${pageWidth}px`,
            height: `${pageHeight}px`,
            overflow: "hidden",
          }}
        >
          <DPRPageLayout topOffset={topOffset} bottomOffset={bottomOffset}>
            {currentPage}
          </DPRPageLayout>
        </div>,
      )
    }

    setPages(contentPages)
  }, [pairedMetrics, bedDetails, mortalityReports, ipdReferrals, doctors])

  return (
    <>
      {pages.map((page, idx) => (
        <React.Fragment key={idx}>{page}</React.Fragment>
      ))}
    </>
  )
}

// =================== Page Layout with Letterhead ===================

interface DPRPageLayoutProps {
  children: React.ReactNode
  topOffset: number
  bottomOffset: number
}

function DPRPageLayout({ children, topOffset, bottomOffset }: DPRPageLayoutProps) {
  return (
    <div
      style={{
        width: "595px",
        height: "842px",
        backgroundImage: "url(/letterhead.png)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: `${topOffset}px`,
          left: "24px",
          right: "24px",
          bottom: `${bottomOffset}px`,
          overflow: "hidden",
          padding: "16px",
          backgroundColor: "rgba(255, 255, 255, 0.95)",
          borderRadius: "8px",
          boxShadow: "0 4px 6px rgba(0, 0, 0, 0.05)",
        }}
      >
        {children}
      </div>
    </div>
  )
}
