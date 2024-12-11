'use client'

import React, { useEffect, useState, useRef } from 'react'
import { db } from '@/lib/firebase'
import { ref, onValue, update } from 'firebase/database'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { useForm, SubmitHandler } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Plus, CheckCircle, ArrowLeft, AlertTriangle, Download, Phone, Mail, MapPin } from 'lucide-react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { format } from 'date-fns'

interface Service {
  serviceName: string
  amount: number
  status: 'pending' | 'completed'
  createdAt?: string
}

interface BillingRecord {
  id: string
  name: string
  mobileNumber: string
  amount: number // Deposit amount
  totalPaid: number // Deposit amount minus completed services
  paymentType: string
  roomType?: string
  bed?: string
  services: Service[]
  dischargeDate?: string
}

interface AdditionalServiceForm {
  serviceName: string
  amount: number
}

const serviceSchema = yup.object({
  serviceName: yup.string().required('Service Name is required'),
  amount: yup.number().typeError('Amount must be a number').positive('Must be positive').required('Amount is required'),
}).required()

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2
})

export default function IPDBillingPage() {
  const [allRecords, setAllRecords] = useState<BillingRecord[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filteredRecords, setFilteredRecords] = useState<BillingRecord[]>([])
  const [selectedRecord, setSelectedRecord] = useState<BillingRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [logoBase64, setLogoBase64] = useState<string | null>(null)
  
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

  useEffect(() => {
    const logoUrl = '/img/logo.png' // Path to your logo in the public folder
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
            ? rec.services.filter((s: Service) => s.status === 'completed').reduce((sum: number, s: Service) => sum + s.amount, 0)
            : 0
          return {
            id: key,
            name: rec.name,
            mobileNumber: rec.mobileNumber || '',
            amount: rec.amount || 0, 
            totalPaid: rec.amount ? rec.amount - completedServicesAmount : 0,
            paymentType: rec.paymentType || 'deposit',
            roomType: rec.roomType,
            bed: rec.bed,
            services: rec.services ? rec.services as Service[] : [],
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
      rec.id.toLowerCase().includes(term) ||
      rec.name.toLowerCase().includes(term) ||
      rec.mobileNumber.toLowerCase().includes(term)
    )
    setFilteredRecords(results)
    setSelectedRecord(null)
  }

  const handleSelectRecord = (record: BillingRecord) => {
    setSelectedRecord(record)
    reset({ serviceName: '', amount: 0 })
  }

  const calculateTotalServicesAmount = (services: Service[]) => {
    return services.reduce((sum, s) => sum + s.amount, 0)
  }

  const calculateCompletedServicesAmount = (services: Service[]) => {
    return services.filter(s => s.status === 'completed').reduce((sum, s) => sum + s.amount, 0)
  }

  const calculateTotalPaid = (deposit: number, completedServicesAmount: number) => {
    return Math.max(deposit - completedServicesAmount, 0)
  }

  const totalServicesAmount = selectedRecord ? calculateTotalServicesAmount(selectedRecord.services) : 0
  const completedServicesAmount = selectedRecord ? calculateCompletedServicesAmount(selectedRecord.services) : 0
  const totalPaid = selectedRecord ? calculateTotalPaid(selectedRecord.amount, completedServicesAmount) : 0
  const totalBill = totalServicesAmount
  const outstanding = totalBill - totalPaid

  const pendingServicesAmount = selectedRecord ? selectedRecord.services.filter(s => s.status === 'pending').reduce((sum, s) => sum + s.amount, 0) : 0
  const completedServicesTotalAmount = selectedRecord ? selectedRecord.services.filter(s => s.status === 'completed').reduce((sum, s) => sum + s.amount, 0) : 0

  const onSubmitAdditionalService: SubmitHandler<AdditionalServiceForm> = async (data) => {
    if (!selectedRecord) return
    setLoading(true)
    try {
      const recordRef = ref(db, `ipd_bookings/${selectedRecord.id}`)
      const recordSnap = await new Promise<any>((resolve) => {
        onValue(recordRef, (snap) => {
          resolve(snap.val())
        }, { onlyOnce: true })
      })
      const currentServices: Service[] = recordSnap.services || []
      const newService: Service = {
        serviceName: data.serviceName,
        amount: data.amount,
        status: 'pending',
        createdAt: new Date().toISOString(),
      }
      const updatedServices = [...currentServices, newService]

      await update(recordRef, {
        services: updatedServices,
        totalPaid: selectedRecord.amount - calculateCompletedServicesAmount(updatedServices),
      })

      toast.success('Additional service added successfully!', {
        position: 'top-right',
        autoClose: 5000,
      })

      const updatedRecord: BillingRecord = {
        ...selectedRecord,
        services: updatedServices,
        totalPaid: calculateTotalPaid(selectedRecord.amount, calculateCompletedServicesAmount(updatedServices)),
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

  const handleMarkServiceCompleted = async (index: number) => {
    if (!selectedRecord) return
    setLoading(true)
    try {
      const recordRef = ref(db, `ipd_bookings/${selectedRecord.id}`)
      const recordSnap = await new Promise<any>((resolve) => {
        onValue(recordRef, (snap) => {
          resolve(snap.val())
        }, { onlyOnce: true })
      })

      const currentServices: Service[] = recordSnap.services || []
      if (!currentServices[index] || currentServices[index].status === 'completed') {
        setLoading(false)
        return
      }

      currentServices[index].status = 'completed'
      const updatedTotalPaid = calculateTotalPaid(recordSnap.amount || 0, calculateCompletedServicesAmount(currentServices))

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

  const hospitalInfo = {
    logoBase64: logoBase64 || '',
    name: 'Your Hospital Name',
    address: '1234 Health St, Wellness City, Country',
    email: 'info@yourhospital.com',
    contactNumber: '+1 (234) 567-8900',
  }

  const InvoiceContent = () => (
    <div className="max-w-4xl mx-auto bg-white text-gray-800 font-sans p-8">
      <div className="flex items-start justify-between mb-8">
        {/* Left: Logo */}
        {hospitalInfo.logoBase64 && (
          <div className="flex-shrink-0 mr-4">
            <img src={hospitalInfo.logoBase64} alt="Hospital Logo" className="w-16 h-16" />
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
            <h3 className="text-lg font-semibold mb-3">Itemized Charges</h3>
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
          </div>

          <div className="mb-6">
            <div className="flex justify-between text-sm mb-1">
              <span>Total Charges:</span>
              <span className="font-semibold">{currencyFormatter.format(totalServicesAmount)}</span>
            </div>
            <div className="flex justify-between text-sm mb-1">
              <span>Deposit Amount:</span>
              <span className="font-semibold">{currencyFormatter.format(selectedRecord.amount)}</span>
            </div>
            <div className="flex justify-between text-sm mb-1">
              <span>Total Paid:</span>
              <span className="font-semibold">{currencyFormatter.format(totalPaid)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold mt-4">
              <span>Outstanding Amount:</span>
              <span className="text-red-600">{currencyFormatter.format(outstanding)}</span>
            </div>
          </div>

          <div className="text-sm text-gray-600">
            <p>This is a computer-generated invoice and does not require a signature.</p>
            <p>Thank you for choosing {hospitalInfo.name}. We wish you a speedy recovery and continued good health.</p>
          </div>
        </>
      )}
    </div>
  )

  const handleDownloadInvoice = async () => {
    if (!selectedRecord) return
    if (!invoiceRef.current) return

    // Give the DOM time to render the invoice content fully
    await new Promise(resolve => setTimeout(resolve, 100))

    html2canvas(invoiceRef.current, { scale: 3, useCORS: true })
      .then(canvas => {
        const imgData = canvas.toDataURL('image/png')
        const pdf = new jsPDF('p', 'pt', 'a4')
        const pdfWidth = pdf.internal.pageSize.getWidth()
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, '', 'FAST')
        pdf.save(`Invoice_${selectedRecord.name}_${selectedRecord.id}.pdf`)
      })
      .catch(err => {
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
    img.onerror = (err) => {
      console.error('Error loading logo image:', err)
      callback('')
    }
    img.src = imgUrl
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <ToastContainer />
      <div className="max-w-7xl mx-auto bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-8">
          <h1 className="text-4xl font-bold text-indigo-800 mb-8 text-center">IPD Billing Management</h1>

          {/* Search Section */}
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

          <AnimatePresence mode="wait">
            {!selectedRecord ? (
              <motion.div
                key="search-results"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                {filteredRecords.length === 0 ? (
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
                        {filteredRecords.map(rec => (
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
                            <td className="border-t px-4 py-2">{rec.dischargeDate ? new Date(rec.dischargeDate).toLocaleDateString() : 'N/A'}</td>
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
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="mb-6 flex items-center text-indigo-600 hover:text-indigo-800 transition duration-300"
                >
                  <ArrowLeft size={20} className="mr-2" />
                  Back to Results
                </button>

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
                      <p><strong>Completed Services Amount:</strong> Rs. {completedServicesAmount.toLocaleString()}</p>
                      <p><strong>Total Paid (Deposit - Completed Services):</strong> Rs. {totalPaid.toLocaleString()}</p>
                      <p><strong>Total Services Amount:</strong> Rs. {totalServicesAmount.toLocaleString()}</p>
                      <p><strong>Outstanding:</strong> Rs. {outstanding > 0 ? outstanding.toLocaleString() : '0'}</p>
                      <p><strong>Discharge Date:</strong> {selectedRecord.dischargeDate ? new Date(selectedRecord.dischargeDate).toLocaleDateString() : 'N/A'}</p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between mb-6">
                  <div className="bg-green-100 rounded-lg p-4">
                    <p className="text-green-800"><strong>Pending Services Amount:</strong> Rs. {pendingServicesAmount.toLocaleString()}</p>
                  </div>
                  <div className="bg-blue-100 rounded-lg p-4">
                    <p className="text-blue-800"><strong>Completed Services Amount:</strong> Rs. {completedServicesTotalAmount.toLocaleString()}</p>
                  </div>
                </div>

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
                            <th className="px-4 py-2 text-left">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedRecord.services.map((srv, index) => (
                            <tr key={index} className="border-t">
                              <td className="px-4 py-2">{srv.serviceName}</td>
                              <td className="px-4 py-2">Rs. {srv.amount.toLocaleString()}</td>
                              <td className="px-4 py-2">{srv.createdAt ? new Date(srv.createdAt).toLocaleString() : 'N/A'}</td>
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

                {selectedRecord.dischargeDate && (
                  <div className="flex justify-center mb-8">
                    <button
                      onClick={handleDownloadInvoice}
                      className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition duration-300 flex items-center"
                    >
                      <Download size={20} className="mr-2" /> Download Invoice
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {selectedRecord && selectedRecord.dischargeDate && (
        <div ref={invoiceRef} style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <InvoiceContent />
        </div>
      )}
    </div>
  )
}
