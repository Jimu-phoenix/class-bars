import { supabase } from "@/lib/supabase"
import {
  FACE_MODEL_VERSION,
  faceConfidence,
  parseEmbedding,
} from "@/lib/faceCompare"
import type { Coordinates } from "@/lib/geofence"
import type {
  AttendanceMethod,
  AttendanceRecordRow,
  AttendanceStatus,
  EnrollmentRow,
  FaceEmbeddingRow,
} from "@/types/db"

// ---------------------------------------------------------------------------
// face_embeddings (self-owned under RLS; writes go through SECURITY DEFINER
// RPCs -- see migrations/06_real_attendance_flow.sql)
// ---------------------------------------------------------------------------

export { FACE_MODEL_VERSION, faceConfidence, parseEmbedding }

export async function getActiveFaceEmbedding(
  userId: string,
): Promise<FaceEmbeddingRow | null> {
  const { data, error } = await supabase
    .from("face_embeddings")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle()
  if (error) throw error
  return (data as FaceEmbeddingRow | null) ?? null
}

export async function upsertFaceEmbedding(
  descriptor: Float32Array,
): Promise<FaceEmbeddingRow> {
  const { data, error } = await supabase.rpc("upsert_face_embedding", {
    p_embedding: Array.from(descriptor),
    p_model_version: FACE_MODEL_VERSION,
  })
  if (error) throw error
  return data as FaceEmbeddingRow
}

export async function clearFaceEmbedding(): Promise<void> {
  const { error } = await supabase.rpc("clear_face_embedding")
  if (error) throw error
}

// ---------------------------------------------------------------------------
// enrollments
// ---------------------------------------------------------------------------

export async function enrollSelf(courseCode: string): Promise<EnrollmentRow> {
  const { data, error } = await supabase.rpc("enroll_self", {
    p_course_code: courseCode,
  })
  if (error) throw error
  return data as EnrollmentRow
}

// ---------------------------------------------------------------------------
// attendance
// ---------------------------------------------------------------------------

export type SessionAttendanceRow = {
  record_id: string
  session_id: string
  student_id: string
  student_name: string
  student_number: string | null
  method: AttendanceMethod
  status: AttendanceStatus
  check_in_time: string | null
  confidence_score: number | null
  flag_reason: string | null
}

export async function getSessionAttendance(
  sessionId: string,
): Promise<SessionAttendanceRow[]> {
  const { data, error } = await supabase.rpc("get_session_attendance", {
    p_session_id: sessionId,
  })
  if (error) throw error
  return (data as SessionAttendanceRow[]) ?? []
}

export async function checkInFace(
  sessionId: string,
  studentId: string,
  distance: number,
  location: Coordinates,
): Promise<AttendanceRecordRow> {
  const confidence = faceConfidence(distance)
  const { data, error } = await supabase.rpc("check_in_attendance", {
    p_session_id: sessionId,
    p_student_id: studentId,
    p_device_id: null,
    p_method: "face",
    p_confidence: confidence,
    p_latitude: location.latitude,
    p_longitude: location.longitude,
    p_accuracy_m: location.accuracy,
  })
  if (error) throw error
  return data as AttendanceRecordRow
}