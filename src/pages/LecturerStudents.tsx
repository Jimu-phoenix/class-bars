import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Loader2, Search, Users } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { listMyStudents, filterStudents } from "@/lib/history"
import type { StudentListRow } from "@/types/db"
import DashboardShell from "@/components/DashboardShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

const PAGE_SIZE = 50

export default function LecturerStudents() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [students, setStudents] = useState<StudentListRow[]>([])
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const loadStudents = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError("")
    try {
      const rows = await listMyStudents()
      setStudents(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load students")
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    ;(async () => {
      await loadStudents()
    })()
  }, [loadStudents])

  const filtered = useMemo(() => filterStudents(students, query), [students, query])

  const displayRows = useMemo(
    () => filtered.slice(0, (page + 1) * PAGE_SIZE),
    [filtered, page],
  )

  const hasMore = displayRows.length < filtered.length

  const handleRetry = () => {
    setPage(0)
    void loadStudents()
  }

  return (
    <DashboardShell title="Students" description="Students enrolled in your courses.">
      <div className="mb-4 flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {filtered.length} student{filtered.length !== 1 ? "s" : ""}
        </p>
      </div>

      {error && !loading && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
        >
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={handleRetry} className="shrink-0">
            Retry
          </Button>
        </div>
      )}

      <div className="relative mb-6">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="student-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or registration number…"
          aria-label="Search students"
          className="h-11 rounded-full border border-border bg-muted/40 pl-10 pr-4 text-sm"
          disabled={loading}
        />
      </div>

      {loading && students.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="rounded-3xl bg-muted/60 p-5 sm:p-6">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            {query.trim().length === 0 ? (
              <>
                <div className="size-12 rounded-2xl bg-muted flex items-center justify-center">
                  <Users className="size-6 text-muted-foreground" />
                </div>
                <h2 className="font-heading text-base font-semibold tracking-tight">
                  No students are enrolled in your courses yet
                </h2>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  No students match your search.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <ul className="divide-y divide-border/60 gap-2">
            {displayRows.map((student) => (
              <li
                key={student.student_id}
                className="rounded-2xl bg-background p-4 cursor-pointer"
                role="link"
                tabIndex={0}
                aria-label={`View ${student.full_name}`}
                onClick={() => void navigate(`/dashboard/students/${student.student_id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    void navigate(`/dashboard/students/${student.student_id}`)
                  }
                }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">
                    {student.full_name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {student.registration_number ?? "No registration number"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {student.course_codes.map((code) => (
                    <Badge
                      key={code}
                      variant="outline"
                      className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                    >
                      {code}
                    </Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button
                onClick={() => setPage((prev) => prev + 1)}
                variant="outline"
                className="h-9 px-4 rounded-full"
              >
                Show more
              </Button>
            </div>
          )}
        </>
      )}
    </DashboardShell>
  )
}
