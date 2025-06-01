"use client"

import { useState, useEffect } from "react"
import { ref, onValue, remove } from "firebase/database"
import { db } from "../../lib/firebase"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
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
import { Trash2 } from "lucide-react"
import { MagnifyingGlassIcon, Cross2Icon } from "@radix-ui/react-icons"
import { toast } from "react-toastify"

interface OnCallAppointment {
  id: string
  name: string
  phone: string
  age: number
  gender: string
  date: string
  time: string
  doctor?: string
  serviceName?: string
  appointmentType: "oncall"
  createdAt: string
  opdType: "opd"
}

interface Doctor {
  id: string
  name: string
  opdCharge: number
  specialty?: string
}

interface OnCallListProps {
  onBookOPDVisit: (appointment: OnCallAppointment) => void
  onBookOnCall: () => void
  doctors: Doctor[]
}

export default function OnCallList({ onBookOPDVisit, onBookOnCall, doctors }: OnCallListProps) {
  const [oncallAppointments, setOncallAppointments] = useState<OnCallAppointment[]>([])
  const [filteredOncallAppointments, setFilteredOncallAppointments] = useState<OnCallAppointment[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [appointmentToDelete, setAppointmentToDelete] = useState<string | null>(null)

  // Fetch oncall appointments
  useEffect(() => {
    const oncallRef = ref(db, "oncall")
    const unsubscribe = onValue(oncallRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const appointments = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }))
        // Sort by createdAt in descending order (latest first)
        appointments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        setOncallAppointments(appointments)
        setFilteredOncallAppointments(appointments)
      } else {
        setOncallAppointments([])
        setFilteredOncallAppointments([])
      }
    })
    return () => unsubscribe()
  }, [])

  // Filter oncall appointments when search query changes
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredOncallAppointments(oncallAppointments)
    } else {
      const query = searchQuery.toLowerCase()
      const filtered = oncallAppointments.filter(
        (appointment) =>
          appointment.name.toLowerCase().includes(query) ||
          appointment.phone.includes(query) ||
          (appointment.serviceName && appointment.serviceName.toLowerCase().includes(query)),
      )
      setFilteredOncallAppointments(filtered)
    }
  }, [searchQuery, oncallAppointments])

  const handleDeleteAppointment = async () => {
    if (!appointmentToDelete) return

    try {
      const appointmentRef = ref(db, `oncall/${appointmentToDelete}`)
      await remove(appointmentRef)
      toast.success("Appointment deleted successfully")
      setAppointmentToDelete(null)
      setDeleteDialogOpen(false)
    } catch (error) {
      console.error("Error deleting appointment:", error)
      toast.error("Failed to delete appointment")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
          On-Call Appointments ({filteredOncallAppointments.length})
        </h3>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative flex-1 sm:w-64">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search by name, phone, or service..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
            {searchQuery && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                onClick={() => setSearchQuery("")}
              >
                <Cross2Icon className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button onClick={onBookOnCall} className="bg-emerald-600 hover:bg-emerald-700">
            Book On-Call
          </Button>
        </div>
      </div>

      {filteredOncallAppointments.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-500 mb-4">
            {searchQuery ? "No matching appointments found" : "No on-call appointments found"}
          </div>
          {!searchQuery && (
            <Button onClick={onBookOnCall} variant="outline">
              Book First On-Call Appointment
            </Button>
          )}
        </div>
      ) : (
        <ScrollArea className="h-[600px]">
          <div className="space-y-4">
            {filteredOncallAppointments.map((appointment) => (
              <Card key={appointment.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <CardHeader className="bg-emerald-50 dark:bg-gray-800 p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-lg font-semibold">{appointment.name}</CardTitle>
                      <CardDescription className="text-sm">
                        {new Date(appointment.date).toLocaleDateString("en-IN")} at {appointment.time}
                      </CardDescription>
                    </div>
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                      On-Call
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-600">Phone:</span>
                        <span className="font-mono">{appointment.phone}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-600">Age:</span>
                        <span>{appointment.age} years</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-600">Gender:</span>
                        <span className="capitalize">{appointment.gender}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {appointment.serviceName && (
                        <div className="flex justify-between">
                          <span className="font-medium text-gray-600">Service:</span>
                          <span>{appointment.serviceName}</span>
                        </div>
                      )}
                      {appointment.doctor && (
                        <div className="flex justify-between">
                          <span className="font-medium text-gray-600">Doctor:</span>
                          <span>{doctors.find((d) => d.id === appointment.doctor)?.name || appointment.doctor}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-600">Booked:</span>
                        <span className="text-xs">{new Date(appointment.createdAt).toLocaleString("en-IN")}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="bg-gray-50 dark:bg-gray-900 p-3 flex justify-between">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                    onClick={() => {
                      setAppointmentToDelete(appointment.id)
                      setDeleteDialogOpen(true)
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => onBookOPDVisit(appointment)}
                  >
                    Convert to OPD Visit
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete On-Call Appointment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this on-call appointment? This action cannot be undone and all associated
              data will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAppointmentToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAppointment}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Delete Appointment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
