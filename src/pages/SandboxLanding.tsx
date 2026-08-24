import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { GraduationCap, Loader2, Presentation } from "lucide-react"
import { joinSandbox, SANDBOX_DEFAULTS } from "@/lib/sandbox"
import SandboxShell from "@/components/SandboxShell"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type Role = "sandbox_lecturer" | "sandbox_student"

export default function SandboxLanding() {
  const navigate = useNavigate()
  const [joining, setJoining] = useState<Role | null>(null)
  const [error, setError] = useState("")

  const join = async (role: Role) => {
    setJoining(role)
    setError("")
    try {
      const result = await joinSandbox(role)
      if (!result.ok) {
        setError(result.error)
        setJoining(null)
        return
      }
      navigate(role === "sandbox_lecturer" ? "/sandbox/lecturer" : "/sandbox/student")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join sandbox")
      setJoining(null)
    }
  }

  const handleSubmit = (e: FormEvent, role: Role) => {
    e.preventDefault()
    void join(role)
  }

  return (
    <SandboxShell
      title="Try Class-BARS"
      description="A fully self-contained demo. No accounts needed — pick a side."
    >
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-4 sm:flex-row">
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Lecturer</CardTitle>
            <CardDescription>
              Start the default test class and watch check-ins arrive live.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              onClick={(e) => handleSubmit(e, "sandbox_lecturer")}
              disabled={joining !== null}
              className="flex w-full flex-col items-center gap-2 rounded-xl border border-border bg-card p-6 text-center shadow-xs transition-colors hover:bg-muted disabled:opacity-50"
            >
              {joining === "sandbox_lecturer" ? (
                <Loader2 className="size-6 animate-spin text-primary" />
              ) : (
                <Presentation className="size-6 text-primary" />
              )}
              <span className="text-lg font-semibold">Join as Lecturer</span>
              <span className="text-sm text-muted-foreground">
                Opens the sandbox dashboard with a ready-to-start class
              </span>
            </button>
          </CardContent>
        </Card>

        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Student</CardTitle>
            <CardDescription>
              Check in with your face once a class is live. Camera required.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              onClick={(e) => handleSubmit(e, "sandbox_student")}
              disabled={joining !== null}
              className="flex w-full flex-col items-center gap-2 rounded-xl border border-border bg-card p-6 text-center shadow-xs transition-colors hover:bg-muted disabled:opacity-50"
            >
              {joining === "sandbox_student" ? (
                <Loader2 className="size-6 animate-spin text-primary" />
              ) : (
                <GraduationCap className="size-6 text-primary" />
              )}
              <span className="text-lg font-semibold">Join as Student</span>
              <span className="text-sm text-muted-foreground">
                Waits for a live class, then captures your face to check in
              </span>
            </button>
          </CardContent>
        </Card>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Default class: {SANDBOX_DEFAULTS.classLabel} · {SANDBOX_DEFAULTS.courseLabel} ·{" "}
        {SANDBOX_DEFAULTS.venueLabel}
      </p>
    </SandboxShell>
  )
}
