import { useEffect, useRef, useState } from "react"
import { ArrowLeft, KeyRound, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { getOtpQuota, sendAttendanceOtp, verifyAttendanceOtp, OtpApiError, type OtpQuota } from "@/lib/attendanceOtp"
import { geolocationErrorMessage, type Coordinates } from "@/lib/geofence"

export default function OtpFallbackCard({
  sessionId,
  getLocation,
  onSuccess,
  onBackToFace,
  onCancel,
}: {
  sessionId: string
  getLocation: () => Promise<Coordinates>
  onSuccess: (result: { flagged: boolean }) => void
  onBackToFace: () => void
  onCancel: () => void
}) {
  const [quota, setQuota] = useState<OtpQuota | null>(null)
  const [quotaLoading, setQuotaLoading] = useState(true)
  const [quotaError, setQuotaError] = useState("")

  const [code, setCode] = useState("")
  const [sendLoading, setSendLoading] = useState(false)
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [cooldown, setCooldown] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<number | null>(null)

  const loadQuota = async () => {
    setQuotaLoading(true)
    setQuotaError("")
    try {
      const q = await getOtpQuota(sessionId)
      setQuota(q)
    } catch (err) {
      if (err instanceof OtpApiError) {
        setQuotaError(err.message)
      } else {
        setQuotaError("Failed to load OTP quota")
      }
    } finally {
      setQuotaLoading(false)
    }
  }

  useEffect(() => {
    void loadQuota()
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
      }
    }
  }, [sessionId])

  const startCountdown = (seconds: number) => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
    }
    setCooldown(seconds)
    timerRef.current = window.setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) {
            window.clearInterval(timerRef.current)
            timerRef.current = null
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const handleSend = async () => {
    setError("")
    setNotice("")
    setSendLoading(true)
    try {
      const res = await sendAttendanceOtp(sessionId)
      setNotice(`Code sent to ${res.sent_to}. It expires in 5 minutes.`)
      startCountdown(res.cooldown)
      inputRef.current?.focus()
    } catch (err) {
      if (err instanceof OtpApiError) {
        setError(err.message)
        if (err.code === "cooldown" || err.code === "rate_limited") {
          startCountdown(err.retryAfter ?? 60)
        } else if (err.code === "otp_limit_reached") {
          await loadQuota()
        }
      } else {
        setError("Couldn't reach the server. Check your connection and try again.")
      }
    } finally {
      setSendLoading(false)
    }
  }

  const handleVerify = async () => {
    if (code.length !== 6) return
    setError("")
    setNotice("")
    setVerifyLoading(true)
    try {
      const location = await getLocation()
      const res = await verifyAttendanceOtp(sessionId, code, location)
      onSuccess({ flagged: res.flagged })
    } catch (err) {
      if (err instanceof OtpApiError) {
        if (err.code === "invalid_code") {
          setError("Invalid or expired code.")
          setCode("")
          inputRef.current?.focus()
        } else if (err.code === "no_location" || err.code === "outside" || err.code === "no_geofence" || err.code === "session_closed" || err.code === "not_enrolled" || err.code === "already_checked_in" || err.code === "otp_limit_reached") {
          setError(err.message)
          if (err.code === "already_checked_in" || err.code === "otp_limit_reached") {
            await loadQuota()
          }
          setError(err.message)
          await loadQuota()
        } else {
          setError(err.message)
        }
      } else if (err instanceof Error) {
        // Check if it's a geolocation error
        const geoMsg = geolocationErrorMessage(err)
        if (geoMsg) {
          setError(geoMsg)
        } else {
          setError(err.message)
        }
      } else {
        setError("Check-in failed")
      }
    } finally {
      setVerifyLoading(false)
    }
  }

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 6)
    setCode(value)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    setCode(pasted)
  }

  const isBlocked = quota
    ? quota.already_checked_in || !quota.session_open || !quota.enrolled || quota.remaining === 0
    : false

  const blockMessage = quota
    ? quota.remaining === 0
      ? "You've used all your OTPs for this course. Ask your lecturer to verify you."
      : quota.already_checked_in
        ? "You're already checked in for this session."
        : !quota.session_open
          ? "This session isn't open for check-in."
          : !quota.enrolled
            ? "You're not enrolled in this course."
            : ""
    : ""

  const canSend = !isBlocked && !sendLoading && cooldown === 0 && !verifyLoading
  const canVerify = !isBlocked && code.length === 6 && !verifyLoading && !sendLoading && (quota?.remaining ?? 0) > 0

  if (quotaLoading) {
    return (
      <CardContent className="flex flex-col items-center justify-center gap-3 py-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </CardContent>
    )
  }

  return (
    <CardContent className="flex flex-col gap-4">
      {quotaError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {quotaError}
        </p>
      )}

      {quota && !isBlocked && (
        <p className="text-center text-sm text-muted-foreground">
          OTP check-ins left for this course: {quota.remaining} of {quota.limit}
        </p>
      )}

      {isBlocked && (
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-center text-sm">
          {blockMessage}
        </p>
      )}

      {!isBlocked && (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor="otp-code" className="text-sm font-medium">
              Enter 6-digit code
            </label>
            <Input
              ref={inputRef}
              id="otp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              aria-label="6-digit OTP code"
              value={code}
              onChange={handleCodeChange}
              onPaste={handlePaste}
              disabled={verifyLoading || sendLoading}
              className="text-center text-lg tracking-widest"
            />
          </div>

          <Button onClick={handleSend} disabled={!canSend} className="h-11 sm:h-9">
            {sendLoading ? (
              <>
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                Sending...
              </>
            ) : cooldown > 0 ? (
              `Resend in ${cooldown}s`
            ) : (
              <>
                <Send className="size-4" data-icon="inline-start" />
                Send OTP
              </>
            )}
          </Button>
        </>
      )}

      {notice && (
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
          {notice}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button onClick={handleVerify} disabled={!canVerify} className="h-11 sm:h-9">
        {verifyLoading ? (
          <>
            <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
            Verifying...
          </>
        ) : (
          <>
            <KeyRound className="size-4" data-icon="inline-start" />
            Verify
          </>
        )}
      </Button>

      <Button variant="ghost" onClick={onBackToFace} disabled={verifyLoading || sendLoading} className="h-11 sm:h-9">
        <ArrowLeft className="size-4" data-icon="inline-start" />
        Back to face scan
      </Button>

      <Button variant="outline" onClick={onCancel} disabled={verifyLoading || sendLoading} className="h-11 sm:h-9">
        Cancel
      </Button>
    </CardContent>
  )
}
