"use client"

import { useState, useEffect } from "react"
import { db } from "@/lib/firebase"
import { ref, get } from "firebase/database"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import {
  Search,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
  ArrowUpDown,
  X,
  RefreshCw,
  Filter,
  FileText,
  Clock,
  User,
  CreditCard,
  Phone,
  Clipboard,
  AlertCircle,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { EditButton } from "./edit-button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"

interface Appointment {
  id: string
  patientId: string
  name: string
  phone: string
  date: string
  time: string
  doctor?: string
  appointmentType: string
  modalities: any[]
  createdAt: string
  payment?: {
    totalCharges: number
    totalPaid: number
    discount: number
    paymentMethod: string
  }
}

export default function ManageOPDPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [filteredAppointments, setFilteredAppointments] = useState<Appointment[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [dateFilter, setDateFilter] = useState<string>("")
  const [doctorFilter, setDoctorFilter] = useState<string>("all")
  const [appointmentTypeFilter, setAppointmentTypeFilter] = useState<string>("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" }>({
    key: "date",
    direction: "desc",
  })
  const [error, setError] = useState<string | null>(null)
  const [availableDoctors, setAvailableDoctors] = useState<string[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [activeFilters, setActiveFilters] = useState(0)
  const [activeTab, setActiveTab] = useState("all")

  const itemsPerPage = 10

  // Calculate active filters
  useEffect(() => {
    let count = 0
    if (searchTerm) count++
    if (dateFilter) count++
    if (doctorFilter !== "all") count++
    if (appointmentTypeFilter !== "all") count++
    setActiveFilters(count)
  }, [searchTerm, dateFilter, doctorFilter, appointmentTypeFilter])

  // Fetch appointments
  useEffect(() => {
    const fetchAppointments = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const patientsRef = ref(db, "patients/patientinfo")
        const patientsSnapshot = await get(patientsRef)
        const patientsData = patientsSnapshot.val() || {}

        const allAppointments: Appointment[] = []
        const doctorSet = new Set<string>()

        for (const patientId in patientsData) {
          const appointmentsRef = ref(db, `patients/opddetail/${patientId}`)
          const appointmentsSnapshot = await get(appointmentsRef)
          const appointmentsData = appointmentsSnapshot.val() || {}

          for (const appointmentId in appointmentsData) {
            const appointment = appointmentsData[appointmentId]
            if (appointment.doctor) doctorSet.add(appointment.doctor)

            allAppointments.push({
              id: appointmentId,
              patientId,
              name: appointment.name || patientsData[patientId].name || "Unknown",
              phone: appointment.phone || patientsData[patientId].phone || "",
              date: appointment.date || "",
              time: appointment.time || "",
              doctor: appointment.doctor || "",
              appointmentType: appointment.appointmentType || "visithospital",
              modalities: appointment.modalities || [],
              createdAt: appointment.createdAt || "",
              payment: appointment.payment || {
                totalCharges: 0,
                totalPaid: 0,
                discount: 0,
                paymentMethod: "cash",
              },
            })
          }
        }

        allAppointments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

        setAppointments(allAppointments)
        setFilteredAppointments(allAppointments)
        setAvailableDoctors(Array.from(doctorSet))
      } catch (err) {
        console.error("Error fetching appointments:", err)
        setError("Failed to load appointments. Please try again.")
      } finally {
        setIsLoading(false)
      }
    }

    fetchAppointments()
  }, [])

  // Refresh handler (same logic as fetch)
  const handleRefresh = async () => {
    setIsRefreshing(true)
    setSelectedAppointment(null)
    try {
      const patientsRef = ref(db, "patients/patientinfo")
      const patientsSnapshot = await get(patientsRef)
      const patientsData = patientsSnapshot.val() || {}

      const allAppointments: Appointment[] = []
      const doctorSet = new Set<string>()

      for (const patientId in patientsData) {
        const appointmentsRef = ref(db, `patients/opddetail/${patientId}`)
        const appointmentsSnapshot = await get(appointmentsRef)
        const appointmentsData = appointmentsSnapshot.val() || {}

        for (const appointmentId in appointmentsData) {
          const appointment = appointmentsData[appointmentId]
          if (appointment.doctor) doctorSet.add(appointment.doctor)

          allAppointments.push({
            id: appointmentId,
            patientId,
            name: appointment.name || patientsData[patientId].name || "Unknown",
            phone: appointment.phone || patientsData[patientId].phone || "",
            date: appointment.date || "",
            time: appointment.time || "",
            doctor: appointment.doctor || "",
            appointmentType: appointment.appointmentType || "visithospital",
            modalities: appointment.modalities || [],
            createdAt: appointment.createdAt || "",
            payment: appointment.payment || {
              totalCharges: 0,
              totalPaid: 0,
              discount: 0,
              paymentMethod: "cash",
            },
          })
        }
      }

      allAppointments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      setAppointments(allAppointments)
      setFilteredAppointments(allAppointments)
      setAvailableDoctors(Array.from(doctorSet))

      // reset filters
      setSearchTerm("")
      setDateFilter("")
      setDoctorFilter("all")
      setAppointmentTypeFilter("all")
      setCurrentPage(1)
    } catch (err) {
      console.error("Error refreshing appointments:", err)
      setError("Failed to refresh appointments. Please try again.")
    } finally {
      setIsRefreshing(false)
    }
  }

  // Filtering & sorting
  useEffect(() => {
    let filtered = [...appointments]
    const term = searchTerm.toLowerCase()

    // Apply tab filter first
    if (activeTab === "today") {
      const today = new Date().toISOString().split("T")[0]
      filtered = filtered.filter((app) => {
        const appDate = new Date(app.date).toISOString().split("T")[0]
        return appDate === today
      })
    } else if (activeTab === "upcoming") {
      const today = new Date().toISOString().split("T")[0]
      filtered = filtered.filter((app) => {
        const appDate = new Date(app.date).toISOString().split("T")[0]
        return appDate > today
      })
    } else if (activeTab === "past") {
      const today = new Date().toISOString().split("T")[0]
      filtered = filtered.filter((app) => {
        const appDate = new Date(app.date).toISOString().split("T")[0]
        return appDate < today
      })
    }

    // Apply other filters
    if (searchTerm) {
      filtered = filtered.filter(
        (app) =>
          app.name.toLowerCase().includes(term) ||
          app.phone.includes(term) ||
          app.patientId.toLowerCase().includes(term),
      )
    }
    if (dateFilter) {
      filtered = filtered.filter((app) => {
        const appDate = new Date(app.date).toISOString().split("T")[0]
        return appDate === dateFilter
      })
    }
    if (doctorFilter !== "all") {
      filtered = filtered.filter((app) => app.doctor === doctorFilter)
    }
    if (appointmentTypeFilter !== "all") {
      filtered = filtered.filter((app) => app.appointmentType === appointmentTypeFilter)
    }

    filtered.sort((a, b) => {
      const { key, direction } = sortConfig
      if (key === "date") {
        const da = new Date(a.date).getTime()
        const db = new Date(b.date).getTime()
        return direction === "asc" ? da - db : db - da
      }
      const va = (a as any)[key]
      const vb = (b as any)[key]
      if (typeof va === "string" && typeof vb === "string") {
        return direction === "asc" ? va.localeCompare(vb) : vb.localeCompare(va)
      }
      return 0
    })

    setFilteredAppointments(filtered)
    setCurrentPage(1)
  }, [searchTerm, dateFilter, doctorFilter, appointmentTypeFilter, sortConfig, appointments, activeTab])

  // Pagination
  const totalPages = Math.ceil(filteredAppointments.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentAppointments = filteredAppointments.slice(startIndex, endIndex)

  // Helpers
  const handleSort = (key: string) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }))
  }
  const viewAppointmentDetails = (appointment: Appointment) => setSelectedAppointment(appointment)
  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "dd/MM/yyyy")
    } catch {
      return dateStr
    }
  }
  const calculateTotalAmount = (app: Appointment) =>
    app.payment?.totalPaid ?? app.modalities.reduce((sum, m) => sum + (m.charges || 0), 0)
  const clearFilters = () => {
    setSearchTerm("")
    setDateFilter("")
    setDoctorFilter("all")
    setAppointmentTypeFilter("all")
  }
  const closeDetails = () => setSelectedAppointment(null)

  // Get payment status badge
  const getPaymentStatusBadge = (app: Appointment) => {
    if (!app.payment) return <Badge variant="outline">No Payment</Badge>

    const { totalCharges, totalPaid } = app.payment

    if (totalPaid >= totalCharges) {
      return (
        <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-200">
          Paid
        </Badge>
      )
    } else if (totalPaid > 0) {
      return (
        <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-200">
          Partial
        </Badge>
      )
    } else {
      return (
        <Badge variant="destructive" className="bg-red-100 text-red-800 hover:bg-red-200">
          Unpaid
        </Badge>
      )
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-primary rounded-lg flex items-center justify-center">
              <Calendar className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">OPD Management</h1>
              <p className="text-sm text-gray-500">View and manage outpatient appointments</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" onClick={() => router.push("/opd")} className="hidden md:flex gap-2">
                    <Calendar className="h-4 w-4" />
                    New Appointment
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Schedule a new appointment</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="default" onClick={handleRefresh} disabled={isRefreshing} className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                    {isRefreshing ? "Refreshing..." : "Refresh"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh appointment data</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6">
          {selectedAppointment ? (
            // Details view
            <Card className="overflow-hidden border border-slate-200 shadow-md">
              <CardHeader className="flex flex-row justify-between items-center pb-2 bg-slate-50 border-b">
                <div>
                  <CardTitle className="text-xl font-bold flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Appointment Details
                  </CardTitle>
                  <CardDescription>View complete information about this appointment</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={closeDetails} className="h-9">
                    <X className="h-4 w-4 mr-2" /> Close
                  </Button>
                  <EditButton
                    uhid={selectedAppointment.patientId}
                    appointmentId={selectedAppointment.id}
                    className="h-9"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Patient & Appointment Info */}
                  <div className="space-y-6">
                    <div className="bg-blue-50 p-5 rounded-lg border border-blue-100">
                      <h3 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Patient Information
                      </h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500 mb-1">Name</p>
                          <p className="font-medium text-gray-900">{selectedAppointment.name}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 mb-1">Phone</p>
                          <p className="font-medium text-gray-900 flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {selectedAppointment.phone}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500 mb-1">UHID</p>
                          <p className="font-medium text-gray-900 flex items-center gap-1">
                            <Clipboard className="h-3 w-3" />
                            {selectedAppointment.patientId}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500 mb-1">Appointment ID</p>
                          <p className="font-medium text-gray-900">{selectedAppointment.id.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-green-50 p-5 rounded-lg border border-green-100">
                      <h3 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Appointment Details
                      </h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500 mb-1">Date</p>
                          <p className="font-medium text-gray-900">{formatDate(selectedAppointment.date)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 mb-1">Time</p>
                          <p className="font-medium text-gray-900 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {selectedAppointment.time}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500 mb-1">Doctor</p>
                          <p className="font-medium text-gray-900">
                            {selectedAppointment.doctor || "No doctor assigned"}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500 mb-1">Type</p>
                          <Badge
                            variant={selectedAppointment.appointmentType === "visithospital" ? "default" : "secondary"}
                          >
                            {selectedAppointment.appointmentType === "visithospital" ? "Visit Hospital" : "On Call"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Services & Payment */}
                  <div className="space-y-6">
                    <div className="bg-purple-50 p-5 rounded-lg border border-purple-100">
                      <h3 className="font-semibold text-purple-800 mb-3 flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        Services & Payment
                      </h3>
                      <div className="space-y-4">
                        <div className="text-sm">
                          <p className="text-gray-500 mb-2">Services</p>
                          <div className="flex flex-wrap gap-2">
                            {selectedAppointment.modalities.length > 0 ? (
                              selectedAppointment.modalities.map((m, i) => (
                                <Badge key={i} variant="outline" className="bg-white border-purple-200">
                                  {m.type}
                                  {m.service ? `: ${m.service}` : ""}
                                  {m.charges ? ` - ₹${m.charges}` : ""}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-gray-400 italic">No services recorded</span>
                            )}
                          </div>
                        </div>

                        <Separator className="my-3 bg-purple-200" />

                        {selectedAppointment.payment && (
                          <div>
                            <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                              <div>
                                <p className="text-gray-500 mb-1">Total Charges</p>
                                <p className="font-medium text-gray-900">₹{selectedAppointment.payment.totalCharges}</p>
                              </div>
                              <div>
                                <p className="text-gray-500 mb-1">Discount</p>
                                <p className="font-medium text-red-600">₹{selectedAppointment.payment.discount}</p>
                              </div>
                              <div>
                                <p className="text-gray-500 mb-1">Payment Method</p>
                                <p className="font-medium capitalize text-gray-900">
                                  {selectedAppointment.payment.paymentMethod}
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-500 mb-1">Amount Paid</p>
                                <p className="font-medium text-green-600">₹{selectedAppointment.payment.totalPaid}</p>
                              </div>
                            </div>

                            <div className="bg-white p-3 rounded-md border border-purple-200">
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-medium">Payment Status</span>
                                {getPaymentStatusBadge(selectedAppointment)}
                              </div>

                              {selectedAppointment.payment.totalPaid < selectedAppointment.payment.totalCharges && (
                                <div className="mt-2 text-xs text-gray-500">
                                  Balance: ₹
                                  {selectedAppointment.payment.totalCharges - selectedAppointment.payment.totalPaid}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="bg-slate-50 border-t p-4 flex justify-end">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={closeDetails}>
                    Back to List
                  </Button>
                  <EditButton uhid={selectedAppointment.patientId} appointmentId={selectedAppointment.id} />
                </div>
              </CardFooter>
            </Card>
          ) : (
            // List view
            <>
              {/* Tabs */}
              <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex justify-between items-center mb-4">
                  <TabsList className="bg-slate-100">
                    <TabsTrigger value="all" className="data-[state=active]:bg-white">
                      All Appointments
                    </TabsTrigger>
                    <TabsTrigger value="today" className="data-[state=active]:bg-white">
                      Today
                    </TabsTrigger>
                    <TabsTrigger value="upcoming" className="data-[state=active]:bg-white">
                      Upcoming
                    </TabsTrigger>
                    <TabsTrigger value="past" className="data-[state=active]:bg-white">
                      Past
                    </TabsTrigger>
                  </TabsList>

                  <Button variant="outline" onClick={() => router.push("/opd")} className="md:hidden gap-2">
                    <Calendar className="h-4 w-4" />
                    New
                  </Button>
                </div>

                <TabsContent value="all" className="mt-0">
                  {/* Filters */}
                  <Card className="mb-6 border border-slate-200 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Filter className="h-4 w-4" />
                        Filters
                        {activeFilters > 0 && (
                          <Badge variant="secondary" className="ml-2">
                            {activeFilters} active
                          </Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4">
                      <div className="grid md:grid-cols-4 gap-4">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input
                            placeholder="Search by name, phone or UHID"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input
                            type="date"
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                        <Select value={doctorFilter} onValueChange={setDoctorFilter}>
                          <SelectTrigger>
                            <SelectValue placeholder="Filter by doctor" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Doctors</SelectItem>
                            {availableDoctors.map((d) => (
                              <SelectItem key={d} value={d}>
                                {d}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={appointmentTypeFilter} onValueChange={setAppointmentTypeFilter}>
                          <SelectTrigger>
                            <SelectValue placeholder="Filter by type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            <SelectItem value="visithospital">Visit Hospital</SelectItem>
                            <SelectItem value="oncall">On Call</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {activeFilters > 0 && (
                        <div className="flex justify-between items-center mt-4 pt-4 border-t">
                          <div className="text-sm text-gray-500">{filteredAppointments.length} appointments found</div>
                          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 gap-1">
                            <X className="h-3 w-3" /> Clear Filters
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Table */}
                  <Card className="border border-slate-200 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Appointments
                      </CardTitle>
                      <CardDescription>
                        {activeTab === "all"
                          ? "All appointments"
                          : activeTab === "today"
                            ? "Today's appointments"
                            : activeTab === "upcoming"
                              ? "Upcoming appointments"
                              : "Past appointments"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {isLoading ? (
                        <div className="space-y-2">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-16 w-full" />
                          ))}
                        </div>
                      ) : filteredAppointments.length === 0 ? (
                        <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed">
                          <Calendar className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                          <p className="text-gray-500 font-medium">No appointments found</p>
                          <p className="text-gray-400 text-sm mb-4">
                            Try adjusting your filters or create a new appointment
                          </p>
                          <div className="flex justify-center gap-3">
                            <Button variant="outline" onClick={clearFilters} className="gap-2">
                              <X className="h-4 w-4" /> Clear filters
                            </Button>
                            <Button onClick={() => router.push("/opd")} className="gap-2">
                              <Calendar className="h-4 w-4" /> New Appointment
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="rounded-md border overflow-hidden">
                            <Table>
                              <TableHeader className="bg-slate-50">
                                <TableRow>
                                  <TableHead className="w-[200px]">
                                    <Button
                                      variant="ghost"
                                      onClick={() => handleSort("name")}
                                      className="flex items-center gap-1 p-0 h-auto font-medium"
                                    >
                                      Patient <ArrowUpDown className="h-3 w-3" />
                                    </Button>
                                  </TableHead>
                                  <TableHead>
                                    <Button
                                      variant="ghost"
                                      onClick={() => handleSort("date")}
                                      className="flex items-center gap-1 p-0 h-auto font-medium"
                                    >
                                      Date <ArrowUpDown className="h-3 w-3" />
                                    </Button>
                                  </TableHead>
                                  {/* <TableHead>Doctor</TableHead> */}
                                  <TableHead>Type</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead className="text-right">Amount</TableHead>
                                  <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {currentAppointments.map((app) => (
                                  <TableRow key={`${app.patientId}-${app.id}`} className="hover:bg-slate-50">
                                    <TableCell className="font-medium">
                                      <div>
                                        {app.name}
                                        <div className="text-xs text-gray-500 flex items-center gap-1">
                                          <Phone className="h-3 w-3" /> {app.phone}
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div>
                                        <div className="font-medium">{formatDate(app.date)}</div>
                                        <div className="text-xs text-gray-500 flex items-center gap-1">
                                          <Clock className="h-3 w-3" /> {app.time}
                                        </div>
                                      </div>
                                    </TableCell>
                                    {/* <TableCell>
                                      {app.doctor || <span className="text-gray-400 italic">Not assigned</span>}
                                    </TableCell> */}
                                    <TableCell>
                                      <Badge
                                        variant={app.appointmentType === "visithospital" ? "default" : "secondary"}
                                        className={
                                          app.appointmentType === "visithospital"
                                            ? "bg-blue-100 text-blue-800 hover:bg-blue-200"
                                            : "bg-purple-100 text-purple-800 hover:bg-purple-200"
                                        }
                                      >
                                        {app.appointmentType === "visithospital" ? "Visit" : "On Call"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>{getPaymentStatusBadge(app)}</TableCell>
                                    <TableCell className="text-right font-medium">
                                      ₹{calculateTotalAmount(app)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex justify-end gap-2">
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => viewAppointmentDetails(app)}
                                                className="h-8 w-8"
                                              >
                                                <Eye className="h-4 w-4" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>View details</TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>

                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <EditButton
                                                uhid={app.patientId}
                                                appointmentId={app.id}
                                                className="h-8 w-8 p-0"
                                              />
                                            </TooltipTrigger>
                                            <TooltipContent>Edit appointment</TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>

                          {/* Pagination */}
                          {totalPages > 1 && (
                            <div className="flex items-center justify-between mt-4 pt-4 border-t">
                              <div className="text-sm text-gray-500">
                                Showing {startIndex + 1}-{Math.min(endIndex, filteredAppointments.length)} of{" "}
                                {filteredAppointments.length} appointments
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                                  disabled={currentPage === 1}
                                  className="h-8 w-8 p-0"
                                >
                                  <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <div className="text-sm font-medium">
                                  Page {currentPage} of {totalPages}
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                                  disabled={currentPage === totalPages}
                                  className="h-8 w-8 p-0"
                                >
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="today" className="mt-0">
                  {/* Same content structure as "all" tab */}
                  {/* Filters */}
                  <Card className="mb-6 border border-slate-200 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Filter className="h-4 w-4" />
                        Filters
                        {activeFilters > 0 && (
                          <Badge variant="secondary" className="ml-2">
                            {activeFilters} active
                          </Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4">
                      {/* Same filters as "all" tab */}
                      <div className="grid md:grid-cols-4 gap-4">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input
                            placeholder="Search by name, phone or UHID"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                        <Select value={doctorFilter} onValueChange={setDoctorFilter}>
                          <SelectTrigger>
                            <SelectValue placeholder="Filter by doctor" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Doctors</SelectItem>
                            {availableDoctors.map((d) => (
                              <SelectItem key={d} value={d}>
                                {d}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={appointmentTypeFilter} onValueChange={setAppointmentTypeFilter}>
                          <SelectTrigger>
                            <SelectValue placeholder="Filter by type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            <SelectItem value="visithospital">Visit Hospital</SelectItem>
                            <SelectItem value="oncall">On Call</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {activeFilters > 0 && (
                        <div className="flex justify-between items-center mt-4 pt-4 border-t">
                          <div className="text-sm text-gray-500">{filteredAppointments.length} appointments found</div>
                          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 gap-1">
                            <X className="h-3 w-3" /> Clear Filters
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Table - same structure as "all" tab */}
                  <Card className="border border-slate-200 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Todays Appointments
                      </CardTitle>
                      <CardDescription>Appointments scheduled for today</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {/* Same table content as "all" tab */}
                      {isLoading ? (
                        <div className="space-y-2">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-16 w-full" />
                          ))}
                        </div>
                      ) : filteredAppointments.length === 0 ? (
                        <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed">
                          <Calendar className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                          <p className="text-gray-500 font-medium">No appointments today</p>
                          <p className="text-gray-400 text-sm mb-4">There are no appointments scheduled for today</p>
                          <Button onClick={() => router.push("/opd")} className="gap-2">
                            <Calendar className="h-4 w-4" /> New Appointment
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="rounded-md border overflow-hidden">
                            <Table>
                            <TableHeader className="bg-slate-50">
  <TableRow>
    <TableHead className="w-[200px]">
      <Button variant="ghost" onClick={() => handleSort("name")} className="flex items-center gap-1 p-0 h-auto font-medium">
        Patient <ArrowUpDown className="h-3 w-3" />
      </Button>
    </TableHead>
    <TableHead>
      <Button variant="ghost" onClick={() => handleSort("date")} className="flex items-center gap-1 p-0 h-auto font-medium">
        Date <ArrowUpDown className="h-3 w-3" />
      </Button>
    </TableHead>
    <TableHead>Type</TableHead>
    <TableHead className="text-right">Amount</TableHead>
    <TableHead className="text-right">Actions</TableHead>
  </TableRow>
</TableHeader>

<TableBody>
  {currentAppointments.map((app) => (
    <TableRow key={`${app.patientId}-${app.id}`} className="hover:bg-slate-50">
      <TableCell className="font-medium">
        {/* name & phone */}
      </TableCell>
      <TableCell>
        {/* date & time */}
      </TableCell>
      <TableCell>
        {/* badge for visithospital/oncall */}
      </TableCell>
      <TableCell className="text-right font-medium">
        ₹{calculateTotalAmount(app)}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => viewAppointmentDetails(app)}>
                  <Eye className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View details</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <EditButton uhid={app.patientId} appointmentId={app.id} className="h-8 w-10 p-0" />
              </TooltipTrigger>
              <TooltipContent>Edit appointment</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </TableCell>
    </TableRow>
  ))}
</TableBody>
                            </Table>
                          </div>

                          {/* Pagination */}
                          {totalPages > 1 && (
                            <div className="flex items-center justify-between mt-4 pt-4 border-t">
                              <div className="text-sm text-gray-500">
                                Showing {startIndex + 1}-{Math.min(endIndex, filteredAppointments.length)} of{" "}
                                {filteredAppointments.length} appointments
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                                  disabled={currentPage === 1}
                                  className="h-8 w-8 p-0"
                                >
                                  <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <div className="text-sm font-medium">
                                  Page {currentPage} of {totalPages}
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                                  disabled={currentPage === totalPages}
                                  className="h-8 w-8 p-0"
                                >
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="upcoming" className="mt-0">
                  {/* Similar structure for upcoming appointments */}
                  <Card className="border border-slate-200 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Upcoming Appointments
                      </CardTitle>
                      <CardDescription>Future scheduled appointments</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {/* Same table structure as other tabs */}
                      {isLoading ? (
                        <div className="space-y-2">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-16 w-full" />
                          ))}
                        </div>
                      ) : filteredAppointments.length === 0 ? (
                        <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed">
                          <Calendar className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                          <p className="text-gray-500 font-medium">No upcoming appointments</p>
                          <p className="text-gray-400 text-sm mb-4">There are no future appointments scheduled</p>
                          <Button onClick={() => router.push("/opd")} className="gap-2">
                            <Calendar className="h-4 w-4" /> Schedule Appointment
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="rounded-md border overflow-hidden">
                            <Table>
                              <TableHeader className="bg-slate-50">
                                <TableRow>
                                  <TableHead className="w-[200px]">Patient</TableHead>
                                  <TableHead>Date</TableHead>
                                  <TableHead>Doctor</TableHead>
                                  <TableHead>Type</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {currentAppointments.map((app) => (
                                  <TableRow key={`${app.patientId}-${app.id}`} className="hover:bg-slate-50">
                                    <TableCell className="font-medium">
                                      <div>
                                        {app.name}
                                        <div className="text-xs text-gray-500 flex items-center gap-1">
                                          <Phone className="h-3 w-3" /> {app.phone}
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div>
                                        <div className="font-medium">{formatDate(app.date)}</div>
                                        <div className="text-xs text-gray-500 flex items-center gap-1">
                                          <Clock className="h-3 w-3" /> {app.time}
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      {app.doctor || <span className="text-gray-400 italic">Not assigned</span>}
                                    </TableCell>
                                    <TableCell>
                                      <Badge
                                        variant={app.appointmentType === "visithospital" ? "default" : "secondary"}
                                        className={
                                          app.appointmentType === "visithospital"
                                            ? "bg-blue-100 text-blue-800 hover:bg-blue-200"
                                            : "bg-purple-100 text-purple-800 hover:bg-purple-200"
                                        }
                                      >
                                        {app.appointmentType === "visithospital" ? "Visit" : "On Call"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>{getPaymentStatusBadge(app)}</TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex justify-end gap-2">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => viewAppointmentDetails(app)}
                                          className="h-8 w-8"
                                        >
                                          <Eye className="h-4 w-4" />
                                        </Button>
                                        <EditButton
                                          uhid={app.patientId}
                                          appointmentId={app.id}
                                          className="h-8 w-8 p-0"
                                        />
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>

                          {/* Pagination */}
                          {totalPages > 1 && (
                            <div className="flex items-center justify-between mt-4 pt-4 border-t">
                              <div className="text-sm text-gray-500">
                                Showing {startIndex + 1}-{Math.min(endIndex, filteredAppointments.length)} of{" "}
                                {filteredAppointments.length} appointments
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                                  disabled={currentPage === 1}
                                  className="h-8 w-8 p-0"
                                >
                                  <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <div className="text-sm font-medium">
                                  Page {currentPage} of {totalPages}
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                                  disabled={currentPage === totalPages}
                                  className="h-8 w-8 p-0"
                                >
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="past" className="mt-0">
                  {/* Similar structure for past appointments */}
                  <Card className="border border-slate-200 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Past Appointments
                      </CardTitle>
                      <CardDescription>Previous appointment history</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {/* Same table structure as other tabs */}
                      {isLoading ? (
                        <div className="space-y-2">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-16 w-full" />
                          ))}
                        </div>
                      ) : filteredAppointments.length === 0 ? (
                        <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed">
                          <Calendar className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                          <p className="text-gray-500 font-medium">No past appointments</p>
                          <p className="text-gray-400 text-sm mb-4">There are no previous appointments in the system</p>
                          <Button onClick={() => router.push("/opd")} className="gap-2">
                            <Calendar className="h-4 w-4" /> New Appointment
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="rounded-md border overflow-hidden">
                            <Table>
                              <TableHeader className="bg-slate-50">
                                <TableRow>
                                  <TableHead className="w-[200px]">Patient</TableHead>
                                  <TableHead>Date</TableHead>
                                  <TableHead>Doctor</TableHead>
                                  <TableHead>Type</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead className="text-right">Amount</TableHead>
                                  <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {currentAppointments.map((app) => (
                                  <TableRow key={`${app.patientId}-${app.id}`} className="hover:bg-slate-50">
                                    <TableCell className="font-medium">
                                      <div>
                                        {app.name}
                                        <div className="text-xs text-gray-500 flex items-center gap-1">
                                          <Phone className="h-3 w-3" /> {app.phone}
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div>
                                        <div className="font-medium">{formatDate(app.date)}</div>
                                        <div className="text-xs text-gray-500 flex items-center gap-1">
                                          <Clock className="h-3 w-3" /> {app.time}
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      {app.doctor || <span className="text-gray-400 italic">Not assigned</span>}
                                    </TableCell>
                                    <TableCell>
                                      <Badge
                                        variant={app.appointmentType === "visithospital" ? "default" : "secondary"}
                                        className={
                                          app.appointmentType === "visithospital"
                                            ? "bg-blue-100 text-blue-800 hover:bg-blue-200"
                                            : "bg-purple-100 text-purple-800 hover:bg-purple-200"
                                        }
                                      >
                                        {app.appointmentType === "visithospital" ? "Visit" : "On Call"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>{getPaymentStatusBadge(app)}</TableCell>
                                    <TableCell className="text-right font-medium">
                                      ₹{calculateTotalAmount(app)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex justify-end gap-2">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => viewAppointmentDetails(app)}
                                          className="h-8 w-8"
                                        >
                                          <Eye className="h-4 w-4" />
                                        </Button>
                                        <EditButton
                                          uhid={app.patientId}
                                          appointmentId={app.id}
                                          className="h-8 w-8 p-0"
                                        />
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>

                          {/* Pagination */}
                          {totalPages > 1 && (
                            <div className="flex items-center justify-between mt-4 pt-4 border-t">
                              <div className="text-sm text-gray-500">
                                Showing {startIndex + 1}-{Math.min(endIndex, filteredAppointments.length)} of{" "}
                                {filteredAppointments.length} appointments
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                                  disabled={currentPage === 1}
                                  className="h-8 w-8 p-0"
                                >
                                  <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <div className="text-sm font-medium">
                                  Page {currentPage} of {totalPages}
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                                  disabled={currentPage === totalPages}
                                  className="h-8 w-8 p-0"
                                >
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
