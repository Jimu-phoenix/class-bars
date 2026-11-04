import { jsPDF } from "jspdf"
import { autoTable } from "jspdf-autotable"
import { toDataURL } from "qrcode"
import type {
  RegisterMatrix,
  RegisterSession,
} from "./buildRegisterMatrix"
import { buildVerifyUrl } from "./pdfCode.ts"

export type RegisterPdfMeta = {
  courseCode: string
  courseName: string
  lecturerName: string
  month: string
  generatedAt: Date
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

const LEGEND = "p = present, a = absent, f = present, flagged for review"

// Verification QR layout (units are pt, matching jsPDF's unit).
// The QR is ~22 mm (62 pt) square in the top-left inside the page margin,
// with the code + a tiny caption beneath it. The header text block shifts
// right by QR_SIZE + QR_GAP so it reads as one seamless header next to the QR.
const QR_SIZE = 62 // ~22 mm
const QR_GAP = 17 // ~6 mm
const HEADER_SHIFT = QR_SIZE + QR_GAP
const QR_TO_CODE = 6
const CODE_SIZE = 9
const CODE_TO_CAPTION = 4
const CAPTION_SIZE = 7

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

function formatMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return month
  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  return `${MONTHS[monthIndex] ?? month} ${year}`
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${pad(date.getDate())} ${SHORT_MONTHS[date.getMonth()]}`
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatDateTime(date: Date): string {
  return `${pad(date.getDate())} ${SHORT_MONTHS[date.getMonth()]} ${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function sessionHeadings(sessions: RegisterSession[]): string[] {
  const dates = sessions.map((session) => formatDate(session.scheduledStart))
  const counts = new Map<string, number>()
  for (const date of dates) {
    counts.set(date, (counts.get(date) ?? 0) + 1)
  }

  return sessions.map((session, index) => {
    const date = dates[index]
    return (counts.get(date) ?? 0) > 1
      ? `${date}\n${formatTime(session.scheduledStart)}`
      : date
  })
}

export function sanitiseCourseCode(courseCode: string): string {
  const safe = courseCode
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60)
  return safe || "course"
}

export function registerFilename(courseCode: string, month: string): string {
  return `${sanitiseCourseCode(courseCode)}_register_${month}.pdf`
}

export async function createRegisterPdf(
  matrix: RegisterMatrix,
  meta: RegisterPdfMeta,
  verificationCode?: string,
) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4",
    compress: true,
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 30
  const contentWidth = pageWidth - margin * 2

  let verifyHost = ""
  let qrBottom = margin // bottom of the QR block (code + caption included)
  if (verificationCode) {
    verifyHost = buildVerifyUrl(verificationCode).replace(/\/verify\/[^/]+$/, "")
    qrBottom =
      margin +
      QR_SIZE +
      QR_TO_CODE +
      CODE_SIZE +
      CODE_TO_CAPTION +
      CAPTION_SIZE
  }

  // ------------------------------------------------------------------
  // Verification QR (top-left, inside the margin) + code + caption.
  // ------------------------------------------------------------------
  if (verificationCode) {
    const qrDataUrl = await toDataURL(verificationCode, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 256,
    })
    doc.addImage(qrDataUrl, "PNG", margin, margin, QR_SIZE, QR_SIZE)

    doc.setFont("helvetica", "normal")
    doc.setFontSize(CODE_SIZE)
    doc.text(verificationCode, margin, margin + QR_SIZE + QR_TO_CODE)

    doc.setFontSize(CAPTION_SIZE)
    doc.text("Scan to verify", margin, margin + QR_SIZE + QR_TO_CODE + CODE_SIZE + CODE_TO_CAPTION)
  }

  // ------------------------------------------------------------------
  // Header block: shifted right by HEADER_SHIFT when a QR is present so
  // it reads as one seamless header next to the QR.
  // ------------------------------------------------------------------
  const headerX = verificationCode ? margin + HEADER_SHIFT : margin
  const headerMaxWidth = verificationCode ? contentWidth - HEADER_SHIFT : contentWidth

  doc.setFont("helvetica", "bold")
  doc.setFontSize(15)
  const title = `${meta.courseCode} — ${meta.courseName}`
  const titleLines = doc.splitTextToSize(title, headerMaxWidth)
  doc.text(titleLines, headerX, margin + 6)

  let metaY = margin + 10 + titleLines.length * 17
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(`Attendance register · ${formatMonth(meta.month)}`, headerX, metaY)
  doc.text(
    `Generated: ${formatDateTime(meta.generatedAt)}`,
    pageWidth - margin,
    metaY,
    { align: "right" },
  )

  metaY += 14
  doc.text(`Lecturer: ${meta.lecturerName || "—"}`, headerX, metaY)

  // ------------------------------------------------------------------
  // Table: start below the header, pushed down further when a QR is
  // present so the table (which starts at the left margin) never
  // overlaps the QR block.
  // ------------------------------------------------------------------
  const tableStartY = verificationCode
    ? Math.max(metaY + 16, qrBottom + 12)
    : metaY + 16

  const head = [
    [
      "#",
      "Student name",
      "Registration no.",
      ...sessionHeadings(matrix.sessions),
    ],
  ]

  const body = matrix.students.map((student, rowIndex) => [
    String(rowIndex + 1),
    student.fullName,
    student.registrationNumber || "—",
    ...matrix.cells[rowIndex],
  ])

  const fixedWidth = 24 + 140 + 100
  const sessionWidth = Math.min(
    90,
    Math.max(42, (contentWidth - fixedWidth) / Math.max(1, matrix.sessions.length)),
  )

  const columnStyles: Record<string, { cellWidth: number; halign?: "center" }> = {
    "0": { cellWidth: 24, halign: "center" },
    "1": { cellWidth: 140 },
    "2": { cellWidth: 100 },
  }
  matrix.sessions.forEach((_, index) => {
    columnStyles[String(index + 3)] = {
      cellWidth: sessionWidth,
      halign: "center",
    }
  })

  autoTable(doc, {
    startY: tableStartY,
    head,
    body,
    theme: "grid",
    showHead: "everyPage",
    rowPageBreak: "avoid",
    margin: { top: 30, right: margin, bottom: 36, left: margin },
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 4,
      textColor: 0,
      lineColor: 0,
      lineWidth: 0.5,
      fillColor: [255, 255, 255],
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fontStyle: "bold",
      textColor: 0,
      fillColor: [255, 255, 255],
      halign: "center",
      valign: "middle",
      fontSize: 7.5,
    },
    bodyStyles: {
      textColor: 0,
      fillColor: [255, 255, 255],
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    columnStyles,
  })

  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    doc.text(LEGEND, margin, pageHeight - 20)
    const pageText = `Page ${page} of ${pageCount}`
    const pageX = pageWidth - margin
    doc.setFontSize(7.5)
    const pageDim = doc.getTextDimensions(pageText)
    if (verificationCode) {
      const verifyText = `Verification code: ${verificationCode} · verify at ${verifyHost}`
      doc.setFontSize(6)
      const verifyDim = doc.getTextDimensions(verifyText)
      const gap = 10
      const verifyX = pageX - gap - pageDim.w - verifyDim.w
      doc.text(verifyText, verifyX, pageHeight - 20)
    }
    doc.text(pageText, pageX, pageHeight - 20, { align: "right" })
  }

  return {
    doc,
    filename: registerFilename(meta.courseCode, meta.month),
  }
}

function onRegisterExported(): void {
  void 0
}

export async function downloadRegisterPdf(
  matrix: RegisterMatrix,
  meta: RegisterPdfMeta,
  verificationCode?: string,
): Promise<void> {
  const { doc, filename } = await createRegisterPdf(matrix, meta, verificationCode)
  doc.save(filename)
  onRegisterExported()
}
