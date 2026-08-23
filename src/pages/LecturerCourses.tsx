import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Check, Loader2, Pencil, Plus, X } from "lucide-react"
import { supabase } from "@/lib/supabase"
import LecturerShell from "@/components/LecturerShell"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { CourseRow } from "@/types/db"

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

function friendlyError(message: string) {
  if (message.includes("duplicate key")) {
    return "A course with this code already exists."
  }
  return message
}

export default function LecturerCourses() {
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

  const load = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("courses")
      .select("id, course_code, course_name, department")
      .order("course_code", { ascending: true })

    if (fetchError) {
      setListError(fetchError.message)
    } else {
      setCourses((data as unknown as CourseRow[]) ?? [])
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const fetchInitial = async () => {
      const { data, error: fetchError } = await supabase
        .from("courses")
        .select("id, course_code, course_name, department")
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
  }, [])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    setCreateError("")
    setCreating(true)
    try {
      const { error: insertError } = await supabase.from("courses").insert({
        course_code: code.trim().toUpperCase(),
        course_name: name.trim(),
        department: department.trim() || null,
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
    <LecturerShell
      title="Courses"
      description="Courses you can schedule sessions for."
    >
      <Card>
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
            <Button type="submit" disabled={creating} className="sm:self-end">
              <Plus data-icon="inline-start" />
              {creating ? "Adding…" : "Add course"}
            </Button>
          </form>
          {createError && (
            <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {createError}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All courses</CardTitle>
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
                <li key={i} className="py-3">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                </li>
              ))}
            </ul>
          ) : courses.length === 0 ? (
            <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              No courses yet. Add your first one above.
            </p>
          ) : (
            <ul className="divide-y">
              {courses.map((course) => (
                <li
                  key={course.id}
                  className="flex items-center justify-between gap-4 py-3"
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
                        >
                          {savingId === course.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Check />
                          )}
                        </Button>
                        <Button size="icon-sm" variant="ghost" onClick={cancelEdit}>
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
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => startEdit(course)}
                        disabled={editingId !== null && editingId !== course.id}
                      >
                        <Pencil />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </LecturerShell>
  )
}
