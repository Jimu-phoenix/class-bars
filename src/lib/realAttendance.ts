import { supabase } from "@/lib/supabase"
import {
  FACE_MODEL_VERSION,
  faceConfidence,
  isValidDescriptor,
  parseEmbedding,
} from "@/lib/faceCompare"
import type { FaceMatchBand } from "@/lib/faceMatch"
import type { Coordinates } from "@/lib/geofence"
import type {
  AttendanceMethod,
  AttendanceRecordRow,
  AttendanceStatus,
  EnrollmentRow,
  FaceEmbeddingRow,
} from "@/types/db"

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
  if (!isValidDescriptor(descriptor)) {
    throw new Error("Invalid face descriptor")
  }
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

export async function enrollSelf(courseCode: string): Promise<EnrollmentRow> {
  const { data, error } = await supabase.rpc("enroll_self", {
    p_course_code: courseCode,
  })
  if (error) throw error
  return data as EnrollmentRow
}

export type SessionAttendanceRow = {
  record_id: string
  session_id: string
  student_id: string
  student_name: string
  student_number: string | null
  method: AttendanceMethod
  status: AttendanceStatus
  check_in_time: string | null
  match_score: number | null
  flag_reason: string | null
}

export type FaceCheckInResult = {
  outcome: FaceMatchBand
  record: AttendanceRecordRow | null
  band: FaceMatchBand | null
  config_version: string | null
}

function parseFaceCheckInResult(data: unknown): FaceCheckInResult {
  if (data === null || typeof data !== "object") {
    throw new Error("Invalid check-in response")
  }

  const payload = data as Record<string, unknown>
  const outcome = payload.outcome
  if (outcome !== "accept" && outcome !== "review" && outcome !== "retry") {
    throw new Error("Invalid check-in response")
  }

  const band = payload.band
  if (
    band !== null &&
    band !== undefined &&
    band !== "accept" &&
    band !== "review" &&
    band !== "retry"
  ) {
    throw new Error("Invalid check-in response")
  }

  const record = payload.record
  if (outcome !== "retry" && (record === null || typeof record !== "object")) {
    throw new Error("Invalid check-in response")
  }

  return {
    outcome,
    record: (record as AttendanceRecordRow | null | undefined) ?? null,
    band: (band as FaceMatchBand | null | undefined) ?? null,
    config_version:
      typeof payload.config_version === "string" ? payload.config_version : null,
  }
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
): Promise<FaceCheckInResult> {
  if (!Number.isFinite(distance) || distance < 0) {
    throw new Error("Invalid face distance")
  }

  const { data, error } = await supabase.rpc("check_in_attendance", {
    p_session_id: sessionId,
    p_student_id: studentId,
    p_device_id: null,
    p_method: "face",
    p_confidence: null,
    p_latitude: location.latitude,
    p_longitude: location.longitude,
    p_accuracy_m: location.accuracy,
    p_match_distance: distance,
  })
  if (error) throw error
  return parseFaceCheckInResult(data)
}
