import { useRef, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { mapAuthError } from "@/lib/authErrors"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import RecaptchaGate, {
  type RecaptchaGateHandle,
} from "@/components/RecaptchaGate"

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const captchaRef = useRef<RecaptchaGateHandle>(null)

  const handleBack = () => navigate(-1)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")
    setSubmitting(true)
    try {
      // The captcha here is a client-side speed bump only: it is not
      // verified server-side (no auth hook, native captcha off).
      await signIn(email, password)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      let target = "/profile"
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle()
        // Authoritative role comes from profiles.role. There is deliberately
        // no `user_metadata` fallback: that value is client-writable.
        if (profile?.role === "lecturer") target = "/dashboard"
        else if (profile?.role === "student") target = "/student"
      }
      navigate(target)
    } catch (err) {
      setError(mapAuthError(err instanceof Error ? err.message : "Login failed"))
      setCaptchaToken(null)
      captchaRef.current?.reset()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-background">
      <main className="flex-1 relative z-10">
        <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden="true">
          <div className="absolute inset-0 hero-gradient opacity-5" />
          <div className="absolute inset-0 hero-gradient-bottom opacity-10" />
          <div className="absolute inset-0 opacity-20 grid-bg-primary" />
          <div className="absolute inset-0 opacity-10 grid-bg-secondary animate-grid-move" />
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
                  <CardTitle className="heading-3">Sign in</CardTitle>
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
                    <RecaptchaGate
                      ref={captchaRef}
                      onVerify={setCaptchaToken}
                      onExpire={() => setCaptchaToken(null)}
                      onError={() => setCaptchaToken(null)}
                    />
                    <Button type="submit" className="w-full" disabled={submitting || !captchaToken}>
                      {submitting ? "Signing in…" : "Sign in"}
                    </Button>
                    <p className="text-center text-sm muted-text">
                      Don&apos;t have an account?{" "}
                      <Link to="/signup" className="text-primary hover:underline font-medium">
                        Sign up
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