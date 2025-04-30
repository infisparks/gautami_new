"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";
import { ref, onValue, push, set } from "firebase/database";
import { db, auth } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
// import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "lucide-react";
import  format  from "date-fns/format";

interface GlucoseReading {
  id?: string;
  bloodSugar: string;
  urineSugarKetone: string;
  medication: string;
  dose: string;
  orderedBy: string;
  staffOrNurse: string;
  enteredBy: string;
  timestamp: string;
}

interface GlucoseFormInputs {
  bloodSugar: string;
  urineSugarKetone: string;
  medication: string;
  dose: string;
  orderedBy: string;
  staffOrNurse: string;
}

export default function GlucoseMonitoring() {
  const { patientId, ipdId } = useParams() as { patientId: string; ipdId: string };
  const { register, handleSubmit, reset } = useForm<GlucoseFormInputs>({
    defaultValues: {
      bloodSugar: "",
      urineSugarKetone: "",
      medication: "",
      dose: "",
      orderedBy: "",
      staffOrNurse: "",
    },
  });
  const [glucoseReadings, setGlucoseReadings] = useState<GlucoseReading[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const glucoseRef = ref(db, `patients/${patientId}/ipd/${ipdId}/glucoseReadings`);
    const unsubscribe = onValue(glucoseRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const readings: GlucoseReading[] = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));
        setGlucoseReadings(readings);
      } else {
        setGlucoseReadings([]);
      }
    });
    return () => unsubscribe();
  }, [patientId, ipdId]);

  const onSubmit: SubmitHandler<GlucoseFormInputs> = async (data) => {
    setIsSubmitting(true);
    try {
      const loggedInEmail = auth.currentUser?.email || "unknown";
      const glucoseRef = ref(db, `patients/${patientId}/ipd/${ipdId}/glucoseReadings`);
      const newReadingRef = push(glucoseRef);
      
      // Build the record only with keys that have non-empty values
      const newReading: Partial<GlucoseReading> = {
        enteredBy: loggedInEmail,
        timestamp: new Date().toISOString(),
      };
      if (data.bloodSugar.trim() !== "") newReading.bloodSugar = data.bloodSugar.trim();
      if (data.urineSugarKetone.trim() !== "") newReading.urineSugarKetone = data.urineSugarKetone.trim();
      if (data.medication.trim() !== "") newReading.medication = data.medication.trim();
      if (data.dose.trim() !== "") newReading.dose = data.dose.trim();
      if (data.orderedBy.trim() !== "") newReading.orderedBy = data.orderedBy.trim();
      if (data.staffOrNurse.trim() !== "") newReading.staffOrNurse = data.staffOrNurse.trim();

      await set(newReadingRef, newReading);
      reset({
        bloodSugar: "",
        urineSugarKetone: "",
        medication: "",
        dose: "",
        orderedBy: "",
        staffOrNurse: "",
      });
    } catch (error) {
      console.error("Error saving glucose reading:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-slate-800">
            Add New Glucose Reading
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Blood Sugar (mg/dL)
              </label>
              <Input
                type="text"
                {...register("bloodSugar")}
                placeholder="Enter blood sugar level"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Urine Sugar/Ketone
              </label>
              <Input
                type="text"
                {...register("urineSugarKetone")}
                placeholder="Enter urine sugar/ketone reading"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Medication
              </label>
              <Input
                type="text"
                {...register("medication")}
                placeholder="Enter medication"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Dose
              </label>
              <Input
                type="text"
                {...register("dose")}
                placeholder="Enter dose details"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Ordered By
              </label>
              <Input
                type="text"
                {...register("orderedBy")}
                placeholder="Enter who ordered the medication"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Staff/Nurse
              </label>
              <Input
                type="text"
                {...register("staffOrNurse")}
                placeholder="Enter staff or nurse name"
                className="w-full"
              />
            </div>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Saving..." : "Add Glucose Reading"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-4">
          Glucose Reading History
        </h2>
        {glucoseReadings.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-slate-500">
              No glucose readings have been recorded for this patient yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-medium text-slate-500">#</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Blood Sugar (mg/dL)</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Urine Sugar/Ketone</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Medication</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Dose</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Ordered By</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Staff/Nurse</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Entered By</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Date/Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {glucoseReadings.map((reading, index) => (
                  <tr key={reading.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">{index + 1}</td>
                    <td className="px-4 py-3">{reading.bloodSugar || "-"}</td>
                    <td className="px-4 py-3">{reading.urineSugarKetone || "-"}</td>
                    <td className="px-4 py-3">{reading.medication || "-"}</td>
                    <td className="px-4 py-3">{reading.dose || "-"}</td>
                    <td className="px-4 py-3">{reading.orderedBy || "-"}</td>
                    <td className="px-4 py-3">{reading.staffOrNurse || "-"}</td>
                    <td className="px-4 py-3">{reading.enteredBy}</td>
                    <td className="px-4 py-3 flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-slate-500" />
                      {format(new Date(reading.timestamp), "PPpp")}
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
