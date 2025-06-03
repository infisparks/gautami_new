"use client"

import type React from "react"
import { useEffect, useState, useMemo, useCallback } from "react"
import { db } from "@/lib/firebase"
import { ref, onChildAdded, onChildChanged, get } from "firebase/database"
import { format, startOfWeek, endOfWeek, differenceInDays, addDays } from "date-fns"
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
} from "lucide-react"

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

// ----- Type Definitions -----

interface Doctor {
  name: string
  opdCharge?: number
  department?: string
  specialist?: string
}

interface OPDAppointment {
  id: string
  patientId: string
  name: string
  phone: string
  date: string
  time: string
  doctor: string
  doctorId: string
  amount: number
  serviceName?: string
  paymentMethod?: string
  appointmentType: "visithospital" | "oncall"
  createdAt: string
  discount?: string
  originalAmount?: number
  message?: string
  referredBy?: string
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
  type: "deposit" | "advance"
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
  totalDeposit: number
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

const getThisWeekRange = () => {
  const now = new Date()
  const start = startOfWeek(now, { weekStartsOn: 1 })
  const end = endOfWeek(now, { weekStartsOn: 1 })
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  }
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
            age: data.age,
            address: data.address,
            gender: data.gender,
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

  // Fetch OPD appointments
  useEffect(() => {
    const { start: startDate, end: endDate } = currentDateRange
    if (!startDate || !endDate) return

    setIsLoading(true)
    setOpdAppointments([])

    const opdRef = ref(db, "patients/opddetail")

    const handleOpdAdded = async (snapshot: any) => {
      const patientId = snapshot.key!
      const rawAppointments = snapshot.val()
      if (!rawAppointments) {
        setIsLoading(false)
        return
      }
      const appointments = rawAppointments as Record<string, any>

      for (const [appointmentId, appointmentDataRaw] of Object.entries(appointments)) {
        const appointmentData = appointmentDataRaw as any
        if (appointmentData.date) {
          try {
            const appointmentDate = new Date(appointmentData.date)
            const dateStr = format(appointmentDate, "yyyy-MM-dd")

            if (dateStr >= startDate && dateStr <= endDate) {
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
                patientInfo = await fetchPatientInfo(patientId)
              }

              if (patientInfo) {
                const opdAppointment: OPDAppointment = {
                  id: `${patientId}_${appointmentId}`,
                  patientId,
                  name: patientInfo.name,
                  phone: patientInfo.phone,
                  date: dateStr,
                  time: appointmentData.time || "",
                  doctor: doctors[appointmentData.doctor]?.name || "Unknown",
                  doctorId: appointmentData.doctor,
                  amount: Number(appointmentData.amount) || 0,
                  serviceName: appointmentData.serviceName,
                  paymentMethod: appointmentData.paymentMethod || "cash",
                  appointmentType: appointmentData.appointmentType || "visithospital",
                  createdAt: appointmentData.createdAt,
                  discount: appointmentData.discount,
                  originalAmount: appointmentData.originalAmount,
                  message: appointmentData.message,
                  referredBy: appointmentData.referredBy,
                }

                setOpdAppointments((prev) => {
                  const exists = prev.find((app) => app.id === opdAppointment.id)
                  if (exists) {
                    return prev.map((app) => (app.id === opdAppointment.id ? opdAppointment : app))
                  }
                  return [...prev, opdAppointment]
                })
              }
            }
          } catch (error) {
            console.error("Error processing OPD date:", appointmentData.date, error)
          }
        }
      }

      setIsLoading(false)
    }

    get(opdRef)
      .then(handleOpdAdded)
      .catch((error) => {
        console.error("Error fetching OPD data:", error)
        setIsLoading(false)
      })

    const unsubscribeAdd = onChildAdded(opdRef, handleOpdAdded)
    const unsubscribeChange = onChildChanged(opdRef, handleOpdAdded)

    return () => {
      unsubscribeAdd()
      unsubscribeChange()
    }
  }, [currentDateRange, doctors, fetchPatientInfo])

  // Fetch IPD appointments
  useEffect(() => {
    const { start: startDate, end: endDate } = currentDateRange
    if (!startDate || !endDate) return

    setIpdAppointments([])

    const ipdInfoRef = ref(db, "patients/ipddetail/userinfoipd")

    const handleIpdAdded = async (snapshot: any) => {
      const patientId = snapshot.key!
      const rawIpdRecords = snapshot.val()
      if (!rawIpdRecords) return

      const ipdRecords = rawIpdRecords as Record<string, any>
      for (const [ipdId, ipdDataRaw] of Object.entries(ipdRecords)) {
        const ipdData = ipdDataRaw as any
        const admissionDate = format(new Date(ipdData.admissionDate), "yyyy-MM-dd")

        if (admissionDate >= startDate && admissionDate <= endDate) {
          const patientInfo = await fetchPatientInfo(patientId)

          // Fetch billing info
          const billingRef = ref(db, `patients/ipddetail/userbillinginfoipd/${patientId}/${ipdId}`)
          const billingSnapshot = await get(billingRef)
          const billingDataRaw = billingSnapshot.val()
          const billingData = billingDataRaw as any

          const payments: IPDPayment[] = []
          let totalDeposit = 0

          if (billingData?.payments) {
            Object.values(billingData.payments).forEach((paymentRaw: any) => {
              const payment = paymentRaw as any
              payments.push({
                amount: Number(payment.amount),
                paymentType: payment.paymentType,
                type: payment.type,
                date: payment.date,
              })
              totalDeposit += Number(payment.amount)
            })
          }

          const totalServiceAmount = (ipdData.services || []).reduce(
            (sum: number, serviceRaw: any) => sum + (serviceRaw.amount || 0),
            0,
          )

          const remainingAmount = totalServiceAmount - totalDeposit

          if (patientInfo) {
            const ipdAppointment: IPDAppointment = {
              id: `${patientId}_${ipdId}`,
              patientId,
              uhid: patientInfo.uhid,
              name: patientInfo.name,
              phone: patientInfo.phone,
              admissionDate,
              admissionTime: ipdData.admissionTime,
              doctor: doctors[ipdData.doctor]?.name || "Unknown",
              doctorId: ipdData.doctor,
              roomType: ipdData.roomType,
              status: ipdData.status,
              services: ipdData.services || [],
              totalAmount: totalServiceAmount,
              totalDeposit,
              payments,
              remainingAmount,
              createdAt: ipdData.createdAt,
            }

            setIpdAppointments((prev) => {
              const exists = prev.find((app) => app.id === ipdAppointment.id)
              if (exists) {
                return prev.map((app) => (app.id === ipdAppointment.id ? ipdAppointment : app))
              }
              return [...prev, ipdAppointment]
            })
          }
        }
      }
    }

    const unsubscribeAddIpd = onChildAdded(ipdInfoRef, handleIpdAdded)
    const unsubscribeChangeIpd = onChildChanged(ipdInfoRef, handleIpdAdded)

    return () => {
      unsubscribeAddIpd()
      unsubscribeChangeIpd()
    }
  }, [currentDateRange, doctors, fetchPatientInfo])

  // Fetch OT appointments
  useEffect(() => {
    const { start: startDate, end: endDate } = currentDateRange
    if (!startDate || !endDate) return

    setOtAppointments([])

    const otRef = ref(db, "patients/ot/otdetail")

    const handleOtAdded = async (snapshot: any) => {
      const patientId = snapshot.key!
      const rawOtRecords = snapshot.val()
      if (!rawOtRecords) return

      const otRecords = rawOtRecords as Record<string, any>
      for (const [otId, otDataRaw] of Object.entries(otRecords)) {
        const otData = otDataRaw as any
        if (otData.date >= startDate && otData.date <= endDate) {
          const patientInfo = await fetchPatientInfo(patientId)

          if (patientInfo) {
            const otAppointment: OTAppointment = {
              id: `${patientId}_${otId}`,
              patientId,
              uhid: patientInfo.uhid,
              name: patientInfo.name,
              phone: patientInfo.phone,
              date: otData.date,
              time: otData.time,
              message: otData.message,
              createdAt: otData.createdAt,
            }

            setOtAppointments((prev) => {
              const exists = prev.find((app) => app.id === otAppointment.id)
              if (exists) {
                return prev.map((app) => (app.id === otAppointment.id ? otAppointment : app))
              }
              return [...prev, otAppointment]
            })
          }
        }
      }
    }

    const unsubscribeAddOt = onChildAdded(otRef, handleOtAdded)
    const unsubscribeChangeOt = onChildChanged(otRef, handleOtAdded)

    return () => {
      unsubscribeAddOt()
      unsubscribeChangeOt()
    }
  }, [currentDateRange, fetchPatientInfo])

  // Calculate statistics
  const statistics = useMemo(() => {
    const totalOpdAmount = opdAppointments.reduce((sum, app) => sum + (Number(app.amount) || 0), 0)
    const totalIpdAmount = ipdAppointments.reduce((sum, app) => sum + app.totalDeposit, 0)

    const opdCash = opdAppointments.reduce((sum, app) => {
      return app.paymentMethod?.toLowerCase() === "cash" ? sum + (Number(app.amount) || 0) : sum
    }, 0)

    const opdOnline = opdAppointments.reduce((sum, app) => {
      return app.paymentMethod?.toLowerCase() === "online" ? sum + (Number(app.amount) || 0) : sum
    }, 0)

    const ipdCash = ipdAppointments.reduce((sum, app) => {
      return sum + app.payments.filter((p) => p.paymentType === "cash").reduce((s, p) => s + p.amount, 0)
    }, 0)

    const ipdOnline = ipdAppointments.reduce((sum, app) => {
      return sum + app.payments.filter((p) => p.paymentType === "online").reduce((s, p) => s + p.amount, 0)
    }, 0)

    return {
      totalOpdCount: opdAppointments.length,
      totalOpdAmount,
      totalIpdCount: ipdAppointments.length,
      totalIpdAmount,
      totalOtCount: otAppointments.length,
      opdCash,
      opdOnline,
      ipdCash,
      ipdOnline,
      totalRevenue: totalOpdAmount + totalIpdAmount,
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

  // Chart data
  const chartData = useMemo(() => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    const opdData = new Array(7).fill(0)
    const ipdData = new Array(7).fill(0)

    opdAppointments.forEach((app) => {
      const dayIndex = new Date(app.date).getDay()
      const adjustedIndex = dayIndex === 0 ? 6 : dayIndex - 1
      opdData[adjustedIndex]++
    })

    ipdAppointments.forEach((app) => {
      const dayIndex = new Date(app.admissionDate).getDay()
      const adjustedIndex = dayIndex === 0 ? 6 : dayIndex - 1
      ipdData[adjustedIndex]++
    })

    return {
      labels: days,
      datasets: [
        {
          label: "OPD Appointments",
          data: opdData,
          backgroundColor: "rgba(56, 189, 248, 0.6)",
          borderColor: "rgba(56, 189, 248, 1)",
          borderWidth: 1,
        },
        {
          label: "IPD Admissions",
          data: ipdData,
          backgroundColor: "rgba(251, 146, 60, 0.6)",
          borderColor: "rgba(251, 146, 60, 1)",
          borderWidth: 1,
        },
      ],
    }
  }, [opdAppointments, ipdAppointments])

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
          `patients/ipddetail/userdetailipd/${appointment.patientId}/${appointment.id.split("_")[1]}`,
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
                  <span className="text-sm text-gray-600">Revenue</span>
                  <span className="text-lg font-semibold text-orange-600">
                    {formatCurrency(statistics.totalIpdAmount)}
                  </span>
                </div>
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

            {/* Payment Breakdown and Chart */}
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
                        <span className="text-orange-700 font-medium">Total IPD</span>
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

              {/* Weekly Chart */}
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
                          Amount
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
                              <div className="text-sm font-medium text-gray-900">
                                {appointment.type === "IPD"
                                  ? formatCurrency(appointment.totalDeposit)
                                  : appointment.type === "OPD"
                                  ? formatCurrency(appointment.amount)
                                  : "-"}
                              </div>
                              {appointment.type === "IPD" && appointment.remainingAmount !== undefined && appointment.remainingAmount > 0 && (
                                <div className="text-xs text-red-500">
                                  Pending: {formatCurrency(appointment.remainingAmount)}
                                </div>
                              )}
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
                            <p className="text-sm text-gray-500">Doctor</p>
                            <p className="font-medium">{selectedAppointment.doctor}</p>
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

                    {/* OPD Specific Details */}
                    {selectedAppointment.type === "OPD" && (
                      <div className="bg-gradient-to-r from-sky-50 to-blue-50 rounded-lg p-6 mb-6">
                        <h3 className="text-lg font-semibold text-sky-800 mb-4">OPD Details</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <div>
                              <p className="text-sm text-gray-500">Time</p>
                              <p className="font-medium">{selectedAppointment.time || "-"}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Service</p>
                              <p className="font-medium">{selectedAppointment.serviceName || "-"}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Payment Method</p>
                              <p className="font-medium capitalize">{selectedAppointment.paymentMethod}</p>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <div>
                              <p className="text-sm text-gray-500">Amount</p>
                              <p className="font-bold text-xl text-sky-600">
                                {formatCurrency(selectedAppointment.amount)}
                              </p>
                            </div>
                            {selectedAppointment.discount && (
                              <div>
                                <p className="text-sm text-gray-500">Discount</p>
                                <p className="font-medium text-green-600">{selectedAppointment.discount}%</p>
                              </div>
                            )}
                            {selectedAppointment.originalAmount && (
                              <div>
                                <p className="text-sm text-gray-500">Original Amount</p>
                                <p className="font-medium text-gray-500 line-through">
                                  {formatCurrency(selectedAppointment.originalAmount)}
                                </p>
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
                                {selectedAppointment.remainingAmount !== undefined && selectedAppointment.remainingAmount > 0 && (
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
