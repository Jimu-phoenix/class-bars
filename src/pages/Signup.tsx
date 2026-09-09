import { useRef, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { GraduationCap, School } from "lucide-react"
import { useAuth, type SignUpRole } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import HcaptchaGate, {
  type HcaptchaGateHandle,
} from "@/components/HcaptchaGate"
import { cn } from "@/lib/utils"

export default function Signup() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [role, setRole] = useState<SignUpRole>("student")
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const captchaRef = useRef<HcaptchaGateHandle>(null)

  const switchRole = (next: SignUpRole) => {
    if (next === role) return
    setRole(next)
    setError("")
    setCaptchaToken(null)
    captchaRef.current?.reset()
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")
    setSubmitting(true)
    try {
      const { needsConfirmation } = await signUp(
        email,
        password,
        fullName,
        role,
        captchaToken ?? undefined
      )
      if (needsConfirmation) {
        setEmailSent(true)
        return
      }
      navigate(role === "lecturer" ? "/dashboard" : "/onboarding")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed")
      setCaptchaToken(null)
      captchaRef.current?.reset()
    } finally {
      setSubmitting(false)
    }
  }

  const roleLabel = role === "lecturer" ? "lecturer" : "student"

  return (
    <div className="min-h-screen flex items-center justify-center px-4 section-padding">
      <Card className="w-full max-w-sm hairline-border">
        <CardHeader className="text-center pb-6">
          <CardTitle className="heading-3">Create {roleLabel} account</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {emailSent ? (
            <div className="space-y-4 text-center">
              <p className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
                We sent a confirmation link to{" "}
                <span className="font-medium">{email}</span>. Confirm your
                email, then sign in to continue.
              </p>
              <Link
                to="/login"
                className="inline-flex rounded-md border border-border bg-background px-3 py-2 text-sm font-medium shadow-xs transition-colors hover:bg-muted"
              >
                Go to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                <button
                  type="button"
                  onClick={() => switchRole("student")}
                  aria-pressed={role === "student"}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    role === "student"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <GraduationCap className="size-4" aria-hidden="true" />
                  Student
                </button>
                <button
                  type="button"
                  onClick={() => switchRole("lecturer")}
                  aria-pressed={role === "lecturer"}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    role === "lecturer"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <School className="size-4" aria-hidden="true" />
                  Lecturer
                </button>
              </div>
              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="space-y-1.5">
                <label htmlFor="fullName" className="text-sm font-medium">
                  Full name
                </label>
                <input
                  id="fullName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full input-radius border border-input bg-background px-3 py-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 transition-colors"
                  placeholder={role === "lecturer" ? "Jane Smith" : "John Doe"}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full input-radius border border-input bg-background px-3 py-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 transition-colors"
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full input-radius border border-input bg-background px-3 py-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 transition-colors"
                  placeholder="••••••••"
                />
              </div>
              <HcaptchaGate
                ref={captchaRef}
                onVerify={setCaptchaToken}
                onExpire={() => setCaptchaToken(null)}
                onError={() => setCaptchaToken(null)}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={submitting || !captchaToken}
              >
                {submitting
                  ? `Creating ${roleLabel} account…`
                  : `Create ${roleLabel} account`}
              </Button>
              <p className="text-center text-sm muted-text">
                Already have an account?{" "}
                <Link to="/login" className="text-primary hover:underline font-medium">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}