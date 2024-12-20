'use client'

import React, { useEffect, useState, useRef } from 'react'
import { db } from '@/lib/firebase'
import { ref, onValue, update, push } from 'firebase/database'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { useForm, SubmitHandler } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Plus, CheckCircle, ArrowLeft, AlertTriangle, Download, History } from 'lucide-react'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { format, parseISO } from 'date-fns'
import { Dialog, Transition } from '@headlessui/react'

// =================== Interfaces ===================
interface Service {
  serviceName: string
  amount: number
  status: 'pending' | 'completed'
  createdAt?: string
}

interface Payment {
  amount: number
  paymentType: string
  date: string
}

interface Equipment {
  category: string
  equipmentName: string
  price: number
  createdAt?: string
}

interface BillingRecord {
  id: string
  name: string
  mobileNumber: string
  amount: number
  totalPaid: number
  paymentType: string
  roomType?: string
  bed?: string
  services: Service[]
  payments: Payment[]
  equipment: Equipment[] // Added equipment
  dischargeDate?: string
  discountPercentage?: number
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
  discountPercentage: number
}

interface AdditionalEquipmentForm {
  category: string
  equipmentName: string
  price: number
}

// =================== Validation Schemas ===================
const serviceSchema = yup.object({
  serviceName: yup.string().required('Service Name is required'),
  amount: yup
    .number()
    .typeError('Amount must be a number')
    .positive('Must be positive')
    .required('Amount is required'),
}).required()

const paymentSchema = yup.object({
  paymentAmount: yup
    .number()
    .typeError('Amount must be a number')
    .positive('Must be positive')
    .required('Amount is required'),
  paymentType: yup.string().required('Payment Type is required'),
}).required()

const discountSchema = yup.object({
  discountPercentage: yup
    .number()
    .typeError('Discount must be a number')
    .min(0, 'Discount cannot be negative')
    .max(100, 'Discount cannot exceed 100%')
    .required('Discount Percentage is required'),
}).required()

const equipmentSchema = yup.object({
  category: yup.string().required('Category is required'),
  equipmentName: yup.string().required('Equipment Name is required'),
  price: yup
    .number()
    .typeError('Price must be a number')
    .positive('Price must be positive')
    .required('Price is required'),
}).required()

// =================== Utility ===================
const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2
})

// =================== Equipment Data ===================
const equipmentData: Record<string, string[]> = {
  'General Consumables': [
    'Cotton rolls and balls',
    'Gauze pieces and bandages',
    'Adhesive tapes (micropore, surgical tape)',
    'Disposable gloves (sterile and non-sterile)',
    'Syringes (various sizes)',
    'Needles (various gauges)',
    'IV cannulas',
    'IV sets and infusion sets',
    'Saline bottles (normal saline, dextrose)',
    'Tourniquets',
    'Hand sanitizers',
    'Face masks and shields',
  ],
  'Diagnostic Consumables': [
    'Blood sample collection tubes (EDTA, citrate, serum separator)',
    'Urine sample containers',
    'Culture swabs',
    'Specimen bags',
    'Glucometer strips',
    'Lancets',
  ],
  'Surgical Consumables': [
    'Sutures (absorbable, non-absorbable)',
    'Surgical blades (various sizes)',
    'Drapes and surgical gowns',
    'Sterile packs (scissors, forceps, etc.)',
    'Hemostats and clips',
    'Sterilization pouches',
    'Antiseptic solutions (Betadine, Chlorhexidine)',
  ],
  'Wound Care and Dressing': [
    'Antiseptic creams and ointments',
    'Wound dressing materials (hydrocolloid, foam, etc.)',
    'Absorbent pads',
    'Transparent films',
    'Elastic and crepe bandages',
    'Plasters and tapes',
  ],
  'ICU/CCU Specific Consumables': [
    'Endotracheal tubes',
    'Suction catheters',
    'Oxygen masks and nasal cannulas',
    'Ventilator circuits',
    'Disposable CPAP/BiPAP masks',
    'Disposable ECG electrodes',
    'Central line kits',
    'Arterial line kits',
  ],
  'Catheters and Tubes': [
    'Urinary catheters (Foley, Nelaton)',
    'Ryles tubes',
    'Feeding tubes',
    'Chest drainage tubes',
    'Surgical drains (e.g., JP drains)',
  ],
  'Patient Care Consumables': [
    'Diapers (adult and pediatric)',
    'Bed sheets and underpads',
    'Disposable towels',
    'Patient ID bands',
    'Thermometer probe covers',
    'Bedside sponges',
  ],
  'Medicated Consumables': [
    'Insulin pens and cartridges',
    'Nebulizer masks and kits',
    'Heparin lock sets',
    'Heparin vials and syringes',
    'Ampoules (e.g., adrenaline, epinephrine)',
  ],
  'Radiology/Imaging Consumables': [
    'Xray',
    'Sonography',
    'CT Scan',
  ],
}

// =================== Main Component ===================
export default function IPDBillingPage() {
  const [allRecords, setAllRecords] = useState<BillingRecord[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filteredRecords, setFilteredRecords] = useState<BillingRecord[]>([])
  const [selectedRecord, setSelectedRecord] = useState<BillingRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [logoBase64, setLogoBase64] = useState<string | null>(null)
  const [isPaymentHistoryOpen, setIsPaymentHistoryOpen] = useState(false)

  const invoiceRef = useRef<HTMLDivElement>(null)

  // =================== Forms ===================
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<AdditionalServiceForm>({
    resolver: yupResolver(serviceSchema),
    defaultValues: {
      serviceName: '',
      amount: 0,
    },
  })

  const {
    register: registerPayment,
    handleSubmit: handleSubmitPayment,
    formState: { errors: errorsPayment },
    reset: resetPayment,
  } = useForm<PaymentForm>({
    resolver: yupResolver(paymentSchema),
    defaultValues: {
      paymentAmount: 0,
      paymentType: '',
    },
  })

  const {
    register: registerDiscount,
    handleSubmit: handleSubmitDiscount,
    formState: { errors: errorsDiscount },
    reset: resetDiscount,
  } = useForm<DiscountForm>({
    resolver: yupResolver(discountSchema),
    defaultValues: {
      discountPercentage: 0,
    },
  })

  // ======= Added Equipment Form =======
  const {
    register: registerEquipment,
    handleSubmit: handleSubmitEquipment,
    formState: { errors: errorsEquipment },
    reset: resetEquipment,
    watch: watchEquipment, // Add watch here
  } = useForm<AdditionalEquipmentForm>({
    resolver: yupResolver(equipmentSchema),
    defaultValues: {
      category: '',
      equipmentName: '',
      price: 0,
    },
  })

  // Watch the 'category' field
  const selectedCategory = watchEquipment('category')

  // =================== Fetch Logo ===================
  useEffect(() => {
    const logoUrl = 'https://yourdomain.com/path-to-your-logo.png' // Replace with your actual logo URL
    getBase64Image(logoUrl, (base64: string) => {
      setLogoBase64(base64)
    })
  }, [])

  // =================== Fetch Billing Records ===================
  useEffect(() => {
    const billingRef = ref(db, 'ipd_bookings')
    const unsubscribe = onValue(billingRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const records: BillingRecord[] = Object.keys(data).map((key) => {
          const rec = data[key]
          const completedServicesAmount = rec.services
            ? rec.services.filter((s: Service) => s.status === 'completed').reduce((sum: number, s: Service) => sum + Number(s.amount), 0)
            : 0

          const payments: Payment[] = rec.payments
            ? Object.keys(rec.payments).map((_) => ({
                amount: Number(rec.payments[_].amount),
                paymentType: rec.payments[_].paymentType,
                date: rec.payments[_].date,
              }))
            : []

          const equipment: Equipment[] = rec.equipment
            ? Object.keys(rec.equipment).map((_) => ({
                category: rec.equipment[_].category,
                equipmentName: rec.equipment[_].equipmentName,
                price: Number(rec.equipment[_].price),
                createdAt: rec.equipment[_].createdAt,
              }))
            : []

          return {
            id: key,
            name: rec.name,
            mobileNumber: rec.mobileNumber || '',
            amount: Number(rec.amount || 0),
            totalPaid: completedServicesAmount,
            paymentType: rec.paymentType || 'deposit',
            roomType: rec.roomType,
            bed: rec.bed,
            services: rec.services ? rec.services.map((service: any) => ({
              ...service,
              amount: Number(service.amount)
            })) as Service[] : [],
            payments: payments,
            equipment: equipment, // Retrieved equipment
            dischargeDate: rec.dischargeDate || undefined,
            discountPercentage: rec.discountPercentage || 0,
          }
        })
        setAllRecords(records)
        setFilteredRecords(records)
      } else {
        setAllRecords([])
        setFilteredRecords([])
      }
    })

    return () => unsubscribe()
  }, [])

  // =================== Search Handler ===================
  const handleSearch = () => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) {
      setFilteredRecords(allRecords)
      setSelectedRecord(null)
      return
    }
    const results = allRecords.filter(rec =>
      rec.id.toLowerCase().includes(term) ||
      rec.name.toLowerCase().includes(term) ||
      rec.mobileNumber.toLowerCase().includes(term)
    )
    setFilteredRecords(results)
    setSelectedRecord(null)
  }

  // =================== Select Record ===================
  const handleSelectRecord = (record: BillingRecord) => {
    setSelectedRecord(record)
    reset({ serviceName: '', amount: 0 })
    resetPayment({ paymentAmount: 0, paymentType: '' })
    resetDiscount({ discountPercentage: record.discountPercentage || 0 })
    resetEquipment({ category: '', equipmentName: '', price: 0 }) // Reset equipment form
  }

  // =================== Calculations ===================
  const calculateTotalServicesAmount = (services: Service[]) => {
    return services.reduce((sum, s) => sum + s.amount, 0)
  }

  const calculateCompletedServicesAmount = (services: Service[]) => {
    return services.filter(s => s.status === 'completed').reduce((sum, s) => sum + s.amount, 0)
  }

  const calculatePendingServicesAmount = (services: Service[]) => {
    return services.filter(s => s.status === 'pending').reduce((sum, s) => sum + s.amount, 0)
  }

  const calculateTotalEquipmentAmount = (equipment: Equipment[]) => {
    return equipment.reduce((sum, e) => sum + e.price, 0)
  }

  const calculateDiscountAmount = (total: number, discountPercentage: number) => {
    return (total * discountPercentage) / 100
  }

  const calculateAmountAfterDiscount = (total: number, discount: number) => {
    return total - discount
  }

  // Derived values
  const totalServicesAmount = selectedRecord ? calculateTotalServicesAmount(selectedRecord.services) : 0
  const totalEquipmentAmount = selectedRecord ? calculateTotalEquipmentAmount(selectedRecord.equipment) : 0 // Added
  const totalPaid = selectedRecord ? selectedRecord.totalPaid : 0
  const pendingServicesAmount = selectedRecord ? calculatePendingServicesAmount(selectedRecord.services) : 0
  const completedServicesTotalAmount = selectedRecord ? calculateCompletedServicesAmount(selectedRecord.services) : 0
  const discountPercentage = selectedRecord ? selectedRecord.discountPercentage || 0 : 0
  const discountAmount = calculateDiscountAmount(totalServicesAmount + totalEquipmentAmount, discountPercentage) // Updated
  const amountAfterDiscount = calculateAmountAfterDiscount(totalServicesAmount + totalEquipmentAmount, discountAmount) // Updated

  // =================== Handlers ===================

  // Add Additional Service
  const onSubmitAdditionalService: SubmitHandler<AdditionalServiceForm> = async (data) => {
    if (!selectedRecord) return
    setLoading(true)
    try {
      const currentServices: Service[] = selectedRecord.services || []
      const newService: Service = {
        serviceName: data.serviceName,
        amount: Number(data.amount),
        status: 'pending',
        createdAt: new Date().toLocaleString(),
      }
      const updatedServices = [newService, ...currentServices]

      const recordRef = ref(db, `ipd_bookings/${selectedRecord.id}`)
      await update(recordRef, {
        services: updatedServices,
        totalPaid: calculateCompletedServicesAmount(updatedServices),
      })

      toast.success('Additional service added successfully!', {
        position: 'top-right',
        autoClose: 5000,
      })

      const updatedRecord: BillingRecord = {
        ...selectedRecord,
        services: updatedServices,
        totalPaid: calculateCompletedServicesAmount(updatedServices),
      }
      setSelectedRecord(updatedRecord)
      setAllRecords(prev => prev.map(rec => rec.id === updatedRecord.id ? updatedRecord : rec))
      setFilteredRecords(prev => prev.map(rec => rec.id === updatedRecord.id ? updatedRecord : rec))

      reset({ serviceName: '', amount: 0 })

    } catch (error) {
      console.error('Error adding service:', error)
      toast.error('Failed to add service. Please try again.', {
        position: 'top-right',
        autoClose: 5000,
      })
    } finally {
      setLoading(false)
    }
  }

  // Add Payment
  const onSubmitPayment: SubmitHandler<PaymentForm> = async (data) => {
    if (!selectedRecord) return
    setLoading(true)
    try {
      const paymentRef = ref(db, `ipd_bookings/${selectedRecord.id}/payments`)
      const newPaymentRef = push(paymentRef)
      const newPayment: Payment = {
        amount: Number(data.paymentAmount),
        paymentType: data.paymentType,
        date: new Date().toISOString(),
      }

      await update(newPaymentRef, newPayment)

      const updatedPayments = [newPayment, ...selectedRecord.payments]
      const updatedDeposit = Number(selectedRecord.amount) + Number(data.paymentAmount)

      const recordRef = ref(db, `ipd_bookings/${selectedRecord.id}`)
      await update(recordRef, {
        payments: updatedPayments.reduce((acc, payment) => {
          const key = push(ref(db)).key
          acc[key!] = {
            amount: payment.amount,
            paymentType: payment.paymentType,
            date: payment.date,
          }
          return acc
        }, {} as Record<string, { amount: number; paymentType: string; date: string }>),
        amount: updatedDeposit,
      })

      toast.success('Payment recorded successfully!', {
        position: 'top-right',
        autoClose: 5000,
      })

      const updatedRecord: BillingRecord = {
        ...selectedRecord,
        payments: updatedPayments,
        amount: updatedDeposit,
      }
      setSelectedRecord(updatedRecord)
      setAllRecords(prev => prev.map(rec => rec.id === updatedRecord.id ? updatedRecord : rec))
      setFilteredRecords(prev => prev.map(rec => rec.id === updatedRecord.id ? updatedRecord : rec))

      resetPayment({ paymentAmount: 0, paymentType: '' })

    } catch (error) {
      console.error('Error recording payment:', error)
      toast.error('Failed to record payment. Please try again.', {
        position: 'top-right',
        autoClose: 5000,
      })
    } finally {
      setLoading(false)
    }
  }

  // Add Additional Equipment
  const onSubmitEquipment: SubmitHandler<AdditionalEquipmentForm> = async (data) => {
    if (!selectedRecord) return
    setLoading(true)
    try {
      const currentEquipment: Equipment[] = selectedRecord.equipment || []
      const newEquipment: Equipment = {
        category: data.category,
        equipmentName: data.equipmentName,
        price: Number(data.price),
        createdAt: new Date().toLocaleString(),
      }
      const updatedEquipment = [newEquipment, ...currentEquipment]

      const recordRef = ref(db, `ipd_bookings/${selectedRecord.id}`)
      await update(recordRef, {
        equipment: updatedEquipment,
      })

      toast.success('Additional equipment added successfully!', {
        position: 'top-right',
        autoClose: 5000,
      })

      const updatedRecord: BillingRecord = {
        ...selectedRecord,
        equipment: updatedEquipment,
      }
      setSelectedRecord(updatedRecord)
      setAllRecords(prev => prev.map(rec => rec.id === updatedRecord.id ? updatedRecord : rec))
      setFilteredRecords(prev => prev.map(rec => rec.id === updatedRecord.id ? updatedRecord : rec))

      resetEquipment({ category: '', equipmentName: '', price: 0 })

    } catch (error) {
      console.error('Error adding equipment:', error)
      toast.error('Failed to add equipment. Please try again.', {
        position: 'top-right',
        autoClose: 5000,
      })
    } finally {
      setLoading(false)
    }
  }

  // Mark Service as Completed
  const handleMarkServiceCompleted = async (index: number) => {
    if (!selectedRecord) return
    setLoading(true)
    try {
      const currentServices: Service[] = [...selectedRecord.services]

      if (!currentServices[index] || currentServices[index].status === 'completed') {
        setLoading(false)
        return
      }

      currentServices[index].status = 'completed'
      const updatedTotalPaid = calculateCompletedServicesAmount(currentServices)

      const recordRef = ref(db, `ipd_bookings/${selectedRecord.id}`)
      await update(recordRef, {
        services: currentServices,
        totalPaid: updatedTotalPaid,
      })

      toast.success('Service marked as completed!', {
        position: 'top-right',
        autoClose: 5000,
      })

      const updatedRecord: BillingRecord = {
        ...selectedRecord,
        services: currentServices,
        totalPaid: updatedTotalPaid,
      }
      setSelectedRecord(updatedRecord)
      setAllRecords(prev => prev.map(rec => rec.id === updatedRecord.id ? updatedRecord : rec))
      setFilteredRecords(prev => prev.map(rec => rec.id === updatedRecord.id ? updatedRecord : rec))

    } catch (error) {
      console.error('Error marking service completed:', error)
      toast.error('Failed to update service status. Please try again.', {
        position: 'top-right',
        autoClose: 5000,
      })
    } finally {
      setLoading(false)
    }
  }

  // Discharge Patient
  const handleDischarge = async () => {
    if (!selectedRecord) return
    if (!selectedRecord.roomType || !selectedRecord.bed) {
      toast.error('Bed or Room Type information missing. Cannot discharge.', {
        position: 'top-right',
        autoClose: 5000,
      })
      return
    }

    setLoading(true)
    try {
      const dischargeDate = new Date().toISOString()

      const bookingRef = ref(db, `ipd_bookings/${selectedRecord.id}`)
      await update(bookingRef, { dischargeDate })

      const bedRef = ref(db, `beds/${selectedRecord.roomType}/${selectedRecord.bed}`)
      await update(bedRef, { status: "Available" })

      toast.success('Patient discharged and bed made available!', {
        position: 'top-right',
        autoClose: 5000,
      })

      const updatedRecord = { ...selectedRecord, dischargeDate }
      setSelectedRecord(updatedRecord)
      setAllRecords(prev => prev.map(rec => rec.id === updatedRecord.id ? updatedRecord : rec))
      setFilteredRecords(prev => prev.map(rec => rec.id === updatedRecord.id ? updatedRecord : rec))

    } catch (error) {
      console.error('Error discharging patient:', error)
      toast.error('Failed to discharge patient. Please try again.', {
        position: 'top-right',
        autoClose: 5000,
      })
    } finally {
      setLoading(false)
    }
  }

  // Add Discount
  const onSubmitDiscount: SubmitHandler<DiscountForm> = async (data) => {
    if (!selectedRecord) return
    setLoading(true)
    try {
      const discountValue = Number(data.discountPercentage)
      const recordRef = ref(db, `ipd_bookings/${selectedRecord.id}`)
      await update(recordRef, {
        discountPercentage: discountValue,
      })

      toast.success('Discount applied successfully!', {
        position: 'top-right',
        autoClose: 5000,
      })

      const updatedRecord: BillingRecord = {
        ...selectedRecord,
        discountPercentage: discountValue,
      }
      setSelectedRecord(updatedRecord)
      setAllRecords(prev => prev.map(rec => rec.id === updatedRecord.id ? updatedRecord : rec))
      setFilteredRecords(prev => prev.map(rec => rec.id === updatedRecord.id ? updatedRecord : rec))

      resetDiscount({ discountPercentage: discountValue })

    } catch (error) {
      console.error('Error applying discount:', error)
      toast.error('Failed to apply discount. Please try again.', {
        position: 'top-right',
        autoClose: 5000,
      })
    } finally {
      setLoading(false)
    }
  }

  // =================== Hospital Info ===================
  const hospitalInfo = {
    logoBase64: logoBase64 || '',
    name: 'Your Hospital Name',
    address: '1234 Health St, Wellness City, Country',
    email: 'info@yourhospital.com',
    contactNumber: '+1 (234) 567-8900',
  }

  // =================== Invoice Component ===================
  const InvoiceContent: React.FC = () => {
    const [pages, setPages] = useState<React.ReactNode[]>([])

    useEffect(() => {
      if (selectedRecord) {
        const pageHeight = 730; // A4 height in pixels at 72 DPI
        const pageWidth = 500; // A4 width in pixels at 72 DPI
        const contentPerPage: React.ReactNode[] = []
        let currentPage: React.ReactNode[] = []
        let currentHeight = 0
        const bottomPadding = 20 // 20px bottom padding

        const addToPage = (element: React.ReactNode, height: number) => {
          if (currentHeight + height > pageHeight - bottomPadding) {
            contentPerPage.push(
              <div key={contentPerPage.length} style={{ width: `${pageWidth}px`, height: `${pageHeight}px`, padding: '28px 8px 20px 8px', overflow: 'hidden', boxSizing: 'border-box' }}>
                {currentPage}
              </div>
            )
            currentPage = []
            currentHeight = 0
          }
          currentPage.push(element)
          currentHeight += height
        }

        // Header (estimated height: 100px)
        addToPage(
          <div className="mb-6">
            <h2 className="text-xl font-semibold uppercase tracking-wide border-b pb-2 mb-4">Patient Invoice</h2>
            <div className="flex justify-between flex-wrap">
              <div>
                <p className="text-sm"><strong>Patient Name:</strong> {selectedRecord.name}</p>
                {/* <p className="text-sm"><strong>Patient ID:</strong> {selectedRecord.id}</p> */}
                <p className="text-sm"><strong>Mobile:</strong> {selectedRecord.mobileNumber}</p>
                <p className="text-sm">
                  <strong>Admission Date:</strong>{' '}
                  {selectedRecord.services[0]?.createdAt
                    ? format(new Date(selectedRecord.services[0].createdAt), 'dd MMM yyyy')
                    : 'N/A'}
                </p>
              
              </div>
              <div className="text-right">
                {/* <p className="text-sm"><strong>Invoice #:</strong> {selectedRecord.id}</p> */}
                <p className="text-sm"><strong>Bill Date:</strong> {format(new Date(), 'dd MMM yyyy')}</p>
                {selectedRecord.dischargeDate && (
                  <p className="text-sm">
                    <strong>Discharge Date:</strong>{' '}
                    {format(new Date(selectedRecord.dischargeDate), 'dd MMM yyyy')}
                  </p>
                )}
                {/* <p className="text-sm"><strong>Payment Type:</strong> {selectedRecord.paymentType.charAt(0).toUpperCase() + selectedRecord.paymentType.slice(1)}</p> */}
              </div>
            </div>
          </div>,
          100
        )

        // Itemized Services (estimated height: 50px per item + 50px for header)
        addToPage(
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Itemized Services</h3>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 font-medium">Service</th>
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {selectedRecord.services.map((service, index) => (
                  <tr key={index} className="border-b last:border-none">
                    <td className="py-2">{service.serviceName}</td>
                    <td className="py-2">{service.createdAt ? format(new Date(service.createdAt), 'dd MMM yyyy') : 'N/A'}</td>
                    <td className="py-2 text-right">{currencyFormatter.format(service.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
          50 + selectedRecord.services.length * 50
        )

        // Itemized Equipment (estimated height: 50px per item + 50px for header)
        addToPage(
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Itemized Equipment</h3>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 font-medium">Category</th>
                  <th className="py-2 font-medium">Equipment</th>
                  <th className="py-2 font-medium text-right">Price</th>
                </tr>
              </thead>
              <tbody>
                {selectedRecord.equipment.map((equip, index) => (
                  <tr key={index} className="border-b last:border-none">
                    <td className="py-2">{equip.category}</td>
                    <td className="py-2">{equip.equipmentName}</td>
                    <td className="py-2 text-right">{currencyFormatter.format(equip.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
          50 + selectedRecord.equipment.length * 50
        )

        // Summary (updated to include equipment)
        addToPage(
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-1">
              <span>Total Services Charges:</span>
              <span className="font-semibold">{currencyFormatter.format(totalServicesAmount)}</span>
            </div>
            <div className="flex justify-between text-sm mb-1">
              <span>Total Equipment Charges:</span>
              <span className="font-semibold">{currencyFormatter.format(totalEquipmentAmount)}</span>
            </div>
            <div className="flex justify-between text-sm mb-1">
              <span>Discount ({discountPercentage}%):</span>
              <span className="font-semibold text-red-600">- {currencyFormatter.format(discountAmount)}</span>
            </div>
            <div className="flex justify-between text-sm mb-1">
              <span>Amount After Discount:</span>
              <span className="font-semibold">{currencyFormatter.format(amountAfterDiscount)}</span>
            </div>
            <div className="flex justify-between text-sm mb-1">
              <span>Deposit Amount:</span>
              <span className="font-semibold">{currencyFormatter.format(selectedRecord.amount)}</span>
            </div>
            <div className="flex justify-between text-sm mb-1">
              <span>Total Paid (Completed Services):</span>
              <span className="font-semibold text-red-600">{currencyFormatter.format(totalPaid)}</span>
            </div>
            <div className="flex justify-between text-sm mb-1">
              <span>Remaining Balance:</span>
              <span className="font-semibold">{currencyFormatter.format(amountAfterDiscount + selectedRecord.amount - totalPaid)}</span>
            </div>
          </div>,
          200
        )

        // Footer (estimated height: 100px)
        addToPage(
          <div className="text-sm text-gray-600">
            <p>This is a computer-generated invoice and does not require a signature.</p>
            <p>Thank you for choosing {hospitalInfo.name}. We wish you a speedy recovery and continued good health.</p>
          </div>,
          100
        )

        // Add any remaining content to the last page
        if (currentPage.length > 0) {
          contentPerPage.push(
            <div key={contentPerPage.length} style={{ width: `${pageWidth}px`, height: `${pageHeight}px`, padding: '28px 8px 20px 8px', overflow: 'hidden', boxSizing: 'border-box' }}>
              {currentPage}
            </div>
          )
        }

        setPages(contentPerPage)
      }
    }, [selectedRecord])

    return (
      <>
        {pages.map((page, index) => (
          <div
            key={index}
            className="bg-white text-gray-800 font-sans p-8 pt-28 "
            style={{
              backgroundImage: 'url(/letterhead.png)', // Ensure this image exists or remove if not needed
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              width: '595px',
              height: '842px',
              margin: '0 auto',
              pageBreakAfter: 'always',
              overflow: 'hidden',
              boxSizing: 'border-box',
            }}
          >
            {page}
          </div>
        ))}
      </>
    )
  }

  // =================== Download Invoice ===================
  const handleDownloadInvoice = async () => {
    if (!selectedRecord) return
    if (!invoiceRef.current) return

    await new Promise(resolve => setTimeout(resolve, 100)) // Ensure content is rendered

    const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' })
    const pages = invoiceRef.current.children

    for (let i = 0; i < pages.length; i++) {
      if (i > 0) pdf.addPage()
      await html2canvas(pages[i] as HTMLElement, { scale: 3, useCORS: true }).then(canvas => {
        const imgData = canvas.toDataURL('image/png')
        pdf.addImage(imgData, 'PNG', 0, 0, 595, 842, '', 'FAST')
      })
    }

    const fileName = selectedRecord.dischargeDate
      ? `Final_Invoice_${selectedRecord.name}_${selectedRecord.id}.pdf`
      : `Provisional_Invoice_${selectedRecord.name}_${selectedRecord.id}.pdf`
    pdf.save(fileName)
  }

  // =================== Helper to get Base64 image ===================
  function getBase64Image(imgUrl: string, callback: (base64: string) => void) {
    const img = new Image()
    img.setAttribute('crossOrigin', 'anonymous')
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx?.drawImage(img, 0, 0)
      const dataURL = canvas.toDataURL('image/png')
      callback(dataURL)
    }
    img.onerror = (err: any) => {
      console.error('Error loading logo image:', err)
      callback('')
    }
    img.src = imgUrl
  }

  // =================== Get Record Date for Sorting ===================
  const getRecordDate = (record: BillingRecord): Date => {
    if (record.dischargeDate) {
      return new Date(record.dischargeDate)
    } else if (record.services.length > 0 && record.services[0].createdAt) {
      return new Date(record.services[0].createdAt)
    } else {
      return new Date(0)
    }
  }

  const sortedFilteredRecords = [...filteredRecords].sort((a, b) => getRecordDate(b).getTime() - getRecordDate(a).getTime())

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <ToastContainer />
      <div className="max-w-7xl mx-auto bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-8">
          <h1 className="text-4xl font-bold text-indigo-800 mb-8 text-center">IPD Billing Management</h1>

          {/* Search Bar */}
          <div className="mb-8">
            <div className="flex items-center bg-gray-100 rounded-full p-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by Name, Admission ID, or Mobile"
                className="flex-grow bg-transparent px-4 py-2 focus:outline-none"
              />
              <button
                onClick={handleSearch}
                className="bg-indigo-600 text-white rounded-full p-2 hover:bg-indigo-700 transition duration-300"
              >
                <Search size={24} />
              </button>
            </div>
          </div>

          {/* Records and Billing Details */}
          <AnimatePresence mode="wait">
            {!selectedRecord ? (
              <motion.div
                key="search-results"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                {sortedFilteredRecords.length === 0 ? (
                  <p className="text-gray-500 text-center">No records found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-indigo-100">
                          <th className="px-4 py-2 text-left">Patient Name</th>
                          <th className="px-4 py-2 text-left">Mobile Number</th>
                          <th className="px-4 py-2 text-left">Total Paid (Rs)</th>
                          <th className="px-4 py-2 text-left">Payment Type</th>
                          <th className="px-4 py-2 text-left">Discharge Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedFilteredRecords.map(rec => (
                          <motion.tr
                            key={rec.id}
                            className="hover:bg-indigo-50 cursor-pointer transition duration-150"
                            onClick={() => handleSelectRecord(rec)}
                            whileHover={{ scale: 1.01 }}
                          >
                            <td className="border-t px-4 py-2">{rec.name}</td>
                            <td className="border-t px-4 py-2">{rec.mobileNumber}</td>
                            <td className="border-t px-4 py-2">{rec.totalPaid.toLocaleString()}</td>
                            <td className="border-t px-4 py-2 capitalize">{rec.paymentType}</td>
                            <td className="border-t px-4 py-2">
                              {rec.dischargeDate 
                                ? format(parseISO(rec.dischargeDate), 'dd MMM yyyy')
                                : 'Not discharged'}
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="billing-details"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                {/* Back Button */}
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="mb-6 flex items-center text-indigo-600 hover:text-indigo-800 transition duration-300"
                >
                  <ArrowLeft size={20} className="mr-2" />
                  Back to Results
                </button>

                {/* Billing Details */}
                <div className="bg-indigo-50 rounded-xl p-6 mb-8">
                  <h2 className="text-2xl font-semibold text-indigo-800 mb-4">Billing Details for {selectedRecord.name}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <p><strong>Name:</strong> {selectedRecord.name}</p>
                      <p><strong>Mobile:</strong> {selectedRecord.mobileNumber}</p>
                      <p><strong>Payment Type at Admission:</strong> {selectedRecord.paymentType.charAt(0).toUpperCase() + selectedRecord.paymentType.slice(1)}</p>
                    </div>
                    <div>
                      <p><strong>Deposit Amount:</strong> Rs. {selectedRecord.amount.toLocaleString()}</p>
                      <p><strong>Total Services Amount:</strong> Rs. {totalServicesAmount.toLocaleString()}</p>
                      <p><strong>Total Equipment Amount:</strong> Rs. {totalEquipmentAmount.toLocaleString()}</p> {/* Added */}
                      <p><strong>Discharge Date:</strong> {selectedRecord.dischargeDate ? format(parseISO(selectedRecord.dischargeDate), 'dd MMM yyyy') : 'Not discharged'}</p>
                    </div>
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="flex flex-wrap justify-between mb-6">
                  <div className="bg-green-100 rounded-lg p-4 w-full md:w-1/2 mb-4 md:mb-0">
                    <p className="text-green-800"><strong>Pending Services Amount:</strong> Rs. {pendingServicesAmount.toLocaleString()}</p>
                  </div>
                  <div className="bg-blue-100 rounded-lg p-4 w-full md:w-1/2">
                    <p className="text-blue-800"><strong>Completed Services Amount:</strong> Rs. {completedServicesTotalAmount.toLocaleString()}</p>
                  </div>
                </div>

                {/* Payment History Button */}
                <div className="flex items-center justify-end mb-4">
                  <button
                    onClick={() => setIsPaymentHistoryOpen(true)}
                    className="flex items-center bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full px-4 py-2 transition duration-300"
                  >
                    <History size={20} className="mr-2" />
                    View Payment History
                  </button>
                </div>

                {/* Record Additional Payment */}
                {!selectedRecord.dischargeDate && (
                  <div className="bg-white rounded-xl shadow-md p-6 mb-8">
                    <h3 className="text-xl font-semibold text-indigo-800 mb-4">Record Additional Payment</h3>
                    <form onSubmit={handleSubmitPayment(onSubmitPayment)} className="space-y-4">
                      <div>
                        <label className="block text-gray-700 mb-2">Payment Amount (Rs)</label>
                        <input
                          type="number"
                          {...registerPayment('paymentAmount')}
                          placeholder="e.g., 500"
                          className={`w-full px-4 py-2 rounded-lg border ${
                            errorsPayment.paymentAmount ? 'border-red-500' : 'border-gray-300'
                          } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                        />
                        {errorsPayment.paymentAmount && (
                          <p className="text-red-500 text-sm mt-1">
                            {errorsPayment.paymentAmount.message}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-gray-700 mb-2">Payment Type</label>
                        <select
                          {...registerPayment('paymentType')}
                          className={`w-full px-4 py-2 rounded-lg border ${
                            errorsPayment.paymentType ? 'border-red-500': 'border-gray-300'
                          } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                        >
                          <option value="">Select Payment Type</option>
                          <option value="cash">Cash</option>
                          <option value="online">Online</option>
                          <option value="card">Card</option>
                        </select>
                        {errorsPayment.paymentType && (
                          <p className="text-red-500 text-sm mt-1">
                            {errorsPayment.paymentType.message}
                          </p>
                        )}
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className={`w-full py-2 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition duration-300 flex items-center justify-center ${
                          loading ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        {loading ? 'Processing...' : <><Plus size={20} className="mr-2" /> Add Payment</>}
                      </button>
                    </form>
                  </div>
                )}

                {/* Add Additional Equipment Form */}
                {!selectedRecord.dischargeDate && (
                  <div className="bg-white rounded-xl shadow-md p-6 mb-8">
                    <h3 className="text-xl font-semibold text-indigo-800 mb-4">Add Additional Equipment</h3>
                    <form onSubmit={handleSubmitEquipment(onSubmitEquipment)} className="space-y-4">
                      {/* Equipment Category */}
                      <div>
                        <label className="block text-gray-700 mb-2">Equipment Category</label>
                        <select
                          {...registerEquipment('category')}
                          className={`w-full px-4 py-2 rounded-lg border ${
                            errorsEquipment.category ? 'border-red-500' : 'border-gray-300'
                          } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                        >
                          <option value="">Select Category</option>
                          {Object.keys(equipmentData).map((category, idx) => (
                            <option key={idx} value={category}>{category}</option>
                          ))}
                        </select>
                        {errorsEquipment.category && <p className="text-red-500 text-sm mt-1">{errorsEquipment.category.message}</p>}
                      </div>

                      {/* Equipment Name */}
                      <div>
                        <label className="block text-gray-700 mb-2">Equipment Name</label>
                        <select
                          {...registerEquipment('equipmentName')}
                          className={`w-full px-4 py-2 rounded-lg border ${
                            errorsEquipment.equipmentName ? 'border-red-500' : 'border-gray-300'
                          } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                          disabled={!selectedCategory} // Disable if no category is selected
                        >
                          <option value="">Select Equipment</option>
                          {selectedCategory && equipmentData[selectedCategory]?.map((equip, idx) => (
                            <option key={idx} value={equip}>{equip}</option>
                          ))}
                        </select>
                        {errorsEquipment.equipmentName && <p className="text-red-500 text-sm mt-1">{errorsEquipment.equipmentName.message}</p>}
                      </div>

                      {/* Price */}
                      <div>
                        <label className="block text-gray-700 mb-2">Price (Rs)</label>
                        <input
                          type="number"
                          {...registerEquipment('price')}
                          placeholder="e.g., 1500"
                          className={`w-full px-4 py-2 rounded-lg border ${
                            errorsEquipment.price ? 'border-red-500' : 'border-gray-300'
                          } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                        />
                        {errorsEquipment.price && <p className="text-red-500 text-sm mt-1">{errorsEquipment.price.message}</p>}
                      </div>

                      {/* Submit Button */}
                      <button
                        type="submit"
                        disabled={loading}
                        className={`w-full py-2 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition duration-300 flex items-center justify-center ${
                          loading ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        {loading ? 'Processing...' : <><Plus size={20} className="mr-2" /> Add Equipment</>}
                      </button>
                    </form>
                  </div>
                )}

                {/* Additional Services */}
                <div className="bg-white rounded-xl shadow-md p-6 mb-8">
                  <h3 className="text-xl font-semibold text-indigo-800 mb-4">Additional Services</h3>
                  {selectedRecord.services.length === 0 ? (
                    <p className="text-gray-500">No additional services added yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-indigo-50">
                            <th className="px-4 py-2 text-left">Service Name</th>
                            <th className="px-4 py-2 text-left">Amount (Rs)</th>
                            <th className="px-4 py-2 text-left">Date/Time</th>
                            <th className="px-4 py-2 text-left">Status</th>
                            <th className="px-4 py-2 text-left">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedRecord.services.map((srv, index) => (
                            <tr key={index} className="border-t">
                              <td className="px-4 py-2">{srv.serviceName}</td>
                              <td className="px-4 py-2">Rs. {srv.amount.toLocaleString()}</td>
                              <td className="px-4 py-2">{srv.createdAt ? new Date(srv.createdAt).toLocaleString() : 'N/A'}</td>
                              <td className="px-4 py-2 capitalize">
                                {srv.status === 'completed' ? (
                                  <span className="text-green-600 font-semibold">Completed</span>
                                ) : (
                                  <span className="text-yellow-600 font-semibold">Pending</span>
                                )}
                              </td>
                              <td className="px-4 py-2">
                                {srv.status === 'pending' && !selectedRecord.dischargeDate && (
                                  <button
                                    onClick={() => handleMarkServiceCompleted(index)}
                                    disabled={loading}
                                    className="bg-green-500 text-white px-3 py-1 rounded-full hover:bg-green-600 transition duration-300 flex items-center"
                                  >
                                    {loading ? '...' : <><CheckCircle size={16} className="mr-1" /> Complete</>}
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

                {/* Additional Equipment Listing */}
                {selectedRecord.equipment.length > 0 && (
                  <div className="bg-white rounded-xl shadow-md p-6 mb-8">
                    <h3 className="text-xl font-semibold text-indigo-800 mb-4">Additional Equipment</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-indigo-50">
                            <th className="px-4 py-2 text-left">Category</th>
                            <th className="px-4 py-2 text-left">Equipment Name</th>
                            <th className="px-4 py-2 text-left">Price (Rs)</th>
                            <th className="px-4 py-2 text-left">Date/Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedRecord.equipment.map((equip, index) => (
                            <tr key={index} className="border-t">
                              <td className="px-4 py-2">{equip.category}</td>
                              <td className="px-4 py-2">{equip.equipmentName}</td>
                              <td className="px-4 py-2">Rs. {equip.price.toLocaleString()}</td>
                              <td className="px-4 py-2">{equip.createdAt ? new Date(equip.createdAt).toLocaleString() : 'N/A'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Apply Discount Form */}
                {!selectedRecord.dischargeDate && (
                  <div className="bg-white rounded-xl shadow-md p-6 mb-8">
                    <h3 className="text-xl font-semibold text-indigo-800 mb-4">Apply Discount</h3>
                    <form onSubmit={handleSubmitDiscount(onSubmitDiscount)} className="space-y-4">
                      <div>
                        <label className="block text-gray-700 mb-2">Discount Percentage (%)</label>
                        <input
                          type="number"
                          {...registerDiscount('discountPercentage')}
                          placeholder="e.g., 10"
                          className={`w-full px-4 py-2 rounded-lg border ${
                            errorsDiscount.discountPercentage ? 'border-red-500' : 'border-gray-300'
                          } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                        />
                        {errorsDiscount.discountPercentage && <p className="text-red-500 text-sm mt-1">{errorsDiscount.discountPercentage.message}</p>}
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className={`w-full py-2 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition duration-300 flex items-center justify-center ${
                          loading ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        {loading ? 'Processing...' : <><Plus size={20} className="mr-2" /> Apply Discount</>}
                      </button>
                    </form>
                  </div>
                )}

                {/* Add Additional Service */}
                {!selectedRecord.dischargeDate && (
                  <div className="bg-white rounded-xl shadow-md p-6 mb-8">
                    <h3 className="text-xl font-semibold text-indigo-800 mb-4">Add Additional Service</h3>
                    <form onSubmit={handleSubmit(onSubmitAdditionalService)} className="space-y-4">
                      <div>
                        <label className="block text-gray-700 mb-2">Service Name</label>
                        <input
                          type="text"
                          {...register('serviceName')}
                          placeholder="e.g., X-Ray, Lab Test"
                          className={`w-full px-4 py-2 rounded-lg border ${
                            errors.serviceName ? 'border-red-500' : 'border-gray-300'
                          } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                        />
                        {errors.serviceName && <p className="text-red-500 text-sm mt-1">{errors.serviceName.message}</p>}
                      </div>
                      <div>
                        <label className="block text-gray-700 mb-2">Amount (Rs)</label>
                        <input
                          type="number"
                          {...register('amount')}
                          placeholder="e.g., 1000"
                          className={`w-full px-4 py-2 rounded-lg border ${
                            errors.amount ? 'border-red-500' : 'border-gray-300'
                          } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                        />
                        {errors.amount && <p className="text-red-500 text-sm mt-1">{errors.amount.message}</p>}
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className={`w-full py-2 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition duration-300 flex items-center justify-center ${
                          loading ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        {loading ? 'Processing...' : <><Plus size={20} className="mr-2" /> Add Service</>}
                      </button>
                    </form>
                  </div>
                )}

                {/* Discharge Button */}
                {!selectedRecord.dischargeDate && (
                  <div className="flex justify-center mb-8">
                    <button
                      onClick={handleDischarge}
                      disabled={loading}
                      className={`px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition duration-300 flex items-center ${
                        loading ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      {loading ? 'Processing...' : <><AlertTriangle size={20} className="mr-2" /> Discharge Patient</>}
                    </button>
                  </div>
                )}

                {/* Download Invoice Button */}
                <div className="flex justify-center mb-8">
                  <button
                    onClick={handleDownloadInvoice}
                    className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition duration-300 flex items-center"
                  >
                    <Download size={20} className="mr-2" />
                    {selectedRecord.dischargeDate ? 'Download Final Invoice' : 'Download Provisional Invoice'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Hidden Invoice for PDF Generation */}
      {selectedRecord && (
        <div ref={invoiceRef} style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <InvoiceContent />
        </div>
      )}

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
              <Dialog.Panel className="bg-white rounded-xl shadow-lg p-6 max-w-lg w-full">
                <Dialog.Title className="text-xl font-bold mb-4 text-gray-800">Payment History</Dialog.Title>
                {selectedRecord && selectedRecord.payments.length > 0 ? (
                  <div className="overflow-x-auto max-h-60">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-4 py-2 text-left">#</th>
                          <th className="px-4 py-2 text-left">Amount (Rs)</th>
                          <th className="px-4 py-2 text-left">Payment Type</th>
                          <th className="px-4 py-2 text-left">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRecord.payments.map((payment, index) => (
                          <tr key={index} className="border-t">
                            <td className="px-4 py-2">{index + 1}</td>
                            <td className="px-4 py-2">Rs. {payment.amount.toLocaleString()}</td>
                            <td className="px-4 py-2 capitalize">{payment.paymentType}</td>
                            <td className="px-4 py-2">{new Date(payment.date).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500">No payments recorded yet.</p>
                )}
                <div className="mt-4 text-right">
                  <button
                    onClick={() => setIsPaymentHistoryOpen(false)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition duration-300"
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

  // =================== Watch Category for Equipment ===================
  // Removed the watchCategory function as it's no longer needed
}
