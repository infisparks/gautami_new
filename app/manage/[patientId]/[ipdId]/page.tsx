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
        <h1 className="text-3xl font-bold text-slate-800 mb-6">
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
          <TabsList>
            <TabsTrigger value="charge">Patient Charge Sheet</TabsTrigger>
            <TabsTrigger value="glucose">Glucose Monitoring Sheet</TabsTrigger>
            <TabsTrigger value="admission">Patient Admission Assessment</TabsTrigger>
            <TabsTrigger value="investigation">Investigation Sheet</TabsTrigger>
            <TabsTrigger value="clinic">Clinic Note</TabsTrigger>
            <TabsTrigger value="progress">Progress Notes</TabsTrigger>
            <TabsTrigger value="nurse">Nurse Note</TabsTrigger>
            <TabsTrigger value="vital">Vital Observations</TabsTrigger>
            <TabsTrigger value="doctor">Doctor Visits</TabsTrigger>
          </TabsList>

          <TabsContent value="charge">
            <PatientCharges />
          </TabsContent>
          <TabsContent value="glucose">
            <GlucoseMonitoring />
          </TabsContent>
          <TabsContent value="admission">
            <PatientAdmissionAssessment />
          </TabsContent>
          <TabsContent value="investigation">
            <InvestigationSheet />
          </TabsContent>
          <TabsContent value="clinic">
            <ClinicNote />
          </TabsContent>
          <TabsContent value="progress">
            <ProgressNotes />
          </TabsContent>
          <TabsContent value="nurse">
            <NurseNoteComponent />
          </TabsContent>
          <TabsContent value="vital">
            <VitalObservations />
          </TabsContent>
          <TabsContent value="doctor">
            <DoctorVisits />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
