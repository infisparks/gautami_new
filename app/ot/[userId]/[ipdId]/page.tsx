"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ref, set, get, serverTimestamp } from "firebase/database"
import { db } from "@/lib/firebase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Stethoscope, Calendar, Clock, MessageSquare, User, Bed, FileText } from "lucide-react"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"

interface PatientDetails {
  name: string
  age: string
  gender: string
  bed?: string
  roomType?: string
}

interface OTData {
  date: string
  time: string
  message: string
  ipdId: string
  createdAt: any
}

export default function OTPage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.userId as string
  const ipdId = params.ipdId as string

  // Get current date and time for default values
  const now = new Date()
  const currentDate = now.toISOString().split("T")[0]
  const currentTime = now.toTimeString().slice(0, 5)

  const [date, setDate] = useState(currentDate)
  const [time, setTime] = useState(currentTime)
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [patientDetails, setPatientDetails] = useState<PatientDetails | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch patient details
        const patientRef = ref(db, `patients/${userId}`)
        const patientSnapshot = await get(patientRef)

        if (patientSnapshot.exists()) {
          const patientData = patientSnapshot.val()

          // Get patient basic details
          const details: PatientDetails = {
            name: patientData.name || "Unknown",
            age: patientData.age || "N/A",
            gender: patientData.gender || "N/A",
          }

          // Get IPD details including bed
          if (patientData.ipd && patientData.ipd[ipdId]) {
            const ipdData = patientData.ipd[ipdId]
            details.bed = ipdData.bed || "N/A"
            details.roomType = ipdData.roomType || "N/A"
          }

          setPatientDetails(details)

          // Check if OT data already exists
          if (patientData.ot) {
            const otData = patientData.ot
            setDate(otData.date || currentDate)
            setTime(otData.time || currentTime)
            setMessage(otData.message || "")
          }
        }
      } catch (error) {
        console.error("Error fetching patient data:", error)
        toast.error("Failed to load patient data")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [userId, ipdId, currentDate, currentTime])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!date || !time) {
      toast.error("Date and time are required")
      return
    }

    setIsSubmitting(true)

    try {
      // Create a reference directly to the OT node for this user (without push)
      const otRef = ref(db, `patients/${userId}/ot`)

      // Prepare the data to save
      const otData: OTData = {
        ipdId,
        date,
        time,
        message: message.trim(),
        createdAt: serverTimestamp(),
      }

      // Save the data directly to the OT node
      await set(otRef, otData)

      toast.success("Operation Theater entry saved successfully!")

      // Navigate back to patients page after a short delay
      setTimeout(() => {
        router.push("/patients")
      }, 2000)
    } catch (error) {
      console.error("Error saving OT entry:", error)
      toast.error("Failed to save OT entry. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12">
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="container mx-auto px-4">
        <Card className="max-w-2xl mx-auto shadow-lg">
          <CardHeader className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-t-lg">
            <div className="flex items-center gap-3 mb-2">
              <Stethoscope className="h-8 w-8" />
              <CardTitle className="text-2xl font-bold">Operation Theater Entry</CardTitle>
            </div>

            {patientDetails && (
              <div className="mt-4 space-y-1 text-emerald-50">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <p className="font-medium">
                    {patientDetails.name} ({patientDetails.age} yrs, {patientDetails.gender})
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <p>
                    Patient ID: {userId} | IPD ID: {ipdId}
                  </p>
                </div>
                {patientDetails.bed && (
                  <div className="flex items-center gap-2">
                    <Bed className="h-4 w-4" />
                    <p>
                      Bed: {patientDetails.bed} | Room Type: {patientDetails.roomType}
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardHeader>

          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Date Field */}
                <div className="space-y-2">
                  <Label htmlFor="date" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-emerald-500" />
                    <span>Surgery Date</span>
                  </Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="border-slate-300"
                    required
                  />
                </div>

                {/* Time Field */}
                <div className="space-y-2">
                  <Label htmlFor="time" className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-emerald-500" />
                    <span>Surgery Time</span>
                  </Label>
                  <Input
                    id="time"
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="border-slate-300"
                    required
                  />
                </div>
              </div>

              {/* Message Field (Optional) */}
              <div className="space-y-2">
                <Label htmlFor="message" className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-emerald-500" />
                  <span>Surgical Notes</span>
                </Label>
                <Textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Enter surgical procedure details, notes, or instructions"
                  className="border-slate-300 min-h-[120px]"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  className="border-slate-300"
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      Saving...
                    </>
                  ) : (
                    "Save OT Entry"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
