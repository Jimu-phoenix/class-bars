import { Link } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/AuthContext"

const features = [
  {
    title: "Face Detection",
    description: "Real-time face detection using SSD MobileNet v1. Identifies and tracks faces in the camera feed with bounding boxes and landmarks.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    ),
  },
  {
    title: "Face Recognition",
    description: "Generates a 128-d face descriptor vector for each detected face, enabling accurate face matching and identification against a known database.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
      </svg>
    ),
  },
  {
    title: "Attendance Recording",
    description: "Automated attendance logging by matching detected faces against registered student profiles. Eliminates manual roll calls and proxy attendance.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
  {
    title: "Biometric Security",
    description: "Uses unique facial features for verification, providing a secure and contactless alternative to PINs, cards, or signatures.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    ),
  },
]

const steps = [
  { number: "01", label: "Register", description: "Enroll student face data into the system" },
  { number: "02", label: "Detect", description: "Live camera captures faces in the classroom" },
  { number: "03", label: "Match", description: "Face descriptors are compared against enrolled data" },
  { number: "04", label: "Record", description: "Attendance is logged automatically" },
]

export default function Home() {
  const { user, loading, signOut } = useAuth()

  return (
    <div className="min-h-screen">
      <header className="section-padding border-b border-border">
        <div className="container-default">
          <div className="mb-8 flex items-center justify-end gap-3">
            {loading ? null : user ? (
              <>
                <span className="text-sm text-muted-foreground">
                  {user.email}
                </span>
                <Button variant="outline" size="sm" onClick={signOut}>
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="outline" size="sm">Sign in</Button>
                </Link>
                <Link to="/signup">
                  <Button size="sm">Sign up</Button>
                </Link>
              </>
            )}
          </div>

          <div className="text-center max-w-3xl mx-auto">
            <Badge variant="outline" className="mb-6 text-xs font-normal tracking-wide uppercase">
              Biometric Attendance Recording System
            </Badge>
            <h1 className="heading-1 text-foreground">
              Class-BARS
            </h1>
            <p className="mt-6 body-lg muted-text">
              Automated face recognition attendance for classrooms. Fast, secure, and contactless.
            </p>
            <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
              {user ? (
                user.user_metadata?.role === "lecturer" ? (
                  <>
                    <Link
                      to="/dashboard"
                      className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
                      </svg>
                      Lecturer dashboard
                    </Link>
                    <Link
                      to="/dashboard/sessions/new"
                      className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-background px-6 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      New session
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      to="/student"
                      className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                      </svg>
                      Open live classes
                    </Link>
                    <Link
                      to="/profile"
                      className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-background px-6 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      My profile
                    </Link>
                  </>
                )
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sign in to access face detection and verification tools.
                </p>
              )}
              <Link
                to="/face-test"
                className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-background px-6 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Learn more
              </Link>
              <Link
                to="/sandbox"
                className="inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                Try the demo
              </Link>
            </div>
          </div>
        </div>
      </header>

      <section className="section-padding border-b border-border">
        <div className="container-default">
          <div className="mb-12 text-center max-w-2xl mx-auto">
            <h2 className="heading-2 text-foreground">How it works</h2>
            <p className="mt-4 body-lg muted-text">
              From enrollment to attendance in four steps
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <Card key={step.number} className="text-center hairline-border">
                <CardContent className="py-8 px-6">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                    {step.number}
                  </span>
                  <h3 className="mt-4 text-base font-medium text-foreground">
                    {step.label}
                  </h3>
                  <p className="mt-2 text-sm muted-text">
                    {step.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-default">
          <div className="mb-12 text-center max-w-2xl mx-auto">
            <h2 className="heading-2 text-foreground">Features</h2>
            <p className="mt-4 body-lg muted-text">
              Everything you need for biometric attendance
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {features.map((feature) => (
              <Card key={feature.title} className="hairline-border">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {feature.icon}
                    </span>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="body-sm muted-text">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-10">
        <div className="container-default text-center">
          <p className="text-xs muted-text">Class-BARS &mdash; Biometric Attendance Recording System</p>
        </div>
      </footer>
    </div>
  )
}
