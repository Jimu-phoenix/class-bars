import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useRole } from "@/contexts/RoleContext"
import ConsentCard from "@/components/dashboard/ConsentCard"

/**
 * Landing page for freshly signed-up users.
 *
 * The role is decided server-side by the `handle_new_user()` signup trigger,
 * so there is nothing for this page to choose and nothing for it to write —
 * it only waits for `RoleProvider` to resolve and forwards to the right
 * dashboard. The student/staff picker shown by earlier versions has been
 * removed because it let a client author its own `profiles.role` row.
 *
 * Students must record consent before proceeding to face enrolment on
 * /student/profile. The consent step is shown here so it cannot be skipped.
 */
export default function Onboarding() {
  const { user, loading } = useAuth()
  const { role, status } = useRole()
  const navigate = useNavigate()
  const [consentRecorded, setConsentRecorded] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user) {
      navigate("/signup", { replace: true })
      return
    }
    if (status === "loading") return

    if (status !== "ready") {
      // Role could not be read: land on /login rather than guessing.
      navigate("/login", { replace: true })
      return
    }

    if (role === "lecturer") {
      navigate("/dashboard", { replace: true })
      return
    }

    if (role === "student") {
      if (consentRecorded) {
        navigate("/student/profile", { replace: true })
        return
      }
      // Stay on this page to show the consent card.
      return
    }

    // `admin` and any other role have no onboarding path.
    navigate("/login", { replace: true })
  }, [user, loading, status, role, navigate, consentRecorded])

  if (loading || status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Setting up your account…</span>
      </div>
    )
  }

  if (!user) return null

  if (role === "student" && !consentRecorded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="max-w-md w-full p-6">
          <ConsentCard onConsentRecorded={() => setConsentRecorded(true)} />
        </div>
      </div>
    )
  }

  return null
}
