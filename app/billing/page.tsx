"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { ref, onValue } from "firebase/database"
import { db } from "@/lib/firebase"
import { useRouter } from "next/navigation"
import {
  Search,
  Edit,
  Users,
  CreditCard,
  Home,
  XCircle,
  CheckCircle,
  FileText,
  Clipboard,
  Stethoscope,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface ServiceItem {
  serviceName: string
  doctorName?: string
  type: "service" | "doctorvisit"
  amount: number
  createdAt?: string
}

interface Payment {
  id?: string
  amount: number
  paymentType: string
  date: string
}

export interface BillingRecord {
  patientId: string
  ipdId: string
  name: string
  mobileNumber: string
  address?: string
  age?: string | number
  gender?: string
  relativeName?: string
  relativePhone?: string
  relativeAddress?: string
  dischargeDate?: string
  amount: number // totalDeposit
  roomType?: string
  bed?: string
  services: ServiceItem[]
  payments: Payment[]
  discount?: number
}

export default function PatientsPage() {
  const [demographics, setDemographics] = useState<
    Record<
      string,
      {
        name: string
        phone: string
        address?: string
        age?: string | number
        gender?: string
      }
    >
  >({})
  const [ipdInfo, setIpdInfo] = useState<
    Record<
      string,
      // each patientId maps to an object of ipdId → ipdNode
      Record<
        string,
        {
          relativeName?: string
          relativePhone?: string
          relativeAddress?: string
          roomType?: string
          bed?: string
          services?: any[]
          dischargeDate?: string
          discount?: number
        }
      >
    >
  >({})
  const [billingInfo, setBillingInfo] = useState<
    Record<
      string,
      // each patientId maps to an object of ipdId → billing node ({ totalDeposit, payments: { [paymentId]: { ... } }})
      Record<
        string,
        {
          totalDeposit?: number
          payments?: Record<string, { amount: number; paymentType: string; date: string; type?: string }>
        }
      >
    >
  >({})
  const [allRecords, setAllRecords] = useState<BillingRecord[]>([])
  const [filteredRecords, setFilteredRecords] = useState<BillingRecord[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedTab, setSelectedTab] = useState<"non-discharge" | "discharge">("non-discharge")
  const [selectedWard, setSelectedWard] = useState("All")
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  /* ----------------------------------------
     1) Load all patient demographics once
  ----------------------------------------- */
  useEffect(() => {
    const infoRef = ref(db, "patients/patientinfo")
    const unsubscribe = onValue(infoRef, (snap) => {
      if (!snap.exists()) {
        setDemographics({})
        return
      }
      const data: Record<string, any> = snap.val()
      const demoMap: typeof demographics = {}
      Object.keys(data).forEach((pid) => {
        const node = data[pid] || {}
        demoMap[pid] = {
          name: node.name || "Unknown",
          phone: node.phone || "",
          address: node.address || "",
          age: node.age || "",
          gender: node.gender || "",
        }
      })
      setDemographics(demoMap)
    })
    return () => unsubscribe()
  }, [])

  /* ----------------------------------------
     2) Load all IPD details once
  ----------------------------------------- */
  useEffect(() => {
    const ipdRef = ref(db, "patients/ipddetail/userinfoipd")
    const unsubscribe = onValue(ipdRef, (snap) => {
      if (!snap.exists()) {
        setIpdInfo({})
        return
      }
      const data: Record<string, any> = snap.val()
      const ipdMap: typeof ipdInfo = {}
      Object.keys(data).forEach((pid) => {
        const perPatient: Record<string, any> = data[pid] || {}
        ipdMap[pid] = {}
        Object.keys(perPatient).forEach((ipdId) => {
          const ipdNode = perPatient[ipdId] || {}
          ipdMap[pid][ipdId] = {
            relativeName: ipdNode.relativeName || "",
            relativePhone: ipdNode.relativePhone || "",
            relativeAddress: ipdNode.relativeAddress || "",
            roomType: ipdNode.roomType || "",
            bed: ipdNode.bed || "",
            services: ipdNode.services || [],
            dischargeDate: ipdNode.dischargeDate || "",
            discount: ipdNode.discount ? Number(ipdNode.discount) : 0,
          }
        })
      })
      setIpdInfo(ipdMap)
    })
    return () => unsubscribe()
  }, [])

  /* ----------------------------------------
     3) Load all billing details once
  ----------------------------------------- */
  useEffect(() => {
    const billingRef = ref(db, "patients/ipddetail/userbillinginfoipd")
    const unsubscribe = onValue(billingRef, (snap) => {
      if (!snap.exists()) {
        setBillingInfo({})
        return
      }
      const data: Record<string, any> = snap.val()
      const billMap: typeof billingInfo = {}
      Object.keys(data).forEach((pid) => {
        const perPatient: Record<string, any> = data[pid] || {}
        billMap[pid] = {}
        Object.keys(perPatient).forEach((ipdId) => {
          const billingNode = perPatient[ipdId] || {}
          billMap[pid][ipdId] = {
            totalDeposit: billingNode.totalDeposit ? Number(billingNode.totalDeposit) : 0,
            payments: billingNode.payments || {},
          }
        })
      })
      setBillingInfo(billMap)
    })
    return () => unsubscribe()
  }, [])

  /* ----------------------------------------------------
     4) Whenever any of demographics, ipdInfo, billingInfo
       changes, recombine into a flat array of BillingRecord
  ----------------------------------------------------- */
  useEffect(() => {
    // Mark loading done once we have attempted to fetch
    setIsLoading(false)

    const combined: BillingRecord[] = []

    // ipdInfo: { [pid]: { [ipdId]: ipdNode } }
    Object.keys(ipdInfo).forEach((pid) => {
      const perPatientIpds = ipdInfo[pid] || {}
      const demo = demographics[pid] || {
        name: "Unknown",
        phone: "",
        address: "",
        age: "",
        gender: "",
      }
      const perBilling = billingInfo[pid] || {}

      Object.keys(perPatientIpds).forEach((ipdId) => {
        const ipdNode = perPatientIpds[ipdId]
        const billingNode = perBilling[ipdId] || { totalDeposit: 0, payments: {} }

        // Build services array:
        const servicesArray: ServiceItem[] = []
        if (Array.isArray(ipdNode.services)) {
          ipdNode.services.forEach((svc: any) => {
            servicesArray.push({
              serviceName: svc.serviceName || "",
              doctorName: svc.doctorName || "",
              type: svc.type || "service",
              amount: Number(svc.amount) || 0,
              createdAt: svc.createdAt || "",
            })
          })
        }

        // Build payments array from billingNode.payments
        const paymentsArray: Payment[] = []
        if (billingNode.payments) {
          Object.keys(billingNode.payments).forEach((payId) => {
            const pay = billingNode.payments![payId]
            paymentsArray.push({
              id: payId,
              amount: Number(pay.amount) || 0,
              paymentType: pay.paymentType || "cash",
              date: pay.date || new Date().toISOString(),
            })
          })
        }

        combined.push({
          patientId: pid,
          ipdId,
          name: demo.name,
          mobileNumber: demo.phone,
          address: demo.address,
          age: demo.age,
          gender: demo.gender,
          relativeName: ipdNode.relativeName,
          relativePhone: ipdNode.relativePhone,
          relativeAddress: ipdNode.relativeAddress,
          dischargeDate: ipdNode.dischargeDate,
          amount: billingNode.totalDeposit || 0,
          roomType: ipdNode.roomType,
          bed: ipdNode.bed,
          services: servicesArray,
          payments: paymentsArray,
          discount: ipdNode.discount,
        })
      })
    })

    setAllRecords(combined)
  }, [demographics, ipdInfo, billingInfo])

  /* ----------------------------------------
     5) Filter & sort as before
  ----------------------------------------- */
  useEffect(() => {
    const term = searchTerm.trim().toLowerCase()
    let records = [...allRecords]

    // Tab filtering: non-discharged vs discharged
    if (selectedTab === "non-discharge") {
      records = records.filter((rec) => !rec.dischargeDate)
    } else {
      records = records.filter((rec) => rec.dischargeDate)
    }

    // Ward filtering
    if (selectedWard !== "All") {
      records = records.filter((rec) => rec.roomType && rec.roomType.toLowerCase() === selectedWard.toLowerCase())
    }

    // Search filtering
    if (term) {
      records = records.filter(
        (rec) =>
          rec.ipdId.toLowerCase().includes(term) ||
          rec.name.toLowerCase().includes(term) ||
          rec.mobileNumber.toLowerCase().includes(term),
      )
    }

    setFilteredRecords(records)
  }, [allRecords, searchTerm, selectedTab, selectedWard])

  const getRecordDate = (record: BillingRecord): Date => {
    if (record.dischargeDate) {
      return new Date(record.dischargeDate)
    } else if (record.services.length > 0 && record.services[0].createdAt) {
      return new Date(record.services[0].createdAt)
    } else {
      return new Date(0)
    }
  }

  const sortedRecords = [...filteredRecords].sort((a, b) => getRecordDate(b).getTime() - getRecordDate(a).getTime())

  /* ----------------------------------------
     6) Handlers
  ----------------------------------------- */
  const handleRowClick = (record: BillingRecord) => {
    router.push(`/billing/${record.patientId}/${record.ipdId}`)
  }

  const handleEditRecord = (e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    router.push(`/billing/edit/${record.patientId}/${record.ipdId}`)
  }

  const handleManagePatient = (e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    router.push(`/manage/${record.patientId}/${record.ipdId}`)
  }

  const handleDrugChart = (e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    router.push(`/drugchart/${record.patientId}/${record.ipdId}`)
  }

  const handleOTForm = (e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation()
    router.push(`/ot/${record.patientId}/${record.ipdId}`)
  }

  // Get unique ward names
  const uniqueWards = Array.from(new Set(allRecords.map((record) => record.roomType).filter((ward) => ward)))

  // Summary stats
  const totalPatients = filteredRecords.length
  const totalDeposits = filteredRecords.reduce((sum, record) => sum + record.amount, 0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">IPD Billing Management</h1>
          <p className="text-slate-500">Manage and track in-patient billing records</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Total Patients</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <Users className="h-5 w-5 text-emerald-500 mr-2" />
                <span className="text-2xl font-bold">{totalPatients}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Total Deposits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <CreditCard className="h-5 w-5 text-violet-500 mr-2" />
                <span className="text-2xl font-bold">₹{totalDeposits.toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs & Filters */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <Tabs
              defaultValue="non-discharge"
              onValueChange={(value) => setSelectedTab(value as "non-discharge" | "discharge")}
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div className="overflow-x-auto">
                  <TabsList className="bg-slate-100 flex gap-2 whitespace-nowrap">
                    <TabsTrigger
                      value="non-discharge"
                      className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Non-Discharged
                    </TabsTrigger>
                    <TabsTrigger
                      value="discharge"
                      className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Discharged
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name, ID or mobile"
                    className="pl-10 w-full md:w-80"
                  />
                </div>
              </div>

              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <Home className="h-4 w-4 text-slate-500" />
                  <h3 className="font-medium text-slate-700">Filter by Ward</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant={selectedWard === "All" ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setSelectedWard("All")}
                  >
                    All Wards
                  </Badge>
                  {uniqueWards.map((ward) => (
                    <Badge
                      key={ward}
                      variant={selectedWard === ward ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setSelectedWard(ward ?? "")}
                    >
                      {ward}
                    </Badge>
                  ))}
                </div>
              </div>

              <TabsContent value="non-discharge" className="mt-0">
                {renderPatientsTable(
                  sortedRecords,
                  handleRowClick,
                  handleEditRecord,
                  handleManagePatient,
                  handleDrugChart,
                  handleOTForm,
                  isLoading,
                )}
              </TabsContent>

              <TabsContent value="discharge" className="mt-0">
                {renderPatientsTable(
                  sortedRecords,
                  handleRowClick,
                  handleEditRecord,
                  handleManagePatient,
                  handleDrugChart,
                  handleOTForm,
                  isLoading,
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function renderPatientsTable(
  records: BillingRecord[],
  handleRowClick: (record: BillingRecord) => void,
  handleEditRecord: (e: React.MouseEvent, record: BillingRecord) => void,
  handleManagePatient: (e: React.MouseEvent, record: BillingRecord) => void,
  handleDrugChart: (e: React.MouseEvent, record: BillingRecord) => void,
  handleOTForm: (e: React.MouseEvent, record: BillingRecord) => void,
  isLoading: boolean,
) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800"></div>
      </div>
    )
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
        <Users className="h-12 w-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-700 mb-1">No patients found</h3>
        <p className="text-slate-500">Try adjusting your filters or search criteria</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="px-4 py-3 text-left font-medium text-slate-500">#</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Patient Name</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Mobile Number</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Deposit (₹)</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Room Type</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
            <th className="px-4 py-3 text-right font-medium text-slate-500">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {records.map((record, index) => (
            <tr
              key={`${record.patientId}-${record.ipdId}`}
              onClick={() => handleRowClick(record)}
              className="hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <td className="px-4 py-3 text-slate-700">{index + 1}</td>
              <td className="px-4 py-3">
                <div className="font-medium text-slate-800">{record.name}</div>
                <div className="text-xs text-slate-500">ID: {record.ipdId}</div>
              </td>
              <td className="px-4 py-3 text-slate-700">{record.mobileNumber}</td>
              <td className="px-4 py-3 font-medium text-slate-800">₹{record.amount.toLocaleString()}</td>
              <td className="px-4 py-3">
                <Badge variant="outline" className="bg-slate-50">
                  {record.roomType || "Not Assigned"}
                </Badge>
              </td>
              <td className="px-4 py-3">
                {record.dischargeDate ? (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    Discharged
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    Active
                  </Badge>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-1 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => handleEditRecord(e, record)}
                    className="text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => handleManagePatient(e, record)}
                    className="text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    Manage
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => handleDrugChart(e, record)}
                    className="text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                  >
                    <Clipboard className="h-4 w-4 mr-1" />
                    Drug Chart
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => handleOTForm(e, record)}
                    className="text-blue-700 hover:text-blue-900 hover:bg-blue-50 border-blue-200"
                  >
                    <Stethoscope className="h-4 w-4 mr-1" />
                    OT
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
