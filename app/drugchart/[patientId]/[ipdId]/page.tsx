"use client";

import React, { useEffect, useState, Fragment } from "react";
import { useParams } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";
import { ref, onValue, push, set } from "firebase/database";
import { db, auth } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, Transition } from "@headlessui/react";
import { format } from "date-fns/format";

interface DrugChartEntry {
  id?: string;
  dateTime: string;            
  duration: string;
  dosage: string;
  drugName: string;
  dose: string;
  route: string;
  frequency: string;
  specialInstruction: string;
  stat: string;
  enteredBy: string;           
  timestamp: string;           
  signatures?: Signature[];    // Array of appended signatures
}

interface Signature {
  dateTime: string;            // user-chosen date/time, default current
  by: string;                  // user email
  timestamp: string;           // submission timestamp
}

interface DrugChartFormInputs {
  dateTime: string;
  duration: string;
  dosage: string;
  drugName: string;
  dose: string;
  route: string;
  frequency: string;
  specialInstruction: string;
  stat: string;
}

interface SignatureFormInputs {
  dateTime: string;
}

export default function DrugChartPage() {
  const { patientId, ipdId } = useParams() as { patientId: string; ipdId: string };

  // === Form for creating a NEW drug chart entry ===
  const { register, handleSubmit, reset } = useForm<DrugChartFormInputs>({
    defaultValues: {
      dateTime: new Date().toISOString().slice(0, 16),
      duration: "",
      dosage: "",
      drugName: "",
      dose: "",
      route: "",
      frequency: "",
      specialInstruction: "",
      stat: "",
    },
  });

  const [entries, setEntries] = useState<DrugChartEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // For creating a new signature
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [entryForSignature, setEntryForSignature] = useState<DrugChartEntry | null>(null);
  const {
    register: registerSign,
    handleSubmit: handleSubmitSign,
    reset: resetSign,
  } = useForm<SignatureFormInputs>({
    defaultValues: {
      dateTime: new Date().toISOString().slice(0, 16),
    },
  });

  // ====== Fetch existing entries from Firebase ======
  useEffect(() => {
    const drugChartRef = ref(db, `patients/${patientId}/ipd/${ipdId}/drugChart`);
    const unsubscribe = onValue(drugChartRef, (snapshot) => {
      setIsLoading(false);
      if (snapshot.exists()) {
        const data = snapshot.val();
        const loaded: DrugChartEntry[] = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));
        // Sort entries by dateTime descending
        loaded.sort(
          (a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime()
        );
        setEntries(loaded);
      } else {
        setEntries([]);
      }
    });
    return () => unsubscribe();
  }, [patientId, ipdId]);

  // ====== Create a NEW drug chart entry ======
  const onSubmit: SubmitHandler<DrugChartFormInputs> = async (data) => {
    try {
      const enteredBy = auth.currentUser?.email || "unknown";
      const newEntry: DrugChartEntry = {
        ...data,
        enteredBy,
        timestamp: new Date().toISOString(),
        signatures: [],
      };
      const drugChartRef = ref(db, `patients/${patientId}/ipd/${ipdId}/drugChart`);
      await push(drugChartRef, newEntry);
      // Reset the form
      reset({
        dateTime: new Date().toISOString().slice(0, 16),
        duration: "",
        dosage: "",
        drugName: "",
        dose: "",
        route: "",
        frequency: "",
        specialInstruction: "",
        stat: "",
      });
    } catch (error) {
      console.error("Error saving drug chart entry:", error);
    }
  };

  // ====== Opening the signature modal ======
  const handleSignatureClick = (entry: DrugChartEntry) => {
    setEntryForSignature(entry);
    // Pre-fill the signature form with the current date/time
    resetSign({ dateTime: new Date().toISOString().slice(0, 16) });
    setSignatureModalOpen(true);
  };

  // ====== Saving a signature for an existing entry ======
  const onSubmitSignature: SubmitHandler<SignatureFormInputs> = async (data) => {
    if (!entryForSignature || !entryForSignature.id) return;
    try {
      const by = auth.currentUser?.email || "unknown";
      const signature: Signature = {
        dateTime: data.dateTime,
        by,
        timestamp: new Date().toISOString(),
      };
      // Build a new array of signatures
      const oldSignatures = entryForSignature.signatures || [];
      const newSignatures = [...oldSignatures, signature];
      const updatedEntry: DrugChartEntry = {
        ...entryForSignature,
        signatures: newSignatures,
      };
      // Save to Firebase
      const entryRef = ref(
        db,
        `patients/${patientId}/ipd/${ipdId}/drugChart/${entryForSignature.id}`
      );
      await set(entryRef, updatedEntry);

      // Update local state
      setEntries((prev) =>
        prev.map((ent) =>
          ent.id === entryForSignature.id ? updatedEntry : ent
        )
      );

      setSignatureModalOpen(false);
      setEntryForSignature(null);
    } catch (error) {
      console.error("Error saving signature:", error);
    }
  };

  // Group the entries by day
  const groupedEntries = entries.reduce((acc: Record<string, DrugChartEntry[]>, entry) => {
    const day = format(new Date(entry.dateTime), "dd MMM yyyy");
    if (!acc[day]) {
      acc[day] = [];
    }
    acc[day].push(entry);
    return acc;
  }, {});

  return (
    <div className="p-4">
      {/* New Entry Form */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-slate-800">
            New Drug Chart Entry
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Date &amp; Time</label>
              <Input
                type="datetime-local"
                {...register("dateTime")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Duration</label>
              <Input
                type="text"
                placeholder="Enter duration"
                {...register("duration")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Dosage</label>
              <Input
                type="text"
                placeholder="Enter dosage"
                {...register("dosage")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Drug Name</label>
              <Input
                type="text"
                placeholder="Enter drug name"
                {...register("drugName")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Dose</label>
              <Input
                type="text"
                placeholder="Enter dose"
                {...register("dose")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Route</label>
              <Input
                type="text"
                placeholder="Enter route (e.g., oral, IV)"
                {...register("route")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Frequency</label>
              <Input
                type="text"
                placeholder="Enter frequency (e.g., Q6H)"
                {...register("frequency")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Special Instruction</label>
              <Textarea
                placeholder="Enter special instructions"
                {...register("specialInstruction")}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Stat</label>
              <Input
                type="text"
                placeholder="Enter stat if applicable"
                {...register("stat")}
                className="w-full"
              />
            </div>
            <Button type="submit" className="w-full">
              Save Entry
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* List of Entries */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-4">Drug Chart Entries</h2>
        {isLoading ? (
          <p className="text-center">Loading entries...</p>
        ) : Object.keys(groupedEntries).length === 0 ? (
          <p className="text-center text-slate-500">No entries recorded yet.</p>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedEntries).map(([day, dayEntries]) => (
              <Card key={day}>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-slate-800">{day}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {dayEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="border p-2 rounded shadow-sm flex flex-col gap-2"
                      >
                        <div className="flex justify-between flex-wrap">
                          <div>
                            <p className="font-medium mb-1">
                              Time: {format(new Date(entry.dateTime), "hh:mm a")}
                            </p>
                            <p className="text-sm">Drug: {entry.drugName}</p>
                            <p className="text-sm">Duration: {entry.duration}</p>
                            <p className="text-sm">Dosage: {entry.dosage}</p>
                            <p className="text-sm">Dose: {entry.dose}</p>
                            <p className="text-sm">Route: {entry.route}</p>
                            <p className="text-sm">Frequency: {entry.frequency}</p>
                            <p className="text-sm">Special Instruction: {entry.specialInstruction}</p>
                            <p className="text-sm">Stat: {entry.stat}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              Entered By: {entry.enteredBy}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSignatureClick(entry)}
                            >
                              Signature
                            </Button>
                          </div>
                        </div>
                        {/* Signatures list (if any) */}
                        {entry.signatures && entry.signatures.length > 0 && (
                          <div className="mt-2 border-t pt-2">
                            <p className="text-sm font-semibold text-slate-700 mb-1">
                              Signatures:
                            </p>
                            <div className="space-y-1">
                              {entry.signatures.map((sig, idx) => (
                                <div
                                  key={idx}
                                  className="text-xs text-gray-700 flex items-center gap-2"
                                >
                                  <span>-</span>
                                  <span>
                                    {format(new Date(sig.dateTime), "dd MMM yyyy, hh:mm a")}
                                  </span>
                                  <span className="text-gray-500">
                                    by {sig.by}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Signature Modal */}
      <Transition appear show={signatureModalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setSignatureModalOpen(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-40" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                    Add Signature
                  </Dialog.Title>
                  <form onSubmit={handleSubmitSign(onSubmitSignature)} className="mt-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700">
                        Date &amp; Time
                      </label>
                      <Input
                        type="datetime-local"
                        {...registerSign("dateTime")}
                        className="w-full"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        (Auto-filled, can be changed if needed)
                      </p>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setSignatureModalOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit">Save</Button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}

