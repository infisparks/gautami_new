"use client"

import { useState, useEffect } from "react"
import { useForm, Controller } from "react-hook-form"
import { db, auth } from "../../lib/firebase"
import { ref, onValue, update, remove, push, set } from "firebase/database"
import { onAuthStateChanged } from "firebase/auth"
import { Phone, MessageSquare, DollarSign, Edit, Trash2, Search, ArrowLeft, Calendar, User, Stethoscope, History } from 'lucide-react'
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
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useRouter } from "next/navigation"
import type React from "react"

interface OPDAppointment {
  id: string
  patientId: string
  patientName: string
  phone: string
  age: number
  gender: string
  address?: string
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

const ManageOPDPage: React.FC = () => {
  const router = useRouter()
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)
  const [opdAppointments, setOpdAppointments] = useState<OPDAppointment[]>([])
  const [filteredAppointments, setFilteredAppointments] = useState<OPDAppointment[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(false)

  // Edit dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<OPDAppointment | null>(null)

  // Delete dialog states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [appointmentToDelete, setAppointmentToDelete] = useState<OPDAppointment | null>(null)

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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.email) {
        setCurrentUserEmail(user.email)
      } else {
        setCurrentUserEmail(null)
      }
    })
    return () => unsubscribe()
  }, [])

  // Fetch doctors
  useEffect(() => {
    const doctorsRef = ref(db, "doctors")
    const unsubscribe = onValue(doctorsRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const doctorsList: Doctor[] = Object.keys(data).map((key) => ({
          id: key,
          name: data[key].name,
          opdCharge: data[key].opdCharge || 0,
          specialty: data[key].specialty || "",
        }))
        doctorsList.unshift({ id: "no_doctor", name: "No Doctor", opdCharge: 0 })
        setDoctors(doctorsList)
      } else {
        setDoctors([{ id: "no_doctor", name: "No Doctor", opdCharge: 0 }])
      }
    })
    return () => unsubscribe()
  }, [])

  // Fetch OPD appointments from all patients
  useEffect(() => {
    const patientsRef = ref(db, "patients")
    const unsubscribe = onValue(patientsRef, (snapshot) => {
      const data = snapshot.val()
      const appointments: OPDAppointment[] = []

      if (data) {
        Object.keys(data).forEach((patientId) => {
          const patient = data[patientId]
          if (patient.opd) {
            Object.keys(patient.opd).forEach((opdId) => {
              const opd = patient.opd[opdId]
              appointments.push({
                id: opdId,
                patientId: patientId,
                patientName: patient.name,
                phone: patient.phone,
                age: patient.age || 0,
                gender: patient.gender || "",
                address: patient.address || "",
                date: opd.date,
                time: opd.time,
                paymentMethod: opd.paymentMethod || "",
                originalAmount: opd.originalAmount || 0,
                amount: opd.amount || 0,
                discount: opd.discount || 0,
                serviceName: opd.serviceName || "",
                doctor: opd.doctor || "",
                message: opd.message || "",
                referredBy: opd.referredBy || "",
                appointmentType: opd.appointmentType || "visithospital",
                opdType: opd.opdType || "opd",
                enteredBy: opd.enteredBy || "",
                createdAt: opd.createdAt || "",
              })
            })
          }
        })
      }

      // Sort by creation date (latest first)
      appointments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setOpdAppointments(appointments)
      setFilteredAppointments(appointments)
    })

    return () => unsubscribe()
  }, [])

  // Filter appointments based on search query
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredAppointments(opdAppointments)
    } else {
      const query = searchQuery.toLowerCase()
      const filtered = opdAppointments.filter(
        (appointment) =>
          appointment.patientName.toLowerCase().includes(query) ||
          appointment.phone.includes(query) ||
          appointment.serviceName.toLowerCase().includes(query) ||
          (appointment.doctor &&
            doctors
              .find((d) => d.id === appointment.doctor)
              ?.name.toLowerCase()
              .includes(query)),
      )
      setFilteredAppointments(filtered)
    }
  }, [searchQuery, opdAppointments, doctors])

  // Function to detect changes between original and new data
  const detectChanges = (original: any, updated: any) => {
    const changes: Array<{ field: string; oldValue: any; newValue: any }> = []
    
    const fieldsToCheck = [
      'name', 'phone', 'age', 'gender', 'address', 'date', 'time', 
      'paymentMethod', 'amount', 'discount', 'serviceName', 'doctor', 
      'message', 'referredBy'
    ]

    fieldsToCheck.forEach(field => {
      let oldVal = field === 'name' ? original.patientName : 
                   field === 'amount' ? original.originalAmount :
                   field === 'date' ? original.date :
                   original[field]
      
      let newVal = field === 'date' ? updated[field].toISOString() : updated[field]

      // Convert to string for comparison
      oldVal = String(oldVal || '')
      newVal = String(newVal || '')

      if (oldVal !== newVal) {
        changes.push({
          field,
          oldValue: oldVal,
          newValue: newVal
        })
      }
    })

    return changes
  }

  // Handle edit appointment
  const handleEditAppointment = (appointment: OPDAppointment) => {
    setSelectedAppointment(appointment)

    // Populate form with current data
    reset({
      name: appointment.patientName,
      phone: appointment.phone,
      age: appointment.age,
      gender: appointment.gender,
      address: appointment.address || "",
      date: new Date(appointment.date),
      time: appointment.time,
      paymentMethod: appointment.paymentMethod,
      amount: appointment.originalAmount,
      discount: appointment.discount,
      serviceName: appointment.serviceName,
      doctor: appointment.doctor,
      message: appointment.message || "",
      referredBy: appointment.referredBy || "",
    })

    setEditDialogOpen(true)
  }

  // Handle save edited appointment
  const handleSaveEdit = async (formData: EditFormData) => {
    if (!selectedAppointment) return

    setLoading(true)
    try {
      // Detect what fields were changed
      const changes = detectChanges(selectedAppointment, formData)
      
      if (changes.length === 0) {
        toast.info("No changes detected")
        setEditDialogOpen(false)
        setLoading(false)
        return
      }

      const finalAmount = formData.amount - formData.discount

      // Prepare updated data
      const updatedOpdData = {
        date: formData.date.toISOString(),
        time: formData.time,
        paymentMethod: formData.paymentMethod,
        originalAmount: formData.amount,
        amount: finalAmount,
        discount: formData.discount,
        serviceName: formData.serviceName,
        doctor: formData.doctor,
        message: formData.message,
        referredBy: formData.referredBy,
        appointmentType: selectedAppointment.appointmentType,
        opdType: selectedAppointment.opdType,
        enteredBy: selectedAppointment.enteredBy,
        createdAt: selectedAppointment.createdAt,
        lastModifiedBy: currentUserEmail || "unknown",
        lastModifiedAt: new Date().toISOString(),
      }

      const updatedPatientData = {
        name: formData.name,
        phone: formData.phone,
        age: formData.age,
        gender: formData.gender,
        address: formData.address,
        referredBy: formData.referredBy,
      }

      // Save optimized changes to tracking node
      const changesRef = ref(db, "opdChanges")
      const newChangeRef = push(changesRef)
      await set(newChangeRef, {
        type: "edit",
        appointmentId: selectedAppointment.id,
        patientId: selectedAppointment.patientId,
        patientName: selectedAppointment.patientName,
        changes: changes, // Array of changed fields with old/new values
        editedBy: currentUserEmail || "unknown",
        editedAt: new Date().toISOString(),
      })

      // Update patient data
      const patientRef = ref(db, `patients/${selectedAppointment.patientId}`)
      await update(patientRef, updatedPatientData)

      // Update OPD data
      const opdRef = ref(db, `patients/${selectedAppointment.patientId}/opd/${selectedAppointment.id}`)
      await update(opdRef, updatedOpdData)

      toast.success("Appointment updated successfully!")
      setEditDialogOpen(false)
      setSelectedAppointment(null)
    } catch (error) {
      console.error("Error updating appointment:", error)
      toast.error("Failed to update appointment")
    } finally {
      setLoading(false)
    }
  }

  // Handle delete appointment
  const handleDeleteAppointment = async () => {
    if (!appointmentToDelete) return

    setLoading(true)
    try {
      // Save minimal delete info to tracking node
      const changesRef = ref(db, "opdChanges")
      const newChangeRef = push(changesRef)
      await set(newChangeRef, {
        type: "delete",
        appointmentId: appointmentToDelete.id,
        patientId: appointmentToDelete.patientId,
        appointmentData: {
          patientName: appointmentToDelete.patientName,
          phone: appointmentToDelete.phone,
          date: appointmentToDelete.date,
          time: appointmentToDelete.time,
          serviceName: appointmentToDelete.serviceName,
          doctor: appointmentToDelete.doctor,
          amount: appointmentToDelete.amount,
          appointmentType: appointmentToDelete.appointmentType,
          opdType: appointmentToDelete.opdType,
        },
        deletedBy: currentUserEmail || "unknown",
        deletedAt: new Date().toISOString(),
      })

      // Delete the OPD appointment
      const opdRef = ref(db, `patients/${appointmentToDelete.patientId}/opd/${appointmentToDelete.id}`)
      await remove(opdRef)

      toast.success("Appointment deleted successfully!")
      setDeleteDialogOpen(false)
      setAppointmentToDelete(null)
    } catch (error) {
      console.error("Error deleting appointment:", error)
      toast.error("Failed to delete appointment")
    } finally {
      setLoading(false)
    }
  }

  const getDoctorName = (doctorId: string) => {
    const doctor = doctors.find((d) => d.id === doctorId)
    return doctor ? doctor.name : doctorId
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
                    View, edit, and manage all OPD appointments
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push("/opd-changes")}
                    className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                  >
                    <History className="mr-2 h-4 w-4" />
                    View Changes
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push("/opd-booking")}
                    className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Booking
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              {/* Search and Filter Section */}
              <div className="mb-6">
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                      placeholder="Search by name, phone, service, or doctor..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <div className="text-sm text-gray-600">Total: {filteredAppointments.length} appointments</div>
                </div>
              </div>

              {/* Appointments List */}
              {filteredAppointments.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  {searchQuery ? "No matching appointments found" : "No OPD appointments found"}
                </div>
              ) : (
                <ScrollArea className="h-[600px]">
                  <div className="space-y-4">
                    {filteredAppointments.map((appointment) => (
                      <Card
                        key={`${appointment.patientId}-${appointment.id}`}
                        className="overflow-hidden hover:shadow-md transition-shadow"
                      >
                        <CardHeader className="bg-gray-50 dark:bg-gray-800 p-4">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <CardTitle className="text-lg">{appointment.patientName}</CardTitle>
                                <Badge variant="outline">{appointment.opdType.toUpperCase()}</Badge>
                                <Badge
                                  variant={appointment.appointmentType === "visithospital" ? "default" : "secondary"}
                                >
                                  {appointment.appointmentType === "visithospital" ? "Hospital Visit" : "On-Call"}
                                </Badge>
                              </div>
                              <CardDescription className="flex items-center gap-4">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-4 w-4" />
                                  {new Date(appointment.date).toLocaleDateString()} at {appointment.time}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Phone className="h-4 w-4" />
                                  {appointment.phone}
                                </span>
                              </CardDescription>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditAppointment(appointment)}
                                className="text-blue-600 hover:text-blue-700"
                              >
                                <Edit className="h-4 w-4 mr-1" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setAppointmentToDelete(appointment)
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

                        <CardContent className="p-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-gray-500" />
                                <span className="font-medium">Patient Info</span>
                              </div>
                              <div className="pl-6 space-y-1">
                                <div>Age: {appointment.age}</div>
                                <div>Gender: {appointment.gender}</div>
                                {appointment.address && <div>Address: {appointment.address}</div>}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Stethoscope className="h-4 w-4 text-gray-500" />
                                <span className="font-medium">Medical Info</span>
                              </div>
                              <div className="pl-6 space-y-1">
                                <div>Service: {appointment.serviceName}</div>
                                <div>Doctor: {getDoctorName(appointment.doctor)}</div>
                                {appointment.referredBy && <div>Referred by: {appointment.referredBy}</div>}
                              </div>
                            </div>

                            {appointment.appointmentType === "visithospital" && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <DollarSign className="h-4 w-4 text-gray-500" />
                                  <span className="font-medium">Payment Info</span>
                                </div>
                                <div className="pl-6 space-y-1">
                                  <div>Method: {appointment.paymentMethod}</div>
                                  <div>Amount: ₹{appointment.originalAmount}</div>
                                  {appointment.discount > 0 && (
                                    <>
                                      <div>Discount: ₹{appointment.discount}</div>
                                      <div className="font-medium">Final: ₹{appointment.amount}</div>
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {appointment.message && (
                            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
                              <div className="flex items-center gap-2 mb-1">
                                <MessageSquare className="h-4 w-4 text-gray-500" />
                                <span className="font-medium text-sm">Notes</span>
                              </div>
                              <p className="text-sm text-gray-600 dark:text-gray-300">{appointment.message}</p>
                            </div>
                          )}

                          <div className="mt-4 pt-3 border-t text-xs text-gray-500">
                            <div>Created: {new Date(appointment.createdAt).toLocaleString()}</div>
                            <div>Entered by: {appointment.enteredBy}</div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
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
            <DialogDescription>Update appointment details for {selectedAppointment?.patientName}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(handleSaveEdit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Patient Name */}
              <div className="space-y-2">
                <Label htmlFor="edit-name">Patient Name *</Label>
                <Input
                  id="edit-name"
                  {...register("name", { required: "Name is required" })}
                  placeholder="Enter patient name"
                />
                {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Phone Number *</Label>
                <Input
                  id="edit-phone"
                  {...register("phone", {
                    required: "Phone is required",
                    pattern: {
                      value: /^[0-9]{10}$/,
                      message: "Enter valid 10-digit phone number",
                    },
                  })}
                  placeholder="Enter phone number"
                />
                {errors.phone && <p className="text-sm text-red-500">{errors.phone.message}</p>}
              </div>

              {/* Age */}
              <div className="space-y-2">
                <Label htmlFor="edit-age">Age *</Label>
                <Input
                  id="edit-age"
                  type="number"
                  {...register("age", {
                    required: "Age is required",
                    min: { value: 1, message: "Age must be positive" },
                  })}
                  placeholder="Enter age"
                />
                {errors.age && <p className="text-sm text-red-500">{errors.age.message}</p>}
              </div>

              {/* Gender */}
              <div className="space-y-2">
                <Label htmlFor="edit-gender">Gender *</Label>
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
                        {GenderOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
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
                <Label htmlFor="edit-date">Appointment Date *</Label>
                <Controller
                  control={control}
                  name="date"
                  rules={{ required: "Date is required" }}
                  render={({ field }) => (
                    <DatePicker
                      selected={field.value}
                      onChange={(date: Date | null) => date && field.onChange(date)}
                      dateFormat="dd/MM/yyyy"
                      placeholderText="Select Date"
                      className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  )}
                />
                {errors.date && <p className="text-sm text-red-500">{errors.date.message}</p>}
              </div>

              {/* Time */}
              <div className="space-y-2">
                <Label htmlFor="edit-time">Appointment Time *</Label>
                <Input
                  id="edit-time"
                  {...register("time", { required: "Time is required" })}
                  placeholder="e.g. 10:30 AM"
                />
                {errors.time && <p className="text-sm text-red-500">{errors.time.message}</p>}
              </div>

              {/* Service Name */}
              <div className="space-y-2">
                <Label htmlFor="edit-serviceName">Service Name *</Label>
                <Input
                  id="edit-serviceName"
                  {...register("serviceName", { required: "Service name is required" })}
                  placeholder="Enter service name"
                />
                {errors.serviceName && <p className="text-sm text-red-500">{errors.serviceName.message}</p>}
              </div>

              {/* Doctor */}
              <div className="space-y-2">
                <Label htmlFor="edit-doctor">Doctor *</Label>
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
                        {doctors.map((doctor) => (
                          <SelectItem key={doctor.id} value={doctor.id}>
                            {doctor.name} {doctor.specialty ? `(${doctor.specialty})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.doctor && <p className="text-sm text-red-500">{errors.doctor.message}</p>}
              </div>

              {/* Payment Method - only for hospital visits */}
              {selectedAppointment?.appointmentType === "visithospital" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="edit-paymentMethod">Payment Method *</Label>
                    <Controller
                      control={control}
                      name="paymentMethod"
                      rules={{ required: "Payment method is required" }}
                      render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select payment method" />
                          </SelectTrigger>
                          <SelectContent>
                            {PaymentOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
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
                    <Label htmlFor="edit-amount">Amount (₹) *</Label>
                    <Input
                      id="edit-amount"
                      type="number"
                      {...register("amount", {
                        required: "Amount is required",
                        min: { value: 0, message: "Amount must be positive" },
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
                        min: { value: 0, message: "Discount must be positive" },
                        validate: (value) => {
                          const amount = watch("amount")
                          return value <= amount || "Discount cannot exceed amount"
                        },
                      })}
                      placeholder="Enter discount"
                    />
                    {errors.discount && <p className="text-sm text-red-500">{errors.discount.message}</p>}
                    {watch("discount") > 0 && (
                      <p className="text-sm text-emerald-600">Final amount: ₹{watch("amount") - watch("discount")}</p>
                    )}
                  </div>
                </>
              )}

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
                  placeholder="Enter additional notes"
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
            <AlertDialogDescription>
              Are you sure you want to delete the appointment for {appointmentToDelete?.patientName}? This action cannot
              be undone, but will be tracked in the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAppointmentToDelete(null)}>Cancel</AlertDialogCancel>
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

export default ManageOPDPage
