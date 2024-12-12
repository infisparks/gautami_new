// pages/adminipd.tsx
'use client'

import React, { useEffect, useState, useRef, Fragment } from 'react'
import { db } from '@/lib/firebase'
import { ref, onValue, update, push } from 'firebase/database'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { useForm, SubmitHandler } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Plus, CheckCircle, ArrowLeft, AlertTriangle, Download, Phone, Mail, History, X } from 'lucide-react'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { format } from 'date-fns'
import { Dialog, Transition } from '@headlessui/react'

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
  dischargeDate?: string
}

interface AdditionalServiceForm {
  serviceName: string
  amount: number
}

interface PaymentForm {
  paymentAmount: number
  paymentType: string
}

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

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2
})

const AdminIPDPage: React.FC = () => {
  const [allRecords, setAllRecords] = useState<BillingRecord[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filteredRecords, setFilteredRecords] = useState<BillingRecord[]>([])
  const [selectedRecord, setSelectedRecord] = useState<BillingRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [logoBase64, setLogoBase64] = useState<string | null>(null)
  const [isPaymentHistoryOpen, setIsPaymentHistoryOpen] = useState(false)

  const invoiceRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    const logoUrl = 'https://yourdomain.com/path-to-your-logo.png' // Replace with actual logo URL
    getBase64Image(logoUrl, (base64: string) => {
      setLogoBase64(base64)
    })
  }, [])

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
            dischargeDate: rec.dischargeDate || undefined,
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

  const handleSearch = () => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) {
      setFilteredRecords(allRecords)
      setSelectedRecord(null)
      return
    }
    const results = allRecords.filter(rec =>
      rec.name.toLowerCase().includes(term) ||
      rec.mobileNumber.includes(term) ||
      rec.id.toLowerCase().includes(term)
    )
    setFilteredRecords(results)
    setSelectedRecord(null)
  }

  const handleSelectRecord = (record: BillingRecord) => {
    setSelectedRecord(record)
    reset({ serviceName: '', amount: 0 })
    resetPayment({ paymentAmount: 0, paymentType: '' })
  }

  const calculateTotalServicesAmount = (services: Service[]) => {
    return services.reduce((sum, s) => sum + s.amount, 0)
  }

  const calculateCompletedServicesAmount = (services: Service[]) => {
    return services.filter(s => s.status === 'completed').reduce((sum, s) => sum + s.amount, 0)
  }

  const calculatePendingServicesAmount = (services: Service[]) => {
    return services.filter(s => s.status === 'pending').reduce((sum, s) => sum + s.amount, 0)
  }

  const totalServicesAmount = selectedRecord ? calculateTotalServicesAmount(selectedRecord.services) : 0
  const completedServicesAmount = selectedRecord ? calculateCompletedServicesAmount(selectedRecord.services) : 0
  const totalPaid = selectedRecord ? selectedRecord.totalPaid : 0
  const pendingServicesAmount = selectedRecord ? calculatePendingServicesAmount(selectedRecord.services) : 0
  const completedServicesTotalAmount = selectedRecord ? calculateCompletedServicesAmount(selectedRecord.services) : 0
  const outstandingAmount = selectedRecord ? selectedRecord.amount + totalServicesAmount - totalPaid : 0

  const onSubmitAdditionalService: SubmitHandler<AdditionalServiceForm> = async (data) => {
    if (!selectedRecord) return
    setLoading(true)
    try {
      const recordRef = ref(db, `ipd_bookings/${selectedRecord.id}`)
      const recordSnap = await new Promise<Partial<BillingRecord> | null>((resolve) => {
        onValue(recordRef, (snap) => {
          resolve(snap.val() as Partial<BillingRecord> | null)
        }, { onlyOnce: true })
      })
      const currentServices: Service[] = recordSnap?.services ? recordSnap.services.map((s: any) => ({
        ...s,
        amount: Number(s.amount)
      })) : []

      const newService: Service = {
        serviceName: data.serviceName,
        amount: Number(data.amount),
        status: 'pending',
        createdAt: new Date().toISOString(),
      }
      const updatedServices = [newService, ...currentServices]

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
          if (key) {
            acc[key] = {
              amount: payment.amount,
              paymentType: payment.paymentType,
              date: payment.date,
            }
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

  const handleMarkServiceCompleted = async (index: number) => {
    if (!selectedRecord) return
    setLoading(true)
    try {
      const recordRef = ref(db, `ipd_bookings/${selectedRecord.id}`)
      const recordSnap = await new Promise<Partial<BillingRecord> | null>((resolve) => {
        onValue(recordRef, (snap) => {
          resolve(snap.val() as Partial<BillingRecord> | null)
        }, { onlyOnce: true })
      })

      const currentServices: Service[] = recordSnap?.services ? recordSnap.services.map((s: any) => ({
        ...s,
        amount: Number(s.amount)
      })) : []

      if (!currentServices[index] || currentServices[index].status === 'completed') {
        setLoading(false)
        return
      }

      currentServices[index].status = 'completed'
      const updatedTotalPaid = calculateCompletedServicesAmount(currentServices)

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

  const handleFilterByDate = (date: string) => {
    const filtered = allRecords.filter(rec => {
      const admissionDate = rec.services[0]?.createdAt
        ? format(new Date(rec.services[0].createdAt), 'yyyy-MM-dd')
        : ''
      return admissionDate === date
    })
    setFilteredRecords(filtered)
    setSelectedRecord(null)
  }

  const handleFilterDischarged = () => {
    const discharged = allRecords.filter(rec => rec.dischargeDate)
    setFilteredRecords(discharged)
    setSelectedRecord(null)
  }

  const handleFilterAll = () => {
    setFilteredRecords(allRecords)
    setSelectedRecord(null)
  }

  const handleDownloadInvoice = async () => {
    if (!selectedRecord) return
    if (!invoiceRef.current) return

    await new Promise(resolve => setTimeout(resolve, 100))

    html2canvas(invoiceRef.current, { scale: 3, useCORS: true })
      .then(canvas => {
        const imgData = canvas.toDataURL('image/png')
        const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' })
        const pdfWidth = pdf.internal.pageSize.getWidth()
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, '', 'FAST')
        const fileName = selectedRecord.dischargeDate ? `Final_Invoice_${selectedRecord.name}_${selectedRecord.id}.pdf` : `Provisional_Invoice_${selectedRecord.name}_${selectedRecord.id}.pdf`
        pdf.save(fileName)
      })
      .catch((err: unknown) => {
        console.error('Error generating PDF:', err)
        toast.error('Failed to generate PDF. Please try again.', {
          position: 'top-right',
          autoClose: 5000,
        })
      })
  }

  function getBase64Image(imgUrl: string, callback: (base64: string) => void) {
    const img = new Image();
    img.setAttribute('crossOrigin', 'anonymous');
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0);
      const dataURL = canvas.toDataURL('image/png');
      callback(dataURL);
    };
    img.onerror = (err: any) => {
      console.error('Error loading logo image:', err)
      callback('')
    }
    img.src = imgUrl
  }

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

  const admissionDates = Array.from(new Set(allRecords.map(rec => {
    const admissionDate = rec.services[0]?.createdAt
      ? format(new Date(rec.services[0].createdAt), 'yyyy-MM-dd')
      : ''
    return admissionDate
  }).filter(date => date)))

  const hospitalInfo = {
    logoBase64: logoBase64 || '',
    name: 'Your Hospital Name',
    address: '1234 Health St, Wellness City, Country',
    email: 'info@yourhospital.com',
    contactNumber: '+1 (234) 567-8900',
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <ToastContainer />
      <div className="max-w-7xl mx-auto bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-8">
          <h1 className="text-4xl font-bold text-indigo-800 mb-8 text-center">Admin IPD Management Panel</h1>

          {/* Search and Filter Section */}
          <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
            {/* Search Bar */}
            <div className="flex items-center bg-gray-100 rounded-full p-2 w-full md:w-1/2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by Name, Admission ID, or Mobile Number"
                className="flex-grow bg-transparent px-4 py-2 focus:outline-none"
              />
              <button
                onClick={handleSearch}
                className="bg-indigo-600 text-white rounded-full p-2 hover:bg-indigo-700 transition duration-300"
              >
                <Search size={24} />
              </button>
            </div>

            {/* Filter Buttons */}
            <div className="flex items-center space-x-4">
              <button
                onClick={handleFilterAll}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition duration-300"
              >
                All Patients
              </button>
              <button
                onClick={handleFilterDischarged}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition duration-300"
              >
                Discharged Patients
              </button>
              <select
                onChange={(e) => handleFilterByDate(e.target.value)}
                defaultValue=""
                className="px-4 py-2 rounded bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Filter by Admission Date</option>
                {admissionDates.map((date, index) => (
                  <option key={index} value={date}>{format(new Date(date), 'dd MMM yyyy')}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Patient Records Table */}
          <AnimatePresence mode="wait">
            {!selectedRecord ? (
              <motion.div
                key="patient-table"
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
                          <th className="px-4 py-2 text-left">Discharge Status</th>
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
                            <td className="border-t px-4 py-2">{currencyFormatter.format(rec.totalPaid)}</td>
                            <td className="border-t px-4 py-2 capitalize">{rec.paymentType}</td>
                            <td className="border-t px-4 py-2">
                              {rec.dischargeDate ? (
                                <span className="text-green-600 font-semibold">Discharged</span>
                              ) : (
                                <span className="text-yellow-600 font-semibold">Admitted</span>
                              )}
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
                key="patient-details"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="mb-6 flex items-center text-indigo-600 hover:text-indigo-800 transition duration-300"
                >
                  <ArrowLeft size={20} className="mr-2" />
                  Back to Records
                </button>

                <div className="bg-indigo-50 rounded-xl p-6 mb-8">
                  <h2 className="text-2xl font-semibold text-indigo-800 mb-4">Patient Details for {selectedRecord.name}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <p><strong>Name:</strong> {selectedRecord.name}</p>
                      <p><strong>Mobile:</strong> {selectedRecord.mobileNumber}</p>
                      <p><strong>Payment Type at Admission:</strong> {selectedRecord.paymentType.charAt(0).toUpperCase() + selectedRecord.paymentType.slice(1)}</p>
                    </div>
                    <div>
                      <p><strong>Deposit Amount:</strong> {currencyFormatter.format(selectedRecord.amount)}</p>
                      <p><strong>Completed Services Amount:</strong> {currencyFormatter.format(completedServicesAmount)}</p>
                      <p><strong>Total Paid (Completed Services):</strong> {currencyFormatter.format(totalPaid)}</p>
                      <p><strong>Total Services Amount:</strong> {currencyFormatter.format(totalServicesAmount)}</p>
                      <p><strong>Discharge Date:</strong> {selectedRecord.dischargeDate ? new Date(selectedRecord.dischargeDate).toLocaleDateString() : 'N/A'}</p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between mb-6">
                  <div className="bg-green-100 rounded-lg p-4">
                    <p className="text-green-800"><strong>Pending Services Amount:</strong> {currencyFormatter.format(pendingServicesAmount)}</p>
                  </div>
                  <div className="bg-blue-100 rounded-lg p-4">
                    <p className="text-blue-800"><strong>Completed Services Amount:</strong> {currencyFormatter.format(completedServicesTotalAmount)}</p>
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

                {/* Payment Form */}
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
                        {errorsPayment.paymentAmount && <p className="text-red-500 text-sm mt-1">{errorsPayment.paymentAmount.message}</p>}
                      </div>
                      <div>
                        <label className="block text-gray-700 mb-2">Payment Type</label>
                        <select
                          {...registerPayment('paymentType')}
                          className={`w-full px-4 py-2 rounded-lg border ${
                            errorsPayment.paymentType ? 'border-red-500' : 'border-gray-300'
                          } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                        >
                          <option value="">Select Payment Type</option>
                          <option value="cash">Cash</option>
                          <option value="online">Online</option>
                          <option value="card">Card</option>
                        </select>
                        {errorsPayment.paymentType && <p className="text-red-500 text-sm mt-1">{errorsPayment.paymentType.message}</p>}
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

                {/* Services Table */}
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

                {/* Add Additional Service Section */}
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
          <div className="max-w-4xl mx-auto bg-white text-gray-800 font-sans p-8">
            <div className="flex items-start justify-between mb-8">
              {/* Left: Logo */}
              {hospitalInfo.logoBase64 && (
                <div className="flex-shrink-0 mr-4">
                  <img src={hospitalInfo.logoBase64} alt="Hospital Logo" width={64} height={64} />
                </div>
              )}

              {/* Right: Hospital Details */}
              <div className="text-right">
                <h1 className="text-2xl font-bold">{hospitalInfo.name}</h1>
                <p className="text-sm">{hospitalInfo.address}</p>
                <div className="flex items-center justify-end text-sm mt-1">
                  <Phone size={14} className="mr-2" />
                  <span>{hospitalInfo.contactNumber}</span>
                </div>
                <div className="flex items-center justify-end text-sm mt-1">
                  <Mail size={14} className="mr-2" />
                  <span>{hospitalInfo.email}</span>
                </div>
              </div>
            </div>

            {selectedRecord && (
              <>
                <div className="mb-6">
                  <h2 className="text-xl font-semibold uppercase tracking-wide border-b pb-2 mb-4">Patient Invoice</h2>
                  <div className="flex justify-between">
                    <div>
                      <p className="text-sm"><strong>Patient Name:</strong> {selectedRecord.name}</p>
                      <p className="text-sm"><strong>Patient ID:</strong> {selectedRecord.id}</p>
                      <p className="text-sm"><strong>Mobile:</strong> {selectedRecord.mobileNumber}</p>
                      <p className="text-sm">
                        <strong>Admission Date:</strong>{' '}
                        {selectedRecord.services[0]?.createdAt
                          ? format(new Date(selectedRecord.services[0].createdAt), 'dd MMM yyyy')
                          : 'N/A'}
                      </p>
                      {selectedRecord.dischargeDate && (
                        <p className="text-sm">
                          <strong>Discharge Date:</strong>{' '}
                          {format(new Date(selectedRecord.dischargeDate), 'dd MMM yyyy')}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm"><strong>Invoice #:</strong> {selectedRecord.id}</p>
                      <p className="text-sm"><strong>Generated On:</strong> {format(new Date(), 'dd MMM yyyy')}</p>
                      <p className="text-sm"><strong>Payment Type:</strong> {selectedRecord.paymentType.charAt(0).toUpperCase() + selectedRecord.paymentType.slice(1)}</p>
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3">Payment History</h3>
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 font-medium">Payment Type</th>
                        <th className="py-2 font-medium">Date</th>
                        <th className="py-2 font-medium text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Deposit as the first entry */}
                      <tr className="border-b">
                        <td className="py-2"><strong>Deposit</strong></td>
                        <td className="py-2">N/A</td>
                        <td className="py-2 text-right">{currencyFormatter.format(selectedRecord.amount)}</td>
                      </tr>
                      {/* Payments */}
                      {selectedRecord.payments.map((payment, index) => (
                        <tr key={index} className="border-b">
                          <td className="py-2">{payment.paymentType.charAt(0).toUpperCase() + payment.paymentType.slice(1)}</td>
                          <td className="py-2">{format(new Date(payment.date), 'dd MMM yyyy')}</td>
                          <td className="py-2 text-right">{currencyFormatter.format(payment.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3">Services Rendered</h3>
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 font-medium">Service</th>
                        <th className="py-2 font-medium">Date</th>
                        <th className="py-2 font-medium text-right">Amount</th>
                        <th className="py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRecord.services.map((service, index) => (
                        <tr key={index} className="border-b">
                          <td className="py-2">{service.serviceName}</td>
                          <td className="py-2">{service.createdAt ? format(new Date(service.createdAt), 'dd MMM yyyy') : 'N/A'}</td>
                          <td className="py-2 text-right">{currencyFormatter.format(service.amount)}</td>
                          <td className="py-2 capitalize">
                            {service.status === 'completed' ? (
                              <span className="text-green-600 font-semibold">Completed</span>
                            ) : (
                              <span className="text-yellow-600 font-semibold">Pending</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Summary Section */}
                <div className="mb-6">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Total Services Amount:</span>
                    <span className="font-semibold">{currencyFormatter.format(totalServicesAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Total Deposit:</span>
                    <span className="font-semibold">{currencyFormatter.format(selectedRecord.amount)}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Total Payments:</span>
                    <span className="font-semibold text-red-600">{currencyFormatter.format(totalPaid)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Outstanding Amount:</span>
                    <span className="font-semibold text-red-600">
                      {currencyFormatter.format(outstandingAmount)}
                    </span>
                  </div>
                </div>

                {/* Notes Section */}
                <div className="text-sm text-gray-600">
                  <p>This is a computer-generated invoice and does not require a signature.</p>
                  <p>Thank you for choosing {hospitalInfo.name}. We wish you a speedy recovery and continued good health.</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Payment History Modal */}
      <Transition appear show={isPaymentHistoryOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setIsPaymentHistoryOpen(false)}>
          <Transition.Child
            as={Fragment}
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
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="bg-white rounded-xl shadow-lg p-6 max-w-lg w-full">
                <div className="flex justify-between items-center mb-4">
                  <Dialog.Title className="text-xl font-bold text-gray-800">Payment History</Dialog.Title>
                  <button onClick={() => setIsPaymentHistoryOpen(false)} className="text-gray-500 hover:text-gray-700">
                    <X size={20} />
                  </button>
                </div>
                {selectedRecord && selectedRecord.payments.length > 0 ? (
                  <div className="overflow-x-auto max-h-80">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-4 py-2 text-left">#</th>
                          <th className="px-4 py-2 text-left">Payment Type</th>
                          <th className="px-4 py-2 text-left">Date</th>
                          <th className="px-4 py-2 text-left">Amount (Rs)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Deposit as the first entry */}
                        <tr className="border-t">
                          <td className="px-4 py-2">1</td>
                          <td className="px-4 py-2">Deposit</td>
                          <td className="px-4 py-2">N/A</td>
                          <td className="px-4 py-2">{currencyFormatter.format(selectedRecord.amount)}</td>
                        </tr>
                        {/* Payments */}
                        {selectedRecord.payments.map((payment, index) => (
                          <tr key={index + 2} className="border-t">
                            <td className="px-4 py-2">{index + 2}</td>
                            <td className="px-4 py-2 capitalize">{payment.paymentType}</td>
                            <td className="px-4 py-2">{new Date(payment.date).toLocaleString()}</td>
                            <td className="px-4 py-2">{currencyFormatter.format(payment.amount)}</td>
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
}

export default AdminIPDPage
