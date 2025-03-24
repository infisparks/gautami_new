"use client";

import React, { useRef } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { Download } from "lucide-react";
// Replace with your actual image import:
import letterhead from "@/public/letterhead.png";

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
  createdAt?: string; // Registration Date/Time
  services: ServiceItem[];
  payments: Payment[];
  discount?: number; // discount in Rs
}

/** ========== Component Props ========== **/
type InvoiceDownloadProps = {
  record: BillingRecord;
};

/**
 * InvoiceDownload
 * 
 * Renders a "Download Invoice" button, plus a hidden invoice layout
 * that is captured by html2canvas and saved to PDF with jsPDF.
 */
export default function InvoiceDownload({ record }: InvoiceDownloadProps) {
  const invoiceRef = useRef<HTMLDivElement>(null);

  // ========== PDF Generation Handler ==========
  const handleDownloadInvoice = async () => {
    if (!invoiceRef.current) return;

    // Wait briefly to ensure fonts/images are loaded
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 1) Render the invoiceRef into a single tall canvas (with transparent BG).
    const canvas = await html2canvas(invoiceRef.current, {
      scale: 3,
      useCORS: true,
      backgroundColor: null, // Keep background transparent
    });

    // Convert that canvas to a PNG data URL
    // const fullImgData = canvas.toDataURL("image/png");

    // 2) Set up jsPDF (portrait, A4)
    const pdf = new jsPDF({
      orientation: "p",
      unit: "pt",
      format: "a4",
    });

    const pdfWidth = 595;  // A4 width in points
    const pdfHeight = 842; // A4 height in points

    // Define margins
    const topMargin = 120;   
    const bottomMargin = 80; 
    const sideMargin = 20;   
    const contentHeight = pdfHeight - topMargin - bottomMargin;

    // Determine scaling from canvas px to PDF points
    const scaleRatio = pdfWidth / canvas.width;
    // The entire invoice height in PDF points after scaling:
    const fullContentHeightPts = canvas.height * scaleRatio;

    let currentPos = 0; // track how far we've printed (in PDF points)
    let pageCount = 0;

    // 3) Slice the tall canvas into multiple PDF pages
    while (currentPos < fullContentHeightPts) {
      pageCount += 1;

      // Add a new page in PDF if it's not the first one
      if (pageCount > 1) {
        pdf.addPage();
      }

      // OPTIONAL: Draw your letterhead/watermark behind the page
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

      // Figure out the portion of the big canvas to copy
      const sourceY = Math.floor(currentPos / scaleRatio);
      const sourceHeight = Math.floor(contentHeight / scaleRatio);

      // Make a temp canvas for the "chunk"
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sourceHeight;

      // Copy the portion from the big canvas
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

      // Convert that chunk to a data URL
      const chunkImgData = pageCanvas.toDataURL("image/png");
      // How tall it is in PDF points
      const chunkHeightPts = sourceHeight * scaleRatio;

      // 4) Place this chunk in the PDF with side margins
      pdf.addImage(
        chunkImgData,
        "PNG",
        sideMargin,                // x
        topMargin,                 // y
        pdfWidth - 2 * sideMargin, // width
        chunkHeightPts,            // height
        "",
        "FAST"
      );

      // Move downward for next page
      currentPos += contentHeight;
    }

    // Determine filename
    const fileName = record.dischargeDate
      ? `Final_Invoice_${record.name}_${record.ipdId}.pdf`
      : `Provisional_Invoice_${record.name}_${record.ipdId}.pdf`;

    // 5) Save the PDF
    pdf.save(fileName);
  };

  // ========== Data & Layout Logic ==========

  // 1) Group Hospital Services
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

  // 2) Group Consultant Charges by Doctor Name
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

  // 3) Totals Calculation
  const hospitalServiceTotal = record.services
    .filter((s) => s.type === "service")
    .reduce((sum, s) => sum + s.amount, 0);

  const consultantChargeTotal = record.services
    .filter((s) => s.type === "doctorvisit")
    .reduce((sum, s) => sum + s.amount, 0);

  const discount = record.discount || 0;
  const totalBill = hospitalServiceTotal + consultantChargeTotal - discount;

  // ========== Render ==========
  return (
    <div className="flex flex-col items-center">
      {/* The Download button visible in the UI */}
      <button
        onClick={handleDownloadInvoice}
        className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition duration-300 flex items-center mb-4 text-[10px]"
      >
        <Download size={16} className="mr-1" />
        {record.dischargeDate
          ? "Download Final Invoice"
          : "Download Provisional Invoice"}
      </button>

      {/* Hidden container for invoice (off-screen) */}
      <div
        ref={invoiceRef}
        style={{
          position: "absolute",
          left: "-9999px",
          top: 0,
          width: "595px", // A4 width
          // Ensure no forced background color:
          backgroundColor: "transparent",
        }}
      >
        {/* Invoice content - adjust styling as needed */}
        <div className="text-[10px] text-gray-800 p-4 bg-transparent">
          {/* Combined Patient & Billing Info + Totals Card */}
          <div className="my-2 p-2 rounded shadow-sm border border-gray-200">
            <div className="flex justify-between">
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
              <div>
                <p>
                  <strong>Deposit Amount:</strong> Rs.{" "}
                  {record.amount.toLocaleString()}
                </p>
                <p>
                  <strong>Bill Date:</strong> {new Date().toLocaleString()}
                </p>
                <p>
                  <strong>Registration Date:</strong>{" "}
                  {record.createdAt
                    ? new Date(record.createdAt).toLocaleString()
                    : new Date().toLocaleString()}
                </p>
                {record.dischargeDate && (
                  <p>
                    <strong>Discharge Date:</strong>{" "}
                    {new Date(record.dischargeDate).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            {/* Totals in same card */}
            <div className="mt-2 p-2 bg-gray-100 rounded">
              <p className="flex justify-between">
                <span>Hospital Services:</span>
                <span>Rs. {hospitalServiceTotal.toLocaleString()}</span>
              </p>
              <p className="flex justify-between">
                <span>Consultant Charges:</span>
                <span>Rs. {consultantChargeTotal.toLocaleString()}</span>
              </p>
              {discount > 0 && (
                <p className="flex justify-between">
                  <span>Discount:</span>
                  <span>- Rs. {discount.toLocaleString()}</span>
                </p>
              )}
              <hr className="my-1" />
              <p className="flex justify-between font-semibold">
                <span>Total Bill:</span>
                <span>Rs. {totalBill.toLocaleString()}</span>
              </p>
            </div>
          </div>

          {/* Hospital Service Charges Table */}
          <div className="my-2 align-middle justify-center">
            <h3 className="font-semibold mb-2 text-[10px]">
              Hospital Service Charges
            </h3>
            <table className="w-full text-[8px] justify-center align-middle">
              <thead>
                <tr className="bg-green-100 justify-center align-middle">
                  <th className="p-1 text-left align-middle">Service</th>
                  <th className="p-1 text-center align-middle">Qnty</th>
                  <th className="p-1 text-right align-middle">Amount (Rs)</th>
                  <th className="p-1 text-right align-middle">Total (Rs)</th>
                </tr>
              </thead>
              <tbody>
                {groupedHospitalServices.map((item, idx) => (
                  <tr key={idx}>
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
          </div>

          {/* Consultant Charges Table */}
          <div className="my-4">
            <h3 className="font-semibold mb-2 text-[10px]">
              Consultant Charges
            </h3>
            <table className="w-full text-[8px]">
              <thead>
                <tr className="bg-green-100">
                  <th className="p-1 text-left align-middle">Doctor Name</th>
                  <th className="p-1 text-center align-middle">Visited</th>
                  <th className="p-1 text-right align-middle">Amount (Rs)</th>
                  <th className="p-1 text-right align-middle">Total (Rs)</th>
                </tr>
              </thead>
              <tbody>
                {groupedConsultantServices.map((item, idx) => (
                  <tr key={idx}>
                    <td className="p-1">{item.doctorName}</td>
                    <td className="p-1 text-center">{item.quantity}</td>
                    <td className="p-1 text-right">
                      {item.unitAmount.toLocaleString()}
                    </td>
                    <td className="p-1 text-right">
                      {item.totalAmount.toLocaleString()}
                    </td>
                    <hr />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* ... Add more sections if needed ... */}
        </div>
      </div>
    </div>
  );
}
