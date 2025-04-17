"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ref, onValue, set } from "firebase/database";
import { useForm, SubmitHandler } from "react-hook-form";
import { db, auth } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
// import  { format } from "date-fns/format";

interface ClinicNote {
  mainComplaintsAndDuration?: string;
  pastHistory?: string;
  familySocialHistory?: string;
  generalPhysicalExamination?: string;
  systemicCardiovascular?: string;
  systemicRespiratory?: string;
  systemicPerAbdomen?: string;
  systemicNeurology?: string;
  systemicSkeletal?: string;
  systemicOther?: string;
  summary?: string;
  provisionalDiagnosis?: string;
  additionalNotes?: string;
  enteredBy?: string;
  timestamp?: string;
}

// Exclude admin fields from form inputs.
type ClinicNoteFormInputs = Omit<ClinicNote, "enteredBy" | "timestamp">;

export default function ClinicNotePage() {
  const { patientId, ipdId } = useParams() as { patientId: string; ipdId: string };
  
  const { register, handleSubmit, reset } = useForm<ClinicNoteFormInputs>({
    defaultValues: {
      mainComplaintsAndDuration: "",
      pastHistory: "",
      familySocialHistory: "",
      generalPhysicalExamination: "",
      systemicCardiovascular: "",
      systemicRespiratory: "",
      systemicPerAbdomen: "",
      systemicNeurology: "",
      systemicSkeletal: "",
      systemicOther: "",
      summary: "",
      provisionalDiagnosis: "",
      additionalNotes: "",
    },
  });
  const [loading, setLoading] = useState(true);

  // Fetch existing clinic note (if any) from Firebase.
  useEffect(() => {
    const clinicNoteRef = ref(db, `patients/${patientId}/ipd/${ipdId}/clinicNote`);
    const unsubscribe = onValue(clinicNoteRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val() as ClinicNote;
        // Pre-populate the form with existing data.
        reset(data);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [patientId, ipdId, reset]);

  // Submit handler saves the whole clinic note.
  const onSubmit: SubmitHandler<ClinicNoteFormInputs> = async (data) => {
    try {
      const loggedInEmail = auth.currentUser?.email || "unknown";
      // Build the record. Optionally, you can remove keys with empty strings.
      const clinicNoteData: ClinicNote = {
        ...data,
        enteredBy: loggedInEmail,
        timestamp: new Date().toISOString(),
      };
      const clinicNoteRef = ref(db, `patients/${patientId}/ipd/${ipdId}/clinicNote`);
      await set(clinicNoteRef, clinicNoteData);
      alert("Clinic note updated successfully!");
    } catch (error) {
      console.error("Error updating clinic note:", error);
      alert("Error updating clinic note. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">Loading clinic note...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-slate-800">Clinic Note</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Main Complaints & Duration
              </label>
              <Textarea
                placeholder="Enter main complaints and duration..."
                {...register("mainComplaintsAndDuration")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Past History
              </label>
              <Textarea
                placeholder="Enter past history..."
                {...register("pastHistory")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Family & Social History
              </label>
              <Textarea
                placeholder="Enter family and social history..."
                {...register("familySocialHistory")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                General Physical Examination
              </label>
              <Textarea
                placeholder="Enter general physical examination details..."
                {...register("generalPhysicalExamination")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Systemic Examination - Cardiovascular
              </label>
              <Textarea
                placeholder="Enter cardiovascular examination findings..."
                {...register("systemicCardiovascular")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Systemic Examination - Respiratory
              </label>
              <Textarea
                placeholder="Enter respiratory examination findings..."
                {...register("systemicRespiratory")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Systemic Examination - Per Abdomen
              </label>
              <Textarea
                placeholder="Enter per abdomen examination findings..."
                {...register("systemicPerAbdomen")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Systemic Examination - Neurology
              </label>
              <Textarea
                placeholder="Enter neurological examination findings..."
                {...register("systemicNeurology")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Systemic Examination - Skeletal
              </label>
              <Textarea
                placeholder="Enter skeletal examination findings..."
                {...register("systemicSkeletal")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Systemic Examination - Other
              </label>
              <Textarea
                placeholder="Enter any other systemic examination findings..."
                {...register("systemicOther")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Summary
              </label>
              <Textarea
                placeholder="Enter summary..."
                {...register("summary")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Provisional Diagnosis
              </label>
              <Textarea
                placeholder="Enter provisional diagnosis..."
                {...register("provisionalDiagnosis")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Additional Notes
              </label>
              <Textarea
                placeholder="Enter any additional notes..."
                {...register("additionalNotes")}
                className="w-full"
              />
            </div>
            <div className="flex items-center gap-4">
              <Button type="submit">Save Clinic Note</Button>
              {/* Optionally, you could display last update info, for example: */}
              {/** If needed:
              <span className="text-sm text-gray-500">
                Last updated: {data && format(new Date(data.timestamp), "PPpp")}
              </span>
              */}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
