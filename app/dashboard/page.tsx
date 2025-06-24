"use client"

import type React from "react"
import { useEffect, useState, useMemo, useCallback } from "react"
import { db } from "@/lib/firebase"
import { ref, get } from "firebase/database"
import { format, differenceInDays, addDays } from "date-fns"
import { Bar } from "react-chartjs-2"
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import ProtectedRoute from "@/components/ProtectedRoute"
import { Dialog } from "@headlessui/react"
import {
  Search,
  Activity,
  X,
  DollarSign,
  Layers,
  Stethoscope,
  Filter,
  RefreshCw,
  CalendarDays,
  Clock,
  User,
  FileText,
  CreditCard,
  UserCheck,
} from "lucide-react"

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

// ----- Type Definitions -----

interface Doctor {
  name: string
  opdCharge?: number
  department?: string
  specialist?: string
}

// Updated OPD interfaces for new structure
interface IModality {
  charges: number
  doctor?: string // This should be the doctor's name as stored in the modality
  specialist?: string
  type: "consultation" | "casualty" | "xray" | "pathology" | "ipd" | "radiology" | "custom" // Added custom
  visitType?: string
  service?: string
}

interface IPayment {
  cashAmount: number
  createdAt: string
  discount: number
  onlineAmount: number
  paymentMethod: string
  totalCharges: number
  totalPaid: number
}

interface OPDAppointment {
  id: string
  patientId: string
  name: string
  phone: string
  date: string
  time: string
  appointmentType: string
  createdAt: string
  enteredBy: string
  message: string
  modalities: IModality[]
  opdType: string
  payment: IPayment
  referredBy: string
  study: string
  visitType: string
}

interface IPDService {
  amount: number
  serviceName: string
  type: string
  doctorName?: string
  createdAt: string
}

interface IPDPayment {
  amount: number
  paymentType: "cash" | "online"
  type: "advance" | "refund"
  date: string
}

interface IPDAppointment {
  id: string
  patientId: string
  uhid: string
  name: string
  phone: string
  admissionDate: string
  admissionTime: string
  doctor: string
  doctorId: string
  roomType: string
  status: string
  services: IPDService[]
  totalAmount: number
  totalDeposit: number // This will now be the net deposit (advances - refunds)
  totalRefunds: number // NEW: Total refunds for this specific IPD record
  payments: IPDPayment[]
  createdAt: string
  remainingAmount?: number
}

interface OTAppointment {
  id: string
  patientId: string
  uhid: string
  name: string
  phone: string
  date: string
  time: string
  message: string
  createdAt: string
}

interface PatientInfo {
  uhid: string
  name: string
  phone: string
  age: number
  address: string
  gender: string
}

interface FilterState {
  searchQuery: string
  filterType: "week" | "today" | "month" | "dateRange"
  selectedMonth: string
  startDate: string
  endDate: string
}

// ----- Helper Functions -----

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount)
}

// Update getThisWeekRange to fetch data for the last 7 days (including today)
const getThisWeekRange = () => {
  const now = new Date()
  const end = format(now, "yyyy-MM-dd")
  const start = format(addDays(now, -6), "yyyy-MM-dd") // Today and 6 previous days = 7 days
  return { start, end }
}

const getTodayDate = () => {
  return new Date().toISOString().split("T")[0]
}

const getMonthRange = (monthYear: string) => {
  const [year, month] = monthYear.split("-")
  const start = new Date(Number.parseInt(year), Number.parseInt(month) - 1, 1)
  const end = new Date(Number.parseInt(year), Number.parseInt(month), 0)
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  }
}

// ----- Dashboard Component -----

const DashboardPage: React.FC = () => {
  const [opdAppointments, setOpdAppointments] = useState<OPDAppointment[]>([])
  const [ipdAppointments, setIpdAppointments] = useState<IPDAppointment[]>([])
  const [otAppointments, setOtAppointments] = useState<OTAppointment[]>([])
  const [doctors, setDoctors] = useState<{ [key: string]: Doctor }>({})
  const [patientCache, setPatientCache] = useState<{ [key: string]: PatientInfo }>({})

  const [filters, setFilters] = useState<FilterState>({
    searchQuery: "",
    filterType: "week",
    selectedMonth: format(new Date(), "yyyy-MM"),
    startDate: "",
    endDate: "",
  })

  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)
  const [modalLoading, setModalLoading] = useState<boolean>(false)

  // Get current date range based on filter type
  const currentDateRange = useMemo(() => {
    switch (filters.filterType) {
      case "today":
        const today = getTodayDate()
        return { start: today, end: today }
      case "month":
        return getMonthRange(filters.selectedMonth)
      case "dateRange":
        return { start: filters.startDate, end: filters.endDate }
      default:
        return getThisWeekRange()
    }
  }, [filters])

  // Fetch doctors once
  useEffect(() => {
    const doctorsRef = ref(db, "doctors")
    get(doctorsRef).then((snapshot) => {
      const data = snapshot.val()
      if (data) {
        setDoctors(data as { [key: string]: Doctor })
      }
    })
  }, [])

  // Fetch patient info when needed
  const fetchPatientInfo = useCallback(
    async (patientId: string): Promise<PatientInfo | null> => {
      if (patientCache[patientId]) {
        return patientCache[patientId]
      }

      try {
        const patientRef = ref(db, `patients/patientinfo/${patientId}`)
        const snapshot = await get(patientRef)
        const data = snapshot.val()

        if (data) {
          const patientInfo: PatientInfo = {
            uhid: data.uhid,
            name: data.name,
            phone: data.phone,
            age: 0,
            address: "",
            gender: "",
          }

          setPatientCache((prev) => ({ ...prev, [patientId]: patientInfo }))
          return patientInfo
        }
      } catch (error) {
        console.error("Error fetching patient info:", error)
      }

      return null
    },
    [patientCache],
  )

  // Combined and parallelized data fetching for OPD, IPD, and OT
  useEffect(() => {
    const fetchAppointmentsForRange = async () => {
      const { start: startDate, end: endDate } = currentDateRange
      if (!startDate || !endDate) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setOpdAppointments([])
      setIpdAppointments([])
      setOtAppointments([])

      const allDailyFetches: Promise<void>[] = []
      const tempOpdList: OPDAppointment[] = []
      const tempIpdList: IPDAppointment[] = []
      const tempOtList: OTAppointment[] = []

      const dateIterator = new Date(startDate)
      const endDateObj = new Date(endDate)

      while (dateIterator <= endDateObj) {
        const dateStr = format(dateIterator, "yyyy-MM-dd")

        allDailyFetches.push(
          (async () => {
            // Fetch all data for this specific date concurrently
            const [opdSnap, ipdInfoSnap, billingInfoSnap, otSnap] = await Promise.all([
              get(ref(db, `patients/opddetail/${dateStr}`)),
              get(ref(db, `patients/ipddetail/userinfoipd/${dateStr}`)),
              get(ref(db, `patients/ipddetail/userbillinginfoipd/${dateStr}`)),
              get(ref(db, `patients/ot/otdetail/${dateStr}`)),
            ])

            // Process OPD data
            if (opdSnap.exists()) {
              const patientAppointmentsByDate = opdSnap.val()
              for (const patientId in patientAppointmentsByDate) {
                const appointmentsForPatient = patientAppointmentsByDate[patientId]
                for (const appointmentId in appointmentsForPatient) {
                  const appointmentData = appointmentsForPatient[appointmentId]
                  let patientInfo: PatientInfo | null

                  if (appointmentData.name && appointmentData.phone) {
                    patientInfo = {
                      name: appointmentData.name,
                      phone: appointmentData.phone,
                      uhid: appointmentData.patientId || patientId,
                      age: 0,
                      address: "",
                      gender: "",
                    }
                  } else {
                    patientInfo = await fetchPatientInfo(patientId) // This will use cache or fetch
                  }

                  if (patientInfo) {
                    tempOpdList.push({
                      id: `${patientId}_${appointmentId}`,
                      patientId,
                      name: patientInfo.name,
                      phone: patientInfo.phone,
                      date: dateStr,
                      time: appointmentData.time || "",
                      appointmentType: appointmentData.appointmentType || "visithospital",
                      createdAt: appointmentData.createdAt,
                      enteredBy: appointmentData.enteredBy || "",
                      message: appointmentData.message || "",
                      modalities: appointmentData.modalities || [],
                      opdType: appointmentData.opdType || "",
                      payment: appointmentData.payment || {
                        cashAmount: 0,
                        createdAt: "",
                        discount: 0,
                        onlineAmount: 0,
                        paymentMethod: "cash",
                        totalCharges: 0,
                        totalPaid: 0,
                      },
                      referredBy: appointmentData.referredBy || "",
                      study: appointmentData.study || "",
                      visitType: appointmentData.visitType || "",
                    })
                  }
                }
              }
            }

            // Process IPD data
            const billingDataByPatient: Record<string, Record<string, any>> = billingInfoSnap.exists()
              ? billingInfoSnap.val()
              : {}
            if (ipdInfoSnap.exists()) {
              const patientIpdRecordsByDate = ipdInfoSnap.val()
              for (const patientId in patientIpdRecordsByDate) {
                const ipdRecordsForPatient = patientIpdRecordsByDate[patientId]
                for (const ipdId in ipdRecordsForPatient) {
                  const ipdData = ipdRecordsForPatient[ipdId]
                  const patientInfo = await fetchPatientInfo(patientId)
                  const billingData = billingDataByPatient[patientId]?.[ipdId] || {}

                  const payments: IPDPayment[] = []
                  let netDeposit = 0 // Renamed for clarity: this is the net amount after advances and refunds
                  let ipdTotalRefunds = 0 // Track refunds for this specific IPD record

                  if (billingData?.payments) {
                    Object.values(billingData.payments).forEach((paymentRaw: any) => {
                      const payment = paymentRaw as IPDPayment
                      payments.push(payment)
                      if (payment.type === "advance") {
                        netDeposit += Number(payment.amount)
                      } else if (payment.type === "refund") {
                        netDeposit -= Number(payment.amount)
                        ipdTotalRefunds += Number(payment.amount)
                      }
                    })
                  }

                  // MODIFIED: Fetch services from billingData
                  const totalServiceAmount = (billingData.services || []).reduce(
                    (sum: number, serviceRaw: any) => sum + (serviceRaw.amount || 0),
                    0,
                  )

                  const remainingAmount = totalServiceAmount - netDeposit

                  if (patientInfo) {
                    tempIpdList.push({
                      id: `${patientId}_${ipdId}`,
                      patientId,
                      uhid: patientInfo.uhid,
                      name: patientInfo.name,
                      phone: patientInfo.phone,
                      admissionDate: dateStr,
                      admissionTime: ipdData.admissionTime,
                      doctor: doctors[ipdData.doctor]?.name || "Unknown",
                      doctorId: ipdData.doctor,
                      roomType: ipdData.roomType,
                      status: ipdData.status,
                      services: billingData.services || [], // MODIFIED: Use services from billingData
                      totalAmount: totalServiceAmount,
                      totalDeposit: netDeposit, // Use the calculated net deposit
                      totalRefunds: ipdTotalRefunds, // Add the new totalRefunds field
                      payments,
                      remainingAmount: totalServiceAmount - netDeposit, // Remaining amount based on net deposit
                      createdAt: ipdData.createdAt,
                    })
                  }
                }
              }
            }

            // Process OT data
            const otDateRef = ref(db, `patients/ot/otdetail/${dateStr}`)
            const otDetailSnap = await get(otDateRef)
            if (otDetailSnap.exists()) {
              const patientOtRecordsByDate = otDetailSnap.val()
              for (const patientId in patientOtRecordsByDate) {
                const otRecordsForPatient = patientOtRecordsByDate[patientId]
                for (const otId in otRecordsForPatient) {
                  const otData = otRecordsForPatient[otId]
                  const patientInfo = await fetchPatientInfo(patientId)

                  if (patientInfo) {
                    tempOtList.push({
                      id: `${patientId}_${otId}`,
                      patientId,
                      uhid: patientInfo.uhid,
                      name: patientInfo.name,
                      phone: patientInfo.phone,
                      date: dateStr,
                      time: otData.time,
                      message: otData.message,
                      createdAt: otData.createdAt,
                    })
                  }
                }
              }
            }
          })(),
        )

        dateIterator.setDate(dateIterator.getDate() + 1) // Move to the next day
      }

      await Promise.all(allDailyFetches) // Wait for all daily fetches to complete
      setOpdAppointments(tempOpdList)
      setIpdAppointments(tempIpdList)
      setOtAppointments(tempOtList)
      setIsLoading(false)
    }

    fetchAppointmentsForRange()
  }, [currentDateRange, doctors, fetchPatientInfo]) // Re-run when date range or doctors/patient cache changes

  // Updated statistics calculation for new OPD structure
  const statistics = useMemo(() => {
    const totalOpdAmount = opdAppointments.reduce((sum, app) => sum + (app.payment.totalPaid || 0), 0)
    const totalIpdNetDeposit = ipdAppointments.reduce((sum, app) => sum + app.totalDeposit, 0)
    const overallIpdRefunds = ipdAppointments.reduce((sum, app) => sum + app.totalRefunds, 0) // Sum of all refunds

    const opdCash = opdAppointments.reduce((sum, app) => {
      return sum + (app.payment.cashAmount || 0)
    }, 0)

    const opdOnline = opdAppointments.reduce((sum, app) => {
      return sum + (app.payment.onlineAmount || 0)
    }, 0)

    const ipdCash = ipdAppointments.reduce((sum, app) => {
      return (
        sum +
        app.payments.filter((p) => p.paymentType === "cash" && p.type === "advance").reduce((s, p) => s + p.amount, 0)
      )
    }, 0)

    const ipdOnline = ipdAppointments.reduce((sum, app) => {
      return (
        sum +
        app.payments.filter((p) => p.paymentType === "online" && p.type === "advance").reduce((s, p) => s + p.amount, 0)
      )
    }, 0)

    return {
      totalOpdCount: opdAppointments.length,
      totalOpdAmount,
      totalIpdCount: ipdAppointments.length,
      totalIpdAmount: totalIpdNetDeposit, // Use the net deposit here
      overallIpdRefunds, // NEW: Add overall IPD refunds to statistics
      totalOtCount: otAppointments.length,
      opdCash,
      opdOnline,
      ipdCash,
      ipdOnline,
      totalRevenue: totalOpdAmount + totalIpdNetDeposit, // Total revenue is OPD + net IPD
    }
  }, [opdAppointments, ipdAppointments, otAppointments])

  // Filter appointments based on search
  const filteredAppointments = useMemo(() => {
    const allAppointments = [
      ...opdAppointments.map((app) => ({ ...app, type: "OPD" as const })),
      ...ipdAppointments.map((app) => ({ ...app, type: "IPD" as const, date: app.admissionDate })),
      ...otAppointments.map((app) => ({ ...app, type: "OT" as const })),
    ]

    if (!filters.searchQuery) return allAppointments

    const query = filters.searchQuery.toLowerCase()
    return allAppointments.filter((app) => app.name.toLowerCase().includes(query) || app.phone.includes(query))
  }, [opdAppointments, ipdAppointments, otAppointments, filters.searchQuery])

  // Calculate doctor consultations
  const doctorConsultations = useMemo(() => {
    const consultationsMap = new Map<string, number>() // Map<DoctorName, Count>

    opdAppointments.forEach((app) => {
      app.modalities.forEach((modality) => {
        if (modality.type === "consultation" && modality.doctor) {
          const doctorName = modality.doctor
          consultationsMap.set(doctorName, (consultationsMap.get(doctorName) || 0) + 1)
        }
      })
    })

    // Convert map to array of objects and sort by count (descending)
    return Array.from(consultationsMap.entries())
      .map(([doctorName, count]) => ({ doctorName, count }))
      .sort((a, b) => b.count - a.count)
  }, [opdAppointments])

  // Chart data for doctor consultations
  const doctorConsultationChartData = useMemo(() => {
    const topDoctors = doctorConsultations.slice(0, 10) // Limit to top 10 doctors for readability
    return {
      labels: topDoctors.map((d) => d.doctorName),
      datasets: [
        {
          label: "Consultations",
          data: topDoctors.map((d) => d.count),
          backgroundColor: "rgba(75, 192, 192, 0.6)",
          borderColor: "rgba(75, 192, 192, 1)",
          borderWidth: 1,
        },
      ],
    }
  }, [doctorConsultations])

  // Helper function to get modalities summary
  const getModalitiesSummary = (modalities: IModality[]) => {
    const consultations = modalities.filter((m) => m.type === "consultation").length
    const casualty = modalities.filter((m) => m.type === "casualty").length
    const xrays = modalities.filter((m) => m.type === "xray").length
    const custom = modalities.filter((m) => m.type === "custom").length // Added custom

    const parts = []
    if (consultations > 0) parts.push(`${consultations} Consultation${consultations > 1 ? "s" : ""}`)
    if (casualty > 0) parts.push(`${casualty} Casualty`)
    if (xrays > 0) parts.push(`${xrays} X-ray${xrays > 1 ? "s" : ""}`)
    if (custom > 0) parts.push(`${custom} Custom Service${custom > 1 ? "s" : ""}`) // Added custom

    return parts.join(", ") || "No services"
  }

  // Filter handlers
  const handleFilterChange = (newFilters: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }))
  }

  const handleDateRangeChange = (start: string, end: string) => {
    if (start && end) {
      const daysDiff = differenceInDays(new Date(end), new Date(start))
      if (daysDiff > 30) {
        toast.error("Date range cannot exceed 30 days")
        const maxEndDate = addDays(new Date(start), 30)
        handleFilterChange({
          startDate: start,
          endDate: format(maxEndDate, "yyyy-MM-dd"),
          filterType: "dateRange",
        })
      } else {
        handleFilterChange({
          startDate: start,
          endDate: end,
          filterType: "dateRange",
        })
      }
    }
  }

  const resetFilters = () => {
    setFilters({
      searchQuery: "",
      filterType: "week",
      selectedMonth: format(new Date(), "yyyy-MM"),
      startDate: "",
      endDate: "",
    })
  }

  // Modal handlers
  const openModal = async (appointment: any) => {
    setModalLoading(true)
    setIsModalOpen(true)

    if (appointment.type === "IPD") {
      try {
        const detailRef = ref(
          db,
          `patients/ipddetail/userdetailipd/${appointment.date}/${appointment.patientId}/${appointment.id.split("_")[1]}`,
        )
        const detailSnapshot = await get(detailRef)
        const detailData = detailSnapshot.val()

        setSelectedAppointment({
          ...appointment,
          details: detailData,
        })
      } catch (error) {
        console.error("Error fetching IPD details:", error)
        setSelectedAppointment(appointment)
      }
    } else {
      setSelectedAppointment(appointment)
    }

    setModalLoading(false)
  }

  const closeModal = () => {
    setSelectedAppointment(null)
    setIsModalOpen(false)
  }

  const getBadgeColor = (type: string) => {
    switch (type) {
      case "OPD":
        return "bg-sky-100 text-sky-800"
      case "IPD":
        return "bg-orange-100 text-orange-800"
      case "OT":
        return "bg-purple-100 text-purple-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getFilterTitle = () => {
    switch (filters.filterType) {
      case "today":
        return "Today's Data"
      case "month":
        return `${format(new Date(filters.selectedMonth + "-01"), "MMMM yyyy")} Data`
      case "dateRange":
        return `${format(new Date(filters.startDate), "MMM dd")} - ${format(new Date(filters.endDate), "MMM dd, yyyy")}`
      default:
        return `Week: ${format(new Date(currentDateRange.start), "MMM dd")} - ${format(
          new Date(currentDateRange.end),
          "MMM dd, yyyy",
        )}`
    }
  }

  const chartData = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd")
    const yesterday = format(addDays(new Date(), -1), "yyyy-MM-dd")
    const dayBeforeYesterday = format(addDays(new Date(), -2), "yyyy-MM-dd")

    const todayOpd = opdAppointments.filter((app) => app.date === today).length
    const yesterdayOpd = opdAppointments.filter((app) => app.date === yesterday).length
    const dayBeforeYesterdayOpd = opdAppointments.filter((app) => app.date === dayBeforeYesterday).length

    const todayIpd = ipdAppointments.filter((app) => app.admissionDate === today).length
    const yesterdayIpd = ipdAppointments.filter((app) => app.admissionDate === yesterday).length
    const dayBeforeYesterdayIpd = ipdAppointments.filter((app) => app.admissionDate === dayBeforeYesterday).length

    return {
      labels: [dayBeforeYesterday, yesterday, today],
      datasets: [
        {
          label: "OPD Appointments",
          data: [dayBeforeYesterdayOpd, yesterdayOpd, todayOpd],
          backgroundColor: "rgba(54, 162, 235, 0.6)",
        },
        {
          label: "IPD Admissions",
          data: [dayBeforeYesterdayIpd, yesterdayIpd, todayIpd],
          backgroundColor: "rgba(255, 99, 132, 0.6)",
        },
      ],
    }
  }, [opdAppointments, ipdAppointments])

  return (
    <>
      <ToastContainer />

      <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="max-w-[1600px] mx-auto">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
            <div className="px-6 py-4 flex flex-col md:flex-row justify-between items-center">
              <div className="flex items-center mb-4 md:mb-0">
                <div className="p-2 bg-gradient-to-r from-sky-500 to-blue-600 rounded-lg mr-3">
                  <Activity className="text-white h-6 w-6" />
                </div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">
                  G Medford NX
                </h1>
              </div>

              {/* Search Bar */}
              <div className="relative w-full md:w-1/3">
                <Search className="absolute top-3 left-3 text-gray-400 h-5 w-5" />
                <input
                  type="text"
                  placeholder="Search by name or phone"
                  value={filters.searchQuery}
                  onChange={(e) => handleFilterChange({ searchQuery: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition duration-200 shadow-sm"
                />
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="p-6">
            {/* Advanced Filters */}
            <div className="bg-white rounded-xl shadow-sm mb-6 p-6 border border-gray-100">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center mb-4 lg:mb-0">
                  <Filter className="mr-2 h-5 w-5 text-sky-500" />
                  Advanced Filters
                </h2>
                <button
                  onClick={resetFilters}
                  className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-sky-500 transition flex items-center shadow-sm"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reset All
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Quick Filters */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Quick Filters</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleFilterChange({ filterType: "week" })}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                        filters.filterType === "week"
                          ? "bg-sky-600 text-white shadow-md"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      This Week
                    </button>
                    <button
                      onClick={() => handleFilterChange({ filterType: "today" })}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                        filters.filterType === "today"
                          ? "bg-sky-600 text-white shadow-md"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      Today
                    </button>
                  </div>
                </div>

                {/* Month Filter */}
                <div>
                  <label htmlFor="month" className="block text-sm font-medium text-gray-700 mb-1">
                    Filter by Month
                  </label>
                  <input
                    type="month"
                    id="month"
                    value={filters.selectedMonth}
                    onChange={(e) => handleFilterChange({ selectedMonth: e.target.value, filterType: "month" })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition shadow-sm"
                  />
                </div>

                {/* Date Range Filter */}
                <div>
                  <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    id="startDate"
                    value={filters.startDate}
                    onChange={(e) => handleDateRangeChange(e.target.value, filters.endDate)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition shadow-sm"
                  />
                </div>

                <div>
                  <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
                    End Date (Max 30 days)
                  </label>
                  <input
                    type="date"
                    id="endDate"
                    value={filters.endDate}
                    onChange={(e) => handleDateRangeChange(filters.startDate, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition shadow-sm"
                  />
                </div>
              </div>

              {/* Current Filter Display */}
              <div className="mt-4 p-3 bg-gradient-to-r from-sky-50 to-blue-50 rounded-lg border border-sky-200">
                <div className="flex items-center">
                  <CalendarDays className="mr-2 h-5 w-5 text-sky-600" />
                  <span className="text-sky-800 font-medium">{getFilterTitle()}</span>
                </div>
              </div>
            </div>

            {/* Dashboard Statistics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              {/* OPD Statistics */}
              <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-gradient-to-r from-sky-100 to-blue-100 rounded-full">
                    <Activity className="text-sky-600 h-6 w-6" />
                  </div>
                  <div className="text-right">
                    <p className="text-gray-500 text-sm">OPD</p>
                    <p className="text-2xl font-bold text-gray-900">{statistics.totalOpdCount}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Revenue</span>
                  <span className="text-lg font-semibold text-sky-600">
                    {formatCurrency(statistics.totalOpdAmount)}
                  </span>
                </div>
              </div>

              {/* IPD Statistics */}
              <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-gradient-to-r from-orange-100 to-red-100 rounded-full">
                    <Layers className="text-orange-600 h-6 w-6" />
                  </div>
                  <div className="text-right">
                    <p className="text-gray-500 text-sm">IPD</p>
                    <p className="text-2xl font-bold text-gray-900">{statistics.totalIpdCount}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Net Deposit</span>
                  <span className="text-lg font-semibold text-orange-600">
                    {formatCurrency(statistics.totalIpdAmount)}
                  </span>
                </div>
                {statistics.overallIpdRefunds > 0 && ( // NEW: Display total refunds if greater than 0
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm text-gray-600">Total Refunds</span>
                    <span className="text-lg font-semibold text-blue-600">
                      {formatCurrency(statistics.overallIpdRefunds)}
                    </span>
                  </div>
                )}
              </div>

              {/* OT Statistics */}
              <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-gradient-to-r from-purple-100 to-pink-100 rounded-full">
                    <Stethoscope className="text-purple-600 h-6 w-6" />
                  </div>
                  <div className="text-right">
                    <p className="text-gray-500 text-sm">OT</p>
                    <p className="text-2xl font-bold text-gray-900">{statistics.totalOtCount}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Procedures</span>
                  <span className="text-lg font-semibold text-purple-600">{statistics.totalOtCount}</span>
                </div>
              </div>

              {/* Total Revenue */}
              <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-gradient-to-r from-emerald-100 to-green-100 rounded-full">
                    <DollarSign className="text-emerald-600 h-6 w-6" />
                  </div>
                  <div className="text-right">
                    <p className="text-gray-500 text-sm">Total</p>
                    <p className="text-2xl font-bold text-gray-900">Revenue</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Amount</span>
                  <span className="text-lg font-semibold text-emerald-600">
                    {formatCurrency(statistics.totalRevenue)}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment Breakdown and Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Payment Breakdown */}
              <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-100">
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                  <CreditCard className="mr-2 h-5 w-5 text-gray-600" />
                  Payment Breakdown
                </h2>
                <div className="space-y-6">
                  <div className="bg-gradient-to-r from-sky-50 to-blue-50 rounded-lg p-4">
                    <h3 className="font-medium text-sky-800 mb-3">OPD Payments</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 text-sm">💵 Cash</span>
                        <span className="font-semibold text-sky-600">{formatCurrency(statistics.opdCash)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 text-sm">💳 Online</span>
                        <span className="font-semibold text-sky-600">{formatCurrency(statistics.opdOnline)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-sky-200">
                        <span className="text-sky-700 font-medium">Total OPD</span>
                        <span className="font-bold text-sky-700">{formatCurrency(statistics.totalOpdAmount)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-orange-50 to-red-50 rounded-lg p-4">
                    <h3 className="font-medium text-orange-800 mb-3">IPD Payments</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 text-sm">💵 Cash</span>
                        <span className="font-semibold text-orange-600">{formatCurrency(statistics.ipdCash)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 text-sm">💳 Online</span>
                        <span className="font-semibold text-orange-600">{formatCurrency(statistics.ipdOnline)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-orange-200">
                        <span className="text-orange-700 font-medium">Total IPD (Net Deposit)</span>
                        <span className="font-bold text-orange-700">{formatCurrency(statistics.totalIpdAmount)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-emerald-50 to-green-50 rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <span className="text-emerald-800 font-semibold">💰 Grand Total</span>
                      <span className="font-bold text-xl text-emerald-600">
                        {formatCurrency(statistics.totalRevenue)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Weekly Appointments Chart */}
              <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-100">
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                  <Activity className="mr-2 h-5 w-5 text-gray-600" />
                  Appointments Overview
                </h2>
                <Bar
                  data={chartData}
                  options={{
                    responsive: true,
                    plugins: {
                      legend: {
                        position: "top",
                      },
                    },
                    scales: {
                      y: {
                        beginAtZero: true,
                        ticks: {
                          stepSize: 1,
                        },
                      },
                    },
                  }}
                />
              </div>
            </div>

            {/* Doctor Consultations List and Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Doctor Consultations List */}
              <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-100">
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                  <UserCheck className="mr-2 h-5 w-5 text-gray-600" />
                  Doctor Consultations
                </h2>
                {doctorConsultations.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Doctor Name
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Consultations
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {doctorConsultations.map((doc) => (
                          <tr key={doc.doctorName} className="hover:bg-gray-50">
                            <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                              {doc.doctorName}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-600">{doc.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    <p>No consultation data for the selected period.</p>
                  </div>
                )}
              </div>

              {/* Doctor Consultations Chart */}
              <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-100">
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                  <UserCheck className="mr-2 h-5 w-5 text-gray-600" />
                  Top Doctors by Consultations
                </h2>
                {doctorConsultationChartData.labels.length > 0 ? (
                  <Bar
                    data={doctorConsultationChartData}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: {
                          position: "top",
                        },
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                          ticks: {
                            stepSize: 1,
                          },
                        },
                      },
                    }}
                  />
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    <p>No data to display chart for the selected period.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Appointments Table */}
            <div className="bg-white shadow-sm rounded-xl overflow-hidden border border-gray-100">
              <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-gray-100">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center">
                  <FileText className="mr-2 h-5 w-5 text-gray-600" />
                  Appointments List
                </h2>
              </div>

              {isLoading ? (
                <div className="flex justify-center items-center p-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sky-500"></div>
                  <span className="ml-3 text-gray-600">Loading appointments...</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Patient
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Contact
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date & Time
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Services/Amount
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
                              <div className="flex items-center">
                                <div className="p-2 bg-gray-100 rounded-full mr-3">
                                  <User className="h-4 w-4 text-gray-600" />
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-gray-900">{appointment.name}</div>
                                  {appointment.type === "IPD" && (
                                    <div className="text-xs text-gray-500">UHID: {appointment.uhid}</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-500">{appointment.phone}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {appointment.date && format(new Date(appointment.date), "dd MMM yyyy")}
                              </div>
                              {appointment.type === "OPD" && appointment.time && (
                                <div className="text-xs text-gray-500 flex items-center">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {appointment.time}
                                </div>
                              )}
                              {appointment.type === "OT" && appointment.time && (
                                <div className="text-xs text-gray-500 flex items-center">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {appointment.time}
                                </div>
                              )}
                              {appointment.type === "IPD" && (
                                <div className="text-xs text-gray-500 flex items-center">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {appointment.admissionTime}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-medium ${getBadgeColor(
                                  appointment.type,
                                )}`}
                              >
                                {appointment.type}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {appointment.type === "OPD" && (
                                <div>
                                  <div className="text-sm text-gray-600 mb-1">
                                    {getModalitiesSummary(appointment.modalities)}
                                  </div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {formatCurrency(appointment.payment.totalPaid)}
                                  </div>
                                </div>
                              )}
                              {appointment.type === "IPD" && (
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {formatCurrency(appointment.totalDeposit)}
                                  </div>
                                  {appointment.remainingAmount !== undefined && appointment.remainingAmount > 0 && (
                                    <div className="text-xs text-red-500">
                                      Pending: {formatCurrency(appointment.remainingAmount)}
                                    </div>
                                  )}
                                </div>
                              )}
                              {appointment.type === "OT" && <div className="text-sm text-gray-500">Procedure</div>}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <button
                                onClick={() => openModal(appointment)}
                                className="bg-sky-600 hover:bg-sky-700 text-white px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                              >
                                View Details
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center">
                            <div className="flex flex-col items-center">
                              <FileText className="h-12 w-12 text-gray-300 mb-4" />
                              <p className="text-gray-500 text-lg">No appointments found</p>
                              <p className="text-gray-400 text-sm">Try adjusting your filters</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Enhanced Appointment Details Modal */}
        <Dialog open={isModalOpen} onClose={closeModal} className="fixed z-50 inset-0 overflow-y-auto">
          {isModalOpen && selectedAppointment && (
            <div className="flex items-center justify-center min-h-screen px-4">
              <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" aria-hidden="true"></div>
              <Dialog.Panel className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl p-6 transform transition-all max-h-screen overflow-y-auto">
                <button
                  onClick={closeModal}
                  className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 focus:outline-none p-2 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>

                {modalLoading ? (
                  <div className="flex justify-center items-center p-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-sky-500"></div>
                    <span className="ml-3 text-gray-600">Loading details...</span>
                  </div>
                ) : (
                  <>
                    <Dialog.Title className="text-2xl font-bold mb-6 text-gray-800 flex items-center">
                      <div
                        className={`p-3 rounded-full mr-4 ${
                          selectedAppointment.type === "OPD"
                            ? "bg-gradient-to-r from-sky-100 to-blue-100"
                            : selectedAppointment.type === "IPD"
                              ? "bg-gradient-to-r from-orange-100 to-red-100"
                              : "bg-gradient-to-r from-purple-100 to-pink-100"
                        }`}
                      >
                        {selectedAppointment.type === "OPD" && <Activity className="text-sky-600 h-6 w-6" />}
                        {selectedAppointment.type === "IPD" && <Layers className="text-orange-600 h-6 w-6" />}
                        {selectedAppointment.type === "OT" && <Stethoscope className="text-purple-600 h-6 w-6" />}
                      </div>
                      {selectedAppointment.type} Appointment Details
                    </Dialog.Title>

                    {/* Patient Information */}
                    <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-6 mb-6">
                      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                        <User className="mr-2 h-5 w-5 text-gray-600" />
                        Patient Information
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm text-gray-500">Patient Name</p>
                            <p className="font-medium text-lg">{selectedAppointment.name}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Phone</p>
                            <p className="font-medium">{selectedAppointment.phone}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Date</p>
                            <p className="font-medium">{format(new Date(selectedAppointment.date), "dd MMM yyyy")}</p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm text-gray-500">Patient ID</p>
                            <p className="font-medium">{selectedAppointment.patientId}</p>
                          </div>
                          {selectedAppointment.type === "IPD" && (
                            <>
                              <div>
                                <p className="text-sm text-gray-500">UHID</p>
                                <p className="font-medium">{selectedAppointment.uhid}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Room Type</p>
                                <p className="font-medium">{selectedAppointment.roomType}</p>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Updated OPD Specific Details */}
                    {selectedAppointment.type === "OPD" && (
                      <>
                        <div className="bg-gradient-to-r from-sky-50 to-blue-50 rounded-lg p-6 mb-6">
                          <h3 className="text-lg font-semibold text-sky-800 mb-4">OPD Details</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                              <div>
                                <p className="text-sm text-gray-500">Time</p>
                                <p className="font-medium">{selectedAppointment.time || "-"}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Appointment Type</p>
                                <p className="font-medium capitalize">{selectedAppointment.appointmentType}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Visit Type</p>
                                <p className="font-medium capitalize">{selectedAppointment.visitType || "-"}</p>
                              </div>
                            </div>
                            <div className="space-y-3">
                              <div>
                                <p className="text-sm text-gray-500">Payment Method</p>
                                <p className="font-medium capitalize">{selectedAppointment.payment.paymentMethod}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Total Amount</p>
                                <p className="font-bold text-xl text-sky-600">
                                  {formatCurrency(selectedAppointment.payment.totalPaid)}
                                </p>
                              </div>
                              {selectedAppointment.payment.discount > 0 && (
                                <div>
                                  <p className="text-sm text-gray-500">Discount</p>
                                  <p className="font-medium text-green-600">₹{selectedAppointment.payment.discount}</p>
                                </div>
                              )}
                            </div>
                          </div>
                          {selectedAppointment.message && (
                            <div className="mt-4 p-3 bg-white rounded-lg border border-sky-200">
                              <p className="text-sm text-gray-500">Notes</p>
                              <p className="font-medium">{selectedAppointment.message}</p>
                            </div>
                          )}
                        </div>

                        {/* Services & Modalities */}
                        {selectedAppointment.modalities && selectedAppointment.modalities.length > 0 && (
                          <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-6 mb-6">
                            <h3 className="text-lg font-semibold text-purple-800 mb-4 flex items-center">
                              <FileText className="mr-2 h-5 w-5" />
                              Services & Modalities
                            </h3>
                            <div className="space-y-3">
                              {selectedAppointment.modalities.map((modality: IModality, index: number) => (
                                <div key={index} className="border border-purple-200 rounded p-3 bg-white">
                                  <div className="flex justify-between items-start mb-2">
                                    <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-medium capitalize">
                                      {modality.type}
                                    </span>
                                    <span className="font-semibold text-purple-700">₹{modality.charges}</span>
                                  </div>
                                  {modality.doctor && (
                                    <div className="text-xs text-gray-600">
                                      <strong>Doctor:</strong> {modality.doctor}
                                    </div>
                                  )}
                                  {modality.specialist && (
                                    <div className="text-xs text-gray-600">
                                      <strong>Specialist:</strong> {modality.specialist}
                                    </div>
                                  )}
                                  {modality.service && (
                                    <div className="text-xs text-gray-600">
                                      <strong>Service:</strong> {modality.service}
                                    </div>
                                  )}
                                  {modality.visitType && (
                                    <div className="text-xs text-gray-600">
                                      <strong>Visit Type:</strong> {modality.visitType}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                            <div className="mt-4 p-4 bg-white rounded-lg border border-purple-200">
                              <div className="flex justify-between items-center text-lg font-semibold">
                                <span className="text-purple-700">Total Charges:</span>
                                <span className="text-purple-600">₹{selectedAppointment.payment.totalCharges}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Payment Details */}
                        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-6">
                          <h3 className="text-lg font-semibold text-green-800 mb-4 flex items-center">
                            <CreditCard className="mr-2 h-5 w-5" />
                            Payment Details
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Cash Amount:</span>
                                <span className="font-semibold text-green-700">
                                  ₹{selectedAppointment.payment.cashAmount}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Online Amount:</span>
                                <span className="font-semibold text-blue-700">
                                  ₹{selectedAppointment.payment.onlineAmount}
                                </span>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Total Charges:</span>
                                <span className="font-semibold">₹{selectedAppointment.payment.totalCharges}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Discount:</span>
                                <span className="font-semibold text-red-600">
                                  ₹{selectedAppointment.payment.discount}
                                </span>
                              </div>
                              <div className="flex justify-between border-t pt-2">
                                <span className="text-green-700 font-bold">Total Paid:</span>
                                <span className="font-bold text-green-600">
                                  ₹{selectedAppointment.payment.totalPaid}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {/* IPD Specific Details */}
                    {selectedAppointment.type === "IPD" && (
                      <>
                        {/* Services */}
                        {selectedAppointment.services && selectedAppointment.services.length > 0 && (
                          <div className="bg-gradient-to-r from-orange-50 to-red-50 rounded-lg p-6 mb-6">
                            <h3 className="text-lg font-semibold text-orange-800 mb-4 flex items-center">
                              <FileText className="mr-2 h-5 w-5" />
                              Services & Charges
                            </h3>
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-orange-200">
                                <thead className="bg-orange-100">
                                  <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">
                                      Service
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">
                                      Type
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">
                                      Doctor
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">
                                      Amount
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-orange-100">
                                  {selectedAppointment.services.map((service: IPDService, index: number) => (
                                    <tr key={index} className="hover:bg-orange-50">
                                      <td className="px-4 py-2 text-sm text-gray-900">{service.serviceName}</td>
                                      <td className="px-4 py-2 text-sm text-gray-600 capitalize">{service.type}</td>
                                      <td className="px-4 py-2 text-sm text-gray-600">{service.doctorName || "-"}</td>
                                      <td className="px-4 py-2 text-sm font-medium text-orange-600">
                                        {formatCurrency(service.amount)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className="mt-4 p-4 bg-white rounded-lg border border-orange-200">
                              <div className="flex justify-between items-center text-lg font-semibold">
                                <span className="text-orange-700">Total Service Amount:</span>
                                <span className="text-orange-600">
                                  {formatCurrency(selectedAppointment.totalAmount)}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Payment Details */}
                        {selectedAppointment.payments && selectedAppointment.payments.length > 0 && (
                          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-6 mb-6">
                            <h3 className="text-lg font-semibold text-green-800 mb-4 flex items-center">
                              <CreditCard className="mr-2 h-5 w-5" />
                              Payment History
                            </h3>
                            <div className="space-y-3">
                              {selectedAppointment.payments.map((payment: IPDPayment, index: number) => (
                                <div
                                  key={index}
                                  className="flex justify-between items-center p-3 bg-white rounded-lg border border-green-200"
                                >
                                  <div>
                                    <span className="font-medium text-green-700">
                                      {payment.paymentType.toUpperCase()} - {payment.type.toUpperCase()}
                                    </span>
                                    {payment.date && (
                                      <p className="text-sm text-gray-500">
                                        {format(new Date(payment.date), "dd MMM yyyy")}
                                      </p>
                                    )}
                                  </div>
                                  <span className="font-bold text-green-600">{formatCurrency(payment.amount)}</span>
                                </div>
                              ))}
                            </div>
                            <div className="mt-4 p-4 bg-white rounded-lg border border-green-200">
                              <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-green-700">Total Paid:</span>
                                  <span className="font-bold text-green-600">
                                    {formatCurrency(selectedAppointment.totalDeposit)}
                                  </span>
                                </div>
                                {selectedAppointment.remainingAmount !== undefined &&
                                  selectedAppointment.remainingAmount > 0 && (
                                    <div className="flex justify-between items-center">
                                      <span className="text-red-700">Remaining:</span>

                                      <span className="font-bold text-red-600">
                                        {formatCurrency(selectedAppointment.remainingAmount)}
                                      </span>
                                    </div>
                                  )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* NEW: Financial Summary */}
                        <div className="bg-gradient-to-r from-blue-50 to-sky-50 rounded-lg p-6">
                          <h3 className="text-lg font-semibold text-blue-800 mb-4 flex items-center">
                            <DollarSign className="mr-2 h-5 w-5" />
                            Financial Summary
                          </h3>
                          <div className="space-y-3">
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">Total Services:</span>
                              <span className="font-semibold text-blue-700">
                                {formatCurrency(selectedAppointment.totalAmount)}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">Total Net Payments:</span>
                              <span className="font-semibold text-green-700">
                                {formatCurrency(selectedAppointment.totalDeposit)}
                              </span>
                            </div>
                            {selectedAppointment.totalRefunds > 0 && (
                              <div className="flex justify-between items-center">
                                <span className="text-gray-600">Total Refunds Issued:</span>
                                <span className="font-semibold text-red-600">
                                  {formatCurrency(selectedAppointment.totalRefunds)}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between items-center pt-3 border-t border-blue-200">
                              <span className="text-blue-800 font-bold text-lg">Net Balance:</span>
                              <span
                                className={`font-bold text-xl ${
                                  selectedAppointment.totalAmount - selectedAppointment.totalDeposit > 0
                                    ? "text-red-600"
                                    : selectedAppointment.totalAmount - selectedAppointment.totalDeposit < 0
                                      ? "text-green-600"
                                      : "text-gray-800"
                                }`}
                              >
                                {formatCurrency(selectedAppointment.totalAmount - selectedAppointment.totalDeposit)}
                                {selectedAppointment.totalAmount - selectedAppointment.totalDeposit > 0
                                  ? " (Due)"
                                  : selectedAppointment.totalAmount - selectedAppointment.totalDeposit < 0
                                    ? " (Refundable)"
                                    : ""}
                              </span>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {/* OT Specific Details */}
                    {selectedAppointment.type === "OT" && (
                      <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-6">
                        <h3 className="text-lg font-semibold text-purple-800 mb-4">OT Details</h3>
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm text-gray-500">Time</p>
                            <p className="font-medium">{selectedAppointment.time || "-"}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Procedure Notes</p>
                            <p className="font-medium">{selectedAppointment.message || "-"}</p>
                          </div>
                        </div>
                      </div>
                    )}
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
