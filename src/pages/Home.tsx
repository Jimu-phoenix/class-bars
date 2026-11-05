import { Link } from "react-router-dom"
import {
  ArrowUpRight,
  Camera,
  ClipboardCheck,
  Fingerprint,
  KeyRound,
  MapPin,
  ScanFace,
  ScanLine,
  UserCheck,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useRole } from "@/contexts/RoleContext"
import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"

const features = [
  {
    title: "Face Detection",
    icon: ScanLine,
    description:
      "Real-time face detection in the browser, with landmarks used to check pose and image quality before each capture.",
  },
  {
    title: "Face Recognition",
    icon: ScanFace,
    description:
      "Generates a 128-d face descriptor vector for each detected face, enabling accurate face matching against enrolled templates.",
  },
  {
    title: "Attendance Recording",
    icon: ClipboardCheck,
    description:
      "Automated attendance logging by matching detected faces against registered student profiles. Eliminates manual roll calls.",
  },
  {
    title: "Biometric Security",
    icon: Fingerprint,
    description:
      "Uses unique facial features for verification, providing a secure and contactless alternative to PINs, cards, or signatures.",
  },
]

const steps = [
  { number: "01", label: "Register", icon: UserCheck, description: "Enroll student face data into the system" },
  { number: "02", label: "Detect", icon: Camera, description: "Live camera captures faces in the classroom" },
  { number: "03", label: "Match", icon: Fingerprint, description: "Face descriptors compared against enrolled data" },
  { number: "04", label: "Record", icon: ClipboardCheck, description: "Attendance logged automatically" },
]

const methods = [
  { label: "Face check-in", icon: ScanFace, description: "Verified against your enrolled template" },
  { label: "Location check", icon: MapPin, description: "Confirms you are in the classroom" },
  { label: "OTP fallback", icon: KeyRound, description: "A one-time code when face check-in fails" },
  { label: "Lecturer mark", icon: UserCheck, description: "Manual mark for students without a device" },
]

const stats = [
  { value: "128", label: "Numbers per face template" },
  { value: "3", label: "Frames per verification" },
  { value: "0", label: "Face photos stored" },
  { value: "On-device", label: "Face matching" },
]

const primaryButton =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-colors hover:bg-foreground/85"
const secondaryButton =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-background px-6 text-sm font-medium transition-colors hover:bg-muted"

export default function Home() {
  const { user } = useAuth()
  const { role } = useRole()

  return (
    <div className="flex min-h-screen flex-col bg-background bg-[url('data:image/svg+xml,%3Csvg%20width=%2224%22%20height=%2224%22%20xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cpath%20fill=%22none%22%20stroke=%22%2394a3b8%22%20stroke-width=%220.5%22%20stroke-opacity=%220.16%22%20d=%22M24%200v24M24%2024H0%22/%3E%3C/svg%3E')] [background-size:96px_96px] [background-repeat:repeat] [background-attachment:fixed]">
      <Navbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="px-4 pt-32 pb-16 md:px-6 md:pt-40 md:pb-20 lg:px-8 lg:pt-48 lg:pb-24">
          <div className="container-narrow">
            <div className="mx-auto max-w-4xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-medium text-muted-foreground">
                <Fingerprint className="size-3.5" aria-hidden="true" />
                v0.1.0 — Technical Preview
              </span>

              <h1 className="font-heading mt-8 text-5xl leading-[1.05] font-medium tracking-tighter text-balance md:text-6xl lg:text-7xl">
                Biometric attendance
                <br />
                for{" "}
                <span
                  className="mx-1 inline-flex h-[0.72em] w-[1.5em] translate-y-[0.05em] items-center justify-center rounded-full bg-foreground align-baseline text-background"
                  aria-hidden="true"
                >
                  <ScanFace className="size-[0.46em]" strokeWidth={1.75} />
                </span>{" "}
                every class
              </h1>

              <p className="body-lg muted-text mx-auto mt-8 max-w-2xl text-pretty">
                Face-recognition attendance for classrooms. Fast, contactless and consent-based. Face
                detection and matching run on your device, and no face photos are ever stored or uploaded.
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
                {user ? (
                  role === "lecturer" ? (
                    <>
                      <Link to="/dashboard" className={primaryButton}>
                        Lecturer Dashboard
                        <ArrowUpRight className="size-4" aria-hidden="true" />
                      </Link>
                      <Link to="/dashboard/sessions/new" className={secondaryButton}>
                        New Session
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link to="/student" className={primaryButton}>
                        Open Live Classes
                        <ArrowUpRight className="size-4" aria-hidden="true" />
                      </Link>
                      <Link to="/student/profile" className={secondaryButton}>
                        My Profile
                      </Link>
                    </>
                  )
                ) : (
                  <>
                    <Link to="/signup" className={primaryButton}>
                      Get Started
                      <ArrowUpRight className="size-4" aria-hidden="true" />
                    </Link>
                    <Link to="/sandbox" className={secondaryButton}>
                      Try Demo
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Ways to check in */}
        <section className="px-4 pb-16 md:px-6 md:pb-24 lg:px-8">
          <div className="container-default">
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
              {methods.map(({ label, icon: Icon, description }) => (
                <li
                  key={label}
                  className="flex flex-col items-start gap-4 rounded-3xl bg-background p-5 md:p-6"
                >
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-background text-foreground">
                    <Icon className="size-6" strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="font-heading text-sm font-semibold md:text-base">{label}</p>
                    <p className="mt-1 text-xs text-muted-foreground md:text-sm">{description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Facts */}
        <section className="px-4 pb-20 md:px-6 md:pb-28 lg:px-8">
          <div className="container-default">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-8 rounded-3xl border border-border bg-background px-6 py-8 text-center md:grid-cols-4 md:py-10">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <dt className="sr-only">{stat.label}</dt>
                  <dd className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">
                    {stat.value}
                  </dd>
                  <p className="mt-1.5 text-xs text-muted-foreground md:text-sm" aria-hidden="true">
                    {stat.label}
                  </p>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* How it works */}
        <section className="px-4 py-16 md:px-6 md:py-24 lg:px-8">
          <div className="container-default">
            <div className="mx-auto mb-14 max-w-2xl text-center md:mb-20">
              <h2 className="heading-2 font-heading tracking-tight">How It Works</h2>
              <p className="body-lg muted-text mt-4">From enrollment to attendance in four steps</p>
            </div>

            <ol className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
              {steps.map((step) => (
                <li key={step.number} className="border-t border-foreground/15 pt-6">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm text-muted-foreground">{step.number}</span>
                    <step.icon className="size-6 text-foreground" strokeWidth={1.5} aria-hidden="true" />
                  </div>
                  <h3 className="font-heading mt-8 text-lg font-semibold tracking-tight">{step.label}</h3>
                  <p className="muted-text mt-2 text-sm">{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Technical features */}
        <section className="px-4 py-16 md:px-6 md:py-24 lg:px-8">
          <div className="container-default">
            <div className="mx-auto mb-12 max-w-2xl text-center md:mb-16">
              <h2 className="heading-2 font-heading tracking-tight">Technical Features</h2>
              <p className="body-lg muted-text mt-4">Built for performance, security, and privacy</p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              {features.map((feature) => (
                <article
                  key={feature.title}
                  className="rounded-3xl border border-border bg-background p-7 transition-colors hover:bg-muted/40 md:p-9"
                >
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-foreground">
                    <feature.icon className="size-6" strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <h3 className="font-heading mt-6 text-lg font-semibold tracking-tight">{feature.title}</h3>
                  <p className="body-sm muted-text mt-3">{feature.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Final call to action */}
        <section className="px-4 py-16 md:px-6 md:py-24 lg:px-8 lg:pb-32">
          <div className="container-default">
              <div className="rounded-[2rem] bg-background px-6 py-14 text-center md:px-12 md:py-20">
              <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-foreground text-background">
                <Fingerprint className="size-7" strokeWidth={1.5} aria-hidden="true" />
              </span>
              <div className="mx-auto mt-8 max-w-2xl">
                <h2 className="heading-2 font-heading tracking-tight">Ready to Get Started?</h2>
                <p className="body-lg muted-text mt-4">
                  Join lecturers and students using Class-BARS for secure, automated attendance.
                  Try the sandbox demo or create your account.
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
                  <Link to="/signup" className={primaryButton}>
                    Create Account
                    <ArrowUpRight className="size-4" aria-hidden="true" />
                  </Link>
                  <Link to="/sandbox" className={secondaryButton}>
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