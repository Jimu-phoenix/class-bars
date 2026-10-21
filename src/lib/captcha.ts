// reCAPTCHA v2 (checkbox) is rendered client-side only. The site key is public
// by design; the secret key is not needed until server-side token verification
// is added.
export const RECAPTCHA_SITE_KEY: string =
  import.meta.env?.VITE_RECAPTCHA_SITE_KEY ?? ""

// When no site key is configured the widget is skipped entirely, so the app
// stays usable in local development without a captcha.
export const CAPTCHA_REQUIRED = RECAPTCHA_SITE_KEY !== ""
