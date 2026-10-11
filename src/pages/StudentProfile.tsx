import DashboardShell from "@/components/DashboardShell"
import ProfileSettings from "@/components/dashboard/ProfileSettings"
import FaceBiometricsCard from "@/components/dashboard/FaceBiometricsCard"

export default function StudentProfile() {
  return (
    <DashboardShell title="Profile" description="Your details and face template.">
      <div className="grid gap-5">
        <ProfileSettings />
        <FaceBiometricsCard />
      </div>
    </DashboardShell>
  )
}
