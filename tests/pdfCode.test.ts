import assert from "node:assert/strict"
import { test } from "node:test"
import {
  generatePdfCode,
  isValidPdfCode,
  buildVerifyUrl,
  normalisePdfCode,
} from "../src/lib/registerPdf/pdfCode.ts"

test("generatePdfCode returns exactly 6 characters from the safe alphabet", () => {
  for (let i = 0; i < 500; i += 1) {
    const code = generatePdfCode();
    assert.equal(code.length, 6);
    for (const ch of code) {
      assert.match(ch, /[A-HJ-NP-Z2-9]/);
    }
    assert.equal(isValidPdfCode(code), true);
  }
})

test("generatePdfCode produces unique codes across many samples", () => {
  const codes = new Set<string>();
  const count = 2000;
  for (let i = 0; i < count; i += 1) {
    codes.add(generatePdfCode());
  }
  assert.equal(codes.size, count);
})

test("normalisePdfCode trims, upper-cases and removes spaces and dashes", () => {
  assert.equal(normalisePdfCode("abc 234"), "ABC234");
  assert.equal(normalisePdfCode("  ABc-234  "), "ABC234");
  assert.equal(normalisePdfCode("A B C 2 3 4"), "ABC234");
  assert.equal(normalisePdfCode("MNX9Q7"), "MNX9Q7");
  assert.equal(normalisePdfCode(""), "");
})

test("isValidPdfCode accepts valid codes and rejects invalid ones", () => {
  assert.equal(isValidPdfCode("ABC234"), true);
  assert.equal(isValidPdfCode("MNX9Q7"), true);
  assert.equal(isValidPdfCode("234567"), true);
  assert.equal(isValidPdfCode("ABCDE"), false); // too short
  assert.equal(isValidPdfCode("ABCDEFG"), false); // too long
  assert.equal(isValidPdfCode("ABC2I4"), false); // forbidden I
  assert.equal(isValidPdfCode("ABC2O4"), false); // forbidden O
  assert.equal(isValidPdfCode("ABC230"), false); // forbidden 0
  assert.equal(isValidPdfCode("ABC231"), false); // forbidden 1
  assert.equal(isValidPdfCode("ABC2-4"), false); // symbol
  assert.equal(isValidPdfCode(""), false);
  assert.equal(isValidPdfCode("abc234"), false); // lowercase not valid as-is
  assert.equal(isValidPdfCode(normalisePdfCode("abc 234")), true); // normalised is valid
})

test("buildVerifyUrl uses VITE_PUBLIC_APP_URL when set", () => {
  const url = buildVerifyUrl("ABC234", "https://class-bars.example.com/");
  assert.equal(url, "https://class-bars.example.com/verify/ABC234");
})

test("buildVerifyUrl strips a trailing slash from the base", () => {
  const url = buildVerifyUrl("ABC234", "https://class-bars.example.com");
  assert.equal(url, "https://class-bars.example.com/verify/ABC234");
  const url2 = buildVerifyUrl("ABC234", "https://class-bars.example.com///");
  assert.equal(url2, "https://class-bars.example.com/verify/ABC234");
})

test("buildVerifyUrl falls back to window.location.origin when no base", () => {
  const originalWindow = globalThis.window
  globalThis.window = { location: { origin: "http://localhost:5173" } }
  try {
    const url = buildVerifyUrl("ABC234")
    assert.equal(url, "http://localhost:5173/verify/ABC234")
  } finally {
    globalThis.window = originalWindow
  }
})
