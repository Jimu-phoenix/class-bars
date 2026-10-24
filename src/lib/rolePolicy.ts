import type { SignUpRole } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"

/**
 * Lecturer email allowlist, read from the authoritative DB table
 * `staff_emails` (created by migrations/10_staff_email_allowlist.sql).
 *
 * Postgres is the single source of truth: `handle_new_user()` enforces the
 * same list when the signup trigger fires, so a hand-rolled
 * `supabase.auth.signUp()` call cannot bypass this. The client check below
 * is UX + a fail-fast guard; the server check is the security boundary.
 *
 * To change who may register as a lecturer, INSERT/DELETE rows from that
 * table (via the SQL editor / service_role) and the running app picks it
 * up on the next sign-up attempt (cache lives only for the tab lifetime).
 */

// Cache the allowlist for the lifetime of the tab; it only changes via
// admin action in the SQL editor, not per request.
let staffEmailsCache: string[] | null = null

async function loadStaffEmails(): Promise<string[]> {
  if (staffEmailsCache) return staffEmailsCache
  const { data, error } = await supabase.from("staff_emails").select("email")
  if (error) {
    // Fail closed: an unreachable allowlist never accidentally admits a
    // lecturer.
    console.error("staff_emails read failed:", error.message)
    return []
  }
  staffEmailsCache = (data ?? []).map((row) => row.email.toLowerCase())
  return staffEmailsCache
}

/** Whether an exact email sits on the allowlist. */
export async function isStaffEmail(email: string): Promise<boolean> {
  if (!email || !email.includes("@")) return false
  const domains = await loadStaffEmails()
  return domains.includes(email.trim().toLowerCase())
}

/**
 * Throws when a user attempts to declare a role their email cannot hold.
 * The message is surfaced verbatim by the sign-up form. Mirrors the
 * server-side demotion in handle_new_user().
 */
export async function assertRoleAllowed(
  email: string,
  role: SignUpRole,
): Promise<void> {
  if (role !== "lecturer") return
  if (!(await isStaffEmail(email))) {
    throw new Error(
      "Lecturer sign-up requires an allowlisted staff email address. Choose Student instead.",
    )
  }
}

/** Where a role should land after a successful sign-up. */
export function postSignupPath(role: SignUpRole): string {
  return role === "lecturer" ? "/dashboard" : "/onboarding"
}
