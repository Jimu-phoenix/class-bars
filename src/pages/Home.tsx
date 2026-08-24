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
    <div className="mx-auto min-h-screen max-w-5xl px-4 py-12 md:px-6 md:py-20">
      <header className="mb-16 text-center">
        <div className="mb-4 flex items-center justify-end gap-3">
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
        <Badge variant="outline" className="mb-4 text-xs font-normal tracking-wide uppercase">
          Biometric Attendance Recording System
        </Badge>
        <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">
          Class-BARS
        </h1>
        <p className="mt-3 text-base text-muted-foreground md:text-lg">
          Automated face recognition attendance for classrooms.
          Fast, secure, and contactless.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          {user ? (
            <>
              <Link
                to="/face-test"
                className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/80"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 4.75 19.25 9.75M14.25 4.75H9.75C7.54086 4.75 5.75 6.54086 5.75 8.75V15.25C5.75 17.4591 7.54086 19.25 9.75 19.25H14.25C16.4591 19.25 18.25 17.4591 18.25 15.25V9.75M14.25 4.75L18.25 8.75" />
                </svg>
                Open Face Detection Test
              </Link>
              <Link
                to="/face-verify"
                className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/80"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Open Face Verification
              </Link>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sign in to access face detection and verification tools.
            </p>
          )}
          <Link
            to="/face-test"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-5 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-muted"
          >
            Learn more
          </Link>
          <Link
            to="/sandbox"
            className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Try the demo
          </Link>
        </div>
      </header>

      <section className="mb-16">
        <div className="mb-8 text-center">
          <h2 className="text-xl font-semibold text-foreground">How it works</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            From enrollment to attendance in four steps
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <Card key={step.number} size="sm" className="text-center">
              <CardContent className="py-5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                  {step.number}
                </span>
                <h3 className="mt-3 text-sm font-medium text-foreground">
                  {step.label}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {step.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mb-16">
        <div className="mb-8 text-center">
          <h2 className="text-xl font-semibold text-foreground">Features</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything you need for biometric attendance
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {features.map((feature) => (
            <Card key={feature.title} size="sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    {feature.icon}
                  </span>
                  <CardTitle>{feature.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t border-border pt-6 text-center text-xs text-muted-foreground">
        <p>Class-BARS &mdash; Biometric Attendance Recording System</p>
      </footer>
    </div>
  )
}
