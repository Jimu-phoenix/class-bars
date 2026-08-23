import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"

export default function Onboarding() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!user) return
    let cancelled = false

    const routeByRole = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()

      if (cancelled) return

      // A profile row (or the signup metadata) already decides the role,
      // so there is nothing to pick here — send the user to the right place.
      if (data?.role === "lecturer" || (!data && user.user_metadata?.role === "lecturer")) {
        if (!data) {
          await supabase.from("profiles").upsert({
            id: user.id,
            full_name: user.user_metadata?.full_name ?? "User",
            role: "lecturer",
          })
        }
        navigate("/dashboard", { replace: true })
        return
      }

      if (data?.role === "student") {
        navigate("/profile", { replace: true })
        return
      }

      setChecking(false)
    }

    routeByRole()
    return () => {
      cancelled = true
    }
  }, [user, navigate])

  const chooseRole = async (role: "student" | "lecturer") => {
    setSubmitting(true)
    setError("")
    try {
      const { error: upsertError } = await supabase
        .from("profiles")
        .upsert({
          id: user!.id,
          role,
          full_name: user!.user_metadata?.full_name ?? "User",
        })

      if (upsertError) throw upsertError
      navigate(role === "lecturer" ? "/dashboard" : "/profile")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set role")
    } finally {
      setSubmitting(false)
    }
  }

  if (checking || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <div className="w-full">
        <h1 className="mb-2 text-center text-2xl font-bold">Welcome!</h1>
        <p className="mb-8 text-center text-sm text-muted-foreground">
          Are you a student or a staff member?
        </p>
        {error && (
          <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-4">
          <button
            onClick={() => chooseRole("student")}
            disabled={submitting}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-6 text-center shadow-xs transition-colors hover:bg-muted disabled:opacity-50"
          >
            <span className="text-lg font-semibold">Student</span>
            <span className="text-sm text-muted-foreground">
              I attend classes and need attendance recorded
            </span>
          </button>
          <button
            onClick={() => chooseRole("lecturer")}
            disabled={submitting}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-6 text-center shadow-xs transition-colors hover:bg-muted disabled:opacity-50"
          >
            <span className="text-lg font-semibold">Lecturer / Staff</span>
            <span className="text-sm text-muted-foreground">
              I teach classes and manage attendance
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
