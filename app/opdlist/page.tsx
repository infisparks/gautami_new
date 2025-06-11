"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useForm, Controller } from "react-hook-form"
import { db, auth } from "../../lib/firebase"
import { ref, query, orderByChild, startAt, endAt, get, update, remove, push, onValue, set } from "firebase/database"
import { onAuthStateChanged } from "firebase/auth"
import {
  Phone,
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
  IndianRupeeIcon,
  Cake,
  MapPin,
  Clock,
  MessageSquare,
  PersonStandingIcon as PersonIcon,
  CalendarIcon,
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

// Enhanced Types matching the new form structure
interface OPD_Summary {
  uhid: string
  id: string
  date: string
  time: string
  serviceName: string
  doctor: string
  appointmentType: "visithospital" | "oncall"
  opdType: string
  name: string
  phone: string
  age: number
  gender: "male" | "female" | "other"
  address?: string
  amount: number
  cashAmount: number
  onlineAmount: number
  originalAmount: number
  discount: number
  paymentMethod: "cash" | "online" | "mixed" | "card" | "upi"
  modality: "consultation" | "casualty" | "xray" | "pathology"
  visitType?: "first" | "followup"
  study?: string
  specialist?: string
  referredBy?: string
  message?: string
  createdAt: string
  enteredBy?: string
}

interface OPD_Full extends OPD_Summary {
  lastModifiedBy?: string
  lastModifiedAt?: string
}

interface Doctor {
  id: string
  name: string
  specialist: string[] | string
  department?: string
  firstVisitCharge: number
  followUpCharge: number
}

interface EditFormData {
  name: string
  phone: string
  age: number
  gender: "male" | "female" | "other"
  address: string
  date: Date
  time: string
  appointmentType: "visithospital" | "oncall"
  paymentMethod: "cash" | "online" | "mixed" | "card" | "upi"
  cashAmount: number
  onlineAmount: number
  discount: number
  doctor: string
  message: string
  referredBy: string
  modality: "consultation" | "casualty" | "xray" | "pathology"
  visitType: "first" | "followup"
  study: string
}

interface FilterOptions {
  dateFilter: "today" | "week" | "month" | "all"
  appointmentType: "all" | "visithospital" | "oncall"
  doctor: string
  modality: string
  paymentMethod: string
}

// Enhanced Options matching the new form
const PaymentOptions = [
  { value: "cash", label: "Cash" },
  { value: "online", label: "Online" },
  { value: "mixed", label: "Cash + Online" },
  { value: "card", label: "Card" },
  { value: "upi", label: "UPI" },
]

const GenderOptions = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
]

const ModalityOptions = [
  { value: "consultation", label: "Consultation" },
  { value: "casualty", label: "Casualty" },
  { value: "xray", label: "X-Ray" },
  { value: "pathology", label: "Pathology" },
]

const VisitTypeOptions = [
  { value: "first", label: "First Visit" },
  { value: "followup", label: "Follow Up" },
]

const XRayStudyOptions = [
  "Chest X-Ray",
  "Abdomen X-Ray",
  "Spine X-Ray",
  "Pelvis X-Ray",
  "Extremity X-Ray",
  "Skull X-Ray",
]

const PathologyStudyOptions = [
  "Complete Blood Count (CBC)",
  "Blood Sugar Test",
  "Lipid Profile",
  "Liver Function Test",
  "Kidney Function Test",
  "Thyroid Function Test",
  "Urine Analysis",
  "Stool Analysis",
  "ECG",
  "Echo Cardiogram",
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
  const [missingDoctors, setMissingDoctors] = useState<Set<string>>(new Set())

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  // Search and filters
  const [searchQuery, setSearchQuery] = useState("")
  const [filters, setFilters] = useState<FilterOptions>({
    dateFilter: "today",
    appointmentType: "all",
    doctor: "all",
    modality: "all",
    paymentMethod: "all",
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
    setValue,
  } = useForm<EditFormData>()

  // Watch form values for dynamic behavior
  const watchedModality = watch("modality")
  const watchedDoctor = watch("doctor")
  const watchedVisitType = watch("visitType")
  const watchedPaymentMethod = watch("paymentMethod")
  const watchedAppointmentType = watch("appointmentType")
  const watchedCashAmount = watch("cashAmount")
  const watchedOnlineAmount = watch("onlineAmount")

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

  // Enhanced doctor fetching with specialist handling
  useEffect(() => {
    const doctorsRef = ref(db, "doctors")
    const unsub = onValue(doctorsRef, (snap) => {
      const data = snap.val()
      const list: Doctor[] = []

      if (data) {
        // Handle both array and object structures
        if (Array.isArray(data)) {
          // If data is an array (like your JSON structure)
          data.forEach((doctorData, index) => {
            if (doctorData && doctorData.id) {
              list.push({
                id: doctorData.id,
                name: doctorData.name,
                specialist: doctorData.specialist || "",
                firstVisitCharge: doctorData.firstVisitCharge || 0,
                followUpCharge: doctorData.followUpCharge || 0,
                department: doctorData.department || "",
              })
            }
          })
        } else {
          // If data is an object (Firebase structure)
          Object.keys(data).forEach((key) => {
            list.push({
              id: key,
              name: data[key].name,
              specialist: data[key].specialist || "",
              firstVisitCharge: data[key].firstVisitCharge || 0,
              followUpCharge: data[key].followUpCharge || 0,
              department: data[key].department || "",
            })
          })
        }
      }

      console.log("Loaded doctors:", list.length)
      console.log(
        "Sample doctor IDs:",
        list.slice(0, 3).map((d) => d.id),
      )

      // Add special entries
      list.unshift({ id: "all", name: "All Doctors", specialist: "", firstVisitCharge: 0, followUpCharge: 0 })
      list.push({ id: "no_doctor", name: "No Doctor", specialist: "", firstVisitCharge: 0, followUpCharge: 0 })

      setDoctors(list)
    })
    return () => unsub()
  }, [])

  // Filter doctors by selected specialist
  const getFilteredDoctors = useCallback(() => {
    return doctors.filter((d) => d.id !== "no_doctor" && d.id !== "all")
  }, [doctors])

  // Get current doctor charges
  const getCurrentDoctorCharges = useCallback(() => {
    if (watchedModality === "consultation" && watchedDoctor && watchedVisitType) {
      const selectedDoctor = doctors.find((d) => d.id === watchedDoctor)
      if (selectedDoctor) {
        return watchedVisitType === "first" ? selectedDoctor.firstVisitCharge : selectedDoctor.followUpCharge
      }
    }
    return 0
  }, [watchedModality, watchedDoctor, watchedVisitType, doctors])

  // Reset dependent fields when modality changes
  useEffect(() => {
    if (watchedModality !== "consultation") {
      setValue("doctor", "")
      setValue("visitType", "first")
    }
  }, [watchedModality, setValue])

  // Reset visit type when doctor changes and set default to "first"
  useEffect(() => {
    if (watchedModality === "consultation" && watchedDoctor) {
      if (!watchedVisitType) {
        setValue("visitType", "first")
      }
    }
  }, [watchedDoctor, watchedModality, watchedVisitType, setValue])

  // Enhanced doctor info retrieval
  const getDoctorInfo = useCallback(
    async (doctorId: string) => {
      const existingDoctor = doctors.find((d) => d.id === doctorId)
      if (existingDoctor) {
        return existingDoctor
      }

      try {
        const doctorSnap = await get(ref(db, `doctors/${doctorId}`))
        if (doctorSnap.exists()) {
          const doctorData = doctorSnap.val()
          return {
            id: doctorId,
            name: doctorData.name || "Unknown Doctor",
            specialist: doctorData.specialist || "",
            firstVisitCharge: doctorData.firstVisitCharge || 0,
            followUpCharge: doctorData.followUpCharge || 0,
          }
        }
      } catch (error) {
        console.error("Error fetching doctor:", error)
      }

      setMissingDoctors((prev) => new Set([...prev, doctorId]))
      return {
        id: doctorId,
        name: `Missing Doctor (${doctorId.slice(-8)})`,
        specialist: "Not Found",
        firstVisitCharge: 0,
        followUpCharge: 0,
      }
    },
    [doctors],
  )

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

  // Enhanced data fetching with improved filtering
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

        const uhidsSnapshot = await get(opdDetailRef)
        if (!uhidsSnapshot.exists()) {
          setAppointments([])
          setFilteredAppointments([])
          setDisplayedAppointments([])
          return
        }

        const uhidsData = uhidsSnapshot.val()
        const uhids = Object.keys(uhidsData)

        for (const uhid of uhids) {
          const userOpdRef = ref(db, `patients/opddetail/${uhid}`)
          let appointmentQuery

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

              // Apply filters
              if (filters.appointmentType !== "all" && appointment.appointmentType !== filters.appointmentType) {
                return
              }

              if (filters.doctor !== "all" && appointment.doctor !== filters.doctor) {
                return
              }

              if (filters.modality !== "all" && appointment.modality !== filters.modality) {
                return
              }

              if (filters.paymentMethod !== "all" && appointment.paymentMethod !== filters.paymentMethod) {
                return
              }

              allAppointments.push({
                uhid,
                id: appointmentId,
                date: appointment.date,
                time: appointment.time,
                serviceName: appointment.serviceName || "N/A",
                doctor: appointment.doctor,
                appointmentType: appointment.appointmentType,
                opdType: appointment.opdType,
                name: appointment.name || "Unknown",
                phone: appointment.phone || "",
                age: appointment.age || 0,
                gender: appointment.gender || "other",
                address: appointment.address || "",
                amount: appointment.amount || 0,
                cashAmount: appointment.cashAmount || 0,
                onlineAmount: appointment.onlineAmount || 0,
                originalAmount: appointment.originalAmount || appointment.amount || 0,
                discount: appointment.discount || 0,
                paymentMethod: appointment.paymentMethod || "cash",
                modality: appointment.modality || "consultation",
                visitType: appointment.visitType || "",
                study: appointment.study || "",
                referredBy: appointment.referredBy || "",
                message: appointment.message || "",
                createdAt: appointment.createdAt,
                enteredBy: appointment.enteredBy || "",
              })
            })
          }
        }

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
        const matchesStudy = appointment.study?.toLowerCase().includes(searchTerm) || false

        return matchesName || matchesService || matchesUhid || matchesDoctor || matchesStudy
      }

      return false
    })
  }, [])

  // Apply search and update filtered appointments
  useEffect(() => {
    const filtered = performSearch(searchQuery, appointments)
    setFilteredAppointments(filtered)
    setCurrentPage(1)
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
      const doctor = doctors.find((d) => d.id === id)
      if (doctor) return doctor.name

      // Check if it's a missing doctor we've encountered
      if (missingDoctors.has(id)) {
        return `Missing Doctor (${id.slice(-8)})`
      }

      // If ID looks like one from your structure, show a more user-friendly format
      if (id.startsWith("-OSPLgyozFztsKFV7k")) {
        return `Doctor (${id.slice(-4)})`
      }

      return id
    },
    [doctors, missingDoctors],
  )

  // Handle filter changes
  const handleFilterChange = useCallback((key: keyof FilterOptions, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }, [])

  // Refresh data
  const refreshData = useCallback(() => {
    fetchAppointments(true)
  }, [fetchAppointments])

  // Enhanced payment display formatting
  const formatPaymentDisplay = (appointment: OPD_Summary) => {
    if (appointment.paymentMethod === "mixed") {
      return `Cash: ₹${appointment.cashAmount} + Online: ₹${appointment.onlineAmount}`
    }
    return `₹${appointment.amount}`
  }

  // Get all available doctors for dropdown
  const getAvailableDoctors = useCallback(() => {
    const allDoctors = [...doctors]

    missingDoctors.forEach((doctorId) => {
      if (!allDoctors.find((d) => d.id === doctorId)) {
        allDoctors.push({
          id: doctorId,
          name: `Missing Doctor (${doctorId.slice(-8)})`,
          specialist: "Not Found",
          firstVisitCharge: 0,
          followUpCharge: 0,
        })
      }
    })

    return allDoctors.filter((d) => d.id !== "all")
  }, [doctors, missingDoctors])

  // Enhanced edit dialog opening with better data handling
  const openEditDialog = async (summary: OPD_Summary) => {
    if (doctors.length === 0) {
      toast.error("Please wait for doctors to load before editing.")
      return
    }

    setLoading(true)
    try {
      const opdSnap = await get(ref(db, `patients/opddetail/${summary.uhid}/${summary.id}`))
      const opdData = opdSnap.val()
      if (!opdData) {
        toast.error("Could not load appointment details.")
        return
      }

      const patientSnap = await get(ref(db, `patients/patientinfo/${summary.uhid}`))
      const patientData = patientSnap.val()

      // Enhanced doctor matching - match by exact ID first
      let doctorId = ""

      // First try exact ID match
      const doctorById = doctors.find((d) => d.id === opdData.doctor)

      if (doctorById) {
        doctorId = doctorById.id
        console.log("Doctor found by exact ID match:", doctorById.name)
      } else {
        // If not found by ID, try to find by name
        const doctorByName = doctors.find((d) => d.name === opdData.doctor)
        if (doctorByName) {
          doctorId = doctorByName.id
          console.log("Doctor found by name match:", doctorByName.name)
        } else {
          // If still not found, check if the stored value is already a doctor ID from our list
          const possibleDoctor = doctors.find((d) => d.id.includes(opdData.doctor) || opdData.doctor.includes(d.id))
          if (possibleDoctor) {
            doctorId = possibleDoctor.id
            console.log("Doctor found by partial match:", possibleDoctor.name)
          } else {
            console.log("Doctor not found, setting to no_doctor. Searched for:", opdData.doctor)
            doctorId = "no_doctor"
          }
        }
      }

      reset({
        name: opdData.name || patientData?.name || "",
        phone: opdData.phone || patientData?.phone || "",
        age: Number(patientData?.age || opdData.age || 0),
        gender: patientData?.gender || opdData.gender || "other",
        address: patientData?.address || opdData.address || "",
        date: new Date(opdData.date),
        time: opdData.time,
        appointmentType: opdData.appointmentType || "visithospital",
        paymentMethod: opdData.paymentMethod,
        cashAmount: opdData.cashAmount || 0,
        onlineAmount: opdData.onlineAmount || 0,
        discount: opdData.discount || 0,
        doctor: doctorId, // This will now properly match the doctor ID
        message: opdData.message || "",
        referredBy: opdData.referredBy || "",
        modality: opdData.modality || "consultation",
        visitType: opdData.visitType || "first",
        study: opdData.study || "",
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

  // Calculate final amount based on payment method
  const calculateFinalAmount = () => {
    const paymentMethod = watch("paymentMethod")
    const cashAmount = Number(watch("cashAmount")) || 0
    const onlineAmount = Number(watch("onlineAmount")) || 0
    const discount = Number(watch("discount")) || 0

    if (paymentMethod === "mixed") {
      return cashAmount + onlineAmount - discount
    } else {
      return cashAmount - discount
    }
  }

  // Enhanced save edit function
  const handleSaveEdit = async (formData: EditFormData) => {
    if (!uhidEditing || !opdIdEditing) return
    setLoading(true)

    try {
      const finalAmount = calculateFinalAmount()
      const originalAmount =
        formData.paymentMethod === "mixed"
          ? Number(formData.cashAmount) + Number(formData.onlineAmount)
          : Number(formData.cashAmount)

      const selectedDoctor = doctors.find((d) => d.id === formData.doctor)
      const doctorName = selectedDoctor ? selectedDoctor.name : "No Doctor"

      const updatedData: any = {
        name: formData.name,
        phone: formData.phone,
        age: formData.age,
        gender: formData.gender,
        address: formData.address,
        date: formData.date.toISOString(),
        time: formData.time,
        appointmentType: formData.appointmentType,
        paymentMethod: formData.paymentMethod,
        cashAmount: Number(formData.cashAmount),
        onlineAmount: formData.paymentMethod === "mixed" ? Number(formData.onlineAmount) : 0,
        originalAmount: originalAmount,
        discount: Number(formData.discount),
        amount: finalAmount,
        doctor: formData.doctor,
        doctorName: doctorName,
        message: formData.message,
        referredBy: formData.referredBy,
        modality: formData.modality,
        visitType: formData.visitType,
        study: formData.study,
        lastModifiedBy: currentUserEmail || "unknown",
        lastModifiedAt: new Date().toISOString(),
      }

      await update(ref(db, `patients/opddetail/${uhidEditing}/${opdIdEditing}`), updatedData)

      const patientUpdateData = {
        name: formData.name,
        phone: formData.phone,
        age: formData.age,
        gender: formData.gender,
        address: formData.address,
        updatedAt: new Date().toISOString(),
      }
      await update(ref(db, `patients/patientinfo/${uhidEditing}`), patientUpdateData)

      const changesRef = ref(db, "opdChanges")
      const newChangeRef = push(changesRef)
      await set(newChangeRef, {
        type: "edit",
        appointmentId: opdIdEditing,
        patientId: uhidEditing,
        patientName: formData.name,
        editedBy: currentUserEmail || "unknown",
        editedAt: new Date().toISOString(),
        changes: updatedData,
      })

      toast.success("Appointment updated successfully!")
      setEditDialogOpen(false)
      setUhidEditing(null)
      setOpdIdEditing(null)

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
      const appointmentData = await get(ref(db, `patients/opddetail/${toDeleteSummary.uhid}/${toDeleteSummary.id}`))
      const data = appointmentData.val()

      const changesRef = ref(db, "opdChanges")
      const newChangeRef = push(changesRef)
      await set(newChangeRef, {
        type: "delete",
        appointmentId: toDeleteSummary.id,
        patientId: toDeleteSummary.uhid,
        patientName: toDeleteSummary.name,
        appointmentData: data,
        deletedBy: currentUserEmail || "unknown",
        deletedAt: new Date().toISOString(),
      })

      await remove(ref(db, `patients/opddetail/${toDeleteSummary.uhid}/${toDeleteSummary.id}`))

      toast.success("Appointment deleted successfully!")
      setDeleteDialogOpen(false)
      setToDeleteSummary(null)

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
                    Enhanced with specialist tracking, mixed payments & comprehensive filtering
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
              {/* Enhanced Search and Filters */}
              <div className="mb-6 space-y-4">
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

                  <div className="flex gap-2 flex-wrap">
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

                    {/* Modality Filter */}
                    <Select value={filters.modality} onValueChange={(value) => handleFilterChange("modality", value)}>
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Modalities</SelectItem>
                        <SelectItem value="consultation">Consultation</SelectItem>
                        <SelectItem value="casualty">Casualty</SelectItem>
                        <SelectItem value="xray">X-Ray</SelectItem>
                        <SelectItem value="pathology">Pathology</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Payment Method Filter */}
                    <Select
                      value={filters.paymentMethod}
                      onValueChange={(value) => handleFilterChange("paymentMethod", value)}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Payments</SelectItem>
                        {PaymentOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
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

              {/* Enhanced Appointments List */}
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
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                              <CardTitle className="text-lg">{appointment.uhid}</CardTitle>
                              <Badge variant="outline">{appointment.opdType.toUpperCase()}</Badge>
                              <Badge
                                variant={appointment.appointmentType === "visithospital" ? "default" : "secondary"}
                              >
                                {appointment.appointmentType === "visithospital" ? "Hospital Visit" : "On-Call"}
                              </Badge>
                              <Badge variant="outline" className="capitalize">
                                {appointment.modality}
                              </Badge>
                              {appointment.visitType && (
                                <Badge variant="secondary" className="capitalize">
                                  {appointment.visitType}
                                </Badge>
                              )}
                            </div>

                            <div className="text-sm text-gray-700 mb-2 flex items-center gap-4 flex-wrap">
                              <span className="flex items-center gap-1">
                                <PersonIcon className="h-4 w-4" />
                                {appointment.name}
                              </span>
                              {appointment.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-4 w-4" />
                                  {appointment.phone}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Cake className="h-4 w-4" />
                                {appointment.age} years
                              </span>
                              <span className="flex items-center gap-1">
                                <IndianRupeeIcon className="h-4 w-4" />
                                {formatPaymentDisplay(appointment)}
                                {appointment.discount > 0 && (
                                  <span className="text-green-600 text-xs ml-1">(-₹{appointment.discount})</span>
                                )}
                              </span>
                              <Badge
                                variant={appointment.paymentMethod === "mixed" ? "default" : "outline"}
                                className="text-xs"
                              >
                                {appointment.paymentMethod}
                              </Badge>
                            </div>

                            <CardDescription className="flex items-center gap-4 flex-wrap">
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
                              {appointment.study && (
                                <span className="text-xs text-gray-500">Study: {appointment.study}</span>
                              )}
                              {appointment.referredBy && (
                                <span className="text-xs text-gray-500">Ref: {appointment.referredBy}</span>
                              )}
                              {appointment.address && (
                                <span className="flex items-center gap-1 text-xs text-gray-500">
                                  <MapPin className="h-3 w-3" />
                                  {appointment.address.substring(0, 50)}
                                  {appointment.address.length > 50 && "..."}
                                </span>
                              )}
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

      {/* Enhanced Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
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
                <div className="relative">
                  <PersonIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    id="edit-name"
                    {...register("name", { required: "Name is required" })}
                    placeholder="Enter patient name"
                    className="pl-10"
                  />
                </div>
                {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
              </div>

              {/* Phone Number */}
              <div className="space-y-2">
                <Label htmlFor="edit-phone">
                  Phone Number <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
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
                    className="pl-10"
                  />
                </div>
                {errors.phone && <p className="text-sm text-red-500">{errors.phone.message}</p>}
              </div>

              {/* Age */}
              <div className="space-y-2">
                <Label htmlFor="edit-age">
                  Age <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Cake className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    id="edit-age"
                    type="number"
                    {...register("age", {
                      required: "Age is required",
                      min: { value: 1, message: "Age must be ≥ 1" },
                    })}
                    placeholder="Enter age"
                    className="pl-10"
                  />
                </div>
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

              {/* Appointment Type */}
              <div className="space-y-2">
                <Label htmlFor="edit-appointmentType">
                  Appointment Type <span className="text-red-500">*</span>
                </Label>
                <Controller
                  control={control}
                  name="appointmentType"
                  rules={{ required: "Appointment type is required" }}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select appointment type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="visithospital">Visit Hospital</SelectItem>
                        <SelectItem value="oncall">On-Call</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.appointmentType && <p className="text-sm text-red-500">{errors.appointmentType.message}</p>}
              </div>

              {/* Modality */}
              <div className="space-y-2">
                <Label htmlFor="edit-modality">
                  Modality <span className="text-red-500">*</span>
                </Label>
                <Controller
                  control={control}
                  name="modality"
                  rules={{ required: "Modality is required" }}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select modality" />
                      </SelectTrigger>
                      <SelectContent>
                        {ModalityOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.modality && <p className="text-sm text-red-500">{errors.modality.message}</p>}
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
                        {getFilteredDoctors().map((doc) => (
                          <SelectItem key={doc.id} value={doc.id}>
                            <div className="flex flex-col">
                              <span className="font-medium">{doc.name}</span>
                              <span className="text-xs text-gray-500">
                                ID: {doc.id} |{" "}
                                {Array.isArray(doc.specialist) ? doc.specialist.join(", ") : doc.specialist}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.doctor && <p className="text-sm text-red-500">{errors.doctor.message}</p>}
              </div>

              {/* Visit Type (for consultation) */}
              {watchedModality === "consultation" && (
                <div className="space-y-2">
                  <Label htmlFor="edit-visitType">Visit Type</Label>
                  <Controller
                    control={control}
                    name="visitType"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select visit type" />
                        </SelectTrigger>
                        <SelectContent>
                          {VisitTypeOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                              {watchedDoctor &&
                                (() => {
                                  const selectedDoctor = doctors.find((d) => d.id === watchedDoctor)
                                  if (selectedDoctor) {
                                    const charge =
                                      opt.value === "first"
                                        ? selectedDoctor.firstVisitCharge
                                        : selectedDoctor.followUpCharge
                                    return ` - ₹${charge}`
                                  }
                                  return ""
                                })()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              )}

              {/* Study (for casualty/xray/pathology) */}
              {(watchedModality === "casualty" || watchedModality === "xray" || watchedModality === "pathology") && (
                <div className="space-y-2">
                  <Label htmlFor="edit-study">{watchedModality === "pathology" ? "Pathology Test" : "Study"}</Label>
                  {watchedModality === "casualty" ? (
                    <Input id="edit-study" {...register("study")} placeholder="Enter study details" />
                  ) : watchedModality === "xray" ? (
                    <Controller
                      control={control}
                      name="study"
                      render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select X-Ray study" />
                          </SelectTrigger>
                          <SelectContent>
                            {XRayStudyOptions.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  ) : (
                    <Controller
                      control={control}
                      name="study"
                      render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select pathology test" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            {PathologyStudyOptions.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  )}
                </div>
              )}

              {/* Address */}
              <div className="space-y-2 col-span-2">
                <Label htmlFor="edit-address">Address</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
                  <Textarea
                    id="edit-address"
                    {...register("address")}
                    placeholder="Enter address"
                    className="pl-10 min-h-[80px]"
                  />
                </div>
              </div>

              {/* Date */}
              <div className="space-y-2">
                <Label htmlFor="edit-date">
                  Appointment Date <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
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
                        className="w-full pl-10 pr-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 border-gray-300 dark:border-gray-600 dark:bg-gray-800"
                      />
                    )}
                  />
                </div>
                {errors.date && <p className="text-sm text-red-500">{errors.date.message}</p>}
              </div>

              {/* Time */}
              <div className="space-y-2">
                <Label htmlFor="edit-time">
                  Appointment Time <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    id="edit-time"
                    {...register("time", { required: "Time is required" })}
                    placeholder="e.g. 10:30 AM"
                    className="pl-10"
                  />
                </div>
                {errors.time && <p className="text-sm text-red-500">{errors.time.message}</p>}
              </div>

              {/* Payment Method */}
              {watchedAppointmentType === "visithospital" && (
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
              )}

              {/* Payment Amounts */}
              {watchedAppointmentType === "visithospital" &&
                (watchedPaymentMethod === "mixed" ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="edit-cashAmount">
                        Cash Amount (₹) <span className="text-red-500">*</span>
                      </Label>
                      <div className="relative">
                        <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <Input
                          id="edit-cashAmount"
                          type="number"
                          {...register("cashAmount", {
                            required: "Cash amount is required",
                            min: { value: 0, message: "Amount must be ≥ 0" },
                            valueAsNumber: true,
                          })}
                          placeholder="Enter cash amount"
                          className="pl-10"
                        />
                      </div>
                      {errors.cashAmount && <p className="text-sm text-red-500">{errors.cashAmount.message}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit-onlineAmount">
                        Online Amount (₹) <span className="text-red-500">*</span>
                      </Label>
                      <div className="relative">
                        <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <Input
                          id="edit-onlineAmount"
                          type="number"
                          {...register("onlineAmount", {
                            required: "Online amount is required",
                            min: { value: 0, message: "Amount must be ≥ 0" },
                            valueAsNumber: true,
                          })}
                          placeholder="Enter online amount"
                          className="pl-10"
                        />
                      </div>
                      {errors.onlineAmount && <p className="text-sm text-red-500">{errors.onlineAmount.message}</p>}
                    </div>
                  </>
                ) : watchedPaymentMethod === "online" ? (
                  <div className="space-y-2">
                    <Label htmlFor="edit-onlineAmount">
                      Online Amount (₹) <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                      <Input
                        id="edit-onlineAmount"
                        type="number"
                        {...register("onlineAmount", {
                          required: "Online amount is required",
                          min: { value: 0, message: "Amount must be ≥ 0" },
                          valueAsNumber: true,
                        })}
                        placeholder="Enter online amount"
                        className="pl-10"
                      />
                    </div>
                    {errors.onlineAmount && <p className="text-sm text-red-500">{errors.onlineAmount.message}</p>}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="edit-cashAmount">
                      Amount (₹) <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                      <Input
                        id="edit-cashAmount"
                        type="number"
                        {...register("cashAmount", {
                          required: "Amount is required",
                          min: { value: 0, message: "Amount must be ≥ 0" },
                          valueAsNumber: true,
                        })}
                        placeholder="Enter amount"
                        className="pl-10"
                      />
                    </div>
                    {errors.cashAmount && <p className="text-sm text-red-500">{errors.cashAmount.message}</p>}
                  </div>
                ))}

              {/* Discount */}
              {watchedAppointmentType === "visithospital" && (
                <div className="space-y-2">
                  <Label htmlFor="edit-discount">Discount (₹)</Label>
                  <div className="relative">
                    <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                      id="edit-discount"
                      type="number"
                      {...register("discount", {
                        min: { value: 0, message: "Discount must be ≥ 0" },
                        valueAsNumber: true,
                        validate: (val) => {
                          const cashAmt = Number(watch("cashAmount")) || 0
                          const onlineAmt = Number(watch("onlineAmount")) || 0
                          const total = cashAmt + onlineAmt
                          return Number(val) <= total || "Discount cannot exceed total amount"
                        },
                      })}
                      placeholder="Enter discount"
                      className="pl-10"
                    />
                  </div>
                  {errors.discount && <p className="text-sm text-red-500">{errors.discount.message}</p>}
                 
                  {getCurrentDoctorCharges() > 0 && (
                    <div className="text-xs space-y-1">
                      <p className="text-gray-600">Doctor Charges: ₹{getCurrentDoctorCharges()}</p>
                      {watchedPaymentMethod === "mixed" && (
                        <p className="text-gray-600">
                          Total Paid: ₹{(Number(watchedCashAmount) || 0) + (Number(watchedOnlineAmount) || 0)}
                        </p>
                      )}
                      {watchedPaymentMethod === "cash" && (
                        <p className="text-gray-600">Cash Paid: ₹{Number(watchedCashAmount) || 0}</p>
                      )}
                      {watchedPaymentMethod === "online" && (
                        <p className="text-gray-600">Online Paid: ₹{Number(watchedOnlineAmount) || 0}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Referred By */}
              <div className="space-y-2">
                <Label htmlFor="edit-referredBy">Referred By</Label>
                <Input id="edit-referredBy" {...register("referredBy")} placeholder="Enter referrer name" />
              </div>

              {/* Message */}
              <div className="space-y-2 col-span-2">
                <Label htmlFor="edit-message">Additional Notes</Label>
                <div className="relative">
                  <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
                  <Textarea
                    id="edit-message"
                    {...register("message")}
                    placeholder="Enter notes"
                    className="pl-10 min-h-[100px]"
                  />
                </div>
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
