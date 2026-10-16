import { useEffect, useMemo, useState } from "react"
import { GraduationCap, Loader2, Search, Users } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { getLecturerRoster, type LecturerRosterRow } from "@/lib/realAttendance"
import DashboardShell from "@/components/DashboardShell"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const selectClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

type CourseGroup = {
  id: string
  code: string
  name: string
  students: LecturerRosterRow[]
  seen: Set<string>
}

export default function LecturerRoster() {
  const { user } = useAuth()
  const [rows, setRows] = useState<LecturerRosterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [courseFilter, setCourseFilter] = useState("")
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (!user) return
    let cancelled = false

    const load = async () => {
      try {
        const data = await getLecturerRoster()
        if (cancelled) return
        setRows(data)
        setError("")
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load roster")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [user])

  const courses = useMemo(() => {
    const seen = new Map<string, { id: string; code: string; name: string }>()
    for (const r of rows) {
      if (!seen.has(r.course_id)) {
        seen.set(r.course_id, {
          id: r.course_id,
          code: r.course_code,
          name: r.course_name,
        })
      }
    }
    return [...seen.values()].sort((a, b) => a.code.localeCompare(b.code))
  }, [rows])

  const groups = useMemo<CourseGroup[]>(() => {
    const byCourse = new Map<string, CourseGroup>()
    const needle = query.trim().toLowerCase()

    for (const r of rows) {
      if (courseFilter && r.course_id !== courseFilter) continue
      if (
        needle &&
        !r.student_name.toLowerCase().includes(needle) &&
        !(r.student_number ?? "").toLowerCase().includes(needle)
      ) {
        continue
      }

      let group = byCourse.get(r.course_id)
      if (!group) {
        group = {
          id: r.course_id,
          code: r.course_code,
          name: r.course_name,
          students: [],
          seen: new Set(),
        }
        byCourse.set(r.course_id, group)
      }
      // A student may hold several enrollment rows (different year/semester);
      // the roster lists them once per course.
      if (!group.seen.has(r.student_id)) {
        group.seen.add(r.student_id)
        group.students.push(r)
      }
    }

    return [...byCourse.values()].sort((a, b) => a.code.localeCompare(b.code))
  }, [rows, courseFilter, query])

  const totalStudents = useMemo(() => {
    const ids = new Set<string>()
    for (const g of groups) for (const s of g.students) ids.add(s.student_id)
    return ids.size
  }, [groups])

  return (
    <DashboardShell
      title="Roster"
      description="All students enrolled in the courses you teach."
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5 sm:w-56">
          <label htmlFor="roster-course" className="text-sm font-medium">
            Course
          </label>
          <select
            id="roster-course"
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            className={selectClass}
            disabled={courses.length === 0}
          >
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="roster-search" className="text-sm font-medium">
            Search
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="roster-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name or registration number"
              className={`${selectClass} pl-9`}
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading roster…
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Users className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              No enrolled students yet. Students appear here once they enroll in
              one of your courses.
            </p>
          </CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No students match your filters.
        </p>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            {totalStudents} {totalStudents === 1 ? "student" : "students"} across{" "}
            {groups.length} {groups.length === 1 ? "course" : "courses"}.
          </p>
          {groups.map((group) => (
            <Card key={group.id}>
              <CardHeader>
                <CardTitle>
                  <span className="font-mono">{group.code}</span> — {group.name}
                </CardTitle>
                <CardDescription>
                  {group.students.length}{" "}
                  {group.students.length === 1 ? "student" : "students"} enrolled
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {group.students.map((student) => (
                    <li
                      key={student.student_id}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <GraduationCap className="size-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {student.student_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {student.student_number ?? "No registration number"} ·{" "}
                            {student.semester} {student.academic_year}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        Enrolled {formatDate(student.enrolled_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DashboardShell>
  )
}
