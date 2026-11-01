import { supabase } from "@/lib/supabase"
import { isValidDescriptor, parseEmbedding } from "@/lib/faceCompare"
import type { User } from "@supabase/supabase-js"
import type { SandboxParticipantRow } from "@/types/db"

export type SandboxRole = "sandbox_lecturer" | "sandbox_student"

export const SANDBOX_DEFAULTS = {
  classLabel: "Sandbox / Test Class",
  courseLabel: "Sandbox / Test Course",
  venueLabel: "Sandbox / Test Venue",
} as const

const ANON_DISABLED_HINT =
  "Anonymous sign-ins are disabled on this Supabase project. Enable them in Supabase Dashboard → Authentication → Sign In / Providers → Anonymous, then retry."

const CAPTCHA_HINT =
  "Captcha verification failed. Supabase rejected the request because its own captcha protection is enabled — disable Authentication → Sign In / Providers → Captcha (or wire up server-side verification of the reCAPTCHA token) and retry."

export function getSandboxRole(user: User | null): SandboxRole | null {
  const role = user?.user_metadata?.role
  if (role === "sandbox_lecturer" || role === "sandbox_student") return role
  return null
}

type JoinResult = { ok: true } | { ok: false; error: string }

export async function joinSandbox(role: SandboxRole): Promise<JoinResult> {
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

export async function getSandboxParticipant(
  participantId: string,
): Promise<SandboxParticipantRow | null> {
  const { data } = await supabase
    .from("sandbox_participants")
    .select("*")
    .eq("participant_id", participantId)
    .maybeSingle()

  return (data as SandboxParticipantRow | null) ?? null
}

export async function upsertSandboxParticipant(
  participantId: string,
  displayName: string,
  embedding: string,
): Promise<SandboxParticipantRow | null> {
  const parsed = parseEmbedding(embedding)
  if (!parsed || !isValidDescriptor(parsed)) {
    throw new Error("Invalid face descriptor")
  }
  const { data, error } = await supabase
    .from("sandbox_participants")
    .upsert(
      {
        participant_id: participantId,
        display_name: displayName,
        embedding,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "participant_id" },
    )
    .select("*")
    .single()

  if (error) throw error
  return (data as SandboxParticipantRow) ?? null
}

export async function deleteSandboxParticipant(
  participantId: string,
): Promise<void> {
  const { error } = await supabase
    .from("sandbox_participants")
    .delete()
    .eq("participant_id", participantId)
  if (error) throw error
}
