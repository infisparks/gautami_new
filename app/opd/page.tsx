"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useForm, Controller } from "react-hook-form"
import { db } from "../../lib/firebase" // Gautami DB
import { db as dbMedford } from "../../lib/firebaseMedford" // Medford Family DB
import { ref, push, update, get, onValue, set, remove } from "firebase/database"
import Head from "next/head"
import {
  Phone,
  Cake,
  MapPin,
  Clock,
  MessageSquare,
  DollarSign,
  IndianRupeeIcon,
  Info,
  CheckCircle,
  HelpCircle,
  Trash2,
  UserCheck,
  Building,
  FileText,
} from "lucide-react"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"
import Joyride, { type CallBackProps, STATUS } from "react-joyride"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import CasualtyPatientsList from "./casualty-patients-list"
import { useRouter } from "next/navigation"
import React from "react"
import { PersonIcon, CalendarIcon, MagnifyingGlassIcon, Cross2Icon } from "@radix-ui/react-icons"

/** ---------------------------
 *   TYPE & CONSTANT DEFINITIONS
 *  ---------------------------
 */
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
  opdType: "opd" | "casualty"
  // Casualty specific fields
  modeOfArrival?: "ambulance" | "walkin" | "referred"
  broughtBy?: string
  referralHospital?: string
  broughtDead?: boolean
  caseType?: "rta" | "physicalAssault" | "burn" | "poisoning" | "snakeBite" | "cardiac" | "fall" | "other"
  otherCaseType?: string
  incidentDescription?: string
  isMLC?: boolean
  mlcNumber?: string
  policeInformed?: boolean
}

interface PatientRecord {
  id: string
  name: string
  phone: string
  age?: number
  gender?: string
  address?: string
  createdAt?: string
  opd?: any // Extra subfields
}

// Minimal patient record from Medford Family
interface MedfordPatient {
  patientId: string
  name: string
  contact: string
  dob: string
  gender: string
  hospitalName: string
}

// Combined patient type for auto‑suggestions
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
  opdType: "opd" | "casualty"
}

interface Service {
  name: string
  amount: number
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

const ModeOfArrivalOptions = [
  { value: "ambulance", label: "Ambulance" },
  { value: "walkin", label: "Walk-in" },
  { value: "referred", label: "Referred" },
]

const CaseTypeOptions = [
  { value: "rta", label: "Road Traffic Accident (RTA)" },
  { value: "physicalAssault", label: "Physical Assault" },
  { value: "burn", label: "Burn" },
  { value: "poisoning", label: "Poisoning" },
  { value: "snakeBite", label: "Snake/Insect Bite" },
  { value: "cardiac", label: "Cardiac Emergency" },
  { value: "fall", label: "Fall" },
  { value: "other", label: "Other" },
]

/**
 * Utility function: Format a Date to 12‑hour time with AM/PM
 */
function formatAMPM(date: Date): string {
  let hours = date.getHours()
  let minutes: string | number = date.getMinutes()
  const ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12
  hours = hours ? hours : 12 // the hour '0' should be '12'
  minutes = minutes < 10 ? "0" + minutes : minutes
  return `${hours}:${minutes} ${ampm}`
}

/** Helper function to generate a 10‑character alphanumeric UHID */
function generatePatientId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let result = ""
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/** ---------------
 *    MAIN COMPONENT
 *  ---------------
 */
const OPDBookingPage: React.FC = () => {
  const router = useRouter()

  // Form state using React Hook Form
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
      modeOfArrival: undefined,
      broughtBy: "",
      referralHospital: "",
      broughtDead: false,
      caseType: undefined,
      otherCaseType: "",
      incidentDescription: "",
      isMLC: false,
      mlcNumber: "",
      policeInformed: false,
    },
    mode: "onChange",
  })

  // States for UI control
  const [loading, setLoading] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("form")
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [appointmentToDelete, setAppointmentToDelete] = useState<string | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false)
  const [newService, setNewService] = useState<Service>({ name: "", amount: 0 })

  // States for patient management
  const [patientNameInput, setPatientNameInput] = useState("")
  const [patientSuggestions, setPatientSuggestions] = useState<CombinedPatient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<CombinedPatient | null>(null)
  const [patientPhoneInput, setPatientPhoneInput] = useState("")
  const [phoneSuggestions, setPhoneSuggestions] = useState<CombinedPatient[]>([])
  const [gautamiPatients, setGautamiPatients] = useState<CombinedPatient[]>([])
  const [medfordPatients, setMedfordPatients] = useState<CombinedPatient[]>([])

  // State for oncall appointments
  const [oncallAppointments, setOncallAppointments] = useState<OnCallAppointment[]>([])
  const [filteredOncallAppointments, setFilteredOncallAppointments] = useState<OnCallAppointment[]>([])
  const [searchQuery, setSearchQuery] = useState("")

  // Refs
  const phoneSuggestionBoxRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const phoneInputRef = useRef<HTMLInputElement>(null)
  const ageInputRef = useRef<HTMLInputElement>(null)

  // States for Joyride (guided tour)
  const [runTour, setRunTour] = useState(false)
  const tourSteps = [
    {
      target: '[data-tour="patient-name"]',
      content: "Enter the patient name here or search for existing patients.",
      disableBeacon: true,
    },
    {
      target: '[data-tour="phone"]',
      content: "Enter a valid 10-digit phone number here. You can also search by number.",
    },
    {
      target: '[data-tour="age"]',
      content: "Specify the patient's age.",
    },
    {
      target: '[data-tour="gender"]',
      content: "Select the patient's gender.",
    },
    {
      target: '[data-tour="address"]',
      content: "Fill in the address (optional).",
    },
    {
      target: '[data-tour="date"]',
      content: "Choose the appointment date.",
    },
    {
      target: '[data-tour="time"]',
      content: "Enter the appointment time.",
    },
    {
      target: '[data-tour="message"]',
      content: "Add any additional message or note here (optional).",
    },
    {
      target: '[data-tour="paymentMethod"]',
      content: "Select the payment method.",
    },
    {
      target: '[data-tour="serviceName"]',
      content: "Enter the service name for the appointment.",
    },
    {
      target: '[data-tour="doctor"]',
      content: 'Select the doctor or choose "No Doctor".',
    },
    {
      target: '[data-tour="amount"]',
      content: "The amount will be auto‑filled based on the doctor charge. Adjust if needed.",
    },
    {
      target: '[data-tour="discount"]',
      content: "Enter any discount amount to be applied to the total charge.",
    },
  ]

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status } = data
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRunTour(false)
    }
  }

  // Watch for OPD type changes to show/hide casualty fields
  const opdType = watch("opdType")
  const caseType = watch("caseType")
  const isMLC = watch("isMLC")

  /** ----------------
   *   FETCH DOCTORS
   *  ----------------
   */
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
        // Add "No Doctor" option
        doctorsList.unshift({ id: "no_doctor", name: "No Doctor", opdCharge: 0 })
        setDoctors(doctorsList)
      } else {
        setDoctors([{ id: "no_doctor", name: "No Doctor", opdCharge: 0 }])
      }
    })
    return () => unsubscribe()
  }, [])

  /** -------------------------------
   *  FETCH PATIENTS FROM BOTH DATABASES
   *  -------------------------------
   */
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

  // Fetch oncall appointments
  useEffect(() => {
    const oncallRef = ref(db, "oncall")
    const unsubscribe = onValue(oncallRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const appointments = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }))
        // Sort by createdAt in descending order (latest first)
        appointments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        setOncallAppointments(appointments)
        setFilteredOncallAppointments(appointments)
      } else {
        setOncallAppointments([])
        setFilteredOncallAppointments([])
      }
    })
    return () => unsubscribe()
  }, [])

  // Filter oncall appointments when search query changes
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredOncallAppointments(oncallAppointments)
    } else {
      const query = searchQuery.toLowerCase()
      const filtered = oncallAppointments.filter(
        (appointment) =>
          appointment.name.toLowerCase().includes(query) ||
          appointment.phone.includes(query) ||
          (appointment.serviceName && appointment.serviceName.toLowerCase().includes(query)),
      )
      setFilteredOncallAppointments(filtered)
    }
  }, [searchQuery, oncallAppointments])

  // Combined suggestions for the name field are updated when patientNameInput changes.
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

  /** -------------------------------------------
   *  SELECT PATIENT FROM DROPDOWN, AUTO-FILL FORM
   *  -------------------------------------------
   */
  const handlePatientSuggestionClick = (patient: CombinedPatient) => {
    setSelectedPatient(patient)
    setValue("name", patient.name)
    setValue("phone", patient.phone || "")
    setPatientNameInput(patient.name)
    setPatientPhoneInput(patient.phone || "")
    if (patient.source === "gautami") {
      setValue("address", (patient.data as PatientRecord).address)
      setValue("age", (patient.data as PatientRecord).age || 0)
      setValue("gender", (patient.data as PatientRecord).gender || "")
    } else {
      setValue("gender", (patient.data as MedfordPatient).gender || "")
    }
    setPatientSuggestions([])
    setPhoneSuggestions([])
    toast.info(`Patient ${patient.name} selected from ${patient.source.toUpperCase()}!`)
  }

  /** -----------------------------------------
   *  FETCH DOCTOR AMOUNT WHEN DOCTOR CHANGES
   *  -----------------------------------------
   */
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

  // Handle adding a new service
  const handleAddService = () => {
    if (newService.name.trim() === "" || newService.amount <= 0) {
      toast.error("Please enter a valid service name and amount")
      return
    }

    setServices([...services, newService])
    setNewService({ name: "", amount: 0 })
    setServiceDialogOpen(false)
    toast.success("Service added successfully")
  }

  // Handle removing a service
  const handleRemoveService = (index: number) => {
    const updatedServices = [...services]
    updatedServices.splice(index, 1)
    setServices(updatedServices)
  }

  // Calculate total amount including services
  const calculateTotalAmount = () => {
    const baseAmount = watch("amount") || 0
    const discount = watch("discount") || 0
    const servicesTotal = services.reduce((total, service) => total + service.amount, 0)
    return baseAmount + servicesTotal - discount
  }

  /**
   * ----------------------------------------------------------------------
   *  SUBMISSION LOGIC:
   *   1. If an existing patient is selected, push OPD data.
   *   2. Otherwise, create a new patient record in Gautami DB (full details)
   *      and a minimal record in Medford DB, then push OPD data.
   *   3. After DB writes, send a professional WhatsApp message to the patient.
   * ----------------------------------------------------------------------
   */
  const validateAndSubmit = async (data: IFormInput) => {
    // Check required fields manually
    const requiredFields = ["name", "phone", "age", "gender", "date", "time", "opdType"]

    // Add conditional required fields based on appointment type
    if (data.appointmentType === "visithospital") {
      requiredFields.push("paymentMethod", "serviceName", "doctor")
    } else {
      // For oncall, we also need service and doctor
      requiredFields.push("serviceName", "doctor")
    }

    // Add conditional required fields for casualty
    if (data.opdType === "casualty") {
      requiredFields.push("modeOfArrival", "caseType")

      // If case type is "other", require otherCaseType
      if (data.caseType === "other") {
        requiredFields.push("otherCaseType")
      }

      // If MLC is true, require mlcNumber
      if (data.isMLC) {
        requiredFields.push("mlcNumber")
      }
    }

    // Validate all required fields
    const isValid = await trigger(requiredFields as any)

    if (!isValid) {
      // Focus on the first field with an error
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
      if (data.opdType === "casualty") {
        if (errors.modeOfArrival) {
          toast.error("Please select mode of arrival")
          return
        }
        if (errors.caseType) {
          toast.error("Please select case type")
          return
        }
        if (data.caseType === "other" && errors.otherCaseType) {
          toast.error("Please specify the other case type")
          return
        }
        if (data.isMLC && errors.mlcNumber) {
          toast.error("Please enter MLC number")
          return
        }
      }

      toast.error("Please fill all required fields")
      return
    }

    // If all validations pass, proceed with submission
    onSubmit(data)
  }

  const onSubmit = async (data: IFormInput) => {
    setLoading(true)
    try {
      const appointmentData = {
        date: data.date.toISOString(),
        time: data.time,
        paymentMethod: data.appointmentType === "visithospital" ? data.paymentMethod : "",
        amount: data.appointmentType === "visithospital" ? data.amount : 0,
        discount: data.appointmentType === "visithospital" ? data.discount : 0,
        serviceName: data.serviceName,
        doctor: data.doctor || "no_doctor",
        message: data.message || "",
        referredBy: data.referredBy || "",
        appointmentType: data.appointmentType,
        opdType: data.opdType,
        createdAt: new Date().toISOString(),
        // Add casualty specific fields if opdType is casualty
        ...(data.opdType === "casualty" && {
          modeOfArrival: data.modeOfArrival,
          broughtBy: data.broughtBy || "",
          referralHospital: data.referralHospital || "",
          broughtDead: data.broughtDead || false,
          caseType: data.caseType,
          otherCaseType: data.caseType === "other" ? data.otherCaseType : "",
          incidentDescription: data.incidentDescription || "",
          isMLC: data.isMLC || false,
          mlcNumber: data.isMLC ? data.mlcNumber : "",
          policeInformed: data.policeInformed || false,
        }),
        // Add services if any
        services: services.length > 0 ? services : [],
      }

      if (data.appointmentType === "oncall") {
        // For oncall appointments, save to a separate node
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
          createdAt: new Date().toISOString(),
          // Add casualty specific fields if opdType is casualty
          ...(data.opdType === "casualty" && {
            modeOfArrival: data.modeOfArrival,
            broughtBy: data.broughtBy || "",
            referralHospital: data.referralHospital || "",
            broughtDead: data.broughtDead || false,
            caseType: data.caseType,
            otherCaseType: data.caseType === "other" ? data.otherCaseType : "",
            incidentDescription: data.incidentDescription || "",
            isMLC: data.isMLC || false,
            mlcNumber: data.isMLC ? data.mlcNumber : "",
            policeInformed: data.policeInformed || false,
          }),
          // Add services if any
          services: services.length > 0 ? services : [],
        })

        // Send WhatsApp message for oncall appointment
        try {
          const selectedDocName = doctors.find((doc) => doc.id === data.doctor)?.name || "No Doctor"
          const formattedDate = data.date.toLocaleDateString("en-IN") // e.g. DD/MM/YYYY
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
Medford Hospital
`

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
        // For hospital visit appointments, follow the existing flow
        let patientId = ""
        if (selectedPatient) {
          // Existing patient: update basic info
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
          // New patient: create fresh record in both DBs
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

        // Push OPD appointment under the patient node
        const opdRef = ref(db, `patients/${patientId}/opd`)
        const newOpdRef = push(opdRef)
        await update(newOpdRef, appointmentData)

        // Send WhatsApp message
        try {
          const selectedDocName = doctors.find((doc) => doc.id === data.doctor)?.name || "No Doctor"
          const formattedDate = data.date.toLocaleDateString("en-IN") // e.g. DD/MM/YYYY
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
Medford Hospital
`

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

      // Reset the form and state
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
        modeOfArrival: undefined,
        broughtBy: "",
        referralHospital: "",
        broughtDead: false,
        caseType: undefined,
        otherCaseType: "",
        incidentDescription: "",
        isMLC: false,
        mlcNumber: "",
        policeInformed: false,
      })
      setPreviewOpen(false)
      setSelectedPatient(null)
      setPatientNameInput("")
      setPatientPhoneInput("")
      setServices([])
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

  /**
   * Delete an oncall appointment
   */
  const handleDeleteAppointment = async () => {
    if (!appointmentToDelete) return

    try {
      const appointmentRef = ref(db, `oncall/${appointmentToDelete}`)
      await remove(appointmentRef)
      toast.success("Appointment deleted successfully")
      setAppointmentToDelete(null)
      setDeleteDialogOpen(false)
    } catch (error) {
      console.error("Error deleting appointment:", error)
      toast.error("Failed to delete appointment")
    }
  }

  /** -------------
   *   START TOUR
   *  -------------
   */
  const startTour = () => {
    setRunTour(true)
  }

  /** -----------
   *   RENDER UI
   *  -----------
   */
  return (
    <>
      <Head>
        <title>OPD Booking System</title>
        <meta name="description" content="Book your OPD appointment easily" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ToastContainer position="top-right" autoClose={3000} />

      {/* Joyride Component for Guided Tour */}
      <Joyride
        steps={tourSteps}
        run={runTour}
        continuous
        showSkipButton
        showProgress
        callback={handleJoyrideCallback}
        styles={{
          options: { zIndex: 10000, primaryColor: "#10b981" },
        }}
      />

      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-4 py-8">
          <Card className="w-full max-w-4xl mx-auto shadow-lg">
            <CardHeader className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-2xl md:text-3xl font-bold">OPD Booking System</CardTitle>
                  <CardDescription className="text-emerald-100">
                    Book appointments quickly and efficiently
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startTour}
                  className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                >
                  <HelpCircle className="mr-2 h-4 w-4" />
                  Help
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <Tabs defaultValue="form" value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="w-full grid grid-cols-4 rounded-none">
                  <TabsTrigger value="form" className="text-sm md:text-base">
                    Appointment Form
                  </TabsTrigger>
                  <TabsTrigger value="oncall" className="text-sm md:text-base">
                    On-Call List
                  </TabsTrigger>
                  <TabsTrigger value="casualty" className="text-sm md:text-base">
                    Casualty List
                  </TabsTrigger>
                  <TabsTrigger value="help" className="text-sm md:text-base">
                    Help
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="form" className="p-6">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      validateAndSubmit(watch())
                    }}
                    className="space-y-6"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Patient Name Field with Auto-Suggest */}
                      <div className="space-y-2" data-tour="patient-name">
                        <Label htmlFor="name" className="text-sm font-medium">
                          Patient Name <span className="text-red-500">*</span>
                        </Label>
                        <div className="relative">
                          <PersonIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                          <Input
                            id="name"
                            type="text"
                            ref={nameInputRef}
                            value={patientNameInput}
                            onChange={(e) => {
                              setPatientNameInput(e.target.value)
                              setValue("name", e.target.value, {
                                shouldValidate: true,
                              })
                              setSelectedPatient(null)
                            }}
                            placeholder="Enter patient name"
                            className={`pl-10 ${errors.name ? "border-red-500" : ""}`}
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
                                      <span className="font-medium">{suggestion.name}</span>
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
                        {errors.name && (
                          <p className="text-sm text-red-500">{errors.name.message || "Name is required"}</p>
                        )}
                      </div>

                      {/* Phone Field with Auto-Suggest */}
                      <div className="space-y-2" data-tour="phone">
                        <Label htmlFor="phone" className="text-sm font-medium">
                          Phone Number <span className="text-red-500">*</span>
                        </Label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                          <Input
                            id="phone"
                            type="tel"
                            ref={phoneInputRef}
                            value={patientPhoneInput}
                            onChange={(e) => {
                              const val = e.target.value
                              setPatientPhoneInput(val)
                              setValue("phone", val, { shouldValidate: true })
                              if (val.trim().length >= 2) {
                                const suggestions = [...gautamiPatients, ...medfordPatients].filter(
                                  (p) => p.phone && p.phone.includes(val.trim()),
                                )
                                setPhoneSuggestions(suggestions)
                              } else {
                                setPhoneSuggestions([])
                              }
                            }}
                            placeholder="Enter 10-digit number"
                            className={`pl-10 ${errors.phone ? "border-red-500" : ""}`}
                          />
                          {phoneSuggestions.length > 0 && (
                            <div
                              ref={phoneSuggestionBoxRef}
                              className="absolute z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md w-full mt-1 max-h-48 overflow-auto shadow-lg"
                            >
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
                                    <span className="font-medium">{suggestion.name}</span>
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
                          )}
                        </div>
                        {errors.phone && (
                          <p className="text-sm text-red-500">{errors.phone.message || "Phone number is required"}</p>
                        )}
                      </div>

                      {/* Age Field */}
                      <div className="space-y-2" data-tour="age">
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
                      <div className="space-y-2" data-tour="gender">
                        <Label htmlFor="gender" className="text-sm font-medium">
                          Gender <span className="text-red-500">*</span>
                        </Label>
                        <Controller
                          control={control}
                          name="gender"
                          rules={{ required: "Gender is required" }}
                          render={({ field }) => (
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                            className={`border rounded-md p-3 cursor-pointer transition-colors ${
                              watch("appointmentType") === "visithospital"
                                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                                : "border-gray-200 dark:border-gray-700"
                            }`}
                            onClick={() => setValue("appointmentType", "visithospital")}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className={`h-4 w-4 rounded-full border ${
                                  watch("appointmentType") === "visithospital"
                                    ? "border-emerald-500 bg-emerald-500"
                                    : "border-gray-300"
                                }`}
                              ></div>
                              <span className="font-medium">Visit Hospital</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1 ml-6">Patient will visit the hospital in person</p>
                          </div>
                          <div
                            className={`border rounded-md p-3 cursor-pointer transition-colors ${
                              watch("appointmentType") === "oncall"
                                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                                : "border-gray-200 dark:border-gray-700"
                            }`}
                            onClick={() => setValue("appointmentType", "oncall")}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className={`h-4 w-4 rounded-full border ${
                                  watch("appointmentType") === "oncall"
                                    ? "border-emerald-500 bg-emerald-500"
                                    : "border-gray-300"
                                }`}
                              ></div>
                              <span className="font-medium">On-Call</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1 ml-6">Remote consultation via phone</p>
                          </div>
                        </div>
                      </div>

                      {/* OPD Type Selection */}
                      <div className="space-y-2 col-span-2">
                        <Label htmlFor="opdType" className="text-sm font-medium">
                          OPD Type <span className="text-red-500">*</span>
                        </Label>
                        <Controller
                          control={control}
                          name="opdType"
                          defaultValue="opd"
                          rules={{ required: "OPD Type is required" }}
                          render={({ field }) => (
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <SelectTrigger className={errors.opdType ? "border-red-500" : ""}>
                                <SelectValue placeholder="Select OPD Type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="opd">OPD</SelectItem>
                                <SelectItem value="casualty">Casualty</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                        {errors.opdType && <p className="text-sm text-red-500">{errors.opdType.message}</p>}
                      </div>

                      {/* Casualty specific fields */}
                      {opdType === "casualty" && (
                        <div className="col-span-2 space-y-6 border border-red-200 rounded-md p-4 bg-red-50 dark:bg-red-900/10 dark:border-red-900/30">
                          <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-4">
                            Casualty Details
                          </h3>

                          {/* Mode of Arrival */}
                          <div className="space-y-2">
                            <Label htmlFor="modeOfArrival" className="text-sm font-medium">
                              Mode of Arrival <span className="text-red-500">*</span>
                            </Label>
                            <Controller
                              control={control}
                              name="modeOfArrival"
                              rules={{ required: opdType === "casualty" ? "Mode of arrival is required" : false }}
                              render={({ field }) => (
                                <RadioGroup
                                  onValueChange={field.onChange}
                                  defaultValue={field.value}
                                  className="flex flex-wrap gap-4"
                                >
                                  {ModeOfArrivalOptions.map((option) => (
                                    <div key={option.value} className="flex items-center space-x-2">
                                      <RadioGroupItem value={option.value} id={`mode-${option.value}`} />
                                      <Label htmlFor={`mode-${option.value}`}>{option.label}</Label>
                                    </div>
                                  ))}
                                </RadioGroup>
                              )}
                            />
                            {errors.modeOfArrival && (
                              <p className="text-sm text-red-500">{errors.modeOfArrival.message}</p>
                            )}
                          </div>

                          {/* Brought By */}
                          <div className="space-y-2">
                            <Label htmlFor="broughtBy" className="text-sm font-medium">
                              Brought By (Name & Relation)
                            </Label>
                            <div className="relative">
                              <UserCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                              <Input
                                id="broughtBy"
                                type="text"
                                {...register("broughtBy")}
                                placeholder="Enter name and relation"
                                className="pl-10"
                              />
                            </div>
                          </div>

                          {/* Referral Hospital/Doctor */}
                          <div className="space-y-2">
                            <Label htmlFor="referralHospital" className="text-sm font-medium">
                              Referral Hospital/Doctor (if any)
                            </Label>
                            <div className="relative">
                              <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                              <Input
                                id="referralHospital"
                                type="text"
                                {...register("referralHospital")}
                                placeholder="Enter referral details"
                                className="pl-10"
                              />
                            </div>
                          </div>

                          {/* Brought Dead */}
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="broughtDead"
                                checked={watch("broughtDead")}
                                onCheckedChange={(checked) => {
                                  setValue("broughtDead", checked === true)
                                }}
                              />
                              <Label htmlFor="broughtDead" className="text-sm font-medium">
                                Brought Dead
                              </Label>
                            </div>
                          </div>

                          {/* Type of Case */}
                          <div className="space-y-2">
                            <Label htmlFor="caseType" className="text-sm font-medium">
                              Type of Case <span className="text-red-500">*</span>
                            </Label>
                            <Controller
                              control={control}
                              name="caseType"
                              rules={{ required: opdType === "casualty" ? "Case type is required" : false }}
                              render={({ field }) => (
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <SelectTrigger className={errors.caseType ? "border-red-500" : ""}>
                                    <SelectValue placeholder="Select case type" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {CaseTypeOptions.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            />
                            {errors.caseType && <p className="text-sm text-red-500">{errors.caseType.message}</p>}
                          </div>

                          {/* Other Case Type (if "other" is selected) */}
                          {caseType === "other" && (
                            <div className="space-y-2">
                              <Label htmlFor="otherCaseType" className="text-sm font-medium">
                                Specify Other Case Type <span className="text-red-500">*</span>
                              </Label>
                              <Input
                                id="otherCaseType"
                                type="text"
                                {...register("otherCaseType", {
                                  required: caseType === "other" ? "Please specify the case type" : false,
                                })}
                                placeholder="Enter case type"
                                className={errors.otherCaseType ? "border-red-500" : ""}
                              />
                              {errors.otherCaseType && (
                                <p className="text-sm text-red-500">{errors.otherCaseType.message}</p>
                              )}
                            </div>
                          )}

                          {/* Description of Incident */}
                          <div className="space-y-2">
                            <Label htmlFor="incidentDescription" className="text-sm font-medium">
                              Description of Incident
                            </Label>
                            <Textarea
                              id="incidentDescription"
                              {...register("incidentDescription")}
                              placeholder="Enter incident details"
                              className="min-h-[80px]"
                            />
                          </div>

                          {/* Medico-Legal Case (MLC) */}
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="isMLC"
                                checked={watch("isMLC")}
                                onCheckedChange={(checked) => {
                                  setValue("isMLC", checked === true)
                                }}
                              />
                              <Label htmlFor="isMLC" className="text-sm font-medium">
                                Medico-Legal Case (MLC)
                              </Label>
                            </div>
                          </div>

                          {/* MLC Number (if MLC is checked) */}
                          {isMLC && (
                            <div className="space-y-2">
                              <Label htmlFor="mlcNumber" className="text-sm font-medium">
                                MLC Number <span className="text-red-500">*</span>
                              </Label>
                              <div className="relative">
                                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                                <Input
                                  id="mlcNumber"
                                  type="text"
                                  {...register("mlcNumber", {
                                    required: isMLC ? "MLC number is required" : false,
                                  })}
                                  placeholder="Enter MLC number"
                                  className={`pl-10 ${errors.mlcNumber ? "border-red-500" : ""}`}
                                />
                              </div>
                              {errors.mlcNumber && <p className="text-sm text-red-500">{errors.mlcNumber.message}</p>}
                            </div>
                          )}

                          {/* Police Informed */}
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="policeInformed"
                                checked={watch("policeInformed")}
                                onCheckedChange={(checked) => {
                                  setValue("policeInformed", checked === true)
                                }}
                              />
                              <Label htmlFor="policeInformed" className="text-sm font-medium">
                                Police Informed
                              </Label>
                            </div>
                          </div>
                        </div>
                      )}

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
                      <div className="space-y-2" data-tour="date">
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
                              />
                            )}
                          />
                        </div>
                        {errors.date && <p className="text-sm text-red-500">{errors.date.message}</p>}
                      </div>

                      {/* Time Field */}
                      <div className="space-y-2" data-tour="time">
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
                            defaultValue={formatAMPM(new Date())}
                          />
                        </div>
                        {errors.time && <p className="text-sm text-red-500">{errors.time.message}</p>}
                      </div>

                      {/* Service Name Field - Now for both appointment types */}
                      <div className="space-y-2" data-tour="serviceName">
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

                      {/* Doctor Selection Field - Now for both appointment types */}
                      <div className="space-y-2" data-tour="doctor">
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
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <SelectTrigger className={errors.doctor ? "border-red-500" : ""}>
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

                      {/* Conditional fields for hospital visit only */}
                      {watch("appointmentType") === "visithospital" && (
                        <>
                          {/* Address Field */}
                          <div className="space-y-2" data-tour="address">
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
                          <div className="space-y-2" data-tour="paymentMethod">
                            <Label htmlFor="paymentMethod" className="text-sm font-medium">
                              Payment Method <span className="text-red-500">*</span>
                            </Label>
                            <Controller
                              control={control}
                              name="paymentMethod"
                              rules={{
                                required:
                                  watch("appointmentType") === "visithospital" ? "Payment method is required" : false,
                              }}
                              render={({ field }) => (
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                            {errors.paymentMethod && (
                              <p className="text-sm text-red-500">{errors.paymentMethod.message}</p>
                            )}
                          </div>

                          {/* Amount Field */}
                          <div className="space-y-2" data-tour="amount">
                            <Label htmlFor="amount" className="text-sm font-medium">
                              Amount (Rs) <span className="text-red-500">*</span>
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
                                /* 🛑 stop mouse-wheel from changing the value */
                                onWheel={(e) => {
                                  e.preventDefault() // cancel the scroll event
                                  ;(e.currentTarget as HTMLElement).blur() // optional: drop focus
                                }}
                              />
                            </div>
                            {errors.amount && <p className="text-sm text-red-500">{errors.amount.message}</p>}
                          </div>

                          {/* Discount Field */}
                          <div className="space-y-2" data-tour="discount">
                            <Label htmlFor="discount" className="text-sm font-medium">
                              Discount (Rs)
                            </Label>
                            <div className="relative">
                              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
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
                              <p className="text-sm text-emerald-600">
                                Final amount: ₹{watch("amount") - watch("discount")}
                              </p>
                            )}
                          </div>
                        </>
                      )}

                      {/* Services Section */}
                      {watch("appointmentType") === "visithospital" && (
                        <div className="col-span-2 space-y-4 border border-gray-200 dark:border-gray-700 rounded-md p-4">
                          <div className="flex justify-between items-center">
                            <h3 className="text-lg font-semibold">Additional Services</h3>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setServiceDialogOpen(true)}
                            >
                              Add Service
                            </Button>
                          </div>

                          {services.length > 0 ? (
                            <div className="space-y-2">
                              <div className="grid grid-cols-12 gap-2 font-medium text-sm text-gray-500 pb-2 border-b">
                                <div className="col-span-6">Service Name</div>
                                <div className="col-span-4">Amount (₹)</div>
                                <div className="col-span-2">Action</div>
                              </div>
                              {services.map((service, index) => (
                                <div key={index} className="grid grid-cols-12 gap-2 items-center">
                                  <div className="col-span-6">{service.name}</div>
                                  <div className="col-span-4">₹ {service.amount}</div>
                                  <div className="col-span-2">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleRemoveService(index)}
                                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                              <div className="pt-2 border-t flex justify-between font-medium">
                                <span>Total Services Amount:</span>
                                <span>₹ {services.reduce((total, service) => total + service.amount, 0)}</span>
                              </div>
                              <div className="pt-2 border-t flex justify-between font-medium">
                                <span>Final Total Amount:</span>
                                <span>₹ {calculateTotalAmount()}</span>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500">No additional services added</p>
                          )}
                        </div>
                      )}

                      {/* Message Field - For both types */}
                      <div className="space-y-2 col-span-2" data-tour="message">
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

                    <div className="flex flex-col sm:flex-row gap-4 pt-4">
                      <Button type="button" variant="outline" className="flex-1" onClick={() => setPreviewOpen(true)}>
                        Preview
                      </Button>
                      <Button
                        type="submit"
                        className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
                      >
                        {loading ? "Submitting..." : "Book Appointment"}
                      </Button>
                    </div>
                  </form>
                </TabsContent>

                <TabsContent value="oncall" className="p-6">
                  <div className="space-y-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                      <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                        On-Call Appointments
                      </h3>
                      <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                        <div className="relative flex-1 sm:w-64">
                          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                          <Input
                            placeholder="Search appointments..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                          />
                          {searchQuery && (
                            <button
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                              onClick={() => setSearchQuery("")}
                            >
                              <Cross2Icon className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        <Button
                          onClick={() => {
                            setActiveTab("form")
                            setValue("appointmentType", "oncall")
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          Book On-Call
                        </Button>
                      </div>
                    </div>

                    {filteredOncallAppointments.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        {searchQuery ? "No matching appointments found" : "No on-call appointments found"}
                      </div>
                    ) : (
                      <ScrollArea className="h-[500px]">
                        <div className="space-y-4">
                          {filteredOncallAppointments.map((appointment) => (
                            <Card key={appointment.id} className="overflow-hidden">
                              <CardHeader className="bg-emerald-50 dark:bg-gray-800 p-4">
                                <div className="flex justify-between items-center">
                                  <div>
                                    <CardTitle className="text-lg">{appointment.name}</CardTitle>
                                    <CardDescription>
                                      {new Date(appointment.date).toLocaleDateString()} at {appointment.time}
                                    </CardDescription>
                                  </div>
                                  <Badge>On-Call</Badge>
                                </div>
                              </CardHeader>
                              <CardContent className="p-4">
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  <div className="font-medium">Phone:</div>
                                  <div>{appointment.phone}</div>

                                  <div className="font-medium">Age:</div>
                                  <div>{appointment.age}</div>

                                  <div className="font-medium">Gender:</div>
                                  <div>{appointment.gender}</div>

                                  {appointment.serviceName && (
                                    <>
                                      <div className="font-medium">Service:</div>
                                      <div>{appointment.serviceName}</div>
                                    </>
                                  )}

                                  {appointment.doctor && (
                                    <>
                                      <div className="font-medium">Doctor:</div>
                                      <div>
                                        {doctors.find((d) => d.id === appointment.doctor)?.name || appointment.doctor}
                                      </div>
                                    </>
                                  )}

                                  <div className="font-medium">Created:</div>
                                  <div>{new Date(appointment.createdAt).toLocaleString()}</div>
                                </div>
                              </CardContent>
                              <CardFooter className="bg-gray-50 dark:bg-gray-900 p-3 flex justify-between">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => {
                                    setAppointmentToDelete(appointment.id)
                                    setDeleteDialogOpen(true)
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Delete
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setActiveTab("form")
                                    setValue("name", appointment.name)
                                    setValue("phone", appointment.phone)
                                    setValue("age", appointment.age)
                                    setValue("gender", appointment.gender)
                                    setValue("appointmentType", "visithospital")
                                    setPatientNameInput(appointment.name)
                                    setPatientPhoneInput(appointment.phone)
                                    toast.info("On-call patient details loaded to form")
                                  }}
                                >
                                  Book OPD Visit
                                </Button>
                              </CardFooter>
                            </Card>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="casualty" className="p-6">
                  <CasualtyPatientsList />
                </TabsContent>

                <TabsContent value="help" className="p-6">
                  <div className="space-y-6">
                    <div className="bg-emerald-50 dark:bg-gray-800 rounded-lg p-4 border border-emerald-100 dark:border-gray-700">
                      <h3 className="text-lg font-semibold mb-2 text-emerald-700 dark:text-emerald-400">
                        Help & Instructions
                      </h3>
                      <p className="text-gray-600 dark:text-gray-300 mb-4">
                        Learn how to use the OPD Booking System efficiently.
                      </p>

                      <div className="space-y-4">
                        <h4 className="font-semibold text-emerald-700 dark:text-emerald-400">Appointment Types</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                            <p className="font-medium mb-1">Visit Hospital</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              For patients who will physically visit the hospital. Complete all details including doctor
                              selection.
                            </p>
                          </div>
                          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                            <p className="font-medium mb-1">On-Call</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              For remote consultations. Basic patient details, service name, and doctor selection are
                              required.
                            </p>
                          </div>
                        </div>

                        <h4 className="font-semibold text-emerald-700 dark:text-emerald-400">OPD Types</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                            <p className="font-medium mb-1">OPD</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              Regular outpatient department appointments for non-emergency consultations.
                            </p>
                          </div>
                          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-red-200 dark:border-red-900/30">
                            <p className="font-medium mb-1 text-red-700 dark:text-red-400">Casualty</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              For emergency cases. Additional information like mode of arrival, case type, and MLC
                              details are required.
                            </p>
                          </div>
                        </div>

                        <div className="mt-4">
                          <Button variant="outline" size="sm" onClick={startTour}>
                            <HelpCircle className="mr-2 h-4 w-4" />
                            Start Guided Tour
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>

            {selectedPatient && (
              <div className="px-6 py-3 bg-emerald-50 dark:bg-gray-800 border-t border-emerald-100 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-sm font-medium">
                      Patient selected:{" "}
                      <span className="text-emerald-600 dark:text-emerald-400">{selectedPatient.name}</span>
                    </span>
                  </div>
                  <Badge variant={selectedPatient.source === "gautami" ? "default" : "secondary"}>
                    {selectedPatient.source.toUpperCase()}
                  </Badge>
                </div>
              </div>
            )}

            <CardFooter className="flex flex-col sm:flex-row justify-between items-center p-6 bg-gray-50 dark:bg-gray-900 border-t">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-0">
                Fields marked with <span className="text-red-500">*</span> are required
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={startTour}>
                  <HelpCircle className="mr-2 h-4 w-4" />
                  Tour
                </Button>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Appointment Preview</DialogTitle>
            <DialogDescription>Review your appointment details before submitting</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div className="font-medium">Appointment Type:</div>
              <div>{watch("appointmentType") === "visithospital" ? "Visit Hospital" : "On-Call"}</div>
              <div className="font-medium">OPD Type:</div>
              <div>{watch("opdType") === "opd" ? "OPD" : "Casualty"}</div>

              <div className="font-medium">Patient Name:</div>
              <div>{watch("name")}</div>

              <div className="font-medium">Phone:</div>
              <div>{watch("phone")}</div>

              <div className="font-medium">Age:</div>
              <div>{watch("age")}</div>

              <div className="font-medium">Gender:</div>
              <div>{GenderOptions.find((g) => g.value === watch("gender"))?.label || watch("gender")}</div>

              {watch("referredBy") && (
                <>
                  <div className="font-medium">Referred By:</div>
                  <div>{watch("referredBy")}</div>
                </>
              )}

              {watch("address") && watch("appointmentType") === "visithospital" && (
                <>
                  <div className="font-medium">Address:</div>
                  <div>{watch("address")}</div>
                </>
              )}

              <div className="font-medium">Date:</div>
              <div>{watch("date")?.toLocaleDateString()}</div>

              <div className="font-medium">Time:</div>
              <div>{watch("time")}</div>

              <div className="font-medium">Service:</div>
              <div>{watch("serviceName")}</div>

              <div className="font-medium">Doctor:</div>
              <div>{doctors.find((d) => d.id === watch("doctor"))?.name || "No Doctor"}</div>

              {watch("appointmentType") === "visithospital" && (
                <>
                  <div className="font-medium">Payment Method:</div>
                  <div>
                    {PaymentOptions.find((p) => p.value === watch("paymentMethod"))?.label || watch("paymentMethod")}
                  </div>

                  <div className="font-medium">Amount:</div>
                  <div>₹ {watch("amount")}</div>

                  {watch("discount") > 0 && (
                    <>
                      <div className="font-medium">Discount:</div>
                      <div>₹ {watch("discount")}</div>

                      <div className="font-medium">Final Amount:</div>
                      <div>₹ {watch("amount") - watch("discount")}</div>
                    </>
                  )}

                  {services.length > 0 && (
                    <>
                      <div className="font-medium col-span-2 pt-2 border-t">Additional Services:</div>
                      {services.map((service, index) => (
                        <React.Fragment key={index}>
                          <div className="font-medium pl-4">{service.name}:</div>
                          <div>₹ {service.amount}</div>
                        </React.Fragment>
                      ))}
                      <div className="font-medium">Total Amount:</div>
                      <div>₹ {calculateTotalAmount()}</div>
                    </>
                  )}

                  {watch("message") && (
                    <>
                      <div className="font-medium">Notes:</div>
                      <div>{watch("message")}</div>
                    </>
                  )}
                </>
              )}

              {/* Casualty specific fields in preview */}
              {watch("opdType") === "casualty" && (
                <>
                  <div className="col-span-2 pt-2 border-t font-medium text-red-700 dark:text-red-400">
                    Casualty Details:
                  </div>

                  <div className="font-medium">Mode of Arrival:</div>
                  <div>
                    {ModeOfArrivalOptions.find((m) => m.value === watch("modeOfArrival"))?.label || "Not specified"}
                  </div>

                  {watch("broughtBy") && (
                    <>
                      <div className="font-medium">Brought By:</div>
                      <div>{watch("broughtBy")}</div>
                    </>
                  )}

                  {watch("referralHospital") && (
                    <>
                      <div className="font-medium">Referral Hospital/Doctor:</div>
                      <div>{watch("referralHospital")}</div>
                    </>
                  )}

                  <div className="font-medium">Brought Dead:</div>
                  <div>{watch("broughtDead") ? "Yes" : "No"}</div>

                  <div className="font-medium">Case Type:</div>
                  <div>
                    {watch("caseType") === "other"
                      ? `Other: ${watch("otherCaseType")}`
                      : CaseTypeOptions.find((c) => c.value === watch("caseType"))?.label || "Not specified"}
                  </div>

                  {watch("incidentDescription") && (
                    <>
                      <div className="font-medium">Incident Description:</div>
                      <div>{watch("incidentDescription")}</div>
                    </>
                  )}

                  <div className="font-medium">Medico-Legal Case:</div>
                  <div>{watch("isMLC") ? "Yes" : "No"}</div>

                  {watch("isMLC") && (
                    <>
                      <div className="font-medium">MLC Number:</div>
                      <div>{watch("mlcNumber")}</div>
                    </>
                  )}

                  <div className="font-medium">Police Informed:</div>
                  <div>{watch("policeInformed") ? "Yes" : "No"}</div>
                </>
              )}
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => validateAndSubmit(watch())}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {loading ? "Processing..." : "Confirm & Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Service Dialog */}
      <Dialog open={serviceDialogOpen} onOpenChange={setServiceDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Service</DialogTitle>
            <DialogDescription>Enter service details to add to the bill</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="serviceName">Service Name</Label>
              <Input
                id="serviceName"
                value={newService.name}
                onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                placeholder="Enter service name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="serviceAmount">Amount (₹)</Label>
              <Input
                id="serviceAmount"
                type="number"
                value={newService.amount}
                onChange={(e) => setNewService({ ...newService, amount: Number(e.target.value) })}
                placeholder="Enter amount"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setServiceDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleAddService}>
              Add Service
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Appointment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this on-call appointment? This action cannot be undone.
            </AlertDialogDescription>
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

export default OPDBookingPage
