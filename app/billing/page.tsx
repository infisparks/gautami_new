"use client"

import type React from "react"
import { useEffect, useState, useCallback } from "react"
import { ref, onChildAdded, onChildChanged, onChildRemoved } from "firebase/database"
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
  ChevronDown,
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
  admissionDate?: string
  amount: number // totalDeposit
  roomType?: string
  bed?: string
  services: ServiceItem[]
  payments: Payment[]
  discount?: number
  createdAt?: string
}

const ITEMS_PER_PAGE = 10

export default function OptimizedPatientsPage() {
  const [nonDischargedRecords, setNonDischargedRecords] = useState<BillingRecord[]>([])
  const [dischargedRecords, setDischargedRecords] = useState<BillingRecord[]>([])
  const [filteredRecords, setFilteredRecords] = useState<BillingRecord[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedTab, setSelectedTab] = useState<"non-discharge" | "discharge">("non-discharge")
  const [selectedWard, setSelectedWard] = useState("All")
  const [isLoading, setIsLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMoreDischarged, setHasMoreDischarged] = useState(true)
  const [lastDischargedKey, setLastDischargedKey] = useState<string | null>(null)
  const router = useRouter()

  // Combine IPD info and billing info into a single record
  const combineRecordData = useCallback(
    (patientId: string, ipdId: string, ipdData: any, billingData: any): BillingRecord => {
      const servicesArray: ServiceItem[] = []
      if (Array.isArray(ipdData.services)) {
        ipdData.services.forEach((svc: any) => {
          servicesArray.push({
            serviceName: svc.serviceName || "",
            doctorName: svc.doctorName || "",
            type: svc.type || "service",
            amount: Number(svc.amount) || 0,
            createdAt: svc.createdAt || "",
          })
        })
      }

      const paymentsArray: Payment[] = []
      if (billingData?.payments) {
        Object.keys(billingData.payments).forEach((payId) => {
          const pay = billingData.payments[payId]
          paymentsArray.push({
            id: payId,
            amount: Number(pay.amount) || 0,
            paymentType: pay.paymentType || "cash",
            date: pay.date || new Date().toISOString(),
          })
        })
      }

      return {
        patientId,
        ipdId,
        name: ipdData.name || "Unknown",
        mobileNumber: ipdData.phone || "",
        address: ipdData.address || "",
        age: ipdData.age || "",
        gender: ipdData.gender || "",
        relativeName: ipdData.relativeName || "",
        relativePhone: ipdData.relativePhone || "",
        relativeAddress: ipdData.relativeAddress || "",
        dischargeDate: ipdData.dischargeDate || "",
        admissionDate: ipdData.admissionDate || "",
        amount: billingData?.totalDeposit ? Number(billingData.totalDeposit) : 0,
        roomType: ipdData.roomType || "",
        bed: ipdData.bed || "",
        services: servicesArray,
        payments: paymentsArray,
        discount: ipdData.discount ? Number(ipdData.discount) : 0,
        createdAt: ipdData.createdAt || "",
      }
    },
    [],
  )

  // Load non-discharged patients (all of them since they're active)
  useEffect(() => {
    const ipdRef = ref(db, "patients/ipddetail/userinfoipd")
    const billingRef = ref(db, "patients/ipddetail/userbillinginfoipd")

    const ipdData: Record<string, Record<string, any>> = {}
    const billingData: Record<string, Record<string, any>> = {}
    let ipdLoaded = false
    let billingLoaded = false

    const updateNonDischargedRecords = () => {
      if (!ipdLoaded || !billingLoaded) return

      const records: BillingRecord[] = []

      Object.keys(ipdData).forEach((patientId) => {
        Object.keys(ipdData[patientId] || {}).forEach((ipdId) => {
          const ipdRecord = ipdData[patientId][ipdId]
          // Only include non-discharged patients
          if (!ipdRecord.dischargeDate) {
            const billingRecord = billingData[patientId]?.[ipdId] || {}
            records.push(combineRecordData(patientId, ipdId, ipdRecord, billingRecord))
          }
        })
      })

      setNonDischargedRecords(records)
      setIsLoading(false)
    }

    // Listen to IPD changes
    const unsubscribeIpd = onChildAdded(ipdRef, (snapshot) => {
      const patientId = snapshot.key!
      const patientIpdData = snapshot.val() || {}
      ipdData[patientId] = patientIpdData
      ipdLoaded = true
      updateNonDischargedRecords()
    })

    const unsubscribeIpdChanged = onChildChanged(ipdRef, (snapshot) => {
      const patientId = snapshot.key!
      const patientIpdData = snapshot.val() || {}
      ipdData[patientId] = patientIpdData
      updateNonDischargedRecords()
    })

    const unsubscribeIpdRemoved = onChildRemoved(ipdRef, (snapshot) => {
      const patientId = snapshot.key!
      delete ipdData[patientId]
      updateNonDischargedRecords()
    })

    // Listen to billing changes
    const unsubscribeBilling = onChildAdded(billingRef, (snapshot) => {
      const patientId = snapshot.key!
      const patientBillingData = snapshot.val() || {}
      billingData[patientId] = patientBillingData
      billingLoaded = true
      updateNonDischargedRecords()
    })

    const unsubscribeBillingChanged = onChildChanged(billingRef, (snapshot) => {
      const patientId = snapshot.key!
      const patientBillingData = snapshot.val() || {}
      billingData[patientId] = patientBillingData
      updateNonDischargedRecords()
    })

    const unsubscribeBillingRemoved = onChildRemoved(billingRef, (snapshot) => {
      const patientId = snapshot.key!
      delete billingData[patientId]
      updateNonDischargedRecords()
    })

    return () => {
      unsubscribeIpd()
      unsubscribeIpdChanged()
      unsubscribeIpdRemoved()
      unsubscribeBilling()
      unsubscribeBillingChanged()
      unsubscribeBillingRemoved()
    }
  }, [combineRecordData])

  // Load initial discharged patients (latest 10)
  const loadDischargedPatients = useCallback(
    async (loadMore = false) => {
      if (loadMore) {
        setLoadingMore(true)
      }

      try {
        const ipdRef = ref(db, "patients/ipddetail/userinfoipd")
        const billingRef = ref(db, "patients/ipddetail/userbillinginfoipd")

        // For discharged patients, we need to manually filter since Firebase doesn't support
        // complex queries on nested data. We'll load all and filter client-side for now.
        // In a production app, you'd want to restructure the data for better querying.

        const ipdData: Record<string, Record<string, any>> = {}
        const billingData: Record<string, Record<string, any>> = {}

        // Load IPD data
        const ipdSnapshot = await new Promise((resolve) => {
          const unsubscribe = onChildAdded(ipdRef, (snapshot) => {
            const patientId = snapshot.key!
            const patientIpdData = snapshot.val() || {}
            ipdData[patientId] = patientIpdData
          })

          // Wait a bit for data to load, then resolve
          setTimeout(() => {
            unsubscribe()
            resolve(ipdData)
          }, 1000)
        })

        // Load billing data
        const billingSnapshot = await new Promise((resolve) => {
          const unsubscribe = onChildAdded(billingRef, (snapshot) => {
            const patientId = snapshot.key!
            const patientBillingData = snapshot.val() || {}
            billingData[patientId] = patientBillingData
          })

          setTimeout(() => {
            unsubscribe()
            resolve(billingData)
          }, 1000)
        })

        // Filter and sort discharged patients
        const dischargedRecords: BillingRecord[] = []

        Object.keys(ipdData).forEach((patientId) => {
          Object.keys(ipdData[patientId] || {}).forEach((ipdId) => {
            const ipdRecord = ipdData[patientId][ipdId]
            // Only include discharged patients
            if (ipdRecord.dischargeDate) {
              const billingRecord = billingData[patientId]?.[ipdId] || {}
              dischargedRecords.push(combineRecordData(patientId, ipdId, ipdRecord, billingRecord))
            }
          })
        })

        // Sort by discharge date (newest first)
        dischargedRecords.sort((a, b) => {
          const dateA = new Date(a.dischargeDate || 0).getTime()
          const dateB = new Date(b.dischargeDate || 0).getTime()
          return dateB - dateA
        })

        if (loadMore) {
          const currentLength = dischargedRecords.length
          const startIndex = dischargedRecords.length
          const newRecords = dischargedRecords.slice(startIndex, startIndex + ITEMS_PER_PAGE)

          setDischargedRecords((prev) => [...prev, ...newRecords])
          setHasMoreDischarged(startIndex + ITEMS_PER_PAGE < currentLength)
        } else {
          const initialRecords = dischargedRecords.slice(0, ITEMS_PER_PAGE)
          setDischargedRecords(initialRecords)
          setHasMoreDischarged(dischargedRecords.length > ITEMS_PER_PAGE)
        }
      } catch (error) {
        console.error("Error loading discharged patients:", error)
      } finally {
        setLoadingMore(false)
      }
    },
    [combineRecordData],
  )

  // Load discharged patients when tab changes to discharge
  useEffect(() => {
    if (selectedTab === "discharge" && dischargedRecords.length === 0) {
      loadDischargedPatients()
    }
  }, [selectedTab, loadDischargedPatients, dischargedRecords.length])

  // Filter records based on search and ward
  useEffect(() => {
    const currentRecords = selectedTab === "non-discharge" ? nonDischargedRecords : dischargedRecords
    const term = searchTerm.trim().toLowerCase()
    let records = [...currentRecords]

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
  }, [nonDischargedRecords, dischargedRecords, searchTerm, selectedTab, selectedWard])

  // Event handlers
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

  const handleLoadMore = () => {
    loadDischargedPatients(true)
  }

  // Get unique ward names from current records
  const allRecords = [...nonDischargedRecords, ...dischargedRecords]
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
                      Non-Discharged ({nonDischargedRecords.length})
                    </TabsTrigger>
                    <TabsTrigger
                      value="discharge"
                      className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Discharged ({dischargedRecords.length})
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
                  filteredRecords,
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
                  filteredRecords,
                  handleRowClick,
                  handleEditRecord,
                  handleManagePatient,
                  handleDrugChart,
                  handleOTForm,
                  isLoading,
                )}
                {selectedTab === "discharge" && hasMoreDischarged && (
                  <div className="flex justify-center mt-6">
                    <Button
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      {loadingMore ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-600"></div>
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                      {loadingMore ? "Loading..." : "Load More"}
                    </Button>
                  </div>
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
