import assert from "node:assert/strict"
import { test } from "node:test"
import {
  REGISTER_MAX_SESSIONS,
  REGISTER_MIN_SESSIONS,
  buildRegisterMatrix,
  cellForStatus,
  type RegisterRpcRow,
} from "../src/lib/registerPdf/buildRegisterMatrix.ts"

const SESSION_1 = "11111111-1111-4111-8111-111111111111"
const SESSION_2 = "22222222-2222-4222-8222-222222222222"
const SESSION_3 = "33333333-3333-4333-8333-333333333333"

function row(
  sessionId: string,
  start: string,
  name: string | null,
  number: string | null,
  status: RegisterRpcRow["status"],
): RegisterRpcRow {
  return {
    session_id: sessionId,
    session_start: start,
    full_name: name,
    registration_number: number,
    status,
  }
}

test("register limits and status codes match the PDF legend", () => {
  assert.equal(REGISTER_MIN_SESSIONS, 2)
  assert.equal(REGISTER_MAX_SESSIONS, 8)
  assert.equal(cellForStatus("present"), "pr")
  assert.equal(cellForStatus("late"), "pr")
  assert.equal(cellForStatus("absent"), "ab")
  assert.equal(cellForStatus("flagged"), "prf")
  assert.equal(cellForStatus(null), "ab")
  assert.equal(cellForStatus(undefined), "ab")
})

test("matrix maps statuses, fills missing rows as absent and sorts", () => {
  const matrix = buildRegisterMatrix([
    row(SESSION_2, "2026-03-10T08:00:00Z", "Ada Lovelace", "STU10", "late"),
    row(SESSION_1, "2026-03-03T08:00:00Z", "Ada Lovelace", "STU10", "present"),
    row(SESSION_1, "2026-03-03T08:00:00Z", "Grace Hopper", "STU2", "flagged"),
    row(SESSION_2, "2026-03-10T08:00:00Z", "Grace Hopper", "STU2", "absent"),
    row(SESSION_1, "2026-03-03T08:00:00Z", "Linus Torvalds", "STU1", null),
  ])

  assert.deepEqual(
    matrix.sessions.map((session) => session.id),
    [SESSION_1, SESSION_2],
  )
  assert.deepEqual(
    matrix.students.map((student) => student.registrationNumber),
    ["STU1", "STU2", "STU10"],
  )
  assert.deepEqual(matrix.cells, [
    ["ab", "ab"],
    ["prf", "ab"],
    ["pr", "pr"],
  ])
})

test("a row without an attendance record is absent", () => {
  const matrix = buildRegisterMatrix([
    row(SESSION_1, "2026-03-03T08:00:00Z", "Ada Lovelace", "STU10", null),
    row(SESSION_2, "2026-03-10T08:00:00Z", "Ada Lovelace", "STU10", "present"),
  ])

  assert.deepEqual(matrix.cells, [["ab", "pr"]])
})

test("the latest duplicate row wins", () => {
  const matrix = buildRegisterMatrix([
    row(SESSION_1, "2026-03-03T08:00:00Z", "Ada Lovelace", "STU10", "present"),
    row(SESSION_2, "2026-03-10T08:00:00Z", "Ada Lovelace", "STU10", "present"),
    row(SESSION_1, "2026-03-03T08:00:00Z", "Ada Lovelace", "STU10", "flagged"),
  ])

  assert.deepEqual(matrix.cells, [["prf", "pr"]])
})

test("an empty course with two session sentinels still renders a valid matrix", () => {
  const matrix = buildRegisterMatrix([
    row(SESSION_1, "2026-03-03T08:00:00Z", null, null, null),
    row(SESSION_2, "2026-03-10T08:00:00Z", null, null, null),
  ])

  assert.equal(matrix.sessions.length, 2)
  assert.deepEqual(matrix.students, [])
  assert.deepEqual(matrix.cells, [])
})

test("the builder rejects fewer than two or more than eight unique sessions", () => {
  assert.throws(
    () =>
      buildRegisterMatrix([
        row(SESSION_1, "2026-03-03T08:00:00Z", "Ada", "STU1", "present"),
      ]),
    /2 to 8 sessions/,
  )

  assert.throws(
    () =>
      buildRegisterMatrix([
        row(SESSION_1, "2026-03-03T08:00:00Z", "Ada", "STU1", "present"),
        row(SESSION_1, "2026-03-03T08:00:00Z", "Ada", "STU1", "present"),
      ]),
    /2 to 8 sessions/,
  )

  const tooMany = Array.from({ length: 9 }, (_, index) =>
    row(
      `00000000-0000-4000-8000-00000000000${index}`,
      `2026-03-0${index + 1}T08:00:00Z`,
      "Ada",
      "STU1",
      "present",
    ),
  )
  assert.throws(() => buildRegisterMatrix(tooMany), /2 to 8 sessions/)
})

test("students without a registration number sort last and use a dash", () => {
  const matrix = buildRegisterMatrix([
    row(SESSION_1, "2026-03-03T08:00:00Z", "Zed", null, "present"),
    row(SESSION_1, "2026-03-03T08:00:00Z", "Ada", "STU1", "present"),
    row(SESSION_2, "2026-03-10T08:00:00Z", "Zed", null, "present"),
    row(SESSION_2, "2026-03-10T08:00:00Z", "Ada", "STU1", "present"),
  ])

  assert.deepEqual(
    matrix.students.map((student) => student.fullName),
    ["Ada", "Zed"],
  )
  assert.equal(matrix.students[1].registrationNumber, "")
})

test("session rows are ordered by start time then id", () => {
  const matrix = buildRegisterMatrix([
    row(SESSION_2, "2026-03-10T08:00:00Z", null, null, null),
    row(SESSION_3, "2026-03-03T08:00:00Z", null, null, null),
    row(SESSION_1, "2026-03-03T08:00:00Z", null, null, null),
  ])

  assert.deepEqual(
    matrix.sessions.map((session) => session.id),
    [SESSION_1, SESSION_3, SESSION_2],
  )
})
