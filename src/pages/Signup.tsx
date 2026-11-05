import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft, Fingerprint, GraduationCap, Home, MailCheck, School } from "lucide-react"
import { useAuth, type SignUpRole } from "@/contexts/AuthContext"
import { postSignupPath } from "@/lib/rolePolicy"
import { Button } from "@/components/ui/button"
import CaptchaGate from "@/components/CaptchaGate"
import { useCaptcha } from "@/hooks/useCaptcha"
import { cn } from "@/lib/utils"

const inputClass =
  "w-full h-11 rounded-2xl border border-input bg-muted/40 px-4 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

const roleButtonClass = (active: boolean) =>
  cn(
    "flex h-10 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors",
    active
      ? "bg-[#e4f585] text-neutral-900 shadow-sm"
      : "text-muted-foreground hover:text-foreground",
  )

export default function Signup() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [role, setRole] = useState<SignUpRole>("student")
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const { captchaRef, onVerify, onExpire, onError, captchaReady } = useCaptcha()

  const handleBack = () => navigate(-1)

  const switchRole = (next: SignUpRole) => {
    if (next === role) return
    setRole(next)
    setError("")
    onError()
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
      )
      if (needsConfirmation) {
        setEmailSent(true)
        return
      }
      navigate(postSignupPath(role))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed")
      onError()
    } finally {
      setSubmitting(false)
    }
  }

  const roleLabel = role === "lecturer" ? "lecturer" : "student"

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <main className="flex flex-1 items-center justify-center px-3 py-8 sm:px-4 sm:py-16">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center justify-between gap-3">
            <button
              onClick={handleBack}
              className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Go back"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back
            </button>
            <Link
              to="/"
              className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              <Home className="size-4" aria-hidden="true" />
              Back to home
            </Link>
          </div>

          <div className="rounded-3xl border border-border/60 bg-card p-5 sm:p-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-foreground">
                <Fingerprint className="size-7" strokeWidth={1.5} aria-hidden="true" />
              </span>
              <h1 className="font-heading text-2xl font-medium tracking-tight text-balance">
                Create {roleLabel} account
              </h1>
              <p className="text-sm text-muted-foreground">Join Class-BARS in a minute.</p>
            </div>

            {emailSent ? (
              <div className="mt-8 space-y-5 text-center">
                <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted/60 px-4 py-6">
                  <span className="flex size-12 items-center justify-center rounded-full bg-[#e4f585] text-neutral-900">
                    <MailCheck className="size-6" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <p className="text-sm text-pretty">
                    We sent a confirmation link to{" "}
                    <span className="font-medium break-all">{email}</span>. Confirm your
                    email, then sign in to continue.
                  </p>
                </div>
                <Link
                  to="/login"
                  className="inline-flex h-11 items-center justify-center rounded-full border border-border bg-background px-6 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Go to sign in
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
                  <button
                    type="button"
                    onClick={() => switchRole("student")}
                    aria-pressed={role === "student"}
                    className={roleButtonClass(role === "student")}
                  >
                    <GraduationCap className="size-4" aria-hidden="true" />
                    Student
                  </button>
                  <button
                    type="button"
                    onClick={() => switchRole("lecturer")}
                    aria-pressed={role === "lecturer"}
                    className={roleButtonClass(role === "lecturer")}
                  >
                    <School className="size-4" aria-hidden="true" />
                    Lecturer
                  </button>
                </div>
                {error && (
                  <p
                    role="alert"
                    className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
                  >
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
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={inputClass}
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
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
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
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    placeholder="••••••••"
                  />
                </div>
                <div className="flex justify-center overflow-x-auto">
                  <CaptchaGate
                    ref={captchaRef}
                    onVerify={onVerify}
                    onExpire={onExpire}
                    onError={onError}
                  />
                </div>
                <Button
                  type="submit"
                  className="h-11 w-full rounded-full bg-foreground text-sm font-medium text-background hover:bg-foreground/85"
                  disabled={submitting || !captchaReady}
                >
                  {submitting
                    ? `Creating ${roleLabel} account…`
                    : `Create ${roleLabel} account`}
                </Button>
                <p className="text-center text-sm muted-text">
                  Already have an account?{" "}
                  <Link to="/login" className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80">
                    Sign in
                  </Link>
                </p>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}