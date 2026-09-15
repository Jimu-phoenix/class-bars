import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"

const sections = [
  {
    id: "data-collection",
    title: "Data Collection & Use",
    content: `
      <p>Class-BARS collects only the data necessary to provide biometric attendance recording services:</p>
      <ul className="list-disc list-inside space-y-2 mt-4">
        <li><strong>Account Information:</strong> Email address, name, and role (lecturer/student) for authentication and authorization.</li>
        <li><strong>Face Embeddings:</strong> A 128-dimensional numerical vector (face descriptor) derived from facial landmarks. This is a mathematical representation, not an image.</li>
        <li><strong>Attendance Records:</strong> Timestamp, session ID, course ID, and verification method when you check in.</li>
        <li><strong>Device Information:</strong> Browser fingerprint and device ID for fraud prevention (optional, opt-in).</li>
      </ul>
    `,
  },
  {
    id: "face-data",
    title: "Face Data Protection",
    content: `
      <p className="text-lg font-medium mb-4">Your biometric data is handled with the highest security standards:</p>
      <ul className="list-disc list-inside space-y-3">
        <li><strong>No Images Stored:</strong> We never store, transmit, or process raw face images or photos. Only the 128-dimensional face descriptor (embedding) is stored.</li>
        <li><strong>Encrypted at Rest:</strong> All face embeddings are encrypted in the database using AES-256 encryption. Database backups are also encrypted.</li>
        <li><strong>Encrypted in Transit:</strong> All data transmission uses TLS 1.3 encryption.</li>
        <li><strong>Self-Sovereign Templates:</strong> Each user owns their face template. You can delete your face embedding at any time from your profile settings.</li>
        <li><strong>Local Processing:</strong> Face detection and descriptor generation happen entirely in your browser using face-api.js. Raw camera frames never leave your device.</li>
      </ul>
    `,
  },
  {
    id: "data-retention",
    title: "Data Retention & Deletion",
    content: `
      <ul className="list-disc list-inside space-y-2">
        <li>Face embeddings are retained until you delete them or your account is deleted.</li>
        <li>Attendance records are retained for 7 years for institutional compliance, then anonymized.</li>
        <li>Account data is deleted within 30 days of account deletion request.</li>
        <li>You can request full data export or deletion at any time via your profile settings.</li>
      </ul>
    `,
  },
  {
    id: "third-party",
    title: "Third-Party Services",
    content: `
      <ul className="list-disc list-inside space-y-2">
        <li><strong>Supabase:</strong> Hosted PostgreSQL database, authentication, and storage (EU/US regions). Supabase is SOC2 Type II certified.</li>
        <li><strong>hCaptcha:</strong> Used for bot protection during signup and sandbox access. No personal data shared beyond IP address.</li>
        <li><strong>Vercel:</strong> Hosting and CDN. Analytics are anonymized and opt-in.</li>
      </ul>
      <p className="mt-4">We do not sell, rent, or share your personal data with advertisers or data brokers.</p>
    `,
  },
  {
    id: "security",
    title: "Security Measures",
    content: `
      <ul className="list-disc list-inside space-y-2">
        <li>Row-Level Security (RLS) policies enforce data isolation at the database level.</li>
        <li>All API endpoints require authentication; sensitive operations use SECURITY DEFINER functions.</li>
        <li>Rate limiting on authentication endpoints prevents brute-force attacks.</li>
        <li>Content Security Policy (CSP) headers restrict resource loading.</li>
        <li>Regular security audits and dependency scanning.</li>
      </ul>
    `,
  },
  {
    id: "rights",
    title: "Your Rights",
    content: `
      <p>Under GDPR and similar regulations, you have the right to:</p>
      <ul className="list-disc list-inside space-y-2 mt-4">
        <li>Access your personal data</li>
        <li>Rectify inaccurate data</li>
        <li>Erase your data ("right to be forgotten")</li>
        <li>Restrict processing</li>
        <li>Data portability</li>
        <li>Object to processing</li>
      </ul>
      <p className="mt-4">Exercise these rights via your profile settings or contact us at privacy@class-bars.example.com.</p>
    `,
  },
]

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 pt-16 pb-12">
        <div className="container-narrow">
          <header className="mb-12 md:mb-16 text-center">
            <h1 className="heading-1 font-heading tracking-tighter">Privacy Policy</h1>
            <p className="mt-4 body-lg muted-text max-w-2xl mx-auto">
              Last updated: September 2026. This policy explains how Class-BARS collects, uses, and protects your data.
            </p>
          </header>

          <div className="grid gap-10 lg:gap-14">
            {sections.map((section) => (
              <article
                key={section.id}
                id={section.id}
                className="space-y-4 p-6 md:p-8 rounded-xl border border-border bg-card transition-shadow hover:shadow-md"
              >
                <h2 className="heading-3 font-heading">{section.title}</h2>
                <div className="prose prose-sm prose-muted max-w-none text-muted-foreground">
                  <div dangerouslySetInnerHTML={{ __html: section.content }} />
                </div>
              </article>
            ))}
          </div>

          <div className="mt-16 p-6 rounded-xl border border-border bg-muted/50 text-center">
            <h3 className="font-heading text-lg font-semibold">Questions?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Contact our Data Protection Officer at
              <a href="mailto:privacy@class-bars.example.com" className="underline hover:text-primary">
                privacy@class-bars.example.com
              </a>
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}