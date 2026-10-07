import type { SignUpRole } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"

/**
 * Staff-email allowlist, read from the authoritative DB table
 * `staff_email_domains` (created by migrations/09_role_server_side.sql).
 *
 * Postgres is the single source of truth: `handle_new_user()` enforces the
 * same list when the signup trigger fires, so a hand-rolled
 * `supabase.auth.signUp()` call cannot bypass this. The client check below
 * is UX + a fail-fast guard; the server check is the security boundary.
 *
 * The old `VITE_STAFF_EMAIL_DOMAINS` env var is no longer consulted. To
 * change who may register as a lecturer, INSERT/DELETE rows from that table
 * (via the SQL editor / service_role) and the running app picks it up on
 * the next sign-up attempt.
 */

function domainOf(email: string): string | null {
  const atIndex = email.lastIndexOf("@")
  if (atIndex <= 0 || atIndex === email.length - 1) return null
  return email.slice(atIndex + 1).trim().toLowerCase()
}

async function loadStaffEmailDomains(): Promise<string[]> {
  const { data, error } = await supabase
    .from("staff_email_domains")
    .select("domain")
  if (error) {
    // Fail closed: an unreachable allowlist never accidentally admits a
    // lecturer.
    console.error("staff_email_domains read failed:", error.message)
    return []
  }
  return (data ?? []).map((row) => row.domain.toLowerCase())
}

/** Whether an address sits on an allowlisted staff domain. */
export async function isStaffEmail(email: string): Promise<boolean> {
  const domain = domainOf(email)
  if (!domain) return false
  const domains = await loadStaffEmailDomains()
  return domains.includes(domain)
}

/**
 * Throws when a user attempts to declare a role their address cannot hold.
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
      "Lecturer sign-up requires a staff email address. Choose Student instead.",
    )
  }
}

/** Where a role should land after a successful sign-up. */
export function postSignupPath(role: SignUpRole): string {
  return role === "lecturer" ? "/dashboard" : "/onboarding"
}