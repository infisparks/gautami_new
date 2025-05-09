"use client"

import { useState, useEffect, useRef } from "react"
import { useForm, Controller } from "react-hook-form"
import { db } from "../../lib/firebase" // Gautami DB
import { db as dbMedford } from "../../lib/firebaseMedford" // Medford Family DB
import { ref, push, update, get, onValue, set } from "firebase/database"
import Head from "next/head"
import { useRouter } from "next/navigation"
import { MapPin, Clock, MessageSquare, FileText, Info, CheckCircle, UserCheck, Building, Ambulance, AlertTriangle, Stethoscope, ArrowLeftIcon } from 'lucide-react'
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Separator } from "@/components/ui/separator"
import { differenceInYears } from "date-fns"
import { PersonIcon } from "@radix-ui/react-icons"

/** ---------------------------
 *   TYPE & CONSTANT DEFINITIONS
 *  ---------------------------
 */
interface IFormInput {
  name: string
  phone: string
  age: number
  gender: string
  dob: Date | null
  address?: string
  date: Date
  time: string
  message?: string
  modeOfArrival: "ambulance" | "walkin" | "referred"
  broughtBy?: string
  referralHospital?: string
  broughtDead: boolean
  caseType: "rta" | "physicalAssault" | "burn" | "poisoning" | "snakeBite" | "cardiac" | "fall" | "other"
  otherCaseType?: string
  incidentDescription?: string
  isMLC: boolean
  mlcNumber?: string
  policeInformed: boolean
  attendingDoctor?: string
  triageCategory: "red" | "yellow" | "green" | "black"
  vitalSigns?: {
    bloodPressure?: string
    pulse?: number
    temperature?: number
    oxygenSaturation?: number
    respiratoryRate?: number
    gcs?: number
  }
}

interface PatientRecord {
  id: string
  name: string
  phone: string
  age?: number
  gender?: string
  dob?: string
  address?: string
  createdAt?: string
  casualty?: any // Casualty subfields
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
  dob?: string
  source: "gautami" | "other"
  data: PatientRecord | MedfordPatient
}

interface Doctor {
  id: string
  name: string
  specialty?: string
}

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

const TriageCategoryOptions = [
  { value: "red", label: "Red (Immediate)", description: "Life-threatening conditions requiring immediate attention" },
  { value: "yellow", label: "Yellow (Urgent)", description: "Serious conditions requiring prompt attention" },
  { value: "green", label: "Green (Non-urgent)", description: "Minor injuries or illnesses" },
  { value: "black", label: "Black (Deceased)", description: "No signs of life" },
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

/** Calculate age from DOB */
function calculateAge(dob: Date | null): number {
  if (!dob) return 0
  return differenceInYears(new Date(), dob)
}

/** ---------------
 *    MAIN COMPONENT
 *  ---------------
 */
const CasualtyFormPage = () => {
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
      dob: null,
      address: "",
      date: new Date(),
      time: formatAMPM(new Date()),
      message: "",
      modeOfArrival: "walkin",
      broughtBy: "",
      referralHospital: "",
      broughtDead: false,
      caseType: "other",
      otherCaseType: "",
      incidentDescription: "",
      isMLC: false,
      mlcNumber: "",
      policeInformed: false,
      attendingDoctor: "",
      triageCategory: "yellow",
      vitalSigns: {
        bloodPressure: "",
        pulse: 0,
        temperature: 0,
        oxygenSaturation: 0,
        respiratoryRate: 0,
        gcs: 15,
      },
    },
    mode: "onChange",
  })

  // States for UI control
  const [loading, setLoading] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [doctors, setDoctors] = useState<Doctor[]>([])

  // States for patient management
  const [patientNameInput, setPatientNameInput] = useState("")
  const [patientSuggestions, setPatientSuggestions] = useState<CombinedPatient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<CombinedPatient | null>(null)
  const [patientPhoneInput, setPatientPhoneInput] = useState("")
  const [phoneSuggestions, setPhoneSuggestions] = useState<CombinedPatient[]>([])
  const [gautamiPatients, setGautamiPatients] = useState<CombinedPatient[]>([])
  const [medfordPatients, setMedfordPatients] = useState<CombinedPatient[]>([])

  // Refs
  const phoneSuggestionBoxRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const phoneInputRef = useRef<HTMLInputElement>(null)

  // Watch for form changes
  const caseType = watch("caseType")
  const isMLC = watch("isMLC")
  const broughtDead = watch("broughtDead")
  const dob = watch("dob")
  const triageCategory = watch("triageCategory")

  // Update age when DOB changes
  useEffect(() => {
    if (dob) {
      setValue("age", calculateAge(dob))
    }
  }, [dob, setValue])

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
          specialty: data[key].specialty || "",
        }))
        setDoctors(doctorsList)
      } else {
        setDoctors([])
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
            dob: data[key].dob,
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
            dob: rec.dob,
            source: "other",
            data: rec,
          })
        }
      }
      setMedfordPatients(loaded)
    })
    return () => unsubscribe()
  }, [])

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
      const patientData = patient.data as PatientRecord
      setValue("address", patientData.address || "")
      setValue("gender", patientData.gender || "")

      if (patientData.dob) {
        try {
          const dobDate = new Date(patientData.dob)
          setValue("dob", dobDate)
          setValue("age", calculateAge(dobDate))
        } catch (e) {
          console.error("Error parsing DOB:", e)
        }
      } else if (patientData.age) {
        setValue("age", patientData.age)
      }
    } else {
      const medfordData = patient.data as MedfordPatient
      setValue("gender", medfordData.gender || "")

      if (medfordData.dob) {
        try {
          const dobDate = new Date(medfordData.dob)
          setValue("dob", dobDate)
          setValue("age", calculateAge(dobDate))
        } catch (e) {
          console.error("Error parsing DOB:", e)
        }
      }
    }

    setPatientSuggestions([])
    setPhoneSuggestions([])
    toast.info(`Patient ${patient.name} selected from ${patient.source.toUpperCase()}!`)
  }

  /**
   * ----------------------------------------------------------------------
   *  SUBMISSION LOGIC:
   *   1. If an existing patient is selected, push casualty data.
   *   2. Otherwise, create a new patient record in Gautami DB (full details)
   *      and a minimal record in Medford DB, then push casualty data.
   * ----------------------------------------------------------------------
   */
  const validateAndSubmit = async (data: IFormInput) => {
    // Check required fields manually
    const requiredFields = [
      "name",
      "phone",
      "age",
      "gender",
      "date",
      "time",
      "modeOfArrival",
      "caseType",
      "triageCategory",
    ]

    // Add conditional required fields
    if (data.caseType === "other") {
      requiredFields.push("otherCaseType")
    }

    if (data.isMLC) {
      requiredFields.push("mlcNumber")
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
      if (data.caseType === "other" && errors.otherCaseType) {
        toast.error("Please specify the other case type")
        return
      }

      if (data.isMLC && errors.mlcNumber) {
        toast.error("Please enter MLC number")
        return
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
      // 1) Determine patientId and upsert the patient record
      const patientId = selectedPatient?.id ?? generatePatientId()
      const patientRef = ref(db, `patients/${patientId}`)
      const basePatientData = {
        name: data.name,
        phone: data.phone,
        age: data.age,
        gender: data.gender,
        dob: data.dob ? data.dob.toISOString() : "",
        address: data.address || "",
        updatedAt: new Date().toISOString(),
      }
  
      if (!selectedPatient) {
        // New patient
        await set(patientRef, {
          ...basePatientData,
          createdAt: new Date().toISOString(),
          uhid: patientId,
        })
        // Mirror minimal record into Medford DB
        await set(ref(dbMedford, `patients/${patientId}`), {
          name: data.name,
          contact: data.phone,
          gender: data.gender,
          dob: data.dob ? data.dob.toISOString() : "",
          patientId,
          hospitalName: "MEDFORD",
        })
      } else {
        // Existing patient — just patch
        await update(patientRef, basePatientData)
      }
  
      // 2) Push casualty record *only* under this patient
      const casualtyListRef = ref(db, `patients/${patientId}/casualty`)
      const newCasualtyRef = push(casualtyListRef)
      const casualtyData = {
        id: newCasualtyRef.key,
        patientId,
        name: data.name,
        phone: data.phone,
        age: data.age,
        gender: data.gender,
        dob: data.dob ? data.dob.toISOString() : "",
        date: data.date.toISOString(),
        time: data.time,
        modeOfArrival: data.modeOfArrival,
        broughtBy: data.broughtBy || "",
        referralHospital: data.referralHospital || "",
        broughtDead: data.broughtDead,
        caseType: data.caseType,
        otherCaseType: data.caseType === "other" ? data.otherCaseType : "",
        incidentDescription: data.incidentDescription || "",
        isMLC: data.isMLC,
        mlcNumber: data.isMLC ? data.mlcNumber : "",
        policeInformed: data.policeInformed,
        attendingDoctor: data.attendingDoctor || "",
        triageCategory: data.triageCategory,
        vitalSigns: data.vitalSigns,
        createdAt: new Date().toISOString(),
        status: data.broughtDead ? "deceased" : "active",
      }
      await set(newCasualtyRef, casualtyData)
  
      toast.success("Casualty case registered successfully!", {
        position: "top-right",
        autoClose: 5000,
      })
  
      // 3) Reset form & state, then navigate
      reset({
        name: "",
        phone: "",
        age: 0,
        gender: "",
        dob: null,
        address: "",
        date: new Date(),
        time: formatAMPM(new Date()),
        message: "",
        modeOfArrival: "walkin",
        broughtBy: "",
        referralHospital: "",
        broughtDead: false,
        caseType: "other",
        otherCaseType: "",
        incidentDescription: "",
        isMLC: false,
        mlcNumber: "",
        policeInformed: false,
        attendingDoctor: "",
        triageCategory: "yellow",
        vitalSigns: {
          bloodPressure: "",
          pulse: 0,
          temperature: 0,
          oxygenSaturation: 0,
          respiratoryRate: 0,
          gcs: 15,
        },
      })
      setSelectedPatient(null)
      setPatientNameInput("")
      setPatientPhoneInput("")
      router.push("/casualty/list")
    } catch (error) {
      console.error("Error registering casualty:", error)
      toast.error("Failed to register casualty. Please try again.", {
        position: "top-right",
        autoClose: 5000,
      })
    } finally {
      setLoading(false)
    }
  }
  

  /** -----------
   *   RENDER UI
   *  -----------
   */
  return (
    <>
      <Head>
        <title>Casualty Registration Form</title>
        <meta name="description" content="Register casualty patients" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ToastContainer position="top-right" autoClose={3000} />

      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-4 py-8">
          <Card className="w-full max-w-6xl mx-auto shadow-lg">
            <CardHeader className="bg-gradient-to-r from-red-500 to-orange-600 text-white">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-2xl md:text-3xl font-bold">Casualty Registration Form</CardTitle>
                  <CardDescription className="text-red-100">
                    Register emergency cases efficiently
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push("/casualty/list")}
                    className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                  >
                    View All Casualties
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push("/dashboard")}
                    className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                  >
                    <ArrowLeftIcon className="mr-2 h-4 w-4" />
                    Dashboard
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  validateAndSubmit(watch())
                }}
                className="space-y-6"
              >
                <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-md border border-red-100 dark:border-red-900/30 mb-6">
                  <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-2 flex items-center">
                    <AlertTriangle className="h-5 w-5 mr-2" />
                    Emergency Case Registration
                  </h3>
                  <p className="text-sm text-red-600 dark:text-red-300">
                    Please fill in all required fields marked with <span className="text-red-500">*</span>
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Patient Information Section */}
                  <div className="col-span-2">
                    <h3 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-200 flex items-center">
                      <PersonIcon className="h-5 w-5 mr-2 text-red-500" />
                      Patient Information
                    </h3>
                    <Separator className="mb-4" />
                  </div>

                  {/* Patient Name Field with Auto-Suggest */}
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-medium">
                      Patient Name <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
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
                        className={`${errors.name ? "border-red-500" : ""}`}
                      />
                      {patientSuggestions.length > 0 && !selectedPatient && (
                        <ScrollArea className="absolute z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md w-full mt-1 max-h-48 shadow-lg">
                          <div className="p-1">
                            {patientSuggestions.map((suggestion) => (
                              <div
                                key={suggestion.id}
                                className="flex items-center justify-between px-3 py-2 hover:bg-red-50 dark:hover:bg-gray-700 rounded-md cursor-pointer"
                                onClick={() => handlePatientSuggestionClick(suggestion)}
                              >
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-6 w-6">
                                    <AvatarFallback className="text-xs bg-red-100 text-red-700">
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
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-medium">
                      Phone Number <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
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
                        className={`${errors.phone ? "border-red-500" : ""}`}
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
                              className="flex items-center justify-between px-3 py-2 hover:bg-red-50 dark:hover:bg-gray-700 cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <Avatar className="h-6 w-6">
                                  <AvatarFallback className="text-xs bg-red-100 text-red-700">
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

                  {/* Date of Birth Field */}
                  <div className="space-y-2">
                    <Label htmlFor="dob" className="text-sm font-medium">
                      Date of Birth
                    </Label>
                    <div className="relative">
                      <Controller
                        control={control}
                        name="dob"
                        render={({ field }) => (
                          <DatePicker
                            selected={field.value}
                            onChange={(date: Date | null) => {
                              field.onChange(date)
                              if (date) {
                                setValue("age", calculateAge(date))
                              }
                            }}
                            dateFormat="dd/MM/yyyy"
                            placeholderText="Select Date of Birth"
                            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 border-gray-300 dark:border-gray-600 dark:bg-gray-800"
                            showYearDropdown
                            scrollableYearDropdown
                            yearDropdownItemNumber={100}
                          />
                        )}
                      />
                    </div>
                  </div>

                  {/* Age Field */}
                  <div className="space-y-2">
                    <Label htmlFor="age" className="text-sm font-medium">
                      Age <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="age"
                      type="number"
                      {...register("age", {
                        required: "Age is required",
                        min: { value: 0, message: "Age must be positive" },
                      })}
                      placeholder="Enter age"
                      className={`${errors.age ? "border-red-500" : ""}`}
                    />
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

                  {/* Address Field */}
                  <div className="space-y-2 col-span-2">
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

                  {/* Casualty Details Section */}
                  <div className="col-span-2 mt-4">
                    <h3 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-200 flex items-center">
                      <Ambulance className="h-5 w-5 mr-2 text-red-500" />
                      Casualty Details
                    </h3>
                    <Separator className="mb-4" />
                  </div>

                  {/* Date Field */}
                  <div className="space-y-2">
                    <Label htmlFor="date" className="text-sm font-medium">
                      Date <span className="text-red-500">*</span>
                    </Label>
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
                          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 border-gray-300 dark:border-gray-600 dark:bg-gray-800 ${
                            errors.date ? "border-red-500" : ""
                          }`}
                        />
                      )}
                    />
                    {errors.date && <p className="text-sm text-red-500">{errors.date.message}</p>}
                  </div>

                  {/* Time Field */}
                  <div className="space-y-2">
                    <Label htmlFor="time" className="text-sm font-medium">
                      Time <span className="text-red-500">*</span>
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

                  {/* Mode of Arrival */}
                  <div className="space-y-2">
                    <Label htmlFor="modeOfArrival" className="text-sm font-medium">
                      Mode of Arrival <span className="text-red-500">*</span>
                    </Label>
                    <Controller
                      control={control}
                      name="modeOfArrival"
                      rules={{ required: "Mode of arrival is required" }}
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
                    {errors.modeOfArrival && <p className="text-sm text-red-500">{errors.modeOfArrival.message}</p>}
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

                  {/* Attending Doctor */}
                  <div className="space-y-2">
                    <Label htmlFor="attendingDoctor" className="text-sm font-medium">
                      Attending Doctor
                    </Label>
                    <Controller
                      control={control}
                      name="attendingDoctor"
                      render={({ field }) => (
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                  </div>

                  {/* Triage Category */}
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="triageCategory" className="text-sm font-medium">
                      Triage Category <span className="text-red-500">*</span>
                    </Label>
                    <Controller
                      control={control}
                      name="triageCategory"
                      rules={{ required: "Triage category is required" }}
                      render={({ field }) => (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          {TriageCategoryOptions.map((option) => (
                            <div
                              key={option.value}
                              className={`border rounded-md p-3 cursor-pointer transition-colors ${
                                field.value === option.value
                                  ? option.value === "red"
                                    ? "border-red-500 bg-red-50 dark:bg-red-900/20"
                                    : option.value === "yellow"
                                      ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20"
                                      : option.value === "green"
                                        ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                                        : "border-gray-500 bg-gray-50 dark:bg-gray-900/20"
                                  : "border-gray-200 dark:border-gray-700"
                              }`}
                              onClick={() => field.onChange(option.value)}
                            >
                              <div className="flex items-center gap-2">
                                <div
                                  className={`h-4 w-4 rounded-full ${
                                    option.value === "red"
                                      ? "bg-red-500"
                                      : option.value === "yellow"
                                        ? "bg-yellow-500"
                                        : option.value === "green"
                                          ? "bg-green-500"
                                          : "bg-gray-500"
                                  }`}
                                ></div>
                                <span className="font-medium">{option.label}</span>
                              </div>
                              <p className="text-xs text-gray-500 mt-1 ml-6">{option.description}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    />
                    {errors.triageCategory && (
                      <p className="text-sm text-red-500">{errors.triageCategory.message}</p>
                    )}
                  </div>

                  {/* Brought Dead */}
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="broughtDead"
                        checked={watch("broughtDead")}
                        onCheckedChange={(checked) => {
                          setValue("broughtDead", checked === true)
                          if (checked === true) {
                            setValue("triageCategory", "black")
                          }
                        }}
                      />
                      <Label htmlFor="broughtDead" className="text-sm font-medium">
                        Brought Dead
                      </Label>
                    </div>
                  </div>

                  {/* Case Details Section */}
                  <div className="col-span-2 mt-4">
                    <h3 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-200 flex items-center">
                      <FileText className="h-5 w-5 mr-2 text-red-500" />
                      Case Details
                    </h3>
                    <Separator className="mb-4" />
                  </div>

                  {/* Type of Case */}
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="caseType" className="text-sm font-medium">
                      Type of Case <span className="text-red-500">*</span>
                    </Label>
                    <Controller
                      control={control}
                      name="caseType"
                      rules={{ required: "Case type is required" }}
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
                    <div className="space-y-2 col-span-2">
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
                  <div className="space-y-2 col-span-2">
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

                  {/* MLC Number (if MLC is checked) */}
                  {isMLC && (
                    <div className="space-y-2 col-span-2">
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

                  {/* Vital Signs Section */}
                  <div className="col-span-2 mt-4">
                    <h3 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-200 flex items-center">
                      <Stethoscope className="h-5 w-5 mr-2 text-red-500" />
                      Vital Signs
                    </h3>
                    <Separator className="mb-4" />
                  </div>

                  {/* Blood Pressure */}
                  <div className="space-y-2">
                    <Label htmlFor="bloodPressure" className="text-sm font-medium">
                      Blood Pressure
                    </Label>
                    <Input
                      id="bloodPressure"
                      type="text"
                      {...register("vitalSigns.bloodPressure")}
                      placeholder="e.g. 120/80 mmHg"
                    />
                  </div>

                  {/* Pulse */}
                  <div className="space-y-2">
                    <Label htmlFor="pulse" className="text-sm font-medium">
                      Pulse Rate
                    </Label>
                    <Input
                      id="pulse"
                      type="number"
                      {...register("vitalSigns.pulse", {
                        min: { value: 0, message: "Pulse must be positive" },
                      })}
                      placeholder="e.g. 72 bpm"
                    />
                  </div>

                  {/* Temperature */}
                  <div className="space-y-2">
                    <Label htmlFor="temperature" className="text-sm font-medium">
                      Temperature
                    </Label>
                    <Input
                      id="temperature"
                      type="number"
                      step="0.1"
                      {...register("vitalSigns.temperature", {
                        min: { value: 0, message: "Temperature must be positive" },
                      })}
                      placeholder="e.g. 98.6 °F"
                    />
                  </div>

                  {/* Oxygen Saturation */}
                  <div className="space-y-2">
                    <Label htmlFor="oxygenSaturation" className="text-sm font-medium">
                      Oxygen Saturation
                    </Label>
                    <Input
                      id="oxygenSaturation"
                      type="number"
                      {...register("vitalSigns.oxygenSaturation", {
                        min: { value: 0, message: "Oxygen saturation must be positive" },
                        max: { value: 100, message: "Oxygen saturation cannot exceed 100%" },
                      })}
                      placeholder="e.g. 98 %"
                    />
                  </div>

                  {/* Respiratory Rate */}
                  <div className="space-y-2">
                    <Label htmlFor="respiratoryRate" className="text-sm font-medium">
                      Respiratory Rate
                    </Label>
                    <Input
                      id="respiratoryRate"
                      type="number"
                      {...register("vitalSigns.respiratoryRate", {
                        min: { value: 0, message: "Respiratory rate must be positive" },
                      })}
                      placeholder="e.g. 16 breaths/min"
                    />
                  </div>

                  {/* Glasgow Coma Scale */}
                  <div className="space-y-2">
                    <Label htmlFor="gcs" className="text-sm font-medium">
                      Glasgow Coma Scale (GCS)
                    </Label>
                    <Input
                      id="gcs"
                      type="number"
                      {...register("vitalSigns.gcs", {
                        min: { value: 3, message: "GCS must be at least 3" },
                        max: { value: 15, message: "GCS cannot exceed 15" },
                      })}
                      placeholder="e.g. 15 (3-15)"
                    />
                  </div>

                  {/* Additional Notes */}
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

                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setPreviewOpen(true)}>
                    Preview
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700"
                  >
                    {loading ? "Submitting..." : "Register Casualty"}
                  </Button>
                </div>
              </form>
            </CardContent>

            {selectedPatient && (
              <div className="px-6 py-3 bg-red-50 dark:bg-red-900/10 border-t border-red-100 dark:border-red-900/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                    <span className="text-sm font-medium">
                      Patient selected: <span className="text-red-600 dark:text-red-400">{selectedPatient.name}</span>
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/opdbooking")}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                Go to OPD Booking
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Casualty Registration Preview</DialogTitle>
            <DialogDescription>Review casualty details before submitting</DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh]">
            <div className="grid gap-4 py-4 px-1">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="col-span-2 font-semibold text-red-600 border-b pb-1">Patient Information</div>

                <div className="font-medium">Patient Name:</div>
                <div>{watch("name")}</div>

                <div className="font-medium">Phone:</div>
                <div>{watch("phone")}</div>

                <div className="font-medium">Age:</div>
                <div>{watch("age")}</div>

                <div className="font-medium">Gender:</div>
                <div>{GenderOptions.find((g) => g.value === watch("gender"))?.label || watch("gender")}</div>

                {watch("dob") && (
                  <>
                    <div className="font-medium">Date of Birth:</div>
                    <div>{watch("dob")?.toLocaleDateString()}</div>
                  </>
                )}

                {watch("address") && (
                  <>
                    <div className="font-medium">Address:</div>
                    <div>{watch("address")}</div>
                  </>
                )}

                <div className="col-span-2 font-semibold text-red-600 border-b pb-1 mt-4">Casualty Details</div>

                <div className="font-medium">Date:</div>
                <div>{watch("date")?.toLocaleDateString()}</div>

                <div className="font-medium">Time:</div>
                <div>{watch("time")}</div>

                <div className="font-medium">Mode of Arrival:</div>
                <div>
                  {ModeOfArrivalOptions.find((m) => m.value === watch("modeOfArrival"))?.label ||
                    watch("modeOfArrival")}
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

                <div className="font-medium">Attending Doctor:</div>
                <div>
                  {watch("attendingDoctor")
                    ? doctors.find((d) => d.id === watch("attendingDoctor"))?.name || "Not specified"
                    : "Not specified"}
                </div>

                <div className="font-medium">Triage Category:</div>
                <div>
                  <Badge
                    className={
                      triageCategory === "red"
                        ? "bg-red-500"
                        : triageCategory === "yellow"
                          ? "bg-yellow-500 text-black"
                          : triageCategory === "green"
                            ? "bg-green-500"
                            : "bg-gray-500"
                    }
                  >
                    {TriageCategoryOptions.find((t) => t.value === triageCategory)?.label || triageCategory}
                  </Badge>
                </div>

                <div className="col-span-2 font-semibold text-red-600 border-b pb-1 mt-4">Case Details</div>

                <div className="font-medium">Case Type:</div>
                <div>
                  {watch("caseType") === "other"
                    ? `Other: ${watch("otherCaseType")}`
                    : CaseTypeOptions.find((c) => c.value === watch("caseType"))?.label || watch("caseType")}
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

                <div className="col-span-2 font-semibold text-red-600 border-b pb-1 mt-4">Vital Signs</div>

               {watch("vitalSigns")?.bloodPressure && (
                  <>
                    <div className="font-medium">Blood Pressure:</div>
                    <div>{watch("vitalSigns.bloodPressure")}</div>
                  </>
                )}

                {watch("vitalSigns")?.pulse && (
                  <>
                    <div className="font-medium">Pulse Rate:</div>
                    <div>{watch("vitalSigns.pulse")} bpm</div>
                  </>
                )}

{watch("vitalSigns")?.temperature != null && (
                  <>
                    <div className="font-medium">Temperature:</div>
                    <div>{watch("vitalSigns")?.temperature} °F</div>
                 </>
              )}

{(watch("vitalSigns")?.oxygenSaturation ?? 0) > 0 && (
                  <>
                    <div className="font-medium">Oxygen Saturation:</div>
                    <div>{watch("vitalSigns")?.oxygenSaturation}%</div>
                  </>
                )}

{(watch("vitalSigns")?.respiratoryRate ?? 0) > 0 && (
                  <>
                    <div className="font-medium">Respiratory Rate:</div>
                    <div>{watch("vitalSigns")?.respiratoryRate} breaths/min</div>
                  </>
                )}

{(watch("vitalSigns")?.gcs ?? 0) > 0 && (
                  <>
                    <div className="font-medium">Glasgow Coma Scale:</div>
                    <div>{watch("vitalSigns")?.gcs}/15</div>
                  </>
                )}

                {watch("message") && (
                  <>
                    <div className="col-span-2 font-semibold text-red-600 border-b pb-1 mt-4">Additional Notes</div>
                    <div className="col-span-2">{watch("message")}</div>
                  </>
                )}
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => validateAndSubmit(watch())}
              disabled={loading}
              className="bg-red-600 hover:bg-red-700"
            >
              {loading ? "Processing..." : "Confirm & Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default CasualtyFormPage
