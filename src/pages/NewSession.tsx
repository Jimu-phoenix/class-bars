import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { CalendarClock, Loader2, Play, Timer } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import DashboardShell from "@/components/DashboardShell"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { CourseRow, VenueRow } from "@/types/db"

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

const NEW_VENUE = "__new"

const DURATIONS = [5, 15, 30, 60]

type SessionMode = "now" | "schedule"

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000)
}

function minutesLabel(minutes: number) {
  return `${minutes} min`
}

export default function NewSession() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [courses, setCourses] = useState<CourseRow[]>([])
  const [venues, setVenues] = useState<VenueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")

  const [courseId, setCourseId] = useState("")
  const [venueChoice, setVenueChoice] = useState("")
  const [newVenueName, setNewVenueName] = useState("")
  const [newVenueBuilding, setNewVenueBuilding] = useState("")

  const [mode, setMode] = useState<SessionMode>("now")
  const [durationMinutes, setDurationMinutes] = useState(30)
  const [date, setDate] = useState("")
  const [startTime, setStartTime] = useState("")

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState("")

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const [{ data: courseRows, error: courseError }, { data: venueRows, error: venueError }] =
        await Promise.all([
          supabase
            .from("courses")
            .select("id, course_code, course_name, department, lecturer_id")
            .eq("lecturer_id", user?.id ?? "")
            .order("course_code", { ascending: true }),
          supabase
            .from("venues")
            .select("id, name, building")
            .order("name", { ascending: true }),
        ])

      if (cancelled) return
      if (courseError || venueError) {
        setLoadError(courseError?.message ?? venueError?.message ?? "Failed to load data")
      } else {
        setCourses((courseRows as unknown as CourseRow[]) ?? [])
        setVenues((venueRows as unknown as VenueRow[]) ?? [])
      }
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const now = new Date()
  const scheduledStart = mode === "now" ? now : date && startTime ? new Date(`${date}T${startTime}`) : null
  const scheduledEnd = scheduledStart ? addMinutes(scheduledStart, durationMinutes) : null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError("")

    if (!user) return
    if (!courseId) {
      setFormError("Select a course.")
      return
    }
    if (!venueChoice) {
      setFormError("Select a venue or add a new one.")
      return
    }
    if (venueChoice === NEW_VENUE && !newVenueName.trim()) {
      setFormError("Enter a name for the new venue.")
      return
    }

    if (mode === "schedule") {
      if (!scheduledStart || isNaN(scheduledStart.getTime())) {
        setFormError("Provide a valid date and start time.")
        return
      }
      if (scheduledStart.getTime() <= new Date().getTime()) {
        setFormError("Start time must be in the future.")
        return
      }
    }

    setSubmitting(true)
    try {
      let venueId = venueChoice
      if (venueChoice === NEW_VENUE) {
        const { data: venue, error: venueError } = await supabase
          .from("venues")
          .insert({
            name: newVenueName.trim(),
            building: newVenueBuilding.trim() || null,
          })
          .select("id")
          .single()
        if (venueError) throw venueError
        venueId = (venue as { id: string }).id
      }

      const startAt = mode === "now" ? now : scheduledStart!
      const endAt = addMinutes(startAt, durationMinutes)

      const { data: session, error: sessionError } = await supabase
        .from("class_sessions")
        .insert({
          course_id: courseId,
          lecturer_id: user.id,
          venue_id: venueId,
          scheduled_start: startAt.toISOString(),
          scheduled_end: endAt.toISOString(),
          ...(mode === "now"
            ? { status: "ongoing", actual_start: startAt.toISOString() }
            : {}),
        })
        .select("id")
        .single()
      if (sessionError) throw sessionError

      if (mode === "now") {
        navigate(`/dashboard/sessions/${(session as { id: string }).id}`)
      } else {
        navigate("/dashboard")
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create session")
      setSubmitting(false)
    }
  }

  return (
    <DashboardShell title="New session" description="Schedule a class session for attendance.">
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : loadError ? (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">{loadError}</CardContent>
        </Card>
      ) : courses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              You need at least one course before scheduling a session.
            </p>
            <Button onClick={() => navigate("/dashboard/courses")}>
              <CalendarClock data-icon="inline-start" />
              Go to courses
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Session details</CardTitle>
            <CardDescription>
              Choose whether the class starts immediately or is booked ahead of time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {formError && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {formError}
                </p>
              )}

              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-pressed={mode === "now"}
                  onClick={() => {
                    setMode("now")
                    setFormError("")
                  }}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    mode === "now"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Play className="size-4" aria-hidden="true" />
                  Start now
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-pressed={mode === "schedule"}
                  onClick={() => {
                    setMode("schedule")
                    setFormError("")
                  }}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    mode === "schedule"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <CalendarClock className="size-4" aria-hidden="true" />
                  Schedule for later
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="course" className="text-sm font-medium">
                    Course
                  </label>
                  <select
                    id="course"
                    required
                    value={courseId}
                    onChange={(e) => setCourseId(e.target.value)}
                    className={inputClass}
                  >
                    <option value="" disabled>
                      Select a course…
                    </option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.course_code} — {c.course_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="duration" className="text-sm font-medium">
                    Registration duration
                  </label>
                  <select
                    id="duration"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className={inputClass}
                  >
                    {DURATIONS.map((d) => (
                      <option key={d} value={d}>
                        {minutesLabel(d)}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs muted-text">
                    Attendance closes when the window lapses.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="venue" className="text-sm font-medium">
                    Venue
                  </label>
                  <select
                    id="venue"
                    required
                    value={venueChoice}
                    onChange={(e) => setVenueChoice(e.target.value)}
                    className={inputClass}
                  >
                    <option value="" disabled>
                      Select a venue…
                    </option>
                    {venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                        {v.building ? ` (${v.building})` : ""}
                      </option>
                    ))}
                    <option value={NEW_VENUE}>+ Add a new venue…</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="building" className="text-sm font-medium">
                    Building <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <input
                    id="building"
                    placeholder="Main Block"
                    disabled={venueChoice !== NEW_VENUE}
                    value={newVenueBuilding}
                    onChange={(e) => setNewVenueBuilding(e.target.value)}
                    className={`${inputClass} disabled:opacity-50`}
                  />
                </div>
              </div>

              {venueChoice === NEW_VENUE && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="new_venue_name" className="text-sm font-medium">
                    New venue name
                  </label>
                  <input
                    id="new_venue_name"
                    required
                    placeholder="LT3"
                    value={newVenueName}
                    onChange={(e) => setNewVenueName(e.target.value)}
                    className={inputClass}
                  />
                </div>
              )}

              {mode === "schedule" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="date" className="text-sm font-medium">
                      Date
                    </label>
                    <input
                      id="date"
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="start_time" className="text-sm font-medium">
                      Starts
                    </label>
                    <input
                      id="start_time"
                      type="time"
                      required
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              )}

              {scheduledStart && scheduledEnd && !isNaN(scheduledStart.getTime()) && (
                <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-4 py-3 text-sm">
                  <Timer className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <p className="text-muted-foreground">
                    {mode === "now" ? (
                      <>
                        Starts now · ends at{" "}
                        <span className="font-medium text-foreground">
                          {scheduledEnd.toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {` · registration open for ${minutesLabel(durationMinutes)}`}
                      </>
                    ) : (
                      <>
                        Runs{" "}
                        <span className="font-medium text-foreground">
                          {scheduledStart.toLocaleString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {" – "}
                        <span className="font-medium text-foreground">
                          {scheduledEnd.toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {` · registration open for ${minutesLabel(durationMinutes)}`}
                      </>
                    )}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
                  Cancel
                </Link>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 data-icon="inline-start" className="animate-spin" />}
                  {submitting
                    ? "Creating…"
                    : mode === "now"
                      ? "Start session"
                      : "Schedule session"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </DashboardShell>
  )
}