import { useCallback } from "react"
import DashboardShell from "@/components/DashboardShell"
import ProfileSettings from "@/components/dashboard/ProfileSettings"
import ConsentCard from "@/components/dashboard/ConsentCard"
import DangerZoneCard from "@/components/dashboard/DangerZoneCard"
import FaceBiometricsCard from "@/components/dashboard/FaceBiometricsCard"

export default function StudentProfile() {
  const onConsentRecorded = useCallback(() => {
    // Dispatch so StudentHome banner disappears without a page reload.
    window.dispatchEvent(new CustomEvent("consent-recorded"))
  }, [])

  return (
    <DashboardShell title="Profile" description="Your details and face template.">
      <div className="grid gap-5">
        <ProfileSettings />
        <ConsentCard onConsentRecorded={onConsentRecorded} />
        <FaceBiometricsCard />
        <DangerZoneCard />
      </div>
    </DashboardShell>
  )
}
