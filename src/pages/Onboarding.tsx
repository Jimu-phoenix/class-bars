import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useRole } from "@/contexts/RoleContext"

/**
 * Landing page for freshly signed-up users.
 *
 * The role is decided server-side by the `handle_new_user()` signup trigger,
 * so there is nothing for this page to choose and nothing for it to write —
 * it only waits for `RoleProvider` to resolve and forwards to the right
 * dashboard. The student/staff picker shown by earlier versions has been
 * removed because it let a client author its own `profiles.role` row.
 */
export default function Onboarding() {
  const { user, loading } = useAuth()
  const { role, status } = useRole()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    if (!user) {
      navigate("/signup", { replace: true })
      return
    }
    if (status === "loading") return

    if (status !== "ready") {
      // Role could not be read: land on the role-agnostic profile page rather
      // than guessing. /profile surfaces the account so the user can report it.
      navigate("/profile", { replace: true })
      return
    }

    if (role === "lecturer") {
      navigate("/dashboard", { replace: true })
      return
    }

    if (role === "student") {
      navigate("/student/profile", { replace: true })
      return
    }

    // `admin` and any other role have no onboarding path.
    navigate("/profile", { replace: true })
  }, [user, loading, status, role, navigate])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      <span className="sr-only">Setting up your account…</span>
    </div>
  )
}
