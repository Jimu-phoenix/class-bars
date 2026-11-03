import assert from "node:assert/strict"
import { test } from "node:test"
import {
  lecturerStatusCode,
  studentResultLabel,
  methodLabel,
  summariseHistory,
  makeRequestGuard,
} from "@/lib/history"
import type { MyHistoryRow } from "@/types/db"

const row = (overrides: Partial<MyHistoryRow> = {}): MyHistoryRow => ({
  session_id: "s1",
  session_start: "2026-01-01T09:00:00Z",
  session_status: "completed",
  result: "present",
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
