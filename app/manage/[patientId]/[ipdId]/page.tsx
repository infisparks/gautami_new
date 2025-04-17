"use client";

import React, { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PatientCharges from "./patientchareges";
import GlucoseMonitoring from "./glucosemonitoring";
import PatientAdmissionAssessment from "./patientadmissionassessment";
import InvestigationSheet from "./investigationsheet";
import ClinicNote from "./clinicnote";
import ProgressNotes from "./progressnotes";
import NurseNoteComponent from "./nursenote";
import VitalObservations from "./vitalobservations";
import DoctorVisits from "./doctorvisit"; // New Doctor Visit component

export default function ManagePatientPageTabs() {
  const [activeTab, setActiveTab] = useState<
    | "charge"
    | "glucose"
    | "admission"
    | "investigation"
    | "clinic"
    | "progress"
    | "nurse"
    | "vital"
    | "doctor"
  >("charge");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-800 mb-6">
          Manage Patient Records
        </h1>
        <Tabs
          value={activeTab}
          onValueChange={(val) =>
            setActiveTab(
              val as
                | "charge"
                | "glucose"
                | "admission"
                | "investigation"
                | "clinic"
                | "progress"
                | "nurse"
                | "vital"
                | "doctor"
            )
          }
        >
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-400">
            <TabsList className="flex space-x-2 whitespace-nowrap">
              <TabsTrigger value="charge" className="px-4 py-2 flex-shrink-0">
                Patient Charge Sheet
              </TabsTrigger>
              <TabsTrigger value="glucose" className="px-4 py-2 flex-shrink-0">
                Glucose Monitoring Sheet
              </TabsTrigger>
              <TabsTrigger value="admission" className="px-4 py-2 flex-shrink-0">
                Patient Admission Assessment
              </TabsTrigger>
              <TabsTrigger value="investigation" className="px-4 py-2 flex-shrink-0">
                Investigation Sheet
              </TabsTrigger>
              <TabsTrigger value="clinic" className="px-4 py-2 flex-shrink-0">
                Clinic Note
              </TabsTrigger>
              <TabsTrigger value="progress" className="px-4 py-2 flex-shrink-0">
                Progress Notes
              </TabsTrigger>
              <TabsTrigger value="nurse" className="px-4 py-2 flex-shrink-0">
                Nurse Note
              </TabsTrigger>
              <TabsTrigger value="vital" className="px-4 py-2 flex-shrink-0">
                Vital Observations
              </TabsTrigger>
              <TabsTrigger value="doctor" className="px-4 py-2 flex-shrink-0">
                Doctor Visits
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="charge" className="mt-4">
            <PatientCharges />
          </TabsContent>
          <TabsContent value="glucose" className="mt-4">
            <GlucoseMonitoring />
          </TabsContent>
          <TabsContent value="admission" className="mt-4">
            <PatientAdmissionAssessment />
          </TabsContent>
          <TabsContent value="investigation" className="mt-4">
            <InvestigationSheet />
          </TabsContent>
          <TabsContent value="clinic" className="mt-4">
            <ClinicNote />
          </TabsContent>
          <TabsContent value="progress" className="mt-4">
            <ProgressNotes />
          </TabsContent>
          <TabsContent value="nurse" className="mt-4">
            <NurseNoteComponent />
          </TabsContent>
          <TabsContent value="vital" className="mt-4">
            <VitalObservations />
          </TabsContent>
          <TabsContent value="doctor" className="mt-4">
            <DoctorVisits />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
