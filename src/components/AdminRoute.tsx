import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useRole } from "@/contexts/RoleContext"
import { decideGuard } from "@/lib/guardPolicy"

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  )
}

/** Gate for `/admin/*`: only users whose profile role is `admin`. */
export default function AdminRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const { role: actual, status } = useRole()
  const location = useLocation()

  const decision = decideGuard({
    authLoading: loading,
    hasUser: !!user,
    status,
    actual,
    required: "admin",
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
