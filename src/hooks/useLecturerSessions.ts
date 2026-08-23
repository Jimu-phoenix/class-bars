import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import type { SessionStatus } from "@/types/db"

export type SessionListItem = {
  id: string
  course_id: string
  scheduled_start: string
  scheduled_end: string
  status: SessionStatus
  venues: { name: string } | null
  courses: { course_code: string; course_name: string } | null
}

export function useLecturerSessions(userId: string | undefined) {
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!userId) return
    const { data, error: fetchError } = await supabase
      .from("class_sessions")
      .select(
        "id, course_id, scheduled_start, scheduled_end, status, venues(name), courses(course_code, course_name)",
      )
      .eq("lecturer_id", userId)
      .order("scheduled_start", { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setSessions((data as unknown as SessionListItem[]) ?? [])
      setError(null)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const fetchInitial = async () => {
      const { data, error: fetchError } = await supabase
        .from("class_sessions")
        .select(
          "id, course_id, scheduled_start, scheduled_end, status, venues(name), courses(course_code, course_name)",
        )
        .eq("lecturer_id", userId)
        .order("scheduled_start", { ascending: false })

      if (cancelled) return
      if (fetchError) {
        setError(fetchError.message)
      } else {
        setSessions((data as unknown as SessionListItem[]) ?? [])
      }
      setLoading(false)
    }

    void fetchInitial()
    return () => {
      cancelled = true
    }
  }, [userId])

  return { sessions, loading, error, refetch }
}
