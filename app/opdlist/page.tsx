"use client";

import { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { db, auth } from "../../lib/firebase";
import {
  ref,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  get,
  update,
  remove,
  push,
  onValue,
  set,
} from "firebase/database";
import { onAuthStateChanged } from "firebase/auth";
import {
  Phone,
  MessageSquare,
  DollarSign,
  Edit,
  Trash2,
  Search,
  ArrowLeft,
  Calendar,
  User as UserIcon,
  Stethoscope,
  History,
} from "lucide-react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRouter } from "next/navigation";
import type React from "react";

//
// ————————————
//   TYPES & CONSTANTS
// ————————————
//

// We only store a “summary” of each OPD record here:
interface OPD_Summary {
  uhid: string;       // top‐level key under “patients/opddetail”
  id: string;         // the opdId
  date: string;       // ISO string
  time: string;       // e.g. “7:59 AM”
  serviceName: string;
  doctor: string;
  appointmentType: string; // “visithospital” | “oncall”
  opdType: string;    // usually “opd”
}

// When editing, we fetch full details into this shape:
interface OPD_Full {
  uhid: string;
  id: string;
  date: string;
  time: string;
  paymentMethod: string;
  originalAmount: number;
  amount: number;
  discount: number;
  serviceName: string;
  doctor: string;
  message?: string;
  referredBy?: string;
  appointmentType: string;
  opdType: string;
  enteredBy: string;
  createdAt: string;
}

// When editing, we also need patient info:
interface PatientInfo {
  name: string;
  phone: string;
  age: string | number;
  gender: string;
  address?: string;
}

// “Doctor” shape remains the same:
interface Doctor {
  id: string;
  name: string;
  opdCharge: number;
  specialty?: string;
}

// Form data for editing (we’ll convert date back to ISO):
interface EditFormData {
  name: string;
  phone: string;
  age: number;
  gender: string;
  address: string;
  date: Date;
  time: string;
  paymentMethod: string;
  amount: number;
  discount: number;
  serviceName: string;
  doctor: string;
  message: string;
  referredBy: string;
}

const PaymentOptions = [
  { value: "cash", label: "Cash" },
  { value: "online", label: "Online" },
  { value: "card", label: "Card" },
  { value: "upi", label: "UPI" },
];

const GenderOptions = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

//
// ——————————————
//   MAIN COMPONENT
// ——————————————
export default function ManageOPDPage() {
  const router = useRouter();
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  // Summaries of all appointments:
  const [summaries, setSummaries] = useState<OPD_Summary[]>([]);
  // Filtered list for search:
  const [filtered, setFiltered] = useState<OPD_Summary[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // All doctors (for dropdown):
  const [doctors, setDoctors] = useState<Doctor[]>([]);

  // All patient infos (uhid → PatientInfo):
  const [patientInfos, setPatientInfos] = useState<Record<string, PatientInfo>>({});

  // Loading flags:
  const [loading, setLoading] = useState(false);

  // EDIT DIALOG:
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [uhidEditing, setUhidEditing] = useState<string | null>(null);
  const [opdIdEditing, setOpdIdEditing] = useState<string | null>(null);
  const [patientInfoEditing, setPatientInfoEditing] =
    useState<PatientInfo | null>(null);

  // DELETE DIALOG:
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [toDeleteSummary, setToDeleteSummary] = useState<OPD_Summary | null>(
    null
  );

  // Form for editing:
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    reset,
    watch,
  } = useForm<EditFormData>();

  //
  // ————————————————
  //   AUTH LISTENER
  // ————————————————
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user && user.email) {
        setCurrentUserEmail(user.email);
      } else {
        setCurrentUserEmail(null);
      }
    });
    return () => unsub();
  }, []);

  //
  // ————————————————
  //   FETCH DOCTORS ONCE
  // ————————————————
  useEffect(() => {
    const doctorsRef = ref(db, "doctors");
    const unsub = onValue(doctorsRef, (snap) => {
      const data = snap.val();
      const list: Doctor[] = [];
      if (data) {
        Object.keys(data).forEach((key) => {
          list.push({
            id: key,
            name: data[key].name,
            opdCharge: data[key].opdCharge || 0,
            specialty: data[key].specialty || "",
          });
        });
      }
      // Prepend “No Doctor” option
      list.unshift({ id: "no_doctor", name: "No Doctor", opdCharge: 0 });
      setDoctors(list);
    });
    return () => unsub();
  }, []);

  //
  // ————————————————
  //   FETCH ALL PATIENT INFO ONCE
  // ————————————————
  useEffect(() => {
    const patientInfoRef = ref(db, "patients/patientinfo");
    const unsub = onValue(patientInfoRef, (snap) => {
      const data = snap.val() || {};
      const map: Record<string, PatientInfo> = {};
      Object.keys(data).forEach((uhidKey) => {
        const info = data[uhidKey];
        map[uhidKey] = {
          name: info.name || "",
          phone: info.phone || "",
          age: info.age,
          gender: info.gender,
          address: info.address || "",
        };
      });
      setPatientInfos(map);
    });
    return () => unsub();
  }, []);

  //
  // ————————————————————————————————————————
  //   STREAM “summaries” FROM `patients/opddetail/{uhid}/{opdId}`
  //   (onChildAdded/Changed/Removed)
  // ————————————————————————————————————————
  useEffect(() => {
    const summaryMap = new Map<string, OPD_Summary>();
    // key = `${uhid}:${opdId}`

    const listenersPerUhid = new Map<
      string,
      {
        addedUnsub: () => void;
        changedUnsub: () => void;
        removedUnsub: () => void;
      }
    >();

    // Step 1: listen for any new UHID node under “patients/opddetail”
    const rootRef = ref(db, "patients/opddetail");
    const unsubUhidAdded = onChildAdded(rootRef, (uhidSnap) => {
      const uhid = uhidSnap.key!;
      const userOpdRef = ref(db, `patients/opddetail/${uhid}`);

      // When a new OPD record is created under this UHID:
      const unsubAdded = onChildAdded(userOpdRef, (opdSnap) => {
        const opdData = opdSnap.val();
        const summary: OPD_Summary = {
          uhid,
          id: opdSnap.key!,
          date: opdData.date,
          time: opdData.time,
          serviceName: opdData.serviceName,
          doctor: opdData.doctor,
          appointmentType: opdData.appointmentType,
          opdType: opdData.opdType,
        };
        summaryMap.set(`${uhid}:${opdSnap.key!}`, summary);
        setSummaries(Array.from(summaryMap.values()));
      });

      // When an existing OPD record changes under this UHID:
      const unsubChanged = onChildChanged(userOpdRef, (opdSnap) => {
        const opdData = opdSnap.val();
        const key = `${uhid}:${opdSnap.key!}`;
        if (summaryMap.has(key)) {
          summaryMap.set(key, {
            uhid,
            id: opdSnap.key!,
            date: opdData.date,
            time: opdData.time,
            serviceName: opdData.serviceName,
            doctor: opdData.doctor,
            appointmentType: opdData.appointmentType,
            opdType: opdData.opdType,
          });
          setSummaries(Array.from(summaryMap.values()));
        }
      });

      // When an OPD record is removed under this UHID:
      const unsubRemoved = onChildRemoved(userOpdRef, (opdSnap) => {
        const key = `${uhid}:${opdSnap.key!}`;
        summaryMap.delete(key);
        setSummaries(Array.from(summaryMap.values()));
      });

      listenersPerUhid.set(uhid, {
        addedUnsub: () => unsubAdded(),
        changedUnsub: () => unsubChanged(),
        removedUnsub: () => unsubRemoved(),
      });
    });

    // When a UHID node is itself removed:
    const unsubUhidRemoved = onChildRemoved(rootRef, (uhidSnap) => {
      const uhid = uhidSnap.key!;
      // Unsubscribe all listeners under that UHID:
      const entry = listenersPerUhid.get(uhid);
      if (entry) {
        entry.addedUnsub();
        entry.changedUnsub();
        entry.removedUnsub();
        listenersPerUhid.delete(uhid);
      }
      // Also remove all summaries belonging to that UHID:
      Array.from(summaryMap.keys()).forEach((key) => {
        if (key.startsWith(`${uhid}:`)) {
          summaryMap.delete(key);
        }
      });
      setSummaries(Array.from(summaryMap.values()));
    });

    // CLEAN UP on unmount:
    return () => {
      unsubUhidAdded();
      unsubUhidRemoved();
      listenersPerUhid.forEach((entry) => {
        entry.addedUnsub();
        entry.changedUnsub();
        entry.removedUnsub();
      });
      listenersPerUhid.clear();
    };
  }, []);

  //
  // ——————————————
  //   SEARCH FILTER
  // ——————————————
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFiltered(summaries);
    } else {
      const lower = searchQuery.toLowerCase();
      setFiltered(
        summaries.filter((s) => {
          // match serviceName, doctor name, or UHID, or patient name/phone
          const matchesService = s.serviceName.toLowerCase().includes(lower);
          const matchesDoctor =
            doctors.find((d) => d.id === s.doctor)?.name
              .toLowerCase()
              .includes(lower) || false;
          const matchesUhid = s.uhid.toLowerCase().includes(lower);
          const pInfo = patientInfos[s.uhid];
          const matchesPatientName = pInfo
            ? pInfo.name.toLowerCase().includes(lower)
            : false;
          const matchesPatientPhone = pInfo
            ? pInfo.phone.toLowerCase().includes(lower)
            : false;
          return (
            matchesService ||
            matchesDoctor ||
            matchesUhid ||
            matchesPatientName ||
            matchesPatientPhone
          );
        })
      );
    }
  }, [searchQuery, summaries, doctors, patientInfos]);

  //
  // ——————————————
  //   GET DISPLAY NAME FOR DOCTOR
  // ——————————————
  const getDoctorName = (id: string) => {
    return doctors.find((d) => d.id === id)?.name || id;
  };

  //
  // ————————————————————————————————
  //   OPEN EDIT DIALOG → FETCH FULL DETAILS
  // ————————————————————————————————
  async function openEditDialog(summary: OPD_Summary) {
    setLoading(true);
    try {
      // 1) Fetch full OPD data:
      const opdSnap = await get(
        ref(db, `patients/opddetail/${summary.uhid}/${summary.id}`)
      );
      const opdData: OPD_Full = opdSnap.val();
      if (!opdData) {
        toast.error("Could not load appointment details.");
        setLoading(false);
        return;
      }
      // 2) Fetch patient info from “patients/patientinfo/{uhid}”:
      const patientInfoSnap = await get(
        ref(db, `patients/patientinfo/${summary.uhid}`)
      );
      let patientInfo: PatientInfo;
      if (patientInfoSnap.exists()) {
        const info = patientInfoSnap.val();
        patientInfo = {
          name: info.name,
          phone: info.phone,
          age: info.age,
          gender: info.gender,
          address: info.address || "",
        };
      } else {
        // fallback: blank
        patientInfo = { name: "", phone: "", age: 0, gender: "", address: "" };
      }

      // 3) Populate form:
      reset({
        name: patientInfo.name,
        phone: patientInfo.phone,
        age: Number(patientInfo.age),
        gender: patientInfo.gender,
        address: patientInfo.address,
        date: new Date(opdData.date),
        time: opdData.time,
        paymentMethod: opdData.paymentMethod,
        amount: opdData.originalAmount,
        discount: opdData.discount,
        serviceName: opdData.serviceName,
        doctor: opdData.doctor,
        message: opdData.message || "",
        referredBy: opdData.referredBy || "",
      });

      setPatientInfoEditing(patientInfo);
      setUhidEditing(summary.uhid);
      setOpdIdEditing(summary.id);
      setEditDialogOpen(true);
    } catch (err) {
      console.error(err);
      toast.error("Error loading edit form.");
    } finally {
      setLoading(false);
    }
  }

  //
  // ————————————————————————————————
  //   SAVE EDITED DATA (WITH CHANGE & MESSAGE LOGGING)
  // ————————————————————————————————
  const handleSaveEdit = async (formData: EditFormData) => {
    if (!uhidEditing || !opdIdEditing) return;
    setLoading(true);
    try {
      // 1) Detect changes for tracking:
      const changes: Array<{
        field: string;
        oldValue: any;
        newValue: any;
      }> = [];
      const changeMessages: string[] = [];

      // Fetch original OPD again to compare:
      const origSnap = await get(
        ref(db, `patients/opddetail/${uhidEditing}/${opdIdEditing}`)
      );
      const orig: any = origSnap.val() || {};

      // a) Patient Name change (comes from patientInfo)
      if (patientInfoEditing && patientInfoEditing.name !== formData.name) {
        changes.push({
          field: "name",
          oldValue: patientInfoEditing.name,
          newValue: formData.name,
        });
        changeMessages.push(
          `Edited Patient Name: “${patientInfoEditing.name}” → “${formData.name}”`
        );
      }

      // b) Phone change
      if (patientInfoEditing && patientInfoEditing.phone !== formData.phone) {
        changes.push({
          field: "phone",
          oldValue: patientInfoEditing.phone,
          newValue: formData.phone,
        });
        changeMessages.push(
          `Edited Phone Number: “${patientInfoEditing.phone}” → “${formData.phone}”`
        );
      }

      // c) Age change
      if (patientInfoEditing && String(patientInfoEditing.age) !== String(formData.age)) {
        changes.push({
          field: "age",
          oldValue: patientInfoEditing.age,
          newValue: formData.age,
        });
        changeMessages.push(
          `Edited Age: “${patientInfoEditing.age}” → “${formData.age}”`
        );
      }

      // d) Gender change
      if (patientInfoEditing && patientInfoEditing.gender !== formData.gender) {
        changes.push({
          field: "gender",
          oldValue: patientInfoEditing.gender,
          newValue: formData.gender,
        });
        changeMessages.push(
          `Edited Gender: “${patientInfoEditing.gender}” → “${formData.gender}”`
        );
      }

      // e) Address change
      if (
        patientInfoEditing &&
        (patientInfoEditing.address || "") !== formData.address
      ) {
        changes.push({
          field: "address",
          oldValue: patientInfoEditing.address || "",
          newValue: formData.address,
        });
        changeMessages.push(
          `Edited Address: “${patientInfoEditing.address || "Not set"}” → “${formData.address || "Not set"}”`
        );
      }

      // f) Appointment fields (OPD node) – compare against orig
      if (orig.date !== formData.date.toISOString()) {
        changes.push({
          field: "date",
          oldValue: orig.date,
          newValue: formData.date.toISOString(),
        });
        changeMessages.push(
          `Edited Appointment Date: “${new Date(orig.date).toLocaleDateString()}” → “${formData.date.toLocaleDateString()}”`
        );
      }
      if (orig.time !== formData.time) {
        changes.push({
          field: "time",
          oldValue: orig.time,
          newValue: formData.time,
        });
        changeMessages.push(
          `Edited Appointment Time: “${orig.time}” → “${formData.time}”`
        );
      }
      if (orig.serviceName !== formData.serviceName) {
        changes.push({
          field: "serviceName",
          oldValue: orig.serviceName,
          newValue: formData.serviceName,
        });
        changeMessages.push(
          `Edited Service Name: “${orig.serviceName}” → “${formData.serviceName}”`
        );
      }
      if (orig.doctor !== formData.doctor) {
        changes.push({
          field: "doctor",
          oldValue: orig.doctor,
          newValue: formData.doctor,
        });
        const oldDocName = doctors.find((d) => d.id === orig.doctor)?.name || orig.doctor;
        const newDocName = doctors.find((d) => d.id === formData.doctor)?.name || formData.doctor;
        changeMessages.push(
          `Edited Doctor: “${oldDocName}” → “${newDocName}”`
        );
      }
      if (orig.paymentMethod !== formData.paymentMethod) {
        changes.push({
          field: "paymentMethod",
          oldValue: orig.paymentMethod,
          newValue: formData.paymentMethod,
        });
        changeMessages.push(
          `Edited Payment Method: “${orig.paymentMethod}” → “${formData.paymentMethod}”`
        );
      }
      if (orig.originalAmount !== formData.amount) {
        changes.push({
          field: "originalAmount",
          oldValue: orig.originalAmount,
          newValue: formData.amount,
        });
        changeMessages.push(
          `Edited Original Amount: “₹${orig.originalAmount}” → “₹${formData.amount}”`
        );
      }
      if (orig.discount !== formData.discount) {
        changes.push({
          field: "discount",
          oldValue: orig.discount,
          newValue: formData.discount,
        });
        changeMessages.push(
          `Edited Discount: “₹${orig.discount}” → “₹${formData.discount}”`
        );
      }
      const newFinal = formData.amount - formData.discount;
      if (orig.amount !== newFinal) {
        changes.push({
          field: "amount",
          oldValue: orig.amount,
          newValue: newFinal,
        });
        changeMessages.push(
          `Edited Final Amount: “₹${orig.amount}” → “₹${newFinal}”`
        );
      }
      if ((orig.message || "") !== formData.message) {
        changes.push({
          field: "message",
          oldValue: orig.message || "",
          newValue: formData.message,
        });
        changeMessages.push(
          `Edited Notes: “${orig.message || "None"}” → “${formData.message || "None"}”`
        );
      }
      if ((orig.referredBy || "") !== formData.referredBy) {
        changes.push({
          field: "referredBy",
          oldValue: orig.referredBy || "",
          newValue: formData.referredBy,
        });
        changeMessages.push(
          `Edited Referred By: “${
            orig.referredBy || "None"
          }” → “${formData.referredBy || "None"}”`
        );
      }

      // 2) Write to `opdChanges` only if something changed:
      if (changes.length > 0) {
        const patientName = formData.name;
        const changesRef = ref(db, "opdChanges");
        const newChangeRef = push(changesRef);
        await set(newChangeRef, {
          type: "edit",
          appointmentId: opdIdEditing,
          patientId: uhidEditing,
          patientName: patientName,
          changes: changes,
          changeMessages: changeMessages,
          editedBy: currentUserEmail || "unknown",
          editedAt: new Date().toISOString(),
        });
      }

      // 3) Update patient info if name/phone/age/gender/address changed:
      const patientChanges: any = {};
      if (patientInfoEditing) {
        if (patientInfoEditing.name !== formData.name) {
          patientChanges.name = formData.name;
        }
        if (patientInfoEditing.phone !== formData.phone) {
          patientChanges.phone = formData.phone;
        }
        if (String(patientInfoEditing.age) !== String(formData.age)) {
          patientChanges.age = String(formData.age);
        }
        if (patientInfoEditing.gender !== formData.gender) {
          patientChanges.gender = formData.gender;
        }
        if ((patientInfoEditing.address || "") !== formData.address) {
          patientChanges.address = formData.address;
        }
      }
      if (Object.keys(patientChanges).length > 0) {
        await update(
          ref(db, `patients/patientinfo/${uhidEditing}`),
          patientChanges
        );
      }

      // 4) Update the OPD node:
      const updatedData: any = {
        date: formData.date.toISOString(),
        time: formData.time,
        paymentMethod: formData.paymentMethod,
        originalAmount: formData.amount,
        discount: formData.discount,
        amount: formData.amount - formData.discount,
        serviceName: formData.serviceName,
        doctor: formData.doctor,
        message: formData.message,
        referredBy: formData.referredBy,
        lastModifiedBy: currentUserEmail || "unknown",
        lastModifiedAt: new Date().toISOString(),
      };
      await update(
        ref(db, `patients/opddetail/${uhidEditing}/${opdIdEditing}`),
        updatedData
      );

      toast.success("Appointment updated successfully!");
      setEditDialogOpen(false);
      setUhidEditing(null);
      setOpdIdEditing(null);
      setPatientInfoEditing(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save changes.");
    } finally {
      setLoading(false);
    }
  };

  //
  // ————————————————————————————————
  //   DELETE APPOINTMENT (WITH CHANGE LOGGING)
  // ————————————————————————————————
  const handleDeleteAppointment = async () => {
    if (!toDeleteSummary) return;
    setLoading(true);
    try {
      // 1) Fetch full OPD data for logging:
      const fullSnap = await get(
        ref(db, `patients/opddetail/${toDeleteSummary.uhid}/${toDeleteSummary.id}`)
      );
      const fullData: any = fullSnap.val() || {};
      // Build appointmentData object for change log:
      const patientInfo = patientInfos[toDeleteSummary.uhid] || {
        name: "Unknown",
        phone: "",
        age: "",
        gender: "",
        address: "",
      };
      const appointmentDataLog: Record<string, any> = {
        patientName: patientInfo.name,
        phone: patientInfo.phone,
        date: fullData.date,
        time: fullData.time,
        serviceName: fullData.serviceName,
        doctor: fullData.doctor,
        amount: fullData.amount,
        appointmentType: fullData.appointmentType,
      };

      // 2) Log the delete in `opdChanges`:
      const changesRef = ref(db, "opdChanges");
      const newChangeRef = push(changesRef);
      await set(newChangeRef, {
        type: "delete",
        appointmentId: toDeleteSummary.id,
        patientId: toDeleteSummary.uhid,
        patientName: patientInfo.name,
        appointmentData: appointmentDataLog,
        deletedBy: currentUserEmail || "unknown",
        deletedAt: new Date().toISOString(),
      });

      // 3) Remove the OPD node:
      await remove(
        ref(db, `patients/opddetail/${toDeleteSummary.uhid}/${toDeleteSummary.id}`)
      );
      toast.success("Appointment deleted successfully!");
      setDeleteDialogOpen(false);
      setToDeleteSummary(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete appointment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-4 py-8">
          <Card className="w-full max-w-7xl mx-auto shadow-lg">
            <CardHeader className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-2xl md:text-3xl font-bold">
                    Manage OPD Appointments
                  </CardTitle>
                  <CardDescription className="text-emerald-100">
                    Streamlined list (minimal data) & on‐demand details
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push("/opd-changes")}
                    className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                  >
                    <History className="mr-2 h-4 w-4" />
                    View Changes
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push("/opd-booking")}
                    className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Booking
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              {/* Search Bar */}
              <div className="mb-6">
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                      placeholder="Search by UHID, service, doctor, patient name, or phone..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <div className="text-sm text-gray-600">
                    Total: {filtered.length} appointments
                  </div>
                </div>
              </div>

              {/* Summaries List */}
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  {searchQuery
                    ? "No matching appointments found"
                    : "No OPD appointments available"}
                </div>
              ) : (
                <ScrollArea className="h-[600px]">
                  <div className="space-y-4">
                    {filtered.map((s) => {
                      const pInfo = patientInfos[s.uhid] || {
                        name: "Unknown",
                        phone: "",
                        age: "",
                        gender: "",
                        address: "",
                      };
                      return (
                        <Card
                          key={`${s.uhid}-${s.id}`}
                          className="overflow-hidden hover:shadow-md transition-shadow"
                        >
                          <CardHeader className="bg-gray-50 dark:bg-gray-800 p-4">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <CardTitle className="text-lg">{s.uhid}</CardTitle>
                                  <Badge variant="outline">
                                    {s.opdType.toUpperCase()}
                                  </Badge>
                                  <Badge
                                    variant={
                                      s.appointmentType === "visithospital"
                                        ? "default"
                                        : "secondary"
                                    }
                                  >
                                    {s.appointmentType === "visithospital"
                                      ? "Hospital Visit"
                                      : "On-Call"}
                                  </Badge>
                                </div>

                                {/* Patient Name and Phone */}
                                <div className="text-sm text-gray-700 mb-2 flex items-center gap-2">
                                  <UserIcon className="h-4 w-4" />
                                  <span>{pInfo.name}</span>
                                  {pInfo.phone && (
                                    <>
                                      <Phone className="h-4 w-4" />
                                      <span>{pInfo.phone}</span>
                                    </>
                                  )}
                                </div>

                                <CardDescription className="flex items-center gap-4">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-4 w-4" />
                                    {new Date(s.date).toLocaleDateString()} at{" "}
                                    {s.time}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Stethoscope className="h-4 w-4" />
                                    {s.serviceName}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <UserIcon className="h-4 w-4" />
                                    {getDoctorName(s.doctor)}
                                  </span>
                                </CardDescription>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openEditDialog(s)}
                                  className="text-blue-600 hover:text-blue-700"
                                >
                                  <Edit className="h-4 w-4 mr-1" />
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setToDeleteSummary(s);
                                    setDeleteDialogOpen(true);
                                  }}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Delete
                                </Button>
                              </div>
                            </div>
                          </CardHeader>
                        </Card>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ————————————————
          EDIT DIALOG
         ———————————————— */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Appointment</DialogTitle>
            <DialogDescription>
              Modify details for UHID {uhidEditing}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(handleSaveEdit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Patient Name */}
              <div className="space-y-2">
                <Label htmlFor="edit-name">
                  Patient Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="edit-name"
                  {...register("name", { required: "Name is required" })}
                  placeholder="Enter patient name"
                />
                {errors.name && (
                  <p className="text-sm text-red-500">{errors.name.message}</p>
                )}
              </div>

              {/* Phone Number */}
              <div className="space-y-2">
                <Label htmlFor="edit-phone">
                  Phone Number <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="edit-phone"
                  {...register("phone", {
                    required: "Phone is required",
                    pattern: {
                      value: /^[0-9]{10}$/,
                      message: "Enter valid 10-digit phone",
                    },
                  })}
                  placeholder="Enter phone"
                />
                {errors.phone && (
                  <p className="text-sm text-red-500">{errors.phone.message}</p>
                )}
              </div>

              {/* Age */}
              <div className="space-y-2">
                <Label htmlFor="edit-age">
                  Age <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="edit-age"
                  type="number"
                  {...register("age", {
                    required: "Age is required",
                    min: { value: 1, message: "Age must be ≥ 1" },
                  })}
                  placeholder="Enter age"
                />
                {errors.age && (
                  <p className="text-sm text-red-500">{errors.age.message}</p>
                )}
              </div>

              {/* Gender */}
              <div className="space-y-2">
                <Label htmlFor="edit-gender">
                  Gender <span className="text-red-500">*</span>
                </Label>
                <Controller
                  control={control}
                  name="gender"
                  rules={{ required: "Gender is required" }}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                      <SelectContent>
                        {GenderOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.gender && (
                  <p className="text-sm text-red-500">{errors.gender.message}</p>
                )}
              </div>

              {/* Address */}
              <div className="space-y-2 col-span-2">
                <Label htmlFor="edit-address">Address</Label>
                <Textarea
                  id="edit-address"
                  {...register("address")}
                  placeholder="Enter address"
                  className="min-h-[80px]"
                />
              </div>

              {/* Date */}
              <div className="space-y-2">
                <Label htmlFor="edit-date">
                  Appointment Date <span className="text-red-500">*</span>
                </Label>
                <Controller
                  control={control}
                  name="date"
                  rules={{ required: "Date is required" }}
                  render={({ field }) => (
                    <DatePicker
                      selected={field.value}
                      onChange={(d: Date | null) => d && field.onChange(d)}
                      dateFormat="dd/MM/yyyy"
                      placeholderText="Select date"
                      className="w-full px-3 py-2 border rounded-md focus:ring-emerald-500"
                    />
                  )}
                />
                {errors.date && (
                  <p className="text-sm text-red-500">{errors.date.message}</p>
                )}
              </div>

              {/* Time */}
              <div className="space-y-2">
                <Label htmlFor="edit-time">
                  Appointment Time <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="edit-time"
                  {...register("time", { required: "Time is required" })}
                  placeholder="e.g. 10:30 AM"
                />
                {errors.time && (
                  <p className="text-sm text-red-500">{errors.time.message}</p>
                )}
              </div>

              {/* Service Name */}
              <div className="space-y-2">
                <Label htmlFor="edit-serviceName">
                  Service Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="edit-serviceName"
                  {...register("serviceName", {
                    required: "Service is required",
                  })}
                  placeholder="Enter service"
                />
                {errors.serviceName && (
                  <p className="text-sm text-red-500">
                    {errors.serviceName.message}
                  </p>
                )}
              </div>

              {/* Doctor */}
              <div className="space-y-2">
                <Label htmlFor="edit-doctor">
                  Doctor <span className="text-red-500">*</span>
                </Label>
                <Controller
                  control={control}
                  name="doctor"
                  rules={{ required: "Doctor is required" }}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select doctor" />
                      </SelectTrigger>
                      <SelectContent>
                        {doctors.map((doc) => (
                          <SelectItem key={doc.id} value={doc.id}>
                            {doc.name} {doc.specialty ? `(${doc.specialty})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.doctor && (
                  <p className="text-sm text-red-500">{errors.doctor.message}</p>
                )}
              </div>

              {/* Payment/Amount (only for hospital visits) */}
              {(() => {
                const summary = summaries.find(
                  (x) => x.uhid === uhidEditing && x.id === opdIdEditing
                );
                if (summary?.appointmentType === "visithospital") {
                  return (
                    <>
                      {/* Payment Method */}
                      <div className="space-y-2">
                        <Label htmlFor="edit-paymentMethod">
                          Payment Method <span className="text-red-500">*</span>
                        </Label>
                        <Controller
                          control={control}
                          name="paymentMethod"
                          rules={{ required: "Payment method is required" }}
                          render={({ field }) => (
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select payment" />
                              </SelectTrigger>
                              <SelectContent>
                                {PaymentOptions.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                        {errors.paymentMethod && (
                          <p className="text-sm text-red-500">
                            {errors.paymentMethod.message}
                          </p>
                        )}
                      </div>

                      {/* Amount */}
                      <div className="space-y-2">
                        <Label htmlFor="edit-amount">
                          Amount (₹) <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="edit-amount"
                          type="number"
                          {...register("amount", {
                            required: "Amount is required",
                            min: { value: 0, message: "Amount must be ≥ 0" },
                          })}
                          placeholder="Enter amount"
                        />
                        {errors.amount && (
                          <p className="text-sm text-red-500">
                            {errors.amount.message}
                          </p>
                        )}
                      </div>

                      {/* Discount */}
                      <div className="space-y-2">
                        <Label htmlFor="edit-discount">Discount (₹)</Label>
                        <Input
                          id="edit-discount"
                          type="number"
                          {...register("discount", {
                            min: { value: 0, message: "Discount must be ≥ 0" },
                            validate: (val) => {
                              const amt = watch("amount");
                              return val <= amt || "Discount cannot exceed amount";
                            },
                          })}
                          placeholder="Enter discount"
                        />
                        {errors.discount && (
                          <p className="text-sm text-red-500">
                            {errors.discount.message}
                          </p>
                        )}
                        {watch("discount") > 0 && (
                          <p className="text-sm text-emerald-600">
                            Final: ₹{watch("amount") - watch("discount")}
                          </p>
                        )}
                      </div>
                    </>
                  );
                } else {
                  return null;
                }
              })()}

              {/* Referred By */}
              <div className="space-y-2">
                <Label htmlFor="edit-referredBy">Referred By</Label>
                <Input
                  id="edit-referredBy"
                  {...register("referredBy")}
                  placeholder="Enter referrer name"
                />
              </div>

              {/* Message */}
              <div className="space-y-2 col-span-2">
                <Label htmlFor="edit-message">Additional Notes</Label>
                <Textarea
                  id="edit-message"
                  {...register("message")}
                  placeholder="Enter notes"
                  className="min-h-[100px]"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ————————————————
          DELETE CONFIRMATION DIALOG
         ———————————————— */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Appointment</AlertDialogTitle>
            <div className="text-sm text-gray-600 mt-1">
              Are you sure you want to delete the appointment for UHID{" "}
              {toDeleteSummary?.uhid}? This action is tracked and cannot be
              undone.
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setToDeleteSummary(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAppointment}
              className="bg-red-500 hover:bg-red-600"
              disabled={loading}
            >
              {loading ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
