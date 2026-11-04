import { supabase } from "@/lib/supabase"
import { isValidPdfCode, normalisePdfCode } from "./pdfCode.ts"

export type VerifyResult =
  | {
      status: "verified"
      courseCode: string | null
      courseName: string | null
      createdAt: string
    }
  | { status: "not_found" }

export async function verifyAttendancePdf(
  code: string,
): Promise<VerifyResult> {
  const normalised = normalisePdfCode(code)
  if (!isValidPdfCode(normalised)) {
    return { status: "not_found" }
  }

  const { data, error } = await supabase.rpc("verify_attendance_pdf", {
    p_code: normalised,
  })
  if (error) throw error

  const rows = (
    data as Array<{
      course_code: string | null
      course_name: string | null
      created_at: string
    }> | null
  ) ?? []
  if (rows.length === 0) {
    return { status: "not_found" }
  }

  return {
    status: "verified",
    courseCode: rows[0].course_code,
    courseName: rows[0].course_name,
    createdAt: rows[0].created_at,
  }
}
