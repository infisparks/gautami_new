"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { db, auth } from "@/lib/firebase"
import { ref, push, update, get, onValue, set, remove } from "firebase/database"
import Head from "next/head"
import { CheckCircle, HelpCircle } from "lucide-react"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import Joyride, { type CallBackProps, STATUS } from "react-joyride"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useRouter } from "next/navigation"
import { onAuthStateChanged } from "firebase/auth"
import {
  type IFormInput,
  type PatientRecord,
  type Doctor,
  type OnCallAppointment,
  PaymentOptions,
  GenderOptions,
  ModalityOptions,
} from "./types"
import { PatientForm } from "./patient-form"
import { OnCallAppointments } from "./oncall-appointments"

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

const OPDBookingPage: React.FC = () => {
  const router = useRouter()
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)

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

  // Form state using React Hook Form
  const form = useForm<IFormInput>({
    defaultValues: {
      name: "",
      phone: "",
      age: undefined,
      gender: "",
      address: "",
      date: new Date(),
      time: formatAMPM(new Date()),
      message: "",
      paymentMethod: "cash",
      cashAmount: undefined,
      onlineAmount: undefined,
      discount: undefined,
      // serviceName: "",
      doctor: "",
      referredBy: "",
      appointmentType: "visithospital",
      opdType: "opd",
      modality: "consultation",
      visitType: "first",
      study: "",
    },
    mode: "onChange",
  })

  const { handleSubmit, reset, watch, setValue, trigger, getValues } = form

  // UI states
  const [loading, setLoading] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("form")
  const [doctors, setDoctors] = useState<Doctor[]>([])

  // Patient management
  const [patientSuggestions, setPatientSuggestions] = useState<PatientRecord[]>([])
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null)
  const [phoneSuggestions, setPhoneSuggestions] = useState<PatientRecord[]>([])
  const [gautamiPatients, setGautamiPatients] = useState<PatientRecord[]>([])
  const [showNameSuggestions, setShowNameSuggestions] = useState(false)
  const [showPhoneSuggestions, setShowPhoneSuggestions] = useState(false)

  // On-call appointments
  const [oncallAppointments, setOncallAppointments] = useState<OnCallAppointment[]>([])

  // Joyride (guided tour)
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
      target: '[data-tour="modality"]',
      content: "Select the modality - Consultation, Casualty, or X-Ray.",
    },
    {
      target: '[data-tour="date"]',
      content: "Choose the appointment date.",
    },
    {
      target: '[data-tour="time"]',
      content: "Enter the appointment time.",
    },
    // {
    //   target: '[data-tour="serviceName"]',
    //   content: "Enter the service name for the appointment.",
    // },
  ]

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status } = data
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRunTour(false)
    }
  }

  // Watchers
  const watchedName = watch("name")
  const watchedPhone = watch("phone")

  // Fetch doctors
  useEffect(() => {
    const doctorsRef = ref(db, "doctors")
    const unsubscribe = onValue(doctorsRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const doctorsList: Doctor[] = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }))
        setDoctors(doctorsList)
      } else {
        setDoctors([])
      }
    })
    return () => unsubscribe()
  }, [])

  // Fetch patients from Gautami DB only
  useEffect(() => {
    const patientsRef = ref(db, "patients/patientinfo")
    const unsubscribe = onValue(patientsRef, (snapshot) => {
      const data = snapshot.val()
      const loaded: PatientRecord[] = []
      if (data) {
        for (const key in data) {
          loaded.push({
            ...data[key],
            id: key,
          })
        }
      }
      setGautamiPatients(loaded)
    })
    return () => unsubscribe()
  }, [])

  // On-call appointments
  useEffect(() => {
    const oncallRef = ref(db, "oncall")
    const unsubscribe = onValue(oncallRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const appointments = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }))
        appointments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        setOncallAppointments(appointments)
      } else {
        setOncallAppointments([])
      }
    })
    return () => unsubscribe()
  }, [])

  // Name suggestions when watchedName changes
  useEffect(() => {
    if (watchedName && watchedName.length >= 2) {
      if (selectedPatient && watchedName === selectedPatient.name) {
        setPatientSuggestions([])
        setShowNameSuggestions(false)
      } else {
        const lower = watchedName.toLowerCase()
        const suggestions = gautamiPatients.filter((p) => p.name.toLowerCase().includes(lower))
        setPatientSuggestions(suggestions)
        setShowNameSuggestions(suggestions.length > 0)
      }
    } else {
      setPatientSuggestions([])
      setShowNameSuggestions(false)
    }
  }, [watchedName, gautamiPatients, selectedPatient])

  // Phone suggestions when watchedPhone changes
  useEffect(() => {
    if (watchedPhone && watchedPhone.length >= 2) {
      if (selectedPatient && watchedPhone === selectedPatient.phone) {
        setPhoneSuggestions([])
        setShowPhoneSuggestions(false)
      } else {
        const suggestions = gautamiPatients.filter((p) => p.phone && p.phone.includes(watchedPhone))
        setPhoneSuggestions(suggestions)
        setShowPhoneSuggestions(suggestions.length > 0)
      }
    } else {
      setPhoneSuggestions([])
      setShowPhoneSuggestions(false)
    }
  }, [watchedPhone, gautamiPatients, selectedPatient])

  // Select patient from dropdown, auto-fill form
  const handlePatientSuggestionClick = (patient: PatientRecord) => {
    setSelectedPatient(patient)

    setValue("name", patient.name, { shouldValidate: true })
    setValue("phone", patient.phone || "", { shouldValidate: true })
    setValue("address", patient.address || "", { shouldValidate: true })
    setValue("age", patient.age || 0, { shouldValidate: true }) // Changed undefined to 0 to fix the error
    setValue("gender", patient.gender || "", { shouldValidate: true })

    setPatientSuggestions([])
    setPhoneSuggestions([])
    setShowNameSuggestions(false)
    setShowPhoneSuggestions(false)

    toast.info(`Patient ${patient.name} selected!`)
  }

  // Handlers for manual name/phone typing
  const handleNameInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setValue("name", value, { shouldValidate: true })
    setSelectedPatient(null)
  }

  const handlePhoneInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setValue("phone", value, { shouldValidate: true })
    setSelectedPatient(null)
  }

  // Calculate total amount
  const calculateTotalAmount = () => {
    const cashAmount = Number(watch("cashAmount")) || 0
    const onlineAmount = Number(watch("onlineAmount")) || 0
    const discount = Number(watch("discount")) || 0
    return cashAmount + onlineAmount - discount
  }

  // Validation & submission logic
  const validateAndSubmit = async (data: IFormInput) => {
    const requiredFields = ["name", "phone", "age", "gender", "date", "time", "modality"]

    if (data.modality === "consultation") {
      requiredFields.push("doctor", "visitType")
    }

    if (data.modality === "casualty" || data.modality === "xray") {
      requiredFields.push("study")
    }

    if (data.appointmentType === "visithospital") {
      requiredFields.push("paymentMethod")
      if (data.paymentMethod === "mixed") {
        requiredFields.push("cashAmount", "onlineAmount")
      } else {
        requiredFields.push("cashAmount")
      }
    }

    const isValid = await trigger(requiredFields as any)
    if (!isValid) {
      toast.error("Please fill all required fields")
      return
    }

    onSubmit(data)
  }

  // onSubmit: saves to Firebase
  const onSubmit = async (data: IFormInput) => {
    const cashAmount = data.appointmentType === "visithospital" ? Number(data.cashAmount) || 0 : 0
    const onlineAmount = data.appointmentType === "visithospital" ? Number(data.onlineAmount) || 0 : 0
    const discount = data.appointmentType === "visithospital" ? Number(data.discount) || 0 : 0
    const finalAmount = cashAmount + onlineAmount - discount

    setLoading(true)
    try {
      if (data.appointmentType === "oncall") {
        // Save under "oncall"
        const oncallRef = ref(db, "oncall")
        const newOncallRef = push(oncallRef)
        await set(newOncallRef, {
          name: data.name,
          phone: data.phone,
          age: data.age,
          gender: data.gender,
          date: data.date.toISOString(),
          time: data.time,
          doctor: data.doctor || "",
          // serviceName: data.serviceName,
          appointmentType: "oncall",
          opdType: data.opdType,
          modality: data.modality,
          visitType: data.visitType || "",
          study: data.study || "",
          enteredBy: currentUserEmail || "unknown",
          originalAmount: cashAmount + onlineAmount,
          amount: finalAmount,
          discount: discount,
          referredBy: data.referredBy || "",
          createdAt: new Date().toISOString(),
        })

        // WhatsApp notification
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
// • Service: ${data.serviceName}
• Modality: ${data.modality}

Our doctor will call you at the scheduled time. Please keep your phone available.

Thank you,
Gautami Hospital
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
        // VISIT HOSPITAL
        let uhid = ""
        if (selectedPatient) {
          uhid = selectedPatient.id

          // Update patientinfo under "patients/patientinfo/{uhid}"
          await update(ref(db, `patients/patientinfo/${uhid}`), {
            name: data.name,
            phone: data.phone,
            age: data.age,
            address: data.address,
            gender: data.gender,
            updatedAt: new Date().toISOString(),
          })

          // Now push OPD record under `patients/opddetail/${uhid}`
          const opdListRef = ref(db, `patients/opddetail/${uhid}`)
          const newOpdRef = push(opdListRef)
          await set(newOpdRef, {
            name: data.name,
            phone: data.phone,
            patientId: uhid,
            date: data.date.toISOString(),
            time: data.time,
            paymentMethod: data.paymentMethod,
            cashAmount: cashAmount,
            onlineAmount: onlineAmount,
            originalAmount: cashAmount + onlineAmount,
            amount: finalAmount,
            discount: discount,
            // serviceName: data.serviceName,
            doctor: data.doctor || "",
            modality: data.modality,
            visitType: data.visitType || "",
            study: data.study || "",
            message: data.message || "",
            referredBy: data.referredBy || "",
            appointmentType: data.appointmentType,
            opdType: data.opdType,
            enteredBy: currentUserEmail || "unknown",
            createdAt: new Date().toISOString(),
          })

          // Save payment information in user id/ipdid/payment structure
          if (data.appointmentType === "visithospital") {
            const paymentData = {
              cashAmount: cashAmount,
              onlineAmount: onlineAmount,
              discount: discount,
              totalAmount: finalAmount,
              paymentMethod: data.paymentMethod,
              createdAt: new Date().toISOString(),
            }

            // Get the opdId (ipdid) from the newly created OPD record
            const opdId = newOpdRef.key

            // Save payment data under user id/ipdid/payment
            if (opdId) {
              await set(ref(db, `patients/opddetail/${uhid}/${opdId}/payment`), paymentData)
            }
          }
        } else {
          // New patient → generate new UHID, store patient info, then push OPD
          const newUhid = generatePatientId()
          uhid = newUhid

          // 1) Save patientinfo under "patients/patientinfo/{uhid}"
          await set(ref(db, `patients/patientinfo/${newUhid}`), {
            name: data.name,
            phone: data.phone,
            age: data.age,
            gender: data.gender,
            address: data.address || "",
            createdAt: new Date().toISOString(),
            uhid: newUhid,
          })

          // 2) Push OPD record under `patients/opddetail/${uhid}`
          const opdListRef = ref(db, `patients/opddetail/${newUhid}`)
          const newOpdRef = push(opdListRef)
          await set(newOpdRef, {
            name: data.name,
            phone: data.phone,
            patientId: newUhid,
            date: data.date.toISOString(),
            time: data.time,
            paymentMethod: data.paymentMethod,
            cashAmount: cashAmount,
            onlineAmount: onlineAmount,
            originalAmount: cashAmount + onlineAmount,
            amount: finalAmount,
            discount: discount,
            // serviceName: data.serviceName,
            doctor: data.doctor || "",
            modality: data.modality,
            visitType: data.visitType || "",
            study: data.study || "",
            message: data.message || "",
            referredBy: data.referredBy || "",
            appointmentType: data.appointmentType,
            opdType: data.opdType,
            enteredBy: currentUserEmail || "unknown",
            createdAt: new Date().toISOString(),
          })

          // Save payment information in user id/ipdid/payment structure
          if (data.appointmentType === "visithospital") {
            const paymentData = {
              cashAmount: cashAmount,
              onlineAmount: onlineAmount,
              discount: discount,
              totalAmount: finalAmount,
              paymentMethod: data.paymentMethod,
              createdAt: new Date().toISOString(),
            }

            // Get the opdId (ipdid) from the newly created OPD record
            const opdId = newOpdRef.key

            // Save payment data under user id/ipdid/payment
            if (opdId) {
              await set(ref(db, `patients/${uhid}/${opdId}/payment`), paymentData)
            }
          }
        }

        // WhatsApp notification
        try {
          const selectedDocName = doctors.find((doc) => doc.id === data.doctor)?.name || "No Doctor"
          const formattedDate = data.date.toLocaleDateString("en-IN")
          const paymentDetails =
            data.paymentMethod === "mixed"
              ? `Cash: ₹${cashAmount}, Online: ₹${onlineAmount}`
              : `${data.paymentMethod.toUpperCase()}: ₹${cashAmount + onlineAmount}`

          const professionalMessage = `Hello ${data.name}, 
Your OPD appointment at Gautami Hospital has been successfully booked.

Appointment Details:
• Patient Name: ${data.name}
• Date: ${formattedDate}
• Time: ${data.time}
• Doctor: ${selectedDocName}
// • Service: ${data.serviceName}
• Modality: ${data.modality}
• Payment: ${paymentDetails}${discount > 0 ? ` - Discount: ₹${discount} = Final: ₹${finalAmount}` : ""}

We look forward to serving you!
Thank you,
Gautami Hospital
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

      // Reset form + UI state
      reset({
        name: "",
        phone: "",
        age: undefined,
        gender: "",
        address: "",
        date: new Date(),
        time: formatAMPM(new Date()),
        message: "",
        paymentMethod: "cash",
        cashAmount: undefined,
        onlineAmount: undefined,
        discount: undefined,
        // serviceName: "",
        doctor: "",
        referredBy: "",
        appointmentType: "visithospital",
        opdType: "opd",
        modality: "consultation",
        visitType: "first",
        study: "",
      })
      setPreviewOpen(false)
      setSelectedPatient(null)
      setShowNameSuggestions(false)
      setShowPhoneSuggestions(false)
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

  // Delete an on-call appointment
  const handleDeleteAppointment = async (id: string) => {
    try {
      const appointmentRef = ref(db, `oncall/${id}`)
      const snapshot = await get(appointmentRef)

      if (snapshot.exists()) {
        const appointmentData = snapshot.val()

        // Log deletion under "changesdelete"
        const changesDeleteRef = ref(db, "changesdelete")
        const newChangeRef = push(changesDeleteRef)
        await set(newChangeRef, {
          type: "delete",
          dataType: "opd",
          originalData: appointmentData,
          deletedBy: currentUserEmail || "unknown",
          deletedAt: new Date().toISOString(),
          appointmentId: id,
        })

        // Actually remove it
        await remove(appointmentRef)

        toast.success("Appointment deleted successfully")
      }
    } catch (error) {
      console.error("Error deleting appointment:", error)
      toast.error("Failed to delete appointment")
    }
  }

  // Book OPD visit from on-call appointment
  const handleBookOPDVisit = (appointment: OnCallAppointment) => {
    setActiveTab("form")
    setValue("name", appointment.name)
    setValue("phone", appointment.phone)
    setValue("age", appointment.age)
    setValue("gender", appointment.gender)
    setValue("appointmentType", "visithospital")
    setValue("modality", appointment.modality || "consultation")
    setValue("visitType", appointment.visitType as "first" | "followup" | undefined)
    setValue("study", appointment.study || "")
    // setValue("serviceName", appointment.serviceName || "")
    setValue("doctor", appointment.doctor || "")
    toast.info("On-call patient details loaded to form")
  }

  // Start tour
  const startTour = () => {
    setRunTour(true)
  }

  return (
    <>
      <Head>
        <title>OPD Booking System</title>
        <meta name="description" content="Book your OPD appointment easily" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ToastContainer position="top-right" autoClose={3000} />

      {/* Joyride for guided tour */}
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
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push("/manage-opd")}
                    className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                  >
                    Manage OPD
                  </Button>
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
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <Tabs defaultValue="form" value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="w-full grid grid-cols-3 rounded-none">
                  <TabsTrigger value="form" className="text-sm md:text-base">
                    Appointment Form
                  </TabsTrigger>
                  <TabsTrigger value="oncall" className="text-sm md:text-base">
                    On-Call List
                  </TabsTrigger>
                  <TabsTrigger value="help" className="text-sm md:text-base">
                    Help
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="form" className="p-6">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      validateAndSubmit(getValues())
                    }}
                    className="space-y-6"
                  >
                    <PatientForm
                      form={form}
                      doctors={doctors}
                      patientSuggestions={patientSuggestions}
                      phoneSuggestions={phoneSuggestions}
                      showNameSuggestions={showNameSuggestions}
                      showPhoneSuggestions={showPhoneSuggestions}
                      selectedPatient={selectedPatient}
                      onPatientSelect={handlePatientSuggestionClick}
                      onNameChange={handleNameInputChange}
                      onPhoneChange={handlePhoneInputChange}
                      setShowNameSuggestions={setShowNameSuggestions}
                      setShowPhoneSuggestions={setShowPhoneSuggestions}
                    />

                    <div className="flex flex-col sm:flex-row gap-4 pt-4">
                      <Button type="button" variant="outline" className="flex-1" onClick={() => setPreviewOpen(true)}>
                        Preview
                      </Button>
                      <Button
                        type="submit"
                        className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
                        disabled={loading}
                      >
                        {loading ? "Submitting..." : "Book Appointment"}
                      </Button>
                    </div>
                  </form>
                </TabsContent>

                <TabsContent value="oncall" className="p-6">
                  <OnCallAppointments
                    appointments={oncallAppointments}
                    doctors={doctors}
                    onDeleteAppointment={handleDeleteAppointment}
                    onBookOPDVisit={handleBookOPDVisit}
                    onBookOnCall={() => {
                      setActiveTab("form")
                      setValue("appointmentType", "oncall")
                    }}
                  />
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
                              For patients who will physically visit the hospital. Complete all details including
                              payment information.
                            </p>
                          </div>
                          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                            <p className="font-medium mb-1">On-Call</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              For remote consultations. Basic patient details and modality selection are required.
                            </p>
                          </div>
                        </div>

                        <h4 className="font-semibold text-emerald-700 dark:text-emerald-400">Modality Options</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                            <p className="font-medium mb-1">Consultation</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              Doctor consultation with first visit or follow-up pricing.
                            </p>
                          </div>
                          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                            <p className="font-medium mb-1">Casualty</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              Emergency cases with custom study field.
                            </p>
                          </div>
                          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                            <p className="font-medium mb-1">X-Ray</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              X-Ray studies with predefined options.
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
                  <Badge variant="default">Gautami</Badge>
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

              <div className="font-medium">Patient Name:</div>
              <div>{watch("name")}</div>

              <div className="font-medium">Phone:</div>
              <div>{watch("phone")}</div>

              <div className="font-medium">Age:</div>
              <div>{watch("age")}</div>

              <div className="font-medium">Gender:</div>
              <div>{GenderOptions.find((g) => g.value === watch("gender"))?.label || watch("gender")}</div>

              <div className="font-medium">Modality:</div>
              <div>{ModalityOptions.find((m) => m.value === watch("modality"))?.label || watch("modality")}</div>

              {watch("visitType") && (
                <>
                  <div className="font-medium">Visit Type:</div>
                  <div className="capitalize">{watch("visitType")}</div>
                </>
              )}

              {watch("study") && (
                <>
                  <div className="font-medium">Study:</div>
                  <div>{watch("study")}</div>
                </>
              )}

              {watch("referredBy") && (
                <>
                  <div className="font-medium">Referred By:</div>
                  <div>{watch("referredBy")}</div>
                </>
              )}

              <div className="font-medium">Date:</div>
              <div>{watch("date")?.toLocaleDateString()}</div>

              <div className="font-medium">Time:</div>
              <div>{watch("time")}</div>

              {/* <div className="font-medium">Service:</div>
              <div>{watch("serviceName")}</div> */}

              {watch("doctor") && (
                <>
                  <div className="font-medium">Doctor:</div>
                  <div>{doctors.find((d) => d.id === watch("doctor"))?.name || "No Doctor"}</div>
                </>
              )}

              {watch("appointmentType") === "visithospital" && (
                <>
                  <div className="font-medium">Payment Method:</div>
                  <div>{PaymentOptions.find((p) => p.value === watch("paymentMethod"))?.label}</div>

                  {watch("paymentMethod") === "mixed" ? (
                    <>
                      <div className="font-medium">Cash Amount:</div>
                      <div>₹ {watch("cashAmount") || 0}</div>

                      <div className="font-medium">Online Amount:</div>
                      <div>₹ {watch("onlineAmount") || 0}</div>
                    </>
                  ) : (
                    <>
                      <div className="font-medium">Amount:</div>
                      <div>₹ {watch("cashAmount") || 0}</div>
                    </>
                  )}

                  {watch("discount") > 0 && (
                    <>
                      <div className="font-medium">Discount:</div>
                      <div>₹ {watch("discount")}</div>

                      <div className="font-medium">Final Amount:</div>
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
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => validateAndSubmit(getValues())}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {loading ? "Processing..." : "Confirm & Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default OPDBookingPage
