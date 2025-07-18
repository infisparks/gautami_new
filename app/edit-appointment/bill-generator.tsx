"use client"

import { jsPDF } from "jspdf"
import { format } from "date-fns"
import { toWords } from "number-to-words"
import { Download, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { IFormInput } from "../opd/types" // Import AgeUnit

interface DoctorLite {
  id: string
  name: string
}

interface BillGeneratorProps {
  appointmentData: IFormInput;
  appointmentId?: string;
  patientId?: string;
  billNumber?: string; // Add billNumber prop
  doctors?: DoctorLite[]; // for resolving name from id
  className?: string;
}

export function BillGenerator({
  appointmentData,
  appointmentId,
  patientId,
  billNumber, // Destructure billNumber
  doctors = [],
  className = "",
}: BillGeneratorProps) {
  // Helper to map doctor ID to name
  const getDoctorNameById = (doctorId: string): string => {
    if (!doctorId) return "-"
    const doc = doctors.find((d) => d.id === doctorId)
    return doc ? doc.name : doctorId
  }

  const generatePDF = async (openInNewTab: boolean) => { // Unified function
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    // Try letterhead
    try {
      const img = new Image()
      img.crossOrigin = "anonymous"
      await new Promise((res, rej) => {
        img.onload = res
        img.onerror = rej
        img.src = "/letterhead.png"
      })
      doc.addImage(img, "PNG", 0, 0, pageWidth, pageHeight)
    } catch {
      // no letterhead
    }

    // Show date/time on top-right (initial position)
    let yPos = 55 // Adjusted to make space for Patient Info header slightly lower
    doc.setFontSize(9)
    doc.setFont("helvetica", "normal")
    doc.text(
      `Date: ${format(appointmentData.date, "dd/MM/yyyy")} | Time: ${appointmentData.time}`,
      pageWidth - 20,
      yPos,
      { align: "right" },
    )
    yPos += 8

    // Patient Info header
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.setFillColor(240, 248, 255)
    doc.rect(20, yPos - 2, pageWidth - 40, 6, "F")
    doc.text("PATIENT INFORMATION", 22, yPos + 2)
    yPos += 10 // Space after header

    // Info columns - Left side
    const leftX = 22
    doc.setFontSize(9)
    doc.setFont("helvetica", "normal")

    // Patient Name, Phone, Gender (Left Column)
    doc.setFont("helvetica", "bold")
    doc.text("Name:", leftX, yPos)
    doc.setFont("helvetica", "normal")
    doc.text(appointmentData.name, leftX + 18, yPos)
    yPos += 5

    doc.setFont("helvetica", "bold")
    doc.text("Phone:", leftX, yPos)
    doc.setFont("helvetica", "normal")
    doc.text(appointmentData.phone, leftX + 18, yPos)
    yPos += 5

    doc.setFont("helvetica", "bold")
    doc.text("Gender:", leftX, yPos)
    doc.setFont("helvetica", "normal")
    doc.text(
      appointmentData.gender ? appointmentData.gender.charAt(0).toUpperCase() + appointmentData.gender.slice(1) : "-",
      leftX + 18,
      yPos,
    )
    yPos += 5 // This yPos marks the end of left column content

    // Info columns - Right side
    const rightX = pageWidth / 2 + 20
    let currentRightY = yPos - 15; // Start right column aligned with Name (or previous patient info if no UHID)

    if (patientId) {
      doc.setFont("helvetica", "bold")
      doc.text("UHID:", rightX, currentRightY)
      doc.setFont("helvetica", "normal")
      doc.text(patientId, rightX + 15, currentRightY)
      currentRightY += 5
    }

    doc.setFont("helvetica", "bold")
    doc.text("Age:", rightX, currentRightY)
    doc.setFont("helvetica", "normal")
    doc.text(`${appointmentData.age ?? "-"} ${appointmentData.ageUnit || "years"}`, rightX + 15, currentRightY)
    currentRightY += 5

    // Display Bill Number here, below Age
    if (billNumber) {
        doc.setFont("helvetica", "bold");
        doc.text("Bill No:", rightX, currentRightY);
        doc.setFont("helvetica", "normal");
        // FIX: Change rightX + 18 to rightX + 15 for alignment
        doc.text(billNumber, rightX + 15, currentRightY);
        currentRightY += 5; // Move down for next item if any
    }

    // Ensure main yPos moves past the furthest down of the two columns
    yPos = Math.max(yPos, currentRightY) + 5;


    // Table header
    doc.setFontSize(8)
    doc.setFont("helvetica", "bold")
    doc.setFillColor(220, 220, 220)
    doc.rect(20, yPos - 2, pageWidth - 40, 5, "F")
    doc.text("No.", 22, yPos + 1)
    doc.text("Service", 32, yPos + 1)
    doc.text("Doctor/Specialist", 75, yPos + 1)
    doc.text("Details", 125, yPos + 1)
    doc.text("Amount", pageWidth - 22, yPos + 1, { align: "right" })
    yPos += 7
    doc.setFont("helvetica", "normal")
    let totalCharges = 0
    appointmentData.modalities?.forEach((m, i) => {
      if (yPos > pageHeight - 50) {
        doc.addPage()
        try {
          doc.addImage("/letterhead.png", "PNG", 0, 0, pageWidth, pageHeight)
        } catch {}
        yPos = 30
      }
      if (i % 2 === 0) {
        doc.setFillColor(250, 250, 250)
        doc.rect(20, yPos - 1, pageWidth - 40, 4, "F")
      }
      const svc = m.type.charAt(0).toUpperCase() + m.type.slice(1)
      const docName = getDoctorNameById(m.doctor || "")
      const details = m.service || m.specialist || "-"
      const amt = m.charges || 0
      doc.text(String(i + 1), 22, yPos + 1)
      doc.text(svc.length > 15 ? `${svc.slice(0, 15)}…` : svc, 32, yPos + 1)
      doc.text(docName.length > 18 ? `${docName.slice(0, 18)}…` : docName, 75, yPos + 1)
      doc.text(details.length > 20 ? `${details.slice(0, 20)}…` : details, 125, yPos + 1)
      doc.text(`Rs. ${amt}`, pageWidth - 22, yPos + 1, { align: "right" })
      totalCharges += amt
      yPos += 4
    })
    yPos += 7
    // Payment summary
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.setFillColor(240, 248, 255)
    doc.rect(20, yPos - 2, pageWidth - 40, 6, "F")
    doc.text("PAYMENT SUMMARY", 22, yPos + 2)
    yPos += 10
    const discount = Number(appointmentData.discount) || 0
    const cash = Number(appointmentData.cashAmount) || 0
    const online = Number(appointmentData.onlineAmount) || 0
    const paid = cash + online
    const net = totalCharges - discount
    const due = net - paid
    const sx = pageWidth - 70
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.text("Total Charges:", sx - 35, yPos)
    doc.setFont("helvetica", "normal")
    doc.text(`Rs. ${totalCharges}`, pageWidth - 22, yPos, { align: "right" })
    yPos += 4
    if (discount > 0) {
      doc.setFont("helvetica", "bold")
      doc.setTextColor(200, 0, 0)
      doc.text("Discount:", sx - 35, yPos)
      doc.setFont("helvetica", "normal")
      doc.text(`Rs. ${discount}`, pageWidth - 22, yPos, { align: "right" })
      doc.setTextColor(0, 0, 0)
      yPos += 4
    }
    doc.setDrawColor(0, 0, 0)
    doc.line(sx - 35, yPos, pageWidth - 20, yPos)
    yPos += 3
    doc.setFont("helvetica", "bold")
    doc.text("Net Amount:", sx - 35, yPos)
    doc.text(`Rs. ${net}`, pageWidth - 22, yPos, { align: "right" })
    yPos += 5
    // Paid breakdown
    if (appointmentData.appointmentType === "visithospital") {
      doc.setFont("helvetica", "normal")
      const line = (lbl: string, val: number) => {
        doc.text(lbl, sx - 35, yPos)
        doc.text(`Rs. ${val}`, pageWidth - 22, yPos, { align: "right" })
        yPos += 5
      }
      if (appointmentData.paymentMethod === "mixed") {
        line("Cash Paid:", cash)
        line("Online Paid:", online)
      } else if (appointmentData.paymentMethod === "cash") {
        line("Cash Paid:", cash)
      } else if (
        appointmentData.paymentMethod === "online" ||
        appointmentData.paymentMethod === "card-credit" ||
        appointmentData.paymentMethod === "card-debit"
      ) {
        line(appointmentData.paymentMethod === "online" ? "Online Paid:" : "Card Paid:", online)
      }
      doc.setFont("helvetica", "bold")
      doc.text("Total Paid:", sx - 35, yPos)
      doc.text(`Rs. ${paid}`, pageWidth - 22, yPos, { align: "right" })
      yPos += 5
    }
    // Due amount
    if (due > 0) {
      doc.setFont("helvetica", "bold")
      doc.setTextColor(200, 0, 0)
      doc.text("Due Amount:", sx - 35, yPos)
      doc.text(`Rs. ${due}`, pageWidth - 22, yPos, { align: "right" })
      doc.setTextColor(0, 0, 0)
      yPos += 5
    }
    // Amounts in words
    doc.setFontSize(9)
    doc.setFont("helvetica", "italic")
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
    yPos += 5
    doc.text(`Total Paid (in words): ${capitalize(toWords(paid))} only`, 20, yPos)
    yPos += 5
    if (due > 0) {
      doc.text(`Due Amount (in words): ${capitalize(toWords(due))} only`, 20, yPos)
      yPos += 5
    }
    // Save or open
    const fname = `Bill_${appointmentData.name.replace(/\s+/g, "_")}__${format(appointmentData.date, "ddMMyyyy")}${billNumber ? `_${billNumber}` : ""}.pdf`;

    if (openInNewTab) {
      const pdfBlob = doc.output("blob")
      const blobUrl = URL.createObjectURL(pdfBlob)
      const newWindow = window.open(blobUrl, "_blank")
      if (newWindow) {
        newWindow.focus()
        setTimeout(() => {
          URL.revokeObjectURL(blobUrl)
        }, 1000)
      } else {
        alert("Please allow popups to view the bill in a new tab")
        URL.revokeObjectURL(blobUrl)
      }
    } else {
      doc.save(fname);
    }
  };

  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" onClick={() => generatePDF(true)} className={`gap-2 ${className}`}>
        <Eye className="h-4 w-4" /> View Bill
      </Button>
      <Button type="button" variant="outline" onClick={() => generatePDF(false)} className={`gap-2 ${className}`}>
        <Download className="h-4 w-4" /> Download Bill
      </Button>
    </div>
  )
}


// Utility function for programmatically opening bill PDF in a new tab
export async function openBillInNewTabProgrammatically(
  appointmentData: IFormInput,
  patientId?: string,
  doctors: DoctorLite[] = [],
  billNumber?: string // Accept billNumber as an argument
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  // --- All logic from your viewPDF, copy/paste as below ---
  try {
    const img = new Image()
    img.crossOrigin = "anonymous"
    await new Promise((res, rej) => {
      img.onload = res
      img.onerror = rej
      img.src = "/letterhead.png"
    })
    doc.addImage(img, "PNG", 0, 0, pageWidth, pageHeight)
  } catch {}

  // Show date/time on top-right (initial position)
  let yPos = 55 // Adjusted to make space for Patient Info header slightly lower
  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.text(
    `Date: ${format(appointmentData.date, "dd/MM/yyyy")} | Time: ${appointmentData.time}`,
    pageWidth - 20,
    yPos,
    { align: "right" }
  )
  yPos += 8

  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.setFillColor(240, 248, 255)
  doc.rect(20, yPos - 2, pageWidth - 40, 6, "F")
  doc.text("PATIENT INFORMATION", 22, yPos + 2)
  yPos += 10
  const leftX = 22
  const rightX = pageWidth / 2 + 20
  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
 
  // Patient Name, Phone, Gender (Left Column)
  doc.setFont("helvetica", "bold")
  doc.text("Name:", leftX, yPos)
  doc.setFont("helvetica", "normal")
  doc.text(appointmentData.name, leftX + 18, yPos)
  yPos += 5

  doc.setFont("helvetica", "bold")
  doc.text("Phone:", leftX, yPos)
  doc.setFont("helvetica", "normal")
  doc.text(appointmentData.phone, leftX + 18, yPos)
  yPos += 5

  doc.setFont("helvetica", "bold")
  doc.text("Gender:", leftX, yPos)
  doc.setFont("helvetica", "normal")
  doc.text(
    appointmentData.gender ? appointmentData.gender.charAt(0).toUpperCase() + appointmentData.gender.slice(1) : "-",
    leftX + 18,
    yPos,
  )
  yPos += 5 // This yPos is now ready for the next left item if any

  // UHID, Age, Bill No (Right Column)
  let currentRightY = yPos - 15; // Start right column aligned with Name
  if (patientId) {
    doc.setFont("helvetica", "bold")
    doc.text("UHID:", rightX, currentRightY)
    doc.setFont("helvetica", "normal")
    doc.text(patientId, rightX + 15, currentRightY)
    currentRightY += 5
  }

  doc.setFont("helvetica", "bold")
  doc.text("Age:", rightX, currentRightY)
  doc.setFont("helvetica", "normal")
  doc.text(`${appointmentData.age ?? "-"} ${appointmentData.ageUnit || "years"}`, rightX + 15, currentRightY)
  currentRightY += 5

  // Display Bill Number here, below Age
  if (billNumber) {
      doc.setFont("helvetica", "bold");
      doc.text("Bill No:", rightX, currentRightY);
      doc.setFont("helvetica", "normal");
      // FIX: Change rightX + 18 to rightX + 15 for alignment
      doc.text(billNumber, rightX + 15, currentRightY);
      currentRightY += 5; // Move down for next item if any
  }

  // Ensure main yPos moves past the furthest down of the two columns
  yPos = Math.max(yPos, currentRightY) + 5;

  doc.setFontSize(8)
  doc.setFont("helvetica", "bold")
  doc.setFillColor(220, 220, 220)
  doc.rect(20, yPos - 2, pageWidth - 40, 5, "F")
  doc.text("No.", 22, yPos + 1)
  doc.text("Service", 32, yPos + 1)
  doc.text("Doctor/Specialist", 75, yPos + 1)
  doc.text("Details", 125, yPos + 1)
  doc.text("Amount", pageWidth - 22, yPos + 1, { align: "right" })
  yPos += 7
  doc.setFont("helvetica", "normal")
  let totalCharges = 0
  const getDoctorNameById = (doctorId: string): string => {
    if (!doctorId) return "-"
    const docData = doctors.find((d) => d.id === doctorId)
    return docData ? docData.name : doctorId
  }
  appointmentData.modalities?.forEach((m: any, i: number) => {
    if (yPos > pageHeight - 50) {
      doc.addPage()
      try {
        doc.addImage("/letterhead.png", "PNG", 0, 0, pageWidth, pageHeight)
      } catch {}
      yPos = 30
    }
    if (i % 2 === 0) {
      doc.setFillColor(250, 250, 250)
      doc.rect(20, yPos - 1, pageWidth - 40, 4, "F")
    }
    const svc = m.type.charAt(0).toUpperCase() + m.type.slice(1)
    const docName = getDoctorNameById(m.doctor || "")
    const details = m.service || m.specialist || "-"
    const amt = m.charges || 0
    doc.text(String(i + 1), 22, yPos + 1)
    doc.text(svc.length > 15 ? `${svc.slice(0, 15)}…` : svc, 32, yPos + 1)
    doc.text(docName.length > 18 ? `${docName.slice(0, 18)}…` : docName, 75, yPos + 1)
    doc.text(details.length > 20 ? `${details.slice(0, 20)}…` : details, 125, yPos + 1)
    doc.text(`Rs. ${amt}`, pageWidth - 22, yPos + 1, { align: "right" })
    totalCharges += amt
    yPos += 4
  })
  yPos += 7
  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.setFillColor(240, 248, 255)
  doc.rect(20, yPos - 2, pageWidth - 40, 6, "F")
  doc.text("PAYMENT SUMMARY", 22, yPos + 2)
  yPos += 10
  const discount = Number(appointmentData.discount) || 0
  const cash = Number(appointmentData.cashAmount) || 0
  const online = Number(appointmentData.onlineAmount) || 0
  const paid = cash + online
  const net = totalCharges - discount
  const due = net - paid
  const sx = pageWidth - 70
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.text("Total Charges:", sx - 35, yPos)
  doc.setFont("helvetica", "normal")
  doc.text(`Rs. ${totalCharges}`, pageWidth - 22, yPos, { align: "right" })
  yPos += 4
    if (discount > 0) {
      doc.setFont("helvetica", "bold")
      doc.setTextColor(200, 0, 0)
      doc.text("Discount:", sx - 35, yPos)
      doc.setFont("helvetica", "normal")
      doc.text(`Rs. ${discount}`, pageWidth - 22, yPos, { align: "right" })
      doc.setTextColor(0, 0, 0)
      yPos += 4
    }
    doc.setDrawColor(0, 0, 0)
    doc.line(sx - 35, yPos, pageWidth - 20, yPos)
    yPos += 3
    doc.setFont("helvetica", "bold")
    doc.text("Net Amount:", sx - 35, yPos)
    doc.text(`Rs. ${net}`, pageWidth - 22, yPos, { align: "right" })
    yPos += 5
    if (appointmentData.appointmentType === "visithospital") {
      doc.setFont("helvetica", "normal")
      const line = (lbl: string, val: number) => {
        doc.text(lbl, sx - 35, yPos)
        doc.text(`Rs. ${val}`, pageWidth - 22, yPos, { align: "right" })
        yPos += 5
      }
      if (appointmentData.paymentMethod === "mixed") {
        line("Cash Paid:", cash)
        line("Online Paid:", online)
      } else if (appointmentData.paymentMethod === "cash") {
        line("Cash Paid:", cash)
      } else if (
        appointmentData.paymentMethod === "online" ||
        appointmentData.paymentMethod === "card-credit" ||
        appointmentData.paymentMethod === "card-debit"
      ) {
        line(appointmentData.paymentMethod === "online" ? "Online Paid:" : "Card Paid:", online)
      }
      doc.setFont("helvetica", "bold")
      doc.text("Total Paid:", sx - 35, yPos)
      doc.text(`Rs. ${paid}`, pageWidth - 22, yPos, { align: "right" })
      yPos += 5
    }
    if (due > 0) {
      doc.setFont("helvetica", "bold")
      doc.setTextColor(200, 0, 0)
      doc.text("Due Amount:", sx - 35, yPos)
      doc.text(`Rs. ${due}`, pageWidth - 22, yPos, { align: "right" })
      doc.setTextColor(0, 0, 0)
      yPos += 5
    }
    doc.setFontSize(9)
    doc.setFont("helvetica", "italic")
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
    yPos += 5
    doc.text(`Total Paid (in words): ${capitalize(toWords(paid))} only`, 20, yPos)
    yPos += 5
    if (due > 0) {
      doc.text(`Due Amount (in words): ${capitalize(toWords(due))} only`, 20, yPos)
      yPos += 5
    }
    // Open as blob in new tab
    const pdfBlob = doc.output("blob")
    const blobUrl = URL.createObjectURL(pdfBlob)
    const newWindow = window.open(blobUrl, "_blank")
    if (newWindow) {
      newWindow.focus()
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl)
      }, 1000)
    } else {
      alert("Please allow popups to view the bill in a new tab")
      URL.revokeObjectURL(blobUrl)
    }
  }