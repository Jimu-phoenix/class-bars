import { STUDENT_NAV } from "@/lib/nav"
import DashboardShell from "@/components/DashboardShell"
import ProfileSettings from "@/components/dashboard/ProfileSettings"

export default function StudentProfile() {
  return (
    <DashboardShell
      roleLabel="Student dashboard"
      navItems={STUDENT_NAV}
      title="Update profile"
      description="Keep your student details up to date."
    >
      <ProfileSettings />
    </DashboardShell>
  )
}