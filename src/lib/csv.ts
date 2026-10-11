import type { CourseAttendanceRow } from "@/lib/realAttendance"

export function escapeCsv(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsv).join(","))
  return lines.join("\r\n")
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function sessionLabel(sessionStart: string): string {
  const d = new Date(sessionStart)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function buildAttendanceCsv(rows: CourseAttendanceRow[]): {
  headers: string[]
  body: (string | number | null | undefined)[][]
} {
  const sessionById = new Map<string, CourseAttendanceRow>()
  for (const r of rows) {
    if (!sessionById.has(r.session_id)) sessionById.set(r.session_id, r)
  }
  const sessions = [...sessionById.values()].sort((a, b) =>
    a.session_start.localeCompare(b.session_start)
  )

  const studentById = new Map<string, CourseAttendanceRow>()
  for (const r of rows) {
    if (!studentById.has(r.student_id)) studentById.set(r.student_id, r)
  }
  const studentList = [...studentById.values()].sort((a, b) =>
    a.student_name.localeCompare(b.student_name)
  )

  const headers = [
    "Student Name",
    "Reg. #",
    ...sessions.map((s) => sessionLabel(s.session_start)),
  ]

  const byKey = new Map<string, CourseAttendanceRow>()
  for (const r of rows) {
    byKey.set(`${r.student_id}::${r.session_id}`, r)
  }

  const body = studentList.map((student) => {
    const row: (string | number | null | undefined)[] = [
      student.student_name,
      student.student_number,
    ]
    for (const session of sessions) {
      const record = byKey.get(`${student.student_id}::${session.session_id}`)
      if (!record || record.status === "absent") {
        row.push("Absent")
      } else if (record.confidence_score !== null && record.confidence_score !== undefined) {
        const pct = Math.round(record.confidence_score * 100)
        row.push(`${capitalize(record.status)} (${pct}%)`)
      } else {
        row.push(capitalize(record.status))
      }
    }
    return row
  })

  return { headers, body }
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^.\w-]+/g, "_")
}