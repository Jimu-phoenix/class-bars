import assert from "node:assert/strict"
import { test } from "node:test"
import {
  CONSENT_VERSION,
  DATA_CONTACT_EMAIL,
  canUseFace,
  hasAnyConsent,
  hasCurrentConsent,
  needsConsent,
  formatConsentDate,
} from "@/lib/consent"

const baseProfile = {
  id: "00000000-0000-4000-8000-000000000001",
  full_name: "Test Student",
  role: "student" as const,
  student_number: "STU-001",
  phone_number: null,
  consent_given_at: null as string | null,
  consent_version: null as string | null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

test("CONSENT_VERSION is set", () => {
  assert.equal(CONSENT_VERSION, "2026-11-v1")
})

test("DATA_CONTACT_EMAIL is set", () => {
  assert.equal(DATA_CONTACT_EMAIL, "bis22-pjimu@gmail.com")
})

test("hasCurrentConsent returns false for null profile", () => {
  assert.equal(hasCurrentConsent(null), false)
  assert.equal(hasCurrentConsent(undefined), false)
})

test("hasCurrentConsent returns false when no consent recorded", () => {
  assert.equal(hasCurrentConsent(baseProfile), false)
})

test("hasCurrentConsent returns true when consent matches current version", () => {
  const profile = { ...baseProfile, consent_given_at: "2026-11-01T00:00:00Z", consent_version: CONSENT_VERSION }
  assert.equal(hasCurrentConsent(profile), true)
})

test("hasCurrentConsent returns false when consent version is stale", () => {
  const profile = { ...baseProfile, consent_given_at: "2026-01-01T00:00:00Z", consent_version: "2026-01-v1" }
  assert.equal(hasCurrentConsent(profile), false)
})

test("hasAnyConsent returns false when no consent recorded", () => {
  assert.equal(hasAnyConsent(baseProfile), false)
})

test("hasAnyConsent returns true when consent recorded (any version)", () => {
  const profile = { ...baseProfile, consent_given_at: "2026-01-01T00:00:00Z", consent_version: "2026-01-v1" }
  assert.equal(hasAnyConsent(profile), true)
})

test("canUseFace returns false when no consent", () => {
  assert.equal(canUseFace(baseProfile), false)
})

test("canUseFace returns true when consent recorded (any version)", () => {
  const profile = { ...baseProfile, consent_given_at: "2026-01-01T00:00:00Z", consent_version: "2026-01-v1" }
  assert.equal(canUseFace(profile), true)
})

test("needsConsent returns true when no consent", () => {
  assert.equal(needsConsent(baseProfile), true)
})

test("needsConsent returns false when current consent", () => {
  const profile = { ...baseProfile, consent_given_at: "2026-11-01T00:00:00Z", consent_version: CONSENT_VERSION }
  assert.equal(needsConsent(profile), false)
})

test("needsConsent returns true when stale consent", () => {
  const profile = { ...baseProfile, consent_given_at: "2026-01-01T00:00:00Z", consent_version: "2026-01-v1" }
  assert.equal(needsConsent(profile), true)
})

test("formatConsentDate returns empty string for null", () => {
  assert.equal(formatConsentDate(null), "")
})

test("formatConsentDate formats a date", () => {
  const result = formatConsentDate("2026-11-01T00:00:00Z")
  assert.ok(result.includes("2026"))
  assert.ok(result.includes("November"))
})

test("needsConsent returns true for null/undefined profile", () => {
  assert.equal(needsConsent(null), true)
  assert.equal(needsConsent(undefined), true)
})

test("canUseFace returns false for null/undefined profile", () => {
  assert.equal(canUseFace(null), false)
  assert.equal(canUseFace(undefined), false)
})
