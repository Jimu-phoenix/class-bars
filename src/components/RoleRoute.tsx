import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useRole } from "@/contexts/RoleContext"
import { decideGuard } from "@/lib/guardPolicy"
import type { UserRole } from "@/types/db"

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  )
}

export default function RoleRoute({
  role,
  children,
}: {
  role: Exclude<UserRole, "admin">
  children: ReactNode
}) {
  const { user, loading } = useAuth()
  const { role: actual, status } = useRole()
  const location = useLocation()

  const decision = decideGuard({
    authLoading: loading,
    hasUser: !!user,
    status,
    actual,
    required: role,
  })

  if (decision.kind === "loading") return <Spinner />

  if (decision.kind === "login") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (decision.kind === "deny") {
    return <Navigate to={decision.to} replace />
  }

  return <>{children}</>
}