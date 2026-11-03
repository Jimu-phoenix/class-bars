import { supabase } from "@/lib/supabase"

export class AccountError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = "AccountError"
    this.code = code
  }
}

function parseAccountError(error: unknown): AccountError {
  if (error instanceof Error) {
    // Map known server error codes to stable client codes.
    const msg = error.message
    if (/consent_required/i.test(msg)) {
      return new AccountError("Consent required before face check-in.", "consent_required")
    }
    if (/consent columns cannot be set directly/i.test(msg)) {
      return new AccountError("Consent cannot be set directly.", "consent_direct")
    }
    if (/invalid_consent_version/i.test(msg)) {
      return new AccountError("Invalid consent version.", "invalid_consent_version")
    }
    if (/Only students can record consent/i.test(msg)) {
      return new AccountError("Only students can record consent.", "not_student")
    }
    if (/Only students can delete their account/i.test(msg)) {
      return new AccountError("Only students can delete their account.", "not_student")
    }
    if (/Not authenticated/i.test(msg)) {
      return new AccountError("Not authenticated.", "not_authenticated")
    }
    return new AccountError(msg, "server_error")
  }
  return new AccountError("An unexpected error occurred.", "server_error")
}

export async function recordConsent(version: string): Promise<void> {
  const { error } = await supabase.rpc("record_consent", { p_version: version })
  if (error) throw parseAccountError(error)
}

export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.rpc("delete_my_account", {})
  if (error) throw parseAccountError(error)
  // Sign out locally so the session ends client-side.
  await supabase.auth.signOut()
}
