"use client"

import { useState, useEffect } from "react"
import { db } from "../../lib/firebase" // Gautami DB
import { ref, onValue } from "firebase/database"
import { Search, X, User, Phone, Cake, FileText, AlertTriangle, Building, Ambulance } from "lucide-react"
import { format } from "date-fns"
import { useRouter } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface CasualtyPatient {
  id: string
  patientId: string
  name: string
  phone: string
  age: number
  gender: string
  date: string
  time: string
  doctor?: string
  serviceName?: string
  appointmentType: "oncall" | "visithospital"
  opdType: "casualty"
  createdAt: string
  // Casualty specific fields
  modeOfArrival?: "ambulance" | "walkin" | "referred"
  broughtBy?: string
  referralHospital?: string
  broughtDead?: boolean
  caseType?: string
  otherCaseType?: string
  incidentDescription?: string
  isMLC?: boolean
  mlcNumber?: string
  policeInformed?: boolean
  services?: Array<{ name: string; amount: number }>
}

const CasualtyPatientsList = () => {
  const router = useRouter()
  const [casualtyPatients, setCasualtyPatients] = useState<CasualtyPatient[]>([])
  const [filteredPatients, setFilteredPatients] = useState<CasualtyPatient[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [dateFilter, setDateFilter] = useState<string>("all")
  const [loading, setLoading] = useState(true)

  // Fetch casualty patients from Firebase
  useEffect(() => {
    setLoading(true)

    // Function to fetch patients from a specific path
    const fetchPatientsFromPath = (path: string) => {
      const patientsRef = ref(db, path)
      return new Promise<CasualtyPatient[]>((resolve) => {
        onValue(patientsRef, (snapshot) => {
          const data = snapshot.val()
          const patients: CasualtyPatient[] = []

          if (data) {
            // For regular patients with OPD records
            Object.keys(data).forEach((patientId) => {
              const patient = data[patientId]

              // Check if patient has OPD records
              if (patient.opd) {
                Object.keys(patient.opd).forEach((opdId) => {
                  const opdRecord = patient.opd[opdId]

                  // Only include casualty patients
                  if (opdRecord.opdType === "casualty") {
                    patients.push({
                      id: opdId,
                      patientId,
                      name: patient.name,
                      phone: patient.phone,
                      age: patient.age,
                      gender: patient.gender,
                      date: opdRecord.date,
                      time: opdRecord.time,
                      doctor: opdRecord.doctor,
                      serviceName: opdRecord.serviceName,
                      appointmentType: opdRecord.appointmentType,
                      opdType: opdRecord.opdType,
                      createdAt: opdRecord.createdAt,
                      // Casualty specific fields
                      modeOfArrival: opdRecord.modeOfArrival,
                      broughtBy: opdRecord.broughtBy,
                      referralHospital: opdRecord.referralHospital,
                      broughtDead: opdRecord.broughtDead,
                      caseType: opdRecord.caseType,
                      otherCaseType: opdRecord.otherCaseType,
                      incidentDescription: opdRecord.incidentDescription,
                      isMLC: opdRecord.isMLC,
                      mlcNumber: opdRecord.mlcNumber,
                      policeInformed: opdRecord.policeInformed,
                      services: opdRecord.services || [],
                    })
                  }
                })
              }
            })
          }

          resolve(patients)
        })
      })
    }

    // Function to fetch on-call patients
    const fetchOncallPatients = () => {
      const oncallRef = ref(db, "oncall")
      return new Promise<CasualtyPatient[]>((resolve) => {
        onValue(oncallRef, (snapshot) => {
          const data = snapshot.val()
          const patients: CasualtyPatient[] = []

          if (data) {
            Object.keys(data).forEach((id) => {
              const record = data[id]

              // Only include casualty patients
              if (record.opdType === "casualty") {
                patients.push({
                  id,
                  patientId: id,
                  name: record.name,
                  phone: record.phone,
                  age: record.age,
                  gender: record.gender,
                  date: record.date,
                  time: record.time,
                  doctor: record.doctor,
                  serviceName: record.serviceName,
                  appointmentType: record.appointmentType,
                  opdType: record.opdType,
                  createdAt: record.createdAt,
                  // Casualty specific fields
                  modeOfArrival: record.modeOfArrival,
                  broughtBy: record.broughtBy,
                  referralHospital: record.referralHospital,
                  broughtDead: record.broughtDead,
                  caseType: record.caseType,
                  otherCaseType: record.otherCaseType,
                  incidentDescription: record.incidentDescription,
                  isMLC: record.isMLC,
                  mlcNumber: record.mlcNumber,
                  policeInformed: record.policeInformed,
                  services: record.services || [],
                })
              }
            })
          }

          resolve(patients)
        })
      })
    }

    // Fetch from both sources and combine
    Promise.all([fetchPatientsFromPath("patients"), fetchOncallPatients()]).then(
      ([regularPatients, oncallPatients]) => {
        const allPatients = [...regularPatients, ...oncallPatients]

        // Sort by createdAt in descending order (latest first)
        allPatients.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

        setCasualtyPatients(allPatients)
        setFilteredPatients(allPatients)
        setLoading(false)
      },
    )
  }, [])

  // Filter patients when search query or date filter changes
  useEffect(() => {
    let filtered = [...casualtyPatients]

    // Apply search filter
    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (patient) =>
          patient.name.toLowerCase().includes(query) ||
          patient.phone.includes(query) ||
          (patient.serviceName && patient.serviceName.toLowerCase().includes(query)) ||
          (patient.mlcNumber && patient.mlcNumber.toLowerCase().includes(query)),
      )
    }

    // Apply date filter
    if (dateFilter !== "all") {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      if (dateFilter === "today") {
        filtered = filtered.filter((patient) => {
          const patientDate = new Date(patient.date)
          patientDate.setHours(0, 0, 0, 0)
          return patientDate.getTime() === today.getTime()
        })
      } else if (dateFilter === "week") {
        const weekAgo = new Date(today)
        weekAgo.setDate(weekAgo.getDate() - 7)

        filtered = filtered.filter((patient) => {
          const patientDate = new Date(patient.date)
          return patientDate >= weekAgo && patientDate <= today
        })
      } else if (dateFilter === "month") {
        const monthAgo = new Date(today)
        monthAgo.setMonth(monthAgo.getMonth() - 1)

        filtered = filtered.filter((patient) => {
          const patientDate = new Date(patient.date)
          return patientDate >= monthAgo && patientDate <= today
        })
      }
    }

    setFilteredPatients(filtered)
  }, [searchQuery, dateFilter, casualtyPatients])

  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "dd MMM yyyy")
    } catch (error) {
      return dateString
    }
  }

  // Navigate to patient details page
  const handleViewDetails = (patient: CasualtyPatient) => {
    router.push(`/casualitymanage/${patient.patientId}/${patient.id}`)
  }

  // Get case type label
  const getCaseTypeLabel = (caseType?: string, otherCaseType?: string) => {
    if (!caseType) return "Not specified"

    const caseTypeMap: Record<string, string> = {
      rta: "Road Traffic Accident (RTA)",
      physicalAssault: "Physical Assault",
      burn: "Burn",
      poisoning: "Poisoning",
      snakeBite: "Snake/Insect Bite",
      cardiac: "Cardiac Emergency",
      fall: "Fall",
      other: otherCaseType || "Other",
    }

    return caseTypeMap[caseType] || caseType
  }

  // Get mode of arrival label
  const getModeOfArrivalLabel = (mode?: string) => {
    if (!mode) return "Not specified"

    const modeMap: Record<string, string> = {
      ambulance: "Ambulance",
      walkin: "Walk-in",
      referred: "Referred",
    }

    return modeMap[mode] || mode
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">Casualty Patients</h3>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search patients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
            {searchQuery && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                onClick={() => setSearchQuery("")}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 Days</SelectItem>
              <SelectItem value="month">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
      ) : filteredPatients.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {searchQuery || dateFilter !== "all" ? "No matching casualty patients found" : "No casualty patients found"}
        </div>
      ) : (
        <ScrollArea className="h-[500px]">
          <div className="space-y-4">
            {filteredPatients.map((patient) => (
              <Card key={patient.id} className="overflow-hidden">
                <CardHeader className="bg-red-50 dark:bg-red-900/20 p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-lg">{patient.name}</CardTitle>
                      <CardDescription>
                        {formatDate(patient.date)} at {patient.time}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {patient.broughtDead && (
                        <Badge variant="destructive" className="mr-2">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Brought Dead
                        </Badge>
                      )}
                      {patient.isMLC && (
                        <Badge variant="outline" className="border-red-500 text-red-500">
                          MLC
                        </Badge>
                      )}
                      <Badge variant="destructive">Casualty</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-gray-500" />
                      <div className="font-medium">Phone:</div>
                    </div>
                    <div>{patient.phone}</div>

                    <div className="flex items-center gap-2">
                      <Cake className="h-4 w-4 text-gray-500" />
                      <div className="font-medium">Age:</div>
                    </div>
                    <div>{patient.age}</div>

                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-500" />
                      <div className="font-medium">Gender:</div>
                    </div>
                    <div>{patient.gender}</div>

                    <div className="flex items-center gap-2">
                      <Ambulance className="h-4 w-4 text-gray-500" />
                      <div className="font-medium">Arrival:</div>
                    </div>
                    <div>{getModeOfArrivalLabel(patient.modeOfArrival)}</div>

                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-gray-500" />
                      <div className="font-medium">Case Type:</div>
                    </div>
                    <div>{getCaseTypeLabel(patient.caseType, patient.otherCaseType)}</div>

                    {patient.isMLC && (
                      <>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-gray-500" />
                          <div className="font-medium">MLC Number:</div>
                        </div>
                        <div>{patient.mlcNumber || "Not provided"}</div>
                      </>
                    )}

                    {patient.referralHospital && (
                      <>
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4 text-gray-500" />
                          <div className="font-medium">Referral:</div>
                        </div>
                        <div>{patient.referralHospital}</div>
                      </>
                    )}

                    {patient.serviceName && (
                      <>
                        <div className="font-medium">Service:</div>
                        <div>{patient.serviceName}</div>
                      </>
                    )}

                    {patient.doctor && (
                      <>
                        <div className="font-medium">Doctor:</div>
                        <div>{patient.doctor}</div>
                      </>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="bg-gray-50 dark:bg-gray-900 p-3 flex justify-between">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-xs bg-red-100 text-red-700">
                        {patient.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-gray-500">
                      Created: {format(new Date(patient.createdAt), "dd MMM yyyy, HH:mm")}
                    </span>
                  </div>
                  <Button size="sm" onClick={() => handleViewDetails(patient)}>
                    View Details
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

export default CasualtyPatientsList
