import type { LucideIcon } from "lucide-react"
import { BookOpen, LayoutDashboard, UserRound } from "lucide-react"

export type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

export const LECTURER_NAV: NavItem[] = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/dashboard/courses", label: "Courses", icon: BookOpen },
  { to: "/dashboard/profile", label: "Update profile", icon: UserRound },
]

export const STUDENT_NAV: NavItem[] = [
  { to: "/student", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/student/courses", label: "Courses", icon: BookOpen },
  { to: "/student/profile", label: "Update profile", icon: UserRound },
]