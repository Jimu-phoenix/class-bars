import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { GraduationCap } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function Signup() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [lecturerSubmitting, setLecturerSubmitting] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const busy = submitting || lecturerSubmitting

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")
    setSubmitting(true)
    try {
      const { needsConfirmation } = await signUp(email, password, fullName)
      if (needsConfirmation) {
        setEmailSent(true)
        return
      }
      navigate("/onboarding")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed")
    } finally {
      setSubmitting(false)
    }
  }

  const handleLecturerSignup = async () => {
    setError("")
    setLecturerSubmitting(true)
    try {
      const { needsConfirmation } = await signUp(
        email,
        password,
        fullName,
        "lecturer"
      )
      if (needsConfirmation) {
        setEmailSent(true)
        return
      }
      navigate("/dashboard")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed")
    } finally {
      setLecturerSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 section-padding">
      <Card className="w-full max-w-sm hairline-border">
        <CardHeader className="text-center pb-6">
          <CardTitle className="heading-3">Create account</CardTitle>
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
                  placeholder="John Doe"
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
              <Button type="submit" className="w-full" disabled={busy}>
                {submitting ? "Creating account…" : "Create account"}
              </Button>
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs muted-text">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={handleLecturerSignup}
              >
                {lecturerSubmitting ? (
                  "Creating lecturer account…"
                ) : (
                  <>
                    <GraduationCap data-icon="inline-start" />
                    Sign up as lecturer
                  </>
                )}
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
