import type { LucideIcon } from "lucide-react"
import { BookOpen, LayoutDashboard, UserRound, Users } from "lucide-react"

export type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

// Labels are kept short so they fit under the icons in the mobile tab bar.
export const LECTURER_NAV: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/dashboard/courses", label: "Courses", icon: BookOpen },
  { to: "/dashboard/roster", label: "Roster", icon: Users },
  { to: "/dashboard/profile", label: "Profile", icon: UserRound },
]

export const STUDENT_NAV: NavItem[] = [
  { to: "/student", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/student/courses", label: "Courses", icon: BookOpen },
  { to: "/student/profile", label: "Profile", icon: UserRound },
]
