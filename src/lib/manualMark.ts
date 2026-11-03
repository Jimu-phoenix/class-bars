import { supabase } from "@/lib/supabase"

export type EnrolledStudentRow = {
  student_id: string
  full_name: string
  registration_number: string | null
  checked_in: boolean
}

export class ManualMarkError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = "ManualMarkError"
    this.code = code
  }
}

function parseManualMarkError(error: unknown): ManualMarkError {
  if (error instanceof Error) {
    const msg = error.message
    if (/already recorded/i.test(msg)) {
      return new ManualMarkError("Already checked in", "already_recorded")
    }
    if (/Session is not open for check-in/i.test(msg)) {
      return new ManualMarkError("This session is no longer live", "session_closed")
    }
    if (/Only lecturers can mark attendance/i.test(msg)) {
      return new ManualMarkError("Only lecturers can mark attendance", "not_lecturer")
    }
    if (/Only the session lecturer can mark attendance/i.test(msg)) {
      return new ManualMarkError("Only the session lecturer can mark attendance", "not_owner")
    }
    if (/Student is not enrolled in this course/i.test(msg)) {
      return new ManualMarkError("Student is not enrolled in this course", "not_enrolled")
    }
    if (/Not authenticated/i.test(msg)) {
      return new ManualMarkError("Not authenticated", "not_authenticated")
    }
    return new ManualMarkError(msg, "server_error")
  }
  return new ManualMarkError("An unexpected error occurred.", "server_error")
}

export async function getSessionEnrolledStudents(
  sessionId: string,
): Promise<EnrolledStudentRow[]> {
  const { data, error } = await supabase.rpc("get_session_enrolled_students", {
    p_session_id: sessionId,
  })
  if (error) throw error
  return (data as EnrolledStudentRow[] ?? []).map((row) => ({
    student_id: row.student_id,
    full_name: row.full_name,
    registration_number: row.registration_number,
    checked_in: row.checked_in,
  }))
}

export async function lecturerMarkPresent(
  sessionId: string,
  studentId: string,
): Promise<{
  record_id: string
  session_id: string
  student_id: string
  status: string
  method: string
}> {
  const { data, error } = await supabase.rpc("lecturer_mark_present", {
    p_session_id: sessionId,
    p_student_id: studentId,
  })
  if (error) throw parseManualMarkError(error)
  return {
    record_id: data.record_id,
    session_id: data.session_id,
    student_id: data.student_id,
    status: data.status,
    method: data.method,
  }
}
