// Maps raw Supabase Auth error messages to actionable, user-facing text.
//
// The important case is Supabase's *native* captcha protection
// (`security_captcha_enabled`, Dashboard -> Authentication -> Attack
// Protection). It only understands hCaptcha and Cloudflare Turnstile and is
// global to all of Auth. When it is switched on it rejects every request that
// does not carry its own `captchaToken` field with:
//
//   captcha protection: request disallowed (no captcha_token found)
//
// This project does not use that switch, so it must stay OFF. The mapper turns
// its opaque error into a hint that says so.

export const NATIVE_CAPTCHA_HINT =
  "Supabase's native CAPTCHA protection is enabled, but it only supports hCaptcha and Cloudflare Turnstile. Turn it off in Supabase Dashboard → Authentication → Attack Protection, then retry. It also blocks sign-in and password reset while on."

export const CAPTCHA_HINT =
  "reCAPTCHA verification failed or was not completed. Solve the captcha and retry — if the widget keeps failing, check that VITE_RECAPTCHA_SITE_KEY is set in .env."

export const ANON_DISABLED_HINT =
  "Anonymous sign-ins are disabled on this Supabase project. Enable them in Supabase Dashboard → Authentication → Sign In / Providers → Anonymous, then retry."

export function isNativeCaptchaError(message: string): boolean {
  return /captcha protection|no captcha_token found/i.test(message)
}

export function mapAuthError(message: string): string {
  if (isNativeCaptchaError(message)) return NATIVE_CAPTCHA_HINT
  if (/captcha/i.test(message)) return CAPTCHA_HINT
  if (/anonymous/i.test(message)) return ANON_DISABLED_HINT
  return message
}
