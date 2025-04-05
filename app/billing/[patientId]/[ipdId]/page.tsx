"use client"

import React, { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ref, onValue, update, push, remove } from "firebase/database"
import { db } from "@/lib/firebase"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import { useForm, Controller, type SubmitHandler } from "react-hook-form"
import { yupResolver } from "@hookform/resolvers/yup"
import * as yup from "yup"
import { motion, AnimatePresence } from "framer-motion"
import Select from "react-select"
import {
  Plus,
  ArrowLeft,
  AlertTriangle,
  History,
  Trash,
  Calendar,
  User,
  Phone,
  MapPin,
  CreditCard,
  Bed,
  Users,
  FileText,
  Download,
  ChevronRight,
  Percent,
  UserPlus,
  X,
} from "lucide-react"
import { format, parseISO } from "date-fns"
import { Dialog, Transition } from "@headlessui/react"
import InvoiceDownload from "./../../InvoiceDownload"

// ===== Interfaces =====
interface ServiceItem {
  serviceName: string
  doctorName?: string
  type: "service" | "doctorvisit"
  amount: number
  createdAt?: string
}

interface Payment {
  id?: string
  amount: number
  paymentType: string
  date: string
}

interface AdditionalServiceForm {
  serviceName: string
  amount: number
}

interface PaymentForm {
  paymentAmount: number
  paymentType: string
}

interface DiscountForm {
  discount: number
}

interface DoctorVisitForm {
  doctorId: string
  visitCharge: number
}

export interface BillingRecord {
  patientId: string
  uhid: string
  ipdId: string
  name: string
  mobileNumber: string
  address?: string
  age?: string | number
  gender?: string
  relativeName?: string
  relativePhone?: string
  relativeAddress?: string
  dischargeDate?: string
  amount: number
  paymentType: string
  roomType?: string
  bed?: string
  services: ServiceItem[]
  payments: Payment[]
  discount?: number
  admitDate?: string
  createdAt?: string
}

// ===== Additional Validation Schemas =====
const additionalServiceSchema = yup
  .object({
    serviceName: yup.string().required("Service Name is required"),
    amount: yup
      .number()
      .typeError("Amount must be a number")
      .positive("Must be positive")
      .required("Amount is required"),
  })
  .required()

const paymentSchema = yup
  .object({
    paymentAmount: yup
      .number()
      .typeError("Amount must be a number")
      .positive("Must be positive")
      .required("Amount is required"),
    paymentType: yup.string().required("Payment Type is required"),
  })
  .required()

const discountSchema = yup
  .object({
    discount: yup
      .number()
      .typeError("Discount must be a number")
      .min(0, "Discount cannot be negative")
      .required("Discount is required"),
  })
  .required()

const doctorVisitSchema = yup
  .object({
    doctorId: yup.string().required("Select a doctor"),
    visitCharge: yup
      .number()
      .typeError("Visit charge must be a number")
      .positive("Must be positive")
      .required("Charge is required"),
  })
  .required()

// ===== Doctor Interface =====
interface IDoctor {
  id: string
  name: string
  specialist: string
  department: "OPD" | "IPD" | "Both"
  opdCharge?: number
  ipdCharges?: Record<string, number>
}

export default function BillingPage() {
  const { patientId, ipdId } = useParams() as { patientId: string; ipdId: string }
  const router = useRouter()

  const [selectedRecord, setSelectedRecord] = useState<BillingRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [isPaymentHistoryOpen, setIsPaymentHistoryOpen] = useState(false)
  const [beds, setBeds] = useState<any>({})
  const [doctors, setDoctors] = useState<IDoctor[]>([])
  const [activeTab, setActiveTab] = useState<"overview" | "services" | "payments" | "consultants">("overview")
  // State to hold service options for autocomplete
  const [serviceOptions, setServiceOptions] = useState<{ value: string; label: string; amount: number }[]>([])

  // ===== Fetch Beds Data =====
  useEffect(() => {
    const bedsRef = ref(db, "beds")
    const unsubscribe = onValue(bedsRef, (snapshot) => {
      if (snapshot.exists()) {
        setBeds(snapshot.val())
      } else {
        setBeds({})
      }
    })
    return () => unsubscribe()
  }, [])

  // ===== Fetch Doctors List =====
  useEffect(() => {
    const docsRef = ref(db, "doctors")
    const unsubscribe = onValue(docsRef, (snapshot) => {
      if (!snapshot.exists()) {
        setDoctors([])
        return
      }
      const data = snapshot.val()
      const list: IDoctor[] = Object.keys(data).map((key) => ({
        id: key,
        name: data[key].name,
        specialist: data[key].specialist,
        department: data[key].department,
        opdCharge: data[key].opdCharge,
        ipdCharges: data[key].ipdCharges,
      }))
      setDoctors(list)
    })
    return () => unsubscribe()
  }, [])

  // ===== Fetch Service Options for AutoComplete =====
  useEffect(() => {
    const serviceRef = ref(db, "service")
    const unsubscribe = onValue(serviceRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val()
        const options = Object.keys(data).map((key) => ({
          value: key,
          label: data[key].serviceName,
          amount: Number(data[key].amount) || 0,
        }))
        setServiceOptions(options)
      } else {
        setServiceOptions([])
      }
    })
    return () => unsubscribe()
  }, [])

  // ===== Load Selected Patient Record =====
  useEffect(() => {
    if (!patientId || !ipdId) return
    const patientRef = ref(db, `patients/${patientId}`)
    const unsubscribe = onValue(patientRef, (snapshot) => {
      if (!snapshot.exists()) return
      const patientData = snapshot.val()
      if (!patientData.ipd || !patientData.ipd[ipdId]) return
      const ipd = patientData.ipd[ipdId]

      const servicesArray: ServiceItem[] = ipd.services
        ? ipd.services.map((svc: any) => ({
            serviceName: svc.serviceName || "",
            doctorName: svc.doctorName || "",
            type: svc.type || "service",
            amount: Number(svc.amount) || 0,
            createdAt: svc.createdAt || "",
          }))
        : []

      let paymentsArray: Payment[] = []
      if (ipd.payments) {
        paymentsArray = Object.keys(ipd.payments).map((k) => ({
          id: k,
          amount: Number(ipd.payments[k].amount) || 0,
          paymentType: ipd.payments[k].paymentType || "cash",
          date: ipd.payments[k].date || new Date().toISOString(),
        }))
      }

      const record: BillingRecord = {
        patientId,
        uhid: patientData.uhid ?? patientId,
        ipdId,
        name: patientData.name || "Unknown",
        mobileNumber: patientData.phone || "",
        address: patientData.address || "",
        age: patientData.age || "",
        gender: patientData.gender || "",
        relativeName: ipd.relativeName || "",
        relativePhone: ipd.relativePhone || "",
        relativeAddress: ipd.relativeAddress || "",
        amount: Number(ipd.amount || 0),
        paymentType: ipd.paymentType || "deposit",
        roomType: ipd.roomType || "",
        bed: ipd.bed || "",
        services: servicesArray,
        payments: paymentsArray,
        dischargeDate: ipd.dischargeDate,
        discount: ipd.discount ? Number(ipd.discount) : 0,
        admitDate: ipd.date ? ipd.date : ipd.createdAt ? ipd.createdAt : undefined,
      }

      setSelectedRecord(record)
    })
    return () => unsubscribe()
  }, [patientId, ipdId])

  // ===== React Hook Form setups =====

  // Additional Service Form (with autocomplete)
  const {
    register: registerService,
    handleSubmit: handleSubmitService,
    formState: { errors: errorsService },
    reset: resetService,
    setValue: setValueService,
    control: serviceControl,
  } = useForm<AdditionalServiceForm>({
    resolver: yupResolver(additionalServiceSchema),
    defaultValues: { serviceName: "", amount: 0 },
  })

  // Payment Form
  const {
    register: registerPayment,
    handleSubmit: handleSubmitPayment,
    formState: { errors: errorsPayment },
    reset: resetPayment,
  } = useForm<PaymentForm>({
    resolver: yupResolver(paymentSchema),
    defaultValues: { paymentAmount: 0, paymentType: "" },
  })

  // Discount Form
  const {
    register: registerDiscount,
    handleSubmit: handleSubmitDiscount,
    formState: { errors: errorsDiscount },
    reset: resetDiscount,
  } = useForm<DiscountForm>({
    resolver: yupResolver(discountSchema),
    defaultValues: { discount: 0 },
  })

  // Consultant Charge Form
  const {
    register: registerVisit,
    handleSubmit: handleSubmitVisit,
    formState: { errors: errorsVisit },
    reset: resetVisit,
    watch: watchVisit,
    setValue: setVisitValue,
  } = useForm<DoctorVisitForm>({
    resolver: yupResolver(doctorVisitSchema),
    defaultValues: { doctorId: "", visitCharge: 0 },
  })

  // Auto-fill visit charge when a doctor is selected
  const watchSelectedDoctorId = watchVisit("doctorId")
  useEffect(() => {
    if (!watchSelectedDoctorId || !selectedRecord) return
    const doc = doctors.find((d) => d.id === watchSelectedDoctorId)
    if (!doc) return
    let amount = 0
    if (doc.department === "OPD") {
      amount = doc.opdCharge ?? 0
    } else if (doc.department === "IPD") {
      if (selectedRecord.roomType && doc.ipdCharges && doc.ipdCharges[selectedRecord.roomType]) {
        amount = doc.ipdCharges[selectedRecord.roomType]
      }
    } else if (doc.department === "Both") {
      if (selectedRecord.roomType && doc.ipdCharges && doc.ipdCharges[selectedRecord.roomType]) {
        amount = doc.ipdCharges[selectedRecord.roomType]
      }
      if (!amount && doc.opdCharge) {
        amount = doc.opdCharge
      }
    }
    setVisitValue("visitCharge", amount)
  }, [watchSelectedDoctorId, selectedRecord, doctors, setVisitValue])

  // ===== Calculations =====
  const hospitalServiceTotal = selectedRecord
    ? selectedRecord.services.filter((s) => s.type === "service").reduce((sum, s) => sum + s.amount, 0)
    : 0
  const consultantChargeItems = selectedRecord ? selectedRecord.services.filter((s) => s.type === "doctorvisit") : []
  const consultantChargeTotal = consultantChargeItems.reduce((sum, s) => sum + s.amount, 0)
  const discountVal = selectedRecord?.discount || 0
  const totalBill = hospitalServiceTotal + consultantChargeTotal - discountVal
  const dueAmount = selectedRecord ? Math.max(totalBill - selectedRecord.amount, 0) : 0

  // ===== Group Consultant Charges by Doctor =====
  const aggregatedConsultantCharges = consultantChargeItems.reduce(
    (acc, item) => {
      const key = item.doctorName || "Unknown"
      if (!acc[key]) {
        acc[key] = {
          doctorName: key,
          visited: 0,
          totalCharge: 0,
          lastVisit: null as Date | null,
          items: [] as ServiceItem[],
        }
      }
      acc[key].visited += 1
      acc[key].totalCharge += item.amount
      const itemDate = item.createdAt ? new Date(item.createdAt) : new Date(0)
      if (!acc[key].lastVisit || itemDate > acc[key].lastVisit) {
        acc[key].lastVisit = itemDate
      }
      acc[key].items.push(item)
      return acc
    },
    {} as Record<
      string,
      {
        doctorName: string
        visited: number
        totalCharge: number
        lastVisit: Date | null
        items: ServiceItem[]
      }
    >,
  )
  const aggregatedConsultantChargesArray = Object.values(aggregatedConsultantCharges)

  // ===== Payment Notification Helper =====
  const sendPaymentNotification = async (
    patientMobile: string,
    patientName: string,
    paymentAmount: number,
    updatedDeposit: number,
  ) => {
    const apiUrl = "https://wa.medblisss.com/send-text"
    const payload = {
      token: "99583991572",
      number: `91${patientMobile}`,
      message: `Dear ${patientName}, your payment of Rs ${paymentAmount.toLocaleString()} has been successfully added to your account. Your updated total deposit is Rs ${updatedDeposit.toLocaleString()}. Thank you for choosing our service.`,
    }

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        console.error("Notification API error:", response.statusText)
      }
    } catch (error) {
      console.error("Error sending notification:", error)
    }
  }

  // ===== Handlers =====

  // 1. Add Additional Service
  const onSubmitAdditionalService: SubmitHandler<AdditionalServiceForm> = async (data) => {
    if (!selectedRecord) return
    setLoading(true)
    try {
      const oldServices = [...selectedRecord.services]
      const newItem: ServiceItem = {
        serviceName: data.serviceName,
        doctorName: "",
        type: "service",
        amount: Number(data.amount),
        createdAt: new Date().toLocaleString(),
      }
      const updatedServices = [newItem, ...oldServices]
      const sanitizedServices = updatedServices.map((svc) => ({
        serviceName: svc.serviceName || "",
        doctorName: svc.doctorName || "",
        type: svc.type || "service",
        amount: svc.amount || 0,
        createdAt: svc.createdAt || new Date().toLocaleString(),
      }))
      const recordRef = ref(db, `patients/${selectedRecord.patientId}/ipd/${selectedRecord.ipdId}`)
      await update(recordRef, { services: sanitizedServices })
      toast.success("Additional service added successfully!")
      const updatedRecord = { ...selectedRecord, services: sanitizedServices }
      setSelectedRecord(updatedRecord)
      resetService({ serviceName: "", amount: 0 })
    } catch (error) {
      console.error("Error adding service:", error)
      toast.error("Failed to add service. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // 2. Add Payment with Notification
  const onSubmitPayment: SubmitHandler<PaymentForm> = async (formData) => {
    if (!selectedRecord) return
    setLoading(true)
    try {
      const newPaymentRef = push(ref(db, `patients/${selectedRecord.patientId}/ipd/${selectedRecord.ipdId}/payments`))
      const newPayment: Payment = {
        amount: Number(formData.paymentAmount),
        paymentType: formData.paymentType,
        date: new Date().toISOString(),
      }
      await update(newPaymentRef, newPayment)
      const updatedPayments = [newPayment, ...selectedRecord.payments]
      const updatedDeposit = Number(selectedRecord.amount) + Number(formData.paymentAmount)
      const recordRef = ref(db, `patients/${selectedRecord.patientId}/ipd/${selectedRecord.ipdId}`)
      await update(recordRef, { amount: updatedDeposit })

      await sendPaymentNotification(
        selectedRecord.mobileNumber,
        selectedRecord.name,
        Number(formData.paymentAmount),
        updatedDeposit,
      )

      toast.success("Payment recorded successfully!")
      const updatedRecord = { ...selectedRecord, payments: updatedPayments, amount: updatedDeposit }
      setSelectedRecord(updatedRecord)
      resetPayment({ paymentAmount: 0, paymentType: "" })
    } catch (error) {
      console.error("Error recording payment:", error)
      toast.error("Failed to record payment. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // 3. Discharge Patient
  const handleDischarge = async () => {
    if (!selectedRecord) return
    if (!selectedRecord.roomType || !selectedRecord.bed) {
      toast.error("Bed or Room Type information missing. Cannot discharge.")
      return
    }
    setLoading(true)
    try {
      const dischargeDate = new Date().toISOString()
      const recordRef = ref(db, `patients/${selectedRecord.patientId}/ipd/${selectedRecord.ipdId}`)
      await update(recordRef, { dischargeDate })
      const bedRef = ref(db, `beds/${selectedRecord.roomType}/${selectedRecord.bed}`)
      await update(bedRef, { status: "Available" })
      toast.success("Patient discharged and bed made available!")
      const updatedRecord = { ...selectedRecord, dischargeDate }
      setSelectedRecord(updatedRecord)
    } catch (error) {
      console.error("Error discharging patient:", error)
      toast.error("Failed to discharge patient. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // 4. Apply Discount
  const onSubmitDiscount: SubmitHandler<DiscountForm> = async (formData) => {
    if (!selectedRecord) return
    setLoading(true)
    try {
      const discountVal = Number(formData.discount)
      const recordRef = ref(db, `patients/${selectedRecord.patientId}/ipd/${selectedRecord.ipdId}`)
      await update(recordRef, { discount: discountVal })
      toast.success("Discount applied successfully!")
      const updatedRecord = { ...selectedRecord, discount: discountVal }
      setSelectedRecord(updatedRecord)
      resetDiscount({ discount: discountVal })
    } catch (error) {
      console.error("Error applying discount:", error)
      toast.error("Failed to apply discount. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // 5. Add Consultant Charge
  const onSubmitDoctorVisit: SubmitHandler<DoctorVisitForm> = async (data) => {
    if (!selectedRecord) return
    setLoading(true)
    try {
      const doc = doctors.find((d) => d.id === data.doctorId)
      if (!doc) {
        toast.error("Invalid doctor selection.")
        setLoading(false)
        return
      }
      const oldServices = [...selectedRecord.services]
      const newItem: ServiceItem = {
        serviceName: `Consultant Charge: Dr. ${doc.name || "Unknown"}`,
        doctorName: doc.name || "Unknown",
        type: "doctorvisit",
        amount: Number(data.visitCharge) || 0,
        createdAt: new Date().toLocaleString(),
      }
      const updatedServices = [newItem, ...oldServices]
      const sanitizedServices = updatedServices.map((svc) => ({
        serviceName: svc.serviceName || "",
        doctorName: svc.doctorName || "",
        type: svc.type || "doctorvisit",
        amount: svc.amount || 0,
        createdAt: svc.createdAt || new Date().toLocaleString(),
      }))
      const recordRef = ref(db, `patients/${selectedRecord.patientId}/ipd/${selectedRecord.ipdId}`)
      await update(recordRef, { services: sanitizedServices })
      toast.success("Consultant charge added successfully!")
      const updatedRecord = { ...selectedRecord, services: sanitizedServices }
      setSelectedRecord(updatedRecord)
      resetVisit({ doctorId: "", visitCharge: 0 })
    } catch (error) {
      console.error("Error adding consultant charge:", error)
      toast.error("Failed to add consultant charge. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // ===== Delete Handlers =====

  // Delete a service item (for hospital services)
  const handleDeleteServiceItem = async (item: ServiceItem) => {
    if (!selectedRecord) return
    setLoading(true)
    try {
      const updatedServices = selectedRecord.services.filter((svc) => svc !== item)
      const recordRef = ref(db, `patients/${selectedRecord.patientId}/ipd/${selectedRecord.ipdId}`)
      await update(recordRef, { services: updatedServices })
      toast.success("Service deleted successfully!")
      const updatedRecord = { ...selectedRecord, services: updatedServices }
      setSelectedRecord(updatedRecord)
    } catch (error) {
      console.error("Error deleting service:", error)
      toast.error("Failed to delete service. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // Delete a payment
  const handleDeletePayment = async (paymentId: string, paymentAmount: number) => {
    if (!selectedRecord) return
    setLoading(true)
    try {
      const paymentRef = ref(
        db,
        `patients/${selectedRecord.patientId}/ipd/${selectedRecord.ipdId}/payments/${paymentId}`,
      )
      await remove(paymentRef)
      const updatedDeposit = selectedRecord.amount - paymentAmount
      const recordRef = ref(db, `patients/${selectedRecord.patientId}/ipd/${selectedRecord.ipdId}`)
      await update(recordRef, { amount: updatedDeposit })
      const updatedPayments = selectedRecord.payments.filter((p) => p.id !== paymentId)
      toast.success("Payment deleted successfully!")
      const updatedRecord = { ...selectedRecord, payments: updatedPayments, amount: updatedDeposit }
      setSelectedRecord(updatedRecord)
    } catch (error) {
      console.error("Error deleting payment:", error)
      toast.error("Failed to delete payment. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // Delete consultant charges for a specific doctor (aggregated deletion)
  const handleDeleteConsultantCharges = async (doctorName: string) => {
    if (!selectedRecord) return
    setLoading(true)
    try {
      const updatedServices = selectedRecord.services.filter(
        (svc) => svc.type !== "doctorvisit" || svc.doctorName !== doctorName,
      )
      const recordRef = ref(db, `patients/${selectedRecord.patientId}/ipd/${selectedRecord.ipdId}`)
      await update(recordRef, { services: updatedServices })
      toast.success(`Consultant charges for Dr. ${doctorName} deleted successfully!`)
      const updatedRecord = { ...selectedRecord, services: updatedServices }
      setSelectedRecord(updatedRecord)
    } catch (error) {
      console.error("Error deleting consultant charges:", error)
      toast.error("Failed to delete consultant charges. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // ===== Separate Service Items =====
  const serviceItems = selectedRecord?.services.filter((s) => s.type === "service") || []

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-teal-50">
      <ToastContainer position="top-right" autoClose={3000} />

      {/* Header */}
      <header className="bg-white border-b border-teal-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <button
              onClick={() => router.back()}
              className="flex items-center text-teal-600 hover:text-teal-800 transition-colors font-medium"
            >
              <ArrowLeft size={18} className="mr-2" /> Back to Patients
            </button>

            <div className="flex items-center space-x-4">
              {selectedRecord && !selectedRecord.dischargeDate && (
                <button
                  onClick={handleDischarge}
                  disabled={loading}
                  className="flex items-center px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors shadow-sm"
                >
                  <AlertTriangle size={16} className="mr-2" /> Discharge Patient
                </button>
              )}

              <button
                onClick={() => setIsPaymentHistoryOpen(true)}
                className="flex items-center px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                <History size={16} className="mr-2" /> Payment History
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {selectedRecord ? (
          <AnimatePresence mode="wait">
            <motion.div
              key="billing-details"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              {/* Patient Summary Card */}
              <div className="bg-white rounded-2xl shadow-md overflow-hidden mb-8">
                <div className="bg-gradient-to-r from-teal-500 to-cyan-500 px-6 py-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                    <div>
                      <h1 className="text-2xl font-bold text-white">{selectedRecord.name}</h1>
                      <p className="text-teal-50">
                        UHID: {selectedRecord.uhid ? selectedRecord.uhid : "Not assigned"}
                      </p>
                    </div>

                    <div className="mt-2 md:mt-0 flex flex-col md:items-end">
                      <div className="inline-flex items-center px-3 py-1 rounded-full bg-white/20 text-white text-sm">
                        <Bed size={14} className="mr-2" />
                        {selectedRecord.roomType || "No Room"} •{" "}
                        {selectedRecord.roomType && selectedRecord.bed && beds[selectedRecord.roomType]?.[selectedRecord.bed]?.bedNumber
                          ? beds[selectedRecord.roomType][selectedRecord.bed].bedNumber
                          : "Unknown Bed"}
                      </div>

                      <div className="mt-2 text-teal-50 text-sm">
                        {selectedRecord.dischargeDate ? (
                          <span className="inline-flex items-center">
                            <AlertTriangle size={14} className="mr-1" /> Discharged:{" "}
                            {format(parseISO(selectedRecord.dischargeDate), "dd MMM yyyy")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center">
                            <Calendar size={14} className="mr-1" /> Admitted:{" "}
                            {selectedRecord.admitDate
                              ? format(parseISO(selectedRecord.admitDate), "dd MMM yyyy")
                              : "Unknown"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Financial Summary */}
                    <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-xl p-5 shadow-sm">
                      <h3 className="text-lg font-semibold text-teal-800 mb-3">Financial Summary</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Hospital Services:</span>
                          <span className="font-medium">₹{hospitalServiceTotal.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Consultant Charges:</span>
                          <span className="font-medium">₹{consultantChargeTotal.toLocaleString()}</span>
                        </div>
                        {discountVal > 0 && (
                          <div className="flex justify-between text-green-600">
                            <span>Discount:</span>
                            <span className="font-medium">-₹{discountVal.toLocaleString()}</span>
                          </div>
                        )}
                        <div className="border-t border-teal-200 pt-2 mt-2">
                          <div className="flex justify-between font-bold text-teal-800">
                            <span>Total Bill:</span>
                            <span>₹{totalBill.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-gray-600">Deposit Amount:</span>
                          <span className="font-medium">₹{selectedRecord.amount.toLocaleString()}</span>
                        </div>
                        {dueAmount > 0 && (
                          <div className="flex justify-between text-red-600 font-bold">
                            <span>Due Amount:</span>
                            <span>₹{dueAmount.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Patient Details */}
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                      <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                        <User size={18} className="mr-2 text-teal-600" /> Patient Details
                      </h3>
                      <div className="space-y-2">
                        <div className="flex items-start">
                          <Phone size={16} className="mr-2 text-gray-400 mt-0.5" />
                          <div>
                            <p className="text-sm text-gray-500">Mobile</p>
                            <p className="font-medium">{selectedRecord.mobileNumber}</p>
                          </div>
                        </div>
                        <div className="flex items-start">
                          <MapPin size={16} className="mr-2 text-gray-400 mt-0.5" />
                          <div>
                            <p className="text-sm text-gray-500">Address</p>
                            <p className="font-medium">{selectedRecord.address || "Not provided"}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-sm text-gray-500">Age</p>
                            <p className="font-medium">{selectedRecord.age || "Not provided"}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Gender</p>
                            <p className="font-medium">{selectedRecord.gender || "Not provided"}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Relative Details */}
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                      <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                        <Users size={18} className="mr-2 text-teal-600" /> Relative Details
                      </h3>
                      <div className="space-y-2">
                        <div>
                          <p className="text-sm text-gray-500">Name</p>
                          <p className="font-medium">{selectedRecord.relativeName || "Not provided"}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Phone</p>
                          <p className="font-medium">{selectedRecord.relativePhone || "Not provided"}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Address</p>
                          <p className="font-medium">{selectedRecord.relativeAddress || "Not provided"}</p>
                        </div>
                      </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                      <h3 className="text-lg font-semibold text-gray-800 mb-3">Quick Actions</h3>
                      <div className="space-y-3">
                        <InvoiceDownload record={selectedRecord}>
                          <button className="w-full flex items-center justify-center px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors">
                            <Download size={16} className="mr-2" /> Download Invoice
                          </button>
                        </InvoiceDownload>

                        {!selectedRecord.dischargeDate && (
                          <button
                            onClick={() => setActiveTab("payments")}
                            className="w-full flex items-center justify-center px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
                          >
                            <CreditCard size={16} className="mr-2" /> Add Payment
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabs Navigation */}
              <div className="mb-6">
                <div className="border-b border-gray-200">
                  <nav className="flex -mb-px space-x-8">
                    <button
                      onClick={() => setActiveTab("overview")}
                      className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                        activeTab === "overview"
                          ? "border-teal-500 text-teal-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <FileText size={16} className="mr-2" /> Overview
                    </button>
                    <button
                      onClick={() => setActiveTab("services")}
                      className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                        activeTab === "services"
                          ? "border-teal-500 text-teal-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <Plus size={16} className="mr-2" /> Services
                    </button>
                    <button
                      onClick={() => setActiveTab("payments")}
                      className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                        activeTab === "payments"
                          ? "border-teal-500 text-teal-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <CreditCard size={16} className="mr-2" /> Payments
                    </button>
                    <button
                      onClick={() => setActiveTab("consultants")}
                      className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                        activeTab === "consultants"
                          ? "border-teal-500 text-teal-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <UserPlus size={16} className="mr-2" /> Consultants
                    </button>
                  </nav>
                </div>
              </div>

              {/* Tab Content */}
              <div className="bg-white rounded-2xl shadow-md overflow-hidden">
                {/* Overview Tab */}
                {activeTab === "overview" && (
                  <div className="p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* Hospital Services Summary */}
                      <div>
                        <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                          <FileText size={20} className="mr-2 text-teal-600" /> Hospital Services
                        </h3>
                        {serviceItems.length === 0 ? (
                          <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
                            No hospital services recorded yet.
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead>
                                <tr className="bg-gray-50">
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Service
                                  </th>
                                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Amount
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Date
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {serviceItems.slice(0, 5).map((srv, index) => (
                                  <tr key={index} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm text-gray-900">{srv.serviceName}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                      ₹{srv.amount.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                      {srv.createdAt ? new Date(srv.createdAt).toLocaleDateString() : "N/A"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-gray-50">
                                  <td className="px-4 py-3 text-sm font-medium">Total</td>
                                  <td className="px-4 py-3 text-sm font-bold text-right">
                                    ₹{hospitalServiceTotal.toLocaleString()}
                                  </td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            </table>
                            {serviceItems.length > 5 && (
                              <div className="mt-3 text-right">
                                <button
                                  onClick={() => setActiveTab("services")}
                                  className="text-teal-600 hover:text-teal-800 text-sm font-medium flex items-center justify-end w-full"
                                >
                                  View all {serviceItems.length} services <ChevronRight size={16} className="ml-1" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Consultant Charges Summary */}
                      <div>
                        <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                          <UserPlus size={20} className="mr-2 text-teal-600" /> Consultant Charges
                        </h3>
                        {consultantChargeItems.length === 0 ? (
                          <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
                            No consultant charges recorded yet.
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead>
                                <tr className="bg-gray-50">
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Doctor
                                  </th>
                                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Visits
                                  </th>
                                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Total
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {aggregatedConsultantChargesArray.map((agg, idx) => (
                                  <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm text-gray-900">{agg.doctorName}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900 text-center">{agg.visited}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                      ₹{agg.totalCharge.toLocaleString()}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-gray-50">
                                  <td className="px-4 py-3 text-sm font-medium">Total</td>
                                  <td></td>
                                  <td className="px-4 py-3 text-sm font-bold text-right">
                                    ₹{consultantChargeTotal.toLocaleString()}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                            <div className="mt-3 text-right">
                              <button
                                onClick={() => setActiveTab("consultants")}
                                className="text-teal-600 hover:text-teal-800 text-sm font-medium flex items-center justify-end w-full"
                              >
                                View consultant details <ChevronRight size={16} className="ml-1" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Services Tab */}
                {activeTab === "services" && (
                  <div className="p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      {/* Services List */}
                      <div className="lg:col-span-2">
                        <h3 className="text-xl font-semibold text-gray-800 mb-4">Hospital Services</h3>
                        {serviceItems.length === 0 ? (
                          <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
                            No hospital services recorded yet.
                          </div>
                        ) : (
                          <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
                            <table className="w-full">
                              <thead>
                                <tr className="bg-gray-50">
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Service Name
                                  </th>
                                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Amount (₹)
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Date/Time
                                  </th>
                                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Action
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {serviceItems.map((srv, index) => (
                                  <tr key={index} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm text-gray-900">{srv.serviceName}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                      {srv.amount.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                      {srv.createdAt ? new Date(srv.createdAt).toLocaleString() : "N/A"}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-center">
                                      {!selectedRecord.dischargeDate && (
                                        <button
                                          onClick={() => handleDeleteServiceItem(srv)}
                                          className="text-red-500 hover:text-red-700 transition-colors"
                                          title="Delete service"
                                        >
                                          <Trash size={16} />
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-gray-50">
                                  <td className="px-4 py-3 text-sm font-medium">Total</td>
                                  <td className="px-4 py-3 text-sm font-bold text-right">
                                    ₹{hospitalServiceTotal.toLocaleString()}
                                  </td>
                                  <td colSpan={2}></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Add Service Form with Autocomplete */}
                      {!selectedRecord.dischargeDate && (
                        <div className="lg:col-span-1">
                          <div className="bg-white rounded-lg border border-gray-200 p-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">Add Hospital Service</h3>
                            <form onSubmit={handleSubmitService(onSubmitAdditionalService)} className="space-y-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Service Name</label>
                                <Controller
                                  control={serviceControl}
                                  name="serviceName"
                                  render={({ field }) => {
                                    // The currently stored serviceName in the form is `field.value`.
                                    // We must find the matching option by comparing `option.label` to `field.value`.
                                    const selectedOption = serviceOptions.find(
                                      (option) => option.label === field.value
                                    ) || null

                                    return (
                                      <Select
                                        {...field}
                                        value={selectedOption}
                                        options={serviceOptions}
                                        placeholder="Select a service..."
                                        isClearable
                                        onChange={(selected) => {
                                          if (selected) {
                                            // Store the service name in the form field
                                            field.onChange(selected.label)
                                            // Automatically set the amount if the user picks a known service
                                            setValueService("amount", selected.amount)
                                          } else {
                                            // If cleared, reset
                                            field.onChange("")
                                            setValueService("amount", 0)
                                          }
                                        }}
                                      />
                                    )
                                  }}
                                />
                                {errorsService.serviceName && (
                                  <p className="text-red-500 text-xs mt-1">{errorsService.serviceName.message}</p>
                                )}
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
                                <input
                                  type="number"
                                  {...registerService("amount")}
                                  placeholder="Auto-filled on selection"
                                  className={`w-full px-3 py-2 rounded-lg border ${
                                    errorsService.amount ? "border-red-500" : "border-gray-300"
                                  } focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                                />
                                {errorsService.amount && (
                                  <p className="text-red-500 text-xs mt-1">{errorsService.amount.message}</p>
                                )}
                              </div>
                              <button
                                type="submit"
                                disabled={loading}
                                className={`w-full py-2 px-4 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center justify-center ${
                                  loading ? "opacity-50 cursor-not-allowed" : ""
                                }`}
                              >
                                {loading ? "Processing..." : <>
                                  <Plus size={16} className="mr-2" /> Add Service
                                </>}
                              </button>
                            </form>
                          </div>

                          {/* Discount Form */}
                          <div className="bg-white rounded-lg border border-gray-200 p-6 mt-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                              <Percent size={16} className="mr-2 text-teal-600" /> Apply Discount
                            </h3>
                            <form onSubmit={handleSubmitDiscount(onSubmitDiscount)} className="space-y-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Discount Amount (₹)
                                </label>
                                <input
                                  type="number"
                                  {...registerDiscount("discount")}
                                  placeholder="e.g., 1000"
                                  className={`w-full px-3 py-2 rounded-lg border ${
                                    errorsDiscount.discount ? "border-red-500" : "border-gray-300"
                                  } focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                                />
                                {errorsDiscount.discount && (
                                  <p className="text-red-500 text-xs mt-1">{errorsDiscount.discount.message}</p>
                                )}
                              </div>
                              <button
                                type="submit"
                                disabled={loading}
                                className={`w-full py-2 px-4 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center justify-center ${
                                  loading ? "opacity-50 cursor-not-allowed" : ""
                                }`}
                              >
                                {loading ? "Processing..." : <>
                                  <Percent size={16} className="mr-2" /> Apply Discount
                                </>}
                              </button>
                            </form>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Payments Tab */}
                {activeTab === "payments" && (
                  <div className="p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      {/* Payment Summary */}
                      <div className="lg:col-span-2">
                        <h3 className="text-xl font-semibold text-gray-800 mb-4">Payment Summary</h3>
                        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-teal-50 rounded-lg p-4">
                              <p className="text-sm text-teal-600">Total Bill</p>
                              <p className="text-2xl font-bold text-teal-800">₹{totalBill.toLocaleString()}</p>
                            </div>
                            <div className="bg-cyan-50 rounded-lg p-4">
                              <p className="text-sm text-cyan-600">Deposit Amount</p>
                              <p className="text-2xl font-bold text-cyan-800">
                                ₹{selectedRecord.amount.toLocaleString()}
                              </p>
                            </div>
                            <div className={`${dueAmount > 0 ? "bg-red-50" : "bg-green-50"} rounded-lg p-4`}>
                              <p className={`text-sm ${dueAmount > 0 ? "text-red-600" : "text-green-600"}`}>
                                {dueAmount > 0 ? "Due Amount" : "Fully Paid"}
                              </p>
                              <p
                                className={`text-2xl font-bold ${
                                  dueAmount > 0 ? "text-red-800" : "text-green-800"
                                }`}
                              >
                                {dueAmount > 0 ? `₹${dueAmount.toLocaleString()}` : "✓"}
                              </p>
                            </div>
                          </div>
                        </div>

                        <h3 className="text-xl font-semibold text-gray-800 mb-4">Payment History</h3>
                        {selectedRecord.payments.length === 0 ? (
                          <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
                            No payments recorded yet.
                          </div>
                        ) : (
                          <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
                            <table className="w-full">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    #
                                  </th>
                                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Amount (₹)
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Payment Type
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Date
                                  </th>
                                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Action
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {selectedRecord.payments.map((payment, index) => (
                                  <tr key={index} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm text-gray-900">{index + 1}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                      {payment.amount.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-900 capitalize">
                                      {payment.paymentType}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                      {new Date(payment.date).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-center">
                                      {!selectedRecord.dischargeDate && (
                                        <button
                                          onClick={() => payment.id && handleDeletePayment(payment.id, payment.amount)}
                                          className="text-red-500 hover:text-red-700 transition-colors"
                                          title="Delete payment"
                                        >
                                          <Trash size={16} />
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Add Payment Form */}
                      {!selectedRecord.dischargeDate && (
                        <div className="lg:col-span-1">
                          <div className="bg-white rounded-lg border border-gray-200 p-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                              <CreditCard size={16} className="mr-2 text-teal-600" /> Record Payment
                            </h3>
                            <form onSubmit={handleSubmitPayment(onSubmitPayment)} className="space-y-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Payment Amount (₹)
                                </label>
                                <input
                                  type="number"
                                  {...registerPayment("paymentAmount")}
                                  placeholder="e.g., 5000"
                                  className={`w-full px-3 py-2 rounded-lg border ${
                                    errorsPayment.paymentAmount ? "border-red-500" : "border-gray-300"
                                  } focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                                />
                                {errorsPayment.paymentAmount && (
                                  <p className="text-red-500 text-xs mt-1">{errorsPayment.paymentAmount.message}</p>
                                )}
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Type</label>
                                <select
                                  {...registerPayment("paymentType")}
                                  className={`w-full px-3 py-2 rounded-lg border ${
                                    errorsPayment.paymentType ? "border-red-500" : "border-gray-300"
                                  } focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                                >
                                  <option value="">Select Payment Type</option>
                                  <option value="cash">Cash</option>
                                  <option value="online">Online</option>
                                  <option value="card">Card</option>
                                </select>
                                {errorsPayment.paymentType && (
                                  <p className="text-red-500 text-xs mt-1">{errorsPayment.paymentType.message}</p>
                                )}
                              </div>
                              <button
                                type="submit"
                                disabled={loading}
                                className={`w-full py-2 px-4 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center justify-center ${
                                  loading ? "opacity-50 cursor-not-allowed" : ""
                                }`}
                              >
                                {loading ? (
                                  "Processing..."
                                ) : (
                                  <>
                                    <Plus size={16} className="mr-2" /> Add Payment
                                  </>
                                )}
                              </button>
                            </form>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Consultants Tab */}
                {activeTab === "consultants" && (
                  <div className="p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      {/* Consultant Charges List */}
                      <div className="lg:col-span-2">
                        <h3 className="text-xl font-semibold text-gray-800 mb-4">Consultant Charges</h3>
                        {consultantChargeItems.length === 0 ? (
                          <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
                            No consultant charges recorded yet.
                          </div>
                        ) : (
                          <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
                            <table className="w-full">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Doctor
                                  </th>
                                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Visits
                                  </th>
                                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Total Charge (₹)
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Last Visit
                                  </th>
                                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Action
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {aggregatedConsultantChargesArray.map((agg, idx) => (
                                  <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm text-gray-900">{agg.doctorName}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900 text-center">{agg.visited}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                      {agg.totalCharge.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                      {agg.lastVisit ? agg.lastVisit.toLocaleString() : "N/A"}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-center">
                                      {!selectedRecord.dischargeDate && (
                                        <button
                                          onClick={() => handleDeleteConsultantCharges(agg.doctorName)}
                                          className="text-red-500 hover:text-red-700 transition-colors"
                                          title="Delete consultant charges"
                                        >
                                          <Trash size={16} />
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-gray-50">
                                  <td className="px-4 py-3 text-sm font-medium">Total</td>
                                  <td></td>
                                  <td className="px-4 py-3 text-sm font-bold text-right">
                                    ₹{consultantChargeTotal.toLocaleString()}
                                  </td>
                                  <td colSpan={2}></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Add Consultant Charge Form */}
                      {!selectedRecord.dischargeDate && (
                        <div className="lg:col-span-1">
                          <div className="bg-white rounded-lg border border-gray-200 p-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                              <UserPlus size={16} className="mr-2 text-teal-600" /> Add Consultant Charge
                            </h3>
                            <form onSubmit={handleSubmitVisit(onSubmitDoctorVisit)} className="space-y-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Select Doctor</label>
                                <select
                                  {...registerVisit("doctorId")}
                                  className={`w-full px-3 py-2 rounded-lg border ${
                                    errorsVisit.doctorId ? "border-red-500" : "border-gray-300"
                                  } focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                                >
                                  <option value="">-- Select Doctor --</option>
                                  {doctors.map((doc) => (
                                    <option key={doc.id} value={doc.id}>
                                      {doc.name} ({doc.specialist})
                                    </option>
                                  ))}
                                </select>
                                {errorsVisit.doctorId && (
                                  <p className="text-red-500 text-xs mt-1">{errorsVisit.doctorId.message}</p>
                                )}
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Visit Charge (₹)</label>
                                <input
                                  type="number"
                                  {...registerVisit("visitCharge")}
                                  placeholder="Auto-filled or override"
                                  className={`w-full px-3 py-2 rounded-lg border ${
                                    errorsVisit.visitCharge ? "border-red-500" : "border-gray-300"
                                  } focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
                                />
                                {errorsVisit.visitCharge && (
                                  <p className="text-red-500 text-xs mt-1">{errorsVisit.visitCharge.message}</p>
                                )}
                              </div>
                              <button
                                type="submit"
                                disabled={loading}
                                className={`w-full py-2 px-4 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center justify-center ${
                                  loading ? "opacity-50 cursor-not-allowed" : ""
                                }`}
                              >
                                {loading ? (
                                  "Processing..."
                                ) : (
                                  <>
                                    <Plus size={16} className="mr-2" /> Add Consultant Charge
                                  </>
                                )}
                              </button>
                            </form>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-t-teal-500 border-gray-200 rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-500">Loading patient record...</p>
            </div>
          </div>
        )}
      </main>

      {/* Payment History Modal */}
      <Transition appear show={isPaymentHistoryOpen} as={React.Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setIsPaymentHistoryOpen(false)}>
          <Transition.Child
            as={React.Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-40" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto flex items-center justify-center p-4">
            <Transition.Child
              as={React.Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="bg-white rounded-xl shadow-xl p-6 max-w-lg w-full">
                <div className="flex items-center justify-between mb-4">
                  <Dialog.Title className="text-xl font-bold text-gray-800">Payment History</Dialog.Title>
                  <button
                    onClick={() => setIsPaymentHistoryOpen(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                {selectedRecord && selectedRecord.payments.length > 0 ? (
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            #
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Amount (₹)
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Payment Type
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {selectedRecord.payments.map((payment, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900">{index + 1}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 text-right">
                              {payment.amount.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 capitalize">{payment.paymentType}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {new Date(payment.date).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-center">
                              {!selectedRecord.dischargeDate && (
                                <button
                                  onClick={() => payment.id && handleDeletePayment(payment.id, payment.amount)}
                                  className="text-red-500 hover:text-red-700 transition-colors"
                                  title="Delete payment"
                                >
                                  <Trash size={16} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">No payments recorded yet.</p>
                )}

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setIsPaymentHistoryOpen(false)}
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>
    </div>
  )
}
