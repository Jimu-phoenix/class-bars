import assert from "node:assert/strict"
import { test } from "node:test"
import { decideGuard, decideGuestAccess } from "../src/lib/guardPolicy.ts"

const base = {
  authLoading: false,
  hasUser: true,
  required: "lecturer" as const,
}

test("allows when auth is settled and profile role matches", () => {
  assert.deepEqual(
    decideGuard({ ...base, status: "ready", actual: "lecturer" }),
    { kind: "allow" },
  )
})

test("denies when profile role is the other dashboard role, to that role's home", () => {
  assert.deepEqual(
    decideGuard({ ...base, status: "ready", actual: "student" }),
    { kind: "deny", to: "/student" },
  )
})

test("denies admin to /profile (no loop between /student and /dashboard)", () => {
  assert.deepEqual(
    decideGuard({ ...base, status: "ready", actual: "admin" }),
    { kind: "deny", to: "/profile" },
  )
})

test("denies to /profile when the profile read failed (fail-closed, not fail-open)", () => {
  assert.deepEqual(
    decideGuard({ ...base, status: "unavailable", actual: "lecturer" }),
    { kind: "deny", to: "/profile" },
  )
})

test("denies to /profile when the profile row is missing (actual null)", () => {
  assert.deepEqual(
    decideGuard({ ...base, status: "ready", actual: null }),
    { kind: "deny", to: "/profile" },
  )
})

test("loads while the session or role read is still in flight", () => {
  assert.deepEqual(
    decideGuard({ ...base, status: "loading", actual: null }),
    { kind: "loading" },
  )
  assert.deepEqual(
    decideGuard({ ...base, authLoading: true, status: "loading", actual: null }),
    { kind: "loading" },
  )
})

test("sends signed-out users to login", () => {
  assert.deepEqual(
    decideGuard({ ...base, hasUser: false, status: "unavailable", actual: null }),
    { kind: "login" },
  )
})

test("student storefront allows students and denies lecturers to /dashboard", () => {
  const student = { ...base, required: "student" as const }
  assert.deepEqual(
    decideGuard({ ...student, status: "ready", actual: "student" }),
    { kind: "allow" },
  )
  assert.deepEqual(
    decideGuard({ ...student, status: "ready", actual: "lecturer" }),
    { kind: "deny", to: "/dashboard" },
  )
})

const guestBase = {
  authLoading: false,
  hasUser: false,
  status: "ready" as const,
  actual: null as const,
}

test("guest routes allow signed-out users through", () => {
  assert.deepEqual(
    decideGuestAccess({ ...guestBase, status: "unavailable", actual: null }),
    { kind: "allow" },
  )
  assert.deepEqual(decideGuestAccess(guestBase), { kind: "allow" })
})

test("guest routes bounce signed-in lecturers to /dashboard", () => {
  assert.deepEqual(
    decideGuestAccess({ ...guestBase, hasUser: true, actual: "lecturer" }),
    { kind: "deny", to: "/dashboard" },
  )
})

test("guest routes bounce signed-in students to /student", () => {
  assert.deepEqual(
    decideGuestAccess({ ...guestBase, hasUser: true, actual: "student" }),
    { kind: "deny", to: "/student" },
  )
})

test("guest routes bounce admins and unreadable roles to /profile (not a dashboard)", () => {
  assert.deepEqual(
    decideGuestAccess({ ...guestBase, hasUser: true, actual: "admin" }),
    { kind: "deny", to: "/profile" },
  )
  assert.deepEqual(
    decideGuestAccess({
      ...guestBase,
      hasUser: true,
      status: "unavailable",
      actual: null,
    }),
    { kind: "deny", to: "/profile" },
  )
})

test("guest routes still load while the session or role read is in flight", () => {
  assert.deepEqual(
    decideGuestAccess({ ...guestBase, authLoading: true }),
    { kind: "loading" },
  )
  assert.deepEqual(
    decideGuestAccess({ ...guestBase, hasUser: true, status: "loading", actual: null }),
    { kind: "loading" },
  )
})