import assert from "node:assert/strict"
import { test } from "node:test"
import type { User } from "@supabase/supabase-js"

const VALID_EMBEDDING = JSON.stringify(
  Array.from({ length: 128 }, (_, i) => (i + 1) / 128),
)
const OTHER_EMBEDDING = JSON.stringify(
  Array.from({ length: 128 }, (_, i) => (i + 2) / 128),
)

type Session = { user: Partial<User> } | null

type MockState = {
  session: Session
  signInError: { message: string } | null
  signInCalls: Array<unknown>
  signOutCalls: number
  participants: Array<Record<string, unknown>>
}

const state: MockState = {
  session: null,
  signInError: null,
  signInCalls: [],
  signOutCalls: 0,
  participants: [],
}

function eqFilter(
  rows: Array<Record<string, unknown>>,
  column: string,
  value: unknown,
): Array<Record<string, unknown>> {
  return rows.filter((r) => r[column] === value)
}

function fromMock() {
  const allRows = (state.participants as Array<Record<string, unknown>>) ?? []
  const rows = allRows.slice()

  return {
    select() {
      return {
        eq(column: string, value: unknown) {
          const filtered = eqFilter(rows, column, value)
          return {
            maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
          }
        },
        single: async () => ({ data: rows[0] ?? null, error: null }),
      }
    },
    upsert(row: Record<string, unknown>) {
      return {
        select() {
          return {
            single: async () => {
              const idx = allRows.findIndex((r) => r.participant_id === row.participant_id)
              if (idx >= 0) allRows[idx] = { ...allRows[idx], ...row }
              else allRows.push(row)
              return { data: row, error: null }
            },
          }
        },
      }
    },
    delete() {
      return {
        eq(column: string, value: unknown) {
          for (let i = allRows.length - 1; i >= 0; i--) {
            if (allRows[i][column] === value) allRows.splice(i, 1)
          }
          return { error: null }
        },
      }
    },
  }
}

;(globalThis as Record<string, unknown>).__MOCK_SUPABASE__ = {
  from: () => fromMock(),
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

const {
  SANDBOX_DEFAULTS,
  getSandboxRole,
  joinSandbox,
  leaveSandbox,
  getSandboxParticipant,
  upsertSandboxParticipant,
  deleteSandboxParticipant,
} = await import("../src/lib/sandbox.ts")

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

test("joinSandbox sends role metadata on sign-in", async () => {
  state.session = null
  state.signInError = null
  state.signInCalls = []
  await joinSandbox("sandbox_student")
  assert.equal(state.signInCalls.length, 1)
  const call = state.signInCalls[0] as {
    options: { captchaToken?: string; data?: { role?: string; full_name?: string } }
  }
  assert.equal(call.options.captchaToken, undefined)
  assert.equal(call.options.data?.role, "sandbox_student")
  assert.equal(call.options.data?.full_name, "Sandbox Student")
})

test("joinSandbox maps captcha failures to a helpful hint", async () => {
  state.session = null
  state.signInError = { message: "Captcha verification failed" }
  const result = await joinSandbox("sandbox_student")
  assert.deepEqual(result, {
    ok: false,
    error:
      "Captcha verification failed. Supabase rejected the request because its own captcha protection is enabled — disable Authentication → Sign In / Providers → Captcha (or wire up server-side verification of the reCAPTCHA token) and retry.",
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

test("getSandboxParticipant returns null when no profile exists", async () => {
  state.participants = []
  const p = await getSandboxParticipant("anon-1")
  assert.equal(p, null)
})

test("getSandboxParticipant returns the matching participant", async () => {
  state.participants = [
    { participant_id: "anon-1", display_name: "Alice", embedding: VALID_EMBEDDING },
  ]
  const p = await getSandboxParticipant("anon-1")
  assert.equal(p?.display_name, "Alice")
  assert.equal(p?.embedding, VALID_EMBEDDING)
})

test("getSandboxParticipant ignores other participants", async () => {
  state.participants = [
    { participant_id: "anon-other", display_name: "Bob", embedding: OTHER_EMBEDDING },
  ]
  const p = await getSandboxParticipant("anon-1")
  assert.equal(p, null)
})

test("upsertSandboxParticipant inserts a new participant", async () => {
  state.participants = []
  const p = await upsertSandboxParticipant("anon-1", "Alice", VALID_EMBEDDING)
  assert.equal(p?.participant_id, "anon-1")
  assert.equal(state.participants.length, 1)
})

test("upsertSandboxParticipant rejects an invalid descriptor", async () => {
  await assert.rejects(
    () => upsertSandboxParticipant("anon-1", "Alice", "[1,2,3]"),
    /Invalid face descriptor/,
  )
})

test("upsertSandboxParticipant updates an existing participant", async () => {
  state.participants = [
    { participant_id: "anon-1", display_name: "Old", embedding: OTHER_EMBEDDING },
  ]
  await upsertSandboxParticipant("anon-1", "Alice", VALID_EMBEDDING)
  assert.equal(state.participants.length, 1)
  assert.equal(state.participants[0].display_name, "Alice")
  assert.equal(state.participants[0].embedding, VALID_EMBEDDING)
})

test("deleteSandboxParticipant removes only the target participant", async () => {
  state.participants = [
    { participant_id: "anon-1", display_name: "Alice", embedding: VALID_EMBEDDING },
    { participant_id: "anon-2", display_name: "Bob", embedding: OTHER_EMBEDDING },
  ]
  await deleteSandboxParticipant("anon-1")
  assert.deepEqual(state.participants.map((p) => p.participant_id), ["anon-2"])
})
