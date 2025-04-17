"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";
import { ref, onValue, push, set, update } from "firebase/database";
import { db, auth } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
// import { Calendar } from "lucide-react";
import { format } from "date-fns/format";

interface InvestigationEntry {
  dateTime: string;
  message: string;
}

interface InvestigationRecord {
  id?: string;
  testName: string;
  entries: InvestigationEntry[];
  enteredBy: string;
}

interface InvestigationFormInputs {
  testName: string;
  dateTime: string;
  message: string;
}

interface AdditionalEntryFormInputs {
  dateTime: string;
  message: string;
}

const testOptions = [
  "HIV",
  "HBsAg",
  "HCV",
  "HU",
  "pH",
  "pCO2",
  "pO2",
  "HCO3",
  "SAT",
  "Mode",
  "TV",
  "RR",
  "FLO2",
  "PEEP/EPAP",
  "iPAD",
  "HB",
  "WBC",
  "PLATELET",
  "CRP",
  "ESR",
  "PT",
  "INR",
  "PTT",
  "S. CREATININE",
  "FIBRINOGEN",
  "FDP",
  "BILIRUBIN",
  "SGOT",
  "SGPT",
  "ALK PHOSPHATE",
  "TOTAL PROTEIN",
  "ALBUMIN",
  "GLOBULIN",
  "SODIUM",
  "POTASSIUM",
  "CHLORIDE",
  "BUN",
  "BS",
  "PPBS",
  "CALCIUM",
  "PHOSPHORUS",
  "URIC ACID",
  "LACTATE",
  "MAGNESIUM",
  "CKMB",
  "CPK",
  "LDH",
  "CHOLESTEROL",
  "TRIGLYCERIDE",
  "LDL",
  "TROP T / TROP I",
  "BNP"
];

export default function InvestigationSheet() {
  const { patientId, ipdId } = useParams() as { patientId: string; ipdId: string };
  
  const [investigations, setInvestigations] = useState<InvestigationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // To track which record has its "Add More" form open
  const [activeAdditionalEntryRecord, setActiveAdditionalEntryRecord] = useState<string | null>(null);

  // Form for creating a new investigation record
  const { register, handleSubmit, reset } = useForm<InvestigationFormInputs>({
    defaultValues: {
      testName: "",
      dateTime: new Date().toISOString().slice(0, 16), // for datetime-local input
      message: ""
    }
  });
  
  // Form for adding an additional entry to an existing record
  const { register: registerAdditional, handleSubmit: handleSubmitAdditional, reset: resetAdditional } = useForm<AdditionalEntryFormInputs>({
    defaultValues: {
      dateTime: new Date().toISOString().slice(0, 16),
      message: ""
    }
  });

  // ----------------- Fetch Investigation Records ----------------- //
  useEffect(() => {
    const invRef = ref(db, `patients/${patientId}/ipd/${ipdId}/investigations`);
    const unsubscribe = onValue(invRef, (snapshot) => {
      setIsLoading(false);
      if (snapshot.exists()) {
        const data = snapshot.val();
        const records: InvestigationRecord[] = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));
        setInvestigations(records);
      } else {
        setInvestigations([]);
      }
    });
    return () => unsubscribe();
  }, [patientId, ipdId]);

  // ----------------- Submit New Investigation Record ----------------- //
  const onSubmitInvestigation: SubmitHandler<InvestigationFormInputs> = async (data) => {
    try {
      const loggedInEmail = auth.currentUser?.email || "unknown";
      const invRef = ref(db, `patients/${patientId}/ipd/${ipdId}/investigations`);
      const newInvRef = push(invRef);
      const newRecord: InvestigationRecord = {
        testName: data.testName,
        entries: [{
          dateTime: data.dateTime,
          message: data.message
        }],
        enteredBy: loggedInEmail
      };
      await set(newInvRef, newRecord);
      reset({
        testName: "",
        dateTime: new Date().toISOString().slice(0, 16),
        message: ""
      });
    } catch (error) {
      console.error("Error saving investigation record:", error);
    }
  };

  // ----------------- Submit Additional Entry for an Existing Record ----------------- //
  const onSubmitAdditional: SubmitHandler<AdditionalEntryFormInputs> = async (data) => {
    try {
      if (!activeAdditionalEntryRecord) return;
      const record = investigations.find(inv => inv.id === activeAdditionalEntryRecord);
      if (!record) return;
      const updatedEntries = [
        ...record.entries,
        { dateTime: data.dateTime, message: data.message }
      ];
      const recordRef = ref(db, `patients/${patientId}/ipd/${ipdId}/investigations/${activeAdditionalEntryRecord}`);
      await update(recordRef, { entries: updatedEntries });
      setInvestigations(investigations.map(r => 
        r.id === activeAdditionalEntryRecord ? { ...r, entries: updatedEntries } : r
      ));
      resetAdditional({
        dateTime: new Date().toISOString().slice(0, 16),
        message: ""
      });
      setActiveAdditionalEntryRecord(null);
    } catch (error) {
      console.error("Error adding additional entry:", error);
    }
  };

  return (
    <div>
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-slate-800">Add New Investigation</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmitInvestigation)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Test Name</label>
              <select {...register("testName")} className="w-full border rounded p-2">
                <option value="">Select Test</option>
                {testOptions.map((test, idx) => (
                  <option key={idx} value={test}>
                    {test}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Date &amp; Time</label>
              <Input type="datetime-local" {...register("dateTime")} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Message</label>
              <Textarea
                placeholder="Enter any additional details"
                {...register("message")}
                className="w-full"
              />
            </div>
            <Button type="submit" className="w-full">Add Investigation</Button>
          </form>
        </CardContent>
      </Card>

      {/* Display Investigation Records */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-4">Investigation Records</h2>
        {isLoading ? (
          <p className="text-center">Loading...</p>
        ) : investigations.length === 0 ? (
          <p className="text-center">No investigation records found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 border">Test Name</th>
                  <th className="px-4 py-2 border">Date &amp; Time</th>
                  <th className="px-4 py-2 border">Message</th>
                  <th className="px-4 py-2 border">Actions</th>
                </tr>
              </thead>
              <tbody>
                {investigations.map(record => (
                  <React.Fragment key={record.id}>
                    {record.entries.map((entry, idx) => (
                      <tr key={idx} className="hover:bg-slate-100">
                        {idx === 0 && (
                          <td className="px-4 py-2 border" rowSpan={record.entries.length}>
                            {record.testName}
                          </td>
                        )}
                        <td className="px-4 py-2 border">
                          {format(new Date(entry.dateTime), "PPpp")}
                        </td>
                        <td className="px-4 py-2 border">{entry.message}</td>
                        {idx === 0 && (
                          <td className="px-4 py-2 border" rowSpan={record.entries.length}>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setActiveAdditionalEntryRecord(record.id || null)}
                            >
                              Add More
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {activeAdditionalEntryRecord === record.id && (
                      <tr className="bg-slate-50">
                        <td colSpan={4} className="px-4 py-2">
                          <form onSubmit={handleSubmitAdditional(onSubmitAdditional)} className="flex flex-col md:flex-row gap-4 items-center">
                            <div className="flex-1">
                              <label className="block text-sm font-medium text-slate-700">Date &amp; Time</label>
                              <Input type="datetime-local" {...registerAdditional("dateTime")} className="w-full" />
                            </div>
                            <div className="flex-1">
                              <label className="block text-sm font-medium text-slate-700">Message</label>
                              <Input type="text" {...registerAdditional("message")} placeholder="Enter additional message" className="w-full" />
                            </div>
                            <div>
                              <Button type="submit" className="w-full">Save</Button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
