import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { BookOpen, CalendarDays, Clock, Plus, Radio } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { useLecturerSessions, type SessionListItem } from "@/hooks/useLecturerSessions"
import DashboardShell from "@/components/DashboardShell"
import SessionRow from "@/components/dashboard/SessionRow"
import StatCard from "@/components/dashboard/StatCard"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function LecturerDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState("")
  const [actionError, setActionError] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)

  const { sessions, loading, error, refetch } = useLecturerSessions(user?.id)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    const loadProfile = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single()
      if (!cancelled) {
        setFullName(profile?.full_name ?? user.user_metadata?.full_name ?? "")
      }
    }

    void loadProfile()
    return () => {
      cancelled = true
    }
  }, [user])

  const runSessionAction = async (
    session: SessionListItem,
    action: "start" | "end" | "cancel",
  ) => {
    if (action === "cancel" && !window.confirm("Cancel this session?")) return
    setActionError("")
    setBusyId(session.id)
    try {
      if (action === "start") {
        const { error: rpcError } = await supabase.rpc("start_session", {
          p_session_id: session.id,
        })
        if (rpcError) throw rpcError
      } else if (action === "end") {
        const { error: rpcError } = await supabase.rpc("end_session", {
          p_session_id: session.id,
        })
        if (rpcError) throw rpcError
      } else {
        const { error: updateError } = await supabase
          .from("class_sessions")
          .update({ status: "cancelled" })
          .eq("id", session.id)
        if (updateError) throw updateError
      }
      await refetch()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed")
    } finally {
      setBusyId(null)
    }
  }

  const now = new Date().toISOString()
  const totalSessions = sessions.length
  const liveSessions = sessions.filter((s) => s.status === "ongoing").length
  const upcomingSessions = sessions.filter(
    (s) => s.status === "scheduled" && s.scheduled_start > now,
  ).length
  const totalCourses = new Set(sessions.map((s) => s.course_id)).size
  const recentSessions = sessions.slice(0, 5)

  return (
    <DashboardShell
      title="Dashboard"
      description="Here&apos;s an overview of your classes and sessions."
    >
      <div className="space-y-8">
        <div>
          <h1 className="heading-2">
            Welcome back{fullName ? `, ${fullName}` : ""}
          </h1>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total sessions"
            hint="All time"
            value={totalSessions}
            icon={CalendarDays}
            loading={loading}
          />
          <StatCard
            label="Live now"
            hint="Currently running"
            value={liveSessions}
            icon={Radio}
            loading={loading}
            accent="bg-emerald-500/10 text-emerald-600"
            pulse
          />
          <StatCard
            label="Upcoming"
            hint="Scheduled ahead of now"
            value={upcomingSessions}
            icon={Clock}
            loading={loading}
          />
          <StatCard
            label="Courses taught"
            hint="Distinct courses"
            value={totalCourses}
            icon={BookOpen}
            loading={loading}
          />
        </div>

        <Card className="hairline-border">
          <CardHeader>
            <CardTitle>Recent sessions</CardTitle>
            <CardDescription>Your latest class sessions, newest first.</CardDescription>
            <CardAction>
              <Button size="sm" variant="outline" onClick={() => navigate("/dashboard/sessions/new")}>
                <Plus data-icon="inline-start" aria-hidden="true" />
                New session
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate("/dashboard/sessions")}>
                All sessions
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {(error || actionError) && (
              <p className="mb-5 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {actionError || error}
              </p>
            )}
            {loading ? (
              <ul className="divide-y border-border">
                {Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="py-4">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                  </li>
                ))}
              </ul>
            ) : recentSessions.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm muted-text">
                No sessions yet. Create your first session to get started.
              </p>
            ) : (
              <ul className="divide-y border-border">
                {recentSessions.map((s) => (
                  <SessionRow
                    key={s.id}
                    id={s.id}
                    courseCode={s.courses?.course_code ?? "—"}
                    courseName={s.courses?.course_name ?? "—"}
                    venueName={s.venues?.name ?? null}
                    scheduledStart={s.scheduled_start}
                    scheduledEnd={s.scheduled_end}
                    status={s.status}
                    actions
                    busyId={busyId}
                    onAction={(_sessionId, action) =>
                      void runSessionAction(s, action)
                    }
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  )
}