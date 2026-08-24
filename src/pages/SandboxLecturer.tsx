import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  CircleCheck,
  Loader2,
  Play,
  RotateCcw,
  Square,
  Users,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { getSandboxRole, SANDBOX_DEFAULTS } from "@/lib/sandbox"
import { usePoll } from "@/hooks/usePoll"
import SandboxShell from "@/components/SandboxShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { SandboxCheckinRow, SandboxSessionRow } from "@/types/db"

const POLL_MS = 3000
const NIL_UUID = "00000000-0000-0000-0000-000000000000"

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export default function SandboxLecturer() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [latestSession, setLatestSession] = useState<SandboxSessionRow | null>(null)
  const [checkins, setCheckins] = useState<SandboxCheckinRow[]>([])
  const [classLabel, setClassLabel] = useState<string>(SANDBOX_DEFAULTS.classLabel)
  const [starting, setStarting] = useState(false)
  const [ending, setEnding] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!authLoading && (!user || getSandboxRole(user) !== "sandbox_lecturer")) {
      navigate("/sandbox", { replace: true })
    }
  }, [user, authLoading, navigate])

  const loadLatestSession = useCallback(async () => {
    if (!user) return
    const { data, error: fetchError } = await supabase
      .from("sandbox_sessions")
      .select("*")
      .eq("lecturer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)

    if (fetchError) {
      setError(fetchError.message)
      return
    }
    setError("")
    setLatestSession((data as SandboxSessionRow[])[0] ?? null)
  }, [user])

  const sessionId = latestSession?.id ?? null

  const loadCheckins = useCallback(async () => {
    if (!sessionId) {
      setCheckins([])
      return
    }
    const { data } = await supabase
      .from("sandbox_checkins")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })

    if (data) setCheckins(data as SandboxCheckinRow[])
  }, [sessionId])

  usePoll(loadLatestSession, user ? POLL_MS : null)
  usePoll(loadCheckins, sessionId ? POLL_MS : null)

  const isLive = latestSession?.status === "live"

  const startClass = async () => {
    if (!user) return
    setStarting(true)
    setError("")
    try {
      const { error: insertError } = await supabase.from("sandbox_sessions").insert({
        lecturer_id: user.id,
        class_label: classLabel.trim() || SANDBOX_DEFAULTS.classLabel,
      })
      if (insertError) throw insertError
      await loadLatestSession()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start class")
    } finally {
      setStarting(false)
    }
  }

  const endClass = async () => {
    if (!latestSession) return
    setEnding(true)
    try {
      const { error: updateError } = await supabase
        .from("sandbox_sessions")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", latestSession.id)
      if (updateError) throw updateError
      await loadLatestSession()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end class")
    } finally {
      setEnding(false)
    }
  }

  const resetSandbox = async () => {
    if (!window.confirm("Reset sandbox data? This deletes all demo sessions and check-ins.")) {
      return
    }
    setResetting(true)
    try {
      const { error: deleteError } = await supabase
        .from("sandbox_sessions")
        .delete()
        .neq("id", NIL_UUID)
      if (deleteError) throw deleteError
      await loadLatestSession()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset sandbox data")
    } finally {
      setResetting(false)
    }
  }

  if (authLoading || !user || getSandboxRole(user) !== "sandbox_lecturer") {
    return (
      <SandboxShell>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </SandboxShell>
    )
  }

  return (
    <SandboxShell
      title="Sandbox dashboard"
      description="Run a fake class to demonstrate the attendance flow end-to-end."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{isLive ? latestSession.class_label : "Start a class"}</CardTitle>
            <CardDescription>
              {isLive
                ? `Started at ${formatTime(latestSession.started_at)}`
                : `${SANDBOX_DEFAULTS.courseLabel} · ${SANDBOX_DEFAULTS.venueLabel}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            {!latestSession && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="class_label" className="text-sm font-medium">
                    Class name <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <input
                    id="class_label"
                    placeholder={SANDBOX_DEFAULTS.classLabel}
                    value={classLabel}
                    onChange={(e) => setClassLabel(e.target.value)}
                    maxLength={60}
                    className={inputClass}
                  />
                </div>
                <Button onClick={startClass} disabled={starting} size="lg">
                  {starting ? (
                    <Loader2 data-icon="inline-start" className="animate-spin" />
                  ) : (
                    <Play data-icon="inline-start" />
                  )}
                  Start Class
                </Button>
              </>
            )}
            {isLive && (
              <div className="flex flex-col gap-4">
                <p className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
                  <span className="relative flex size-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-green-600" />
                  </span>
                  Class is live — students can check in now
                </p>
                <Button variant="destructive" onClick={endClass} disabled={ending}>
                  {ending ? (
                    <Loader2 data-icon="inline-start" className="animate-spin" />
                  ) : (
                    <Square data-icon="inline-start" />
                  )}
                  End Class
                </Button>
              </div>
            )}
            {latestSession && !isLive && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  Last class ended with {checkins.length} check-in
                  {checkins.length === 1 ? "" : "s"}.
                </p>
                <Button onClick={startClass} disabled={starting}>
                  {starting ? (
                    <Loader2 data-icon="inline-start" className="animate-spin" />
                  ) : (
                    <Play data-icon="inline-start" />
                  )}
                  Start another class
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Live check-ins</CardTitle>
            <CardDescription className="flex items-center gap-2">
              <Users className="size-3.5" />
              {checkins.length} checked in
            </CardDescription>
          </CardHeader>
          <CardContent>
            {checkins.length === 0 ? (
              <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                No check-ins yet. Share the student link once the class is live.
              </p>
            ) : (
              <ul className="max-h-80 divide-y overflow-y-auto">
                {checkins.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <CircleCheck className="size-4 shrink-0 text-green-600" />
                      <span className="truncate font-medium">{c.display_name}</span>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatTime(c.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-end">
        <Button variant="outline" onClick={resetSandbox} disabled={resetting}>
          {resetting ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <RotateCcw data-icon="inline-start" />
          )}
          Reset Sandbox Data
        </Button>
      </div>

      <Badge variant="outline" className="self-center text-xs font-normal text-muted-foreground">
        Demo only · nothing here touches real attendance records
      </Badge>
    </SandboxShell>
  )
}
