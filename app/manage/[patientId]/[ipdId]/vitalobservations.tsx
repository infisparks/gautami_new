"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";
import { ref, onValue, push } from "firebase/database";
import { db, auth } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import format from "date-fns/format";

interface VitalObservation {
  id?: string;
  dateTime: string;
  temperature: string;
  pulse: string;
  respiratoryRate: string;
  bloodPressure: string;
  intakeOral: string;
  intakeIV: string;
  outputUrine: string;
  outputStool: string;
  outputAspiration: string;
  enteredBy: string;
}

interface VitalObservationFormInputs {
  dateTime: string;
  temperature: string;
  pulse: string;
  respiratoryRate: string;
  bloodPressure: string;
  intakeOral: string;
  intakeIV: string;
  outputUrine: string;
  outputStool: string;
  outputAspiration: string;
}

export default function VitalObservations() {
  const { patientId, ipdId } = useParams() as { patientId: string; ipdId: string };

  const {
    register,
    handleSubmit,
    reset
  } = useForm<VitalObservationFormInputs>({
    defaultValues: {
      dateTime: new Date().toISOString().slice(0, 16),
      temperature: "",
      pulse: "",
      respiratoryRate: "",
      bloodPressure: "",
      intakeOral: "",
      intakeIV: "",
      outputUrine: "",
      outputStool: "",
      outputAspiration: ""
    }
  });

  const [observations, setObservations] = useState<VitalObservation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch existing observations from Firebase.
  useEffect(() => {
    const obsRef = ref(db, `patients/${patientId}/ipd/${ipdId}/vitalObservations`);
    const unsubscribe = onValue(obsRef, (snapshot) => {
      setIsLoading(false);
      if (snapshot.exists()) {
        const data = snapshot.val();
        const loaded: VitalObservation[] = Object.keys(data).map((key) => ({
          id: key,
          ...data[key]
        }));
        // Sort descending by dateTime.
        loaded.sort(
          (a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime()
        );
        setObservations(loaded);
      } else {
        setObservations([]);
      }
    });
    return () => unsubscribe();
  }, [patientId, ipdId]);

  const onSubmit: SubmitHandler<VitalObservationFormInputs> = async (data) => {
    try {
      const enteredBy = auth.currentUser?.email || "unknown";
      const newObservation: VitalObservation = {
        ...data,
        enteredBy,
      };
      const obsRef = ref(db, `patients/${patientId}/ipd/${ipdId}/vitalObservations`);
      await push(obsRef, newObservation);
      reset({
        dateTime: new Date().toISOString().slice(0, 16),
        temperature: "",
        pulse: "",
        respiratoryRate: "",
        bloodPressure: "",
        intakeOral: "",
        intakeIV: "",
        outputUrine: "",
        outputStool: "",
        outputAspiration: ""
      });
    } catch (error) {
      console.error("Error saving vital observation:", error);
    }
  };

  return (
    <div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-slate-800">
            Add Vital Observation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Date & Time
              </label>
              <Input
                type="datetime-local"
                {...register("dateTime")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Temperature
              </label>
              <Input
                type="text"
                placeholder="Enter temperature"
                {...register("temperature")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Pulse
              </label>
              <Input
                type="text"
                placeholder="Enter pulse"
                {...register("pulse")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Respiratory Rate
              </label>
              <Input
                type="text"
                placeholder="Enter respiratory rate"
                {...register("respiratoryRate")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Blood Pressure
              </label>
              <Input
                type="text"
                placeholder="Enter blood pressure"
                {...register("bloodPressure")}
                className="w-full"
              />
            </div>
            <h3 className="text-lg font-semibold text-slate-700">Intake</h3>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Oral Intake
              </label>
              <Input
                type="text"
                placeholder="Enter oral intake"
                {...register("intakeOral")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                IV Intake
              </label>
              <Input
                type="text"
                placeholder="Enter IV intake"
                {...register("intakeIV")}
                className="w-full"
              />
            </div>
            <h3 className="text-lg font-semibold text-slate-700">Output</h3>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Urine
              </label>
              <Input
                type="text"
                placeholder="Enter urine output"
                {...register("outputUrine")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Stool
              </label>
              <Input
                type="text"
                placeholder="Enter stool output"
                {...register("outputStool")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Aspiration
              </label>
              <Input
                type="text"
                placeholder="Enter aspiration details"
                {...register("outputAspiration")}
                className="w-full"
              />
            </div>
            <Button type="submit" className="w-full">
              Add Observation
            </Button>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-4">Vital Observations</h2>
        {isLoading ? (
          <p className="text-center">Loading observations...</p>
        ) : observations.length === 0 ? (
          <p className="text-center text-slate-500">No observations recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 border whitespace-normal break-words">Date &amp; Time</th>
                  <th className="px-4 py-2 border whitespace-normal break-words">Temperature</th>
                  <th className="px-4 py-2 border whitespace-normal break-words">Pulse</th>
                  <th className="px-4 py-2 border whitespace-normal break-words">Resp. Rate</th>
                  <th className="px-4 py-2 border whitespace-normal break-words">BP</th>
                  <th className="px-4 py-2 border whitespace-normal break-words">Intake (Oral / IV)</th>
                  <th className="px-4 py-2 border whitespace-normal break-words">Output (Urine / Stool / Aspiration)</th>
                  <th className="px-4 py-2 border whitespace-normal break-words">Entered By</th>
                </tr>
              </thead>
              <tbody>
                {observations.map((obs) => (
                  <tr key={obs.id} className="hover:bg-slate-100">
                    <td className="px-4 py-2 border whitespace-normal break-words">
                      {format(new Date(obs.dateTime), "dd MMM yyyy, hh:mm a")}
                    </td>
                    <td className="px-4 py-2 border whitespace-normal break-words">{obs.temperature || "-"}</td>
                    <td className="px-4 py-2 border whitespace-normal break-words">{obs.pulse || "-"}</td>
                    <td className="px-4 py-2 border whitespace-normal break-words">{obs.respiratoryRate || "-"}</td>
                    <td className="px-4 py-2 border whitespace-normal break-words">{obs.bloodPressure || "-"}</td>
                    <td className="px-4 py-2 border whitespace-normal break-words">
                      {obs.intakeOral || "-"} / {obs.intakeIV || "-"}
                    </td>
                    <td className="px-4 py-2 border whitespace-normal break-words">
                      {obs.outputUrine || "-"} / {obs.outputStool || "-"} / {obs.outputAspiration || "-"}
                    </td>
                    <td className="px-4 py-2 border whitespace-normal break-words">{obs.enteredBy}</td>
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
