import type { AttendanceStatus } from "@/types/db"

export const REGISTER_MIN_SESSIONS = 2
export const REGISTER_MAX_SESSIONS = 8

export type RegisterCell = "p" | "a" | "f"

// Visual style for each register cell, used by the PDF renderer.
// shape "rect": filled rectangle, height = cell height, width = widthRatio * cell width.
// shape "leftBorder": colored left border the full cell height.
export type CellStyle = {
  color: string
  shape: "rect" | "leftBorder"
  widthRatio?: number
}

export const CELL_STYLES: Record<RegisterCell, CellStyle> = {
  p: { color: "#22c55e", shape: "rect", widthRatio: 0.2 },   // green
  a: { color: "#ef4444", shape: "rect", widthRatio: 0.2 },   // red
  f: { color: "#eab308", shape: "rect", widthRatio: 0.2 },   // yellow
}

export function cellStyleFor(cell: RegisterCell): CellStyle {
  return CELL_STYLES[cell]
}

export type RegisterSession = {
  id: string
  scheduledStart: string
}

export type RegisterStudent = {
  fullName: string
  registrationNumber: string
}

export type RegisterMatrix = {
  sessions: RegisterSession[]
  students: RegisterStudent[]
  cells: RegisterCell[][]
}

export type RegisterRpcRow = {
  session_id: string
  session_start: string
  full_name: string | null
  registration_number: string | null
  status: AttendanceStatus | null
}

export function cellForStatus(
  status: AttendanceStatus | null | undefined,
): RegisterCell {
  switch (status) {
    case "present":
    case "late":
      return "p"
    case "flagged":
      return "f"
    case "absent":
    case null:
    case undefined:
      return "a"
  }
}

function compareStudents(
  a: RegisterStudent,
  b: RegisterStudent,
): number {
  const aNumber = a.registrationNumber.trim()
  const bNumber = b.registrationNumber.trim()

  if (!aNumber && bNumber) return 1
  if (aNumber && !bNumber) return -1

  const byNumber = aNumber.localeCompare(bNumber, undefined, {
    numeric: true,
    sensitivity: "base",
  })
  if (byNumber !== 0) return byNumber

  return a.fullName.localeCompare(b.fullName, undefined, {
    sensitivity: "base",
  })
}

export function buildRegisterMatrix(
  rows: RegisterRpcRow[],
): RegisterMatrix {
  const sessions = new Map<string, RegisterSession>()
  const students = new Map<
    string,
    { student: RegisterStudent; cells: Map<string, RegisterCell> }
  >()

  for (const row of rows) {
    if (!row.session_id || !row.session_start) continue

    if (!sessions.has(row.session_id)) {
      sessions.set(row.session_id, {
        id: row.session_id,
        scheduledStart: row.session_start,
      })
    }

    const fullName = (row.full_name ?? "").trim()
    const registrationNumber = (row.registration_number ?? "").trim()
    if (!fullName && !registrationNumber) continue

    const key = registrationNumber || fullName
    let entry = students.get(key)
    if (!entry) {
      entry = {
        student: { fullName, registrationNumber },
        cells: new Map<string, RegisterCell>(),
      }
      students.set(key, entry)
    } else {
      entry.student = {
        fullName: fullName || entry.student.fullName,
        registrationNumber:
          registrationNumber || entry.student.registrationNumber,
      }
    }

    if (row.status) {
      entry.cells.set(row.session_id, cellForStatus(row.status))
    }
  }

  const orderedSessions = [...sessions.values()].sort(
    (a, b) =>
      a.scheduledStart.localeCompare(b.scheduledStart) ||
      a.id.localeCompare(b.id),
  )

  if (
    orderedSessions.length < REGISTER_MIN_SESSIONS ||
    orderedSessions.length > REGISTER_MAX_SESSIONS
  ) {
    throw new Error(
      `Select ${REGISTER_MIN_SESSIONS} to ${REGISTER_MAX_SESSIONS} sessions.`,
    )
  }

  const orderedStudents = [...students.values()].sort((a, b) =>
    compareStudents(a.student, b.student),
  )

  return {
    sessions: orderedSessions,
    students: orderedStudents.map((entry) => entry.student),
    cells: orderedStudents.map((entry) =>
      orderedSessions.map(
        (session) => entry.cells.get(session.id) ?? "a",
      ),
    ),
  }
}
