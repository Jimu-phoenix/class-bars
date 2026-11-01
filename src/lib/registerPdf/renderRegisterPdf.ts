import { jsPDF } from "jspdf"
import { autoTable } from "jspdf-autotable"
import type {
  RegisterMatrix,
  RegisterSession,
} from "./buildRegisterMatrix"

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

const LEGEND = "pr = present, ab = absent, prf = present, flagged for review"

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

export function createRegisterPdf(
  matrix: RegisterMatrix,
  meta: RegisterPdfMeta,
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

  doc.setFont("helvetica", "bold")
  doc.setFontSize(15)
  const title = `${meta.courseCode} — ${meta.courseName}`
  const titleLines = doc.splitTextToSize(title, contentWidth)
  doc.text(titleLines, margin, margin + 6)

  let metaY = margin + 10 + titleLines.length * 17
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(`Attendance register · ${formatMonth(meta.month)}`, margin, metaY)
  doc.text(
    `Generated: ${formatDateTime(meta.generatedAt)}`,
    pageWidth - margin,
    metaY,
    { align: "right" },
  )

  metaY += 14
  doc.text(`Lecturer: ${meta.lecturerName || "—"}`, margin, metaY)

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
    startY: metaY + 16,
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
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 20, {
      align: "right",
    })
  }

  return {
    doc,
    filename: registerFilename(meta.courseCode, meta.month),
  }
}

function onRegisterExported(): void {
  void 0
}

export function downloadRegisterPdf(
  matrix: RegisterMatrix,
  meta: RegisterPdfMeta,
): void {
  const { doc, filename } = createRegisterPdf(matrix, meta)
  doc.save(filename)
  onRegisterExported()
}
