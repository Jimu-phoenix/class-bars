export const CONSENT_VERSION = '2026-11-v1'

export const DATA_CONTACT_EMAIL = 'bis22-pjimu@mubas.ac.mw'

export type ProfileWithConsent = {
  id: string
  full_name: string
  role: string
  student_number: string | null
  consent_given_at: string | null
  consent_version: string | null
  created_at: string
  updated_at: string
}

/** True when consent is recorded AND matches the current version. */
export function hasCurrentConsent(profile: ProfileWithConsent | null | undefined): boolean {
  if (!profile) return false
  if (!profile.consent_given_at) return false
  return profile.consent_version === CONSENT_VERSION
}

/** True when any consent has been recorded (even an older version). */
export function hasAnyConsent(profile: ProfileWithConsent | null | undefined): boolean {
  if (!profile) return false
  return !!profile.consent_given_at
}

/** True when the profile can use face (consent recorded, any version). */
export function canUseFace(profile: ProfileWithConsent | null | undefined): boolean {
  return hasAnyConsent(profile)
}

/** True when the consent card should be shown (missing or stale version). */
export function needsConsent(profile: ProfileWithConsent | null | undefined): boolean {
  return !hasCurrentConsent(profile)
}

/** Format a consent timestamp for display. */
export function formatConsentDate(isoString: string | null): string {
  if (!isoString) return ''
  return new Date(isoString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
