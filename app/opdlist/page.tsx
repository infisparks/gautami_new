"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useForm, Controller } from "react-hook-form"
import { db, auth } from "../../lib/firebase"
import { ref, query, orderByChild, startAt, endAt, get, update, remove, push, onValue, set } from "firebase/database"
import { onAuthStateChanged } from "firebase/auth"
import {
  Phone,
  DollarSign,
  Edit,
  Trash2,
  Search,
  ArrowLeft,
  Calendar,
  UserIcon,
  Stethoscope,
  History,
  ChevronDown,
  RefreshCw,
} from "lucide-react"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useRouter } from "next/navigation"

// Types
interface OPD_Summary {
  uhid: string
  id: string
  date: string
  time: string
  serviceName: string
  doctor: string
  appointmentType: string
  opdType: string
  name: string // Patient name from OPD record
  phone: string // Patient phone from OPD record
  amount: number
  createdAt: string
}

interface OPD_Full {
  uhid: string
  id: string
  date: string
  time: string
  paymentMethod: string
  originalAmount: number
  amount: number
  discount: number
  serviceName: string
  doctor: string
  message?: string
  referredBy?: string
  appointmentType: string
  opdType: string
  enteredBy: string
  createdAt: string
  name: string
  phone: string
  age: string | number
  gender: string
  address?: string
}

interface Doctor {
  id: string
  name: string
  opdCharge: number
  specialty?: string
}

interface EditFormData {
  name: string
  phone: string
  age: number
  gender: string
  address: string
  date: Date
  time: string
  paymentMethod: string
  amount: number
  discount: number
  serviceName: string
  doctor: string
  message: string
  referredBy: string
}

interface FilterOptions {
  dateFilter: "today" | "week" | "month" | "all"
  appointmentType: "all" | "visithospital" | "oncall"
  doctor: string
}

const PaymentOptions = [
  { value: "cash", label: "Cash" },
  { value: "online", label: "Online" },
  { value: "card", label: "Card" },
  { value: "upi", label: "UPI" },
]

const GenderOptions = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
]

const ITEMS_PER_PAGE = 10

export default function ManageOPDPage() {
  const router = useRouter()
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)

  // Data states
  const [appointments, setAppointments] = useState<OPD_Summary[]>([])
  const [filteredAppointments, setFilteredAppointments] = useState<OPD_Summary[]>([])
  const [displayedAppointments, setDisplayedAppointments] = useState<OPD_Summary[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  // Search and filters
  const [searchQuery, setSearchQuery] = useState("")
  const [filters, setFilters] = useState<FilterOptions>({
    dateFilter: "today",
    appointmentType: "all",
    doctor: "all",
  })

  // Loading states
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)

  // Dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [uhidEditing, setUhidEditing] = useState<string | null>(null)
  const [opdIdEditing, setOpdIdEditing] = useState<string | null>(null)
  const [toDeleteSummary, setToDeleteSummary] = useState<OPD_Summary | null>(null)

  // Form for editing
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    reset,
    watch,
  } = useForm<EditFormData>()

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user && user.email) {
        setCurrentUserEmail(user.email)
      } else {
        setCurrentUserEmail(null)
      }
    })
    return () => unsub()
  }, [])

  // Fetch doctors
  useEffect(() => {
    const doctorsRef = ref(db, "doctors")
    const unsub = onValue(doctorsRef, (snap) => {
      const data = snap.val()
      const list: Doctor[] = []
      if (data) {
        Object.keys(data).forEach((key) => {
          list.push({
            id: key,
            name: data[key].name,
            opdCharge: data[key].opdCharge || 0,
            specialty: data[key].specialty || "",
          })
        })
      }
      list.unshift({ id: "all", name: "All Doctors", opdCharge: 0 })
      list.push({ id: "no_doctor", name: "No Doctor", opdCharge: 0 })
      setDoctors(list)
    })
    return () => unsub()
  }, [])

  // Get date range for filtering
  const getDateRange = useCallback((filterType: string) => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    switch (filterType) {
      case "today":
        return {
          start: today.toISOString(),
          end: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        }
      case "week":
        const weekStart = new Date(today)
        weekStart.setDate(today.getDate() - today.getDay())
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekStart.getDate() + 7)
        return {
          start: weekStart.toISOString(),
          end: weekEnd.toISOString(),
        }
      case "month":
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1)
        return {
          start: monthStart.toISOString(),
          end: monthEnd.toISOString(),
        }
      default:
        return null
    }
  }, [])

  // Optimized data fetching with Firebase queries
  const fetchAppointments = useCallback(
    async (resetData = false) => {
      if (resetData) {
        setInitialLoading(true)
        setAppointments([])
        setCurrentPage(1)
      } else {
        setLoading(true)
      }

      try {
        const allAppointments: OPD_Summary[] = []
        const opdDetailRef = ref(db, "patients/opddetail")

        // Get all patient UHIDs first
        const uhidsSnapshot = await get(opdDetailRef)
        if (!uhidsSnapshot.exists()) {
          setAppointments([])
          setFilteredAppointments([])
          setDisplayedAppointments([])
          return
        }

        const uhidsData = uhidsSnapshot.val()
        const uhids = Object.keys(uhidsData)

        // Fetch appointments for each UHID
        for (const uhid of uhids) {
          const userOpdRef = ref(db, `patients/opddetail/${uhid}`)
          let appointmentQuery

          // Apply date filtering at database level for better performance
          const dateRange = getDateRange(filters.dateFilter)
          if (dateRange) {
            appointmentQuery = query(userOpdRef, orderByChild("date"), startAt(dateRange.start), endAt(dateRange.end))
          } else {
            appointmentQuery = query(userOpdRef, orderByChild("createdAt"))
          }

          const snapshot = await get(appointmentQuery)
          if (snapshot.exists()) {
            const appointmentsData = snapshot.val()
            Object.keys(appointmentsData).forEach((appointmentId) => {
              const appointment = appointmentsData[appointmentId]

              // Apply appointment type filter
              if (filters.appointmentType !== "all" && appointment.appointmentType !== filters.appointmentType) {
                return
              }

              // Apply doctor filter
              if (filters.doctor !== "all" && appointment.doctor !== filters.doctor) {
                return
              }

              allAppointments.push({
                uhid,
                id: appointmentId,
                date: appointment.date,
                time: appointment.time,
                serviceName: appointment.serviceName,
                doctor: appointment.doctor,
                appointmentType: appointment.appointmentType,
                opdType: appointment.opdType,
                name: appointment.name || "Unknown",
                phone: appointment.phone || "",
                amount: appointment.amount || 0,
                createdAt: appointment.createdAt,
              })
            })
          }
        }

        // Sort by creation date (newest first)
        allAppointments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

        setAppointments(allAppointments)
      } catch (error) {
        console.error("Error fetching appointments:", error)
        toast.error("Failed to load appointments")
      } finally {
        setLoading(false)
        setInitialLoading(false)
      }
    },
    [filters, getDateRange],
  )

  // Initial data load
  useEffect(() => {
    fetchAppointments(true)
  }, [fetchAppointments])

  // Enhanced search functionality
  const performSearch = useCallback((query: string, appointmentsList: OPD_Summary[]) => {
    if (!query.trim()) {
      return appointmentsList
    }

    const searchTerm = query.toLowerCase().trim()

    // Only search if query is 4+ characters for names or 5+ digits for phone numbers
    const isPhoneSearch = /^\d{5,}$/.test(searchTerm)
    const isNameSearch = searchTerm.length >= 4

    if (!isPhoneSearch && !isNameSearch) {
      return appointmentsList
    }

    return appointmentsList.filter((appointment) => {
      if (isPhoneSearch) {
        return appointment.phone.includes(searchTerm)
      }

      if (isNameSearch) {
        const matchesName = appointment.name.toLowerCase().includes(searchTerm)
        const matchesService = appointment.serviceName.toLowerCase().includes(searchTerm)
        const matchesUhid = appointment.uhid.toLowerCase().includes(searchTerm)
        const doctorName = getDoctorName(appointment.doctor).toLowerCase()
        const matchesDoctor = doctorName.includes(searchTerm)

        return matchesName || matchesService || matchesUhid || matchesDoctor
      }

      return false
    })
  }, [])

  // Apply search and update filtered appointments
  useEffect(() => {
    const filtered = performSearch(searchQuery, appointments)
    setFilteredAppointments(filtered)
    setCurrentPage(1) // Reset to first page when search changes
  }, [searchQuery, appointments, performSearch])

  // Update displayed appointments based on pagination
  useEffect(() => {
    const startIndex = 0
    const endIndex = currentPage * ITEMS_PER_PAGE
    const displayed = filteredAppointments.slice(startIndex, endIndex)
    setDisplayedAppointments(displayed)
    setHasMore(endIndex < filteredAppointments.length)
  }, [filteredAppointments, currentPage])

  // Load more appointments
  const loadMore = useCallback(() => {
    if (hasMore && !loading) {
      setCurrentPage((prev) => prev + 1)
    }
  }, [hasMore, loading])

  // Get doctor name
  const getDoctorName = useCallback(
    (id: string) => {
      return doctors.find((d) => d.id === id)?.name || id
    },
    [doctors],
  )

  // Handle filter changes
  const handleFilterChange = useCallback((key: keyof FilterOptions, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }, [])

  // Refresh data
  const refreshData = useCallback(() => {
    fetchAppointments(true)
  }, [fetchAppointments])

  // Open edit dialog
  const openEditDialog = async (summary: OPD_Summary) => {
    setLoading(true)
    try {
      const opdSnap = await get(ref(db, `patients/opddetail/${summary.uhid}/${summary.id}`))
      const opdData = opdSnap.val()
      if (!opdData) {
        toast.error("Could not load appointment details.")
        return
      }

      reset({
        name: opdData.name || "",
        phone: opdData.phone || "",
        age: Number(opdData.age || 0),
        gender: opdData.gender || "",
        address: opdData.address || "",
        date: new Date(opdData.date),
        time: opdData.time,
        paymentMethod: opdData.paymentMethod,
        amount: opdData.originalAmount || opdData.amount,
        discount: opdData.discount || 0,
        serviceName: opdData.serviceName,
        doctor: opdData.doctor,
        message: opdData.message || "",
        referredBy: opdData.referredBy || "",
      })

      setUhidEditing(summary.uhid)
      setOpdIdEditing(summary.id)
      setEditDialogOpen(true)
    } catch (err) {
      console.error(err)
      toast.error("Error loading edit form.")
    } finally {
      setLoading(false)
    }
  }

  // Save edited appointment
  const handleSaveEdit = async (formData: EditFormData) => {
    if (!uhidEditing || !opdIdEditing) return
    setLoading(true)

    try {
      const updatedData: any = {
        name: formData.name,
        phone: formData.phone,
        age: String(formData.age),
        gender: formData.gender,
        address: formData.address,
        date: formData.date.toISOString(),
        time: formData.time,
        paymentMethod: formData.paymentMethod,
        originalAmount: formData.amount,
        discount: formData.discount,
        amount: formData.amount - formData.discount,
        serviceName: formData.serviceName,
        doctor: formData.doctor,
        message: formData.message,
        referredBy: formData.referredBy,
        lastModifiedBy: currentUserEmail || "unknown",
        lastModifiedAt: new Date().toISOString(),
      }

      await update(ref(db, `patients/opddetail/${uhidEditing}/${opdIdEditing}`), updatedData)

      // Log the change
      const changesRef = ref(db, "opdChanges")
      const newChangeRef = push(changesRef)
      await set(newChangeRef, {
        type: "edit",
        appointmentId: opdIdEditing,
        patientId: uhidEditing,
        patientName: formData.name,
        editedBy: currentUserEmail || "unknown",
        editedAt: new Date().toISOString(),
      })

      toast.success("Appointment updated successfully!")
      setEditDialogOpen(false)
      setUhidEditing(null)
      setOpdIdEditing(null)

      // Refresh data
      refreshData()
    } catch (err) {
      console.error(err)
      toast.error("Failed to save changes.")
    } finally {
      setLoading(false)
    }
  }

  // Delete appointment
  const handleDeleteAppointment = async () => {
    if (!toDeleteSummary) return
    setLoading(true)

    try {
      // Log the delete
      const changesRef = ref(db, "opdChanges")
      const newChangeRef = push(changesRef)
      await set(newChangeRef, {
        type: "delete",
        appointmentId: toDeleteSummary.id,
        patientId: toDeleteSummary.uhid,
        patientName: toDeleteSummary.name,
        deletedBy: currentUserEmail || "unknown",
        deletedAt: new Date().toISOString(),
      })

      // Remove the appointment
      await remove(ref(db, `patients/opddetail/${toDeleteSummary.uhid}/${toDeleteSummary.id}`))

      toast.success("Appointment deleted successfully!")
      setDeleteDialogOpen(false)
      setToDeleteSummary(null)

      // Refresh data
      refreshData()
    } catch (err) {
      console.error(err)
      toast.error("Failed to delete appointment.")
    } finally {
      setLoading(false)
    }
  }

  // Memoized filter summary
  const filterSummary = useMemo(() => {
    const total = filteredAppointments.length
    const showing = displayedAppointments.length
    return { total, showing }
  }, [filteredAppointments.length, displayedAppointments.length])

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-emerald-600" />
          <p className="text-lg text-gray-600">Loading appointments...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-4 py-8">
          <Card className="w-full max-w-7xl mx-auto shadow-lg">
            <CardHeader className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-2xl md:text-3xl font-bold">Manage OPD Appointments</CardTitle>
                  <CardDescription className="text-emerald-100">
                    Optimized with pagination, search & filtering
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={refreshData}
                    disabled={loading}
                    className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push("/opd-changes")}
                    className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                  >
                    <History className="mr-2 h-4 w-4" />
                    Changes
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push("/opd-booking")}
                    className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              {/* Search and Filters */}
              <div className="mb-6 space-y-4">
                {/* Search Bar */}
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                      placeholder="Search: 4+ chars for name, 5+ digits for phone..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  {/* Filters */}
                  <div className="flex gap-2">
                    {/* Date Filter */}
                    <Select
                      value={filters.dateFilter}
                      onValueChange={(value) => handleFilterChange("dateFilter", value)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="today">Today</SelectItem>
                        <SelectItem value="week">This Week</SelectItem>
                        <SelectItem value="month">This Month</SelectItem>
                        <SelectItem value="all">All Time</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Appointment Type Filter */}
                    <Select
                      value={filters.appointmentType}
                      onValueChange={(value) => handleFilterChange("appointmentType", value)}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="visithospital">Hospital Visit</SelectItem>
                        <SelectItem value="oncall">On Call</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Doctor Filter */}
                    <Select value={filters.doctor} onValueChange={(value) => handleFilterChange("doctor", value)}>
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {doctors.map((doctor) => (
                          <SelectItem key={doctor.id} value={doctor.id}>
                            {doctor.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Results Summary */}
                <div className="flex justify-between items-center text-sm text-gray-600">
                  <div>
                    Showing {filterSummary.showing} of {filterSummary.total} appointments
                    {searchQuery && <span className="ml-2 text-emerald-600">(filtered by: {searchQuery})</span>}
                  </div>
                  {searchQuery && searchQuery.length > 0 && searchQuery.length < 4 && !/^\d{5,}$/.test(searchQuery) && (
                    <div className="text-amber-600 text-xs">
                      Enter 4+ characters for name search or 5+ digits for phone search
                    </div>
                  )}
                </div>
              </div>

              {/* Appointments List */}
              {displayedAppointments.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  {searchQuery
                    ? "No matching appointments found"
                    : "No appointments available for the selected filters"}
                </div>
              ) : (
                <div className="space-y-4">
                  {displayedAppointments.map((appointment) => (
                    <Card
                      key={`${appointment.uhid}-${appointment.id}`}
                      className="overflow-hidden hover:shadow-md transition-shadow"
                    >
                      <CardHeader className="bg-gray-50 dark:bg-gray-800 p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <CardTitle className="text-lg">{appointment.uhid}</CardTitle>
                              <Badge variant="outline">{appointment.opdType.toUpperCase()}</Badge>
                              <Badge
                                variant={appointment.appointmentType === "visithospital" ? "default" : "secondary"}
                              >
                                {appointment.appointmentType === "visithospital" ? "Hospital Visit" : "On-Call"}
                              </Badge>
                            </div>

                            <div className="text-sm text-gray-700 mb-2 flex items-center gap-4">
                              <span className="flex items-center gap-1">
                                <UserIcon className="h-4 w-4" />
                                {appointment.name}
                              </span>
                              {appointment.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-4 w-4" />
                                  {appointment.phone}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <DollarSign className="h-4 w-4" />₹{appointment.amount}
                              </span>
                            </div>

                            <CardDescription className="flex items-center gap-4">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                {new Date(appointment.date).toLocaleDateString()} at {appointment.time}
                              </span>
                              <span className="flex items-center gap-1">
                                <Stethoscope className="h-4 w-4" />
                                {appointment.serviceName}
                              </span>
                              <span className="flex items-center gap-1">
                                <UserIcon className="h-4 w-4" />
                                {getDoctorName(appointment.doctor)}
                              </span>
                            </CardDescription>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEditDialog(appointment)}
                              className="text-blue-600 hover:text-blue-700"
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setToDeleteSummary(appointment)
                                setDeleteDialogOpen(true)
                              }}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}

                  {/* Load More Button */}
                  {hasMore && (
                    <div className="text-center pt-4">
                      <Button onClick={loadMore} disabled={loading} variant="outline" className="w-full max-w-xs">
                        {loading ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <ChevronDown className="mr-2 h-4 w-4" />
                            Load More ({filteredAppointments.length - displayedAppointments.length} remaining)
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Appointment</DialogTitle>
            <DialogDescription>Modify details for UHID {uhidEditing}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(handleSaveEdit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Patient Name */}
              <div className="space-y-2">
                <Label htmlFor="edit-name">
                  Patient Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="edit-name"
                  {...register("name", { required: "Name is required" })}
                  placeholder="Enter patient name"
                />
                {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
              </div>

              {/* Phone Number */}
              <div className="space-y-2">
                <Label htmlFor="edit-phone">
                  Phone Number <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="edit-phone"
                  {...register("phone", {
                    required: "Phone is required",
                    pattern: {
                      value: /^[0-9]{10}$/,
                      message: "Enter valid 10-digit phone",
                    },
                  })}
                  placeholder="Enter phone"
                />
                {errors.phone && <p className="text-sm text-red-500">{errors.phone.message}</p>}
              </div>

              {/* Age */}
              <div className="space-y-2">
                <Label htmlFor="edit-age">
                  Age <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="edit-age"
                  type="number"
                  {...register("age", {
                    required: "Age is required",
                    min: { value: 1, message: "Age must be ≥ 1" },
                  })}
                  placeholder="Enter age"
                />
                {errors.age && <p className="text-sm text-red-500">{errors.age.message}</p>}
              </div>

              {/* Gender */}
              <div className="space-y-2">
                <Label htmlFor="edit-gender">
                  Gender <span className="text-red-500">*</span>
                </Label>
                <Controller
                  control={control}
                  name="gender"
                  rules={{ required: "Gender is required" }}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                      <SelectContent>
                        {GenderOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.gender && <p className="text-sm text-red-500">{errors.gender.message}</p>}
              </div>

              {/* Address */}
              <div className="space-y-2 col-span-2">
                <Label htmlFor="edit-address">Address</Label>
                <Textarea
                  id="edit-address"
                  {...register("address")}
                  placeholder="Enter address"
                  className="min-h-[80px]"
                />
              </div>

              {/* Date */}
              <div className="space-y-2">
                <Label htmlFor="edit-date">
                  Appointment Date <span className="text-red-500">*</span>
                </Label>
                <Controller
                  control={control}
                  name="date"
                  rules={{ required: "Date is required" }}
                  render={({ field }) => (
                    <DatePicker
                      selected={field.value}
                      onChange={(d: Date | null) => d && field.onChange(d)}
                      dateFormat="dd/MM/yyyy"
                      placeholderText="Select date"
                      className="w-full px-3 py-2 border rounded-md focus:ring-emerald-500"
                    />
                  )}
                />
                {errors.date && <p className="text-sm text-red-500">{errors.date.message}</p>}
              </div>

              {/* Time */}
              <div className="space-y-2">
                <Label htmlFor="edit-time">
                  Appointment Time <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="edit-time"
                  {...register("time", { required: "Time is required" })}
                  placeholder="e.g. 10:30 AM"
                />
                {errors.time && <p className="text-sm text-red-500">{errors.time.message}</p>}
              </div>

              {/* Service Name */}
              <div className="space-y-2">
                <Label htmlFor="edit-serviceName">
                  Service Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="edit-serviceName"
                  {...register("serviceName", {
                    required: "Service is required",
                  })}
                  placeholder="Enter service"
                />
                {errors.serviceName && <p className="text-sm text-red-500">{errors.serviceName.message}</p>}
              </div>

              {/* Doctor */}
              <div className="space-y-2">
                <Label htmlFor="edit-doctor">
                  Doctor <span className="text-red-500">*</span>
                </Label>
                <Controller
                  control={control}
                  name="doctor"
                  rules={{ required: "Doctor is required" }}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select doctor" />
                      </SelectTrigger>
                      <SelectContent>
                        {doctors
                          .filter((doc) => doc.id !== "all")
                          .map((doc) => (
                            <SelectItem key={doc.id} value={doc.id}>
                              {doc.name} {doc.specialty ? `(${doc.specialty})` : ""}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.doctor && <p className="text-sm text-red-500">{errors.doctor.message}</p>}
              </div>

              {/* Payment Method */}
              <div className="space-y-2">
                <Label htmlFor="edit-paymentMethod">
                  Payment Method <span className="text-red-500">*</span>
                </Label>
                <Controller
                  control={control}
                  name="paymentMethod"
                  rules={{ required: "Payment method is required" }}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select payment" />
                      </SelectTrigger>
                      <SelectContent>
                        {PaymentOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.paymentMethod && <p className="text-sm text-red-500">{errors.paymentMethod.message}</p>}
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <Label htmlFor="edit-amount">
                  Amount (₹) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="edit-amount"
                  type="number"
                  {...register("amount", {
                    required: "Amount is required",
                    min: { value: 0, message: "Amount must be ≥ 0" },
                  })}
                  placeholder="Enter amount"
                />
                {errors.amount && <p className="text-sm text-red-500">{errors.amount.message}</p>}
              </div>

              {/* Discount */}
              <div className="space-y-2">
                <Label htmlFor="edit-discount">Discount (₹)</Label>
                <Input
                  id="edit-discount"
                  type="number"
                  {...register("discount", {
                    min: { value: 0, message: "Discount must be ≥ 0" },
                    validate: (val) => {
                      const amt = watch("amount")
                      return val <= amt || "Discount cannot exceed amount"
                    },
                  })}
                  placeholder="Enter discount"
                />
                {errors.discount && <p className="text-sm text-red-500">{errors.discount.message}</p>}
                {watch("discount") > 0 && (
                  <p className="text-sm text-emerald-600">Final: ₹{watch("amount") - watch("discount")}</p>
                )}
              </div>

              {/* Referred By */}
              <div className="space-y-2">
                <Label htmlFor="edit-referredBy">Referred By</Label>
                <Input id="edit-referredBy" {...register("referredBy")} placeholder="Enter referrer name" />
              </div>

              {/* Message */}
              <div className="space-y-2 col-span-2">
                <Label htmlFor="edit-message">Additional Notes</Label>
                <Textarea
                  id="edit-message"
                  {...register("message")}
                  placeholder="Enter notes"
                  className="min-h-[100px]"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Appointment</AlertDialogTitle>
            <div className="text-sm text-gray-600 mt-1">
              Are you sure you want to delete the appointment for <strong>{toDeleteSummary?.name}</strong> (UHID:{" "}
              {toDeleteSummary?.uhid})? This action cannot be undone.
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setToDeleteSummary(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAppointment}
              className="bg-red-500 hover:bg-red-600"
              disabled={loading}
            >
              {loading ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
