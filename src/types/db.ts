export type UserRole = "student" | "lecturer" | "admin"

export type SessionStatus = "scheduled" | "ongoing" | "completed" | "cancelled"

export type AttendanceMethod = "face" | "otp" | "manual"

export type AttendanceStatus = "present" | "late" | "absent" | "flagged"

export type ProfileRow = {
  id: string
  full_name: string
  role: UserRole
  student_number: string | null
  staff_number: string | null
  phone_number: string | null
}

export type EnrollmentRow = {
  id: string
  student_id: string
  course_id: string
  academic_year: string
  semester: string
}

export type FaceEmbeddingRow = {
  id: string
  user_id: string
  embedding_json: string
  model_version: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type AttendanceRecordRow = {
  id: string
  session_id: string
  student_id: string
  device_id: string | null
  method: AttendanceMethod
  status: AttendanceStatus
  check_in_time: string
  confidence_score: number | null
}

export type CourseRow = {
  id: string
  course_code: string
  course_name: string
  department: string | null
  lecturer_id: string | null
}

export type VenueRow = {
  id: string
  name: string
  building: string | null
}

export type StaffEmailRow = {
  email: string
  created_at: string
}


export type ClassSessionRow = {
  id: string
  course_id: string
  lecturer_id: string
  venue_id: string
  scheduled_start: string
  scheduled_end: string
  actual_start: string | null
  actual_end: string | null
  status: SessionStatus
}

export type SandboxSessionStatus = "live" | "ended"

export type SandboxSessionRow = {
  id: string
  lecturer_id: string
  class_label: string
  course_label: string
  venue_label: string
  status: SandboxSessionStatus
  started_at: string
  ended_at: string | null
}

export type SandboxCheckinRow = {
  id: string
  session_id: string
  participant_id: string
  display_name: string
  embedding: string | null
  created_at: string
}

export type SandboxParticipantRow = {
  participant_id: string
  display_name: string
  embedding: string
  created_at: string
  updated_at: string
}
