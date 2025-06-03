"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { db } from "../../../lib/firebase"
import { ref, get } from "firebase/database"
import { format } from "date-fns"
import {
  Calendar,
  Clock,
  CreditCard,
  FileText,
  Phone,
  PillIcon as Pills,
  User,
  Users,
  Stethoscope,
  ChevronRight,
  MapPin,
  Activity,
  Clipboard,
  ArrowLeft,
  TrendingUp,
  Building2,
  FileCheck,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"

interface IPatientInfo {
  address?: string
  age?: number
  createdAt?: string | number
  gender?: string
  name?: string
  phone?: string
  uhid?: string
  updatedAt?: string | number
}

interface IOPDRecord {
  id: string
  amount?: number
  appointmentType?: string
  createdAt?: string
  date?: string
  doctor?: string
  enteredBy?: string
  message?: string
  name?: string
  opdType?: string
  originalAmount?: number
  patientId?: string
  paymentMethod?: string
  referredBy?: string
  serviceName?: string
  time?: string
  discount?: string
}

interface IIPDRecord {
  id: string
  admissionDate?: string
  admissionSource?: string
  admissionTime?: string
  admissionType?: string
  bed?: string
  createdAt?: string
  doctor?: string
  name?: string
  referDoctor?: string
  relativeAddress?: string
  relativeName?: string
  relativePhone?: string
  roomType?: string
  services?: any[]
  status?: string
  uhid?: string
  dischargeDate?: string
  discount?: number
}

interface IOTRecord {
  id: string
  createdAt?: string
  date?: string
  message?: string
  time?: string
  updatedAt?: string
}

interface IDoctor {
  name: string
  specialist?: string
  department?: string
}

const roomTypeMap: Record<string, string> = {
  deluxe: "Deluxe Room",
  female: "Female Ward",
  male: "Male Ward",
  female_ward: "Female Ward",
  male_ward: "Male Ward",
  icu: "ICU",
  nicu: "NICU",
  casualty: "Casualty",
  suit: "Suite",
}

export default function PatientDetailsPage() {
  const { id } = useParams()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("overview")
  const [patientInfo, setPatientInfo] = useState<IPatientInfo | null>(null)
  const [opdRecords, setOpdRecords] = useState<IOPDRecord[]>([])
  const [ipdRecords, setIpdRecords] = useState<IIPDRecord[]>([])
  const [otRecords, setOtRecords] = useState<IOTRecord[]>([])
  const [doctors, setDoctors] = useState<Record<string, IDoctor>>({})
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalOPD: 0,
    totalIPD: 0,
    totalOT: 0,
    totalAmount: 0,
  })

  useEffect(() => {
    if (!id) return
    fetchPatientData()
  }, [id])

  const fetchPatientData = async () => {
    setLoading(true)
    try {
      // Fetch doctors first
      const doctorsRef = ref(db, "doctors")
      const doctorsSnap = await get(doctorsRef)
      const doctorsData: Record<string, IDoctor> = {}
      if (doctorsSnap.exists()) {
        Object.entries(doctorsSnap.val()).forEach(([key, value]: [string, any]) => {
          doctorsData[key] = {
            name: value.name,
            specialist: value.specialist,
            department: value.department,
          }
        })
      }
      setDoctors(doctorsData)

      // Fetch patient info
      const patientInfoRef = ref(db, `patients/patientinfo/${id}`)
      const patientInfoSnap = await get(patientInfoRef)
      if (patientInfoSnap.exists()) {
        setPatientInfo(patientInfoSnap.val())
      }

      // Fetch OPD records
      const opdRef = ref(db, `patients/opddetail/${id}`)
      const opdSnap = await get(opdRef)
      const opdData: IOPDRecord[] = []
      if (opdSnap.exists()) {
        Object.entries(opdSnap.val()).forEach(([key, value]: [string, any]) => {
          opdData.push({ id: key, ...value })
        })
      }
      setOpdRecords(opdData.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()))

      // Fetch IPD records
      const ipdRef = ref(db, `patients/ipddetail/userinfoipd/${id}`)
      const ipdSnap = await get(ipdRef)
      const ipdData: IIPDRecord[] = []
      if (ipdSnap.exists()) {
        Object.entries(ipdSnap.val()).forEach(([key, value]: [string, any]) => {
          ipdData.push({ id: key, ...value })
        })
      }
      setIpdRecords(ipdData.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()))

      // Fetch OT records
      const otRef = ref(db, `patients/ot/otdetail/${id}`)
      const otSnap = await get(otRef)
      const otData: IOTRecord[] = []
      if (otSnap.exists()) {
        Object.entries(otSnap.val()).forEach(([key, value]: [string, any]) => {
          otData.push({ id: key, ...value })
        })
      }
      setOtRecords(otData.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()))

      // Calculate stats
      const totalAmount =
        opdData.reduce((sum, record) => sum + (record.amount || 0), 0) +
        ipdData.reduce((sum, record) => {
          const services = record.services || []
          return sum + services.reduce((serviceSum: number, service: any) => serviceSum + (service.amount || 0), 0)
        }, 0)

      setStats({
        totalOPD: opdData.length,
        totalIPD: ipdData.length,
        totalOT: otData.length,
        totalAmount,
      })
    } catch (error) {
      console.error("Error fetching patient data:", error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string | number | undefined) => {
    if (!dateString) return "N/A"
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return "Invalid Date"
    return format(date, "MMM dd, yyyy")
  }

  const formatDateTime = (dateString: string | number | undefined) => {
    if (!dateString) return "N/A"
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return "Invalid Date"
    return format(date, "MMM dd, yyyy 'at' hh:mm a")
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="container mx-auto px-4 py-8">
          <div className="space-y-6">
            <Skeleton className="h-8 w-64" />
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-4">
                  <Skeleton className="h-20 w-20 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-64" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!patientInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <User className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Patient Not Found</h2>
            <p className="text-slate-600 mb-6">The patient you are looking for does not exist or has been removed.</p>
            <Button onClick={() => router.push("/patientadmin")} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Patient Management
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/patient-management")}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Patient Details</h1>
            <p className="text-slate-600">Complete medical record overview</p>
          </div>
        </div>

        {/* Patient Profile Card */}
        <Card className="mb-8 border-l-4 border-l-emerald-500 shadow-lg">
          <CardContent className="p-8">
            <div className="flex flex-col lg:flex-row gap-8 items-start lg:items-center">
              <Avatar className="h-24 w-24 border-4 border-emerald-100 shadow-lg">
                <AvatarFallback className="bg-emerald-100 text-emerald-700 text-2xl font-bold">
                  {getInitials(patientInfo.name || "")}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <h2 className="text-3xl font-bold text-slate-900">{patientInfo.name}</h2>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 px-3 py-1">
                      ID: {patientInfo.uhid}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={`px-3 py-1 ${
                        patientInfo.gender === "male" ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"
                      }`}
                    >
                      {patientInfo.gender === "male" ? "Male" : "Female"}, {patientInfo.age} years
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-slate-600">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Phone className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Phone</p>
                      <p className="font-medium">{patientInfo.phone}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <MapPin className="h-4 w-4 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Address</p>
                      <p className="font-medium">{patientInfo.address || "Not provided"}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Calendar className="h-4 w-4 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Registered</p>
                      <p className="font-medium">{formatDate(patientInfo.createdAt)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="border-l-4 border-l-blue-500 shadow-md hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Total OPD</p>
                  <p className="text-3xl font-bold text-blue-600">{stats.totalOPD}</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-full">
                  <Stethoscope className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-500 shadow-md hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Total IPD</p>
                  <p className="text-3xl font-bold text-emerald-600">{stats.totalIPD}</p>
                </div>
                <div className="p-3 bg-emerald-100 rounded-full">
                  <Building2 className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-orange-500 shadow-md hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Total OT</p>
                  <p className="text-3xl font-bold text-orange-600">{stats.totalOT}</p>
                </div>
                <div className="p-3 bg-orange-100 rounded-full">
                  <Activity className="h-6 w-6 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500 shadow-md hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Total Amount</p>
                  <p className="text-3xl font-bold text-purple-600">₹{stats.totalAmount.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-purple-100 rounded-full">
                  <TrendingUp className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-6" onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 w-full max-w-2xl mx-auto">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Clipboard className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="opd" className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4" />
              OPD ({stats.totalOPD})
            </TabsTrigger>
            <TabsTrigger value="ipd" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              IPD ({stats.totalIPD})
            </TabsTrigger>
            <TabsTrigger value="ot" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              OT ({stats.totalOT})
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent OPD */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Stethoscope className="h-5 w-5 text-blue-600" />
                    Recent OPD Visits
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {opdRecords.slice(0, 3).length === 0 ? (
                    <p className="text-slate-500 text-center py-4">No OPD records found</p>
                  ) : (
                    <div className="space-y-3">
                      {opdRecords.slice(0, 3).map((record) => (
                        <div key={record.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <div>
                            <p className="font-medium">{record.serviceName}</p>
                            <p className="text-sm text-slate-600">{formatDate(record.date)}</p>
                          </div>
                          <Badge variant="outline">₹{record.amount}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent IPD */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-emerald-600" />
                    Recent IPD Admissions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {ipdRecords.slice(0, 3).length === 0 ? (
                    <p className="text-slate-500 text-center py-4">No IPD records found</p>
                  ) : (
                    <div className="space-y-3">
                      {ipdRecords.slice(0, 3).map((record) => (
                        <div key={record.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <div>
                            <p className="font-medium">{roomTypeMap[record.roomType || ""] || record.roomType}</p>
                            <p className="text-sm text-slate-600">{formatDate(record.admissionDate)}</p>
                          </div>
                          <Badge variant={record.status === "active" ? "default" : "secondary"}>
                            {record.status || "Active"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* OPD Records Tab - No buttons, full details only */}
          <TabsContent value="opd" className="space-y-6">
            {opdRecords.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Stethoscope className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-900 mb-2">No OPD Records</h3>
                  <p className="text-slate-500">This patient has no OPD visit records.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {opdRecords.map((record) => (
                  <Card key={record.id} className="hover:shadow-lg transition-shadow border-l-4 border-l-blue-500">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-lg font-semibold text-slate-900">
                          {record.serviceName || "OPD Visit"}
                        </CardTitle>
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          ₹{record.amount || 0}
                        </Badge>
                      </div>
                      <CardDescription className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>
                          {formatDate(record.date)} at {record.time}
                        </span>
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-slate-500" />
                        <span className="text-sm">
                          Doctor:{" "}
                          <span className="font-medium">{doctors[record.doctor || ""]?.name || "Not assigned"}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-slate-500" />
                        <span className="text-sm">
                          Payment: <span className="font-medium capitalize">{record.paymentMethod || "Cash"}</span>
                        </span>
                      </div>

                      {record.appointmentType && (
                        <div className="flex items-center gap-2">
                          <Clipboard className="h-4 w-4 text-slate-500" />
                          <span className="text-sm">
                            Type: <span className="font-medium capitalize">{record.appointmentType}</span>
                          </span>
                        </div>
                      )}

                      {record.referredBy && (
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-slate-500" />
                          <span className="text-sm">
                            Referred by: <span className="font-medium">{record.referredBy}</span>
                          </span>
                        </div>
                      )}

                      {record.message && (
                        <div className="flex items-start gap-2">
                          <FileText className="h-4 w-4 text-slate-500 mt-0.5" />
                          <span className="text-sm">
                            Note: <span className="font-medium">{record.message}</span>
                          </span>
                        </div>
                      )}

                      {record.enteredBy && (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-slate-500" />
                          <span className="text-sm">
                            Entered by: <span className="font-medium">{record.enteredBy}</span>
                          </span>
                        </div>
                      )}

                      {record.discount && (
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-slate-500" />
                          <span className="text-sm">
                            Discount: <span className="font-medium">{record.discount}%</span>
                          </span>
                        </div>
                      )}

                      {record.originalAmount && record.originalAmount !== record.amount && (
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-slate-500" />
                          <span className="text-sm">
                            Original Amount: <span className="font-medium">₹{record.originalAmount}</span>
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* IPD Records Tab - With navigation buttons */}
          <TabsContent value="ipd" className="space-y-6">
            {ipdRecords.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Building2 className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-900 mb-2">No IPD Records</h3>
                  <p className="text-slate-500">This patient has no IPD admission records.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {ipdRecords.map((record) => (
                  <Card key={record.id} className="hover:shadow-lg transition-shadow border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-lg font-semibold text-slate-900">
                          {roomTypeMap[record.roomType || ""] || record.roomType}
                        </CardTitle>
                        <Badge
                          variant={
                            record.roomType === "icu" || record.roomType === "nicu" ? "destructive" : "secondary"
                          }
                        >
                          {(record.roomType || "").toUpperCase()}
                        </Badge>
                      </div>
                      <CardDescription className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>Admitted: {formatDate(record.admissionDate)}</span>
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-slate-500" />
                        <span className="text-sm">
                          Doctor:{" "}
                          <span className="font-medium">{doctors[record.doctor || ""]?.name || "Not assigned"}</span>
                        </span>
                      </div>

                      {record.referDoctor && (
                        <div className="flex items-center gap-2">
                          <Stethoscope className="h-4 w-4 text-slate-500" />
                          <span className="text-sm">
                            Referred by: <span className="font-medium">{record.referDoctor}</span>
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-slate-500" />
                        <span className="text-sm">
                          Relative: <span className="font-medium">{record.relativeName}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-slate-500" />
                        <span className="text-sm">
                          Contact: <span className="font-medium">{record.relativePhone}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-slate-500" />
                        <span className="text-sm">
                          Time: <span className="font-medium">{record.admissionTime}</span>
                        </span>
                      </div>

                      {record.dischargeDate && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-slate-500" />
                          <span className="text-sm">
                            Discharged: <span className="font-medium">{formatDate(record.dischargeDate)}</span>
                          </span>
                        </div>
                      )}
                    </CardContent>

                    <Separator />

                    <CardFooter className="flex flex-wrap gap-2 py-3">
                      <Link href={`/manage/${id}/${record.id}`}>
                        <Button variant="outline" size="sm" className="flex items-center gap-1">
                          <Clipboard className="h-3.5 w-3.5" />
                          Manage
                        </Button>
                      </Link>
                      <Link href={`/drugchart/${id}/${record.id}`}>
                        <Button variant="outline" size="sm" className="flex items-center gap-1">
                          <Pills className="h-3.5 w-3.5" />
                          Drugs
                        </Button>
                      </Link>
                      <Link href={`/billing/${id}/${record.id}`}>
                        <Button variant="outline" size="sm" className="flex items-center gap-1">
                          <CreditCard className="h-3.5 w-3.5" />
                          Billing
                        </Button>
                      </Link>
                      <Link href={`/discharge-summary/${id}/${record.id}`}>
                        <Button variant="outline" size="sm" className="flex items-center gap-1">
                          <FileCheck className="h-3.5 w-3.5" />
                          Discharge
                        </Button>
                      </Link>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* OT Records Tab - With navigation to OT page */}
          <TabsContent value="ot" className="space-y-6">
            {otRecords.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Activity className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-900 mb-2">No OT Records</h3>
                  <p className="text-slate-500">This patient has no OT procedure records.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {otRecords.map((record) => (
                  <Card
                    key={record.id}
                    className="hover:shadow-lg transition-shadow border-l-4 border-l-orange-500 cursor-pointer"
                    onClick={() => router.push(`/ot/${id}/${record.id}`)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-lg font-semibold text-slate-900">OT Procedure</CardTitle>
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                          OT
                        </Badge>
                      </div>
                      <CardDescription className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{formatDate(record.date)}</span>
                        {record.time && (
                          <>
                            <Clock className="h-3.5 w-3.5 ml-2" />
                            <span>{record.time}</span>
                          </>
                        )}
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      {record.message && (
                        <div className="flex items-start gap-2">
                          <FileText className="h-4 w-4 text-slate-500 mt-0.5" />
                          <span className="text-sm">
                            Notes: <span className="font-medium">{record.message}</span>
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-slate-500" />
                        <span className="text-sm">
                          Created: <span className="font-medium">{formatDateTime(record.createdAt)}</span>
                        </span>
                      </div>

                      {record.updatedAt && record.updatedAt !== record.createdAt && (
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-slate-500" />
                          <span className="text-sm">
                            Updated: <span className="font-medium">{formatDateTime(record.updatedAt)}</span>
                          </span>
                        </div>
                      )}
                    </CardContent>

                    <Separator />

                    <CardFooter className="flex justify-end py-3">
                      <Button variant="outline" size="sm" className="flex items-center gap-1">
                        View Details
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
