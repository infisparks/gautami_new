"use client"

import type React from "react"
import { useEffect, useState, useMemo, useCallback } from "react"
import { db } from "@/lib/firebase"
import { ref, onValue, type DataSnapshot } from "firebase/database"
import { format, parseISO } from "date-fns"
import { Bar } from "react-chartjs-2"
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js"
import { ToastContainer } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import debounce from "lodash/debounce"
import ProtectedRoute from "@/components/ProtectedRoute"
import { Dialog } from "@headlessui/react"
import {
  Search,
  Calendar,
  User,
  FileText,
  Activity,
  X,
  Filter,
  RefreshCw,
  DollarSign,
  Layers,
  Clipboard,
  ChevronDown,
  ChevronUp,
  Stethoscope,
  Scissors,
} from "lucide-react"

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

// ----- Type Definitions -----

// Doctor Interface
interface Doctor {
  name: string
  amount?: number
  department?: string
  specialist?: string
}

// OPD Appointment Data Structure
interface OPDData {
  amount?: number
  createdAt?: string
  date?: string
  time?: string
  doctor?: string
  serviceName?: string
  paymentMethod?: string
}

// IPD Appointment Data Structure
interface IPDData {
  admissionType?: string
  age?: number | string
  bloodGroup?: string
  date?: string
  time?: string
  doctor?: string
  dateOfBirth?: string
  dischargeDate?: string
  emergencyMobileNumber?: string
  gender?: string
  membershipType?: string
  paymentMode?: string
  paymentType?: string
  referralDoctor?: string
  roomType?: string
  amount?: number
  payments?: Record<string, { amount: number; paymentType: string; date?: string }>
  services?: IPDService[]
  address?: string
}

// IPD Service Structure
interface IPDService {
  amount: number
  createdAt: string
  serviceName: string
  // "status" may be undefined in your data so we'll check it safely
  status?: string
}

// Pathology Appointment Data Structure
interface PathologyData {
  amount?: number
  bloodTestName?: string
  timestamp?: number
  createdAt?: number | string
  paymentMethod?: string
  paymentId?: string
  referBy?: string
}

// Surgery Appointment Data Structure
interface SurgeryData {
  finalDiagnosis?: string
  surgeryDate?: string
  surgeryTitle?: string
  timestamp?: number
  updatedAt?: number
}

// OT (Operating Theater) Data Structure
interface OTData {
  createdAt?: number
  date?: string
  time?: string
  message?: string
  ipdId?: string
}

// Patient Record stored under "patients"
interface PatientRecord {
  uhid: string
  name: string
  phone: string
  age?: number
  address: string
  gender: string
  createdAt: number | string
  opd?: Record<string, OPDData>
  ipd?: Record<string, IPDData>
  pathology?: Record<string, PathologyData>
  surgery?: Record<string, SurgeryData>
  ot?: OTData
}

// Base Appointment for unified view
interface BaseAppointment {
  id: string
  name: string
  phone: string
  date: string // ISO string
  time: string
  doctor: string // resolved doctor name (or N/A)
  appointmentType: "OPD" | "IPD" | "Pathology" | "Surgery" | "OT"
}

// Extended types
interface OPDAppointment extends BaseAppointment {
  appointmentType: "OPD"
  amount: number
  serviceName?: string
  paymentMethod?: string
}

interface IPDAppointment extends BaseAppointment {
  appointmentType: "IPD"
  admissionType: string
  age: number
  bloodGroup: string
  dateOfBirth: string
  dischargeDate: string
  emergencyMobileNumber: string
  gender: string
  membershipType: string
  paymentMode: string
  paymentType: string
  referralDoctor: string
  roomType: string
  amount: number
  payments?: Record<string, { amount: number; paymentType: string; date?: string }>
  services: IPDService[]
}

interface PathologyAppointment extends BaseAppointment {
  appointmentType: "Pathology"
  bloodTestName: string
  amount: number
  age: number
  paymentMethod?: string
  paymentId?: string
  referBy?: string
}

interface SurgeryAppointment extends BaseAppointment {
  appointmentType: "Surgery"
  surgeryTitle: string
  finalDiagnosis: string
}

interface OTAppointment extends BaseAppointment {
  appointmentType: "OT"
  message: string
  ipdId: string
}

type Appointment = OPDAppointment | IPDAppointment | PathologyAppointment | SurgeryAppointment | OTAppointment

// ----- Helper Functions -----

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount)
}

const getDoctorName = (doctorId?: string, doctors?: { [key: string]: Doctor }): string => {
  if (!doctorId || !doctors) return "Unknown"
  return doctors[doctorId]?.name || "Unknown"
}

// Get the paid amount for an appointment
const getPaidAmount = (appointment: Appointment): number => {
  if (appointment.appointmentType === "IPD") {
    const ipdApp = appointment as IPDAppointment
    if (ipdApp.payments) {
      return Object.values(ipdApp.payments).reduce((sum, p) => sum + Number(p.amount), 0)
    }
    return ipdApp.amount || 0
  }
  if (appointment.appointmentType === "OPD" || appointment.appointmentType === "Pathology") {
    return appointment.amount || 0
  }
  return 0
}

// Calculate total amounts and counts
const calculateTotals = (apps: Appointment[]) => {
  let totalOpdCount = 0,
    totalOpdAmount = 0
  let totalIpdCount = 0,
    totalIpdAmount = 0
  let totalPathologyCount = 0,
    totalPathologyAmount = 0
  let totalSurgeryCount = 0
  let totalOTCount = 0

  // Payment method breakdowns
  let opdCash = 0,
    opdOnline = 0,
    opdCard = 0,
    opdUpi = 0
  let ipdCash = 0,
    ipdOnline = 0,
    ipdCard = 0,
    ipdUpi = 0
  let pathCash = 0,
    pathOnline = 0,
    pathCard = 0,
    pathUpi = 0

  apps.forEach((appointment) => {
    if (appointment.appointmentType === "OPD") {
      const opdApp = appointment as OPDAppointment
      totalOpdCount++
      totalOpdAmount += opdApp.amount || 0

      // OPD payment method breakdown
      const paymentMethod = opdApp.paymentMethod?.toLowerCase() || "cash"
      if (paymentMethod === "cash") {
        opdCash += opdApp.amount || 0
      } else if (paymentMethod === "online") {
        opdOnline += opdApp.amount || 0
      } else if (paymentMethod === "card") {
        opdCard += opdApp.amount || 0
      } else if (paymentMethod === "upi") {
        opdUpi += opdApp.amount || 0
      }
    } else if (appointment.appointmentType === "IPD") {
      totalIpdCount++
      const ipdApp = appointment as IPDAppointment
      const amount = getPaidAmount(ipdApp)
      totalIpdAmount += amount

      // IPD payment method breakdown
      if (ipdApp.payments) {
        Object.values(ipdApp.payments).forEach((p) => {
          const paymentType = p.paymentType.toLowerCase()
          if (paymentType === "cash") {
            ipdCash += Number(p.amount)
          } else if (paymentType === "online") {
            ipdOnline += Number(p.amount)
          } else if (paymentType === "card") {
            ipdCard += Number(p.amount)
          } else if (paymentType === "upi") {
            ipdUpi += Number(p.amount)
          }
        })
      }
    } else if (appointment.appointmentType === "Pathology") {
      const pathApp = appointment as PathologyAppointment
      totalPathologyCount++
      totalPathologyAmount += pathApp.amount || 0

      // Pathology payment method breakdown
      const paymentMethod = pathApp.paymentMethod?.toLowerCase() || "cash"
      if (paymentMethod === "cash") {
        pathCash += pathApp.amount || 0
      } else if (paymentMethod === "online") {
        pathOnline += pathApp.amount || 0
      } else if (paymentMethod === "card") {
        pathCard += pathApp.amount || 0
      } else if (paymentMethod === "upi") {
        pathUpi += pathApp.amount || 0
      }
    } else if (appointment.appointmentType === "Surgery") {
      totalSurgeryCount++
    } else if (appointment.appointmentType === "OT") {
      totalOTCount++
    }
  })

  // Calculate totals for all payment methods
  const totalCash = opdCash + ipdCash + pathCash
  const totalOnline = opdOnline + ipdOnline + pathOnline
  const totalCard = opdCard + ipdCard + pathCard
  const totalUpi = opdUpi + ipdUpi + pathUpi

  return {
    totalOpdCount,
    totalOpdAmount,
    totalIpdCount,
    totalIpdAmount,
    totalPathologyCount,
    totalPathologyAmount,
    totalSurgeryCount,
    totalOTCount,
    opdCash,
    opdOnline,
    opdCard,
    opdUpi,
    ipdCash,
    ipdOnline,
    ipdCard,
    ipdUpi,
    pathCash,
    pathOnline,
    pathCard,
    pathUpi,
    totalCash,
    totalOnline,
    totalCard,
    totalUpi,
  }
}

// ----- Dashboard Component -----

const DashboardPage: React.FC = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [filteredAppointments, setFilteredAppointments] = useState<Appointment[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>("All")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [isTodayFilter, setIsTodayFilter] = useState<boolean>(false)
  const [selectedDate, setSelectedDate] = useState<string>("")
  const [monthsDataOPD, setMonthsDataOPD] = useState<{ [key: string]: number }>({})
  const [monthsDataIPD, setMonthsDataIPD] = useState<{ [key: string]: number }>({})
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [sortConfig, setSortConfig] = useState<{ column: string; direction: "asc" | "desc" }>({
    column: "date",
    direction: "desc",
  })

  // Totals for amounts
  const [totalAmountIPD, setTotalAmountIPD] = useState<number>(0)
  const [totalAmountOPD, setTotalAmountOPD] = useState<number>(0)
  const [totalAmountPathology, setTotalAmountPathology] = useState<number>(0)

  // Counts
  const [opdCount, setOpdCount] = useState<number>(0)
  const [ipdCount, setIpdCount] = useState<number>(0)
  const [pathologyCount, setPathologyCount] = useState<number>(0)
  const [surgeryCount, setSurgeryCount] = useState<number>(0)
  const [otCount, setOTCount] = useState<number>(0)

  // Payment breakdowns
  const [opdCash, setOpdCash] = useState<number>(0)
  const [opdOnline, setOpdOnline] = useState<number>(0)
  const [opdCard, setOpdCard] = useState<number>(0)
  const [opdUpi, setOpdUpi] = useState<number>(0)

  const [ipdCash, setIpdCash] = useState<number>(0)
  const [ipdOnline, setIpdOnline] = useState<number>(0)
  const [ipdCard, setIpdCard] = useState<number>(0)
  const [ipdUpi, setIpdUpi] = useState<number>(0)

  const [pathCash, setPathCash] = useState<number>(0)
  const [pathOnline, setPathOnline] = useState<number>(0)
  const [pathCard, setPathCard] = useState<number>(0)
  const [pathUpi, setPathUpi] = useState<number>(0)

  const [totalCash, setTotalCash] = useState<number>(0)
  const [totalOnline, setTotalOnline] = useState<number>(0)
  const [totalCard, setTotalCard] = useState<number>(0)
  const [totalUpi, setTotalUpi] = useState<number>(0)

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)

  // Doctors data
  const [doctors, setDoctors] = useState<{ [key: string]: Doctor }>({})

  // Fetch doctors
  useEffect(() => {
    const doctorsRef = ref(db, "doctors")
    const unsubscribeDoctors = onValue(doctorsRef, (snapshot: DataSnapshot) => {
      const data = snapshot.val() as Record<string, Doctor | undefined>
      const doctorsData: { [key: string]: Doctor } = data
        ? Object.entries(data).reduce(
            (acc, [id, value]) => {
              if (value) {
                acc[id] = value
              }
              return acc
            },
            {} as { [key: string]: Doctor },
          )
        : {}
      setDoctors(doctorsData)
    })
    return () => {
      unsubscribeDoctors()
    }
  }, [])

  // Fetch all appointments
  useEffect(() => {
    setIsLoading(true)
    const patientsRef = ref(db, "patients")
    const unsubscribePatients = onValue(patientsRef, (snapshot) => {
      const data = snapshot.val()
      const allAppointments: Appointment[] = []
      if (data) {
        Object.entries(data).forEach(([uhid, patientData]: [string, any]) => {
          const patient: PatientRecord = { uhid, ...patientData }

          // OPD Appointments
          if (patient.opd) {
            Object.entries(patient.opd).forEach(([id, opdEntry]) => {
              const appointment: OPDAppointment = {
                id: `${uhid}_opd_${id}`,
                name: patient.name,
                phone: patient.phone,
                date: opdEntry.date || "",
                time: opdEntry.time || "-",
                doctor: getDoctorName(opdEntry.doctor, doctors),
                appointmentType: "OPD",
                amount: Number(opdEntry.amount) || 0,
                serviceName: opdEntry.serviceName || "",
                paymentMethod: opdEntry.paymentMethod || "cash",
              }
              allAppointments.push(appointment)
            })
          }
          // IPD Appointments
          if (patient.ipd) {
            Object.entries(patient.ipd).forEach(([id, ipdEntry]) => {
              const appointment: IPDAppointment = {
                id: `${uhid}_ipd_${id}`,
                name: patient.name,
                phone: patient.phone,
                date: ipdEntry.date || "",
                time: ipdEntry.time || "-",
                doctor: getDoctorName(ipdEntry.doctor, doctors),
                appointmentType: "IPD",
                admissionType: ipdEntry.admissionType || "",
                age: Number(ipdEntry.age) || 0,
                bloodGroup: ipdEntry.bloodGroup || "",
                dateOfBirth: ipdEntry.dateOfBirth || "",
                dischargeDate: ipdEntry.dischargeDate || "",
                emergencyMobileNumber: ipdEntry.emergencyMobileNumber || "",
                gender: ipdEntry.gender || "",
                membershipType: ipdEntry.membershipType || "",
                paymentMode: ipdEntry.paymentMode || "",
                paymentType: ipdEntry.paymentType || "",
                referralDoctor: ipdEntry.referralDoctor || "",
                roomType: ipdEntry.roomType || "",
                amount: Number(ipdEntry.amount) || 0,
                payments: ipdEntry.payments || {},
                services: Array.isArray(ipdEntry.services) ? ipdEntry.services : [],
              }
              allAppointments.push(appointment)
            })
          }
          // Pathology Appointments
          if (patient.pathology) {
            Object.entries(patient.pathology).forEach(([id, pathologyEntry]) => {
              // Convert timestamp to ISO string if available
              let dateStr = new Date().toISOString()
              if (pathologyEntry.timestamp) {
                dateStr = new Date(pathologyEntry.timestamp).toISOString()
              } else if (pathologyEntry.createdAt) {
                dateStr =
                  typeof pathologyEntry.createdAt === "number"
                    ? new Date(pathologyEntry.createdAt).toISOString()
                    : new Date(pathologyEntry.createdAt).toISOString()
              }

              const appointment: PathologyAppointment = {
                id: `${uhid}_path_${id}`,
                name: patient.name,
                phone: patient.phone,
                date: dateStr,
                time: "",
                doctor: pathologyEntry.referBy || "N/A",
                appointmentType: "Pathology",
                bloodTestName: pathologyEntry.bloodTestName || "",
                amount: Number(pathologyEntry.amount) || 0,
                age: Number(patient.age) || 0,
                paymentMethod: pathologyEntry.paymentMethod || "cash",
                paymentId: pathologyEntry.paymentId || "",
                referBy: pathologyEntry.referBy || "",
              }
              allAppointments.push(appointment)
            })
          }
          // Surgery Appointments
          if (patient.surgery) {
            // Handle if surgery is an object with properties rather than a collection
            if (patient.surgery.surgeryTitle) {
              const surgeryEntry = patient.surgery
              const dateStr = surgeryEntry.surgeryDate
                ? new Date(surgeryEntry.surgeryDate as string).toISOString()
                : surgeryEntry.updatedAt
                  ? new Date(surgeryEntry.updatedAt as string).toISOString()
                  : new Date().toISOString()

              const appointment: SurgeryAppointment = {
                id: `${uhid}_surg_single`,
                name: patient.name,
                phone: patient.phone,
                date: dateStr,
                time: "",
                doctor: "N/A",
                appointmentType: "Surgery",
                surgeryTitle: String(surgeryEntry.surgeryTitle || ""),
                finalDiagnosis: String(surgeryEntry.finalDiagnosis || ""),
              }
              allAppointments.push(appointment)
            } else {
              // Handle if surgery is a collection
              Object.entries(patient.surgery).forEach(([id, surgeryEntry]) => {
                const dateStr = surgeryEntry.surgeryDate
                  ? surgeryEntry.surgeryDate
                  : surgeryEntry.updatedAt
                    ? new Date(surgeryEntry.updatedAt).toISOString()
                    : new Date().toISOString()

                const appointment: SurgeryAppointment = {
                  id: `${uhid}_surg_${id}`,
                  name: patient.name,
                  phone: patient.phone,
                  date: dateStr,
                  time: "",
                  doctor: "N/A",
                  appointmentType: "Surgery",
                  surgeryTitle: surgeryEntry.surgeryTitle || "",
                  finalDiagnosis: surgeryEntry.finalDiagnosis || "",
                }
                allAppointments.push(appointment)
              })
            }
          }
          // OT (Operating Theater) Appointments
          if (patient.ot) {
            // Handle if ot is an object with properties rather than a collection
            if (patient.ot.date) {
              const otEntry = patient.ot
              const dateStr = otEntry.date
                ? `${otEntry.date}T${otEntry.time || "00:00"}:00.000Z`
                : otEntry.createdAt
                  ? new Date(otEntry.createdAt).toISOString()
                  : new Date().toISOString()

              const appointment: OTAppointment = {
                id: `${uhid}_ot_single`,
                name: patient.name,
                phone: patient.phone,
                date: dateStr,
                time: otEntry.time || "",
                doctor: "N/A",
                appointmentType: "OT",
                message: otEntry.message || "",
                ipdId: otEntry.ipdId || "",
              }
              allAppointments.push(appointment)
            } else {
              // Handle if ot is a collection
              Object.entries(patient.ot).forEach(([id, otEntry]) => {
                const dateStr = otEntry.date
                  ? `${otEntry.date}T${otEntry.time || "00:00"}:00.000Z`
                  : otEntry.createdAt
                    ? new Date(otEntry.createdAt).toISOString()
                    : new Date().toISOString()

                const appointment: OTAppointment = {
                  id: `${uhid}_ot_${id}`,
                  name: patient.name,
                  phone: patient.phone,
                  date: dateStr,
                  time: otEntry.time || "",
                  doctor: "N/A",
                  appointmentType: "OT",
                  message: otEntry.message || "",
                  ipdId: otEntry.ipdId || "",
                }
                allAppointments.push(appointment)
              })
            }
          }
        })
      }
      setAppointments(allAppointments)
      setFilteredAppointments(allAppointments)
      generateMonthsData(allAppointments)
      const totals = calculateTotals(allAppointments)

      // Set all the state values from totals
      setTotalAmountIPD(totals.totalIpdAmount)
      setTotalAmountOPD(totals.totalOpdAmount)
      setTotalAmountPathology(totals.totalPathologyAmount)

      setOpdCount(totals.totalOpdCount)
      setIpdCount(totals.totalIpdCount)
      setPathologyCount(totals.totalPathologyCount)
      setSurgeryCount(totals.totalSurgeryCount)
      setOTCount(totals.totalOTCount)

      setOpdCash(totals.opdCash)
      setOpdOnline(totals.opdOnline)
      setOpdCard(totals.opdCard)
      setOpdUpi(totals.opdUpi)

      setIpdCash(totals.ipdCash)
      setIpdOnline(totals.ipdOnline)
      setIpdCard(totals.ipdCard)
      setIpdUpi(totals.ipdUpi)

      setPathCash(totals.pathCash)
      setPathOnline(totals.pathOnline)
      setPathCard(totals.pathCard)
      setPathUpi(totals.pathUpi)

      setTotalCash(totals.totalCash)
      setTotalOnline(totals.totalOnline)
      setTotalCard(totals.totalCard)
      setTotalUpi(totals.totalUpi)

      setIsLoading(false)
    })
    return () => {
      unsubscribePatients()
    }
  }, [doctors])

  // Generate monthly data for charts
  const generateMonthsData = (apps: Appointment[]) => {
    const dataOPD: { [key: string]: number } = {}
    const dataIPD: { [key: string]: number } = {}
    apps.forEach((appointment) => {
      if (!appointment.date) return
      try {
        const parsedDate = new Date(appointment.date)
        const month = format(parsedDate, "MMMM")
        if (appointment.appointmentType === "OPD") {
          dataOPD[month] = (dataOPD[month] || 0) + 1
        } else if (appointment.appointmentType === "IPD") {
          dataIPD[month] = (dataIPD[month] || 0) + 1
        }
      } catch (error) {
        console.error("Error parsing date:", appointment.date)
      }
    })
    setMonthsDataOPD(dataOPD)
    setMonthsDataIPD(dataIPD)
  }

  // Safely format date to prevent parseISO errors
  const safeFormatDate = (dateStr: string, formatStr: string): string => {
    try {
      // Check if the date is already a valid date string
      const date = new Date(dateStr)
      if (!isNaN(date.getTime())) {
        return format(date, formatStr)
      }
      // If not, try to parse it with parseISO
      return format(parseISO(dateStr), formatStr)
    } catch (error) {
      console.error("Error formatting date:", dateStr)
      return "Invalid Date"
    }
  }

  // Apply filters
  const applyFilters = useCallback(
    (query: string, month: string, today: boolean, date: string) => {
      let temp = [...appointments]
      if (query) {
        const lowerQuery = query.toLowerCase()
        temp = temp.filter((app) => app.name.toLowerCase().includes(lowerQuery) || app.phone.includes(query))
      }
      if (month !== "All") {
        temp = temp.filter((app) => {
          try {
            const appDate = new Date(app.date)
            const appMonth = format(appDate, "MMMM")
            return appMonth === month
          } catch (error) {
            return false
          }
        })
      }
      if (today && date === "") {
        const todayStr = format(new Date(), "yyyy-MM-dd")
        temp = temp.filter((app) => {
          try {
            const appDate = new Date(app.date)
            return format(appDate, "yyyy-MM-dd") === todayStr
          } catch (error) {
            return false
          }
        })
      }
      if (date) {
        temp = temp.filter((app) => {
          try {
            const appDate = new Date(app.date)
            const appointmentDate = format(appDate, "yyyy-MM-dd")

            if (app.appointmentType === "IPD") {
              const ipdApp = app as IPDAppointment
              const paymentDateMatch =
                ipdApp.payments &&
                Object.values(ipdApp.payments).some((p) => {
                  if (!p.date) return false
                  try {
                    const paymentDate = new Date(p.date)
                    return format(paymentDate, "yyyy-MM-dd") === date
                  } catch (error) {
                    return false
                  }
                })
              return appointmentDate === date || paymentDateMatch
            }
            return appointmentDate === date
          } catch (error) {
            return false
          }
        })
      }

      // Apply sorting
      temp = sortData(temp, sortConfig.column, sortConfig.direction)

      setFilteredAppointments(temp)
      generateMonthsData(temp)
      const totals = calculateTotals(temp)

      // Update all state values from totals
      setTotalAmountIPD(totals.totalIpdAmount)
      setTotalAmountOPD(totals.totalOpdAmount)
      setTotalAmountPathology(totals.totalPathologyAmount)

      setOpdCount(totals.totalOpdCount)
      setIpdCount(totals.totalIpdCount)
      setPathologyCount(totals.totalPathologyCount)
      setSurgeryCount(totals.totalSurgeryCount)
      setOTCount(totals.totalOTCount)

      setOpdCash(totals.opdCash)
      setOpdOnline(totals.opdOnline)
      setOpdCard(totals.opdCard)
      setOpdUpi(totals.opdUpi)

      setIpdCash(totals.ipdCash)
      setIpdOnline(totals.ipdOnline)
      setIpdCard(totals.ipdCard)
      setIpdUpi(totals.ipdUpi)

      setPathCash(totals.pathCash)
      setPathOnline(totals.pathOnline)
      setPathCard(totals.pathCard)
      setPathUpi(totals.pathUpi)

      setTotalCash(totals.totalCash)
      setTotalOnline(totals.totalOnline)
      setTotalCard(totals.totalCard)
      setTotalUpi(totals.totalUpi)
    },
    [appointments, sortConfig],
  )

  // Sort data
  const sortData = (data: Appointment[], column: string, direction: "asc" | "desc") => {
    return [...data].sort((a, b) => {
      let aValue, bValue

      switch (column) {
        case "name":
          aValue = a.name.toLowerCase()
          bValue = b.name.toLowerCase()
          break
        case "date":
          aValue = new Date(a.date).getTime()
          bValue = new Date(b.date).getTime()
          break
        case "type":
          aValue = a.appointmentType
          bValue = b.appointmentType
          break
        case "amount":
          aValue = getPaidAmount(a)
          bValue = getPaidAmount(b)
          break
        default:
          return 0
      }

      if (aValue < bValue) return direction === "asc" ? -1 : 1
      if (aValue > bValue) return direction === "asc" ? 1 : -1
      return 0
    })
  }

  // Handle sorting
  const handleSort = (column: string) => {
    let direction: "asc" | "desc" = "asc"
    if (sortConfig.column === column) {
      direction = sortConfig.direction === "asc" ? "desc" : "asc"
    }
    setSortConfig({ column, direction })

    const sorted = sortData(filteredAppointments, column, direction)
    setFilteredAppointments(sorted)
  }

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value
      setSearchQuery(q)
      applyFilters(q, selectedMonth, isTodayFilter, selectedDate)
    },
    [selectedMonth, isTodayFilter, selectedDate, applyFilters],
  )

  const debouncedSearch = useMemo(() => debounce(handleSearchChange, 300), [handleSearchChange])

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const month = e.target.value
    setSelectedMonth(month)
    setIsTodayFilter(false)
    setSelectedDate("")
    applyFilters(searchQuery, month, false, "")
  }

  const handleTodayFilter = () => {
    setIsTodayFilter(true)
    setSelectedMonth("All")
    setSelectedDate("")
    applyFilters(searchQuery, "All", true, "")
  }

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = e.target.value
    setSelectedDate(d)
    setIsTodayFilter(false)
    setSelectedMonth("All")
    applyFilters(searchQuery, "All", false, d)
  }

  const resetFilters = () => {
    setIsTodayFilter(false)
    setSelectedMonth("All")
    setSelectedDate("")
    setSearchQuery("")
    setFilteredAppointments(sortData(appointments, sortConfig.column, sortConfig.direction))
    generateMonthsData(appointments)
    const totals = calculateTotals(appointments)

    // Reset all state values from totals
    setTotalAmountIPD(totals.totalIpdAmount)
    setTotalAmountOPD(totals.totalOpdAmount)
    setTotalAmountPathology(totals.totalPathologyAmount)

    setOpdCount(totals.totalOpdCount)
    setIpdCount(totals.totalIpdCount)
    setPathologyCount(totals.totalPathologyCount)
    setSurgeryCount(totals.totalSurgeryCount)
    setOTCount(totals.totalOTCount)

    setOpdCash(totals.opdCash)
    setOpdOnline(totals.opdOnline)
    setOpdCard(totals.opdCard)
    setOpdUpi(totals.opdUpi)

    setIpdCash(totals.ipdCash)
    setIpdOnline(totals.ipdOnline)
    setIpdCard(totals.ipdCard)
    setIpdUpi(totals.ipdUpi)

    setPathCash(totals.pathCash)
    setPathOnline(totals.pathOnline)
    setPathCard(totals.pathCard)
    setPathUpi(totals.pathUpi)

    setTotalCash(totals.totalCash)
    setTotalOnline(totals.totalOnline)
    setTotalCard(totals.totalCard)
    setTotalUpi(totals.totalUpi)
  }

  // For "today" appointments display
  const todayStr = format(new Date(), "yyyy-MM-dd")
  const todayAppointments = useMemo(() => {
    return appointments.filter((app) => {
      try {
        const appDate = new Date(app.date)
        return format(appDate, "yyyy-MM-dd") === todayStr
      } catch (error) {
        return false
      }
    })
  }, [appointments, todayStr])

  // Chart data for OPD and IPD
  const chartDataOPD = {
    labels: Object.keys(monthsDataOPD),
    datasets: [
      {
        label: "OPD Appointments",
        data: Object.values(monthsDataOPD),
        backgroundColor: "rgba(56, 189, 248, 0.6)",
        borderColor: "rgba(56, 189, 248, 1)",
        borderWidth: 1,
      },
    ],
  }

  const chartDataIPD = {
    labels: Object.keys(monthsDataIPD),
    datasets: [
      {
        label: "IPD Appointments",
        data: Object.values(monthsDataIPD),
        backgroundColor: "rgba(251, 146, 60, 0.6)",
        borderColor: "rgba(251, 146, 60, 1)",
        borderWidth: 1,
      },
    ],
  }

  // Modal handlers
  const openModal = (appointment: Appointment) => {
    setSelectedAppointment(appointment)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setSelectedAppointment(null)
    setIsModalOpen(false)
  }

  // Get badge color based on appointment type
  const getBadgeColor = (type: string) => {
    switch (type) {
      case "OPD":
        return "bg-sky-100 text-sky-800"
      case "IPD":
        return "bg-orange-100 text-orange-800"
      case "Pathology":
        return "bg-emerald-100 text-emerald-800"
      case "Surgery":
        return "bg-purple-100 text-purple-800"
      case "OT":
        return "bg-pink-100 text-pink-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  return (
    <>
      <ToastContainer />

      <main className="min-h-screen bg-gray-50">
        <div className="max-w-[1600px] mx-auto">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
            <div className="px-6 py-4 flex flex-col md:flex-row justify-between items-center">
              <h1 className="text-2xl font-bold text-sky-600 mb-4 md:mb-0">G Medford NX</h1>

              {/* Search Bar */}
              <div className="relative w-full md:w-1/3">
                <Search className="absolute top-3 left-3 text-gray-400 h-5 w-5" />
                <input
                  type="text"
                  placeholder="Search by name or phone"
                  onChange={debouncedSearch}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 transition duration-200"
                />
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="p-6">
            {/* Filter Controls */}
            <div className="bg-white rounded-xl shadow-sm mb-6 p-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center mb-4 md:mb-0">
                  <Filter className="mr-2 h-5 w-5 text-sky-500" />
                  Filters
                </h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={resetFilters}
                    className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-sky-500 transition flex items-center"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Reset
                  </button>
                  <button
                    onClick={handleTodayFilter}
                    className={`px-4 py-2 rounded-lg border ${
                      isTodayFilter
                        ? "bg-sky-600 text-white border-sky-600"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    } focus:outline-none focus:ring-2 focus:ring-sky-500 transition flex items-center`}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    Today
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">
                    Filter by Date
                  </label>
                  <input
                    type="date"
                    id="date"
                    value={selectedDate}
                    onChange={handleDateChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label htmlFor="month" className="block text-sm font-medium text-gray-700 mb-1">
                    Filter by Month
                  </label>
                  <select
                    id="month"
                    value={selectedMonth}
                    onChange={handleFilterChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="All">All Months</option>
                    {Array.from({ length: 12 }, (_, i) => format(new Date(0, i), "MMMM")).map((month) => (
                      <option key={month} value={month}>
                        {month}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current Filters</label>
                  <div className="px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm">
                    {isTodayFilter ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-800 mr-2">
                        Today
                      </span>
                    ) : null}
                    {selectedDate ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-800 mr-2">
                        Date: {selectedDate}
                      </span>
                    ) : null}
                    {selectedMonth !== "All" ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-800 mr-2">
                        Month: {selectedMonth}
                      </span>
                    ) : null}
                    {!isTodayFilter && selectedMonth === "All" && !selectedDate ? (
                      <span className="text-gray-500">No filters applied</span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {/* Dashboard Statistics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              {/* All Appointments */}
              <div className="bg-white shadow-sm rounded-xl p-6 flex items-center border border-gray-100">
                <div className="p-3 bg-sky-100 rounded-full mr-4">
                  <User className="text-sky-600 h-6 w-6" />
                </div>
                <div>
                  <p className="text-gray-500 text-sm">All Appointments</p>
                  <p className="text-2xl font-bold text-gray-900">{appointments.length}</p>
                </div>
              </div>

              {/* Today's Appointments */}
              <div className="bg-white shadow-sm rounded-xl p-6 flex items-center border border-gray-100">
                <div className="p-3 bg-orange-100 rounded-full mr-4">
                  <Calendar className="text-orange-600 h-6 w-6" />
                </div>
                <div>
                  <p className="text-gray-500 text-sm">Today Appointments</p>
                  <p className="text-2xl font-bold text-gray-900">{todayAppointments.length}</p>
                </div>
              </div>

              {/* Filtered Appointments */}
              <div className="bg-white shadow-sm rounded-xl p-6 flex items-center border border-gray-100">
                <div className="p-3 bg-emerald-100 rounded-full mr-4">
                  <FileText className="text-emerald-600 h-6 w-6" />
                </div>
                <div>
                  <p className="text-gray-500 text-sm">Filtered Results</p>
                  <p className="text-2xl font-bold text-gray-900">{filteredAppointments.length}</p>
                </div>
              </div>

              {/* Total Revenue */}
              <div className="bg-white shadow-sm rounded-xl p-6 flex items-center border border-gray-100">
                <div className="p-3 bg-purple-100 rounded-full mr-4">
                  <DollarSign className="text-purple-600 h-6 w-6" />
                </div>
                <div>
                  <p className="text-gray-500 text-sm">Total Revenue</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(totalAmountOPD + totalAmountIPD + totalAmountPathology)}
                  </p>
                </div>
              </div>
            </div>

            {/* Department Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
              {/* OPD Card */}
              <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-800">OPD Statistics</h2>
                  <div className="p-2 bg-sky-100 rounded-full">
                    <Activity className="text-sky-600 h-5 w-5" />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 text-sm">Total Appointments</span>
                    <span className="font-semibold">{opdCount}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 text-sm">Total Revenue</span>
                    <span className="font-semibold text-sky-600">{formatCurrency(totalAmountOPD)}</span>
                  </div>
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-gray-600 text-sm">Cash Payments</span>
                      <span className="font-semibold">{formatCurrency(opdCash)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 text-sm">Online Payments</span>
                      <span className="font-semibold">{formatCurrency(opdOnline)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* IPD Card */}
              <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-800">IPD Statistics</h2>
                  <div className="p-2 bg-orange-100 rounded-full">
                    <Layers className="text-orange-600 h-5 w-5" />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 text-sm">Total Admissions</span>
                    <span className="font-semibold">{ipdCount}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 text-sm">Total Revenue</span>
                    <span className="font-semibold text-orange-600">{formatCurrency(totalAmountIPD)}</span>
                  </div>
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-gray-600 text-sm">Cash Payments</span>
                      <span className="font-semibold">{formatCurrency(ipdCash)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 text-sm">Online Payments</span>
                      <span className="font-semibold">{formatCurrency(ipdOnline)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pathology Card */}
              <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-800">Pathology Statistics</h2>
                  <div className="p-2 bg-emerald-100 rounded-full">
                    <Clipboard className="text-emerald-600 h-5 w-5" />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 text-sm">Total Tests</span>
                    <span className="font-semibold">{pathologyCount}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 text-sm">Total Revenue</span>
                    <span className="font-semibold text-emerald-600">{formatCurrency(totalAmountPathology)}</span>
                  </div>
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-gray-600 text-sm">Cash Payments</span>
                      <span className="font-semibold">{formatCurrency(pathCash)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 text-sm">Online Payments</span>
                      <span className="font-semibold">{formatCurrency(pathOnline)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Surgery & OT Card */}
              <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-800">Surgery & OT</h2>
                  <div className="p-2 bg-purple-100 rounded-full">
                    <Scissors className="text-purple-600 h-5 w-5" />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 text-sm">Total Surgeries</span>
                    <span className="font-semibold">{surgeryCount}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 text-sm">Total OT Procedures</span>
                    <span className="font-semibold">{otCount}</span>
                  </div>
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 text-sm">Combined Total</span>
                      <span className="font-semibold text-purple-600">{surgeryCount + otCount}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Appointments Table */}
            <div className="bg-white shadow-sm rounded-xl overflow-hidden mb-6 border border-gray-100">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-800">Appointment Records</h2>
              </div>

              {isLoading ? (
                <div className="flex justify-center items-center p-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sky-500"></div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                          onClick={() => handleSort("name")}
                        >
                          <div className="flex items-center">
                            Name
                            {sortConfig.column === "name" &&
                              (sortConfig.direction === "asc" ? (
                                <ChevronUp className="ml-1 h-4 w-4" />
                              ) : (
                                <ChevronDown className="ml-1 h-4 w-4" />
                              ))}
                          </div>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Phone
                        </th>
                        <th
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                          onClick={() => handleSort("date")}
                        >
                          <div className="flex items-center">
                            Date
                            {sortConfig.column === "date" &&
                              (sortConfig.direction === "asc" ? (
                                <ChevronUp className="ml-1 h-4 w-4" />
                              ) : (
                                <ChevronDown className="ml-1 h-4 w-4" />
                              ))}
                          </div>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Time
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Doctor
                        </th>
                        <th
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                          onClick={() => handleSort("type")}
                        >
                          <div className="flex items-center">
                            Type
                            {sortConfig.column === "type" &&
                              (sortConfig.direction === "asc" ? (
                                <ChevronUp className="ml-1 h-4 w-4" />
                              ) : (
                                <ChevronDown className="ml-1 h-4 w-4" />
                              ))}
                          </div>
                        </th>
                        <th
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                          onClick={() => handleSort("amount")}
                        >
                          <div className="flex items-center">
                            Amount
                            {sortConfig.column === "amount" &&
                              (sortConfig.direction === "asc" ? (
                                <ChevronUp className="ml-1 h-4 w-4" />
                              ) : (
                                <ChevronDown className="ml-1 h-4 w-4" />
                              ))}
                          </div>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredAppointments.length > 0 ? (
                        filteredAppointments.map((appointment) => (
                          <tr key={appointment.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">{appointment.name}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-500">{appointment.phone}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-500">
                                {safeFormatDate(appointment.date, "dd MMM yyyy")}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-500">{appointment.time || "-"}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-500">{appointment.doctor}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`px-2.5 py-1 rounded-full text-xs font-medium ${getBadgeColor(appointment.appointmentType)}`}
                              >
                                {appointment.appointmentType}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">
                                {formatCurrency(getPaidAmount(appointment))}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <button
                                onClick={() => openModal(appointment)}
                                className="text-sky-600 hover:text-sky-900 font-medium"
                              >
                                View Details
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={8} className="px-6 py-8 whitespace-nowrap text-sm text-gray-500 text-center">
                            No appointments found matching your criteria.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* OPD Appointments Chart */}
              <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-100">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">OPD Appointments by Month</h2>
                {Object.keys(monthsDataOPD).length > 0 ? (
                  <Bar
                    data={chartDataOPD}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: {
                          position: "top",
                        },
                        title: {
                          display: false,
                        },
                      },
                    }}
                  />
                ) : (
                  <div className="flex justify-center items-center h-64 bg-gray-50 rounded-lg">
                    <p className="text-gray-500">No OPD data available to display the chart.</p>
                  </div>
                )}
              </div>

              {/* IPD Appointments Chart */}
              <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-100">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">IPD Appointments by Month</h2>
                {Object.keys(monthsDataIPD).length > 0 ? (
                  <Bar
                    data={chartDataIPD}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: {
                          position: "top",
                        },
                        title: {
                          display: false,
                        },
                      },
                    }}
                  />
                ) : (
                  <div className="flex justify-center items-center h-64 bg-gray-50 rounded-lg">
                    <p className="text-gray-500">No IPD data available to display the chart.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Appointment Details Modal */}
        <Dialog open={isModalOpen} onClose={closeModal} className="fixed z-10 inset-0 overflow-y-auto">
          {isModalOpen && selectedAppointment && (
            <div className="flex items-center justify-center min-h-screen px-4">
              <div className="fixed inset-0 bg-black bg-opacity-40 transition-opacity" aria-hidden="true"></div>
              <Dialog.Panel className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 transform transition-all max-h-screen overflow-y-auto">
                <button
                  onClick={closeModal}
                  className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  <X className="h-5 w-5" />
                </button>

                {selectedAppointment.appointmentType === "IPD" && (
                  <>
                    <Dialog.Title className="text-xl font-bold mb-6 text-gray-800 flex items-center">
                      <div className="p-2 bg-orange-100 rounded-full mr-3">
                        <Layers className="text-orange-600 h-5 w-5" />
                      </div>
                      IPD Appointment Details
                    </Dialog.Title>
                    {(() => {
                      const ipd = selectedAppointment as IPDAppointment
                      return (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                              <div>
                                <p className="text-sm text-gray-500">Patient Name</p>
                                <p className="font-medium">{ipd.name}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Phone</p>
                                <p className="font-medium">{ipd.phone}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Date</p>
                                <p className="font-medium">{safeFormatDate(ipd.date, "dd MMM yyyy")}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Time</p>
                                <p className="font-medium">{ipd.time || "-"}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Doctor</p>
                                <p className="font-medium">{ipd.doctor}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Admission Type</p>
                                <p className="font-medium">{ipd.admissionType}</p>
                              </div>
                            </div>
                            <div className="space-y-3">
                              <div>
                                <p className="text-sm text-gray-500">Age</p>
                                <p className="font-medium">{ipd.age}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Blood Group</p>
                                <p className="font-medium">{ipd.bloodGroup}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Gender</p>
                                <p className="font-medium">{ipd.gender}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Room Type</p>
                                <p className="font-medium">{ipd.roomType}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Discharge Date</p>
                                <p className="font-medium">
                                  {ipd.dischargeDate ? safeFormatDate(ipd.dischargeDate, "dd MMM yyyy") : "-"}
                                </p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Total Amount</p>
                                <p className="font-medium text-orange-600">{formatCurrency(getPaidAmount(ipd))}</p>
                              </div>
                            </div>
                          </div>

                          <div className="mt-6 pt-6 border-t border-gray-100">
                            <h3 className="font-semibold text-gray-800 mb-3">Payment Details</h3>
                            {ipd.payments && Object.keys(ipd.payments).length > 0 ? (
                              <div className="bg-gray-50 rounded-lg p-4">
                                <div className="space-y-2">
                                  {Object.values(ipd.payments).map((p, index) => (
                                    <div key={index} className="flex justify-between items-center">
                                      <span className="text-sm text-gray-600">
                                        {p.paymentType} {p.date ? `(${safeFormatDate(p.date, "dd MMM yyyy")})` : ""}
                                      </span>
                                      <span className="font-medium">{formatCurrency(p.amount)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500">No payment details available</p>
                            )}
                          </div>

                          {ipd.services && ipd.services.length > 0 && (
                            <div className="mt-6 pt-6 border-t border-gray-100">
                              <h3 className="font-semibold text-gray-800 mb-3">Services</h3>
                              <div className="bg-gray-50 rounded-lg overflow-hidden">
                                <table className="min-w-full divide-y divide-gray-200">
                                  <thead className="bg-gray-100">
                                    <tr>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Service
                                      </th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Amount
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200">
                                    {ipd.services.map((service, index) => (
                                      <tr key={index}>
                                        <td className="px-4 py-2 text-sm text-gray-900">{service.serviceName}</td>
                                        <td className="px-4 py-2 text-sm text-gray-900">
                                          {formatCurrency(service.amount)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </>
                )}

                {selectedAppointment.appointmentType === "OPD" && (
                  <>
                    <Dialog.Title className="text-xl font-bold mb-6 text-gray-800 flex items-center">
                      <div className="p-2 bg-sky-100 rounded-full mr-3">
                        <Activity className="text-sky-600 h-5 w-5" />
                      </div>
                      OPD Appointment Details
                    </Dialog.Title>
                    {(() => {
                      const opd = selectedAppointment as OPDAppointment
                      return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <div>
                              <p className="text-sm text-gray-500">Patient Name</p>
                              <p className="font-medium">{opd.name}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Phone</p>
                              <p className="font-medium">{opd.phone}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Date</p>
                              <p className="font-medium">{safeFormatDate(opd.date, "dd MMM yyyy")}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Time</p>
                              <p className="font-medium">{opd.time || "-"}</p>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <div>
                              <p className="text-sm text-gray-500">Doctor</p>
                              <p className="font-medium">{opd.doctor}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Service</p>
                              <p className="font-medium">{opd.serviceName || "-"}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Payment Method</p>
                              <p className="font-medium">{opd.paymentMethod}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Amount</p>
                              <p className="font-medium text-sky-600">{formatCurrency(opd.amount)}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                  </>
                )}

                {selectedAppointment.appointmentType === "Pathology" && (
                  <>
                    <Dialog.Title className="text-xl font-bold mb-6 text-gray-800 flex items-center">
                      <div className="p-2 bg-emerald-100 rounded-full mr-3">
                        <Clipboard className="text-emerald-600 h-5 w-5" />
                      </div>
                      Pathology Test Details
                    </Dialog.Title>
                    {(() => {
                      const path = selectedAppointment as PathologyAppointment
                      return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <div>
                              <p className="text-sm text-gray-500">Patient Name</p>
                              <p className="font-medium">{path.name}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Phone</p>
                              <p className="font-medium">{path.phone}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Date</p>
                              <p className="font-medium">{safeFormatDate(path.date, "dd MMM yyyy")}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Referred By</p>
                              <p className="font-medium">{path.referBy || "N/A"}</p>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <div>
                              <p className="text-sm text-gray-500">Blood Test</p>
                              <p className="font-medium">{path.bloodTestName}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Age</p>
                              <p className="font-medium">{path.age}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Payment Method</p>
                              <p className="font-medium">{path.paymentMethod || "Cash"}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Amount</p>
                              <p className="font-medium text-emerald-600">{formatCurrency(path.amount)}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                  </>
                )}

                {selectedAppointment.appointmentType === "Surgery" && (
                  <>
                    <Dialog.Title className="text-xl font-bold mb-6 text-gray-800 flex items-center">
                      <div className="p-2 bg-purple-100 rounded-full mr-3">
                        <Scissors className="text-purple-600 h-5 w-5" />
                      </div>
                      Surgery Appointment Details
                    </Dialog.Title>
                    {(() => {
                      const surg = selectedAppointment as SurgeryAppointment
                      return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <div>
                              <p className="text-sm text-gray-500">Patient Name</p>
                              <p className="font-medium">{surg.name}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Phone</p>
                              <p className="font-medium">{surg.phone}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Date</p>
                              <p className="font-medium">{safeFormatDate(surg.date, "dd MMM yyyy")}</p>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <div>
                              <p className="text-sm text-gray-500">Surgery Title</p>
                              <p className="font-medium">{surg.surgeryTitle}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Final Diagnosis</p>
                              <p className="font-medium">{surg.finalDiagnosis}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                  </>
                )}

                {selectedAppointment.appointmentType === "OT" && (
                  <>
                    <Dialog.Title className="text-xl font-bold mb-6 text-gray-800 flex items-center">
                      <div className="p-2 bg-pink-100 rounded-full mr-3">
                        <Stethoscope className="text-pink-600 h-5 w-5" />
                      </div>
                      OT Procedure Details
                    </Dialog.Title>
                    {(() => {
                      const ot = selectedAppointment as OTAppointment
                      return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <div>
                              <p className="text-sm text-gray-500">Patient Name</p>
                              <p className="font-medium">{ot.name}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Phone</p>
                              <p className="font-medium">{ot.phone}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Date</p>
                              <p className="font-medium">{safeFormatDate(ot.date, "dd MMM yyyy")}</p>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <div>
                              <p className="text-sm text-gray-500">Time</p>
                              <p className="font-medium">{ot.time || "-"}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">IPD ID</p>
                              <p className="font-medium">{ot.ipdId || "-"}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Message</p>
                              <p className="font-medium">{ot.message || "-"}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                  </>
                )}
              </Dialog.Panel>
            </div>
          )}
        </Dialog>
      </main>
    </>
  )
}

const DashboardPageWithProtection: React.FC = () => (
  <ProtectedRoute>
    <DashboardPage />
  </ProtectedRoute>
)

export default DashboardPageWithProtection
