import { supabase } from "@/lib/supabase"
import type {
  AttendanceMethod,
  HistoryResult,
  LecturerHistoryRow,
  LecturerSessionRow,
  StudentListRow,
  MyHistoryRow,
  StudentHeaderRow,
} from "@/types/db"

const HISTORY_ERROR_MESSAGES: Record<string, string> = {
  "Student not found in your courses": "Student not found in your courses",
  "You are not enrolled in this course": "You are not enrolled in this course",
  "Course not found or not owned by you": "Course not found or not owned by you",
}

export class HistoryError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = "HistoryError"
    this.code = code
  }
}

function mapHistoryError(error: unknown): HistoryError {
  if (error instanceof Error) {
    const msg = error.message
    for (const [stable, friendly] of Object.entries(HISTORY_ERROR_MESSAGES)) {
      if (msg.includes(stable)) {
        return new HistoryError(friendly, "history_error")
      }
    }
    if (/Not authenticated/i.test(msg)) {
      return new HistoryError("You must be signed in to view history.", "not_authenticated")
    }
    if (/Only lecturers/i.test(msg)) {
      return new HistoryError("Only lecturers can view this information.", "not_lecturer")
    }
    return new HistoryError(msg, "server_error")
  }
  return new HistoryError("An unexpected error occurred.", "server_error")
}

export async function getLecturerSessions({
  courseId,
  limit = 20,
  offset = 0,
}: {
  courseId?: string | null
  limit?: number
  offset?: number
}): Promise<LecturerSessionRow[]> {
  const { data, error } = await supabase.rpc("get_lecturer_sessions", {
    p_course_id: courseId ?? null,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw mapHistoryError(error)
  return (
    (data as LecturerSessionRow[] ?? []).map((row) => ({
      session_id: row.session_id,
      course_id: row.course_id,
      course_code: row.course_code,
      course_name: row.course_name,
      venue_name: row.venue_name,
      scheduled_start: row.scheduled_start,
      actual_start: row.actual_start,
      status: row.status,
      checked_in_count: row.checked_in_count,
      total_count: row.total_count,
    })) ?? []
  )
}

export async function listMyStudents(): Promise<StudentListRow[]> {
  const { data, error } = await supabase.rpc("list_my_students", {})
  if (error) throw mapHistoryError(error)
  return (
    (data as StudentListRow[] ?? []).map((row) => ({
      student_id: row.student_id,
      full_name: row.full_name,
      registration_number: row.registration_number,
      course_codes: row.course_codes ?? [],
    })) ?? []
  )
}

export async function getStudentHistoryForLecturer({
  studentId,
  courseId,
}: {
  studentId: string
  courseId: string
}): Promise<LecturerHistoryRow[]> {
  const { data, error } = await supabase.rpc("get_student_history_for_lecturer", {
    p_student_id: studentId,
    p_course_id: courseId,
  })
  if (error) throw mapHistoryError(error)
  return (
    (data as LecturerHistoryRow[] ?? []).map((row) => ({
      session_id: row.session_id,
      course_id: row.course_id,
      course_code: row.course_code,
      course_name: row.course_name,
      session_start: row.session_start,
      session_status: row.session_status,
      result: row.result,
      method: row.method,
    })) ?? []
  )
}

export async function getMyHistory({
  courseId,
}: {
  courseId: string
}): Promise<MyHistoryRow[]> {
  const { data, error } = await supabase.rpc("get_my_history", {
    p_course_id: courseId,
  })
  if (error) throw mapHistoryError(error)
  return (
    (data as MyHistoryRow[] ?? []).map((row) => ({
      session_id: row.session_id,
      session_start: row.session_start,
      session_status: row.session_status,
      result: row.result,
    })) ?? []
  )
}

export async function getStudentHeaderForLecturer({
  studentId,
}: {
  studentId: string
}): Promise<StudentHeaderRow | null> {
  const { data, error } = await supabase.rpc("get_student_header_for_lecturer", {
    p_student_id: studentId,
  })
  if (error) throw mapHistoryError(error)
  const rows = (data as StudentHeaderRow[] ?? [])
  if (rows.length === 0) return null
  return rows[0]
}

const PRESENT_LIKE = new Set(["present", "late", "flagged"])

export type HistorySummary = {
  present: number
  ended: number
}

export function summariseHistory(rows: MyHistoryRow[]): HistorySummary {
  let present = 0
  let ended = 0
  for (const row of rows) {
    if (row.session_status === "completed") {
      ended += 1
      if (row.result && PRESENT_LIKE.has(row.result)) {
        present += 1
      }
    }
  }
  return { present, ended }
}

export function lecturerStatusCode(result: HistoryResult): "pr" | "prf" | "ab" | null {
  if (result === "present" || result === "late") return "pr"
  if (result === "flagged") return "prf"
  if (result === "absent") return "ab"
  return null
}

export function studentResultLabel(result: HistoryResult): string | null {
  switch (result) {
    case "present":
      return "Present"
    case "late":
      return "Late"
    case "flagged":
      return "Present (under review)"
    case "absent":
      return "Absent"
    case "upcoming":
      return "Upcoming"
    case "live":
      return "Live"
    default:
      return null
  }
}

export function methodLabel(method: AttendanceMethod | null | undefined): string | null {
  if (method === "face") return "Face"
  if (method === "otp") return "OTP"
  if (method === "manual") return "Manual"
  return null
}

export function filterStudents(
  list: StudentListRow[],
  query: string,
): StudentListRow[] {
  const trimmed = query.trim()
  if (trimmed.length === 0) return list

  const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return list

  return list.filter((student) => {
    const haystack = `${student.full_name ?? ""} ${student.registration_number ?? ""}`
      .toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function formatStartedAt(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function makeRequestGuard() {
  let current = 0
  return {
    next: () => {
      current += 1
      return current
    },
    isStale: (id: number) => id !== current,
  }
}
