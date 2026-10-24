import type { LucideIcon } from "lucide-react"
import { BookOpen, Building, LayoutDashboard, ShieldCheck, UserRound } from "lucide-react"

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
  { to: "/dashboard/profile", label: "Profile", icon: UserRound },
]

export const STUDENT_NAV: NavItem[] = [
  { to: "/student", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/student/courses", label: "Courses", icon: BookOpen },
  { to: "/student/profile", label: "Profile", icon: UserRound },
]

export const ADMIN_NAV: NavItem[] = [
  { to: "/admin", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/admin/venues", label: "Venues", icon: Building },
  { to: "/admin/users", label: "Users & Roles", icon: ShieldCheck },
  { to: "/admin/logs", label: "System Logs", icon: BookOpen },
]




