import assert from "node:assert/strict"
import { test } from "node:test"

type DomainsState = {
  domains: Array<Record<string, unknown>>
  selectError: { message: string } | null
}

const state: DomainsState = {
  domains: [{ domain: "mubas.ac.mw" }],
  selectError: null,
}

;(globalThis as Record<string, unknown>).__MOCK_SUPABASE__ = {
  from() {
    return {
      select() {
        return {
          then: async (
            resolve: (value: { data: unknown[] | null; error: unknown }) => void,
          ) => {
            if (state.selectError) {
              return resolve({ data: null, error: state.selectError })
            }
            return resolve({ data: state.domains, error: null })
          },
        }
      },
    }
  },
}

const { assertRoleAllowed, isStaffEmail, postSignupPath } = await import(
  "../src/lib/rolePolicy.ts"
)

test("isStaffEmail matches a domain listed in the DB allowlist", async () => {
  assert.equal(await isStaffEmail("ada@mubas.ac.mw"), true)
})

test("isStaffEmail is case-insensitive on the domain", async () => {
  assert.equal(await isStaffEmail("ADA@MUBAS.AC.MW"), true)
})

test("isStaffEmail rejects personal/foreign addresses and malformed inputs", async () => {
  assert.equal(await isStaffEmail("ada@example.com"), false)
  assert.equal(await isStaffEmail("not-an-email"), false)
  assert.equal(await isStaffEmail("@mubas.ac.mw"), false)
  assert.equal(await isStaffEmail("ada@"), false)
})

test("isStaffEmail fails closed when the allowlist cannot be read", async () => {
  state.selectError = { message: "Network unreachable" }
  assert.equal(await isStaffEmail("ada@mubas.ac.mw"), false)
  state.selectError = null
})

test("assertRoleAllowed permits students anywhere without a DB round-trip", async () => {
  let queried = false
  const originalFrom = (globalThis as Record<string, unknown>).__MOCK_SUPABASE__
    ?.from
  ;(globalThis as Record<string, unknown>).__MOCK_SUPABASE__ = {
    from: () => {
      queried = true
      throw new Error("must not be called")
    },
  }
  await assertRoleAllowed("ada@example.com", "student")
  assert.equal(queried, false)
  ;(globalThis as Record<string, unknown>).__MOCK_SUPABASE__ = { from: originalFrom } as never
})

test("assertRoleAllowed rejects a lecturer on a non-allowlisted domain", async () => {
  await assert.rejects(
    () => assertRoleAllowed("ada@example.com", "lecturer"),
    /Lecturer sign-up requires a staff email address/,
  )
})

test("assertRoleAllowed accepts a lecturer on an allowlisted domain", async () => {
  await assert.doesNotReject(() =>
    assertRoleAllowed("ada@mubas.ac.mw", "lecturer"),
  )
})

test("postSignupPath sends lecturers to the dashboard, everyone else to onboarding", () => {
  assert.equal(postSignupPath("lecturer"), "/dashboard")
  assert.equal(postSignupPath("student"), "/onboarding")
})