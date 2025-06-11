"use client"

import type React from "react"
import { useState, useEffect, useMemo, useCallback } from "react"
import { db } from "../../lib/firebase"
import { ref, query, orderByChild, startAt, endAt, get, remove } from "firebase/database"
import { format, isSameDay, subDays, startOfDay, endOfDay } from "date-fns"
import { Line, Bar, Doughnut } from "react-chartjs-2"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js"
import {
  Search,
  Trash2,
  Eye,
  Users,
  CreditCard,
  Banknote,
  RefreshCw,
  Filter,
  IndianRupeeIcon,
  TrendingUp,
} from "lucide-react"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, ArcElement)

// Updated interface for new data structure
interface IOPDEntry {
  id: string // appointmentId
  uhid: string // patientId
  name: string
  phone: string
  age?: number
  address?: string
  gender?: string
  amount: number
  cashAmount: number
  onlineAmount: number
  discount: number
  doctorCharges: number
  createdAt: string
  date: string // ISO string
  doctor: string // Doctor ID
  doctorName: string
  message: string
  paymentMethod: string
  time: string
  appointmentType: string
  opdType: string
  enteredBy: string
  modality: string
  visitType?: string
  study?: string
  referredBy?: string
  lastModifiedAt?: string
  lastModifiedBy?: string
}

interface IDoctor {
  id: string
  name: string
  specialist?: string
  firstVisitCharge?: number
  followUpCharge?: number
}

interface PaymentSummary {
  totalCash: number
  totalOnline: number
  totalAmount: number
  totalDiscount: number
  netRevenue: number
}

interface DashboardStats {
  totalAppointments: number
  totalRevenue: number
  paymentBreakdown: PaymentSummary
  averageAmount: number
  topDoctors: Array<{ doctor: string; count: number; revenue: number }>
  modalityBreakdown: Array<{ modality: string; count: number; revenue: number }>
  visitTypeBreakdown: Array<{ visitType: string; count: number; revenue: number }>
  paymentMethodBreakdown: Array<{ method: string; count: number; amount: number }>
}

type DateFilter = "today" | "7days"

const AdminDashboardPage: React.FC = () => {
  const [dateFilter, setDateFilter] = useState<DateFilter>("7days")
  const [opdAppointments, setOpdAppointments] = useState<IOPDEntry[]>([])
  const [doctors, setDoctors] = useState<IDoctor[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [selectedAppointment, setSelectedAppointment] = useState<IOPDEntry | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [appointmentToDelete, setAppointmentToDelete] = useState<IOPDEntry | null>(null)

  // Fetch doctors
  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const doctorsRef = ref(db, "doctors")
        const snapshot = await get(doctorsRef)
        const data = snapshot.val()
        const doctorsList: IDoctor[] = []

        if (data) {
          Object.keys(data).forEach((key) => {
            const entry = data[key]
            doctorsList.push({
              id: key,
              name: entry.name,
              specialist: entry.specialist,
              firstVisitCharge: entry.firstVisitCharge,
              followUpCharge: entry.followUpCharge,
            })
          })
        }
        setDoctors(doctorsList)
      } catch (error) {
        console.error("Error fetching doctors:", error)
        toast.error("Failed to load doctors")
      }
    }

    fetchDoctors()
  }, [])

  // Get date range based on filter
  const getDateRange = useCallback((filter: DateFilter) => {
    const now = new Date()
    const today = startOfDay(now)

    switch (filter) {
      case "today":
        return {
          start: today.toISOString(),
          end: endOfDay(now).toISOString(),
        }
      case "7days":
        const sevenDaysAgo = startOfDay(subDays(now, 6)) // Last 7 days including today
        return {
          start: sevenDaysAgo.toISOString(),
          end: endOfDay(now).toISOString(),
        }
      default:
        return {
          start: today.toISOString(),
          end: endOfDay(now).toISOString(),
        }
    }
  }, [])

  // Fetch OPD appointments from new data structure
  const fetchOPDAppointments = useCallback(
    async (filter: DateFilter) => {
      const isRefresh = !loading
      if (isRefresh) setRefreshing(true)

      try {
        const dateRange = getDateRange(filter)
        const allAppointments: IOPDEntry[] = []

        // Get all patient UHIDs from the new structure
        const opdDetailRef = ref(db, "patients/opddetail")
        const uhidsSnapshot = await get(opdDetailRef)

        if (!uhidsSnapshot.exists()) {
          setOpdAppointments([])
          return
        }

        const uhidsData = uhidsSnapshot.val()
        const uhids = Object.keys(uhidsData)

        // Fetch appointments for each UHID within date range
        for (const uhid of uhids) {
          const userOpdRef = ref(db, `patients/opddetail/${uhid}`)
          const appointmentQuery = query(
            userOpdRef,
            orderByChild("date"),
            startAt(dateRange.start),
            endAt(dateRange.end),
          )

          const snapshot = await get(appointmentQuery)
          if (snapshot.exists()) {
            const appointmentsData = snapshot.val()
            Object.keys(appointmentsData).forEach((appointmentId) => {
              const appointment = appointmentsData[appointmentId]
              const payment = appointment.payment || {}

              allAppointments.push({
                id: appointmentId,
                uhid,
                name: appointment.name || "Unknown",
                phone: appointment.phone || "",
                age: appointment.age,
                address: appointment.address,
                gender: appointment.gender,
                amount: Number(payment.totalAmount) || 0,
                cashAmount: Number(payment.cashAmount) || 0,
                onlineAmount: Number(payment.onlineAmount) || 0,
                discount: Number(payment.discount) || 0,
                doctorCharges: Number(payment.doctorCharges) || 0,
                createdAt: appointment.createdAt,
                date: appointment.date,
                doctor: appointment.doctor,
                doctorName: appointment.doctorName || "",
                message: appointment.message || "",
                paymentMethod: payment.paymentMethod || "cash",
                time: appointment.time || "",
                appointmentType: appointment.appointmentType || "visithospital",
                opdType: appointment.opdType || "opd",
                enteredBy: appointment.enteredBy || "",
                modality: appointment.modality || "",
                visitType: appointment.visitType || "",
                study: appointment.study || "",
                referredBy: appointment.referredBy || "",
                lastModifiedAt: appointment.lastModifiedAt,
                lastModifiedBy: appointment.lastModifiedBy,
              })
            })
          }
        }

        // Sort by creation date (newest first)
        allAppointments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        setOpdAppointments(allAppointments)
      } catch (error) {
        console.error("Error fetching OPD appointments:", error)
        toast.error("Failed to load appointments")
      } finally {
        setLoading(false)
        if (isRefresh) setRefreshing(false)
      }
    },
    [getDateRange, loading],
  )

  // Initial load and filter changes
  useEffect(() => {
    fetchOPDAppointments(dateFilter)
  }, [dateFilter, fetchOPDAppointments])

  // Create doctor lookup map
  const doctorMap = useMemo(() => {
    const map: { [key: string]: string } = {}
    doctors.forEach((doctor) => {
      map[doctor.id] = doctor.name
    })
    return map
  }, [doctors])

  // Enhanced dashboard statistics calculation
  const dashboardStats = useMemo((): DashboardStats => {
    const paymentBreakdown: PaymentSummary = {
      totalCash: 0,
      totalOnline: 0,
      totalAmount: 0,
      totalDiscount: 0,
      netRevenue: 0,
    }

    const doctorStatsMap = new Map<string, { count: number; revenue: number }>()
    const modalityMap = new Map<string, { count: number; revenue: number }>()
    const visitTypeMap = new Map<string, { count: number; revenue: number }>()
    const paymentMethodMap = new Map<string, { count: number; amount: number }>()

    opdAppointments.forEach((appt) => {
      // Enhanced payment calculations
      paymentBreakdown.totalCash += appt.cashAmount
      paymentBreakdown.totalOnline += appt.onlineAmount
      paymentBreakdown.totalAmount += appt.amount
      paymentBreakdown.totalDiscount += appt.discount
      paymentBreakdown.netRevenue += appt.amount

      // Payment method breakdown
      const methodExisting = paymentMethodMap.get(appt.paymentMethod) || { count: 0, amount: 0 }
      paymentMethodMap.set(appt.paymentMethod, {
        count: methodExisting.count + 1,
        amount: methodExisting.amount + appt.amount,
      })

      // Doctor statistics
      const doctorName = doctorMap[appt.doctor] || "Unknown"
      const doctorExisting = doctorStatsMap.get(doctorName) || { count: 0, revenue: 0 }
      doctorStatsMap.set(doctorName, {
        count: doctorExisting.count + 1,
        revenue: doctorExisting.revenue + appt.amount,
      })

      // Modality statistics
      if (appt.modality) {
        const modalityExisting = modalityMap.get(appt.modality) || { count: 0, revenue: 0 }
        modalityMap.set(appt.modality, {
          count: modalityExisting.count + 1,
          revenue: modalityExisting.revenue + appt.amount,
        })
      }

      // Visit type statistics
      if (appt.visitType) {
        const visitTypeExisting = visitTypeMap.get(appt.visitType) || { count: 0, revenue: 0 }
        visitTypeMap.set(appt.visitType, {
          count: visitTypeExisting.count + 1,
          revenue: visitTypeExisting.revenue + appt.amount,
        })
      }
    })

    const topDoctors = Array.from(doctorStatsMap.entries())
      .map(([doctor, stats]) => ({ doctor, ...stats }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)

    const modalityBreakdown = Array.from(modalityMap.entries())
      .map(([modality, stats]) => ({ modality, ...stats }))
      .sort((a, b) => b.count - a.count)

    const visitTypeBreakdown = Array.from(visitTypeMap.entries())
      .map(([visitType, stats]) => ({ visitType, ...stats }))
      .sort((a, b) => b.count - a.count)

    const paymentMethodBreakdown = Array.from(paymentMethodMap.entries())
      .map(([method, stats]) => ({ method, ...stats }))
      .sort((a, b) => b.amount - a.amount)

    return {
      totalAppointments: opdAppointments.length,
      totalRevenue: paymentBreakdown.netRevenue,
      paymentBreakdown,
      averageAmount: opdAppointments.length > 0 ? paymentBreakdown.netRevenue / opdAppointments.length : 0,
      topDoctors,
      modalityBreakdown,
      visitTypeBreakdown,
      paymentMethodBreakdown,
    }
  }, [opdAppointments, doctorMap])

  // Chart data for appointments over time
  const appointmentChartData = useMemo(() => {
    const days = dateFilter === "today" ? [new Date()] : Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i))

    const appointmentCounts = days.map(
      (day) => opdAppointments.filter((appt) => isSameDay(new Date(appt.date), day)).length,
    )

    const revenueCounts = days.map((day) =>
      opdAppointments.filter((appt) => isSameDay(new Date(appt.date), day)).reduce((acc, appt) => acc + appt.amount, 0),
    )

    const cashCounts = days.map((day) =>
      opdAppointments
        .filter((appt) => isSameDay(new Date(appt.date), day))
        .reduce((acc, appt) => acc + appt.cashAmount, 0),
    )

    const onlineCounts = days.map((day) =>
      opdAppointments
        .filter((appt) => isSameDay(new Date(appt.date), day))
        .reduce((acc, appt) => acc + appt.onlineAmount, 0),
    )

    return {
      labels: days.map((day) => format(day, dateFilter === "today" ? "HH:mm" : "MMM dd")),
      appointmentCounts,
      revenueCounts,
      cashCounts,
      onlineCounts,
    }
  }, [opdAppointments, dateFilter])

  // Enhanced payment method chart data
  const paymentChartData = useMemo(() => {
    const { paymentBreakdown } = dashboardStats
    return {
      labels: ["Cash Collected", "Online Collected"],
      data: [paymentBreakdown.totalCash, paymentBreakdown.totalOnline],
      backgroundColor: ["rgba(34, 197, 94, 0.8)", "rgba(59, 130, 246, 0.8)"],
    }
  }, [dashboardStats])

  // Payment method breakdown chart
  const paymentMethodChartData = useMemo(() => {
    const { paymentMethodBreakdown } = dashboardStats
    const colors = [
      "rgba(34, 197, 94, 0.8)", // Green for cash
      "rgba(59, 130, 246, 0.8)", // Blue for online
      "rgba(168, 85, 247, 0.8)", // Purple for mixed
      "rgba(245, 158, 11, 0.8)", // Orange for card
      "rgba(239, 68, 68, 0.8)", // Red for UPI
    ]

    return {
      labels: paymentMethodBreakdown.map((p) => p.method.charAt(0).toUpperCase() + p.method.slice(1)),
      data: paymentMethodBreakdown.map((p) => p.amount),
      backgroundColor: colors.slice(0, paymentMethodBreakdown.length),
    }
  }, [dashboardStats])

  // Modality chart data
  const modalityChartData = useMemo(() => {
    const { modalityBreakdown } = dashboardStats
    return {
      labels: modalityBreakdown.map((m) => m.modality.charAt(0).toUpperCase() + m.modality.slice(1)),
      data: modalityBreakdown.map((m) => m.count),
      backgroundColor: [
        "rgba(239, 68, 68, 0.8)",
        "rgba(245, 158, 11, 0.8)",
        "rgba(16, 185, 129, 0.8)",
        "rgba(99, 102, 241, 0.8)",
      ],
    }
  }, [dashboardStats])

  // Filtered appointments for search
  const filteredAppointments = useMemo(() => {
    if (!searchQuery.trim()) return opdAppointments

    const query = searchQuery.toLowerCase()
    return opdAppointments.filter(
      (appt) =>
        appt.name.toLowerCase().includes(query) ||
        appt.phone.includes(query) ||
        appt.uhid.toLowerCase().includes(query) ||
        appt.modality.toLowerCase().includes(query),
    )
  }, [opdAppointments, searchQuery])

  // Format payment display for table
  const formatPaymentDisplay = (appointment: IOPDEntry) => {
    if (appointment.paymentMethod === "mixed") {
      return `₹${appointment.amount} (C:${appointment.cashAmount} + O:${appointment.onlineAmount})`
    }
    return `₹${appointment.amount}`
  }

  // Delete appointment
  const handleDeleteAppointment = async () => {
    if (!appointmentToDelete) return

    try {
      const opdRef = ref(db, `patients/opddetail/${appointmentToDelete.uhid}/${appointmentToDelete.id}`)
      await remove(opdRef)

      toast.success("Appointment deleted successfully!")
      setDeleteDialogOpen(false)
      setAppointmentToDelete(null)

      // Refresh data
      fetchOPDAppointments(dateFilter)
    } catch (error) {
      console.error("Error deleting appointment:", error)
      toast.error("Failed to delete appointment")
    }
  }

  // Refresh data
  const handleRefresh = () => {
    fetchOPDAppointments(dateFilter)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-xl text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">OPD Admin Dashboard</h1>
                <p className="text-gray-600">
                  {dateFilter === "today" ? "Today's" : "Last 7 days"} comprehensive payment & appointment analytics
                </p>
              </div>
              <div className="flex gap-3">
                <Select value={dateFilter} onValueChange={(value: DateFilter) => setDateFilter(value)}>
                  <SelectTrigger className="w-40">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="7days">Last 7 Days</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
                  <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </div>

          {/* Enhanced Payment Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-green-100">Total Cash Collected</CardTitle>
                <Banknote className="h-5 w-5 text-green-200" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">₹{dashboardStats.paymentBreakdown.totalCash.toLocaleString()}</div>
                <p className="text-xs text-green-100 mt-1">
                  {dashboardStats.totalRevenue > 0
                    ? Math.round((dashboardStats.paymentBreakdown.totalCash / dashboardStats.totalRevenue) * 100)
                    : 0}
                  % of total revenue
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-blue-100">Total Online Collected</CardTitle>
                <CreditCard className="h-5 w-5 text-blue-200" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  ₹{dashboardStats.paymentBreakdown.totalOnline.toLocaleString()}
                </div>
                <p className="text-xs text-blue-100 mt-1">
                  {dashboardStats.totalRevenue > 0
                    ? Math.round((dashboardStats.paymentBreakdown.totalOnline / dashboardStats.totalRevenue) * 100)
                    : 0}
                  % of total revenue
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-purple-100">Total Amount</CardTitle>
                <IndianRupeeIcon className="h-5 w-5 text-purple-200" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">₹{dashboardStats.totalRevenue.toLocaleString()}</div>
                <p className="text-xs text-purple-100 mt-1">Total collected amount</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Appointments</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboardStats.totalAppointments}</div>
                <p className="text-xs text-muted-foreground">Avg: ₹{Math.round(dashboardStats.averageAmount)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Enhanced Payment Collection Summary */}
          <Card className="mb-8 bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-emerald-800">
                <TrendingUp className="h-5 w-5" />
                Payment Collection Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center p-4 bg-white rounded-lg shadow-sm border border-emerald-100">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Banknote className="h-6 w-6 text-green-600" />
                    <span className="font-semibold text-gray-700">Cash Collection</span>
                  </div>
                  <div className="text-3xl font-bold text-green-700 mb-1">
                    ₹{dashboardStats.paymentBreakdown.totalCash.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-600">
                    {dashboardStats.paymentMethodBreakdown.find((p) => p.method === "cash")?.count || 0} transactions
                  </div>
                </div>

                <div className="text-center p-4 bg-white rounded-lg shadow-sm border border-blue-100">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <CreditCard className="h-6 w-6 text-blue-600" />
                    <span className="font-semibold text-gray-700">Online Collection</span>
                  </div>
                  <div className="text-3xl font-bold text-blue-700 mb-1">
                    ₹{dashboardStats.paymentBreakdown.totalOnline.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-600">
                    {dashboardStats.paymentMethodBreakdown
                      .filter((p) => p.method !== "cash")
                      .reduce((acc, p) => acc + p.count, 0)}{" "}
                    transactions
                  </div>
                </div>

                <div className="text-center p-4 bg-white rounded-lg shadow-sm border border-purple-100">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <IndianRupeeIcon className="h-6 w-6 text-purple-600" />
                    <span className="font-semibold text-gray-700">Total Revenue</span>
                  </div>
                  <div className="text-3xl font-bold text-purple-700 mb-1">
                    ₹{dashboardStats.totalRevenue.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-600">{dashboardStats.totalAppointments} appointments</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Enhanced Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Appointments Chart */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{dateFilter === "today" ? "Today's Appointments" : "Appointments (Last 7 Days)"}</CardTitle>
              </CardHeader>
              <CardContent>
                <Line
                  data={{
                    labels: appointmentChartData.labels,
                    datasets: [
                      {
                        label: "Appointments",
                        data: appointmentChartData.appointmentCounts,
                        borderColor: "rgb(59, 130, 246)",
                        backgroundColor: "rgba(59, 130, 246, 0.1)",
                        tension: 0.4,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    plugins: {
                      legend: { display: false },
                    },
                    scales: {
                      y: { beginAtZero: true },
                    },
                  }}
                />
              </CardContent>
            </Card>

            {/* Payment Collection Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Payment Collection</CardTitle>
              </CardHeader>
              <CardContent>
                <Doughnut
                  data={{
                    labels: paymentChartData.labels,
                    datasets: [
                      {
                        data: paymentChartData.data,
                        backgroundColor: paymentChartData.backgroundColor,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    plugins: {
                      legend: { position: "bottom" },
                    },
                  }}
                />
              </CardContent>
            </Card>
          </div>

          {/* Revenue and Payment Method Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Revenue Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Daily Revenue Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <Bar
                  data={{
                    labels: appointmentChartData.labels,
                    datasets: [
                      {
                        label: "Cash (₹)",
                        data: appointmentChartData.cashCounts,
                        backgroundColor: "rgba(34, 197, 94, 0.8)",
                        borderColor: "rgba(34, 197, 94, 1)",
                        borderWidth: 1,
                      },
                      {
                        label: "Online (₹)",
                        data: appointmentChartData.onlineCounts,
                        backgroundColor: "rgba(59, 130, 246, 0.8)",
                        borderColor: "rgba(59, 130, 246, 1)",
                        borderWidth: 1,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    plugins: {
                      legend: { position: "top" },
                    },
                    scales: {
                      x: { stacked: true },
                      y: { stacked: true, beginAtZero: true },
                    },
                  }}
                />
              </CardContent>
            </Card>

            {/* Payment Method Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Payment Method Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {dashboardStats.paymentMethodBreakdown.length > 0 ? (
                  <Doughnut
                    data={{
                      labels: paymentMethodChartData.labels,
                      datasets: [
                        {
                          data: paymentMethodChartData.data,
                          backgroundColor: paymentMethodChartData.backgroundColor,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: { position: "bottom" },
                      },
                    }}
                  />
                ) : (
                  <div className="text-center text-gray-500 py-8">No payment method data available</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Enhanced Analytics */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Top Doctors */}
            <Card>
              <CardHeader>
                <CardTitle>Top Doctors by Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {dashboardStats.topDoctors.map((doctor, index) => (
                    <div key={doctor.doctor} className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{index + 1}</Badge>
                        <span className="font-medium text-sm">{doctor.doctor}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-sm">₹{doctor.revenue.toLocaleString()}</div>
                        <div className="text-xs text-gray-500">{doctor.count} appointments</div>
                      </div>
                    </div>
                  ))}
                  {dashboardStats.topDoctors.length === 0 && (
                    <div className="text-center text-gray-500 py-4">No doctor data available</div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Modality Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Modality Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {dashboardStats.modalityBreakdown.length > 0 ? (
                  <Doughnut
                    data={{
                      labels: modalityChartData.labels,
                      datasets: [
                        {
                          data: modalityChartData.data,
                          backgroundColor: modalityChartData.backgroundColor,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: { position: "bottom" },
                      },
                    }}
                  />
                ) : (
                  <div className="text-center text-gray-500 py-8">No modality data available</div>
                )}
              </CardContent>
            </Card>

            {/* Payment Method Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Payment Method Stats</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {dashboardStats.paymentMethodBreakdown.map((method, index) => (
                    <div key={method.method} className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{index + 1}</Badge>
                        <span className="font-medium capitalize text-sm">{method.method}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-sm">₹{method.amount.toLocaleString()}</div>
                        <div className="text-xs text-gray-500">{method.count} transactions</div>
                      </div>
                    </div>
                  ))}
                  {dashboardStats.paymentMethodBreakdown.length === 0 && (
                    <div className="text-center text-gray-500 py-4">No payment method data available</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Enhanced Appointments Table */}
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <CardTitle>Recent Appointments</CardTitle>
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    placeholder="Search appointments..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredAppointments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {searchQuery ? "No matching appointments found" : "No appointments available"}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium">Patient</th>
                        <th className="text-left py-3 px-4 font-medium">Doctor</th>
                        <th className="text-left py-3 px-4 font-medium">Modality</th>
                        <th className="text-left py-3 px-4 font-medium">Payment</th>
                        <th className="text-left py-3 px-4 font-medium">Date</th>
                        <th className="text-left py-3 px-4 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAppointments.slice(0, 20).map((appt) => (
                        <tr key={`${appt.uhid}-${appt.id}`} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <div>
                              <div className="font-medium">{appt.name}</div>
                              <div className="text-sm text-gray-500">{appt.phone}</div>
                            </div>
                          </td>
                          <td className="py-3 px-4">{appt.doctorName || doctorMap[appt.doctor] || "Unknown"}</td>
                          <td className="py-3 px-4">
                            <Badge variant="outline" className="capitalize">
                              {appt.modality}
                            </Badge>
                            {appt.visitType && (
                              <Badge variant="secondary" className="ml-1 capitalize text-xs">
                                {appt.visitType}
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold">{formatPaymentDisplay(appt)}</div>
                            <div className="text-xs text-gray-500 flex items-center gap-1">
                              <Badge variant="outline" className="text-xs">
                                {appt.paymentMethod}
                              </Badge>
                              {appt.discount > 0 && <span className="text-green-600">(-₹{appt.discount})</span>}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div>{format(new Date(appt.date), "MMM dd, yyyy")}</div>
                            <div className="text-sm text-gray-500">{appt.time}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => setSelectedAppointment(appt)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setAppointmentToDelete(appt)
                                  setDeleteDialogOpen(true)
                                }}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredAppointments.length > 20 && (
                    <div className="text-center py-4 text-gray-500">
                      Showing first 20 of {filteredAppointments.length} appointments
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Enhanced Appointment Details Dialog */}
      <Dialog open={!!selectedAppointment} onOpenChange={() => setSelectedAppointment(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Appointment Details</DialogTitle>
            <DialogDescription>UHID: {selectedAppointment?.uhid}</DialogDescription>
          </DialogHeader>
          {selectedAppointment && (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-3 text-gray-800">Patient Information</h4>
                <div className="space-y-2 text-sm bg-gray-50 p-4 rounded-lg">
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Name:</span>
                    <span className="font-semibold">{selectedAppointment.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Phone:</span>
                    <span>{selectedAppointment.phone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">UHID:</span>
                    <span className="font-mono text-xs">{selectedAppointment.uhid}</span>
                  </div>
                  {selectedAppointment.age && (
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-600">Age:</span>
                      <span>{selectedAppointment.age}</span>
                    </div>
                  )}
                  {selectedAppointment.gender && (
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-600">Gender:</span>
                      <span className="capitalize">{selectedAppointment.gender}</span>
                    </div>
                  )}
                  {selectedAppointment.address && (
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-600">Address:</span>
                      <span>{selectedAppointment.address}</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-gray-800">Appointment Details</h4>
                <div className="space-y-2 text-sm bg-blue-50 p-4 rounded-lg">
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Doctor:</span>
                    <span className="font-semibold">
                      {selectedAppointment.doctorName || doctorMap[selectedAppointment.doctor] || "Unknown"}
                    </span>
                  </div>
                  {selectedAppointment.referredBy && (
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-600">Referred By:</span>
                      <span>{selectedAppointment.referredBy}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Type:</span>
                    <Badge variant="outline">{selectedAppointment.appointmentType}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Modality:</span>
                    <Badge variant="secondary" className="capitalize">
                      {selectedAppointment.modality}
                    </Badge>
                  </div>
                  {selectedAppointment.visitType && (
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-600">Visit Type:</span>
                      <Badge variant="outline" className="capitalize">
                        {selectedAppointment.visitType}
                      </Badge>
                    </div>
                  )}
                  {selectedAppointment.study && (
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-600">Study:</span>
                      <span className="text-xs">{selectedAppointment.study}</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-gray-800">Payment Information</h4>
                <div className="space-y-2 text-sm bg-green-50 p-4 rounded-lg">
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Method:</span>
                    <Badge variant="default" className="capitalize">
                      {selectedAppointment.paymentMethod}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Doctor Charges:</span>
                    <span className="font-semibold">₹{selectedAppointment.doctorCharges}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Cash Amount:</span>
                    <span className="font-semibold text-green-700">₹{selectedAppointment.cashAmount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Online Amount:</span>
                    <span className="font-semibold text-blue-700">₹{selectedAppointment.onlineAmount}</span>
                  </div>
                  {selectedAppointment.discount > 0 && (
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-600">Discount:</span>
                      <span className="text-red-600 font-semibold">₹{selectedAppointment.discount}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-2">
                    <span className="font-medium text-gray-600">Total Amount:</span>
                    <span className="font-bold text-lg">₹{selectedAppointment.amount}</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3 text-gray-800">Schedule</h4>
                <div className="space-y-2 text-sm bg-purple-50 p-4 rounded-lg">
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Date:</span>
                    <span className="font-semibold">{format(new Date(selectedAppointment.date), "PPP")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Time:</span>
                    <span className="font-semibold">{selectedAppointment.time}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-600">Created:</span>
                    <span className="text-xs">{format(new Date(selectedAppointment.createdAt), "PPp")}</span>
                  </div>
                  {selectedAppointment.enteredBy && (
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-600">Entered By:</span>
                      <span className="text-xs">{selectedAppointment.enteredBy}</span>
                    </div>
                  )}
                  {selectedAppointment.lastModifiedAt && (
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-600">Last Modified:</span>
                      <span className="text-xs">{format(new Date(selectedAppointment.lastModifiedAt), "PPp")}</span>
                    </div>
                  )}
                  {selectedAppointment.lastModifiedBy && (
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-600">Modified By:</span>
                      <span className="text-xs">{selectedAppointment.lastModifiedBy}</span>
                    </div>
                  )}
                </div>
              </div>

              {selectedAppointment.message && (
                <div className="col-span-2">
                  <h4 className="font-semibold mb-3 text-gray-800">Additional Notes</h4>
                  <div className="text-sm bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                    <p className="text-gray-700">{selectedAppointment.message}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Appointment</AlertDialogTitle>
            <div className="text-sm text-gray-600">
              Are you sure you want to delete the appointment for <strong>{appointmentToDelete?.name}</strong>? This
              action cannot be undone.
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAppointmentToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAppointment} className="bg-red-500 hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default AdminDashboardPage
