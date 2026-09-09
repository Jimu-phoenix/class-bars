import DashboardShell from "@/components/DashboardShell"
import ProfileSettings from "@/components/dashboard/ProfileSettings"

export default function LecturerProfile() {
  return (
    <DashboardShell title="Update profile" description="Keep your lecturer details up to date.">
      <ProfileSettings />
    </DashboardShell>
  )
}