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

export default function StudentRoute({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, loading } = useAuth()
  const [result, setResult] = useState<{
    userId: string
    isStudent: boolean
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

      let isStudent: boolean
      if (error && error.code !== "PGRST116") {
        isStudent = user.user_metadata?.role !== "lecturer"
      } else if (data) {
        isStudent = data.role === "student"
      } else {
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
        isStudent = (created?.role ?? role) === "student"
      }

      if (!cancelled) setResult({ userId: user.id, isStudent })
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

  if (!result?.isStudent) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}