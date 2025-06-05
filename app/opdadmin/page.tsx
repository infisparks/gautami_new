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
import { Search, Trash2, Eye, DollarSign, Users, CreditCard, Banknote, RefreshCw, Filter } from "lucide-react"
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
  serviceName: string
  amount: number
  originalAmount: number
  discount: number
  createdAt: string
  date: string // ISO string
  doctor: string // Doctor ID
  message: string
  paymentMethod: string
  time: string
  appointmentType: string
  opdType: string
  enteredBy: string
}

interface IDoctor {
  id: string
  name: string
  opdCharge?: number
  specialty?: string
}

interface PaymentSummary {
  cash: number
  online: number
  card: number
  upi: number
  total: number
}

interface DashboardStats {
  totalAppointments: number
  totalRevenue: number
  paymentBreakdown: PaymentSummary
  averageAmount: number
  topServices: Array<{ service: string; count: number; revenue: number }>
  topDoctors: Array<{ doctor: string; count: number; revenue: number }>
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
              opdCharge: entry.opdCharge,
              specialty: entry.specialty,
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

        // Get all patient UHIDs from opddetail
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
              allAppointments.push({
                id: appointmentId,
                uhid,
                name: appointment.name || "Unknown",
                phone: appointment.phone || "",
                serviceName: appointment.serviceName || "",
                amount: Number(appointment.amount) || 0,
                originalAmount: Number(appointment.originalAmount) || Number(appointment.amount) || 0,
                discount: Number(appointment.discount) || 0,
                createdAt: appointment.createdAt,
                date: appointment.date,
                doctor: appointment.doctor,
                message: appointment.message || "",
                paymentMethod: appointment.paymentMethod || "cash",
                time: appointment.time || "",
                appointmentType: appointment.appointmentType || "visithospital",
                opdType: appointment.opdType || "opd",
                enteredBy: appointment.enteredBy || "",
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

  // Calculate dashboard statistics
  const dashboardStats = useMemo((): DashboardStats => {
    const paymentBreakdown: PaymentSummary = {
      cash: 0,
      online: 0,
      card: 0,
      upi: 0,
      total: 0,
    }

    const serviceMap = new Map<string, { count: number; revenue: number }>()
    const doctorStatsMap = new Map<string, { count: number; revenue: number }>()

    opdAppointments.forEach((appt) => {
      // Payment breakdown
      const method = appt.paymentMethod.toLowerCase()
      if (method in paymentBreakdown) {
        paymentBreakdown[method as keyof PaymentSummary] += appt.amount
      }
      paymentBreakdown.total += appt.amount

      // Service statistics
      const existing = serviceMap.get(appt.serviceName) || { count: 0, revenue: 0 }
      serviceMap.set(appt.serviceName, {
        count: existing.count + 1,
        revenue: existing.revenue + appt.amount,
      })

      // Doctor statistics
      const doctorName = doctorMap[appt.doctor] || "Unknown"
      const doctorExisting = doctorStatsMap.get(doctorName) || { count: 0, revenue: 0 }
      doctorStatsMap.set(doctorName, {
        count: doctorExisting.count + 1,
        revenue: doctorExisting.revenue + appt.amount,
      })
    })

    const topServices = Array.from(serviceMap.entries())
      .map(([service, stats]) => ({ service, ...stats }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)

    const topDoctors = Array.from(doctorStatsMap.entries())
      .map(([doctor, stats]) => ({ doctor, ...stats }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)

    return {
      totalAppointments: opdAppointments.length,
      totalRevenue: paymentBreakdown.total,
      paymentBreakdown,
      averageAmount: opdAppointments.length > 0 ? paymentBreakdown.total / opdAppointments.length : 0,
      topServices,
      topDoctors,
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

    return {
      labels: days.map((day) => format(day, dateFilter === "today" ? "HH:mm" : "MMM dd")),
      appointmentCounts,
      revenueCounts,
    }
  }, [opdAppointments, dateFilter])

  // Payment method chart data
  const paymentChartData = useMemo(() => {
    const { paymentBreakdown } = dashboardStats
    return {
      labels: ["Cash", "Online", "Card", "UPI"],
      data: [paymentBreakdown.cash, paymentBreakdown.online, paymentBreakdown.card, paymentBreakdown.upi],
      backgroundColor: [
        "rgba(34, 197, 94, 0.8)",
        "rgba(59, 130, 246, 0.8)",
        "rgba(168, 85, 247, 0.8)",
        "rgba(249, 115, 22, 0.8)",
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
        appt.serviceName.toLowerCase().includes(query) ||
        appt.uhid.toLowerCase().includes(query),
    )
  }, [opdAppointments, searchQuery])

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
                  {dateFilter === "today" ? "Today's" : "Last 7 days"} appointments and revenue analytics
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

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Appointments</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboardStats.totalAppointments}</div>
                <p className="text-xs text-muted-foreground">
                  {dateFilter === "today" ? "appointments today" : "in last 7 days"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">₹{dashboardStats.totalRevenue.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Avg: ₹{Math.round(dashboardStats.averageAmount)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Cash Payments</CardTitle>
                <Banknote className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">₹{dashboardStats.paymentBreakdown.cash.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {dashboardStats.totalRevenue > 0
                    ? Math.round((dashboardStats.paymentBreakdown.cash / dashboardStats.totalRevenue) * 100)
                    : 0}
                  % of total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Online Payments</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">₹{dashboardStats.paymentBreakdown.online.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {dashboardStats.totalRevenue > 0
                    ? Math.round((dashboardStats.paymentBreakdown.online / dashboardStats.totalRevenue) * 100)
                    : 0}
                  % of total
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
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

            {/* Payment Methods Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Payment Methods</CardTitle>
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

          {/* Revenue Chart */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>{dateFilter === "today" ? "Today's Revenue" : "Revenue (Last 7 Days)"}</CardTitle>
            </CardHeader>
            <CardContent>
              <Bar
                data={{
                  labels: appointmentChartData.labels,
                  datasets: [
                    {
                      label: "Revenue (₹)",
                      data: appointmentChartData.revenueCounts,
                      backgroundColor: "rgba(34, 197, 94, 0.8)",
                      borderColor: "rgba(34, 197, 94, 1)",
                      borderWidth: 1,
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

          {/* Top Services and Doctors */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <Card>
              <CardHeader>
                <CardTitle>Top Services</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {dashboardStats.topServices.map((service, index) => (
                    <div key={service.service} className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{index + 1}</Badge>
                        <span className="font-medium">{service.service}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">₹{service.revenue.toLocaleString()}</div>
                        <div className="text-sm text-gray-500">{service.count} appointments</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Doctors</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {dashboardStats.topDoctors.map((doctor, index) => (
                    <div key={doctor.doctor} className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{index + 1}</Badge>
                        <span className="font-medium">{doctor.doctor}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">₹{doctor.revenue.toLocaleString()}</div>
                        <div className="text-sm text-gray-500">{doctor.count} appointments</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search and Appointments Table */}
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
                        <th className="text-left py-3 px-4 font-medium">Service</th>
                        <th className="text-left py-3 px-4 font-medium">Doctor</th>
                        <th className="text-left py-3 px-4 font-medium">Amount</th>
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
                          <td className="py-3 px-4">{appt.serviceName}</td>
                          <td className="py-3 px-4">{doctorMap[appt.doctor] || "Unknown"}</td>
                          <td className="py-3 px-4">
                            <div className="font-semibold">₹{appt.amount}</div>
                            {appt.discount > 0 && (
                              <div className="text-sm text-gray-500">
                                (₹{appt.originalAmount} - ₹{appt.discount})
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant="outline">{appt.paymentMethod}</Badge>
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

      {/* Appointment Details Dialog */}
      <Dialog open={!!selectedAppointment} onOpenChange={() => setSelectedAppointment(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Appointment Details</DialogTitle>
            <DialogDescription>UHID: {selectedAppointment?.uhid}</DialogDescription>
          </DialogHeader>
          {selectedAppointment && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold mb-2">Patient Information</h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">Name:</span> {selectedAppointment.name}
                  </div>
                  <div>
                    <span className="font-medium">Phone:</span> {selectedAppointment.phone}
                  </div>
                  <div>
                    <span className="font-medium">UHID:</span> {selectedAppointment.uhid}
                  </div>
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Appointment Details</h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">Service:</span> {selectedAppointment.serviceName}
                  </div>
                  <div>
                    <span className="font-medium">Doctor:</span> {doctorMap[selectedAppointment.doctor] || "Unknown"}
                  </div>
                  <div>
                    <span className="font-medium">Type:</span> {selectedAppointment.appointmentType}
                  </div>
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Payment Information</h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">Amount:</span> ₹{selectedAppointment.amount}
                  </div>
                  <div>
                    <span className="font-medium">Original:</span> ₹{selectedAppointment.originalAmount}
                  </div>
                  <div>
                    <span className="font-medium">Discount:</span> ₹{selectedAppointment.discount}
                  </div>
                  <div>
                    <span className="font-medium">Method:</span> {selectedAppointment.paymentMethod}
                  </div>
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Schedule</h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">Date:</span> {format(new Date(selectedAppointment.date), "PPP")}
                  </div>
                  <div>
                    <span className="font-medium">Time:</span> {selectedAppointment.time}
                  </div>
                  <div>
                    <span className="font-medium">Created:</span>{" "}
                    {format(new Date(selectedAppointment.createdAt), "PPp")}
                  </div>
                </div>
              </div>
              {selectedAppointment.message && (
                <div className="col-span-2">
                  <h4 className="font-semibold mb-2">Notes</h4>
                  <p className="text-sm bg-gray-50 p-3 rounded">{selectedAppointment.message}</p>
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
