"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { db } from "../../lib/firebase"
import { ref, onValue } from "firebase/database"
import Head from "next/head"
import { format } from "date-fns"
import { Search, Download, FileText, Calendar, User, Activity, Users } from "lucide-react"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import * as XLSX from "xlsx"
import jsPDF from "jspdf"
import "jspdf-autotable"

// ─────────────────── Interfaces ───────────────────
interface IDoctorEntry {
  department: string
  id: string
  ipdCharges?: Record<string, number>
  name: string
  opdCharge?: number
  specialist?: string
}

export interface IAppointment {
  id: string
  name: string
  phone: string
  type: "OPD" | "IPD" | "Pathology" | "Surgery" | "Mortality"
  date: string
  doctor: string
  uhid: string
}

interface IPatientRecord {
  address?: string
  age?: string | number
  createdAt?: string | number
  gender?: string
  name?: string
  phone?: string
  uhid?: string
  opd?: Record<string, any>
  ipd?: Record<string, any>
  pathology?: Record<string, any>
  surgery?: Record<string, any>
  mortality?: Record<string, any>
}

// ─────────────────── Component ───────────────────
const PatientManagement: React.FC = () => {
  const router = useRouter()

  // ---------- State ----------
  const [doctors, setDoctors] = useState<IDoctorEntry[]>([])
  const [appointments, setAppointments] = useState<IAppointment[]>([])
  const [filteredAppointments, setFilteredAppointments] = useState<IAppointment[]>([])
  const [loading, setLoading] = useState<boolean>(true)

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [selectedType, setSelectedType] = useState<string>("all")
  const todayISO = format(new Date(), "yyyy-MM-dd")
  const [startDate, setStartDate] = useState<string>(todayISO)
  const [endDate, setEndDate] = useState<string>(todayISO)

  // Raw data
  const [rawPatients, setRawPatients] = useState<{ [uhid: string]: IPatientRecord }>({})
  const doctorMap = useRef<{ [doctorId: string]: string }>({})

  // ---------- Fetch doctors ----------
  useEffect(() => {
    const doctorsRef = ref(db, "doctors")
    const unsub = onValue(doctorsRef, (snap) => {
      const val = snap.val()
      if (val) {
        const docs: IDoctorEntry[] = Object.entries(val).map(([id, v]: any) => ({ ...v, id }))
        setDoctors(docs)
        console.log("Doctors loaded:", docs)
      } else {
        setDoctors([])
      }
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    doctorMap.current = doctors.reduce((acc, d) => ({ ...acc, [d.id]: d.name }), {} as Record<string, string>)
  }, [doctors])

  // ---------- Fetch patients ----------
  useEffect(() => {
    const patRef = ref(db, "patients")
    const unsub = onValue(
      patRef,
      (snap) => {
        const val = snap.val()
        const list: IAppointment[] = []
        const raw: { [uhid: string]: IPatientRecord } = {}

        console.log("Raw patient data:", val)

        if (val) {
          Object.entries(val).forEach(([uhid, pdataRaw]) => {
            const pdata = pdataRaw as IPatientRecord
            raw[uhid] = pdata
            const name = pdata.name || "Unknown"
            const phone = pdata.phone || ""

            // Helper function to create appointment entries
            const pushItem = (key: string, type: IAppointment["type"], appointmentData: any) => {
              let date = new Date().toISOString()

              // Handle different date formats
              if (appointmentData.date) {
                try {
                  date = new Date(appointmentData.date).toISOString()
                } catch (e) {
                  console.warn("Invalid date format:", appointmentData.date)
                }
              } else if (appointmentData.createdAt) {
                try {
                  if (typeof appointmentData.createdAt === "number") {
                    date = new Date(appointmentData.createdAt).toISOString()
                  } else {
                    date = new Date(appointmentData.createdAt).toISOString()
                  }
                } catch (e) {
                  console.warn("Invalid createdAt format:", appointmentData.createdAt)
                }
              }

              list.push({
                id: `${uhid}_${key}`,
                name,
                phone,
                type,
                date,
                doctor: appointmentData.doctor || "",
                uhid,
              })
            }

            // Process OPD appointments
            if (pdata.opd) {
              Object.entries(pdata.opd).forEach(([k, v]: any) => {
                pushItem(k, "OPD", v)
              })
            }

            // Process IPD appointments
            if (pdata.ipd) {
              Object.entries(pdata.ipd).forEach(([k, v]: any) => {
                pushItem(k, "IPD", v)
              })
            }

            // Process Pathology
            if (pdata.pathology) {
              Object.entries(pdata.pathology).forEach(([k, v]: any) => {
                pushItem(k, "Pathology", v)
              })
            }

            // Process Surgery
            if (pdata.surgery) {
              Object.entries(pdata.surgery).forEach(([k, v]: any) => {
                pushItem(k, "Surgery", v)
              })
            }

            // Process Mortality
            if (pdata.mortality) {
              Object.entries(pdata.mortality).forEach(([k, v]: any) => {
                pushItem(k, "Mortality", v)
              })
            }
          })
        }

        console.log("Processed appointments:", list)
        setRawPatients(raw)
        setAppointments(list)
        setFilteredAppointments(list)
        setLoading(false)
      },
      (error) => {
        console.error("Firebase error:", error)
        setLoading(false)
        toast.error("Failed to load patient data")
      },
    )
    return () => unsub()
  }, [])

  // ---------- Filters ----------
  useEffect(() => {
    let tmp = [...appointments]

    // Filter by type
    if (selectedType !== "all") {
      tmp = tmp.filter((a) => a.type.toLowerCase() === selectedType.toLowerCase())
    }

    // Filter by date range
    try {
      const startDateTime = new Date(startDate + "T00:00:00")
      const endDateTime = new Date(endDate + "T23:59:59")

      tmp = tmp.filter((a) => {
        const appointmentDate = new Date(a.date)
        return appointmentDate >= startDateTime && appointmentDate <= endDateTime
      })
    } catch (e) {
      console.warn("Date filter error:", e)
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      tmp = tmp.filter(
        (a) => a.name.toLowerCase().includes(q) || a.phone.includes(q) || a.uhid.toLowerCase().includes(q),
      )
    }

    // Sort by date (latest first)
    tmp.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    setFilteredAppointments(tmp)
  }, [appointments, selectedType, startDate, endDate, searchQuery])

  // ---------- Handlers ----------
  const handleRowClick = (a: IAppointment) => {
    router.push(`/allusermanage/${a.uhid}`)
  }

  const handleToday = () => {
    const today = format(new Date(), "yyyy-MM-dd")
    setStartDate(today)
    setEndDate(today)
  }

  // ---------- Export ----------
  const exportExcel = () => {
    const data = filteredAppointments.map((i) => ({
      "Patient Name": i.name,
      Phone: i.phone,
      UHID: i.uhid,
      Type: i.type,
      Date: format(new Date(i.date), "PPP"),
      Doctor: doctorMap.current[i.doctor] || "N/A",
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Patients")
    XLSX.writeFile(wb, `Patient_Management_${format(new Date(), "yyyyMMdd")}.xlsx`)
    toast.success("Excel file downloaded successfully!")
  }

  const exportPdf = () => {
    const doc = new jsPDF()
    doc.setFontSize(18)
    doc.text("Patient Management Report", 14, 22)
    doc.setFontSize(11)
    doc.text(`Generated on: ${format(new Date(), "PPP")}`, 14, 32)

    const cols = ["Name", "Phone", "UHID", "Type", "Date", "Doctor"]
    const rows = filteredAppointments.map((i) => [
      i.name,
      i.phone,
      i.uhid,
      i.type,
      format(new Date(i.date), "PPP"),
      doctorMap.current[i.doctor] || "N/A",
    ])
    ;(doc as any).autoTable({
      head: [cols],
      body: rows,
      startY: 40,
      headStyles: { fillColor: [22, 160, 133] },
      alternateRowStyles: { fillColor: [242, 242, 242] },
      styles: { fontSize: 8 },
    })

    doc.save(`Patient_Management_${format(new Date(), "yyyyMMdd_HHmmss")}.pdf`)
    toast.success("PDF file downloaded successfully!")
  }

  // ---------- Stats ----------
  const total = appointments.length
  const opd = appointments.filter((p) => p.type === "OPD").length
  const ipd = appointments.filter((p) => p.type === "IPD").length
  const pathology = appointments.filter((p) => p.type === "Pathology").length
  const surgery = appointments.filter((p) => p.type === "Surgery").length
  const mortality = appointments.filter((p) => p.type === "Mortality").length

  // ---------- JSX ----------
  return (
    <>
      <Head>
        <title>Patient Management - Admin Dashboard</title>
        <meta name="description" content="Admin Dashboard for Patient Management" />
      </Head>

      <ToastContainer position="top-right" />

      <main className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold text-center text-green-600 mb-10">Patient Management Dashboard</h1>

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-green-500" />
            </div>
          ) : (
            <>
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6 mb-10">
                <StatCard title="Total Records" value={total} icon={<Users className="text-green-500" size={24} />} />
                <StatCard title="OPD" value={opd} icon={<User className="text-blue-500" size={24} />} />
                <StatCard title="IPD" value={ipd} icon={<Activity className="text-red-500" size={24} />} />
                <StatCard
                  title="Pathology"
                  value={pathology}
                  icon={<FileText className="text-yellow-500" size={24} />}
                />
                <StatCard title="Surgery" value={surgery} icon={<Activity className="text-purple-500" size={24} />} />
                <StatCard title="Mortality" value={mortality} icon={<FileText className="text-gray-500" size={24} />} />
              </div>

              {/* Filters */}
              <div className="bg-white p-6 rounded-lg shadow-md mb-10">
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">
                  {/* Search */}
                  <FilterLabel label="Search Patients">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Name, Phone, or UHID"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                      <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
                    </div>
                  </FilterLabel>

                  {/* Type Filter */}
                  <FilterLabel label="Filter by Type">
                    <select
                      value={selectedType}
                      onChange={(e) => setSelectedType(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="all">All Types</option>
                      <option value="opd">OPD</option>
                      <option value="ipd">IPD</option>
                      <option value="pathology">Pathology</option>
                      <option value="surgery">Surgery</option>
                      <option value="mortality">Mortality</option>
                    </select>
                  </FilterLabel>

                  {/* Start Date */}
                  <FilterLabel label="Start Date">
                    <DateInput value={startDate} onChange={setStartDate} />
                  </FilterLabel>

                  {/* End Date */}
                  <FilterLabel label="End Date">
                    <DateInput value={endDate} onChange={setEndDate} />
                  </FilterLabel>

                  {/* Today Button */}
                  <div className="flex items-end">
                    <button
                      onClick={handleToday}
                      className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-md transition duration-200"
                    >
                      Today
                    </button>
                  </div>

                  {/* Export Buttons */}
                  <div className="flex space-x-2">
                    <ExportButton onClick={exportExcel} icon={<Download className="mr-2" size={16} />}>
                      Excel
                    </ExportButton>
                    <ExportButton onClick={exportPdf} icon={<FileText className="mr-2" size={16} />}>
                      PDF
                    </ExportButton>
                  </div>
                </div>
              </div>

              {/* Results Summary */}
              <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                <p className="text-sm text-gray-600">
                  Showing {filteredAppointments.length} of {total} total records
                  {searchQuery && ` for "${searchQuery}"`}
                  {selectedType !== "all" && ` in ${selectedType.toUpperCase()}`}
                </p>
              </div>

              {/* Table */}
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <Th>Patient Name</Th>
                        <Th>Phone Number</Th>
                        <Th>UHID</Th>
                        <Th>Type</Th>
                        <Th>Date</Th>
                        <Th>Doctor</Th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredAppointments.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">
                            {loading ? "Loading..." : "No patients found matching your criteria."}
                          </td>
                        </tr>
                      ) : (
                        filteredAppointments.map((appt) => (
                          <tr
                            key={appt.id}
                            className="hover:bg-gray-50 cursor-pointer transition duration-150"
                            onClick={() => handleRowClick(appt)}
                          >
                            <TdName name={appt.name} />
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{appt.phone || "N/A"}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">{appt.uhid}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <TypeBadge type={appt.type} />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {format(new Date(appt.date), "PPP")}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {doctorMap.current[appt.doctor] || "N/A"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  )
}

// ─────────────────── Helper Components ───────────────────
const StatCard: React.FC<{ title: string; value: number; icon: React.ReactNode }> = ({ title, value, icon }) => (
  <div className="bg-white p-6 rounded-lg shadow-md">
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
      {icon}
    </div>
    <p className="text-2xl font-bold text-gray-900">{value}</p>
  </div>
)

const FilterLabel: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    {children}
  </div>
)

const DateInput: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <div className="relative">
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full pl-10 pr-4 py-2 border rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
    />
    <Calendar className="absolute left-3 top-2.5 text-gray-400" size={20} />
  </div>
)

const ExportButton: React.FC<{ onClick: () => void; icon: React.ReactNode; children: React.ReactNode }> = ({
  onClick,
  icon,
  children,
}) => (
  <button
    onClick={onClick}
    className="flex items-center justify-center bg-green-500 text-white px-3 py-2 rounded-md hover:bg-green-600 transition duration-300 text-sm"
  >
    {icon}
    {children}
  </button>
)

const Th: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{children}</th>
)

const TdName: React.FC<{ name: string }> = ({ name }) => (
  <td className="px-6 py-4 whitespace-nowrap">
    <div className="flex items-center">
      <div className="flex-shrink-0 h-10 w-10">
        <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
          <User className="h-6 w-6 text-gray-400" />
        </div>
      </div>
      <div className="ml-4">
        <div className="text-sm font-medium text-gray-900">{name}</div>
      </div>
    </div>
  </td>
)

const TypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const getTypeStyles = (type: string) => {
    switch (type) {
      case "OPD":
        return "bg-green-100 text-green-800"
      case "IPD":
        return "bg-yellow-100 text-yellow-800"
      case "Pathology":
        return "bg-blue-100 text-blue-800"
      case "Surgery":
        return "bg-purple-100 text-purple-800"
      case "Mortality":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  return (
    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getTypeStyles(type)}`}>
      {type}
    </span>
  )
}

export default PatientManagement
