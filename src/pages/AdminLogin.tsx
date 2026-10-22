import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/AuthContext"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function AdminLogin() {
  const { signInWithOtp } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  const handleBack = () => navigate(-1)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSubmitting(true)
    try {
      // No password: Supabase sends a magic-link confirmation email to the
      // address. The user clicks it, receives a session, and is redirected
      // back to /admin (guarded by AdminRoute).
      await signInWithOtp(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Magic-link sign-in failed")
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex flex-col relative overflow-hidden bg-background">
        <main className="flex-1 relative z-10">
          <div className="relative py-16 md:py-24 lg:py-32 px-4 md:px-6 lg:px-8">
            <div className="container-narrow">
              <div className="max-w-md mx-auto">
                <button
                  onClick={handleBack}
                  className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Go back"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back
                </button>

                <Card className="hairline-border bg-card/80 backdrop-blur-sm">
                  <CardHeader className="text-center pb-6">
                    <CardTitle className="heading-3">Check your email</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-4">
                      <Mail className="mx-auto h-12 w-12 text-primary" />
                      <p className="text-sm text-muted-foreground">
                        A confirmation link has been sent to{" "}
                        <span className="font-medium">{email}</span>. Open it to
                        sign in as admin.
                      </p>
                      <Button onClick={handleBack} className="w-full">
                        Back to sign in
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-background">
      <main className="flex-1 relative z-10">
        <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden="true">
          <div className="absolute inset-0 hero-gradient opacity-5" />
          <div className="absolute inset-0 hero-gradient-bottom opacity-10" />
        </div>

        <div className="relative py-16 md:py-24 lg:py-32 px-4 md:px-6 lg:px-8">
          <div className="container-narrow">
            <div className="max-w-md mx-auto">
              <button
                onClick={handleBack}
                className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Go back"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </button>

              <Card className="hairline-border bg-card/80 backdrop-blur-sm">
                <CardHeader className="text-center pb-6">
                  <CardTitle className="heading-3">Admin sign in</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <form onSubmit={handleSubmit} className="space-y-5">
                    {error && (
                      <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {error}
                      </p>
                    )}
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
                        placeholder="admin@example.com"
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      No password. Supabase will send a confirmation link to
                      this address.
                    </p>
                    <Button type="submit" className="w-full" disabled={submitting}>
                      {submitting ? "Sending magic link…" : (
                        <>
                          <Mail className="mr-2 h-4 w-4" />
                          Send magic link
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
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
