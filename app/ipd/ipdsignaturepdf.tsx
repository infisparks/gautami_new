"use client"
import React from 'react';
import jsPDF from 'jspdf';
import { IPDFormInput } from './page';

interface IPDSignaturePDFProps {
  data: IPDFormInput;
}

const IPDSignaturePDF: React.FC<IPDSignaturePDFProps> = ({ data }) => {
  const generatePDF = () => {
    const doc = new jsPDF({
      orientation: 'p',
      unit: 'pt',
      format: 'A4',
    });

    // PAGE DIMENSIONS & MARGINS
    const pageWidth = doc.internal.pageSize.getWidth();
    const leftMargin = 50;
    const rightMargin = pageWidth - 50;
    let currentY = 50; // vertical position
    const lineHeight = 14;

    // HELPER FUNCTIONS
    const drawSeparator = () => {
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.5);
      doc.line(leftMargin, currentY, rightMargin, currentY);
      currentY += lineHeight;
    };

    const addField = (label: string, value?: string) => {
      // Label in bold
      doc.setFont('Helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(`${label}`, leftMargin, currentY);

      // Value in normal font, a bit indented
      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text(`${value || 'N/A'}`, leftMargin + 120, currentY);
      currentY += lineHeight;
    };

    const addSectionTitle = (title: string) => {
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 128); // Subtle blue for headings
      doc.text(title, leftMargin, currentY);
      currentY += lineHeight;
      drawSeparator();
      // Reset font for section content
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
    };

    // MAIN TITLE
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 128);
    doc.text("Patient's Admission Summary", pageWidth / 2, currentY, {
      align: 'center',
    });
    currentY += lineHeight + 8;

    // FIRST SEPARATOR
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.7);
    doc.line(leftMargin, currentY, rightMargin, currentY);
    currentY += lineHeight;

    // RESET FOR BODY TEXT
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setLineWidth(0.5);

    // PATIENT DETAILS
    addSectionTitle('Patient Details');
    addField('Patient Name', data.name || 'NA');
    addField(
      'Age / Sex',
      `${data.age || 35} Yrs / ${data.gender?.label || 'NA'}`
    );
    addField(
      'Under Care of Doctor',
      data.doctor?.label || 'NA'
    );
    // Removed Duty Doctor field
    addField(
      'Address',
      data.address || 'na'
    );
    addField('Number', data.phone || 'NA');

    // ADMISSION DETAILS
    addSectionTitle('Admission Details');
    // Removed UHID field
    const admissionDate = data.date ? data.date.toLocaleDateString() : '24-03-2025';
    addField('Admission Date', admissionDate);
    addField('Referral Doctor', data.referDoctor || '');
    // Removed IP No. field

    // ROOM / WARD
    addSectionTitle('Room / Ward');
    addField('Room / Ward', data.roomType?.label || 'NA');
    addField('Bed No', data.bed?.label || 'NA');

    // Removed Bill Details section

    // INSTRUCTIONS
    addSectionTitle('Instructions');
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
      "For any further assistance, you may reach us on any of the below contact details: 9769000091 / 9769000092",
    ];

    instructions.forEach((instr) => {
      // Check if we need a new page
      if (currentY > 730) {
        doc.addPage();
        currentY = 50;
      }
      // Use splitTextToSize to add line breaks
      const splittedText = doc.splitTextToSize(instr, rightMargin - leftMargin - 15);
      doc.setFont('Helvetica', 'bold');
      doc.setTextColor(0, 0, 128);
      doc.text('•', leftMargin, currentY);
      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      splittedText.forEach((line: string) => {
        doc.text(line, leftMargin + 15, currentY);
        currentY += lineHeight;
        if (currentY > 730) {
          doc.addPage();
          currentY = 50;
        }
      });
    });

    currentY += lineHeight;
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(
      "I have read all the information mentioned above and hereby acknowledge and confirm:",
      leftMargin,
      currentY
    );
    currentY += lineHeight * 2;

    // SIGNATURE BLOCK
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text('Signature: ________________________________________', leftMargin, currentY);
    currentY += lineHeight * 1.5;
    doc.text('Name: _____________________________________________', leftMargin, currentY);
    currentY += lineHeight * 1.5;
    doc.text('Relation with Patient: _______________________________', leftMargin, currentY);
    currentY += lineHeight * 1.5;
    doc.text('Billing Executive: ___________________________________', leftMargin, currentY);

    // SAVE PDF
    doc.save(`IPD_Admission_Letter_${data.name || 'Patient'}.pdf`);
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
