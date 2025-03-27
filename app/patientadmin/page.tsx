"use client";

import React, { useState, useEffect, useRef } from "react";
import { db } from "../../lib/firebase";
import { ref, onValue } from "firebase/database";
import Head from "next/head";
import { format, isSameDay, parseISO } from "date-fns";
import {
  Search,
  Download,
  FileText,
  Calendar,
  User,
  Activity,
  Users,
} from "lucide-react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { Dialog } from "@headlessui/react";

// ----- INTERFACES -----

interface IDoctorEntry {
  department: string;
  id: string;
  ipdCharges?: Record<string, number>;
  name: string;
  opdCharge?: number;
  specialist?: string;
}

export interface IAppointment {
  id: string;
  name: string;
  phone: string;
  type: "OPD" | "IPD" | "Pathology" | "Surgery" | "Mortality";
  date: string; // ISO date string (or parseable by date-fns)
  doctor: string; // doctor's ID
}

interface IPatientRecord {
  address?: string;
  age?: number;
  createdAt?: string | number;
  gender?: string;
  name?: string;
  phone?: string;
  uhid?: string;
  opd?: Record<string, any>;
  ipd?: Record<string, any>;
  pathology?: Record<string, any>;
  surgery?: Record<string, any>;
  mortality?: Record<string, any>;
}

const PatientManagement: React.FC = () => {
  const [doctors, setDoctors] = useState<IDoctorEntry[]>([]);
  const [appointments, setAppointments] = useState<IAppointment[]>([]);
  const [filteredAppointments, setFilteredAppointments] = useState<IAppointment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filter states
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<string>("");

  // Raw patient data keyed by uhid for full detail
  const [rawPatients, setRawPatients] = useState<{ [uhid: string]: IPatientRecord }>({});

  // Modal states
  const [selectedPatientRecord, setSelectedPatientRecord] = useState<IPatientRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Doctor map
  const doctorMap = useRef<{ [doctorId: string]: string }>({});

  // ----- FETCH DOCTORS -----
  useEffect(() => {
    const doctorsRef = ref(db, "doctors");
    const unsubscribe = onValue(doctorsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const docs: IDoctorEntry[] = Object.entries(data).map(([key, value]) => ({
          ...(value as IDoctorEntry),
          id: key,
        }));
        setDoctors(docs);
      } else {
        setDoctors([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Build doctor map
  useEffect(() => {
    doctorMap.current = doctors.reduce((acc, doc) => {
      acc[doc.id] = doc.name;
      return acc;
    }, {} as { [key: string]: string });
  }, [doctors]);

  // ----- FETCH PATIENTS & FLATTEN APPOINTMENTS -----
  useEffect(() => {
    const patientsRef = ref(db, "patients");
    const unsubscribe = onValue(patientsRef, (snapshot) => {
      const data = snapshot.val();
      const allAppointments: IAppointment[] = [];
      const raw: { [uhid: string]: IPatientRecord } = {};

      if (data) {
        Object.entries(data).forEach(([uhid, patientDataRaw]) => {
          const patientData = patientDataRaw as IPatientRecord;
          raw[uhid] = patientData;

          const name = patientData.name || "Unknown";
          const phone = patientData.phone || "";

          // Flatten OPD
          if (patientData.opd) {
            Object.entries(patientData.opd).forEach(([opdKey, opdVal]) => {
              allAppointments.push({
                id: `${uhid}_${opdKey}`,
                name,
                phone,
                type: "OPD",
                date: opdVal.date || new Date().toISOString(),
                doctor: opdVal.doctor || "",
              });
            });
          }

          // Flatten IPD
          if (patientData.ipd) {
            Object.entries(patientData.ipd).forEach(([ipdKey, ipdVal]) => {
              allAppointments.push({
                id: `${uhid}_${ipdKey}`,
                name,
                phone,
                type: "IPD",
                date: ipdVal.date || new Date().toISOString(),
                doctor: ipdVal.doctor || "",
              });
            });
          }

          // Flatten Pathology
          if (patientData.pathology) {
            Object.entries(patientData.pathology).forEach(([pathKey, pathVal]) => {
              const dateVal = pathVal.createdAt || pathVal.timestamp || new Date().toISOString();
              const finalDate =
                typeof dateVal === "number" ? new Date(dateVal).toISOString() : dateVal;

              allAppointments.push({
                id: `${uhid}_${pathKey}`,
                name,
                phone,
                type: "Pathology",
                date: finalDate,
                doctor: pathVal.doctor || "",
              });
            });
          }

          // Flatten Surgery
          if (patientData.surgery) {
            Object.entries(patientData.surgery).forEach(([surgKey, surgVal]) => {
              const dateStr = surgVal.surgeryDate
                ? `${surgVal.surgeryDate}T00:00:00`
                : new Date().toISOString();

              allAppointments.push({
                id: `${uhid}_${surgKey}`,
                name,
                phone,
                type: "Surgery",
                date: dateStr,
                doctor: surgVal.doctor || "",
              });
            });
          }

          // Flatten Mortality
          if (patientData.mortality) {
            Object.entries(patientData.mortality).forEach(([mortKey, mortVal]) => {
              const dateStr = mortVal.dateOfDeath
                ? new Date(mortVal.dateOfDeath).toISOString()
                : new Date().toISOString();

              allAppointments.push({
                id: `${uhid}_${mortKey}`,
                name,
                phone,
                type: "Mortality",
                date: dateStr,
                doctor: mortVal.doctor || "",
              });
            });
          }
        });
      }

      setRawPatients(raw);
      setAppointments(allAppointments);
      setFilteredAppointments(allAppointments);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // ----- FILTER LOGIC -----
  useEffect(() => {
    let temp = [...appointments];

    // Type filter
    if (selectedType !== "all") {
      temp = temp.filter((appt) => appt.type.toLowerCase() === selectedType);
    }

    // Date filter
    if (selectedDate) {
      const parsedDate = parseISO(selectedDate);
      temp = temp.filter((appt) => isSameDay(new Date(appt.date), parsedDate));
    }

    // Search filter
    if (searchQuery.trim() !== "") {
      const lowerQuery = searchQuery.toLowerCase();
      temp = temp.filter(
        (appt) =>
          appt.name.toLowerCase().includes(lowerQuery) ||
          appt.phone.includes(lowerQuery)
      );
    }

    setFilteredAppointments(temp);
  }, [searchQuery, selectedType, selectedDate, appointments]);

  // Search input handler
  const handleSearchInput = (query: string) => {
    setSearchQuery(query);
  };

  // ----- EXPORT FUNCTIONS -----
  const exportToExcel = () => {
    const dataToExport = filteredAppointments.map((item) => ({
      "Patient Name": item.name,
      "Phone Number": item.phone,
      Type: item.type,
      Date: format(parseISO(item.date), "PPP"),
      Doctor: doctorMap.current[item.doctor] || "N/A",
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Patients");
    XLSX.writeFile(workbook, "Patient_Management.xlsx");
    toast.success("Excel file downloaded successfully!");
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Patient Management Report", 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);

    const tableColumn = ["Name", "Phone", "Type", "Date", "Doctor"];
    const tableRows = filteredAppointments.map((item) => [
      item.name,
      item.phone,
      item.type,
      format(parseISO(item.date), "PPP"),
      doctorMap.current[item.doctor] || "N/A",
    ]);

    (doc as any).autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: 30,
      headStyles: { fillColor: [22, 160, 133] },
      alternateRowStyles: { fillColor: [242, 242, 242] },
      styles: { fontSize: 9 },
    });

    const fileName = `Patient_Management_${format(new Date(), "yyyyMMdd_HHmmss")}.pdf`;
    doc.save(fileName);
    toast.success("PDF file downloaded successfully!");
  };

  // ----- ROW CLICK HANDLER & MODAL -----
  const handleRowClick = (appt: IAppointment) => {
    const patientId = appt.id.split("_")[0];
    const fullRecord = rawPatients[patientId];
    if (fullRecord) {
      setSelectedPatientRecord({ ...fullRecord, uhid: patientId });
      setIsModalOpen(true);
    } else {
      toast.error("Patient details not found!");
    }
  };

  // ----- Derived Stats -----
  const countAll = appointments.length;
  const countOPD = appointments.filter((p) => p.type === "OPD").length;
  const countIPD = appointments.filter((p) => p.type === "IPD").length;
  const countPathology = appointments.filter((p) => p.type === "Pathology").length;

  // Surgeries & Mortality included in total

  return (
    <>
      <Head>
        <title>Patient Management - Admin Dashboard</title>
        <meta name="description" content="Admin Dashboard for Patient Management" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ToastContainer />

      <main className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold text-center text-green-600 mb-10">
            Patient Management Dashboard
          </h1>

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-green-500"></div>
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                <div className="bg-white p-6 rounded-lg shadow-md">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-gray-800">Total Patients</h2>
                    <Users className="text-green-500" size={24} />
                  </div>
                  <p className="text-3xl font-bold text-gray-900">{countAll}</p>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-md">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-gray-800">OPD Patients</h2>
                    <User className="text-blue-500" size={24} />
                  </div>
                  <p className="text-3xl font-bold text-gray-900">{countOPD}</p>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-md">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-gray-800">IPD Patients</h2>
                    <Activity className="text-red-500" size={24} />
                  </div>
                  <p className="text-3xl font-bold text-gray-900">{countIPD}</p>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-md">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-gray-800">Pathology Tests</h2>
                    <FileText className="text-yellow-500" size={24} />
                  </div>
                  <p className="text-3xl font-bold text-gray-900">{countPathology}</p>
                </div>
              </div>

              {/* Search and Filters */}
              <div className="bg-white p-6 rounded-lg shadow-md mb-10">
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
                  <div className="col-span-1 md:col-span-3 lg:col-span-2">
                    <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
                      Search Patients
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        id="search"
                        placeholder="Search by Name or Phone"
                        onChange={(e) => handleSearchInput(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                      <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
                      Filter by Type
                    </label>
                    <select
                      id="type"
                      value={selectedType}
                      onChange={(e) => setSelectedType(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="all">All</option>
                      <option value="opd">OPD</option>
                      <option value="ipd">IPD</option>
                      <option value="pathology">Pathology</option>
                      <option value="surgery">Surgery</option>
                      <option value="mortality">Mortality</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">
                      Filter by Date
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        id="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                      <Calendar className="absolute left-3 top-2.5 text-gray-400" size={20} />
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={exportToExcel}
                      className="flex items-center justify-center bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600 transition duration-300 ease-in-out w-full"
                    >
                      <Download className="mr-2" size={20} />
                      Excel
                    </button>
                    <button
                      onClick={exportToPDF}
                      className="flex items-center justify-center bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition duration-300 ease-in-out w-full"
                    >
                      <FileText className="mr-2" size={20} />
                      PDF
                    </button>
                  </div>
                </div>
              </div>

              {/* Appointments Table */}
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Phone Number
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Doctor
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredAppointments.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                            No patients found.
                          </td>
                        </tr>
                      ) : (
                        filteredAppointments.map((appt) => (
                          <tr
                            key={appt.id}
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => handleRowClick(appt)}
                          >
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="flex-shrink-0 h-10 w-10">
                                  <User className="h-10 w-10 rounded-full text-gray-300" />
                                </div>
                                <div className="ml-4">
                                  <div className="text-sm font-medium text-gray-900">{appt.name}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{appt.phone}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                  appt.type === "OPD"
                                    ? "bg-green-100 text-green-800"
                                    : appt.type === "IPD"
                                    ? "bg-yellow-100 text-yellow-800"
                                    : appt.type === "Pathology"
                                    ? "bg-blue-100 text-blue-800"
                                    : appt.type === "Surgery"
                                    ? "bg-purple-100 text-purple-800"
                                    : "bg-red-100 text-red-800"
                                }`}
                              >
                                {appt.type}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {format(parseISO(appt.date), "PPP")}
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

      {/* Modal for full patient details */}
      <Dialog
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        className="fixed z-10 inset-0 overflow-y-auto"
      >
        {/* Background overlay */}
        <div className="fixed inset-0 bg-black bg-opacity-30" aria-hidden="true" />

        {/* Modal panel positioning */}
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel
            className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full p-6
                       max-h-[80vh] overflow-y-auto"
          >
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
            >
              &times;
            </button>
            {selectedPatientRecord && (
              <div className="space-y-4">
                <Dialog.Title className="text-2xl font-bold mb-2">Patient Details</Dialog.Title>

                <p><strong>Name:</strong> {selectedPatientRecord.name}</p>
                <p><strong>Phone:</strong> {selectedPatientRecord.phone}</p>
                <p><strong>Age:</strong> {selectedPatientRecord.age}</p>
                <p><strong>Gender:</strong> {selectedPatientRecord.gender}</p>
                <p><strong>Address:</strong> {selectedPatientRecord.address}</p>

                {selectedPatientRecord.createdAt && (
                  <p>
                    <strong>Created At:</strong>{" "}
                    {typeof selectedPatientRecord.createdAt === "string"
                      ? format(parseISO(selectedPatientRecord.createdAt), "PPpp")
                      : format(new Date(selectedPatientRecord.createdAt), "PPpp")}
                  </p>
                )}

                {/* OPD Section */}
                {selectedPatientRecord.opd && (
                  <div>
                    <h3 className="text-xl font-semibold mt-4">OPD Appointments</h3>
                    {Object.entries(selectedPatientRecord.opd).map(([key, opd]) => (
                      <div key={key} className="border p-2 rounded mb-2">
                        <p><strong>Date:</strong> {format(parseISO(opd.date), "PPP")}</p>
                        <p><strong>Doctor:</strong> {doctorMap.current[opd.doctor] || "N/A"}</p>
                        <p><strong>Service:</strong> {opd.serviceName || "N/A"}</p>
                        <p><strong>Amount:</strong> {opd.amount}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* IPD Section */}
                {selectedPatientRecord.ipd && (
                  <div>
                    <h3 className="text-xl font-semibold mt-4">IPD Appointments</h3>
                    {Object.entries(selectedPatientRecord.ipd).map(([key, ipd]) => (
                      <div key={key} className="border p-2 rounded mb-2">
                        <p><strong>Date:</strong> {format(parseISO(ipd.date), "PPP")}</p>
                        <p><strong>Admission Type:</strong> {ipd.admissionType}</p>
                        <p><strong>Doctor:</strong> {doctorMap.current[ipd.doctor] || "N/A"}</p>
                        <p><strong>Amount:</strong> {ipd.amount}</p>
                        <p><strong>Room Type:</strong> {ipd.roomType}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pathology Section */}
                {selectedPatientRecord.pathology && (
                  <div>
                    <h3 className="text-xl font-semibold mt-4">Pathology Tests</h3>
                    {Object.entries(selectedPatientRecord.pathology).map(([key, path]) => (
                      <div key={key} className="border p-2 rounded mb-2">
                        <p>
                          <strong>Date:</strong>{" "}
                          {format(parseISO(path.createdAt || path.timestamp), "PPP")}
                        </p>
                        <p><strong>Test:</strong> {path.bloodTestName}</p>
                        <p><strong>Amount:</strong> {path.amount}</p>
                        <p><strong>Doctor:</strong> {doctorMap.current[path.doctor] || "N/A"}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Surgery Section */}
                {selectedPatientRecord.surgery && (
                  <div>
                    <h3 className="text-xl font-semibold mt-4">Surgery Details</h3>
                    {Object.entries(selectedPatientRecord.surgery).map(([key, surg]) => (
                      <div key={key} className="border p-2 rounded mb-2">
                        <p><strong>Date:</strong> {surg.surgeryDate}</p>
                        <p><strong>Title:</strong> {surg.surgeryTitle}</p>
                        <p><strong>Final Diagnosis:</strong> {surg.finalDiagnosis}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Mortality Section */}
                {selectedPatientRecord.mortality && (
                  <div>
                    <h3 className="text-xl font-semibold mt-4">Mortality Reports</h3>
                    {Object.entries(selectedPatientRecord.mortality).map(([key, mort]) => (
                      <div key={key} className="border p-2 rounded mb-2">
                        <p><strong>Admission Date:</strong> {mort.admissionDate}</p>
                        <p><strong>Date of Death:</strong> {mort.dateOfDeath}</p>
                        <p><strong>Medical Findings:</strong> {mort.medicalFindings}</p>
                        <p><strong>Timespan (Days):</strong> {mort.timeSpanDays}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Dialog.Panel>
        </div>
      </Dialog>
    </>
  );
};

export default PatientManagement;
