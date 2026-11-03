import type { EnrolledStudentRow } from "@/lib/manualMark"

export function filterStudents(
  list: EnrolledStudentRow[],
  query: string,
  limit = 8,
): EnrolledStudentRow[] {
  const trimmed = query.trim()
  if (trimmed.length === 0) return []

  const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  const matches = list.filter((student) => {
    const haystack = `${student.full_name ?? ""} ${student.registration_number ?? ""}`
      .toLowerCase()
    return words.every((word) => haystack.includes(word))
  })

  // Unchecked students first, then by name.
  matches.sort((a, b) => {
    if (a.checked_in && !b.checked_in) return 1
    if (!a.checked_in && b.checked_in) return -1
    return (a.full_name ?? "").localeCompare(b.full_name ?? "")
  })

  return matches.slice(0, limit)
}
