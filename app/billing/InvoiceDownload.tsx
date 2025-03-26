"use client";

import React, { useRef } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { Download } from "lucide-react";
import letterhead from "@/public/letterhead.png";

import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";

/** ========== Data model interfaces ========== **/
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

interface BillingRecord {
  patientId: string;
  ipdId: string;
  name: string;
  mobileNumber: string;
  dischargeDate?: string;
  amount: number;
  roomType?: string;
  bed?: string;
  // The key for displaying "Admit Date":
  admitDate?: string;   // <--- We'll read this
  createdAt?: string;   // fallback if needed
  services: ServiceItem[];
  payments: Payment[];
  discount?: number;
}

/** ========== Component Props ========== **/
type InvoiceDownloadProps = {
  record: BillingRecord;
};

/**
 * InvoiceDownload
 *
 * Generates and downloads (or sends via WhatsApp) an invoice PDF
 * using a hidden off-screen layout.
 */
export default function InvoiceDownload({ record }: InvoiceDownloadProps) {
  const invoiceRef = useRef<HTMLDivElement>(null);

  // Helper function to format ISO date strings into a readable format.
  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
    };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  // Capture the bill date when rendering the invoice
  const billDate = new Date().toISOString();

  /**
   * generatePDF
   *
   * Renders the hidden invoice content into a PDF.
   */
  const generatePDF = async (): Promise<jsPDF> => {
    if (!invoiceRef.current) throw new Error("Invoice element not found.");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const canvas = await html2canvas(invoiceRef.current, {
      scale: 3,
      useCORS: true,
      backgroundColor: null,
    });

    const pdf = new jsPDF({
      orientation: "p",
      unit: "pt",
      format: "a4",
    });

    const pdfWidth = 595;
    const pdfHeight = 842;
    const topMargin = 120;
    const bottomMargin = 80;
    const sideMargin = 20;
    const contentHeight = pdfHeight - topMargin - bottomMargin;
    const scaleRatio = pdfWidth / canvas.width;
    const fullContentHeightPts = canvas.height * scaleRatio;

    let currentPos = 0;
    let pageCount = 0;
    while (currentPos < fullContentHeightPts) {
      pageCount += 1;
      if (pageCount > 1) pdf.addPage();
      pdf.addImage(
        letterhead.src,
        "PNG",
        0,
        0,
        pdfWidth,
        pdfHeight,
        "",
        "FAST"
      );
      const sourceY = Math.floor(currentPos / scaleRatio);
      const sourceHeight = Math.floor(contentHeight / scaleRatio);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sourceHeight;
      const pageCtx = pageCanvas.getContext("2d");
      if (pageCtx) {
        pageCtx.drawImage(
          canvas,
          0,
          sourceY,
          canvas.width,
          sourceHeight,
          0,
          0,
          canvas.width,
          sourceHeight
        );
      }
      const chunkImgData = pageCanvas.toDataURL("image/png");
      const chunkHeightPts = sourceHeight * scaleRatio;
      pdf.addImage(
        chunkImgData,
        "PNG",
        sideMargin,
        topMargin,
        pdfWidth - 2 * sideMargin,
        chunkHeightPts,
        "",
        "FAST"
      );
      currentPos += contentHeight;
    }
    return pdf;
  };

  // Download as PDF
  const handleDownloadInvoice = async () => {
    try {
      const pdf = await generatePDF();
      const fileName = record.dischargeDate
        ? `Final_Invoice_${record.name}_${record.ipdId}.pdf`
        : `Provisional_Invoice_${record.name}_${record.ipdId}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error(error);
      alert("Failed to generate the invoice PDF.");
    }
  };

  // Send PDF on WhatsApp
  const handleSendPdfOnWhatsapp = async () => {
    try {
      const pdf = await generatePDF();
      const pdfBlob = pdf.output("blob");
      if (!pdfBlob) throw new Error("Failed to generate PDF blob.");
      const storage = getStorage();
      const storagePath = `invoices/invoice-${record.ipdId}-${Date.now()}.pdf`;
      const fileRef = storageRef(storage, storagePath);
      await uploadBytes(fileRef, pdfBlob);
      const downloadUrl = await getDownloadURL(fileRef);
      const formattedNumber = record.mobileNumber.startsWith("91")
        ? record.mobileNumber
        : `91${record.mobileNumber}`;
      const payload = {
        token: "99583991572",
        number: formattedNumber,
        imageUrl: downloadUrl,
        caption:
          "Dear Patient, please find attached your invoice PDF for your recent visit. Thank you for choosing our services.",
      };
      const response = await fetch(
        "https://wa.medblisss.com/send-image-url",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        throw new Error("Failed to send the invoice on WhatsApp.");
      }
      alert("Invoice PDF sent successfully on WhatsApp!");
    } catch (error) {
      console.error(error);
      alert("An error occurred while sending the invoice PDF on WhatsApp.");
    }
  };

  /** ========== Data & Layout Logic ========== **/

  // Group Hospital Services
  const groupedHospitalServices = Object.values(
    record.services
      .filter((s) => s.type === "service")
      .reduce((acc, service) => {
        const key = service.serviceName;
        if (!acc[key]) {
          acc[key] = {
            serviceName: service.serviceName,
            quantity: 1,
            unitAmount: service.amount,
            totalAmount: service.amount,
          };
        } else {
          acc[key].quantity += 1;
          acc[key].totalAmount = acc[key].unitAmount * acc[key].quantity;
        }
        return acc;
      }, {} as {
        [key: string]: {
          serviceName: string;
          quantity: number;
          unitAmount: number;
          totalAmount: number;
        };
      })
  );

  // Group Consultant Charges by Doctor Name
  const groupedConsultantServices = Object.values(
    record.services
      .filter((s) => s.type === "doctorvisit")
      .reduce((acc, service) => {
        const key = service.doctorName || "NoName";
        if (!acc[key]) {
          acc[key] = {
            doctorName: service.doctorName || "",
            quantity: 1,
            unitAmount: service.amount,
            totalAmount: service.amount,
          };
        } else {
          acc[key].quantity += 1;
          acc[key].totalAmount = acc[key].unitAmount * acc[key].quantity;
        }
        return acc;
      }, {} as {
        [key: string]: {
          doctorName: string;
          quantity: number;
          unitAmount: number;
          totalAmount: number;
        };
      })
  );

  // Totals Calculation
  const hospitalServiceTotal = record.services
    .filter((s) => s.type === "service")
    .reduce((sum, s) => sum + s.amount, 0);

  const consultantChargeTotal = record.services
    .filter((s) => s.type === "doctorvisit")
    .reduce((sum, s) => sum + s.amount, 0);

  const discount = record.discount || 0;
  const subtotal = hospitalServiceTotal + consultantChargeTotal;
  const netTotal = subtotal - discount;
  const deposit = record.amount;
  const dueAmount = netTotal > deposit ? netTotal - deposit : 0;

  /** ========== Render ========== **/
  return (
    <div className="flex flex-col items-center">
      <button
        onClick={handleSendPdfOnWhatsapp}
        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition duration-300 flex items-center mb-4 text-xs"
      >
        Send Invoice PDF on WhatsApp
      </button>

      <button
        onClick={handleDownloadInvoice}
        className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition duration-300 flex items-center mb-4 text-xs"
      >
        <Download size={16} className="mr-1" />
        {record.dischargeDate
          ? "Download Final Invoice"
          : "Download Provisional Invoice"}
      </button>

      <div
        ref={invoiceRef}
        style={{
          position: "absolute",
          left: "-9999px",
          top: 0,
          width: "595px",
          backgroundColor: "transparent",
        }}
      >
        <div className="text-xs text-gray-800 p-4 bg-transparent">
          {/* Invoice Header: Patient Details & Dates */}
          <div className="flex justify-between mb-2">
            <div>
              <p>
                <strong>Patient Name:</strong> {record.name}
              </p>
              <p>
                <strong>Mobile No.:</strong> {record.mobileNumber}
              </p>
              <p>
                <strong>IPD ID:</strong> {record.ipdId}
              </p>
            </div>
            <div className="text-right">
              <p>
                <strong>Admit Date:</strong>{" "}
                {record.admitDate
                  ? formatDate(record.admitDate)
                  : record.createdAt
                  ? formatDate(record.createdAt)
                  : "N/A"}
              </p>
              {record.dischargeDate && (
                <p>
                  <strong>Discharge Date:</strong>{" "}
                  {formatDate(record.dischargeDate)}
                </p>
              )}
              <p>
                <strong>Bill Date:</strong> {formatDate(billDate)}
              </p>
            </div>
          </div>

          {/* Consultant Charges Table */}
          <div className="my-4">
            <h3 className="font-semibold mb-2 text-xs">
              Consultant Charges
            </h3>
            <table className="w-full text-[8px]">
              <thead>
                <tr className="bg-green-100">
                  <th className="p-1 text-left">Doctor Name</th>
                  <th className="p-1 text-center">Visited</th>
                  <th className="p-1 text-right">Unit (Rs)</th>
                  <th className="p-1 text-right">Total (Rs)</th>
                </tr>
              </thead>
              <tbody>
                {groupedConsultantServices.map((item, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-1">{item.doctorName}</td>
                    <td className="p-1 text-center">{item.quantity}</td>
                    <td className="p-1 text-right">
                      {item.unitAmount.toLocaleString()}
                    </td>
                    <td className="p-1 text-right">
                      {item.totalAmount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-1 text-right font-semibold text-xs">
              Consultant Charges Total: Rs.{" "}
              {consultantChargeTotal.toLocaleString()}
            </div>
          </div>

          {/* Hospital Service Charges Table */}
          <div className="my-2">
            <h3 className="font-semibold mb-2 text-xs">
              Hospital Service Charges
            </h3>
            <table className="w-full text-[8px]">
              <thead>
                <tr className="bg-green-100">
                  <th className="p-1 text-left">Service</th>
                  <th className="p-1 text-center">Qnty</th>
                  <th className="p-1 text-right">Unit (Rs)</th>
                  <th className="p-1 text-right">Total (Rs)</th>
                </tr>
              </thead>
              <tbody>
                {groupedHospitalServices.map((item, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-1">{item.serviceName}</td>
                    <td className="p-1 text-center">{item.quantity}</td>
                    <td className="p-1 text-right">
                      {item.unitAmount.toLocaleString()}
                    </td>
                    <td className="p-1 text-right">
                      {item.totalAmount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-1 text-right font-semibold text-xs">
              Hospital Services Total: Rs.{" "}
              {hospitalServiceTotal.toLocaleString()}
            </div>
          </div>

          {/* Final Summary Section */}
          <div className="mt-4 p-2 bg-gray-100 rounded text-[9px]">
            <p className="flex justify-between">
              <span>Subtotal:</span>
              <span>Rs. {subtotal.toLocaleString()}</span>
            </p>
            {discount > 0 && (
              <p className="flex justify-between text-green-600 font-bold">
                <span>Discount:</span>
                <span>- Rs. {discount.toLocaleString()}</span>
              </p>
            )}
            <hr className="my-1" />
            <p className="flex justify-between font-bold">
              <span>Net Total:</span>
              <span>Rs. {netTotal.toLocaleString()}</span>
            </p>
            <p className="flex justify-between">
              <span>Deposit Amount:</span>
              <span>Rs. {deposit.toLocaleString()}</span>
            </p>
            <p className="flex justify-between text-red-600 font-bold">
              <span>Due Amount:</span>
              <span>Rs. {dueAmount.toLocaleString()}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
