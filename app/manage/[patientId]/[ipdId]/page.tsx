"use client"

import { useState } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import PatientCharges from "./patientchareges"
import GlucoseMonitoring from "./glucosemonitoring"
import PatientAdmissionAssessment from "./patientadmissionassessment"
import InvestigationSheet from "./investigationsheet"
import ClinicNote from "./clinicnote"
import ProgressNotes from "./progressnotes"
import NurseNoteComponent from "./nursenote"
import VitalObservations from "./vitalobservations"
import DoctorVisits from "./doctorvisit"

type TabValue =
  | "charge"
  | "glucose"
  | "admission"
  | "investigation"
  | "clinic"
  | "progress"
  | "nurse"
  | "vital"
  | "doctor"

export default function ManagePatientPageTabs() {
  const [activeTab, setActiveTab] = useState<TabValue>("charge")

  const tabs = [
    { value: "charge", label: "Patient Charge Sheet" },
    { value: "glucose", label: "Glucose Monitoring" },
    { value: "admission", label: "Patient Admission" },
    { value: "investigation", label: "Investigation Sheet" },
    { value: "clinic", label: "Clinic Note" },
    { value: "progress", label: "Progress Notes" },
    { value: "nurse", label: "Nurse Note" },
    { value: "vital", label: "Vital Observations" },
    { value: "doctor", label: "Doctor Visits" },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="container mx-auto px-4 py-6 md:py-8">
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-slate-800 mb-2">
            Patient Records
          </h1>
          <p className="text-slate-600 text-sm md:text-base">Manage and view comprehensive patient information</p>
        </div>

        <div className="bg-white rounded-xl shadow-md p-4 md:p-6">
          <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as TabValue)} className="w-full">
            <div className="relative mb-4">
              <div className="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none md:hidden">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-slate-400"
                >
                  <polyline points="9 18 3 12 9 6"></polyline>
                </svg>
              </div>
              <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none md:hidden">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-slate-400"
                >
                  <polyline points="15 18 21 12 15 6"></polyline>
                </svg>
              </div>

              <div className="overflow-x-auto scrollbar-hide pb-2">
                <TabsList className="flex space-x-1 sm:space-x-2 whitespace-nowrap p-1 bg-slate-100/80 rounded-lg">
                  {tabs.map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className={`px-3 py-2 text-xs sm:text-sm md:text-base flex-shrink-0 rounded-md transition-all duration-200 ${
                        activeTab === tab.value
                          ? "bg-white shadow-sm text-blue-700 font-medium"
                          : "text-slate-700 hover:bg-slate-200/50"
                      }`}
                    >
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </div>

            <div className="mt-4 bg-slate-50 rounded-lg p-3 md:p-5">
              <TabsContent value="charge" className="focus:outline-none">
                <PatientCharges />
              </TabsContent>
              <TabsContent value="glucose" className="focus:outline-none">
                <GlucoseMonitoring />
              </TabsContent>
              <TabsContent value="admission" className="focus:outline-none">
                <PatientAdmissionAssessment />
              </TabsContent>
              <TabsContent value="investigation" className="focus:outline-none">
                <InvestigationSheet />
              </TabsContent>
              <TabsContent value="clinic" className="focus:outline-none">
                <ClinicNote />
              </TabsContent>
              <TabsContent value="progress" className="focus:outline-none">
                <ProgressNotes />
              </TabsContent>
              <TabsContent value="nurse" className="focus:outline-none">
                <NurseNoteComponent />
              </TabsContent>
              <TabsContent value="vital" className="focus:outline-none">
                <VitalObservations />
              </TabsContent>
              <TabsContent value="doctor" className="focus:outline-none">
                <DoctorVisits />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
