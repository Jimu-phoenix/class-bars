import assert from "node:assert/strict"
import { test } from "node:test"

// verifyAttendancePdf binds `supabase` (= globalThis.__MOCK_SUPABASE__) at
// module-load time, so the mock must be installed before verifyPdf is first
// imported. We therefore dynamic-import it inside each test after installing
// the mock (mutating a persistent object so later installs stay visible).
async function loadWithMock(rpcImpl: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>) {
  if (!globalThis.__MOCK_SUPABASE__) {
    globalThis.__MOCK_SUPABASE__ = {}
  }
  globalThis.__MOCK_SUPABASE__.rpc = rpcImpl
  const mod = await import("../src/lib/registerPdf/verifyPdf.ts")
  return mod.verifyAttendancePdf as typeof import("../src/lib/registerPdf/verifyPdf.ts").verifyAttendancePdf
}

test("verifyAttendancePdf short-circuits malformed codes without calling the DB", async () => {
  let called = false
  const verifyAttendancePdf = await loadWithMock(async () => {
    called = true
    return { data: null, error: null }
  })

  const result = await verifyAttendancePdf("short")
  assert.equal(result.status, "not_found")
  assert.equal(called, false)
})

test("verifyAttendancePdf rejects forbidden characters without calling the DB", async () => {
  let called = false
  const verifyAttendancePdf = await loadWithMock(async () => {
    called = true
    return { data: null, error: null }
  })

  const result = await verifyAttendancePdf("ABC2I4")
  assert.equal(result.status, "not_found")
  assert.equal(called, false)
})

test("verifyAttendancePdf normalises lowercase + spaces before the RPC call", async () => {
  let received: string | null = null
  const verifyAttendancePdf = await loadWithMock(async (_name, params) => {
    received = params.p_code as string
    return {
      data: [{ course_code: "CSC301", course_name: "Data Structures", created_at: "2026-03-10T08:00:00Z" }],
      error: null,
    }
  })

  const result = await verifyAttendancePdf(" abc 234 ")
  assert.equal(result.status, "verified")
  assert.equal(received, "ABC234")
  const verified = result as Extract<typeof result, { status: "verified" }>
  assert.equal(verified.courseCode, "CSC301")
  assert.equal(verified.courseName, "Data Structures")
  assert.equal(verified.createdAt, "2026-03-10T08:00:00Z")
})

test("verifyAttendancePdf returns not_found when the RPC returns no rows", async () => {
  const verifyAttendancePdf = await loadWithMock(async () => ({ data: [], error: null }))
  const result = await verifyAttendancePdf("ZZZZZZ")
  assert.equal(result.status, "not_found")
})

test("verifyAttendancePdf surfaces RPC errors as thrown errors (network/server)", async () => {
  const verifyAttendancePdf = await loadWithMock(async () => ({ data: null, error: new Error("network down") }))
  await assert.rejects(() => verifyAttendancePdf("ABC234"), /network down/)
})

test("verifyAttendancePdf treats a NULL course as still verified (course deleted)", async () => {
  const verifyAttendancePdf = await loadWithMock(async () => ({
    data: [{ course_code: null, course_name: null, created_at: "2026-01-01T00:00:00Z" }],
    error: null,
  }))
  const result = await verifyAttendancePdf("MNX9Q7")
  assert.equal(result.status, "verified")
  const verified = result as Extract<typeof result, { status: "verified" }>
  assert.equal(verified.courseCode, null)
  assert.equal(verified.courseName, null)
})
