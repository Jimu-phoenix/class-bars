import { Link } from "react-router-dom"

const quickLinks = [
  { label: "Home", to: "/" },
  { label: "Privacy Policy", to: "/privacy" },
  { label: "Sign In", to: "/login" },
  { label: "Sign Up", to: "/signup" },
]

const productLinks = [
  { label: "Lecturer Dashboard", to: "/dashboard" },
  { label: "Student Portal", to: "/student" },
  { label: "Sandbox Demo", to: "/sandbox" },
]

const legalLinks = [
  { label: "Privacy Policy", to: "/privacy" }
]

export default function Footer() {
  return (
    <footer className="border-t border-border bg-muted/30" role="contentinfo">
      <div className="container-default py-12 lg:py-16">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <Link to="/" className="font-heading text-xl font-semibold tracking-tight" aria-label="Class-BARS home">
              Class-BARS
            </Link>
            <p className="mt-4 text-sm text-muted-foreground max-w-xs">
              Biometric Attendance Recording System. Automated face recognition attendance for classrooms.
            </p>
          </div>

          <nav aria-label="Quick links">
            <h3 className="font-medium text-foreground">Quick Links</h3>
            <ul className="mt-4 space-y-3">
              {quickLinks.map(({ label, to }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Product">
            <h3 className="font-medium text-foreground">Product</h3>
            <ul className="mt-4 space-y-3">
              {productLinks.map(({ label, to }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Legal">
            <h3 className="font-medium text-foreground">Legal</h3>
            <ul className="mt-4 space-y-3">
              {legalLinks.map(({ label, to }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col md:flex-row items-center justify-between gap-4 border-t border-border pt-8">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Class-BARS. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <a
              href="https://github.com/Jimu-phoenix"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              aria-label="GitHub"
            >
              GitHub
            </a>
            <a
              href="https://www.instagram.com/phoenix_visi0n/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Instagram"
            >
              Instagram
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}