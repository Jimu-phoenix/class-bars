import assert from "node:assert/strict"
import { test } from "node:test"
import { filterStudents } from "@/lib/studentSearch"

const base: { student_id: string; full_name: string; registration_number: string | null; checked_in: boolean }[] = [
  { student_id: "s1", full_name: "Alice Smith", registration_number: "REG-001", checked_in: false },
  { student_id: "s2", full_name: "Bob Jones", registration_number: "REG-002", checked_in: true },
  { student_id: "s3", full_name: "Carol O'Connor", registration_number: "REG-003", checked_in: false },
  { student_id: "s4", full_name: "David Lee", registration_number: null, checked_in: false },
]

test("filterStudents returns nothing for empty query", () => {
  assert.deepEqual(filterStudents(base, ""), [])
  assert.deepEqual(filterStudents(base, "   "), [])
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

  // "Carol Smith" should match nothing (no student has both names)
  const result2 = filterStudents(base, "Carol Smith")
  assert.equal(result2.length, 0)
})

test("filterStudents is case-insensitive", () => {
  const result = filterStudents(base, "alice smith")
  assert.equal(result.length, 1)
  assert.equal(result[0].student_id, "s1")
})

test("filterStudents sorts unchecked students first, then by name", () => {
  // "REG" matches s1 (Alice, unchecked), s3 (Carol, unchecked), s2 (Bob, checked).
  // Sorted: unchecked first (s1, s3 by name), then checked (s2).
  const result = filterStudents(base, "REG")
  assert.equal(result.length, 3)
  assert.equal(result[0].student_id, "s1")
  assert.equal(result[1].student_id, "s3")
  assert.equal(result[2].student_id, "s2")
})

test("filterStudents respects limit", () => {
  const result = filterStudents(base, "REG", 2)
  assert.equal(result.length, 2)
})

test("filterStudents includes checked-in students", () => {
  const result = filterStudents(base, "Bob")
  assert.equal(result.length, 1)
  assert.equal(result[0].checked_in, true)
})
