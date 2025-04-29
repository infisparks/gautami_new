"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { db } from "../../../lib/firebase"
import { ref, onValue } from "firebase/database"
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
  Microscope,
  Scissors,
  ChevronRight,
  MapPin,
  Loader2,
  Activity,
  Clipboard,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"

// Room type mapping for better display
const roomTypeMap: Record<string, string> = {
  deluxe: "Deluxe Room",
  female_ward: "Female Ward",
  male_ward: "Male Ward",
  icu: "ICU",
  nicu: "NICU",
}

interface IPatientRecord {
  address?: string
  age?: number
  createdAt?: string | number
  gender?: string
  name?: string
  phone?: string
  uhid?: string
  opd?: Record<string, any>
  ipd?: Record<string, any>
  pathology?: Record<string, any>
  surgery?: Record<string, any>
  ot?: Record<string, any> | any
  mortality?: Record<string, any>
}

export default function PatientDetailsPage() {
  const { id } = useParams()
  const [activeTab, setActiveTab] = useState("ipd")
  const [patientData, setPatientData] = useState<IPatientRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [doctors, setDoctors] = useState<Record<string, string>>({})

  // Fetch patient data from Firebase
  useEffect(() => {
    if (!id) return

    // Fetch doctors first for name mapping
    const doctorsRef = ref(db, "doctors")
    onValue(doctorsRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const doctorMap: Record<string, string> = {}
        Object.entries(data).forEach(([key, value]: [string, any]) => {
          doctorMap[key] = value.name
        })
        setDoctors(doctorMap)
      }
    })

    // Fetch patient data
    const patientRef = ref(db, `patients/${id}`)
    const unsubscribe = onValue(patientRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        setPatientData({ ...data, uhid: id })
      } else {
        setPatientData(null)
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [id])

  // Format date for display
  const formatDate = (dateString: string | number) => {
    if (!dateString) return "N/A"

    const date = new Date(dateString)
    if (isNaN(date.getTime())) return "Invalid Date"

    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  // Get initials for avatar
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          <p className="text-muted-foreground">Loading patient data...</p>
        </div>
      </div>
    )
  }

  if (!patientData) {
    return (
      <div className="container mx-auto py-12 px-4 text-center">
        <h1 className="text-2xl font-bold mb-4">Patient Not Found</h1>
        <p className="text-muted-foreground mb-8">
          The patient you are looking for does not exist or has been removed.
        </p>
        <Link href="/patient-management">
          <Button>Return to Patient Management</Button>
        </Link>
      </div>
    )
  }

  // Process IPD records
  const ipdRecords = patientData.ipd
    ? Object.entries(patientData.ipd).map(([key, value]) => ({
        id: key,
        ...value,
      }))
    : []

  // Process OPD records
  const opdRecords = patientData.opd
    ? Object.entries(patientData.opd).map(([key, value]) => ({
        id: key,
        ...value,
      }))
    : []

  // Process Pathology records
  const pathologyRecords = patientData.pathology
    ? Object.entries(patientData.pathology).map(([key, value]) => ({
        id: key,
        ...value,
      }))
    : []

  // Process Surgery records - handle both object and collection
  let surgeryRecords = []
  if (patientData.surgery) {
    if (patientData.surgery.surgeryTitle) {
      // It's a single object
      surgeryRecords = [{ id: "single", ...patientData.surgery }]
    } else {
      // It's a collection
      surgeryRecords = Object.entries(patientData.surgery).map(([key, value]) => ({
        id: key,
        ...value,
      }))
    }
  }
  // Process OT records - handle both object and collection
  let otRecords: { id: string; [key: string]: any }[] = []
  if (patientData.ot) {
    if (patientData.ot.date || patientData.ot.createdAt) {
      // It's a single object
      otRecords = [{ id: "single", ...patientData.ot }]
    } else {
      // It's a collection
      otRecords = Object.entries(patientData.ot).map(([key, value]) => ({
        id: key,
        ...(value as { [key: string]: any }),
      }))
    }
  }

  return (
    <main className="container mx-auto py-6 px-4 md:px-6">
      {/* Patient Profile Card */}
      <Card className="mb-8 border-l-4 border-l-emerald-500">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
            <Avatar className="h-20 w-20 border-2 border-emerald-100">
              <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xl font-semibold">
                {getInitials(patientData.name || "")}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 space-y-1.5">
              <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                <h1 className="text-2xl font-bold">{patientData.name}</h1>
                <Badge variant="outline" className="w-fit bg-emerald-50 text-emerald-700 border-emerald-200">
                  ID: {patientData.uhid}
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-muted-foreground mt-2">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>
                    {patientData.gender === "male" ? "Male" : "Female"}, {patientData.age} years
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  <span>{patientData.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span>{patientData.address}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for different sections */}
      <Tabs defaultValue="ipd" className="mb-6" onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 mb-6">
          <TabsTrigger value="ipd" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">IPD Records</span>
            <span className="sm:hidden">IPD</span>
          </TabsTrigger>
          <TabsTrigger value="opd" className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4" />
            <span className="hidden sm:inline">OPD Records</span>
            <span className="sm:hidden">OPD</span>
          </TabsTrigger>
          <TabsTrigger value="pathology" className="flex items-center gap-2">
            <Microscope className="h-4 w-4" />
            <span className="hidden sm:inline">Pathology</span>
            <span className="sm:hidden">Path</span>
          </TabsTrigger>
          <TabsTrigger value="surgery" className="flex items-center gap-2">
            <Scissors className="h-4 w-4" />
            <span className="hidden sm:inline">Surgery</span>
            <span className="sm:hidden">Surg</span>
          </TabsTrigger>
          <TabsTrigger value="ot" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">OT Records</span>
            <span className="sm:hidden">OT</span>
          </TabsTrigger>
        </TabsList>

        {/* IPD Records Tab */}
        <TabsContent value="ipd" className="space-y-6">
          {ipdRecords.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No IPD records found for this patient.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {ipdRecords.map((record) => (
                <Card key={record.id} className="overflow-hidden hover:shadow-md transition-shadow">
                  <CardHeader className="bg-slate-50 pb-3">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg font-semibold">
                        {roomTypeMap[record.roomType] || record.roomType}
                      </CardTitle>
                      <Badge
                        variant={record.roomType === "icu" || record.roomType === "nicu" ? "destructive" : "secondary"}
                      >
                        {record.roomType.toUpperCase()}
                      </Badge>
                    </div>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Admitted: {formatDate(record.date)}</span>
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="pt-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          Doctor:{" "}
                          <span className="font-medium">
                            {doctors[record.doctor] || record.doctorName || "Not assigned"}
                          </span>
                        </span>
                      </div>

                      {record.referDoctor && (
                        <div className="flex items-center gap-2">
                          <Stethoscope className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            Referred by: <span className="font-medium">{record.referDoctor}</span>
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          Relative: <span className="font-medium">{record.relativeName}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          Contact: <span className="font-medium">{record.relativePhone}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          Time: <span className="font-medium">{record.time}</span>
                        </span>
                      </div>
                    </div>
                  </CardContent>

                  <Separator />

                  <CardFooter className="flex justify-between py-3 bg-slate-50">
                    <Link href={`/manage/${patientData.uhid}/${record.id}`} passHref>
                      <Button variant="outline" size="sm" className="text-xs">
                        Manage
                      </Button>
                    </Link>
                    <Link href={`/drugchart/${patientData.uhid}/${record.id}`} passHref>
                      <Button variant="outline" size="sm" className="text-xs">
                        <Pills className="h-3.5 w-3.5 mr-1" />
                        Drugs
                      </Button>
                    </Link>
                    <Link href={`/billing/${patientData.uhid}/${record.id}`} passHref>
                      <Button variant="outline" size="sm" className="text-xs">
                        <CreditCard className="h-3.5 w-3.5 mr-1" />
                        Billing
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* OPD Records Tab */}
        <TabsContent value="opd" className="space-y-6">
          {opdRecords.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No OPD records found for this patient.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {opdRecords.map((record) => (
                <Card key={record.id} className="overflow-hidden hover:shadow-md transition-shadow">
                  <CardHeader className="bg-blue-50 pb-3">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg font-semibold">{record.serviceName || "OPD Visit"}</CardTitle>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        ₹{record.amount || 0}
                      </Badge>
                    </div>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>
                        {formatDate(record.date)}, {record.time}
                      </span>
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="pt-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          Doctor:{" "}
                          <span className="font-medium">
                            {doctors[record.doctor] || record.doctorName || "Not assigned"}
                          </span>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          Payment: <span className="font-medium capitalize">{record.paymentMethod || "Cash"}</span>
                        </span>
                      </div>

                      {record.appointmentType && (
                        <div className="flex items-center gap-2">
                          <Stethoscope className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            Type: <span className="font-medium capitalize">{record.appointmentType}</span>
                          </span>
                        </div>
                      )}

                      {record.referredBy && (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            Referred by: <span className="font-medium">{record.referredBy}</span>
                          </span>
                        </div>
                      )}

                      {record.message && (
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            Note: <span className="font-medium">{record.message}</span>
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Pathology Tab */}
        <TabsContent value="pathology" className="space-y-6">
          {pathologyRecords.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No pathology records found for this patient.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pathologyRecords.map((record) => (
                <Card key={record.id} className="overflow-hidden hover:shadow-md transition-shadow">
                  <CardHeader className="bg-purple-50 pb-3">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg font-semibold">{record.bloodTestName}</CardTitle>
                      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                        ₹{record.amount || 0}
                      </Badge>
                    </div>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>
                        {record.timestamp
                          ? formatDate(record.timestamp)
                          : record.createdAt
                            ? formatDate(record.createdAt)
                            : "N/A"}
                      </span>
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="pt-4">
                    <div className="space-y-3">
                      {record.referBy && (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            Referred by: <span className="font-medium">{record.referBy}</span>
                          </span>
                        </div>
                      )}

                      {record.paymentMethod && (
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            Payment: <span className="font-medium capitalize">{record.paymentMethod}</span>
                          </span>
                        </div>
                      )}

                      {record.paymentId && (
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            Payment ID: <span className="font-medium">{record.paymentId}</span>
                          </span>
                        </div>
                      )}

                      {record.ipdId && (
                        <div className="flex items-center gap-2">
                          <Clipboard className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            IPD ID: <span className="font-medium">{record.ipdId}</span>
                          </span>
                        </div>
                      )}

                      <div className="flex justify-end">
                        <Button variant="outline" size="sm" className="text-xs">
                          View Report
                          <ChevronRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Surgery Tab */}
        <TabsContent value="surgery" className="space-y-6">
          {surgeryRecords.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No surgery records found for this patient.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {surgeryRecords.map((record) => (
                <Card key={record.id} className="overflow-hidden hover:shadow-md transition-shadow">
                  <CardHeader className="bg-amber-50 pb-3">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg font-semibold">{record.surgeryTitle || "Surgery"}</CardTitle>
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                        Surgery
                      </Badge>
                    </div>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>
                        {record.surgeryDate
                          ? record.surgeryDate
                          : record.updatedAt
                            ? formatDate(record.updatedAt)
                            : "N/A"}
                      </span>
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="pt-4">
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <span className="text-sm">
                          Diagnosis: <span className="font-medium">{record.finalDiagnosis || "Not specified"}</span>
                        </span>
                      </div>

                      {record.ipdId && (
                        <div className="flex items-center gap-2">
                          <Clipboard className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            IPD ID: <span className="font-medium">{record.ipdId}</span>
                          </span>
                        </div>
                      )}

                      <div className="flex justify-end">
                        <Button variant="outline" size="sm" className="text-xs">
                          View Details
                          <ChevronRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* OT Tab */}
        <TabsContent value="ot" className="space-y-6">
          {otRecords.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No OT records found for this patient.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {otRecords.map((record) => (
                <Card key={record.id} className="overflow-hidden hover:shadow-md transition-shadow">
                  <CardHeader className="bg-pink-50 pb-3">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg font-semibold">OT Procedure</CardTitle>
                      <Badge variant="outline" className="bg-pink-50 text-pink-700 border-pink-200">
                        OT
                      </Badge>
                    </div>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{record.date ? record.date : record.createdAt ? formatDate(record.createdAt) : "N/A"}</span>
                      {record.time && (
                        <>
                          <Clock className="h-3.5 w-3.5 ml-2" />
                          <span>{record.time}</span>
                        </>
                      )}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="pt-4">
                    <div className="space-y-3">
                      {record.message && (
                        <div className="flex items-start gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <span className="text-sm">
                            Notes: <span className="font-medium">{record.message}</span>
                          </span>
                        </div>
                      )}

                      {record.ipdId && (
                        <div className="flex items-center gap-2">
                          <Clipboard className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            IPD ID: <span className="font-medium">{record.ipdId}</span>
                          </span>
                        </div>
                      )}

                      <div className="flex justify-end">
                        <Link href={`/ot/${patientData.uhid}/${record.ipdId || record.id}`} passHref>
                          <Button variant="outline" size="sm" className="text-xs">
                            View Details
                            <ChevronRight className="h-3.5 w-3.5 ml-1" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div className="mt-8 flex justify-center">
        <Link href="/patient-management">
          <Button variant="outline">Back to Patient Management</Button>
        </Link>
      </div>
    </main>
  )
}
