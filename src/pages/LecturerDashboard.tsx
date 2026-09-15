import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  Ban,
  BookOpen,
  CalendarDays,
  Clock,
  Loader2,
  MapPin,
  Play,
  Plus,
  Radio,
  Square,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { useLecturerSessions, type SessionListItem } from "@/hooks/useLecturerSessions"
import DashboardShell from "@/components/DashboardShell"
import StatCard from "@/components/dashboard/StatCard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  scheduled: "secondary",
  ongoing: "default",
  completed: "outline",
  cancelled: "destructive",
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatRange(startIso: string, endIso: string) {
  const end = new Date(endIso)
  return `${formatDateTime(startIso)} – ${end.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`
}

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
                  <li key={s.id} className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        <Link
                          to={`/dashboard/sessions/${s.id}`}
                          className="transition-colors hover:text-primary hover:underline"
                        >
                          {s.courses?.course_code} — {s.courses?.course_name}
                        </Link>
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs muted-text">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="size-3.5" aria-hidden="true" />
                          {formatRange(s.scheduled_start, s.scheduled_end)}
                        </span>
                        {s.venues?.name && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3.5" aria-hidden="true" />
                            {s.venues.name}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {s.status === "scheduled" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === s.id}
                            onClick={() => void runSessionAction(s, "start")}
                          >
                            {busyId === s.id ? (
                              <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />
                            ) : (
                              <Play data-icon="inline-start" aria-hidden="true" />
                            )}
                            Start
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Cancel session"
                            disabled={busyId === s.id}
                            onClick={() => void runSessionAction(s, "cancel")}
                          >
                            <Ban aria-hidden="true" />
                          </Button>
                        </>
                      )}
                      {s.status === "ongoing" && (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busyId === s.id}
                          onClick={() => void runSessionAction(s, "end")}
                        >
                          {busyId === s.id ? (
                            <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />
                          ) : (
                            <Square data-icon="inline-start" aria-hidden="true" />
                          )}
                          End
                        </Button>
                      )}
                      <Badge variant={statusVariant[s.status] ?? "outline"} className="gap-1.5">
                        {s.status === "ongoing" && (
                          <span className="relative flex size-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                          </span>
                        )}
                        {s.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  )
}