export type UserRole = "student" | "lecturer" | "admin"

export type SessionStatus = "scheduled" | "ongoing" | "completed" | "cancelled"

export type CourseRow = {
  id: string
  course_code: string
  course_name: string
  department: string | null
}

export type VenueRow = {
  id: string
  name: string
  building: string | null
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
