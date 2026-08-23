import { useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  )
}

export default function LecturerRoute({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, loading } = useAuth()
  const [result, setResult] = useState<{
    userId: string
    isLecturer: boolean
  } | null>(null)

  useEffect(() => {
    if (loading || !user) return
    let cancelled = false

    const checkRole = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()

      if (cancelled) return

      let isLecturer: boolean
      if (error && error.code !== "PGRST116") {
        // Fetch failed outright (network/RLS/etc.) — fall back to the signup
        // metadata instead of silently demoting a lecturer.
        isLecturer = user.user_metadata?.role === "lecturer"
      } else if (data) {
        isLecturer = data.role === "lecturer"
      } else {
        // No profile row yet (there is no DB trigger that creates one on
        // signup), so create it from the signup metadata.
        const metadata = user.user_metadata ?? {}
        const role = metadata.role === "lecturer" ? "lecturer" : "student"
        const { data: created } = await supabase
          .from("profiles")
          .upsert({
            id: user.id,
            full_name: metadata.full_name ?? "",
            role,
          })
          .select("role")
          .single()

        if (cancelled) return
        isLecturer = (created?.role ?? role) === "lecturer"
      }

      if (!cancelled) setResult({ userId: user.id, isLecturer })
    }

    checkRole()
    return () => {
      cancelled = true
    }
  }, [user, loading])

  if (loading || (user && result?.userId !== user.id)) {
    return <Spinner />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!result?.isLecturer) {
    return <Navigate to="/profile" replace />
  }

  return children
}
