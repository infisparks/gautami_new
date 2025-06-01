"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useForm, Controller } from "react-hook-form"
import { db, auth } from "../../lib/firebase"
import { db as dbMedford } from "../../lib/firebaseMedford"
import { ref, push, update, get, onValue, set } from "firebase/database"
import { Phone, Cake, MapPin, Clock, MessageSquare, IndianRupeeIcon, Info, CheckCircle } from "lucide-react"
import { toast } from "react-toastify"
import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { PersonIcon, CalendarIcon } from "@radix-ui/react-icons"
import { onAuthStateChanged } from "firebase/auth"
interface IFormInput {
  name: string
  phone: string
  age: number
  gender: string
  address?: string
  date: Date
  time: string
  message?: string
  paymentMethod: string
  amount: number
  discount: number
  serviceName: string
  doctor: string
  referredBy?: string
  appointmentType: "oncall" | "visithospital"
  opdType: "opd"
}

interface PatientRecord {
  id: string
  name: string
  phone: string
  age?: number
  gender?: string
  address?: string
  createdAt?: string
  opd?: any
}

interface MedfordPatient {
  patientId: string
  name: string
  contact: string
  dob: string
  gender: string
  hospitalName: string
}

interface CombinedPatient {
  id: string
  name: string
  phone?: string
  source: "gautami" | "other"
  data: PatientRecord | MedfordPatient
}

interface Doctor {
  id: string
  name: string
  opdCharge: number
  specialty?: string
}

interface OnCallAppointment {
  id: string
  name: string
  phone: string
  age: number
  gender: string
  date: string
  time: string
  doctor?: string
  serviceName?: string
  appointmentType: "oncall"
  createdAt: string
  opdType: "opd"
}

interface BookingFormProps {
  prefilledData?: Partial<OnCallAppointment>
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

function formatAMPM(date: Date): string {
  let hours = date.getHours()
  let minutes: string | number = date.getMinutes()
  const ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12
  hours = hours ? hours : 12
  minutes = minutes < 10 ? "0" + minutes : minutes
  return `${hours}:${minutes} ${ampm}`
}

function generatePatientId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let result = ""
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

const formatPatientInfo = (patient: CombinedPatient): string => {
  if (patient.source === "gautami") {
    const data = patient.data as PatientRecord
    return `${data.age ? `Age: ${data.age}` : ""}${data.gender ? ` | ${data.gender}` : ""}`
  } else {
    const data = patient.data as MedfordPatient
    let info = ""
    if (data.dob) {
      try {
        const dobDate = new Date(data.dob)
        const today = new Date()
        let age = today.getFullYear() - dobDate.getFullYear()
        const monthDiff = today.getMonth() - dobDate.getMonth()
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDate.getDate())) {
          age--
        }
        info += `Age: ${age > 0 ? age : "N/A"}`
      } catch {
        info += "Age: N/A"
      }
    }
    if (data.gender) {
      info += `${info ? " | " : ""}${data.gender}`
    }
    return info
  }
}

export default function BookingForm({ prefilledData }: BookingFormProps) {
  const [enteredBy, setEnteredBy] = useState<string>("")

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user?.email) setEnteredBy(user.email)
    })
    return unsubscribe
  }, [])
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    reset,
    watch,
    setValue,
    trigger,
  } = useForm<IFormInput>({
    defaultValues: {
      name: prefilledData?.name || "",
      phone: prefilledData?.phone || "",
      age: prefilledData?.age || 0,
      gender: prefilledData?.gender || "",
      address: "",
      date: new Date(),
      time: formatAMPM(new Date()),
      message: "",
      paymentMethod: "",
      amount: 0,
      discount: 0,
      serviceName: prefilledData?.serviceName || "",
      doctor: prefilledData?.doctor || "",
      referredBy: "",
      appointmentType: "visithospital",
      opdType: "opd",
    },
    mode: "onChange",
  })

  const [loading, setLoading] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [patientNameInput, setPatientNameInput] = useState(prefilledData?.name || "")
  const [patientSuggestions, setPatientSuggestions] = useState<CombinedPatient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<CombinedPatient | null>(null)
  const [patientPhoneInput, setPatientPhoneInput] = useState(prefilledData?.phone || "")
  const [phoneSuggestions, setPhoneSuggestions] = useState<CombinedPatient[]>([])
  const [gautamiPatients, setGautamiPatients] = useState<CombinedPatient[]>([])
  const [medfordPatients, setMedfordPatients] = useState<CombinedPatient[]>([])

  const nameInputRef = useRef<HTMLInputElement>(null)
  const phoneInputRef = useRef<HTMLInputElement>(null)
  const ageInputRef = useRef<HTMLInputElement>(null)

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

  // Fetch patients from Gautami DB
  useEffect(() => {
    const patientsRef = ref(db, "patients")
    const unsubscribe = onValue(patientsRef, (snapshot) => {
      const data = snapshot.val()
      const loaded: CombinedPatient[] = []
      if (data) {
        for (const key in data) {
          loaded.push({
            id: key,
            name: data[key].name,
            phone: data[key].phone,
            source: "gautami",
            data: { ...data[key], id: key },
          })
        }
      }
      setGautamiPatients(loaded)
    })
    return () => unsubscribe()
  }, [])

  // Fetch patients from Medford Family DB
  useEffect(() => {
    const medfordRef = ref(dbMedford, "patients")
    const unsubscribe = onValue(medfordRef, (snapshot) => {
      const data = snapshot.val()
      const loaded: CombinedPatient[] = []
      if (data) {
        for (const key in data) {
          const rec: MedfordPatient = data[key]
          loaded.push({
            id: rec.patientId,
            name: rec.name,
            phone: rec.contact,
            source: "other",
            data: rec,
          })
        }
      }
      setMedfordPatients(loaded)
    })
    return () => unsubscribe()
  }, [])

  // Combined suggestions for the name field
  useEffect(() => {
    const allCombined = [...gautamiPatients, ...medfordPatients]
    if (patientNameInput.length >= 2) {
      if (selectedPatient && patientNameInput === selectedPatient.name) {
        setPatientSuggestions([])
      } else {
        const lower = patientNameInput.toLowerCase()
        const suggestions = allCombined.filter((p) => p.name.toLowerCase().includes(lower))
        setPatientSuggestions(suggestions)
      }
    } else {
      setPatientSuggestions([])
    }
  }, [patientNameInput, gautamiPatients, medfordPatients, selectedPatient])

  const handlePatientSuggestionClick = (patient: CombinedPatient) => {
    setSelectedPatient(patient)
    setPatientNameInput(patient.name)
    setPatientPhoneInput(patient.phone || "")
    setValue("name", patient.name)
    setValue("phone", patient.phone || "")
  
    if (patient.source === "gautami") {
      const gautamiData = patient.data as PatientRecord
      setValue("address", gautamiData.address || "")
      setValue("age", gautamiData.age || 0)
      setValue("gender", gautamiData.gender || "")
    } else {
      const medfordData = patient.data as MedfordPatient
      setValue("gender", medfordData.gender || "")
  
      // Calculate age from date of birth if available
      if (medfordData.dob) {
        try {
          const dobDate = new Date(medfordData.dob)
          const today = new Date()
          let age = today.getFullYear() - dobDate.getFullYear()
          const monthDiff = today.getMonth() - dobDate.getMonth()
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDate.getDate())) {
            age--
          }
          setValue("age", age > 0 ? age : 0)
        } catch (error) {
          setValue("age", 0)
        }
      }
    }
  
    setPatientSuggestions([])
    setPhoneSuggestions([])
    trigger(["name", "phone", "age", "gender"]) // Validates after filling
  
    toast.info(`Patient ${patient.name} selected from ${patient.source.toUpperCase()}! Details auto-filled.`)
  }
  

  const selectedDoctorId = watch("doctor")
  const fetchDoctorAmount = useCallback(
    async (doctorId: string) => {
      try {
        const doctorRef = ref(db, `doctors/${doctorId}`)
        const snapshot = await get(doctorRef)
        if (snapshot.exists()) {
          const data = snapshot.val()
          setValue("amount", data.opdCharge || 0)
        } else {
          setValue("amount", 0)
        }
      } catch (error) {
        console.error("Error fetching doctor amount:", error)
        setValue("amount", 0)
      }
    },
    [setValue],
  )

  useEffect(() => {
    if (selectedDoctorId) {
      if (selectedDoctorId === "no_doctor") {
        setValue("amount", 0)
      } else {
        fetchDoctorAmount(selectedDoctorId)
      }
    } else {
      setValue("amount", 0)
    }
  }, [selectedDoctorId, setValue, fetchDoctorAmount])

  const validateAndSubmit = async (data: IFormInput) => {
    const requiredFields = ["name", "phone", "age", "gender", "date", "time", "opdType"]

    if (data.appointmentType === "visithospital") {
      requiredFields.push("paymentMethod", "serviceName", "doctor")
    } else {
      requiredFields.push("serviceName", "doctor")
    }

    const isValid = await trigger(requiredFields as any)

    if (!isValid) {
      if (errors.name) {
        nameInputRef.current?.focus()
        toast.error("Please enter patient name")
        return
      }
      if (errors.phone) {
        phoneInputRef.current?.focus()
        toast.error("Please enter a valid phone number")
        return
      }
      if (errors.age) {
        ageInputRef.current?.focus()
        toast.error("Please enter patient age")
        return
      }
      if (errors.gender) {
        toast.error("Please select patient gender")
        return
      }
      if (errors.serviceName) {
        toast.error("Please enter service name")
        return
      }
      if (errors.doctor) {
        toast.error("Please select a doctor")
        return
      }
      if (errors.opdType) {
        toast.error("Please select OPD type")
        return
      }

      toast.error("Please fill all required fields")
      return
    }

    onSubmit(data)
  }

  const onSubmit = async (data: IFormInput) => {
    setLoading(true)
    try {
      const original = data.amount // original amount before discount
      const discount = data.discount || 0
      const netAmount = original - discount

      const appointmentData = {
        date: data.date.toISOString(),
        time: data.time,
        paymentMethod: data.appointmentType === "visithospital" ? data.paymentMethod : "",
        serviceName: data.serviceName,
        doctor: data.doctor || "no_doctor",

        // Add these fields
        enteredBy, // logged-in user's email
        originalAmount: original, // amount before discount
        serviceAmount: original, // same as original amount
        discount: discount, // discount value
        amount: netAmount, // amount after discount

        message: data.message || "",
        referredBy: data.referredBy || "",
        appointmentType: data.appointmentType,
        opdType: data.opdType,
        createdAt: new Date().toISOString(),
      }

      if (data.appointmentType === "oncall") {
        const oncallRef = ref(db, "oncall")
        const newOncallRef = push(oncallRef)
        await set(newOncallRef, {
          name: data.name,
          phone: data.phone,
          age: data.age,
          gender: data.gender,
          date: data.date.toISOString(),
          time: data.time,
          doctor: data.doctor,
          serviceName: data.serviceName,
          appointmentType: "oncall",
          opdType: data.opdType,
          enteredBy,
          originalAmount: original,
          serviceAmount: original,
          discount,
          amount: netAmount,
          createdAt: new Date().toISOString(),
        })

        try {
          const selectedDocName = doctors.find((doc) => doc.id === data.doctor)?.name || "No Doctor"
          const formattedDate = data.date.toLocaleDateString("en-IN")
          const professionalMessage = `Hello ${data.name},

Your On-Call appointment at Gautami Hospital has been successfully booked.

Appointment Details:
• Patient Name: ${data.name}
• Date: ${formattedDate}
• Time: ${data.time}
• Doctor: ${selectedDocName}
• Service: ${data.serviceName}

Our doctor will call you at the scheduled time. Please keep your phone available.

Thank you,
Medford Hospital`

          const phoneWithCountryCode = `91${data.phone.replace(/\D/g, "")}`

          await fetch("https://wa.medblisss.com/send-text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token: "99583991572",
              number: phoneWithCountryCode,
              message: professionalMessage,
            }),
          })
        } catch (whatsappError) {
          console.error("Error sending WhatsApp message:", whatsappError)
        }

        toast.success("On-call appointment booked successfully!", {
          position: "top-right",
          autoClose: 5000,
        })
      } else {
        let patientId = ""
        if (selectedPatient) {
          patientId = selectedPatient.id
          const patientRef = ref(db, `patients/${patientId}`)
          await update(patientRef, {
            name: data.name,
            phone: data.phone,
            age: data.age,
            address: data.address,
            gender: data.gender,
            referredBy: data.referredBy || "",
          })
        } else {
          const newPatientId = generatePatientId()
          const newPatientData = {
            name: data.name,
            phone: data.phone,
            age: data.age,
            gender: data.gender,
            address: data.address || "",
            referredBy: data.referredBy || "",
            createdAt: new Date().toISOString(),
            uhid: newPatientId,
          }
          await set(ref(db, `patients/${newPatientId}`), newPatientData)
          await set(ref(dbMedford, `patients/${newPatientId}`), {
            name: data.name,
            contact: data.phone,
            gender: data.gender,
            dob: "",
            patientId: newPatientId,
            hospitalName: "MEDFORD",
          })
          patientId = newPatientId
        }

        const opdRef = ref(db, `patients/${patientId}/opd`)
        const newOpdRef = push(opdRef)
        await update(newOpdRef, appointmentData)

        try {
          const selectedDocName = doctors.find((doc) => doc.id === data.doctor)?.name || "No Doctor"
          const formattedDate = data.date.toLocaleDateString("en-IN")
          const professionalMessage = `Hello ${data.name},

Your OPD appointment at Gautami Hospital has been successfully booked.

Appointment Details:
• Patient Name: ${data.name}
• Date: ${formattedDate}
• Time: ${data.time}
• Doctor: ${selectedDocName}
• Service: ${data.serviceName}
• Payment: ${data.paymentMethod.toUpperCase()} (₹${data.amount}${data.discount > 0 ? ` - Discount: ₹${data.discount} = Final: ₹${data.amount - data.discount}` : ""})

We look forward to serving you!

Thank you,
Medford Hospital`

          const phoneWithCountryCode = `91${data.phone.replace(/\D/g, "")}`

          await fetch("https://wa.medblisss.com/send-text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token: "99583991572",
              number: phoneWithCountryCode,
              message: professionalMessage,
            }),
          })
        } catch (whatsappError) {
          console.error("Error sending WhatsApp message:", whatsappError)
        }

        toast.success("Appointment booked successfully!", {
          position: "top-right",
          autoClose: 5000,
        })
      }

      reset({
        name: "",
        phone: "",
        age: 0,
        gender: "",
        address: "",
        date: new Date(),
        time: formatAMPM(new Date()),
        message: "",
        paymentMethod: "",
        amount: 0,
        discount: 0,
        serviceName: "",
        doctor: "",
        referredBy: "",
        appointmentType: "visithospital",
        opdType: "opd",
      })
      setPreviewOpen(false)
      setSelectedPatient(null)
      setPatientNameInput("")
      setPatientPhoneInput("")
    } catch (error) {
      console.error("Error booking appointment:", error)
      toast.error("Failed to book appointment. Please try again.", {
        position: "top-right",
        autoClose: 5000,
      })
    } finally {
      setLoading(false)
    }
  }

  // Handle clicks outside the patient name suggestions dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        patientSuggestions.length > 0 &&
        nameInputRef.current &&
        !nameInputRef.current.contains(event.target as Node)
      ) {
        setPatientSuggestions([])
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [patientSuggestions])

  // Handle clicks outside the phone suggestions dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        phoneSuggestions.length > 0 &&
        phoneInputRef.current &&
        !phoneInputRef.current.contains(event.target as Node)
      ) {
        setPhoneSuggestions([])
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [phoneSuggestions])

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          validateAndSubmit(watch())
        }}
        className="space-y-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Patient Name Field with Auto-Suggest */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium">
              Patient Name <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <PersonIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Controller
                control={control}
                name="name"
                rules={{ required: "Name is required" }}
                render={({ field }) => (
                  <Input
                    id="name"
                    type="text"
                    {...field}
                    placeholder="Enter patient name"
                    className={`pl-10 ${errors.name ? "border-red-500" : ""}`}
                    onChange={(e) => {
                      field.onChange(e)
                      setPatientNameInput(e.target.value)
                      setSelectedPatient(null) // Clear selected patient when manually typing
                    }}
                    ref={nameInputRef}
                  />
                )}
              />

              {patientSuggestions.length > 0 && !selectedPatient && (
                <ScrollArea className="absolute z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md w-full mt-1 max-h-48 shadow-lg">
                  <div className="p-1">
                    {patientSuggestions.map((suggestion) => (
                      <div
                        key={suggestion.id}
                        className="flex items-center justify-between px-3 py-2 hover:bg-emerald-50 dark:hover:bg-gray-700 rounded-md cursor-pointer"
                        onClick={() => handlePatientSuggestionClick(suggestion)}
                      >
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs bg-emerald-100 text-emerald-700">
                              {suggestion.name.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="font-medium">{suggestion.name}</span>
                            <span className="text-xs text-gray-500">{formatPatientInfo(suggestion)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">{suggestion.phone || "No phone"}</span>
                          <Badge
                            variant={suggestion.source === "gautami" ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {suggestion.source}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
            {errors.name && <p className="text-sm text-red-500">{errors.name.message || "Name is required"}</p>}
          </div>

          {/* Phone Field with Auto-Suggest */}
        {/* Phone Field with Auto-Suggest */}
<div className="space-y-2">
  <Label htmlFor="phone" className="text-sm font-medium">
    Phone Number <span className="text-red-500">*</span>
  </Label>
  <div className="relative">
    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
    <Controller
      control={control}
      name="phone"
      rules={{
        required: "Phone number is required",
        pattern: {
          value: /^[0-9]{10}$/,
          message: "Enter a valid 10-digit phone number"
        }
      }}
      render={({ field }) => (
        <Input
          id="phone"
          type="tel"
          {...field}
          ref={phoneInputRef}
          value={patientPhoneInput}
          onChange={(e) => {
            field.onChange(e)
            setPatientPhoneInput(e.target.value)
            setSelectedPatient(null)
            if (e.target.value.trim().length >= 3) {
              const allPatients = [...gautamiPatients, ...medfordPatients]
              const suggestions = allPatients.filter((p) => p.phone && p.phone.includes(e.target.value.trim()))
              setPhoneSuggestions(suggestions.slice(0, 10))
            } else {
              setPhoneSuggestions([])
            }
          }}
          placeholder="Enter 10-digit number"
          className={`pl-10 ${errors.phone ? "border-red-500" : ""}`}
        />
      )}
    />
    {phoneSuggestions.length > 0 && (
      <div className="absolute z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md w-full mt-1 max-h-48 overflow-auto shadow-lg">
        {phoneSuggestions.map((suggestion) => (
          <div
            key={suggestion.id}
            onClick={() => handlePatientSuggestionClick(suggestion)}
            className="flex items-center justify-between px-3 py-2 hover:bg-emerald-50 dark:hover:bg-gray-700 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-xs bg-emerald-100 text-emerald-700">
                  {suggestion.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="font-medium">{suggestion.name}</span>
                <span className="text-xs text-gray-500">{formatPatientInfo(suggestion)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{suggestion.phone || "No phone"}</span>
              <Badge variant={suggestion.source === "gautami" ? "default" : "secondary"} className="text-xs">
                {suggestion.source}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
  {errors.phone && (
    <p className="text-sm text-red-500">{errors.phone.message || "Phone number is required"}</p>
  )}
</div>

          {/* Age Field */}
          <div className="space-y-2">
            <Label htmlFor="age" className="text-sm font-medium">
              Age <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Cake className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                id="age"
                type="number"
                {...register("age", {
                  required: "Age is required",
                  min: { value: 1, message: "Age must be positive" },
                })}
                placeholder="Enter age"
                className={`pl-10 ${errors.age ? "border-red-500" : ""}`}
              />
            </div>
            {errors.age && <p className="text-sm text-red-500">{errors.age.message}</p>}
          </div>

          {/* Gender Field */}
          <div className="space-y-2">
            <Label htmlFor="gender" className="text-sm font-medium">
              Gender <span className="text-red-500">*</span>
            </Label>
            <Controller
              control={control}
              name="gender"
              rules={{ required: "Gender is required" }}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className={errors.gender ? "border-red-500" : ""}>
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

          {/* Appointment Type Selection */}
          <div className="space-y-2 col-span-2">
            <Label htmlFor="appointmentType" className="text-sm font-medium">
              Appointment Type <span className="text-red-500">*</span>
            </Label>
            <div className="grid grid-cols-2 gap-4">
              <div
                className={`border rounded-md p-4 cursor-pointer transition-all hover:shadow-md ${
                  watch("appointmentType") === "visithospital"
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 shadow-md"
                    : "border-gray-200 dark:border-gray-700 hover:border-emerald-300"
                }`}
                onClick={() => setValue("appointmentType", "visithospital")}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                      watch("appointmentType") === "visithospital"
                        ? "border-emerald-500 bg-emerald-500"
                        : "border-gray-300"
                    }`}
                  >
                    {watch("appointmentType") === "visithospital" && (
                      <div className="h-2 w-2 rounded-full bg-white"></div>
                    )}
                  </div>
                  <span className="font-semibold">Visit Hospital</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 ml-8">
                  Patient will visit the hospital in person for consultation
                </p>
              </div>
              <div
                className={`border rounded-md p-4 cursor-pointer transition-all hover:shadow-md ${
                  watch("appointmentType") === "oncall"
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 shadow-md"
                    : "border-gray-200 dark:border-gray-700 hover:border-emerald-300"
                }`}
                onClick={() => setValue("appointmentType", "oncall")}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                      watch("appointmentType") === "oncall" ? "border-emerald-500 bg-emerald-500" : "border-gray-300"
                    }`}
                  >
                    {watch("appointmentType") === "oncall" && <div className="h-2 w-2 rounded-full bg-white"></div>}
                  </div>
                  <span className="font-semibold">On-Call</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 ml-8">Remote consultation via phone call</p>
              </div>
            </div>
          </div>

          {/* Referred By Field */}
          <div className="space-y-2">
            <Label htmlFor="referredBy" className="text-sm font-medium">
              Referred By
            </Label>
            <Input
              id="referredBy"
              type="text"
              {...register("referredBy")}
              placeholder="Enter referrer name (optional)"
            />
          </div>

          {/* Date Field */}
          <div className="space-y-2">
            <Label htmlFor="date" className="text-sm font-medium">
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
                    onChange={(date: Date | null) => date && field.onChange(date)}
                    dateFormat="dd/MM/yyyy"
                    placeholderText="Select Date"
                    className={`w-full pl-10 pr-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 border-gray-300 dark:border-gray-600 dark:bg-gray-800 ${
                      errors.date ? "border-red-500" : ""
                    }`}
                    minDate={new Date()}
                  />
                )}
              />
            </div>
            {errors.date && <p className="text-sm text-red-500">{errors.date.message}</p>}
          </div>

          {/* Time Field */}
          <div className="space-y-2">
            <Label htmlFor="time" className="text-sm font-medium">
              Appointment Time <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                id="time"
                type="text"
                {...register("time", {
                  required: "Time is required",
                })}
                placeholder="e.g. 10:30 AM"
                className={`pl-10 ${errors.time ? "border-red-500" : ""}`}
              />
            </div>
            {errors.time && <p className="text-sm text-red-500">{errors.time.message}</p>}
          </div>

          {/* Service Name Field */}
          <div className="space-y-2">
            <Label htmlFor="serviceName" className="text-sm font-medium">
              Service Name <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Info className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                id="serviceName"
                type="text"
                {...register("serviceName", {
                  required: "Service name is required",
                })}
                placeholder="Enter service name"
                className={`pl-10 ${errors.serviceName ? "border-red-500" : ""}`}
              />
            </div>
            {errors.serviceName && <p className="text-sm text-red-500">{errors.serviceName.message}</p>}
          </div>

          {/* Doctor Selection Field */}
          <div className="space-y-2">
            <Label htmlFor="doctor" className="text-sm font-medium">
              Doctor <span className="text-red-500">*</span>
            </Label>
            <Controller
              control={control}
              name="doctor"
              rules={{
                required: "Doctor selection is required",
              }}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className={errors.doctor ? "border-red-500" : ""}>
                    <SelectValue placeholder="Select doctor" />
                  </SelectTrigger>
                  <SelectContent>
                    {doctors.map((doctor) => (
                      <SelectItem key={doctor.id} value={doctor.id}>
                        {doctor.name} {doctor.specialty ? `(${doctor.specialty})` : ""}
                        {doctor.id !== "no_doctor" && ` - ₹${doctor.opdCharge}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.doctor && <p className="text-sm text-red-500">{errors.doctor.message}</p>}
          </div>

          {/* Conditional fields for hospital visit only */}
          {watch("appointmentType") === "visithospital" && (
            <>
              {/* Address Field */}
              <div className="space-y-2">
                <Label htmlFor="address" className="text-sm font-medium">
                  Address
                </Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
                  <Textarea
                    id="address"
                    {...register("address")}
                    placeholder="Enter address (optional)"
                    className="pl-10 min-h-[80px]"
                  />
                </div>
              </div>

              {/* Payment Method Field */}
              <div className="space-y-2">
                <Label htmlFor="paymentMethod" className="text-sm font-medium">
                  Payment Method <span className="text-red-500">*</span>
                </Label>
                <Controller
                  control={control}
                  name="paymentMethod"
                  rules={{
                    required: watch("appointmentType") === "visithospital" ? "Payment method is required" : false,
                  }}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger className={errors.paymentMethod ? "border-red-500" : ""}>
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

              {/* Amount Field */}
              <div className="space-y-2">
                <Label htmlFor="amount" className="text-sm font-medium">
                  Amount (₹) <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    id="amount"
                    type="number"
                    placeholder="Enter amount"
                    className={`pl-10 ${errors.amount ? "border-red-500" : ""}`}
                    {...register("amount", {
                      required: watch("appointmentType") === "visithospital" ? "Amount is required" : false,
                      min: { value: 0, message: "Amount must be positive" },
                    })}
                    onWheel={(e) => {
                      e.preventDefault()
                      ;(e.currentTarget as HTMLElement).blur()
                    }}
                  />
                </div>
                {errors.amount && <p className="text-sm text-red-500">{errors.amount.message}</p>}
              </div>

              {/* Discount Field */}
              <div className="space-y-2">
                <Label htmlFor="discount" className="text-sm font-medium">
                  Discount (₹)
                </Label>
                <div className="relative">
                  <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    id="discount"
                    type="number"
                    placeholder="Enter discount amount"
                    className="pl-10"
                    {...register("discount", {
                      min: { value: 0, message: "Discount must be positive" },
                      validate: (value) => {
                        const amount = watch("amount")
                        return value <= amount || "Discount cannot exceed total amount"
                      },
                    })}
                    onWheel={(e) => {
                      e.preventDefault()
                      ;(e.currentTarget as HTMLElement).blur()
                    }}
                  />
                </div>
                {errors.discount && <p className="text-sm text-red-500">{errors.discount.message}</p>}
                {watch("discount") > 0 && (
                  <p className="text-sm text-emerald-600 font-medium">
                    Final amount: ₹{watch("amount") - watch("discount")}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Message Field */}
          <div className="space-y-2 col-span-2">
            <Label htmlFor="message" className="text-sm font-medium">
              Additional Notes
            </Label>
            <div className="relative">
              <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
              <Textarea
                id="message"
                {...register("message")}
                placeholder="Enter any additional notes (optional)"
                className="pl-10 min-h-[100px]"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 pt-6">
          <Button type="button" variant="outline" className="flex-1" onClick={() => setPreviewOpen(true)}>
            Preview Appointment
          </Button>
          <Button
            type="submit"
            className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
            disabled={loading}
          >
            {loading ? "Booking..." : "Book Appointment"}
          </Button>
        </div>
      </form>

      {selectedPatient && (
        <div className="px-4 py-3 bg-emerald-50 dark:bg-gray-800 border border-emerald-200 dark:border-gray-700 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-medium">
                Patient selected: <span className="text-emerald-600 dark:text-emerald-400">{selectedPatient.name}</span>
              </span>
            </div>
            <Badge variant={selectedPatient.source === "gautami" ? "default" : "secondary"}>
              {selectedPatient.source.toUpperCase()}
            </Badge>
          </div>
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Appointment Preview</DialogTitle>
            <DialogDescription>Review your appointment details before submitting</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div className="font-medium text-gray-600">Appointment Type:</div>
              <div className="font-semibold">
                {watch("appointmentType") === "visithospital" ? "Visit Hospital" : "On-Call"}
              </div>

              <div className="font-medium text-gray-600">Patient Name:</div>
              <div>{watch("name")}</div>

              <div className="font-medium text-gray-600">Phone:</div>
              <div className="font-mono">{watch("phone")}</div>

              <div className="font-medium text-gray-600">Age:</div>
              <div>{watch("age")} years</div>

              <div className="font-medium text-gray-600">Gender:</div>
              <div className="capitalize">
                {GenderOptions.find((g) => g.value === watch("gender"))?.label || watch("gender")}
              </div>

              {watch("referredBy") && (
                <>
                  <div className="font-medium text-gray-600">Referred By:</div>
                  <div>{watch("referredBy")}</div>
                </>
              )}

              <div className="font-medium text-gray-600">Date:</div>
              <div>{watch("date")?.toLocaleDateString("en-IN")}</div>

              <div className="font-medium text-gray-600">Time:</div>
              <div>{watch("time")}</div>

              <div className="font-medium text-gray-600">Service:</div>
              <div>{watch("serviceName")}</div>

              <div className="font-medium text-gray-600">Doctor:</div>
              <div>{doctors.find((d) => d.id === watch("doctor"))?.name || "No Doctor"}</div>

              {watch("appointmentType") === "visithospital" && (
                <>
                  {watch("address") && (
                    <>
                      <div className="font-medium text-gray-600">Address:</div>
                      <div>{watch("address")}</div>
                    </>
                  )}

                  <div className="font-medium text-gray-600">Payment Method:</div>
                  <div className="capitalize">
                    {PaymentOptions.find((p) => p.value === watch("paymentMethod"))?.label || watch("paymentMethod")}
                  </div>

                  <div className="font-medium text-gray-600">Amount:</div>
                  <div className="font-semibold">₹ {watch("amount")}</div>

                  {watch("discount") > 0 && (
                    <>
                      <div className="font-medium text-gray-600">Discount:</div>
                      <div className="text-red-600">- ₹ {watch("discount")}</div>

                      <div className="font-medium text-gray-600">Final Amount:</div>
                      <div className="font-bold text-emerald-600">₹ {watch("amount") - watch("discount")}</div>
                    </>
                  )}
                </>
              )}

              {watch("message") && (
                <>
                  <div className="font-medium text-gray-600">Notes:</div>
                  <div className="col-span-2">{watch("message")}</div>
                </>
              )}
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(false)}>
              Edit Details
            </Button>
            <Button
              type="button"
              onClick={() => validateAndSubmit(watch())}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {loading ? "Processing..." : "Confirm & Book"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
