import { supabase } from "@/lib/supabase"
import type { User } from "@supabase/supabase-js"

export type SandboxRole = "sandbox_lecturer" | "sandbox_student"

export const SANDBOX_DEFAULTS = {
  classLabel: "Sandbox / Test Class",
  courseLabel: "Sandbox / Test Course",
  venueLabel: "Sandbox / Test Venue",
} as const

const ANON_DISABLED_HINT =
  "Anonymous sign-ins are disabled on this Supabase project. Enable them in Supabase Dashboard → Authentication → Sign In / Providers → Anonymous, then retry."

const CAPTCHA_HINT =
  "hCaptcha verification failed or was not completed. Solve the captcha and retry — if it keeps failing, check that VITE_HCAPTCHA_SITEKEY is set in .env."

export function getSandboxRole(user: User | null): SandboxRole | null {
  const role = user?.user_metadata?.role
  if (role === "sandbox_lecturer" || role === "sandbox_student") return role
  return null
}

type JoinResult = { ok: true } | { ok: false; error: string }

export async function joinSandbox(
  role: SandboxRole,
  captchaToken?: string,
): Promise<JoinResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session?.user && getSandboxRole(session.user) === role) {
    return { ok: true }
  }

  if (session) {
    await supabase.auth.signOut()
  }

  const { error } = await supabase.auth.signInAnonymously({
    options: {
      captchaToken,
      data: {
        role,
        full_name: role === "sandbox_lecturer" ? "Sandbox Lecturer" : "Sandbox Student",
      },
    },
  })

  if (error) {
    if (/captcha/i.test(error.message)) {
      return { ok: false, error: CAPTCHA_HINT }
    }
    const message = /anonymous/i.test(error.message)
      ? ANON_DISABLED_HINT
      : error.message
    return { ok: false, error: message }
  }
  return { ok: true }
}

export async function leaveSandbox(): Promise<void> {
  await supabase.auth.signOut()
}
