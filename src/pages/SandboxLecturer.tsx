import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { CalendarClock, CircleCheck, Loader2, Play, Users, X } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { getSandboxRole, SANDBOX_DEFAULTS } from "@/lib/sandbox"
import { usePoll } from "@/hooks/usePoll"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import type { SandboxCheckinRow, SandboxSessionRow } from "@/types/db"

const POLL_MS = 3000

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

  if (authLoading || !user || getSandboxRole(user) !== "sandbox_lecturer") {
    return (
      <div className="min-h-screen flex flex-col relative overflow-hidden bg-background">
        <Navbar />
        <main className="flex-1 relative z-10 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-background">
      <Navbar />

      <main className="flex-1 relative z-10">
        <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden="true">
          <div className="absolute inset-0 hero-gradient opacity-5" />
          <div className="absolute inset-0 hero-gradient-bottom opacity-10" />
          <div className="absolute inset-0 opacity-20 grid-bg-primary" />
          <div className="absolute inset-0 opacity-10 grid-bg-secondary animate-grid-move" />
        </div>

        <div className="relative py-8 md:py-12 lg:py-16 px-4 md:px-6 lg:px-8">
          <div className="container-default">
            <div className="max-w-6xl mx-auto">
              <header className="mb-8">
                <h1 className="heading-2 font-heading">Sandbox Dashboard</h1>
                <p className="mt-2 body-lg muted-text">Run a demo class and watch check-ins arrive live.</p>
              </header>

              {error && (
                <p className="mb-6 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              {isLive && (
                <div className="mb-6 p-4 rounded-xl border border-green-500/30 bg-green-500/5">
                  <p className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
                    <span className="relative flex size-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60" />
                      <span className="relative inline-flex size-2.5 rounded-full bg-green-600" />
                    </span>
                    {latestSession.class_label} is live — students can check in now
                  </p>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-3 mb-8">
                <Card>
                  <CardHeader>
                    <CardDescription className="text-xs text-muted-foreground">Status</CardDescription>
                    <CardTitle className="text-2xl font-medium">
                      {isLive ? "Live" : latestSession ? "Ended" : "Not started"}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader>
                    <CardDescription className="text-xs text-muted-foreground">Checked in</CardDescription>
                    <CardTitle className="text-3xl font-medium">{checkins.length}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="size-3.5" aria-hidden="true" />
                      This session
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardDescription className="text-xs text-muted-foreground">Class</CardDescription>
                    <CardTitle className="truncate text-lg font-medium">
                      {latestSession?.class_label ?? SANDBOX_DEFAULTS.classLabel}
                    </CardTitle>
                  </CardHeader>
                  {latestSession?.started_at && (
                    <CardContent className="pt-0">
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarClock className="size-3.5" aria-hidden="true" />
                        Started at {formatTime(latestSession.started_at)}
                      </p>
                    </CardContent>
                  )}
                </Card>
              </div>

              {!isLive && (
                <Card className="mb-8">
                  <CardHeader>
                    <CardTitle>{latestSession ? "Start another class" : "Start a class"}</CardTitle>
                    <CardDescription>
                      {latestSession
                        ? `Last class ended with ${checkins.length} check-in${checkins.length === 1 ? "" : "s"}.`
                        : `${SANDBOX_DEFAULTS.courseLabel} · ${SANDBOX_DEFAULTS.venueLabel}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {!latestSession && (
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
                    )}
                    <Button onClick={startClass} disabled={starting} size="lg" className="w-fit">
                      {starting ? (
                        <Loader2 data-icon="inline-start" className="animate-spin" />
                      ) : (
                        <Play data-icon="inline-start" />
                      )}
                      Start Class
                    </Button>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>{isLive ? "Live check-ins" : "Check-ins"}</CardTitle>
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

              <div className="mt-6 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/sandbox")}
                >
                  <X className="size-4" aria-hidden="true" />
                  Leave Sandbox
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}