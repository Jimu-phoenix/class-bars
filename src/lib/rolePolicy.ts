import type { SignUpRole } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"

// Lecturer email allowlist from DB table `staff_emails`. Postgres is the
// single source of truth: `handle_new_user()` enforces the same list.
let staffEmailsCache: string[] | null = null

async function loadStaffEmails(): Promise<string[]> {
  if (staffEmailsCache) return staffEmailsCache
  const { data, error } = await supabase.from("staff_emails").select("email")
  if (error) {
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

export function postSignupPath(role: SignUpRole): string {
  return role === "lecturer" ? "/dashboard" : "/onboarding"
}
