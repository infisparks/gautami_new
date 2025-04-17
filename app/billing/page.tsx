"use client";

import React, { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import {
  Search,
  Edit,
  Users,
  CreditCard,
  Home,
  XCircle,
  CheckCircle,
  FileText,
  Clipboard, // imported new icon for drug chart
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ServiceItem {
  serviceName: string;
  doctorName?: string;
  type: "service" | "doctorvisit";
  amount: number;
  createdAt?: string;
}

interface Payment {
  id?: string;
  amount: number;
  paymentType: string;
  date: string;
}

export interface BillingRecord {
  patientId: string;
  ipdId: string;
  name: string;
  mobileNumber: string;
  address?: string;
  age?: string | number;
  gender?: string;
  relativeName?: string;
  relativePhone?: string;
  relativeAddress?: string;
  dischargeDate?: string;
  amount: number;
  roomType?: string;
  bed?: string;
  services: ServiceItem[];
  payments: Payment[];
  discount?: number;
}

export default function PatientsPage() {
  const [allRecords, setAllRecords] = useState<BillingRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<BillingRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTab, setSelectedTab] = useState<"non-discharge" | "discharge">("non-discharge");
  const [selectedWard, setSelectedWard] = useState("All");
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  /* ---------------------------
     Fetch Patients & IPD Records
  --------------------------- */
  useEffect(() => {
    const patientsRef = ref(db, "patients");
    const unsubscribe = onValue(patientsRef, (snapshot) => {
      setIsLoading(false);
      if (!snapshot.exists()) {
        setAllRecords([]);
        setFilteredRecords([]);
        return;
      }
      const data = snapshot.val();
      const ipdRecords: BillingRecord[] = [];

      Object.keys(data).forEach((patientId) => {
        const patientNode = data[patientId];
        const patientName = patientNode.name || "Unknown";
        const phone = patientNode.phone || "";
        const patientAddress = patientNode.address || "";
        const patientAge = patientNode.age || "";
        const patientGender = patientNode.gender || "";

        if (patientNode.ipd) {
          Object.keys(patientNode.ipd).forEach((ipdId) => {
            const ipd = patientNode.ipd[ipdId];

            const servicesArray: ServiceItem[] = ipd.services
              ? ipd.services.map((svc: any) => ({
                  serviceName: svc.serviceName || "",
                  doctorName: svc.doctorName || "",
                  type: svc.type || "service",
                  amount: Number(svc.amount) || 0,
                  createdAt: svc.createdAt || "",
                }))
              : [];

            let paymentsArray: Payment[] = [];
            if (ipd.payments) {
              paymentsArray = Object.keys(ipd.payments).map((k) => ({
                id: k,
                amount: Number(ipd.payments[k].amount) || 0,
                paymentType: ipd.payments[k].paymentType || "cash",
                date: ipd.payments[k].date || new Date().toISOString(),
              }));
            }

            const record: BillingRecord = {
              patientId,
              ipdId,
              name: patientName,
              mobileNumber: phone,
              address: patientAddress,
              age: patientAge,
              gender: patientGender,
              relativeName: ipd.relativeName || "",
              relativePhone: ipd.relativePhone || "",
              relativeAddress: ipd.relativeAddress || "",
              amount: Number(ipd.amount || 0),
              roomType: ipd.roomType || "",
              bed: ipd.bed || "",
              services: servicesArray,
              payments: paymentsArray,
              dischargeDate: ipd.dischargeDate,
              discount: ipd.discount ? Number(ipd.discount) : 0,
            };

            ipdRecords.push(record);
          });
        }
      });

      setAllRecords(ipdRecords);
    });

    return () => unsubscribe();
  }, []);

  /* ---------------------------
     Filtering & Sorting
  --------------------------- */
  useEffect(() => {
    const term = searchTerm.trim().toLowerCase();
    let records = [...allRecords];

    // Tab filtering: non-discharged vs discharged
    if (selectedTab === "non-discharge") {
      records = records.filter((rec) => !rec.dischargeDate);
    } else if (selectedTab === "discharge") {
      records = records.filter((rec) => rec.dischargeDate);
    }

    // Ward filtering
    if (selectedWard !== "All") {
      records = records.filter(
        (rec) =>
          rec.roomType &&
          rec.roomType.toLowerCase() === selectedWard.toLowerCase()
      );
    }

    // Search filtering
    if (term) {
      records = records.filter(
        (rec) =>
          rec.ipdId.toLowerCase().includes(term) ||
          rec.name.toLowerCase().includes(term) ||
          rec.mobileNumber.toLowerCase().includes(term)
      );
    }

    setFilteredRecords(records);
  }, [allRecords, searchTerm, selectedTab, selectedWard]);

  const getRecordDate = (record: BillingRecord): Date => {
    if (record.dischargeDate) {
      return new Date(record.dischargeDate);
    } else if (record.services.length > 0 && record.services[0].createdAt) {
      return new Date(record.services[0].createdAt);
    } else {
      return new Date(0);
    }
  };

  const sortedRecords = [...filteredRecords].sort(
    (a, b) => getRecordDate(b).getTime() - getRecordDate(a).getTime()
  );

  /* ---------------------------
     Navigation Handlers
  --------------------------- */
  const handleRowClick = (record: BillingRecord) => {
    router.push(`/billing/${record.patientId}/${record.ipdId}`);
  };

  const handleEditRecord = (
    e: React.MouseEvent,
    record: BillingRecord
  ) => {
    e.stopPropagation();
    router.push(`/billing/edit/${record.patientId}/${record.ipdId}`);
  };

  // Manage Patient handler
  const handleManagePatient = (
    e: React.MouseEvent,
    record: BillingRecord
  ) => {
    e.stopPropagation();
    router.push(`/manage/${record.patientId}/${record.ipdId}`);
  };

  // NEW: Drug Chart handler – navigates to the drug chart page using patient and IPD IDs
  const handleDrugChart = (
    e: React.MouseEvent,
    record: BillingRecord
  ) => {
    e.stopPropagation();
    router.push(`/drugchart/${record.patientId}/${record.ipdId}`);
  };

  // Get unique ward names from allRecords
  const uniqueWards = Array.from(
    new Set(allRecords.map((record) => record.roomType).filter((ward) => ward))
  );

  // Calculate summary statistics
  const totalPatients = filteredRecords.length;
  const totalDeposits = filteredRecords.reduce(
    (sum, record) => sum + record.amount,
    0
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">
            IPD Billing Management
          </h1>
          <p className="text-slate-500">
            Manage and track in-patient billing records
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                Total Patients
              </CardTitle>
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
              <CardTitle className="text-sm font-medium text-slate-500">
                Total Deposits
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <CreditCard className="h-5 w-5 text-violet-500 mr-2" />
                <span className="text-2xl font-bold">
                  ₹{totalDeposits.toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs and Filters */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <Tabs
              defaultValue="non-discharge"
              onValueChange={(value) =>
                setSelectedTab(value as "non-discharge" | "discharge")
              }
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                {/* Responsive Tabs: Wrapping the TabsList in an overflow container */}
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
                  isLoading
                )}
              </TabsContent>

              <TabsContent value="discharge" className="mt-0">
                {renderPatientsTable(
                  sortedRecords,
                  handleRowClick,
                  handleEditRecord,
                  handleManagePatient,
                  handleDrugChart,
                  isLoading
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function renderPatientsTable(
  records: BillingRecord[],
  handleRowClick: (record: BillingRecord) => void,
  handleEditRecord: (e: React.MouseEvent, record: BillingRecord) => void,
  handleManagePatient: (e: React.MouseEvent, record: BillingRecord) => void,
  handleDrugChart: (e: React.MouseEvent, record: BillingRecord) => void,
  isLoading: boolean
) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800"></div>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
        <Users className="h-12 w-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-700 mb-1">
          No patients found
        </h3>
        <p className="text-slate-500">
          Try adjusting your filters or search criteria
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="px-4 py-3 text-left font-medium text-slate-500">#</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">
              Patient Name
            </th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">
              Mobile Number
            </th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">
              Deposit (₹)
            </th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">
              Room Type
            </th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">
              Status
            </th>
            <th className="px-4 py-3 text-right font-medium text-slate-500">
              Actions
            </th>
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
              <td className="px-4 py-3 text-slate-700">
                {record.mobileNumber}
              </td>
              <td className="px-4 py-3 font-medium text-slate-800">
                ₹{record.amount.toLocaleString()}
              </td>
              <td className="px-4 py-3">
                <Badge variant="outline" className="bg-slate-50">
                  {record.roomType || "Not Assigned"}
                </Badge>
              </td>
              <td className="px-4 py-3">
                {record.dischargeDate ? (
                  <Badge
                    variant="outline"
                    className="bg-green-50 text-green-700 border-green-200"
                  >
                    Discharged
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-amber-50 text-amber-700 border-amber-200"
                  >
                    Active
                  </Badge>
                )}
              </td>
              <td className="px-4 py-3 text-right flex justify-end gap-2">
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
