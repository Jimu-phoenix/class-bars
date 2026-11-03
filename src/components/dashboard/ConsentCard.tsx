import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import {
  CONSENT_VERSION,
  DATA_CONTACT_EMAIL,
  formatConsentDate,
  hasAnyConsent,
  needsConsent,
} from "@/lib/consent"
import { recordConsent } from "@/lib/account"
import { Button } from "@/components/ui/button"
import type { ProfileRow } from "@/types/db"

type ConsentCardProps = {
  onConsentRecorded?: () => void
}

export default function ConsentCard({ onConsentRecorded }: ConsentCardProps) {
  const { user } = useAuth()
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [agreed, setAgreed] = useState(false)

  const loadProfile = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError("")
    try {
      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select("id, full_name, role, student_number, phone_number, consent_given_at, consent_version, created_at, updated_at")
        .eq("id", user.id)
        .maybeSingle()
      if (fetchError) {
        setError("Failed to load profile")
      } else if (data) {
        setProfile(data as ProfileRow)
      }
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!user) {
        setLoading(false)
        return
      }
      void loadProfile()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [user, loadProfile])

  const handleAgreeChange = (checked: boolean) => {
    setAgreed(checked)
    setError("")
  }

  const handleConsent = async () => {
    if (!user) return
    setError("")
    setSubmitting(true)
    try {
      await recordConsent(CONSENT_VERSION)
      setAgreed(false)
      void loadProfile()
      onConsentRecorded?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record consent")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Loading consent status…</span>
        </div>
      </section>
    )
  }

  // No consent needed: show recorded state (if any consent was ever given).
  if (profile && !needsConsent(profile)) {
    return (
      <section
        aria-labelledby="consent-recorded-heading"
        className="rounded-xl border border-border bg-green-50/5 p-4 sm:p-5"
      >
        <h2 id="consent-recorded-heading" className="text-base font-semibold text-green-900">
          Consent recorded
        </h2>
        <p className="mt-1 text-sm text-green-800">
          Consent recorded on {formatConsentDate(profile.consent_given_at)}.
        </p>
        <p className="mt-1 text-sm text-green-800">
          To withdraw consent, delete your account in the Danger zone.
        </p>
      </section>
    )
  }

  // Consent needed (missing or stale version).
  return (
    <section
      aria-labelledby="consent-heading"
      className="rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <h2 id="consent-heading" className="text-base font-semibold">
        Consent to data processing
      </h2>

      <div className="mt-3 text-sm text-muted-foreground leading-relaxed">
        <p>
          Class-BARS records class attendance using face verification. To do this,
          it needs your permission to process and store the following personal data:
        </p>

        <p className="mt-2">
          Class-BARS follows the principles of the Malawi Data Protection Act, 2024
          (DPA 2024): your data is collected for a specific purpose, limited to what
          is needed, protected, kept only as long as necessary, and you stay in
          control of it.
        </p>

        <h3 className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wider">
          What we process and store
        </h3>
        <ul className="list-disc pl-5 mt-1 text-sm text-muted-foreground space-y-1">
          <li>
            Your name, student number and email address
          </li>
          <li>
            A face template: a list of 128 numbers calculated from your face. We do
            not store photos or video of you, and the camera image is not saved or
            sent from your device.
          </li>
          <li>
            Your attendance records: course, session, time, and how you checked in
            (face or OTP)
          </li>
          <li>
            For face check-ins, a match score from the face comparison, which
            lecturers see only as a rounded percentage
          </li>
          <li>
            For location checks, only how far you were from the classroom boundary
            and the accuracy your device reported. Your exact coordinates are not
            stored.
          </li>
        </ul>

        <h3 className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wider">
          Why
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          This data is used only to confirm that you attended class and to let your
          lecturer and the administrator review attendance and flagged records. It
          is not used for any other purpose.
        </p>

        <h3 className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wider">
          Who can see it
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Your lecturers can see your name, student number and attendance for their
          courses. Administrators can review flagged records and audit logs. Face
          templates are not shown to lecturers or other students. Data is stored in
          a managed cloud database (Supabase) and protected by access controls.
        </p>

        <h3 className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wider">
          Automated decisions
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          The system compares your face with your template and decides automatically
          whether to accept the check-in, flag it for review, or ask you to try
          again. If face check-in doesn&rsquo;t work for you, you can use the one-time
          passcode (OTP) fallback, and your lecturer can mark you present manually.
        </p>

        <h3 className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wider">
          How long we keep it
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Until you delete your account. When you do, your face template and
          personal details are permanently deleted, and your past attendance entries
          are kept without any link to you.
        </p>

        <h3 className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wider">
          Your rights
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Consenting is voluntary, but face check-in cannot be used without it. You
          have the right to delete your account and data whenever you no longer want
          to use the system (see &ldquo;Danger zone&rdquo; below). Questions or
          requests about your data:{""}
          <a
            href={`mailto:${DATA_CONTACT_EMAIL}`}
            className="text-primary underline"
          >
            {DATA_CONTACT_EMAIL}
          </a>
          .
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => handleAgreeChange(e.target.checked)}
          className="rounded border-gray-300 text-primary focus:ring-primary"
        />
        <label className="text-sm text-muted-foreground cursor-pointer select-none">
          I have read the above. I consent to Class-BARS processing and storing my
          face template and personal data for attendance verification.
        </label>
      </div>

      <Button
        onClick={handleConsent}
        disabled={submitting || !agreed}
        className="mt-3 h-11"
      >
        {submitting ? (
          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="mr-2 size-4" aria-hidden="true" />
        )}
        I consent
      </Button>

      {profile && hasAnyConsent(profile) && needsConsent(profile) && (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          Your consent is out of date. Please re-consent to continue using face
          check-in.
        </p>
      )}
    </section>
  )
}
