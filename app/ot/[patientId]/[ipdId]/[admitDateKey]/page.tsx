"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ref, set, get, runTransaction } from "firebase/database"
import { db } from "@/lib/firebase"
import { ArrowLeft, Save, Calendar, Clock, User, FileText, Stethoscope, Phone, MapPin } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"

interface PatientInfo {
  name: string
  phone: string
  age?: string | number
  gender?: string
  address?: string
}

interface IPDInfo {
  roomType?: string
  bed?: string
  doctor?: string
  admissionDate?: string
  status?: string
}

interface OTData {
  date: string
  time: string
  message: string
  createdAt: string
  updatedAt: string
}

export default function OTPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()

  const patientId = (params.patientId as string) || ""
  const ipdId = (params.ipdId as string) || ""
  const admitDateKey = (params.admitDateKey as string) || ""

  const [date, setDate] = useState(admitDateKey)
  const [time, setTime] = useState("")
  const [message, setMessage] = useState("")

  const [patientInfo, setPatientInfo] = useState<PatientInfo | null>(null)
  const [ipdInfo, setIPDInfo] = useState<IPDInfo | null>(null)
  const [existingOTData, setExistingOTData] = useState<OTData | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasExistingData, setHasExistingData] = useState(false)

  useEffect(() => {
    if (admitDateKey && date !== admitDateKey) setDate(admitDateKey)
    if (!time) setTime(new Date().toTimeString().slice(0, 5))
  }, [admitDateKey])

  useEffect(() => {
    const fetchData = async () => {
      if (!patientId || !ipdId || !admitDateKey) {
        setIsLoading(false)
        if (!admitDateKey) {
          toast({
            title: "Error: Missing Date",
            description: "The surgery date is missing from the URL. Please check the address.",
            variant: "destructive",
          })
        }
        return
      }
      setIsLoading(true)
      try {
        const patientRef = ref(db, `patients/patientinfo/${patientId}`)
        const patientSnapshot = await get(patientRef)
        if (patientSnapshot.exists()) {
          const patientData = patientSnapshot.val()
          setPatientInfo({
            name: patientData.name || "Unknown",
            phone: patientData.phone || "",
            age: patientData.age || "",
            gender: patientData.gender || "",
            address: patientData.address || "",
          })
        } else {
          setPatientInfo(null)
          toast({
            title: "Info",
            description: "Patient basic information not found for this ID.",
            variant: "default",
          })
        }
        const ipdRef = ref(db, `patients/ipddetail/userinfoipd/${patientId}/${ipdId}`)
        const ipdSnapshot = await get(ipdRef)
        if (ipdSnapshot.exists()) {
          const ipdData = ipdSnapshot.val()
          setIPDInfo({
            roomType: ipdData.roomType || "",
            bed: ipdData.bed || "",
            doctor: ipdData.doctor || "",
            admissionDate: ipdData.admissionDate || "",
            status: ipdData.status || "",
          })
        } else {
          setIPDInfo(null)
          toast({
            title: "Info",
            description: "IPD details not found for this patient and admission.",
            variant: "default",
          })
        }
        const otRef = ref(db, `patients/ot/${admitDateKey}/${patientId}/${ipdId}`)
        const otSnapshot = await get(otRef)
        if (otSnapshot.exists()) {
          const otData = otSnapshot.val()
          setExistingOTData(otData)
          setHasExistingData(true)
          if (otData.date) setDate(otData.date)
          if (otData.time) setTime(otData.time)
          if (otData.message) setMessage(otData.message)
        } else {
          setExistingOTData(null)
          setHasExistingData(false)
          setDate(admitDateKey)
          setMessage("")
          setTime(new Date().toTimeString().slice(0, 5))
        }
      } catch (error) {
        console.error("Error fetching data:", error)
        toast({
          title: "Error",
          description: `Failed to load data: ${error instanceof Error ? error.message : String(error)}`,
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [patientId, ipdId, admitDateKey])

  // --- NEW: Summary OT Count Update ---
  const updateOtSummary = async (dateKey: string, isNew: boolean) => {
    if (!isNew) return // Only increment on new OT entry, not on update!
    const summaryRef = ref(db, `summary/ot/${dateKey}/totalOT`)
    await runTransaction(summaryRef, (curr) => {
      let n = Number(curr)
      if (isNaN(n)) n = 0
      return n + 1
    })
  }

  const handleSave = async () => {
    if (!admitDateKey) {
      toast({
        title: "Error",
        description: "Cannot save: Surgery date information is missing from the URL.",
        variant: "destructive",
      })
      return
    }
    if (!date || !time) {
      toast({
        title: "Error",
        description: "Surgery Date and Time are required.",
        variant: "destructive",
      })
      return
    }
    if (date !== admitDateKey) {
      toast({
        title: "Warning",
        description: `The date selected in the form (${date}) differs from the URL's date (${admitDateKey}). The record will be saved under the URL's date.`,
        variant: "default",
      })
    }
    setIsSaving(true)
    try {
      const otRef = ref(db, `patients/ot/${admitDateKey}/${patientId}/${ipdId}`)
      const otData: OTData = {
        date: admitDateKey,
        time,
        message: message.trim(),
        createdAt: existingOTData?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      await set(otRef, otData)
      // Increment summary/ot if new record
      await updateOtSummary(admitDateKey, !hasExistingData)
      toast({
        title: "Success",
        description: hasExistingData ? "OT record updated successfully" : "OT record saved successfully",
      })
      setExistingOTData(otData)
      setHasExistingData(true)
    } catch (error) {
      console.error("Error saving OT record:", error)
      toast({
        title: "Error",
        description: `Failed to save OT record: ${error instanceof Error ? error.message : String(error)}. Please try again.`,
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return ""
    try {
      const dateObj = new Date(dateString)
      if (isNaN(dateObj.getTime())) {
        console.warn("Invalid date string for formatting:", dateString)
        return dateString
      }
      return dateObj.toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    } catch (e) {
      console.error("Error formatting date:", dateString, e)
      return dateString
    }
  }

  const getBedNumber = (bedId: string) => {
    return bedId || "Not Assigned"
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800"></div>
      </div>
    )
  }

  if (!patientId || !ipdId || !admitDateKey) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center justify-center text-red-600 p-4">
        <h2 className="text-2xl font-bold mb-4">URL Error: Missing Information</h2>
        <p className="text-center text-lg mb-6">
          The URL is incomplete. Please ensure you have navigated here with a valid Patient ID, IPD ID, and Surgery Date in the format:
          <br /><code className="block mt-2 p-2 bg-slate-200 text-slate-800 rounded">/ot/[patientId]/[ipdId]/[YYYY-MM-DD]</code>
        </p>
        <p className="text-center mb-4">
            Example: <code className="bg-slate-200 p-1 rounded">/ot/I00RF2CAFB/-OTDAPkEL6qMUMLqYe0Z/2025-06-20</code>
        </p>
        <Button onClick={() => router.back()} className="mt-6">
          <ArrowLeft className="h-4 w-4 mr-2" /> Go Back
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <Button variant="outline" onClick={() => router.back()} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Patients
          </Button>
          <div className="flex items-center gap-3 mb-2">
            <Stethoscope className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-slate-800">
              Operation Theater (OT) {hasExistingData ? "- Update" : "- New Entry"}
            </h1>
          </div>
          <p className="text-slate-500">
            {hasExistingData ? "Update existing OT record" : "Create new OT record for patient"}
          </p>
        </div>
        {patientInfo && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Patient Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm font-medium text-slate-500">Patient Name</Label>
                  <p className="font-semibold text-lg">{patientInfo.name}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-500 flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    Phone Number
                  </Label>
                  <p className="font-semibold">{patientInfo.phone}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-500">Patient ID</Label>
                  <p className="font-semibold">{patientId}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-500">IPD ID</Label>
                  <p className="font-semibold">{ipdId}</p>
                </div>
                {patientInfo.age && (
                  <div>
                    <Label className="text-sm font-medium text-slate-500">Age</Label>
                    <p className="font-semibold">{patientInfo.age} years</p>
                  </div>
                )}
                {patientInfo.gender && (
                  <div>
                    <Label className="text-sm font-medium text-slate-500">Gender</Label>
                    <p className="font-semibold capitalize">{patientInfo.gender}</p>
                  </div>
                )}
                {ipdInfo?.roomType && (
                  <div>
                    <Label className="text-sm font-medium text-slate-500">Room Type</Label>
                    <Badge variant="outline" className="bg-slate-50">
                      {ipdInfo.roomType}
                    </Badge>
                  </div>
                )}
                {ipdInfo?.bed && (
                  <div>
                    <Label className="text-sm font-medium text-slate-500">Bed</Label>
                    <p className="font-semibold">{getBedNumber(ipdInfo.bed)}</p>
                  </div>
                )}
                {ipdInfo?.admissionDate && (
                  <div>
                    <Label className="text-sm font-medium text-slate-500">Admission Date</Label>
                    <p className="font-semibold">{formatDate(ipdInfo.admissionDate)}</p>
                  </div>
                )}
              </div>
              {patientInfo.address && (
                <div className="mt-4">
                  <Label className="text-sm font-medium text-slate-500 flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    Address
                  </Label>
                  <p className="font-semibold">{patientInfo.address}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              OT Record Details for {formatDate(admitDateKey)}{" "}
            </CardTitle>
            {hasExistingData && existingOTData && (
              <div className="text-sm text-slate-500">
                <p>Created: {formatDate(existingOTData.createdAt)}</p>
                {existingOTData.updatedAt !== existingOTData.createdAt && (
                  <p>Last Updated: {formatDate(existingOTData.updatedAt)}</p>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="date" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Surgery Date
                </Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full"
                  required
                  readOnly={true}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="time" className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Surgery Time
                </Label>
                <Input
                  id="time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="message" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                OT Notes/Procedure Details
              </Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Enter surgical procedure details, observations, post-operative instructions, etc..."
                className="min-h-[120px] resize-none"
              />
            </div>
            <div className="flex justify-end gap-4 pt-4">
              <Button variant="outline" onClick={() => router.back()} disabled={isSaving}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving || !date || !time || !admitDateKey}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isSaving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    {hasExistingData ? "Updating..." : "Saving..."}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    {hasExistingData ? "Update OT Record" : "Save OT Record"}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
