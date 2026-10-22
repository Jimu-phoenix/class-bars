import type { UserRole } from "@/types/db"

export type GuardDecision =
  | { kind: "loading" }
  | { kind: "login" }
  | { kind: "allow" }
  | { kind: "deny"; to: string }

/** Where a user with a known dashboard actually belongs. */
export function homeFor(role: UserRole): string {
  if (role === "lecturer") return "/dashboard"
  if (role === "student") return "/student"
  if (role === "admin") return "/admin"
  return "/login"
}

/**
 * Pure access-control decision for a role-guarded route.
 *
 * Fail-closed: we return "loading" only while genuinely in flight; anything
 * that is not `ready` with a role matching `required` is a denial. The
 * redirect target keeps an out-of-tree user from bouncing between /student
 * and /dashboard: users with a known dashboard go to their own, everyone
 * else (`admin`, unknown, unreadable) lands on the role-agnostic /profile.
 */
export function decideGuard(args: {
  authLoading: boolean
  hasUser: boolean
  status: "loading" | "ready" | "unavailable"
  actual: UserRole | null
  required: UserRole
}): GuardDecision {
  const { authLoading, hasUser, status, actual, required } = args
  if (authLoading || status === "loading") return { kind: "loading" }
  if (!hasUser) return { kind: "login" }
  if (status !== "ready" || !actual) return { kind: "deny", to: "/login" }
  if (actual !== required) return { kind: "deny", to: homeFor(actual) }
  return { kind: "allow" }
}

/**
 * Pure access-control decision for guest-only routes (sign in / sign up).
 *
 * Guest routes are the inverse of role-guarded routes: they are only for
 * signed-out users. A signed-in user is sent to the home of their known role
 * (lecturer → /dashboard, student → /student); admins and unreadable roles
 * land on the role-agnostic /profile fallback.
 */
export function decideGuestAccess(args: {
  authLoading: boolean
  hasUser: boolean
  status: "loading" | "ready" | "unavailable"
  actual: UserRole | null
}): GuardDecision {
  const { authLoading, hasUser, status, actual } = args
  if (authLoading || status === "loading") return { kind: "loading" }
  if (!hasUser) return { kind: "allow" }
  if (status === "ready" && actual) return { kind: "deny", to: homeFor(actual) }
  return { kind: "deny", to: "/login" }
}