import { Link } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useRole } from "@/contexts/RoleContext"
import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"

const features = [
  {
    title: "Face Detection",
    description: "Real-time face detection using SSD MobileNet v1. Identifies and tracks faces in the camera feed with bounding boxes and landmarks.",
  },
  {
    title: "Face Recognition",
    description: "Generates a 128-d face descriptor vector for each detected face, enabling accurate face matching against enrolled templates.",
  },
  {
    title: "Attendance Recording",
    description: "Automated attendance logging by matching detected faces against registered student profiles. Eliminates manual roll calls.",
  },
  {
    title: "Biometric Security",
    description: "Uses unique facial features for verification, providing a secure and contactless alternative to PINs, cards, or signatures.",
  },
]

const steps = [
  { number: "01", label: "Register", description: "Enroll student face data into the system" },
  { number: "02", label: "Detect", description: "Live camera captures faces in the classroom" },
  { number: "03", label: "Match", description: "Face descriptors compared against enrolled data" },
  { number: "04", label: "Record", description: "Attendance logged automatically" },
]

const stats = [
  { value: "128-d", label: "Face Descriptors" },
  { value: "~2s", label: "Match Latency" },
  { value: "AES-256", label: "Encryption" },
  { value: "Local", label: "Processing" },
]

export default function Home() {
  const { user } = useAuth()
  const { role } = useRole()

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-background">
      <Navbar />

      <main className="flex-1 relative z-10">
        <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden="true">
          <div className="absolute inset-0 hero-gradient opacity-5" />
          <div className="absolute inset-0 hero-gradient-bottom opacity-10" />
          <div
            className="absolute inset-0 opacity-20 grid-bg-primary"
          />
          <div
            className="absolute inset-0 opacity-10 grid-bg-secondary animate-grid-move"
          />
        </div>

        <section className="relative pt-28 pb-16 md:pt-36 md:pb-24 lg:pt-44 lg:pb-32 px-4 md:px-6 lg:px-8">
          <div className="container-narrow">
            <div className="max-w-3xl mx-auto text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
                <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                </span>
                v0.1.0 — Technical Preview
              </span>

              <h1 className="mt-8 heading-1 font-heading tracking-tighter text-balance lg:text-7xl">
                Class.BARS
                <br />
                <span className="text-muted-foreground/60 font-normal">Biometric Attendance</span>
              </h1>

              <p className="mt-6 body-lg muted-text max-w-2xl mx-auto text-pretty">
                Automated face recognition attendance for classrooms. Fast, secure, and contactless.
                All processing happens locally <br /> No face images ever leave your device.
              </p>

              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                {user ? (
                  role === "lecturer" ? (
                    <>
                      <Link
                        to="/dashboard"
                        className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
                      >
                        Lecturer Dashboard
                      </Link>
                      <Link
                        to="/dashboard/sessions/new"
                        className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-background px-6 text-sm font-medium transition-colors hover:bg-muted"
                      >
                        New Session
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link
                        to="/student"
                        className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
                      >
                        Open Live Classes
                      </Link>
                      <Link
                        to="/student/profile"
                        className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-background px-6 text-sm font-medium transition-colors hover:bg-muted"
                      >
                        My Profile
                      </Link>
                    </>
                  )
                ) : (
                  <>
                    <Link
                      to="/signup"
                      className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
                    >
                      Get Started
                    </Link>
                    <Link
                      to="/sandbox"
                      className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-background px-6 text-sm font-medium transition-colors hover:bg-muted"
                    >
                      Try Demo
                    </Link>
                  </>
                )}
                <Link
                  to="/face-test"
                  className="inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  Technical Docs
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="relative py-16 md:py-24 lg:py-32 px-4 md:px-6 lg:px-8 border-t border-border/50">
          <div className="container-default">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-16">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="p-4 md:p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm transition-all hover:border-primary/50 hover:shadow-lg"
                >
                  <p className="font-heading text-2xl md:text-3xl lg:text-4xl font-semibold tracking-tight text-foreground">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="mb-16 text-center max-w-2xl mx-auto">
              <h2 className="heading-2 font-heading tracking-tight">How It Works</h2>
              <p className="mt-4 body-lg muted-text">From enrollment to attendance in four steps</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {steps.map((step) => (
                <article
                  key={step.number}
                  className="group relative p-6 md:p-8 rounded-xl border border-border bg-card/50 backdrop-blur-sm transition-all hover:border-primary/50 hover:shadow-lg"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary font-mono">
                      {step.number}
                    </span>
                    <h3 className="font-medium text-foreground">{step.label}</h3>
                  </div>
                  <p className="text-sm muted-text">{step.description}</p>
                  <div className="absolute inset-0 bg-gradient-to-t from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-xl" />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="relative py-16 md:py-24 lg:py-32 px-4 md:px-6 lg:px-8 border-t border-border/50">
          <div className="container-default">
            <div className="mb-12 md:mb-16 text-center max-w-2xl mx-auto">
              <h2 className="heading-2 font-heading tracking-tight">Technical Features</h2>
              <p className="mt-4 body-lg muted-text">Built for performance, security, and privacy</p>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              {features.map((feature) => (
                <article
                  key={feature.title}
                  className="group p-6 md:p-8 rounded-xl border border-border bg-card/50 backdrop-blur-sm transition-all hover:border-primary/50 hover:shadow-lg"
                >
                  <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground">{feature.title}</h3>
                  <p className="mt-3 body-sm muted-text">{feature.description}</p>
                  <div className="mt-4 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="relative py-16 md:py-24 lg:py-32 px-4 md:px-6 lg:px-8 border-t border-border/50">
          <div className="container-default">
            <div className="relative rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-background to-muted/30 p-8 md:p-12 lg:p-16 text-center overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--primary)_0%,transparent_70%)] opacity-10" aria-hidden="true" />
              <div className="relative z-10 max-w-2xl mx-auto">
                <h2 className="heading-2 font-heading tracking-tight">Ready to Get Started?</h2>
                <p className="mt-4 body-lg muted-text">
                  Join lecturers and students using Class-BARS for secure, automated attendance.
                  Try the sandbox demo or create your account.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link
                    to="/signup"
                    className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
                  >
                    Create Account
                  </Link>
                  <Link
                    to="/sandbox"
                    className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-background px-6 text-sm font-medium transition-colors hover:bg-muted"
                  >
                    Try Sandbox Demo
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}