import type { ReactNode } from "react"
import { Navigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useRole } from "@/contexts/RoleContext"
import { decideGuestAccess } from "@/lib/guardPolicy"

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  )
}

/**
 * Route guard for guest-only pages (sign in / sign up). Signed-in users are
 * redirected to their own dashboard; only signed-out users see the page.
 */
export default function GuestRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const { role: actual, status } = useRole()

  const decision = decideGuestAccess({
    authLoading: loading,
    hasUser: !!user,
    status,
    actual,
  })

  if (decision.kind === "loading") return <Spinner />

  if (decision.kind === "deny") {
    return <Navigate to={decision.to} replace />
  }

  return <>{children}</>
}