import assert from "node:assert/strict"
import { test } from "node:test"
import type { User } from "@supabase/supabase-js"

type Session = { user: Partial<User> } | null

type MockState = {
  session: Session
  signInError: { message: string } | null
  signInCalls: Array<unknown>
  signOutCalls: number
}

const state: MockState = {
  session: null,
  signInError: null,
  signInCalls: [],
  signOutCalls: 0,
}

;(globalThis as Record<string, unknown>).__MOCK_SUPABASE__ = {
  auth: {
    getSession: async () => ({ data: { session: state.session } }),
    signOut: async () => {
      state.signOutCalls++
      state.session = null
    },
    signInAnonymously: async (options: unknown) => {
      state.signInCalls.push(options)
      if (state.signInError) return { error: state.signInError }
      const opts = options as {
        options?: { data?: { role?: string; full_name?: string }; captchaToken?: string }
      }
      state.session = {
        user: { id: "anon-1", user_metadata: opts.options?.data ?? {} },
      }
      return { data: { session: state.session }, error: null }
    },
  },
}

const { SANDBOX_DEFAULTS, getSandboxRole, joinSandbox, leaveSandbox } = await import(
  "../src/lib/sandbox.ts"
)

function makeUser(metadata: Record<string, unknown>): User {
  return { user_metadata: metadata } as unknown as User
}

test("SANDBOX_DEFAULTS match the spec labels", () => {
  assert.deepEqual(SANDBOX_DEFAULTS, {
    classLabel: "Sandbox / Test Class",
    courseLabel: "Sandbox / Test Course",
    venueLabel: "Sandbox / Test Venue",
  })
})

test("getSandboxRole returns valid sandbox roles", () => {
  assert.equal(getSandboxRole(makeUser({ role: "sandbox_lecturer" })), "sandbox_lecturer")
  assert.equal(getSandboxRole(makeUser({ role: "sandbox_student" })), "sandbox_student")
})

test("getSandboxRole rejects non-sandbox roles and missing users", () => {
  assert.equal(getSandboxRole(makeUser({ role: "authenticated" })), null)
  assert.equal(getSandboxRole(makeUser({})), null)
  assert.equal(getSandboxRole(null), null)
})

test("joinSandbox reuses an existing session with the same role", async () => {
  state.session = { user: makeUser({ role: "sandbox_lecturer" }) }
  state.signInCalls = []
  state.signOutCalls = 0
  const result = await joinSandbox("sandbox_lecturer")
  assert.deepEqual(result, { ok: true })
  assert.equal(state.signInCalls.length, 0)
  assert.equal(state.signOutCalls, 0)
})

test("joinSandbox signs out and re-authenticates when switching roles", async () => {
  state.session = { user: makeUser({ role: "sandbox_student" }) }
  state.signInCalls = []
  state.signOutCalls = 0
  const result = await joinSandbox("sandbox_lecturer")
  assert.deepEqual(result, { ok: true })
  assert.equal(state.signOutCalls, 1)
  assert.equal(state.signInCalls.length, 1)
})

test("joinSandbox sends role metadata and captcha token on sign-in", async () => {
  state.session = null
  state.signInError = null
  state.signInCalls = []
  await joinSandbox("sandbox_student", "captcha-token-123")
  assert.equal(state.signInCalls.length, 1)
  const call = state.signInCalls[0] as {
    options: { captchaToken?: string; data?: { role?: string; full_name?: string } }
  }
  assert.equal(call.options.captchaToken, "captcha-token-123")
  assert.equal(call.options.data?.role, "sandbox_student")
  assert.equal(call.options.data?.full_name, "Sandbox Student")
})

test("joinSandbox maps captcha failures to a helpful hint", async () => {
  state.session = null
  state.signInError = { message: "Captcha verification failed" }
  const result = await joinSandbox("sandbox_student", "bad-token")
  assert.deepEqual(result, {
    ok: false,
    error:
      "hCaptcha verification failed or was not completed. Solve the captcha and retry — if it keeps failing, check that VITE_HCAPTCHA_SITEKEY is set in .env.",
  })
})

test("joinSandbox maps anonymous-disabled errors to setup instructions", async () => {
  state.session = null
  state.signInError = { message: "Anonymous sign-ins are disabled" }
  const result = await joinSandbox("sandbox_student")
  assert.deepEqual(result, {
    ok: false,
    error:
      "Anonymous sign-ins are disabled on this Supabase project. Enable them in Supabase Dashboard → Authentication → Sign In / Providers → Anonymous, then retry.",
  })
})

test("joinSandbox passes other errors through unchanged", async () => {
  state.session = null
  state.signInError = { message: "Network unreachable" }
  const result = await joinSandbox("sandbox_lecturer")
  assert.deepEqual(result, { ok: false, error: "Network unreachable" })
})

test("leaveSandbox signs the anonymous session out", async () => {
  state.session = { user: makeUser({ role: "sandbox_student" }) }
  state.signOutCalls = 0
  await leaveSandbox()
  assert.equal(state.signOutCalls, 1)
  assert.equal(state.session, null)
})
