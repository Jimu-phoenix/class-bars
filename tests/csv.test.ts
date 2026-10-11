import assert from "node:assert/strict"
import { test } from "node:test"
import {
  buildAttendanceCsv,
  escapeCsv,
  sanitizeFilename,
  toCsv,
} from "../src/lib/csv.ts"
import type { CourseAttendanceRow } from "../src/lib/realAttendance.ts"

function row(
  overrides: Partial<CourseAttendanceRow>
): CourseAttendanceRow {
  return {
    session_id: "s1",
    session_start: "2025-09-01T09:00:00Z",
    student_id: "st1",
    student_name: "Alice",
    student_number: "A001",
    method: "face",
    status: "present",
    check_in_time: "2025-09-01T09:01:00Z",
    confidence_score: 0.96,
    ...overrides,
  }
}

test("escapeCsv leaves plain values unquoted", () => {
  assert.equal(escapeCsv("Alice"), "Alice")
  assert.equal(escapeCsv(5), "5")
  assert.equal(escapeCsv(null), "")
  assert.equal(escapeCsv(undefined), "")
})

test("escapeCsv quotes commas, quotes and newlines", () => {
  assert.equal(escapeCsv("A, B"), '"A, B"')
  assert.equal(escapeCsv('say "hi"'), '"say ""hi"""')
  assert.equal(escapeCsv("line1\nline2"), '"line1\nline2"')
})

test("toCsv joins headers and rows with CRLF", () => {
  const csv = toCsv(["A", "B"], [["x", "y,1"], ["m", "n"]])
  assert.equal(csv, 'A,B\r\nx,"y,1"\r\nm,n')
})

test("buildAttendanceCsv produces Name, Reg#, one column per session", () => {
  const rows: CourseAttendanceRow[] = [
    row({ session_id: "s2", session_start: "2025-09-02T09:00:00Z", student_id: "st2", student_name: "Bobby", student_number: "B002", status: "absent", method: null, confidence_score: null }),
    row({ session_id: "s1", session_start: "2025-09-01T09:00:00Z", status: "present" }),
    row({ session_id: "s2", session_start: "2025-09-02T09:00:00Z", status: "late", confidence_score: 0.5 }),
  ]
  const { headers, body } = buildAttendanceCsv(rows)
  assert.deepEqual(headers.slice(0, 2), ["Student Name", "Reg. #"])
  assert.equal(headers.length, 4)
  assert.equal(body.length, 2)
  const alice = body.find((r) => r[0] === "Alice")
  assert.deepEqual(alice, ["Alice", "A001", "Present (96%)", "Late (50%)"])
  const bobby = body.find((r) => r[0] === "Bobby")
  assert.deepEqual(bobby, ["Bobby", "B002", "Absent", "Absent"])
})

test("buildAttendanceCsv sorts sessions chronologically and students by name", () => {
  const rows: CourseAttendanceRow[] = [
    row({ session_id: "s2", session_start: "2025-09-02T09:00:00Z", student_id: "st2", student_name: "Bo" }),
    row({ session_id: "s1", session_start: "2025-09-01T09:00:00Z", student_id: "st1", student_name: "Al" }),
  ]
  const { headers, body } = buildAttendanceCsv(rows)
  assert.equal(headers[2].includes("2025-09-01"), true)
  assert.equal(headers[3].includes("2025-09-02"), true)
  assert.equal(body[0][0], "Al")
  assert.equal(body[1][0], "Bo")
})

test("sanitizeFilename replaces path-unfriendly characters", () => {
  assert.equal(sanitizeFilename("CS 101 & stuff"), "CS_101_stuff")
  assert.equal(sanitizeFilename("attendance_CSC101_2025-09-01.csv"), "attendance_CSC101_2025-09-01.csv")
})