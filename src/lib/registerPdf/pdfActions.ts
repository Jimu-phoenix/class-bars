import { supabase } from "@/lib/supabase"
import { generatePdfCode } from "./pdfCode"

export type PdfRecord = {
  code: string
  createdAt: string
}

function friendlyError(message: string): string {
  if (message.includes("Course not found or not owned by you")) {
    return "You can only register a register PDF for a course you own."
  }
  if (message.includes("Only lecturers can register attendance PDFs")) {
    return "Only lecturers can register attendance PDFs."
  }
  if (message.includes("invalid_pdf_code")) {
    return "The verification code is not valid."
  }
  if (message.includes("Not authenticated")) {
    return "You must be signed in to register a PDF."
  }
  return message
}

export async function recordAttendancePdf(
  courseId: string,
  code: string,
): Promise<PdfRecord> {
  const { data, error } = await supabase.rpc("record_attendance_pdf", {
    p_course_id: courseId,
    p_pdf_code: code,
  })
  if (error) throw new Error(friendlyError(error.message))
  const row = (data as Array<{ id: string; created_at: string }> | null)?.[0]
  if (!row) {
    throw new Error("The verification code was not registered.")
  }
  return { code, createdAt: row.created_at }
}

export async function registerPdfWithRetry(
  courseId: string,
): Promise<PdfRecord> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generatePdfCode()
    try {
      return await recordAttendancePdf(courseId, code)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message === "pdf_code_taken") {
        lastError = new Error("The verification code was already taken; retrying with a new code.")
        continue
      }
      throw err
    }
  }
  throw lastError ?? new Error("Could not register the verification code.")
}
