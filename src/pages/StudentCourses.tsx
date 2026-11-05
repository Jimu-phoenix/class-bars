import { useCallback, useEffect, useMemo, useState } from "react"
import { BookOpen, Loader2, Search, UserPlus, Users } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { enrollSelf } from "@/lib/realAttendance"
import DashboardShell from "@/components/DashboardShell"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { CourseRow, EnrollmentRow } from "@/types/db"

type EnrolledCourseRow = EnrollmentRow & {
  courses: CourseRow | null
}

function ListSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />
      ))}
    </div>
  )
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="rounded-3xl bg-muted/60 p-5 sm:p-6 flex flex-col items-center gap-2 py-12 text-center">
      <div className="size-12 rounded-2xl bg-muted flex items-center justify-center">
        <Users className="size-6 text-muted-foreground" />
      </div>
      <h2 className="font-heading text-base font-semibold tracking-tight">
        {children}
      </h2>
    </div>
  )
}

export default function StudentCourses() {
  const { user } = useAuth()
  const [courses, setCourses] = useState<CourseRow[]>([])
  const [myCourses, setMyCourses] = useState<EnrolledCourseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [busyCourseCode, setBusyCourseCode] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [tab, setTab] = useState("mine")
  const [query, setQuery] = useState("")
  const [pending, setPending] = useState<CourseRow | null>(null)

  const loadCourses = useCallback(async () => {
    if (!user) return
    const [catRes, enrolledRes] = await Promise.all([
      supabase
        .from("courses")
        .select("id, course_code, course_name, department")
        .order("course_code", { ascending: true }),
      supabase
        .from("enrollments")
        .select(
          "id, student_id, course_id, academic_year, semester, courses(id, course_code, course_name, department)",
        )
        .eq("student_id", user.id),
    ])
    if (!catRes.error) setCourses((catRes.data as CourseRow[]) ?? [])
    if (!enrolledRes.error) {
      setMyCourses((enrolledRes.data as unknown as EnrolledCourseRow[]) ?? [])
    }
    setLoadError(
      catRes.error || enrolledRes.error
        ? "We couldn't load your courses. Check your connection and try again."
        : "",
    )
  }, [user])

  useEffect(() => {
    if (!user) return
    const timer = window.setTimeout(() => {
      void loadCourses().then(() => setLoading(false))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [user, loadCourses])

  const retry = () => {
    setLoading(true)
    void loadCourses().then(() => setLoading(false))
  }

  const enroll = async (course: CourseRow) => {
    if (!user) return
    setBusyCourseCode(course.course_code)
    setError("")
    try {
      await enrollSelf(course.course_code)
      await loadCourses()
      setTab("mine")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enrollment failed")
    } finally {
      setBusyCourseCode(null)
      setPending(null)
    }
  }

  const enrolledIds = useMemo(() => new Set(myCourses.map((c) => c.course_id)), [myCourses])
  const catalog = useMemo(() => {
    const q = query.trim().toLowerCase()
    return courses
      .filter((c) => !enrolledIds.has(c.id))
      .filter(
        (c) =>
          !q ||
          c.course_code.toLowerCase().includes(q) ||
          c.course_name.toLowerCase().includes(q),
      )
  }, [courses, enrolledIds, query])
  const availableCount = courses.length - enrolledIds.size

  return (
    <DashboardShell title="Courses" description="Your enrollments and the course catalog.">
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      {loadError && !loading && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
        >
          <span>{loadError}</span>
          <Button size="sm" variant="outline" onClick={retry} className="shrink-0">
            Retry
          </Button>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList className="grid h-11 w-full grid-cols-2">
          <TabsTrigger value="mine" className="h-9">
            <BookOpen aria-hidden="true" />
            My courses{!loading && ` (${myCourses.length})`}
          </TabsTrigger>
          <TabsTrigger value="browse" className="h-9">
            <UserPlus aria-hidden="true" />
            Browse{!loading && ` (${availableCount})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mine">
          {loading ? (
            <ListSkeleton />
          ) : myCourses.length === 0 ? (
            <EmptyState>
              You&apos;re not enrolled in any courses yet. Open Browse to join one.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border/60 gap-2">
              {myCourses.map((c) => (
                <li
                  key={c.id}
                  className="rounded-xl bg-background p-4"
                >
                  <p className="truncate text-sm font-semibold">
                    {c.courses?.course_code} — {c.courses?.course_name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[c.courses?.department, c.academic_year, c.semester]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="browse" className="space-y-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by code or name"
              aria-label="Search courses"
              className="h-11 rounded-full border border-border bg-muted/40 pl-10 pr-4 text-sm"
            />
          </div>

          {loading ? (
            <ListSkeleton />
          ) : catalog.length === 0 ? (
            <EmptyState>
              {query ? "No courses match your search." : "Nothing else to enroll in right now."}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border/60 gap-2">
              {catalog.map((c) => (
                <li
                  key={c.id}
                  className="rounded-xl bg-background p-4 cursor-pointer"
                  role="link"
                  tabIndex={0}
                  aria-label={`Enroll in ${c.course_code} — ${c.course_name}`}
                  onClick={() => setPending(c)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      setPending(c)
                    }
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {c.course_code} — {c.course_name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.department ?? "—"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-4 rounded-full shrink-0"
                    disabled={busyCourseCode !== null}
                    onClick={() => setPending(c)}
                  >
                    Enroll
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open && busyCourseCode === null) setPending(null)
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Enroll in this course?</DialogTitle>
            <DialogDescription>
              {pending ? `${pending.course_code} — ${pending.course_name}` : ""}. Live sessions for
              it will appear on your Home screen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4 pb-4">
            <Button
              variant="outline"
              className="h-9 px-4 rounded-full shrink-0"
              disabled={busyCourseCode !== null}
              onClick={() => setPending(null)}
            >
              Cancel
            </Button>
            <Button
              className="h-9 px-4 rounded-full"
              disabled={busyCourseCode !== null || !pending}
              onClick={() => pending && void enroll(pending)}
            >
              {busyCourseCode !== null && (
                <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />
              )}
              Enroll
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}
