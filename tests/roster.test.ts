import assert from "node:assert/strict"
import { test } from "node:test"

type RpcCall = { fn: string; params: unknown }

type MockState = {
  calls: RpcCall[]
  data: unknown
  error: { message: string } | null
}

const state: MockState = {
  calls: [],
  data: [],
  error: null,
}

;(globalThis as Record<string, unknown>).__MOCK_SUPABASE__ = {
  rpc: async (fn: string, params: unknown) => {
    state.calls.push({ fn, params })
    if (state.error) return { data: null, error: state.error }
    return { data: state.data, error: null }
  },
}

const { getLecturerRoster } = await import("../src/lib/realAttendance.ts")

function resetMock() {
  state.calls = []
  state.data = []
  state.error = null
}

test("getLecturerRoster calls the roster RPC with a null course filter", async () => {
  resetMock()
  state.data = [
    {
      course_id: "c1",
      course_code: "CSC301",
      course_name: "Data Structures",
      student_id: "st1",
      student_name: "Alice",
      student_number: "A001",
      academic_year: "2025",
      semester: "Semester 1",
      enrolled_at: "2025-09-01T00:00:00Z",
    },
  ]
  const rows = await getLecturerRoster()
  assert.equal(rows.length, 1)
  assert.equal(rows[0].student_name, "Alice")
  assert.deepEqual(state.calls, [
    { fn: "get_lecturer_roster", params: { p_course_id: null } },
  ])
})

test("getLecturerRoster forwards an explicit course id", async () => {
  resetMock()
  await getLecturerRoster("course-123")
  assert.deepEqual(state.calls, [
    { fn: "get_lecturer_roster", params: { p_course_id: "course-123" } },
  ])
})

test("getLecturerRoster returns an empty array when the payload is null", async () => {
  resetMock()
  state.data = null
  const rows = await getLecturerRoster()
  assert.deepEqual(rows, [])
})

test("getLecturerRoster throws when the RPC errors", async () => {
  resetMock()
  state.error = { message: "Only the course lecturer can view its roster" }
  const err = await getLecturerRoster("course-123").then(
    () => null,
    (e: unknown) => e as { message?: string },
  )
  assert.match(err?.message ?? "", /Only the course lecturer/)
})
