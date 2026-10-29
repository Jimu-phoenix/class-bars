import { supabase } from "@/lib/supabase"

export type OtpQuota = {
  limit: number
  used: number
  remaining: number
  already_checked_in: boolean
  enrolled: boolean
  session_open: boolean
}

export class OtpApiError extends Error {
  code: string
  retryAfter?: number

  constructor(message: string, code: string, retryAfter?: number) {
    super(message)
    this.name = "OtpApiError"
    this.code = code
    this.retryAfter = retryAfter
  }
}

function isFunctionsHttpError(error: unknown): error is {
  context?: { json: () => Promise<any> }
  message?: string
} {
  return typeof error === "object" && error !== null && ("context" in error || ("name" in error && (error as any).name === "FunctionsHttpError"))
}

async function parseError(error: unknown): Promise<OtpApiError> {
  if (isFunctionsHttpError(error)) {
    const ctx = (error as any).context
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = await ctx.json()
        const message = typeof body?.error === "string" ? body.error : (typeof body?.message === "string" ? body.message : "Request failed")
        const code = typeof body?.code === "string" ? body.code : "server_error"
        const retryAfter = typeof body?.retry_after === "number" ? body.retry_after : undefined
        return new OtpApiError(message, code, retryAfter)
      } catch {
        // fall through
      }
    }
    // Try to get message from error
    if ((error as any).message) {
      return new OtpApiError((error as any).message, "server_error")
    }
    return new OtpApiError("Request failed", "server_error")
  }

  if (error instanceof Error) {
    return new OtpApiError("Couldn't reach the server. Check your connection and try again.", "network")
  }

  return new OtpApiError("Couldn't reach the server. Check your connection and try again.", "network")
}

export async function getOtpQuota(sessionId: string): Promise<OtpQuota> {
  try {
    const { data, error } = await supabase.rpc("get_otp_quota", { p_session_id: sessionId })
    if (error) {
      console.error("getOtpQuota error:", error)
      throw error
    }
    return data as OtpQuota
  } catch (error) {
    console.error("getOtpQuota catch:", error)
    throw await parseError(error)
  }
}

export async function sendAttendanceOtp(sessionId: string): Promise<{
  ok: true
  sent_to: string
  expires_in: number
  cooldown: number
  limit: number
  remaining: number
}> {
  try {
    const { data, error } = await supabase.functions.invoke("send-attendance-otp", {
      body: { session_id: sessionId },
    })
    if (error) {
      console.error("sendAttendanceOtp error:", error)
      throw error
    }
    return data
  } catch (error) {
    console.error("sendAttendanceOtp catch:", error)
    throw await parseError(error)
  }
}

export async function verifyAttendanceOtp(
  sessionId: string,
  code: string,
  location: { latitude: number; longitude: number; accuracy: number },
): Promise<{ ok: true; flagged: boolean }> {
  try {
    const { data, error } = await supabase.functions.invoke("verify-attendance-otp", {
      body: { session_id: sessionId, code, location },
    })
    if (error) {
      console.error("verifyAttendanceOtp error:", error)
      throw error
    }
    return data
  } catch (error) {
    console.error("verifyAttendanceOtp catch:", error)
    throw await parseError(error)
  }
}
