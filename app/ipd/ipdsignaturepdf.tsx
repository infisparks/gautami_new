"use client";
import React from "react";
import jsPDF from "jspdf";
import { IPDFormInput } from "./page";

// Make sure letterhead is a valid import for your Next.js project:
import letterhead from "@/public/letterhead.png";

interface IPDSignaturePDFProps {
  data: IPDFormInput;
}

const IPDSignaturePDF: React.FC<IPDSignaturePDFProps> = ({ data }) => {
  const generatePDF = () => {
    const doc = new jsPDF({
      orientation: "p",
      unit: "pt",
      format: "A4",
    });

    // --- Page Dimensions & Margins ---
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let currentY = 120; // start 120px down from the top
    const leftMargin = 50;
    const rightMargin = pageWidth - 50;
    const lineHeight = 14;

    // --- Helper: Add new page + letterhead ---
    const addNewPage = () => {
      doc.addPage();
      // Add your letterhead as background on every new page
      doc.addImage(letterhead.src, "PNG", 0, 0, pageWidth, pageHeight);
      currentY = 120; // reset to 120px from the top on new page
    };

    // --- Put letterhead on the first page immediately ---
    doc.addImage(letterhead.src, "PNG", 0, 0, pageWidth, pageHeight);

    // --- Helper: if we exceed a page, create a new one
    const checkPageBounds = () => {
      if (currentY > pageHeight - 50) {
        addNewPage();
      }
    };

    // --- Draw a horizontal separator line ---
    const drawSeparator = () => {
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.5);
      doc.line(leftMargin, currentY, rightMargin, currentY);
      currentY += lineHeight;
      checkPageBounds();
    };

    // --- Add a label-value field ---
    const addField = (label: string, value?: string) => {
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text(label, leftMargin, currentY);

      doc.setFont("Helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      doc.text(value || "N/A", leftMargin + 120, currentY);

      currentY += lineHeight;
      checkPageBounds();
    };

    // --- Add a Section Title + separator ---
    const addSectionTitle = (title: string) => {
      currentY += 20; // extra spacing before section
      checkPageBounds();

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 128);
      doc.text(title, leftMargin, currentY);

      currentY += 4;
      drawSeparator();

      // Reset font for content
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
    };

    // --- MAIN TITLE ---
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 128);
    doc.text("Patient's Admission Summary", pageWidth / 2, currentY, {
      align: "center",
    });
    currentY += lineHeight + 8;
    checkPageBounds();

    // --- FIRST SEPARATOR ---
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.7);
    doc.line(leftMargin, currentY, rightMargin, currentY);
    currentY += lineHeight;
    checkPageBounds();

    // Reset for body text
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setLineWidth(0.5);

    // --- PATIENT DETAILS ---
    addSectionTitle("Patient Details");
    addField("Patient Name", data.name || "NA");
    addField(
      "Age / Sex",
      `${data.age || 35} Yrs / ${data.gender?.label || "NA"}`
    );
    addField("Under Care of Doctor", data.doctor?.label || "NA");
    addField("Address", data.address || "NA");
    addField("Number", data.phone || "NA");

    // --- ADMISSION DETAILS ---
    addSectionTitle("Admission Details");

    // Construct the date/time string
    const admissionDate = data?.date ? data.date.toLocaleDateString() : "24-03-2025";
    // If your form includes data.time, use it; otherwise fallback on toLocaleTimeString()
    const admissionTime = data?.time
      ? data.time
      : data?.date
      ? data.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "NA";

    addField("Admission Date/Time", `${admissionDate} - ${admissionTime}`);

    addField("Referral Doctor", data.referDoctor || "NA");

    // --- ROOM / WARD DETAILS ---
    addSectionTitle("Room / Ward");
    addField("Room / Ward", data.roomType?.label || "NA");
    addField("Bed No", data.bed?.label || "NA");

    // --- INSTRUCTIONS ---
    addSectionTitle("Instructions");
    const instructions = [
      "Please have an attendant to accompany you till discharge.",
      "Billing Cycle will be of 24 hours from the date and time of admission.",
      "Consultant Visit charges will be charged as per their visits.",
      "Any investigations like Sonography, Blood/Urine Test, X-Ray, 2D-Echo, etc. will be charged extra.",
      "In package, oral medicines and non-medical items are payable by the patient.",
      "All other services like Oxygen, Nebulizer, Monitor, Syringe pump, Ventilator, BiPAP, etc., are chargeable.",
      "Any other visiting consultants other than the treating doctor will be charged extra.",
      "Normal delivery basic package consists of 1 induction; if more than that, it will be charged.",
      "Normal delivery basic package includes 1 pediatric visit.",
      "Consumption of alcohol, smoking, chewing gum, and spitting are strictly prohibited.",
      "Patients are advised not to carry cash or wear/keep any jewelry during hospitalization. The hospital is not responsible for any kind of loss.",
      "Photography is prohibited on hospital premises.",
      "If the patient is required to be transferred to the ICU/Room/Ward, the room/bed they were occupying prior to transfer is to be vacated by the attendants.",
      "For any further assistance, you may reach us on 9769000091 / 9769000092",
    ];

    instructions.forEach((instr) => {
      const splitted = doc.splitTextToSize(instr, rightMargin - leftMargin - 15);
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(0, 0, 128);
      doc.text("•", leftMargin, currentY);
      doc.setFont("Helvetica", "normal");
      doc.setTextColor(60, 60, 60);

      splitted.forEach((line: string) => {
        doc.text(line, leftMargin + 15, currentY);
        currentY += lineHeight;
        checkPageBounds();
      });
    });

    // --- FINAL ACKNOWLEDGMENT ---
    currentY += lineHeight;
    checkPageBounds();

    doc.setFont("Helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(
      "I have read all the information mentioned above and hereby acknowledge and confirm:",
      leftMargin,
      currentY
    );
    currentY += lineHeight * 2;
    checkPageBounds();

    // --- SIGNATURE BLOCK ---
    doc.setFont("Helvetica", "normal");
    doc.setTextColor(60, 60, 60);

    // Row 1: Signatures
    doc.text("Signature: ______________", leftMargin, currentY, {
      align: "left",
    });
    doc.text("Billing Executive: ______________", rightMargin, currentY, {
      align: "right",
    });
    currentY += lineHeight * 2;
    checkPageBounds();

    // Row 2: Name
    doc.text("Name: ______________", leftMargin, currentY);
    currentY += lineHeight * 1.5;
    checkPageBounds();

    // Row 3: Relation
    doc.text("Relation with Patient: ______________", leftMargin, currentY);

    // --- SAVE PDF ---
    doc.save(`IPD_Admission_Letter_${data.name || "Patient"}.pdf`);
  };

  return (
    <button
      type="button"
      onClick={generatePDF}
      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-200"
    >
      Download Letter
    </button>
  );
};

export default IPDSignaturePDF;
