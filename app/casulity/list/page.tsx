"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { db } from "../../../lib/firebase"
import { ref, onValue, remove, update, push, set } from "firebase/database"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import {
  Info,
  Trash2,
  ArrowLeftIcon,
  MicroscopeIcon as MagnifyingGlassIcon,
  Plus,
  CreditCard,
  Banknote,
  ArrowLeft,
  Download,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowRightIcon } from "@radix-ui/react-icons"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { format } from "date-fns"
import { jsPDF } from "jspdf"
import html2canvas from "html2canvas"
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage"

interface CasualtyRecord {
  id: string
  patientId: string
  name: string
  phone: string
  age: number
  gender: string
  dob?: string
  date: string
  time: string
  modeOfArrival: string
  broughtBy?: string
  referralHospital?: string
  broughtDead: boolean
  caseType: string
  otherCaseType?: string
  incidentDescription?: string
  isMLC: boolean
  mlcNumber?: string
  policeInformed: boolean
  attendingDoctor?: string
  triageCategory: string
  vitalSigns?: {
    bloodPressure?: string
    pulse?: string
    temperature?: string
    oxygenSaturation?: string
    respiratoryRate?: string
    gcs?: number
  }
  createdAt: string
  status: "active" | "discharged" | "transferred" | "deceased"
  payments?: Record<string, Payment>
  services?: Record<string, Service>
  discount?: number
}

interface Payment {
  id: string
  amount: number
  method: "cash" | "online"
  createdAt: string
}

interface Service {
  id: string
  name: string
  amount: number
}

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

export default function CasualtyListPage() {
  const router = useRouter()
  const invoiceRef = useRef<HTMLDivElement>(null)

  // State
  const [casualtyRecords, setCasualtyRecords] = useState<CasualtyRecord[]>([])
  const [filteredCasualtyRecords, setFilteredCasualtyRecords] = useState<CasualtyRecord[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [isLoading, setIsLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const recordsPerPage = 10

  // View state
  const [viewMode, setViewMode] = useState<"list" | "detail">("list")
  const [selectedCasualty, setSelectedCasualty] = useState<CasualtyRecord | null>(null)
  const [activeTab, setActiveTab] = useState("details")

  // Payment form
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "online">("cash")

  // Service form
  const [serviceName, setServiceName] = useState("")
  const [serviceAmount, setServiceAmount] = useState("")

  // Discount form
  const [discountAmount, setDiscountAmount] = useState("")

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [casualtyToDelete, setCasualtyToDelete] = useState<{ patientId: string; id: string } | null>(null)

  // 1) Fetch all patients → collect their casualty children
  useEffect(() => {
    setIsLoading(true)
    const patientsRef = ref(db, "patients")
    const unsubscribe = onValue(patientsRef, (snapshot) => {
      const patients = snapshot.val() || {}
      const allRecords: CasualtyRecord[] = []

      Object.entries(patients).forEach(([patientId, patientData]: any) => {
        const casualtyNode = patientData.casualty || {}
        Object.entries(casualtyNode).forEach(([casId, casData]: any) => {
          allRecords.push({
            id: casId,
            patientId,
            name: casData.name,
            phone: casData.phone,
            age: casData.age,
            gender: casData.gender,
            dob: casData.dob,
            date: casData.date,
            time: casData.time,
            modeOfArrival: casData.modeOfArrival,
            broughtBy: casData.broughtBy,
            referralHospital: casData.referralHospital,
            broughtDead: casData.broughtDead,
            caseType: casData.caseType,
            otherCaseType: casData.otherCaseType,
            incidentDescription: casData.incidentDescription,
            isMLC: casData.isMLC,
            mlcNumber: casData.mlcNumber,
            policeInformed: casData.policeInformed,
            attendingDoctor: casData.attendingDoctor,
            triageCategory: casData.triageCategory,
            vitalSigns: casData.vitalSigns,
            createdAt: casData.createdAt,
            status: casData.status,
            payments: casData.payments || {},
            services: casData.services || {},
            discount: casData.discount || 0,
          })
        })
      })

      // Sort by createdAt descending
      allRecords.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      setCasualtyRecords(allRecords)
      setFilteredCasualtyRecords(allRecords)
      setIsLoading(false)
    })
    return () => unsubscribe()
  }, [])

  // 2) Filter + search
  useEffect(() => {
    let filtered = [...casualtyRecords]
    if (statusFilter !== "all") {
      filtered = filtered.filter((r) => r.status === statusFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(q) || r.phone.includes(q) || (r.mlcNumber?.toLowerCase().includes(q) ?? false),
      )
    }
    setFilteredCasualtyRecords(filtered)
    setCurrentPage(1)
  }, [searchQuery, statusFilter, casualtyRecords])

  // 3) Delete
  const handleDeleteCasualty = async () => {
    if (!casualtyToDelete) return
    const { patientId, id } = casualtyToDelete
    try {
      // remove under patient only
      await remove(ref(db, `patients/${patientId}/casualty/${id}`))
      toast.success("Casualty record deleted")
    } catch {
      toast.error("Delete failed")
    } finally {
      setDeleteDialogOpen(false)
      setCasualtyToDelete(null)
    }
  }

  // 4) Status update
  const handleUpdateStatus = async (rec: CasualtyRecord, newStatus: CasualtyRecord["status"]) => {
    try {
      await update(ref(db, `patients/${rec.patientId}/casualty/${rec.id}`), { status: newStatus })
      toast.success(`Status → ${newStatus}`)

      // Update local state
      if (selectedCasualty && selectedCasualty.id === rec.id) {
        setSelectedCasualty({ ...selectedCasualty, status: newStatus })
      }
    } catch {
      toast.error("Update failed")
    }
  }

  // 5) View
  const handleViewDetails = (rec: CasualtyRecord) => {
    setSelectedCasualty(rec)
    setViewMode("detail")
    setActiveTab("details")
  }

  // 6) Back to list
  const handleBackToList = () => {
    setViewMode("list")
    setSelectedCasualty(null)
  }

  // 7) Add payment
  const handleAddPayment = async () => {
    if (!selectedCasualty) return
    if (!paymentAmount || isNaN(Number(paymentAmount)) || Number(paymentAmount) <= 0) {
      toast.error("Please enter a valid amount")
      return
    }

    const timestamp = new Date().toISOString()
    const newPayment: Payment = {
      id: "", // Will be set by Firebase
      amount: Number(paymentAmount),
      method: paymentMethod,
      createdAt: timestamp,
    }

    try {
      const paymentRef = push(
        ref(db, `patients/${selectedCasualty.patientId}/casualty/${selectedCasualty.id}/payments`),
      )
      newPayment.id = paymentRef.key || ""
      await set(paymentRef, newPayment)

      // Update local state
      const updatedCasualty = { ...selectedCasualty }
      if (!updatedCasualty.payments) updatedCasualty.payments = {}
      updatedCasualty.payments[newPayment.id] = newPayment
      setSelectedCasualty(updatedCasualty)

      // Reset form
      setPaymentAmount("")
      toast.success("Payment added successfully")
    } catch (error) {
      toast.error("Failed to add payment")
      console.error(error)
    }
  }

  // 8) Add service
  const handleAddService = async () => {
    if (!selectedCasualty) return
    if (!serviceName.trim()) {
      toast.error("Please enter a service name")
      return
    }
    if (!serviceAmount || isNaN(Number(serviceAmount)) || Number(serviceAmount) <= 0) {
      toast.error("Please enter a valid amount")
      return
    }

    const newService: Service = {
      id: "", // Will be set by Firebase
      name: serviceName.trim(),
      amount: Number(serviceAmount),
    }

    try {
      const serviceRef = push(
        ref(db, `patients/${selectedCasualty.patientId}/casualty/${selectedCasualty.id}/services`),
      )
      newService.id = serviceRef.key || ""
      await set(serviceRef, newService)

      // Update local state
      const updatedCasualty = { ...selectedCasualty }
      if (!updatedCasualty.services) updatedCasualty.services = {}
      updatedCasualty.services[newService.id] = newService
      setSelectedCasualty(updatedCasualty)

      // Reset form
      setServiceName("")
      setServiceAmount("")
      toast.success("Service added successfully")
    } catch (error) {
      toast.error("Failed to add service")
      console.error(error)
    }
  }

  // 9) Add discount
  const handleAddDiscount = async () => {
    if (!selectedCasualty) return
    if (!discountAmount || isNaN(Number(discountAmount)) || Number(discountAmount) < 0) {
      toast.error("Please enter a valid discount amount")
      return
    }

    try {
      await update(ref(db, `patients/${selectedCasualty.patientId}/casualty/${selectedCasualty.id}`), {
        discount: Number(discountAmount),
      })

      // Update local state
      const updatedCasualty = { ...selectedCasualty, discount: Number(discountAmount) }
      setSelectedCasualty(updatedCasualty)

      // Reset form
      setDiscountAmount("")
      toast.success("Discount added successfully")
    } catch (error) {
      toast.error("Failed to add discount")
      console.error(error)
    }
  }

  // Helper function to format date for display
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "PPp")
    } catch (e) {
      return dateString
    }
  }

  // Helper function to convert a number to words for invoice
  function convertNumberToWords(num: number): string {
    const a = [
      "",
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven",
      "Eight",
      "Nine",
      "Ten",
      "Eleven",
      "Twelve",
      "Thirteen",
      "Fourteen",
      "Fifteen",
      "Sixteen",
      "Seventeen",
      "Eighteen",
      "Nineteen",
    ]
    const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
    if ((num = Math.floor(num)) === 0) return "Zero"
    if (num < 20) return a[num]
    if (num < 100) return b[Math.floor(num / 10)] + (num % 10 ? " " + a[num % 10] : "")
    if (num < 1000)
      return a[Math.floor(num / 100)] + " Hundred" + (num % 100 ? " " + convertNumberToWords(num % 100) : "")
    if (num < 1000000)
      return (
        convertNumberToWords(Math.floor(num / 1000)) +
        " Thousand" +
        (num % 1000 ? " " + convertNumberToWords(num % 1000) : "")
      )
    if (num < 1000000000)
      return (
        convertNumberToWords(Math.floor(num / 1000000)) +
        " Million" +
        (num % 1000000 ? " " + convertNumberToWords(num % 1000000) : "")
      )
    return (
      convertNumberToWords(Math.floor(num / 1000000000)) +
      " Billion" +
      (num % 1000000000 ? " " + convertNumberToWords(num % 1000000000) : "")
    )
  }

  // Generate PDF for invoice
  const generatePDF = async (): Promise<jsPDF> => {
    if (!invoiceRef.current) throw new Error("Invoice element not found.")
    await new Promise((resolve) => setTimeout(resolve, 100))
    const canvas = await html2canvas(invoiceRef.current, {
      scale: 3,
      useCORS: true,
      backgroundColor: null,
    })

    const pdf = new jsPDF({
      orientation: "p",
      unit: "pt",
      format: "a4",
    })

    const pdfWidth = 595
    const pdfHeight = 842
    const topMargin = 120
    const bottomMargin = 80
    const sideMargin = 20
    const contentHeight = pdfHeight - topMargin - bottomMargin
    const scaleRatio = pdfWidth / canvas.width
    const fullContentHeightPts = canvas.height * scaleRatio

    let currentPos = 0
    let pageCount = 0
    while (currentPos < fullContentHeightPts) {
      pageCount += 1
      if (pageCount > 1) pdf.addPage()

      // Add letterhead as background on each page
      pdf.addImage("/letterhead.png", "PNG", 0, 0, pdfWidth, pdfHeight, undefined, "FAST")

      const sourceY = Math.floor(currentPos / scaleRatio)
      const sourceHeight = Math.floor(contentHeight / scaleRatio)
      const pageCanvas = document.createElement("canvas")
      pageCanvas.width = canvas.width
      pageCanvas.height = sourceHeight
      const pageCtx = pageCanvas.getContext("2d")
      if (pageCtx) {
        pageCtx.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, canvas.width, sourceHeight)
      }
      const chunkImgData = pageCanvas.toDataURL("image/png")
      const chunkHeightPts = sourceHeight * scaleRatio
      pdf.addImage(chunkImgData, "PNG", sideMargin, topMargin, pdfWidth - 2 * sideMargin, chunkHeightPts, "", "FAST")
      currentPos += contentHeight
    }
    return pdf
  }

  // Download invoice
  const handleDownloadInvoice = async () => {
    if (!selectedCasualty) return
    try {
      const pdf = await generatePDF()
      const fileName = `Invoice_${selectedCasualty.name}_${selectedCasualty.id}.pdf`
      pdf.save(fileName)
      toast.success("Invoice downloaded successfully")
    } catch (error) {
      console.error(error)
      toast.error("Failed to generate the invoice PDF")
    }
  }

  // Send invoice via WhatsApp
  const handleSendPdfOnWhatsapp = async () => {
    if (!selectedCasualty) return
    try {
      const pdf = await generatePDF()
      const pdfBlob = pdf.output("blob")
      if (!pdfBlob) throw new Error("Failed to generate PDF blob.")
      const storage = getStorage()
      const storagePath = `invoices/invoice-${selectedCasualty.id}-${Date.now()}.pdf`
      const fileRef = storageRef(storage, storagePath)
      await uploadBytes(fileRef, pdfBlob)
      const downloadUrl = await getDownloadURL(fileRef)
      const formattedNumber = selectedCasualty.phone.startsWith("91")
        ? selectedCasualty.phone
        : `91${selectedCasualty.phone}`
      const payload = {
        token: "99583991572", // This should be your WhatsApp API token
        number: formattedNumber,
        imageUrl: downloadUrl,
        caption:
          "Dear Patient, please find attached your invoice PDF for your recent visit. Thank you for choosing our services.",
      }
      const response = await fetch("https://wa.medblisss.com/send-image-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        throw new Error("Failed to send the invoice on WhatsApp.")
      }
      toast.success("Invoice PDF sent successfully on WhatsApp!")
    } catch (error) {
      console.error(error)
      toast.error("An error occurred while sending the invoice PDF on WhatsApp.")
    }
  }

  // Pagination chunk
  const indexOfLast = currentPage * recordsPerPage
  const indexOfFirst = indexOfLast - recordsPerPage
  const current = filteredCasualtyRecords.slice(indexOfFirst, indexOfLast)
  const totalPages = Math.ceil(filteredCasualtyRecords.length / recordsPerPage)
  const paginate = (n: number) => setCurrentPage(n)

  return (
    <>
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-4 py-8">
          {viewMode === "list" ? (
            <Card className="w-full max-w-6xl mx-auto shadow-lg">
              <CardHeader className="bg-gradient-to-r from-red-500 to-orange-600 text-white rounded-t-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-2xl md:text-3xl font-bold">Casualty Records</CardTitle>
                    <CardDescription className="text-red-100">Manage and view all casualty cases</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push("/casualty/form")}
                      className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                    >
                      Register New Casualty
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
                {/* Search & Filters */}
                <div className="flex flex-col md:flex-row justify-between mb-4 gap-4">
                  <div className="relative flex-1">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                      placeholder="Search..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Cases</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="discharged">Discharged</SelectItem>
                      <SelectItem value="transferred">Transferred</SelectItem>
                      <SelectItem value="deceased">Deceased</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Table / Loading / Empty */}
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 mb-2 rounded" />)
                ) : filteredCasualtyRecords.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No records found</div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Patient</TableHead>
                            <TableHead>Date & Time</TableHead>
                            <TableHead>Case Type</TableHead>
                            <TableHead>Triage</TableHead>
                            <TableHead>MLC</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {current.map((rec) => (
                            <TableRow key={rec.id}>
                              <TableCell className="font-medium">{rec.name}</TableCell>
                              <TableCell>
                                {new Date(rec.date).toLocaleDateString()} {rec.time}
                              </TableCell>
                              <TableCell>
                                {rec.caseType === "other"
                                  ? rec.otherCaseType
                                  : CaseTypeOptions.find((c) => c.value === rec.caseType)?.label}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  className={
                                    rec.triageCategory === "red"
                                      ? "bg-red-500"
                                      : rec.triageCategory === "yellow"
                                        ? "bg-yellow-500 text-black"
                                        : rec.triageCategory === "green"
                                          ? "bg-green-500"
                                          : "bg-gray-500"
                                  }
                                >
                                  {TriageCategoryOptions.find((t) => t.value === rec.triageCategory)?.label}
                                </Badge>
                              </TableCell>
                              <TableCell>{rec.isMLC ? `Yes (${rec.mlcNumber})` : "No"}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    rec.status === "active"
                                      ? "default"
                                      : rec.status === "discharged"
                                        ? "outline"
                                        : rec.status === "transferred"
                                          ? "secondary"
                                          : "destructive"
                                  }
                                >
                                  {rec.status.charAt(0).toUpperCase() + rec.status.slice(1)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button variant="ghost" size="sm" onClick={() => handleViewDetails(rec)}>
                                    <Info className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setCasualtyToDelete({ patientId: rec.patientId, id: rec.id })
                                      setDeleteDialogOpen(true)
                                    }}
                                    className="text-red-500 hover:text-red-700"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex justify-center mt-4 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => paginate(Math.max(1, currentPage - 1))}
                          disabled={currentPage === 1}
                        >
                          <ArrowLeftIcon className="h-4 w-4" />
                        </Button>
                        <span className="self-center">
                          Page {currentPage} of {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => paginate(Math.min(totalPages, currentPage + 1))}
                          disabled={currentPage === totalPages}
                        >
                          <ArrowRightIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          ) : selectedCasualty ? (
            <Card className="w-full max-w-6xl mx-auto shadow-lg">
              <CardHeader className="bg-gradient-to-r from-red-500 to-orange-600 text-white">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleBackToList}
                        className="text-white hover:bg-white/20"
                      >
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        Back
                      </Button>
                      <CardTitle className="text-2xl md:text-3xl font-bold">Patient: {selectedCasualty.name}</CardTitle>
                    </div>
                    <CardDescription className="text-red-100">
                      Case ID: {selectedCasualty.id} | UHID: {selectedCasualty.patientId}
                    </CardDescription>
                  </div>
                  <Badge
                    className={
                      selectedCasualty.status === "active"
                        ? "bg-blue-500"
                        : selectedCasualty.status === "discharged"
                          ? "bg-green-500"
                          : selectedCasualty.status === "transferred"
                            ? "bg-yellow-500 text-black"
                            : "bg-gray-700"
                    }
                  >
                    {selectedCasualty.status.charAt(0).toUpperCase() + selectedCasualty.status.slice(1)}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-6">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="mb-4 grid grid-cols-4 gap-2 bg-muted/20 p-1 rounded-lg">
                    <TabsTrigger
                      value="details"
                      className="rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm"
                    >
                      Patient Details
                    </TabsTrigger>
                    <TabsTrigger
                      value="payments"
                      className="rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm"
                    >
                      Payments
                    </TabsTrigger>
                    <TabsTrigger
                      value="services"
                      className="rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm"
                    >
                      Services
                    </TabsTrigger>
                    <TabsTrigger
                      value="invoice"
                      className="rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm"
                    >
                      Invoice
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="details" className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Card>
                        <CardHeader>
                          <CardTitle>Personal Information</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-sm font-medium text-gray-500">Name</p>
                              <p>{selectedCasualty.name}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-500">Phone</p>
                              <p>{selectedCasualty.phone}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-500">Age</p>
                              <p>{selectedCasualty.age} years</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-500">Gender</p>
                              <p>{selectedCasualty.gender}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-500">Date of Birth</p>
                              <p>
                                {selectedCasualty.dob ? new Date(selectedCasualty.dob).toLocaleDateString() : "N/A"}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>Case Information</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-sm font-medium text-gray-500">Date & Time</p>
                              <p>
                                {new Date(selectedCasualty.date).toLocaleDateString()} {selectedCasualty.time}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-500">Case Type</p>
                              <p>
                                {selectedCasualty.caseType === "other"
                                  ? selectedCasualty.otherCaseType
                                  : CaseTypeOptions.find((c) => c.value === selectedCasualty.caseType)?.label}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-500">Triage Category</p>
                              <Badge
                                className={
                                  selectedCasualty.triageCategory === "red"
                                    ? "bg-red-500"
                                    : selectedCasualty.triageCategory === "yellow"
                                      ? "bg-yellow-500 text-black"
                                      : selectedCasualty.triageCategory === "green"
                                        ? "bg-green-500"
                                        : "bg-gray-500"
                                }
                              >
                                {TriageCategoryOptions.find((t) => t.value === selectedCasualty.triageCategory)?.label}
                              </Badge>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-500">MLC Case</p>
                              <p>{selectedCasualty.isMLC ? `Yes (${selectedCasualty.mlcNumber})` : "No"}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-500">Police Informed</p>
                              <p>{selectedCasualty.policeInformed ? "Yes" : "No"}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-500">Brought Dead</p>
                              <p>{selectedCasualty.broughtDead ? "Yes" : "No"}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>Arrival Information</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-sm font-medium text-gray-500">Mode of Arrival</p>
                              <p>{selectedCasualty.modeOfArrival}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-500">Brought By</p>
                              <p>{selectedCasualty.broughtBy || "N/A"}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-500">Referral Hospital</p>
                              <p>{selectedCasualty.referralHospital || "N/A"}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-500">Attending Doctor</p>
                              <p>{selectedCasualty.attendingDoctor || "N/A"}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>Vital Signs</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-sm font-medium text-gray-500">Blood Pressure</p>
                              <p>{selectedCasualty.vitalSigns?.bloodPressure || "N/A"}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-500">Pulse</p>
                              <p>{selectedCasualty.vitalSigns?.pulse || "N/A"}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-500">Temperature</p>
                              <p>{selectedCasualty.vitalSigns?.temperature || "N/A"}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-500">Oxygen Saturation</p>
                              <p>{selectedCasualty.vitalSigns?.oxygenSaturation || "N/A"}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-500">Respiratory Rate</p>
                              <p>{selectedCasualty.vitalSigns?.respiratoryRate || "N/A"}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-500">GCS</p>
                              <p>{selectedCasualty.vitalSigns?.gcs || "N/A"}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {selectedCasualty.incidentDescription && (
                        <Card className="md:col-span-2">
                          <CardHeader>
                            <CardTitle>Incident Description</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p>{selectedCasualty.incidentDescription}</p>
                          </CardContent>
                        </Card>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 mt-4">
                      <Select
                        defaultValue={selectedCasualty.status}
                        onValueChange={(value) =>
                          handleUpdateStatus(selectedCasualty, value as CasualtyRecord["status"])
                        }
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Update Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="discharged">Discharged</SelectItem>
                          <SelectItem value="transferred">Transferred</SelectItem>
                          <SelectItem value="deceased">Deceased</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TabsContent>

                  <TabsContent value="payments" className="space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Add Payment</CardTitle>
                        <CardDescription>Record a new payment for this patient</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="amount">Amount</Label>
                            <Input
                              id="amount"
                              type="number"
                              placeholder="Enter amount"
                              value={paymentAmount}
                              onChange={(e) => setPaymentAmount(e.target.value)}
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label>Payment Method</Label>
                            <RadioGroup
                              value={paymentMethod}
                              onValueChange={(value) => setPaymentMethod(value as "cash" | "online")}
                              className="flex gap-4"
                            >
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="cash" id="cash" />
                                <Label htmlFor="cash" className="flex items-center gap-1">
                                  <Banknote className="h-4 w-4" /> Cash
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="online" id="online" />
                                <Label htmlFor="online" className="flex items-center gap-1">
                                  <CreditCard className="h-4 w-4" /> Online
                                </Label>
                              </div>
                            </RadioGroup>
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter>
                        <Button onClick={handleAddPayment} className="ml-auto">
                          <Plus className="h-4 w-4 mr-2" /> Add Payment
                        </Button>
                      </CardFooter>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Payment History</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {selectedCasualty.payments && Object.keys(selectedCasualty.payments).length > 0 ? (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Date & Time</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Method</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {Object.values(selectedCasualty.payments)
                                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                .map((payment) => (
                                  <TableRow key={payment.id}>
                                    <TableCell>{formatDate(payment.createdAt)}</TableCell>
                                    <TableCell>₹{payment.amount.toFixed(2)}</TableCell>
                                    <TableCell className="capitalize">
                                      {payment.method === "cash" ? (
                                        <span className="flex items-center gap-1">
                                          <Banknote className="h-4 w-4" /> Cash
                                        </span>
                                      ) : (
                                        <span className="flex items-center gap-1">
                                          <CreditCard className="h-4 w-4" /> Online
                                        </span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                        ) : (
                          <div className="text-center py-8 text-gray-500">No payment records found</div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="services" className="space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Add Service</CardTitle>
                        <CardDescription>Record a new service provided to this patient</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="serviceName">Service Name</Label>
                            <Input
                              id="serviceName"
                              placeholder="Enter service name"
                              value={serviceName}
                              onChange={(e) => setServiceName(e.target.value)}
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="serviceAmount">Amount</Label>
                            <Input
                              id="serviceAmount"
                              type="number"
                              placeholder="Enter amount"
                              value={serviceAmount}
                              onChange={(e) => setServiceAmount(e.target.value)}
                            />
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter>
                        <Button onClick={handleAddService} className="ml-auto">
                          <Plus className="h-4 w-4 mr-2" /> Add Service
                        </Button>
                      </CardFooter>
                    </Card>

                    <Card>
                      <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900 dark:to-blue-800">
                        <CardTitle className="flex items-center gap-2">
                          <span className="text-blue-600 dark:text-blue-300">Discount</span>
                        </CardTitle>
                        <CardDescription>Apply a discount to this patient bill</CardDescription>
                      </CardHeader>
                      <CardContent className="pt-6">
                        <div className="grid gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="discountAmount" className="text-base font-medium">
                              Discount Amount (₹)
                            </Label>
                            <div className="relative">
                              <Input
                                id="discountAmount"
                                type="number"
                                placeholder="Enter discount amount"
                                value={discountAmount}
                                onChange={(e) => setDiscountAmount(e.target.value)}
                                className="pl-8 text-lg"
                              />
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                            </div>
                            {selectedCasualty.discount && (
                              <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900 rounded-md">
                                <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                                  Current discount: ₹{selectedCasualty.discount.toFixed(2)}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter className="border-t pt-4">
                        <Button onClick={handleAddDiscount} className="ml-auto bg-blue-600 hover:bg-blue-700">
                          <Plus className="h-4 w-4 mr-2" /> Update Discount
                        </Button>
                      </CardFooter>
                    </Card>
                  </TabsContent>

                  <TabsContent value="invoice" className="space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Invoice</CardTitle>
                        <CardDescription>Generate and download invoice for this patient</CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-col items-center gap-4">
                        <div className="flex gap-4">
                          <Button onClick={handleDownloadInvoice} className="flex items-center gap-2">
                            <Download className="h-4 w-4" /> Download Invoice
                          </Button>
                          <Button
                            onClick={handleSendPdfOnWhatsapp}
                            variant="outline"
                            className="flex items-center gap-2"
                          >
                            Send Invoice on WhatsApp
                          </Button>
                        </div>

                        {/* Hidden invoice template for PDF generation */}
                        <div
                          ref={invoiceRef}
                          style={{
                            position: "absolute",
                            left: "-9999px",
                            top: 0,
                            width: "595px",
                            backgroundColor: "transparent",
                          }}
                        >
                          <div className="text-xs text-gray-800 p-4 bg-transparent">
                            {/* Invoice Header: Patient Details & Dates */}
                            <div className="flex justify-between mb-2">
                              <div>
                                <p>
                                  <strong>Patient Name:</strong> {selectedCasualty.name}
                                </p>
                                <p>
                                  <strong>Mobile No.:</strong> {selectedCasualty.phone}
                                </p>
                                <p>
                                  <strong>UHID:</strong> {selectedCasualty.patientId}
                                </p>
                              </div>
                              <div className="text-right">
                                <p>
                                  <strong>Admit Date:</strong> {formatDate(selectedCasualty.date)}
                                </p>
                                <p>
                                  <strong>Bill Date:</strong> {formatDate(new Date().toISOString())}
                                </p>
                              </div>
                            </div>

                            {/* Hospital Service Charges Table */}
                            <div className="my-2">
                              <h3 className="font-semibold mb-2 text-xs">Hospital Service Charges</h3>
                              <table className="w-full text-[8px]">
                                <thead>
                                  <tr className="bg-green-100">
                                    <th className="p-1 text-left">Service</th>
                                    <th className="p-1 text-center">Qnty</th>
                                    <th className="p-1 text-right">Unit (Rs)</th>
                                    <th className="p-1 text-right">Total (Rs)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {selectedCasualty.services &&
                                    Object.values(selectedCasualty.services).map((service, idx) => (
                                      <tr key={idx} className="border-t">
                                        <td className="p-1">{service.name}</td>
                                        <td className="p-1 text-center">1</td>
                                        <td className="p-1 text-right">{service.amount.toLocaleString()}</td>
                                        <td className="p-1 text-right">{service.amount.toLocaleString()}</td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                              <div className="mt-1 text-right font-semibold text-xs">
                                Hospital Services Total: Rs.{" "}
                                {selectedCasualty.services
                                  ? Object.values(selectedCasualty.services)
                                      .reduce((sum, service) => sum + service.amount, 0)
                                      .toLocaleString()
                                  : "0"}
                              </div>
                            </div>

                            {/* Final Summary Section */}
                            <div className="mt-4 p-2 rounded text-[9px] w-[200px] ml-auto">
                              <p className="flex justify-between w-full">
                                <span>Total Amount:</span>
                                <span>
                                  Rs.{" "}
                                  {selectedCasualty.services
                                    ? Object.values(selectedCasualty.services)
                                        .reduce((sum, service) => sum + service.amount, 0)
                                        .toLocaleString()
                                    : "0"}
                                </span>
                              </p>
                              {selectedCasualty.discount && selectedCasualty.discount > 0 && (
                                <p className="flex justify-between w-full text-green-600 font-bold">
                                  <span>Discount:</span>
                                  <span>- Rs. {selectedCasualty.discount.toLocaleString()}</span>
                                </p>
                              )}
                              <hr className="my-1" />
                              <p className="flex justify-between w-full font-bold">
                                <span>Net Total:</span>
                                <span>
                                  Rs.{" "}
                                  {(
                                    (selectedCasualty.services
                                      ? Object.values(selectedCasualty.services).reduce(
                                          (sum, service) => sum + service.amount,
                                          0,
                                        )
                                      : 0) - (selectedCasualty.discount || 0)
                                  ).toLocaleString()}
                                </span>
                              </p>
                              <p className="flex justify-between w-full">
                                <span>Deposit Amount:</span>
                                <span>
                                  Rs.{" "}
                                  {selectedCasualty.payments
                                    ? Object.values(selectedCasualty.payments)
                                        .reduce((sum, payment) => sum + payment.amount, 0)
                                        .toLocaleString()
                                    : "0"}
                                </span>
                              </p>
                              <p className="flex justify-between w-full text-red-600 font-bold">
                                <span>Due Amount:</span>
                                <span>
                                  Rs.{" "}
                                  {Math.max(
                                    0,
                                    (selectedCasualty.services
                                      ? Object.values(selectedCasualty.services).reduce(
                                          (sum, service) => sum + service.amount,
                                          0,
                                        )
                                      : 0) -
                                      (selectedCasualty.discount || 0) -
                                      (selectedCasualty.payments
                                        ? Object.values(selectedCasualty.payments).reduce(
                                            (sum, payment) => sum + payment.amount,
                                            0,
                                          )
                                        : 0),
                                  ).toLocaleString()}
                                </span>
                              </p>
                              <p className="mt-1 text-xs">
                                <strong>Amount in Words:</strong>{" "}
                                {convertNumberToWords(
                                  Math.max(
                                    0,
                                    (selectedCasualty.services
                                      ? Object.values(selectedCasualty.services).reduce(
                                          (sum, service) => sum + service.amount,
                                          0,
                                        )
                                      : 0) -
                                      (selectedCasualty.discount || 0) -
                                      (selectedCasualty.payments
                                        ? Object.values(selectedCasualty.payments).reduce(
                                            (sum, payment) => sum + payment.amount,
                                            0,
                                          )
                                        : 0),
                                  ),
                                )}{" "}
                                Rupees Only
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Casualty Record</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this record? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteDialogOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCasualty} className="bg-red-500 hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
