import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Check, FileDown, Loader2, Pencil, Plus, X } from "lucide-react"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  REGISTER_MAX_SESSIONS,
  REGISTER_MIN_SESSIONS,
  buildRegisterMatrix,
  type RegisterRpcRow,
} from "@/lib/registerPdf/buildRegisterMatrix"
import { registerPdfWithRetry } from "@/lib/registerPdf/pdfActions"
import type { CourseRow } from "@/types/db"

const inputClass =
  "h-11 rounded-full border border-border bg-muted/40 px-4 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

type EndedSession = {
  id: string
  scheduled_start: string
}

function friendlyError(message: string) {
  if (message.includes("duplicate key")) {
    return "A course with this code already exists."
  }
  return message
}

function monthKey(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function sessionsInMonth(
  sessions: EndedSession[],
  month: string,
): EndedSession[] {
  return sessions
    .filter((session) => monthKey(session.scheduled_start) === month)
    .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start))
}

function formatSessionLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

type ExportRegisterDialogProps = {
  course: CourseRow
  userId: string
  onClose: () => void
}

function ExportRegisterDialog({
  course,
  userId,
  onClose,
}: ExportRegisterDialogProps) {
  const [sessions, setSessions] = useState<EndedSession[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [month, setMonth] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [lecturerName, setLecturerName] = useState("")
  const [generating, setGenerating] = useState(false)
  const [exportError, setExportError] = useState("")

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setLoadError("")
      setExportError("")

      const [sessionResult, profileResult] = await Promise.all([
        supabase
          .from("class_sessions")
          .select("id, scheduled_start")
          .eq("course_id", course.id)
          .eq("status", "completed")
          .order("scheduled_start", { ascending: false }),
        supabase
          .from("profiles")
          .select("full_name")
          .eq("id", userId)
          .maybeSingle(),
      ])

      if (cancelled) return

      if (sessionResult.error) {
        setLoadError(sessionResult.error.message)
        setLoading(false)
        return
      }

      const ended = (
        (sessionResult.data as EndedSession[] | null) ?? []
      ).filter(
        (session) => !Number.isNaN(new Date(session.scheduled_start).getTime()),
      )
      const latestMonth =
        (ended[0] && monthKey(ended[0].scheduled_start)) || currentMonthKey()

      setSessions(ended)
      setMonth(latestMonth)
      setSelected(
        sessionsInMonth(ended, latestMonth)
          .slice(0, REGISTER_MAX_SESSIONS)
          .map((session) => session.id),
      )
      setLecturerName(
        (profileResult.data as { full_name: string | null } | null)
          ?.full_name ?? "",
      )
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [course.id, userId])

  const monthSessions = sessionsInMonth(sessions, month)
  const selectedSet = new Set(selected)
  const count = selected.length
  const limitReached = count >= REGISTER_MAX_SESSIONS

  let validation = ""
  if (loading) {
    validation = "Loading ended sessions…"
  } else if (sessions.length === 0) {
    validation = "No ended sessions yet. End a session before exporting."
  } else if (monthSessions.length === 0) {
    validation = "No ended sessions in this month."
  } else if (count < REGISTER_MIN_SESSIONS) {
    validation = `Select at least ${REGISTER_MIN_SESSIONS} ended sessions.`
  } else if (count > REGISTER_MAX_SESSIONS) {
    validation = `Select at most ${REGISTER_MAX_SESSIONS} ended sessions.`
  }

  const canExport =
    !loading && !generating && validation === "" && count >= REGISTER_MIN_SESSIONS

  const handleMonthChange = (value: string) => {
    setMonth(value)
    setSelected(
      sessionsInMonth(sessions, value)
        .slice(0, REGISTER_MAX_SESSIONS)
        .map((session) => session.id),
    )
    setExportError("")
  }

  const handleToggle = (sessionId: string, checked: boolean) => {
    setSelected((current) => {
      if (!checked) {
        return current.filter((id) => id !== sessionId)
      }
      if (
        current.includes(sessionId) ||
        current.length >= REGISTER_MAX_SESSIONS
      ) {
        return current
      }
      return [...current, sessionId]
    })
    setExportError("")
  }

  const handleExport = async () => {
    if (!canExport) return
    const chosen = monthSessions.filter((session) =>
      selectedSet.has(session.id),
    )
    if (
      chosen.length < REGISTER_MIN_SESSIONS ||
      chosen.length > REGISTER_MAX_SESSIONS
    ) {
      return
    }

    setGenerating(true)
    setExportError("")

    try {
      const { data, error } = await supabase.rpc("get_register_data", {
        p_course_id: course.id,
        p_session_ids: chosen.map((session) => session.id),
      })
      if (error) throw error

      const matrix = buildRegisterMatrix(
        (data as RegisterRpcRow[] | null) ?? [],
      )

      // Register the verification code BEFORE building the PDF so every
      // downloaded register is verifiable. Retries with a new code on
      // collision; any other error aborts without producing a PDF.
      const { code } = await registerPdfWithRetry(course.id)

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0)
      })

      const { downloadRegisterPdf } = await import(
        "@/lib/registerPdf/renderRegisterPdf"
      )

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0)
      })

      await downloadRegisterPdf(matrix, {
        courseCode: course.course_code,
        courseName: course.course_name,
        lecturerName,
        month,
        generatedAt: new Date(),
      }, code)
      onClose()
    } catch (err) {
      setExportError(
        err instanceof Error
          ? err.message
          : "Could not generate the attendance register.",
      )
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-3 sm:p-6">
        <DialogHeader className="pb-4">
          <DialogTitle>Export attendance register</DialogTitle>
          <DialogDescription>
            Choose the month and 2–{REGISTER_MAX_SESSIONS} ended sessions for{" "}
            <span className="font-mono">{course.course_code}</span>. The PDF is
            generated in your browser.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 p-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="register-month" className="text-sm font-medium">
              Month
            </label>
            <input
              id="register-month"
              type="month"
              value={month}
              onChange={(event) => handleMonthChange(event.target.value)}
              disabled={loading || generating || sessions.length === 0}
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Ended sessions</p>
              <p className="text-xs text-muted-foreground">
                {count} of {REGISTER_MAX_SESSIONS} selected
              </p>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 rounded-2xl border border-border/60 px-4 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading ended sessions…
              </div>
            ) : monthSessions.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
                {sessions.length === 0
                  ? "No ended sessions yet."
                  : "No ended sessions in this month."}
              </p>
            ) : (
              <div className="flex flex-col max-h-[220px] min-h-[120px] divide-y overflow-y-auto rounded-2xl border border-border/60">
                {monthSessions.map((session) => {
                  const checked = selectedSet.has(session.id)
                  return (
                    <label
                      key={session.id}
                      className="rounded-xl cursor-pointer flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={generating || (!checked && limitReached)}
                        onChange={(event) =>
                          handleToggle(session.id, event.target.checked)
                        }
                        className="size-4 shrink-0"
                      />
                      <span className="truncate">
                        {formatSessionLabel(session.scheduled_start)}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          {(validation || loadError || exportError) && (
            <p
              className={
                loadError || exportError
                  ? "rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  : "text-sm text-muted-foreground"
              }
            >
              {loadError || exportError || validation}
            </p>
          )}
        </div>

        <DialogFooter className="p-4">
          <Button variant="outline" onClick={onClose} disabled={generating} className="h-9 px-4 rounded-full">
            Cancel
          </Button>
          <Button
            onClick={() => void handleExport()}
            disabled={!canExport}
            className="h-9 px-4 rounded-full"
          >
            {generating ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <FileDown data-icon="inline-start" />
            )}
            {generating ? "Generating…" : "Export PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function LecturerCourses() {
  const { user } = useAuth()
  const [courses, setCourses] = useState<CourseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState("")

  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [department, setDepartment] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState("")

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editDepartment, setEditDepartment] = useState("")
  const [savingId, setSavingId] = useState<string | null>(null)
  const [exportCourse, setExportCourse] = useState<CourseRow | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    const { data, error: fetchError } = await supabase
      .from("courses")
      .select("id, course_code, course_name, department, lecturer_id")
      .eq("lecturer_id", user.id)
      .order("course_code", { ascending: true })

    if (fetchError) {
      setListError(fetchError.message)
    } else {
      setCourses((data as unknown as CourseRow[]) ?? [])
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    let cancelled = false

    const fetchInitial = async () => {
      const { data, error: fetchError } = await supabase
        .from("courses")
        .select("id, course_code, course_name, department, lecturer_id")
        .eq("lecturer_id", user.id)
        .order("course_code", { ascending: true })

      if (cancelled) return
      if (fetchError) {
        setListError(fetchError.message)
      } else {
        setCourses((data as unknown as CourseRow[]) ?? [])
      }
      setLoading(false)
    }

    void fetchInitial()
    return () => {
      cancelled = true
    }
  }, [user])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return
    setCreateError("")
    setCreating(true)
    try {
      const { error: insertError } = await supabase.from("courses").insert({
        course_code: code.trim().toUpperCase(),
        course_name: name.trim(),
        department: department.trim() || null,
        lecturer_id: user.id,
      })
      if (insertError) throw insertError
      setCode("")
      setName("")
      setDepartment("")
      await load()
    } catch (err) {
      setCreateError(
        friendlyError(err instanceof Error ? err.message : "Failed to create course"),
      )
    } finally {
      setCreating(false)
    }
  }

  const startEdit = (course: CourseRow) => {
    setEditingId(course.id)
    setEditName(course.course_name)
    setEditDepartment(course.department ?? "")
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName("")
    setEditDepartment("")
  }

  const saveEdit = async (course: CourseRow) => {
    if (!editName.trim()) return
    setSavingId(course.id)
    try {
      const { error: updateError } = await supabase
        .from("courses")
        .update({
          course_name: editName.trim(),
          department: editDepartment.trim() || null,
        })
        .eq("id", course.id)
      if (updateError) throw updateError
      cancelEdit()
      await load()
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to update course")
    } finally {
      setSavingId(null)
    }
  }

  return (
    <DashboardShell
      title="Courses"
      description="Courses you can schedule sessions for."
    >
      <Card className="rounded-3xl bg-muted/60 p-5 sm:p-6">
        <CardHeader>
          <CardTitle>Add a course</CardTitle>
          <CardDescription>
            Course codes are permanent once created.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-[140px_1fr_1fr_auto] sm:items-start">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="course_code" className="text-sm font-medium">
                Code
              </label>
              <input
                id="course_code"
                required
                placeholder="CSC301"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="course_name" className="text-sm font-medium">
                Name
              </label>
              <input
                id="course_name"
                required
                placeholder="Data Structures"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="department" className="text-sm font-medium">
                Department <span className="text-muted-foreground">(optional)</span>
              </label>
              <input
                id="department"
                placeholder="Computer Science"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className={inputClass}
              />
            </div>
            <Button type="submit" disabled={creating} className="h-11 rounded-full bg-foreground text-background">
              <Plus data-icon="inline-start" />
              {creating ? "Adding…" : "Add course"}
            </Button>
            {createError && (
              <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {createError}
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-3xl bg-muted/60 p-5 sm:p-6">
        <CardHeader>
          <CardTitle>My courses</CardTitle>
          <CardDescription>{courses.length} registered</CardDescription>
        </CardHeader>
        <CardContent>
          {listError && (
            <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {listError}
            </p>
          )}
          {loading ? (
            <ul className="divide-y">
              {Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="py-4">
                  <div className="h-4 w-2/3 animate-pulse rounded-2xl bg-muted" />
                </li>
              ))}
            </ul>
          ) : courses.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
              No courses yet. Add your first one above.
            </p>
          ) : (
            <ul className="divide-y divide-border/60 gap-2">
              {courses.map((course) => (
                <li
                  key={course.id}
                  className="rounded-xl bg-background p-4 flex flex-wrap items-center justify-between gap-3"
                >
                  {editingId === course.id ? (
                    <>
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="shrink-0 font-mono text-sm font-semibold">
                          {course.course_code}
                        </span>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          aria-label="Course name"
                          className={`${inputClass} max-w-xs`}
                        />
                        <input
                          value={editDepartment}
                          onChange={(e) => setEditDepartment(e.target.value)}
                          aria-label="Department"
                          placeholder="Department"
                          className={`${inputClass} max-w-xs`}
                        />
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          size="icon-sm"
                          variant="outline"
                          onClick={() => void saveEdit(course)}
                          disabled={savingId === course.id || !editName.trim()}
                          className="h-9 rounded-full"
                        >
                          {savingId === course.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Check />
                          )}
                        </Button>
                        <Button size="icon-sm" variant="ghost" onClick={cancelEdit} className="h-9 rounded-full">
                          <X />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          <span className="font-mono">{course.course_code}</span>{" "}
                          — {course.course_name}
                        </p>
                        {course.department && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {course.department}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setExportCourse(course)}
                          disabled={editingId !== null}
                          className="h-9 px-4 rounded-full"
                        >
                          <FileDown data-icon="inline-start" />
                          Export register
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => startEdit(course)}
                          disabled={editingId !== null && editingId !== course.id}
                          className="h-9 rounded-full"
                          aria-label={`Edit ${course.course_code}`}
                        >
                          <Pencil />
                        </Button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {exportCourse && user && (
        <ExportRegisterDialog
          course={exportCourse}
          userId={user.id}
          onClose={() => setExportCourse(null)}
        />
      )}
    </DashboardShell>
  )
}
