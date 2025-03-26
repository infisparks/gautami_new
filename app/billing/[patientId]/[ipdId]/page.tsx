"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ref, onValue, update, push, remove } from "firebase/database";
import { db } from "@/lib/firebase";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useForm, SubmitHandler } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Plus,
  ArrowLeft,
  AlertTriangle,
  History,
  Trash,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { Dialog, Transition } from "@headlessui/react";
import InvoiceDownload from "./../../InvoiceDownload";

// ===== Interfaces =====
interface ServiceItem {
  serviceName: string;
  doctorName?: string;
  type: "service" | "doctorvisit";
  amount: number;
  createdAt?: string;
}

interface Payment {
  id?: string;
  amount: number;
  paymentType: string;
  date: string;
}

interface AdditionalServiceForm {
  serviceName: string;
  amount: number;
}

interface PaymentForm {
  paymentAmount: number;
  paymentType: string;
}

interface DiscountForm {
  discount: number;
}

interface DoctorVisitForm {
  doctorId: string;
  visitCharge: number;
}

export interface BillingRecord {
  patientId: string;
  ipdId: string;
  name: string;
  mobileNumber: string;
  address?: string;
  age?: string | number;
  gender?: string;
  relativeName?: string;
  relativePhone?: string;
  relativeAddress?: string;
  dischargeDate?: string;
  amount: number;
  paymentType: string;
  roomType?: string;
  bed?: string;
  services: ServiceItem[];
  payments: Payment[];
  discount?: number;
  // The two fields below allow us to track and display the patient's admit date.
  // We'll fill `admitDate` from the IPD data (ipd.date), falling back to ipd.createdAt.
  admitDate?: string;
  createdAt?: string; // Not strictly necessary, but included if you need it for fallback
}

// ===== Additional Validation Schemas =====
const additionalServiceSchema = yup
  .object({
    serviceName: yup.string().required("Service Name is required"),
    amount: yup
      .number()
      .typeError("Amount must be a number")
      .positive("Must be positive")
      .required("Amount is required"),
  })
  .required();

const paymentSchema = yup
  .object({
    paymentAmount: yup
      .number()
      .typeError("Amount must be a number")
      .positive("Must be positive")
      .required("Amount is required"),
    paymentType: yup.string().required("Payment Type is required"),
  })
  .required();

const discountSchema = yup
  .object({
    discount: yup
      .number()
      .typeError("Discount must be a number")
      .min(0, "Discount cannot be negative")
      .required("Discount is required"),
  })
  .required();

const doctorVisitSchema = yup
  .object({
    doctorId: yup.string().required("Select a doctor"),
    visitCharge: yup
      .number()
      .typeError("Visit charge must be a number")
      .positive("Must be positive")
      .required("Charge is required"),
  })
  .required();

// ===== Doctor Interface =====
interface IDoctor {
  id: string;
  name: string;
  specialist: string;
  department: "OPD" | "IPD" | "Both";
  opdCharge?: number;
  ipdCharges?: Record<string, number>;
}

export default function BillingPage() {
  const { patientId, ipdId } = useParams() as { patientId: string; ipdId: string };
  const router = useRouter();

  const [selectedRecord, setSelectedRecord] = useState<BillingRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPaymentHistoryOpen, setIsPaymentHistoryOpen] = useState(false);
  const [beds, setBeds] = useState<any>({});
  const [doctors, setDoctors] = useState<IDoctor[]>([]);

  // ===== Fetch Beds Data =====
  useEffect(() => {
    const bedsRef = ref(db, "beds");
    const unsubscribe = onValue(bedsRef, (snapshot) => {
      if (snapshot.exists()) {
        setBeds(snapshot.val());
      } else {
        setBeds({});
      }
    });
    return () => unsubscribe();
  }, []);

  // ===== Fetch Doctors List =====
  useEffect(() => {
    const docsRef = ref(db, "doctors");
    const unsubscribe = onValue(docsRef, (snapshot) => {
      if (!snapshot.exists()) {
        setDoctors([]);
        return;
      }
      const data = snapshot.val();
      const list: IDoctor[] = Object.keys(data).map((key) => ({
        id: key,
        name: data[key].name,
        specialist: data[key].specialist,
        department: data[key].department,
        opdCharge: data[key].opdCharge,
        ipdCharges: data[key].ipdCharges,
      }));
      setDoctors(list);
    });
    return () => unsubscribe();
  }, []);

  // ===== Load Selected Patient Record =====
  useEffect(() => {
    if (!patientId || !ipdId) return;
    const patientRef = ref(db, `patients/${patientId}`);
    const unsubscribe = onValue(patientRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const patientData = snapshot.val();
      if (!patientData.ipd || !patientData.ipd[ipdId]) return;
      const ipd = patientData.ipd[ipdId];

      const servicesArray: ServiceItem[] = ipd.services
        ? ipd.services.map((svc: any) => ({
            serviceName: svc.serviceName || "",
            doctorName: svc.doctorName || "",
            type: svc.type || "service",
            amount: Number(svc.amount) || 0,
            createdAt: svc.createdAt || "",
          }))
        : [];

      let paymentsArray: Payment[] = [];
      if (ipd.payments) {
        paymentsArray = Object.keys(ipd.payments).map((k) => ({
          id: k,
          amount: Number(ipd.payments[k].amount) || 0,
          paymentType: ipd.payments[k].paymentType || "cash",
          date: ipd.payments[k].date || new Date().toISOString(),
        }));
      }

      // IMPORTANT: We'll assign `admitDate` from ipd.date, else ipd.createdAt, else undefined
      const record: BillingRecord = {
        patientId,
        ipdId,
        name: patientData.name || "Unknown",
        mobileNumber: patientData.phone || "",
        address: patientData.address || "",
        age: patientData.age || "",
        gender: patientData.gender || "",
        relativeName: ipd.relativeName || "",
        relativePhone: ipd.relativePhone || "",
        relativeAddress: ipd.relativeAddress || "",
        amount: Number(ipd.amount || 0),
        paymentType: ipd.paymentType || "deposit",
        roomType: ipd.roomType || "",
        bed: ipd.bed || "",
        services: servicesArray,
        payments: paymentsArray,
        dischargeDate: ipd.dischargeDate,
        discount: ipd.discount ? Number(ipd.discount) : 0,
        // Assign the "admit date" from the IPD data (like ipd.date) or fallback to ipd.createdAt
        admitDate: ipd.date ? ipd.date : ipd.createdAt ? ipd.createdAt : undefined,
      };

      setSelectedRecord(record);
    });
    return () => unsubscribe();
  }, [patientId, ipdId]);

  // ===== React Hook Form setups =====

  // Additional Service Form
  const {
    register: registerService,
    handleSubmit: handleSubmitService,
    formState: { errors: errorsService },
    reset: resetService,
  } = useForm<AdditionalServiceForm>({
    resolver: yupResolver(additionalServiceSchema),
    defaultValues: { serviceName: "", amount: 0 },
  });

  // Payment Form
  const {
    register: registerPayment,
    handleSubmit: handleSubmitPayment,
    formState: { errors: errorsPayment },
    reset: resetPayment,
  } = useForm<PaymentForm>({
    resolver: yupResolver(paymentSchema),
    defaultValues: { paymentAmount: 0, paymentType: "" },
  });

  // Discount Form
  const {
    register: registerDiscount,
    handleSubmit: handleSubmitDiscount,
    formState: { errors: errorsDiscount },
    reset: resetDiscount,
  } = useForm<DiscountForm>({
    resolver: yupResolver(discountSchema),
    defaultValues: { discount: 0 },
  });

  // Consultant Charge Form
  const {
    register: registerVisit,
    handleSubmit: handleSubmitVisit,
    formState: { errors: errorsVisit },
    reset: resetVisit,
    watch: watchVisit,
    setValue: setVisitValue,
  } = useForm<DoctorVisitForm>({
    resolver: yupResolver(doctorVisitSchema),
    defaultValues: { doctorId: "", visitCharge: 0 },
  });

  // Auto-fill visit charge when a doctor is selected
  const watchSelectedDoctorId = watchVisit("doctorId");
  useEffect(() => {
    if (!watchSelectedDoctorId || !selectedRecord) return;
    const doc = doctors.find((d) => d.id === watchSelectedDoctorId);
    if (!doc) return;
    let amount = 0;
    if (doc.department === "OPD") {
      amount = doc.opdCharge ?? 0;
    } else if (doc.department === "IPD") {
      if (
        selectedRecord.roomType &&
        doc.ipdCharges &&
        doc.ipdCharges[selectedRecord.roomType]
      ) {
        amount = doc.ipdCharges[selectedRecord.roomType];
      }
    } else if (doc.department === "Both") {
      if (
        selectedRecord.roomType &&
        doc.ipdCharges &&
        doc.ipdCharges[selectedRecord.roomType]
      ) {
        amount = doc.ipdCharges[selectedRecord.roomType];
      }
      if (!amount && doc.opdCharge) {
        amount = doc.opdCharge;
      }
    }
    setVisitValue("visitCharge", amount);
  }, [watchSelectedDoctorId, selectedRecord, doctors, setVisitValue]);

  // ===== Calculations =====
  const hospitalServiceTotal = selectedRecord
    ? selectedRecord.services
        .filter((s) => s.type === "service")
        .reduce((sum, s) => sum + s.amount, 0)
    : 0;
  const consultantChargeItems = selectedRecord
    ? selectedRecord.services.filter((s) => s.type === "doctorvisit")
    : [];
  const consultantChargeTotal = consultantChargeItems.reduce(
    (sum, s) => sum + s.amount,
    0
  );
  const discountVal = selectedRecord?.discount || 0;
  const totalBill = hospitalServiceTotal + consultantChargeTotal - discountVal;

  // Calculate Due Amount (if deposit is less than total bill)
  const dueAmount = selectedRecord
    ? Math.max(totalBill - selectedRecord.amount, 0)
    : 0;

  // ===== Group Consultant Charges by Doctor =====
  const aggregatedConsultantCharges = consultantChargeItems.reduce(
    (acc, item) => {
      const key = item.doctorName || "Unknown";
      if (!acc[key]) {
        acc[key] = {
          doctorName: key,
          visited: 0,
          totalCharge: 0,
          lastVisit: null as Date | null,
          items: [] as ServiceItem[],
        };
      }
      acc[key].visited += 1;
      acc[key].totalCharge += item.amount;
      const itemDate = item.createdAt ? new Date(item.createdAt) : new Date(0);
      if (!acc[key].lastVisit || itemDate > acc[key].lastVisit) {
        acc[key].lastVisit = itemDate;
      }
      acc[key].items.push(item);
      return acc;
    },
    {} as Record<
      string,
      {
        doctorName: string;
        visited: number;
        totalCharge: number;
        lastVisit: Date | null;
        items: ServiceItem[];
      }
    >
  );
  const aggregatedConsultantChargesArray = Object.values(aggregatedConsultantCharges);

  // ===== Payment Notification Helper =====
  const sendPaymentNotification = async (
    patientMobile: string,
    patientName: string,
    paymentAmount: number,
    updatedDeposit: number
  ) => {
    const apiUrl = "https://wa.medblisss.com/send-text";
    const payload = {
      token: "99583991572",
      number: `91${patientMobile}`,
      message: `Dear ${patientName}, your payment of Rs ${paymentAmount.toLocaleString()} has been successfully added to your account. Your updated total deposit is Rs ${updatedDeposit.toLocaleString()}. Thank you for choosing our service.`,
    };

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        console.error("Notification API error:", response.statusText);
      }
    } catch (error) {
      console.error("Error sending notification:", error);
    }
  };

  // ===== Handlers =====

  // 1. Add Additional Service
  const onSubmitAdditionalService: SubmitHandler<AdditionalServiceForm> = async (data) => {
    if (!selectedRecord) return;
    setLoading(true);
    try {
      const oldServices = [...selectedRecord.services];
      const newItem: ServiceItem = {
        serviceName: data.serviceName,
        doctorName: "",
        type: "service",
        amount: Number(data.amount),
        createdAt: new Date().toLocaleString(),
      };
      const updatedServices = [newItem, ...oldServices];
      const sanitizedServices = updatedServices.map((svc) => ({
        serviceName: svc.serviceName || "",
        doctorName: svc.doctorName || "",
        type: svc.type || "service",
        amount: svc.amount || 0,
        createdAt: svc.createdAt || new Date().toLocaleString(),
      }));
      const recordRef = ref(
        db,
        `patients/${selectedRecord.patientId}/ipd/${selectedRecord.ipdId}`
      );
      await update(recordRef, { services: sanitizedServices });
      toast.success("Additional service added successfully!", {
        position: "top-right",
        autoClose: 5000,
      });
      const updatedRecord = { ...selectedRecord, services: sanitizedServices };
      setSelectedRecord(updatedRecord);
      resetService({ serviceName: "", amount: 0 });
    } catch (error) {
      console.error("Error adding service:", error);
      toast.error("Failed to add service. Please try again.", {
        position: "top-right",
        autoClose: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  // 2. Add Payment with Notification
  const onSubmitPayment: SubmitHandler<PaymentForm> = async (formData) => {
    if (!selectedRecord) return;
    setLoading(true);
    try {
      const newPaymentRef = push(
        ref(db, `patients/${selectedRecord.patientId}/ipd/${selectedRecord.ipdId}/payments`)
      );
      const newPayment: Payment = {
        amount: Number(formData.paymentAmount),
        paymentType: formData.paymentType,
        date: new Date().toISOString(),
      };
      await update(newPaymentRef, newPayment);
      const updatedPayments = [newPayment, ...selectedRecord.payments];
      const updatedDeposit = Number(selectedRecord.amount) + Number(formData.paymentAmount);
      const recordRef = ref(db, `patients/${selectedRecord.patientId}/ipd/${selectedRecord.ipdId}`);
      await update(recordRef, { amount: updatedDeposit });
      await sendPaymentNotification(
        selectedRecord.mobileNumber,
        selectedRecord.name,
        Number(formData.paymentAmount),
        updatedDeposit
      );
      toast.success("Payment recorded successfully!", { position: "top-right", autoClose: 5000 });
      const updatedRecord = { ...selectedRecord, payments: updatedPayments, amount: updatedDeposit };
      setSelectedRecord(updatedRecord);
      resetPayment({ paymentAmount: 0, paymentType: "" });
    } catch (error) {
      console.error("Error recording payment:", error);
      toast.error("Failed to record payment. Please try again.", { position: "top-right", autoClose: 5000 });
    } finally {
      setLoading(false);
    }
  };

  // 3. Discharge Patient
  const handleDischarge = async () => {
    if (!selectedRecord) return;
    if (!selectedRecord.roomType || !selectedRecord.bed) {
      toast.error("Bed or Room Type information missing. Cannot discharge.", {
        position: "top-right",
        autoClose: 5000,
      });
      return;
    }
    setLoading(true);
    try {
      const dischargeDate = new Date().toISOString();
      const recordRef = ref(db, `patients/${selectedRecord.patientId}/ipd/${selectedRecord.ipdId}`);
      await update(recordRef, { dischargeDate });
      const bedRef = ref(db, `beds/${selectedRecord.roomType}/${selectedRecord.bed}`);
      await update(bedRef, { status: "Available" });
      toast.success("Patient discharged and bed made available!", { position: "top-right", autoClose: 5000 });
      const updatedRecord = { ...selectedRecord, dischargeDate };
      setSelectedRecord(updatedRecord);
    } catch (error) {
      console.error("Error discharging patient:", error);
      toast.error("Failed to discharge patient. Please try again.", { position: "top-right", autoClose: 5000 });
    } finally {
      setLoading(false);
    }
  };

  // 4. Apply Discount
  const onSubmitDiscount: SubmitHandler<DiscountForm> = async (formData) => {
    if (!selectedRecord) return;
    setLoading(true);
    try {
      const discountVal = Number(formData.discount);
      const recordRef = ref(db, `patients/${selectedRecord.patientId}/ipd/${selectedRecord.ipdId}`);
      await update(recordRef, { discount: discountVal });
      toast.success("Discount applied successfully!", { position: "top-right", autoClose: 5000 });
      const updatedRecord = { ...selectedRecord, discount: discountVal };
      setSelectedRecord(updatedRecord);
      resetDiscount({ discount: discountVal });
    } catch (error) {
      console.error("Error applying discount:", error);
      toast.error("Failed to apply discount. Please try again.", { position: "top-right", autoClose: 5000 });
    } finally {
      setLoading(false);
    }
  };

  // 5. Add Consultant Charge
  const onSubmitDoctorVisit: SubmitHandler<DoctorVisitForm> = async (data) => {
    if (!selectedRecord) return;
    setLoading(true);
    try {
      const doc = doctors.find((d) => d.id === data.doctorId);
      if (!doc) {
        toast.error("Invalid doctor selection.", { autoClose: 5000 });
        setLoading(false);
        return;
      }
      const oldServices = [...selectedRecord.services];
      const newItem: ServiceItem = {
        serviceName: `Consultant Charge: Dr. ${doc.name || "Unknown"}`,
        doctorName: doc.name || "Unknown",
        type: "doctorvisit",
        amount: Number(data.visitCharge) || 0,
        createdAt: new Date().toLocaleString(),
      };
      const updatedServices = [newItem, ...oldServices];
      // Notice this line: "type" fallback changed from "service" -> "doctorvisit" in the map
      const sanitizedServices = updatedServices.map((svc) => ({
        serviceName: svc.serviceName || "",
        doctorName: svc.doctorName || "",
        type: svc.type || "doctorvisit",
        amount: svc.amount || 0,
        createdAt: svc.createdAt || new Date().toLocaleString(),
      }));
      const recordRef = ref(db, `patients/${selectedRecord.patientId}/ipd/${selectedRecord.ipdId}`);
      await update(recordRef, { services: sanitizedServices });
      toast.success("Consultant charge added successfully!", { position: "top-right", autoClose: 5000 });
      const updatedRecord = { ...selectedRecord, services: sanitizedServices };
      setSelectedRecord(updatedRecord);
      resetVisit({ doctorId: "", visitCharge: 0 });
    } catch (error) {
      console.error("Error adding consultant charge:", error);
      toast.error("Failed to add consultant charge. Please try again.", { position: "top-right", autoClose: 5000 });
    } finally {
      setLoading(false);
    }
  };

  // ===== Delete Handlers =====

  // Delete a service item (for hospital services)
  const handleDeleteServiceItem = async (item: ServiceItem) => {
    if (!selectedRecord) return;
    setLoading(true);
    try {
      const updatedServices = selectedRecord.services.filter((svc) => svc !== item);
      const recordRef = ref(db, `patients/${selectedRecord.patientId}/ipd/${selectedRecord.ipdId}`);
      await update(recordRef, { services: updatedServices });
      toast.success("Service deleted successfully!", { position: "top-right", autoClose: 5000 });
      const updatedRecord = { ...selectedRecord, services: updatedServices };
      setSelectedRecord(updatedRecord);
    } catch (error) {
      console.error("Error deleting service:", error);
      toast.error("Failed to delete service. Please try again.", { position: "top-right", autoClose: 5000 });
    } finally {
      setLoading(false);
    }
  };

  // Delete a payment
  const handleDeletePayment = async (paymentId: string, paymentAmount: number) => {
    if (!selectedRecord) return;
    setLoading(true);
    try {
      const paymentRef = ref(db, `patients/${selectedRecord.patientId}/ipd/${selectedRecord.ipdId}/payments/${paymentId}`);
      await remove(paymentRef);
      const updatedDeposit = selectedRecord.amount - paymentAmount;
      const recordRef = ref(db, `patients/${selectedRecord.patientId}/ipd/${selectedRecord.ipdId}`);
      await update(recordRef, { amount: updatedDeposit });
      const updatedPayments = selectedRecord.payments.filter((p) => p.id !== paymentId);
      toast.success("Payment deleted successfully!", { position: "top-right", autoClose: 5000 });
      const updatedRecord = { ...selectedRecord, payments: updatedPayments, amount: updatedDeposit };
      setSelectedRecord(updatedRecord);
    } catch (error) {
      console.error("Error deleting payment:", error);
      toast.error("Failed to delete payment. Please try again.", { position: "top-right", autoClose: 5000 });
    } finally {
      setLoading(false);
    }
  };

  // Delete consultant charges for a specific doctor (aggregated deletion)
  const handleDeleteConsultantCharges = async (doctorName: string) => {
    if (!selectedRecord) return;
    setLoading(true);
    try {
      const updatedServices = selectedRecord.services.filter(
        (svc) => svc.type !== "doctorvisit" || svc.doctorName !== doctorName
      );
      const recordRef = ref(db, `patients/${selectedRecord.patientId}/ipd/${selectedRecord.ipdId}`);
      await update(recordRef, { services: updatedServices });
      toast.success(`Consultant charges for Dr. ${doctorName} deleted successfully!`, {
        position: "top-right",
        autoClose: 5000,
      });
      const updatedRecord = { ...selectedRecord, services: updatedServices };
      setSelectedRecord(updatedRecord);
    } catch (error) {
      console.error("Error deleting consultant charges:", error);
      toast.error("Failed to delete consultant charges. Please try again.", { position: "top-right", autoClose: 5000 });
    } finally {
      setLoading(false);
    }
  };

  // ===== Separate Service Items =====
  const serviceItems = selectedRecord?.services.filter((s) => s.type === "service") || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <ToastContainer />
      <div className="max-w-7xl mx-auto bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-8">
          {/* Back Button */}
          <button
            onClick={() => router.back()}
            className="mb-6 flex items-center text-indigo-600 hover:text-indigo-800 transition duration-300"
          >
            <ArrowLeft size={20} className="mr-2" /> Back to Patients
          </button>

          {selectedRecord ? (
            <AnimatePresence mode="wait">
              <motion.div
                key="billing-details"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="bg-indigo-50 rounded-xl p-6 mb-8">
                  <h2 className="text-2xl font-semibold text-indigo-800 mb-4">
                    Billing Details for {selectedRecord.name}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="bg-indigo-100 p-4 rounded-lg">
                        <p>
                          <strong>Hospital Services Total:</strong> Rs.{" "}
                          {hospitalServiceTotal.toLocaleString()}
                        </p>
                        <p>
                          <strong>Consultant Charges Total:</strong> Rs.{" "}
                          {consultantChargeTotal.toLocaleString()}
                        </p>
                        {discountVal > 0 && (
                          <p>
                            <strong>Discount:</strong> Rs. {discountVal.toLocaleString()}
                          </p>
                        )}
                        <p>
                          <strong>Total Bill:</strong> Rs. {totalBill.toLocaleString()}
                        </p>
                        <p>
                          <strong>Deposit Amount:</strong> Rs.{" "}
                          {selectedRecord.amount.toLocaleString()}
                        </p>
                        {dueAmount > 0 && (
                          <p className="text-red-600">
                            <strong>Due Amount:</strong> Rs. {dueAmount.toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div className="bg-indigo-50 p-4 rounded-lg">
                        <h3 className="text-xl font-semibold text-indigo-800 mb-2">
                          Admission Details
                        </h3>
                        <p>
                          <strong>Room Type:</strong> {selectedRecord.roomType}
                        </p>
                        <p>
                          <strong>Bed:</strong>{" "}
                          {selectedRecord.roomType &&
                          selectedRecord.bed &&
                          beds[selectedRecord.roomType] &&
                          beds[selectedRecord.roomType][selectedRecord.bed]
                            ? beds[selectedRecord.roomType][selectedRecord.bed].bedNumber
                            : "N/A"}
                        </p>
                        {/* ADDED: Show the IPD's "Admit Date" if present */}
                        <p>
                          <strong>Admit Date:</strong>{" "}
                          {selectedRecord.admitDate
                            ? format(parseISO(selectedRecord.admitDate), "dd MMM yyyy, p")
                            : "N/A"}
                        </p>
                        <p>
                          <strong>Discharge Date:</strong>{" "}
                          {selectedRecord.dischargeDate
                            ? format(parseISO(selectedRecord.dischargeDate), "dd MMM yyyy")
                            : "Not discharged"}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="bg-indigo-50 p-4 rounded-lg">
                        <h3 className="text-xl font-semibold text-indigo-800 mb-2">
                          Patient Details
                        </h3>
                        <p>
                          <strong>Name:</strong> {selectedRecord.name}
                        </p>
                        <p>
                          <strong>Mobile:</strong> {selectedRecord.mobileNumber}
                        </p>
                        <p>
                          <strong>Address:</strong> {selectedRecord.address}
                        </p>
                        <p>
                          <strong>Age:</strong> {selectedRecord.age}
                        </p>
                        <p>
                          <strong>Gender:</strong> {selectedRecord.gender}
                        </p>
                      </div>
                      <div className="bg-indigo-50 p-4 rounded-lg">
                        <h3 className="text-xl font-semibold text-indigo-800 mb-2">
                          Relative Details
                        </h3>
                        <p>
                          <strong>Relative Name:</strong> {selectedRecord.relativeName}
                        </p>
                        <p>
                          <strong>Relative Phone:</strong> {selectedRecord.relativePhone}
                        </p>
                        <p>
                          <strong>Relative Address:</strong> {selectedRecord.relativeAddress}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payment History Button */}
                <div className="flex items-center justify-end mb-4">
                  <button
                    onClick={() => setIsPaymentHistoryOpen(true)}
                    className="flex items-center bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full px-4 py-2 transition duration-300"
                  >
                    <History size={20} className="mr-2" /> View Payment History
                  </button>
                </div>

                {/* Payment Form */}
                {!selectedRecord.dischargeDate && (
                  <div className="bg-white rounded-xl shadow-md p-6 mb-8">
                    <h3 className="text-xl font-semibold text-indigo-800 mb-4">
                      Record Additional Payment
                    </h3>
                    <form onSubmit={handleSubmitPayment(onSubmitPayment)} className="space-y-4">
                      <div>
                        <label className="block text-gray-700 mb-2">
                          Payment Amount (Rs)
                        </label>
                        <input
                          type="number"
                          {...registerPayment("paymentAmount")}
                          placeholder="e.g., 500"
                          className={`w-full px-4 py-2 rounded-lg border ${
                            errorsPayment.paymentAmount ? "border-red-500" : "border-gray-300"
                          } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                        />
                        {errorsPayment.paymentAmount && (
                          <p className="text-red-500 text-sm mt-1">
                            {errorsPayment.paymentAmount.message}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-gray-700 mb-2">
                          Payment Type
                        </label>
                        <select
                          {...registerPayment("paymentType")}
                          className={`w-full px-4 py-2 rounded-lg border ${
                            errorsPayment.paymentType ? "border-red-500" : "border-gray-300"
                          } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                        >
                          <option value="">Select Payment Type</option>
                          <option value="cash">Cash</option>
                          <option value="online">Online</option>
                          <option value="card">Card</option>
                        </select>
                        {errorsPayment.paymentType && (
                          <p className="text-red-500 text-sm mt-1">
                            {errorsPayment.paymentType.message}
                          </p>
                        )}
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className={`w-full py-2 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition duration-300 flex items-center justify-center ${
                          loading ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                      >
                        {loading ? "Processing..." : (
                          <>
                            <Plus size={20} className="mr-2" /> Add Payment
                          </>
                        )}
                      </button>
                    </form>
                  </div>
                )}

                {/* Discount Form */}
                {!selectedRecord.dischargeDate && (
                  <div className="bg-white rounded-xl shadow-md p-6 mb-8">
                    <h3 className="text-xl font-semibold text-indigo-800 mb-4">
                      Apply Discount (Rs)
                    </h3>
                    <form onSubmit={handleSubmitDiscount(onSubmitDiscount)} className="space-y-4">
                      <div>
                        <label className="block text-gray-700 mb-2">
                          Discount (Rs)
                        </label>
                        <input
                          type="number"
                          {...registerDiscount("discount")}
                          placeholder="e.g., 1000"
                          className={`w-full px-4 py-2 rounded-lg border ${
                            errorsDiscount.discount ? "border-red-500" : "border-gray-300"
                          } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                        />
                        {errorsDiscount.discount && (
                          <p className="text-red-500 text-sm mt-1">
                            {errorsDiscount.discount.message}
                          </p>
                        )}
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className={`w-full py-2 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition duration-300 flex items-center justify-center ${
                          loading ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                      >
                        {loading ? "Processing..." : (
                          <>
                            <Plus size={20} className="mr-2" /> Apply Discount
                          </>
                        )}
                      </button>
                    </form>
                  </div>
                )}

                {/* Aggregated Consultant Charges Table */}
                <div className="bg-white rounded-xl shadow-md p-6 mb-8">
                  <h3 className="text-xl font-semibold text-indigo-800 mb-4">
                    Consultant Charges
                  </h3>
                  {consultantChargeItems.length === 0 ? (
                    <p className="text-gray-500">No consultant charges yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-indigo-50">
                            <th className="px-4 py-2 text-left">Doctor</th>
                            <th className="px-4 py-2 text-left">Visited</th>
                            <th className="px-4 py-2 text-left">Total Charge (Rs)</th>
                            <th className="px-4 py-2 text-left">Last Visit</th>
                            <th className="px-4 py-2 text-left">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aggregatedConsultantChargesArray.map((agg, idx) => (
                            <tr key={idx} className="border-t">
                              <td className="px-4 py-2">{agg.doctorName}</td>
                              <td className="px-4 py-2">{agg.visited}</td>
                              <td className="px-4 py-2">{agg.totalCharge.toLocaleString()}</td>
                              <td className="px-4 py-2">
                                {agg.lastVisit ? agg.lastVisit.toLocaleString() : "N/A"}
                              </td>
                              <td className="px-4 py-2">
                                <button
                                  onClick={() => handleDeleteConsultantCharges(agg.doctorName)}
                                  className="text-red-600 hover:text-red-800"
                                >
                                  <Trash size={18} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Hospital Services Table */}
                <div className="bg-white rounded-xl shadow-md p-6 mb-8">
                  <h3 className="text-xl font-semibold text-indigo-800 mb-4">
                    Hospital Services
                  </h3>
                  {serviceItems.length === 0 ? (
                    <p className="text-gray-500">No additional services yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-indigo-50">
                            <th className="px-4 py-2 text-left">Service Name</th>
                            <th className="px-4 py-2 text-left">Amount (Rs)</th>
                            <th className="px-4 py-2 text-left">Date/Time</th>
                            <th className="px-4 py-2 text-left">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {serviceItems.map((srv, index) => (
                            <tr key={index} className="border-t">
                              <td className="px-4 py-2">{srv.serviceName}</td>
                              <td className="px-4 py-2">{srv.amount.toLocaleString()}</td>
                              <td className="px-4 py-2">
                                {srv.createdAt ? new Date(srv.createdAt).toLocaleString() : "N/A"}
                              </td>
                              <td className="px-4 py-2">
                                <button
                                  onClick={() => handleDeleteServiceItem(srv)}
                                  className="text-red-600 hover:text-red-800"
                                >
                                  <Trash size={18} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Add Hospital Service Form */}
                {!selectedRecord.dischargeDate && (
                  <div className="bg-white rounded-xl shadow-md p-6 mb-8">
                    <h3 className="text-xl font-semibold text-indigo-800 mb-4">
                      Add Hospital Service
                    </h3>
                    <form onSubmit={handleSubmitService(onSubmitAdditionalService)} className="space-y-4">
                      <div>
                        <label className="block text-gray-700 mb-2">
                          Service Name
                        </label>
                        <input
                          type="text"
                          {...registerService("serviceName")}
                          placeholder="e.g., X-Ray, Lab Test"
                          className={`w-full px-4 py-2 rounded-lg border ${
                            errorsService.serviceName ? "border-red-500" : "border-gray-300"
                          } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                        />
                        {errorsService.serviceName && (
                          <p className="text-red-500 text-sm mt-1">
                            {errorsService.serviceName.message}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-gray-700 mb-2">
                          Amount (Rs)
                        </label>
                        <input
                          type="number"
                          {...registerService("amount")}
                          placeholder="e.g., 1000"
                          className={`w-full px-4 py-2 rounded-lg border ${
                            errorsService.amount ? "border-red-500" : "border-gray-300"
                          } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                        />
                        {errorsService.amount && (
                          <p className="text-red-500 text-sm mt-1">
                            {errorsService.amount.message}
                          </p>
                        )}
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className={`w-full py-2 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition duration-300 flex items-center justify-center ${
                          loading ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                      >
                        {loading ? "Processing..." : (
                          <>
                            <Plus size={20} className="mr-2" /> Add Service
                          </>
                        )}
                      </button>
                    </form>
                  </div>
                )}

                {/* Add Consultant Charge Form */}
                {!selectedRecord.dischargeDate && (
                  <div className="bg-white rounded-xl shadow-md p-6 mb-8">
                    <h3 className="text-xl font-semibold text-indigo-800 mb-4">
                      Add Consultant Charge
                    </h3>
                    <form onSubmit={handleSubmitVisit(onSubmitDoctorVisit)} className="space-y-4">
                      <div>
                        <label className="block text-gray-700 mb-2">
                          Select Doctor
                        </label>
                        <select
                          {...registerVisit("doctorId")}
                          className={`w-full px-4 py-2 rounded-lg border ${
                            errorsVisit.doctorId ? "border-red-500" : "border-gray-300"
                          } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                        >
                          <option value="">-- Select Doctor --</option>
                          {doctors
                            .filter((d) => d.department === "OPD" || d.department === "Both")
                            .map((doc) => (
                              <option key={doc.id} value={doc.id}>
                                {doc.name} ({doc.specialist})
                              </option>
                            ))}
                        </select>
                        {errorsVisit.doctorId && (
                          <p className="text-red-500 text-sm mt-1">
                            {errorsVisit.doctorId.message}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-gray-700 mb-2">
                          Visit Charge (Rs)
                        </label>
                        <input
                          type="number"
                          {...registerVisit("visitCharge")}
                          placeholder="Auto-filled or override"
                          className={`w-full px-4 py-2 rounded-lg border ${
                            errorsVisit.visitCharge ? "border-red-500" : "border-gray-300"
                          } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                        />
                        {errorsVisit.visitCharge && (
                          <p className="text-red-500 text-sm mt-1">
                            {errorsVisit.visitCharge.message}
                          </p>
                        )}
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className={`w-full py-2 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition duration-300 flex items-center justify-center ${
                          loading ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                      >
                        {loading ? "Processing..." : (
                          <>
                            <Plus size={20} className="mr-2" /> Add Consultant Charge
                          </>
                        )}
                      </button>
                    </form>
                  </div>
                )}

                {/* Discharge Button */}
                {!selectedRecord.dischargeDate && (
                  <div className="flex justify-center mb-8">
                    <button
                      onClick={handleDischarge}
                      disabled={loading}
                      className={`px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition duration-300 flex items-center ${
                        loading ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                    >
                      {loading ? "Processing..." : (
                        <>
                          <AlertTriangle size={20} className="mr-2" /> Discharge Patient
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Invoice Download Component */}
                <div className="flex justify-center mb-8">
                  <InvoiceDownload record={selectedRecord} />
                </div>
              </motion.div>
            </AnimatePresence>
          ) : (
            <p className="text-center text-gray-500">Loading record...</p>
          )}
        </div>
      </div>

      {/* Payment History Modal */}
      <Transition appear show={isPaymentHistoryOpen} as={React.Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => setIsPaymentHistoryOpen(false)}
        >
          <Transition.Child
            as={React.Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-40" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto flex items-center justify-center p-4">
            <Transition.Child
              as={React.Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="bg-white rounded-xl shadow-lg p-6 max-w-lg w-full">
                <Dialog.Title className="text-xl font-bold mb-4 text-gray-800">
                  Payment History
                </Dialog.Title>
                {selectedRecord && selectedRecord.payments.length > 0 ? (
                  <div className="overflow-x-auto max-h-60">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-4 py-2 text-left">#</th>
                          <th className="px-4 py-2 text-left">Amount (Rs)</th>
                          <th className="px-4 py-2 text-left">Payment Type</th>
                          <th className="px-4 py-2 text-left">Date</th>
                          <th className="px-4 py-2 text-left">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRecord.payments.map((payment, index) => (
                          <tr key={index} className="border-t">
                            <td className="px-4 py-2">{index + 1}</td>
                            <td className="px-4 py-2">
                              Rs. {payment.amount.toLocaleString()}
                            </td>
                            <td className="px-4 py-2 capitalize">
                              {payment.paymentType}
                            </td>
                            <td className="px-4 py-2">
                              {new Date(payment.date).toLocaleString()}
                            </td>
                            <td className="px-4 py-2">
                              <button
                                onClick={() =>
                                  payment.id &&
                                  handleDeletePayment(payment.id, payment.amount)
                                }
                                className="text-red-600 hover:text-red-800"
                              >
                                <Trash size={18} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500">No payments recorded yet.</p>
                )}
                <div className="mt-4 text-right">
                  <button
                    onClick={() => setIsPaymentHistoryOpen(false)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition duration-300"
                  >
                    Close
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}
