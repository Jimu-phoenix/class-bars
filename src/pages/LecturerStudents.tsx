import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Loader2, Search, Users } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import {
  searchMyStudents,
  makeRequestGuard,
} from "@/lib/history"
import type { StudentSearchRow } from "@/types/db"
import DashboardShell from "@/components/DashboardShell"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

const DEBOUNCE_MS = 250
const MIN_QUERY_LENGTH = 2

export default function LecturerStudents() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<StudentSearchRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [searched, setSearched] = useState(false)
  const guard = useRef(makeRequestGuard()).current
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(
    async (q: string, requestId: number) => {
      if (guard.isStale(requestId)) return
      setLoading(true)
      setError("")
      try {
        const rows = await searchMyStudents({ query: q, limit: 20 })
        if (guard.isStale(requestId)) return
        setResults(rows)
        setSearched(true)
      } catch (err) {
        if (guard.isStale(requestId)) return
        setError(err instanceof Error ? err.message : "Search failed")
        setResults([])
      } finally {
        if (!guard.isStale(requestId)) setLoading(false)
      }
    },
    [guard],
  )

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    setError("")
    if (timer.current) clearTimeout(timer.current)
    if (value.trim().length >= MIN_QUERY_LENGTH) {
      const requestId = guard.next()
      timer.current = setTimeout(() => {
        void search(value, requestId)
      }, DEBOUNCE_MS)
    } else {
      setResults([])
      setSearched(false)
    }
  }

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  if (user === undefined) {
    return null
  }

  return (
    <DashboardShell title="Students" description="Find a student by name or registration number.">
      <div className="mb-4 flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Search students enrolled in your courses
        </p>
      </div>

      <div className="relative mb-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          id="student-search"
          type="search"
          value={query}
          onChange={handleQueryChange}
          placeholder="Search by name or registration number…"
          aria-label="Search students"
          className="h-10 pl-9"
          disabled={loading}
        />
        {query.trim().length > 0 && query.trim().length < MIN_QUERY_LENGTH && (
          <p className="mt-1 text-xs text-muted-foreground">
            Type at least 2 characters to search.
          </p>
        )}
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      {!searched && query.trim().length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Users className="size-6 text-muted-foreground" />
            <CardTitle>Search for a student</CardTitle>
            <CardDescription>
              Enter a name or registration number (2+ characters) to find
              students enrolled in your courses.
            </CardDescription>
          </CardContent>
        </Card>
      ) : searched && results.length === 0 && query.trim().length >= MIN_QUERY_LENGTH ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No students match "{query}".
            </p>
          </CardContent>
        </Card>
      ) : (
      <ul className="divide-y divide-border">
        {results.map((student) => (
          <li
            key={student.student_id}
            className="flex items-center justify-between gap-4 py-4 cursor-pointer"
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
              <p className="text-sm font-semibold truncate">{student.full_name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {student.registration_number ?? "No registration number"}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">→</span>
          </li>
        ))}
      </ul>
      )}
    </DashboardShell>
  )
}
