import assert from "node:assert/strict"
import { test } from "node:test"
import { displayMatchConfidence } from "../src/lib/faceMatch.ts"

test("displayMatchConfidence rounds to the nearest 10 percent", () => {
  assert.equal(displayMatchConfidence(0.945219), 90)
  assert.equal(displayMatchConfidence(0.864656), 90)
  assert.equal(displayMatchConfidence(0.8), 80)
  assert.equal(displayMatchConfidence(0.702859), 70)
  assert.equal(displayMatchConfidence(0.6), 60)
  assert.equal(displayMatchConfidence(0.466895), 50)
  assert.equal(displayMatchConfidence(0.244867), 20)
})

test("displayMatchConfidence clamps to 10-90", () => {
  assert.equal(displayMatchConfidence(0), 10)
  assert.equal(displayMatchConfidence(0.04), 10)
  assert.equal(displayMatchConfidence(0.96), 90)
  assert.equal(displayMatchConfidence(1), 90)
})

test("displayMatchConfidence returns null for missing or non-finite scores", () => {
  assert.equal(displayMatchConfidence(null), null)
  assert.equal(displayMatchConfidence(undefined), null)
  assert.equal(displayMatchConfidence(Number.NaN), null)
  assert.equal(displayMatchConfidence(Number.POSITIVE_INFINITY), null)
})
