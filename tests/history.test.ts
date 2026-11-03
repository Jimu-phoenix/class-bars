import assert from "node:assert/strict"
import { test } from "node:test"
import {
  lecturerStatusCode,
  studentResultLabel,
  methodLabel,
  summariseHistory,
  makeRequestGuard,
  filterStudents,
} from "@/lib/history"
import type { MyHistoryRow, StudentListRow } from "@/types/db"

const row = (overrides: Partial<MyHistoryRow> = {}): MyHistoryRow => ({
  session_id: "s1",
  session_start: "2026-01-01T09:00:00Z",
  session_status: "completed",
  result: "present",
  ...overrides,
})

const student = (overrides: Partial<StudentListRow> = {}): StudentListRow => ({
  student_id: "s1",
  full_name: "Alice Smith",
  registration_number: "REG-001",
  course_codes: ["CSC-101"],
  ...overrides,
})

test("summariseHistory counts present-like and ended sessions", () => {
  const rows = [
    row({ result: "present", session_status: "completed" }),
    row({ result: "late", session_status: "completed" }),
    row({ result: "flagged", session_status: "completed" }),
    row({ result: "absent", session_status: "completed" }),
    row({ result: "upcoming", session_status: "scheduled" }),
    row({ result: "live", session_status: "ongoing" }),
  ]
  assert.deepEqual(summariseHistory(rows), { present: 3, ended: 4 })
})

test("summariseHistory is empty for no rows", () => {
  assert.deepEqual(summariseHistory([]), { present: 0, ended: 0 })
})

test("lecturerStatusCode maps register codes", () => {
  assert.equal(lecturerStatusCode("present"), "pr")
  assert.equal(lecturerStatusCode("late"), "pr")
  assert.equal(lecturerStatusCode("flagged"), "prf")
  assert.equal(lecturerStatusCode("absent"), "ab")
  assert.equal(lecturerStatusCode("upcoming"), null)
  assert.equal(lecturerStatusCode("live"), null)
  assert.equal(lecturerStatusCode(null), null)
})

test("studentResultLabel maps labels", () => {
  assert.equal(studentResultLabel("present"), "Present")
  assert.equal(studentResultLabel("late"), "Late")
  assert.equal(studentResultLabel("flagged"), "Present (under review)")
  assert.equal(studentResultLabel("absent"), "Absent")
  assert.equal(studentResultLabel("upcoming"), "Upcoming")
  assert.equal(studentResultLabel("live"), "Live")
  assert.equal(studentResultLabel(null), null)
})

test("methodLabel maps methods", () => {
  assert.equal(methodLabel("face"), "Face")
  assert.equal(methodLabel("otp"), "OTP")
  assert.equal(methodLabel("manual"), "Manual")
  assert.equal(methodLabel(null), null)
  assert.equal(methodLabel(undefined), null)
})

test("makeRequestGuard tracks and invalidates stale requests", () => {
  const guard = makeRequestGuard()
  const first = guard.next()
  const second = guard.next()
  assert.equal(guard.isStale(first), true)
  assert.equal(guard.isStale(second), false)
  const third = guard.next()
  assert.equal(guard.isStale(second), true)
  assert.equal(guard.isStale(third), false)
})

const base: StudentListRow[] = [
  student({ student_id: "s1", full_name: "Alice Smith", registration_number: "REG-001" }),
  student({ student_id: "s2", full_name: "Bob Jones", registration_number: "REG-002" }),
  student({ student_id: "s3", full_name: "Carol O'Connor", registration_number: "REG-003" }),
  student({ student_id: "s4", full_name: "David Lee", registration_number: null }),
]

test("filterStudents returns the whole list for empty query", () => {
  assert.deepEqual(filterStudents(base, ""), base)
  assert.deepEqual(filterStudents(base, "   "), base)
})

test("filterStudents matches by full name", () => {
  const result = filterStudents(base, "Alice")
  assert.equal(result.length, 1)
  assert.equal(result[0].student_id, "s1")
})

test("filterStudents matches by registration number", () => {
  const result = filterStudents(base, "REG-002")
  assert.equal(result.length, 1)
  assert.equal(result[0].student_id, "s2")
})

test("filterStudents matches partial registration number", () => {
  const result = filterStudents(base, "REG-00")
  assert.equal(result.length, 3)
})

test("filterStudents matches multi-word names (every word must match)", () => {
  const result = filterStudents(base, "Carol O'Connor")
  assert.equal(result.length, 1)
  assert.equal(result[0].student_id, "s3")

  const result2 = filterStudents(base, "Carol Smith")
  assert.equal(result2.length, 0)
})

test("filterStudents is case-insensitive", () => {
  const result = filterStudents(base, "alice smith")
  assert.equal(result.length, 1)
  assert.equal(result[0].student_id, "s1")
})

test("filterStudents matches name or registration number", () => {
  const result = filterStudents(base, "REG-001")
  assert.equal(result.length, 1)
  assert.equal(result[0].student_id, "s1")

  const result2 = filterStudents(base, "David")
  assert.equal(result2.length, 1)
  assert.equal(result2[0].student_id, "s4")
})

test("filterStudents returns empty when nothing matches", () => {
  const result = filterStudents(base, "Zzzz")
  assert.equal(result.length, 0)
})
