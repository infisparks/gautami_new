"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";
import { ref, onValue, push, set } from "firebase/database";
import { db, auth } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "lucide-react";
import format from "date-fns/format";

interface ChargeSheet {
  id?: string;
  description: string;
  doneBy: string;
  enteredBy: string;
  timestamp: string;
}

interface ChargeSheetFormInputs {
  description: string;
  doneBy: string;
}

export default function PatientCharges() {
  const { patientId, ipdId } = useParams() as {
    patientId: string;
    ipdId: string;
  };

  const { register, handleSubmit, reset } = useForm<ChargeSheetFormInputs>({
    defaultValues: {
      description: "",
      doneBy: "",
    },
  });
  const [chargeSheets, setChargeSheets] = useState<ChargeSheet[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Listen for changes in charge sheets data
  useEffect(() => {
    const chargeSheetsRef = ref(db, `patients/${patientId}/ipd/${ipdId}/chargeSheets`);
    const unsubscribe = onValue(chargeSheetsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const sheets: ChargeSheet[] = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));
        setChargeSheets(sheets);
      } else {
        setChargeSheets([]);
      }
    });
    return () => unsubscribe();
  }, [patientId, ipdId]);

  const onSubmit: SubmitHandler<ChargeSheetFormInputs> = async (data) => {
    setIsSubmitting(true);
    try {
      // Get current logged in user's email
      const loggedInEmail = auth.currentUser?.email || "unknown";
      const chargeSheetsRef = ref(db, `patients/${patientId}/ipd/${ipdId}/chargeSheets`);
      const newSheetRef = push(chargeSheetsRef);
      const newSheet: ChargeSheet = {
        description: data.description,
        doneBy: data.doneBy,
        enteredBy: loggedInEmail,
        timestamp: new Date().toISOString(),
      };
      await set(newSheetRef, newSheet);
      reset({ description: "", doneBy: "" });
    } catch (error) {
      console.error("Error saving charge sheet:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-slate-800">
            Add New Charge Sheet
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Charge Details
              </label>
              <Textarea
                placeholder="Enter procedure/medical/case details..."
                {...register("description", { required: true })}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Done By
              </label>
              <Input
                type="text"
                {...register("doneBy", { required: true })}
                placeholder="Enter name"
                className="w-full"
              />
            </div>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Saving..." : "Add Charge Sheet"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-4">Charge Sheet History</h2>
        {chargeSheets.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-slate-500">No charge sheets have been added for this patient yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-medium text-slate-500">#</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Description</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Done By</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Entered By</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Date/Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {chargeSheets.map((sheet, index) => (
                  <tr key={sheet.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">{index + 1}</td>
                    <td className="px-4 py-3">{sheet.description}</td>
                    <td className="px-4 py-3">{sheet.doneBy}</td>
                    <td className="px-4 py-3">{sheet.enteredBy}</td>
                    <td className="px-4 py-3 flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-slate-500" />
                      {format(new Date(sheet.timestamp), "PPpp")}
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
