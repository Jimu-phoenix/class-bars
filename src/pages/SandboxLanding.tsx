import { useEffect, useRef, useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { GraduationCap, Loader2, Presentation } from "lucide-react"
import { joinSandbox, SANDBOX_DEFAULTS } from "@/lib/sandbox"
import { warmFaceModels } from "@/lib/faceModels"
import HcaptchaGate, { type HcaptchaGateHandle } from "@/components/HcaptchaGate"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"

type Role = "sandbox_lecturer" | "sandbox_student"

const CAPTCHA_REQUIRED = Boolean(import.meta.env.VITE_HCAPTCHA_SITEKEY)

export default function SandboxLanding() {
  const navigate = useNavigate()
  const [joining, setJoining] = useState<Role | null>(null)
  const [error, setError] = useState("")
  const [captchaToken, setCaptchaToken] = useState("")
  const captchaRef = useRef<HcaptchaGateHandle>(null)

  const canJoin = !CAPTCHA_REQUIRED || captchaToken !== ""

  useEffect(() => {
    void warmFaceModels()
  }, [])

  const join = async (role: Role) => {
    setJoining(role)
    setError("")
    try {
      const result = await joinSandbox(role, captchaToken || undefined)
      if (!result.ok) {
        setError(result.error)
        setJoining(null)
        setCaptchaToken("")
        captchaRef.current?.reset()
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
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-background">
      <Navbar />

      <main className="flex-1 relative z-10">
        <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden="true">
          <div className="absolute inset-0 hero-gradient opacity-5" />
          <div className="absolute inset-0 hero-gradient-bottom opacity-10" />
          <div className="absolute inset-0 opacity-20 grid-bg-primary" />
          <div className="absolute inset-0 opacity-10 grid-bg-secondary animate-grid-move" />
        </div>

        <div className="relative py-16 md:py-24 lg:py-32 px-4 md:px-6 lg:px-8">
          <div className="container-default">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12 md:mb-16">
                <h1 className="heading-1 font-heading tracking-tighter text-balance">Try Class-BARS</h1>
                <p className="mt-4 body-lg muted-text max-w-2xl mx-auto">
                  A fully self-contained demo. No accounts needed — pick a side.
                </p>
              </div>

              {error && (
                <p className="mb-8 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive text-center">
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
                      disabled={joining !== null || !canJoin}
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
                      disabled={joining !== null || !canJoin}
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

              <div className="mt-8 flex flex-col items-center gap-2">
                <HcaptchaGate
                  ref={captchaRef}
                  onVerify={setCaptchaToken}
                  onExpire={() => setCaptchaToken("")}
                  onError={() => setCaptchaToken("")}
                />
                {CAPTCHA_REQUIRED && !captchaToken && (
                  <p className="text-xs text-muted-foreground">
                    Complete the verification above to enable joining.
                  </p>
                )}
              </div>

              <p className="mt-8 text-center text-xs text-muted-foreground">
                Default class: {SANDBOX_DEFAULTS.classLabel} · {SANDBOX_DEFAULTS.courseLabel} ·{" "}
                {SANDBOX_DEFAULTS.venueLabel}
              </p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}