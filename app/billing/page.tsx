"use client";

import React, { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";

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

interface BillingRecord {
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
  const router = useRouter();

  /* ---------------------------
     Fetch Patients & IPD Records
  --------------------------- */
  useEffect(() => {
    const patientsRef = ref(db, "patients");
    const unsubscribe = onValue(patientsRef, (snapshot) => {
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
        (rec) => rec.roomType && rec.roomType.toLowerCase() === selectedWard.toLowerCase()
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

  const handleEditRecord = (e: React.MouseEvent, record: BillingRecord) => {
    e.stopPropagation();
    router.push(`/billing/edit/${record.patientId}/${record.ipdId}`);
  };

  // Get unique ward names from allRecords
  const uniqueWards = Array.from(
    new Set(allRecords.map((record) => record.roomType).filter((ward) => ward))
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-indigo-800 mb-8 text-center">
          IPD Billing Management
        </h1>

        {/* Tabs */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex shadow rounded-lg overflow-hidden" role="tablist">
            <button
              onClick={() => setSelectedTab("non-discharge")}
              className={`px-6 py-3 font-medium transition-colors duration-300 ${
                selectedTab === "non-discharge"
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              Non Discharged
            </button>
            <button
              onClick={() => setSelectedTab("discharge")}
              className={`px-6 py-3 font-medium transition-colors duration-300 ${
                selectedTab === "discharge"
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              Discharged
            </button>
          </div>
        </div>

        {/* Ward Filter */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex space-x-2">
            <button
              onClick={() => setSelectedWard("All")}
              className={`px-4 py-2 rounded-md transition-colors duration-300 ${
                selectedWard === "All"
                  ? "bg-green-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              All
            </button>
            {uniqueWards.map((ward) => (
              <button
                key={ward}
                onClick={() => setSelectedWard(ward ?? '')}
                className={`px-4 py-2 rounded-md transition-colors duration-300 ${
                  selectedWard.toLowerCase() === (ward ?? '').toLowerCase()
                    ? "bg-green-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-100"
                }`}
              >
                {ward}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="mb-6 flex justify-center">
          <div className="flex items-center bg-gray-100 rounded-full px-4 py-2 w-full max-w-md shadow">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by Name, IPD ID, or Mobile"
              className="flex-grow bg-transparent outline-none text-gray-700"
            />
          </div>
        </div>

        {/* Records Table */}
        {sortedRecords.length === 0 ? (
          <p className="text-center text-gray-500">No records found.</p>
        ) : (
          <div className="overflow-x-auto bg-white rounded-lg shadow-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-indigo-100">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Rank</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Patient Name</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Mobile Number</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Total Deposit (Rs)</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Room Type</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedRecords.map((rec, index) => (
                  <tr
                    key={`${rec.patientId}-${rec.ipdId}`}
                    onClick={() => handleRowClick(rec)}
                    className="hover:bg-indigo-50 transition-colors duration-200 cursor-pointer"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">{index + 1}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">{rec.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">{rec.mobileNumber}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">
                      {rec.amount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">{rec.roomType}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={(e) => handleEditRecord(e, rec)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-150"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
