import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Ban,
  BookOpen,
  CalendarDays,
  Clock,
  Loader2,
  MapPin,
  Play,
  Plus,
  Square,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { useLecturerSessions, type SessionListItem } from "@/hooks/useLecturerSessions"
import LecturerShell from "@/components/LecturerShell"
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
  const upcomingSessions = sessions.filter(
    (s) => s.status === "scheduled" && s.scheduled_start > now,
  ).length
  const totalCourses = new Set(sessions.map((s) => s.course_id)).size
  const recentSessions = sessions.slice(0, 5)

  return (
    <LecturerShell>
      <div className="space-y-8">
        <div>
          <h1 className="heading-2">
            Welcome back{fullName ? `, ${fullName}` : ""}
          </h1>
          <p className="mt-2 body-lg muted-text">
            Here&apos;s an overview of your classes and sessions.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <Card className="hairline-border">
            <CardHeader>
              <CardDescription className="text-xs muted-text">Total sessions</CardDescription>
              <CardTitle className="text-3xl font-medium">{loading ? "—" : totalSessions}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="flex items-center gap-1.5 text-xs muted-text">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                All time
              </p>
            </CardContent>
          </Card>
          <Card className="hairline-border">
            <CardHeader>
              <CardDescription className="text-xs muted-text">Upcoming sessions</CardDescription>
              <CardTitle className="text-3xl font-medium">{loading ? "—" : upcomingSessions}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="flex items-center gap-1.5 text-xs muted-text">
                <Clock className="size-3.5" aria-hidden="true" />
                Scheduled ahead of now
              </p>
            </CardContent>
          </Card>
          <Card className="hairline-border">
            <CardHeader>
              <CardDescription className="text-xs muted-text">Courses taught</CardDescription>
              <CardTitle className="text-3xl font-medium">{loading ? "—" : totalCourses}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="flex items-center gap-1.5 text-xs muted-text">
                <BookOpen className="size-3.5" aria-hidden="true" />
                Distinct courses
              </p>
            </CardContent>
          </Card>
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
                        {s.courses?.course_code} — {s.courses?.course_name}
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
                      <Badge variant={statusVariant[s.status] ?? "outline"}>{s.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </LecturerShell>
  )
}
