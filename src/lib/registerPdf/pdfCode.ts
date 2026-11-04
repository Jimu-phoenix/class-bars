const PDF_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PDF_CODE_LENGTH = 6;

// 32 symbols: A-H, J-N, P-Z (excludes I, O) and 2-9 (excludes 0, 1).
// `byte & 31` maps every byte value 0-255 to exactly 8 alphabet indices,
// so there is no modulo bias.
export const PDF_CODE_REGEX = /^[A-HJ-NP-Z2-9]{6}$/;

export function generatePdfCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(PDF_CODE_LENGTH));
  let code = "";
  for (let i = 0; i < bytes.length; i += 1) {
    code += PDF_CODE_ALPHABET[bytes[i] & 31];
  }
  return code;
}

export function normalisePdfCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]+/g, "");
}

export function isValidPdfCode(code: string): boolean {
  return PDF_CODE_REGEX.test(code);
}

export function buildVerifyUrl(code: string, baseUrl?: string): string {
  const base =
    baseUrl ??
    import.meta.env?.VITE_PUBLIC_APP_URL ??
    window.location.origin;
  const host = String(base).replace(/\/+$/, "");
  return `${host}/verify/${code}`;
}
