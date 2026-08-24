import assert from "node:assert/strict"
import { test } from "node:test"
import {
  MATCH_THRESHOLD,
  euclideanDistance,
  isMatch,
} from "../src/lib/faceCompare.ts"

test("euclideanDistance computes a 3-4-5 right triangle", () => {
  const d = euclideanDistance(Float32Array.from([3, 4]), Float32Array.from([0, 0]))
  assert.ok(Math.abs(d - 5) < 1e-6)
})

test("euclideanDistance of identical vectors is zero", () => {
  const v = Float32Array.from([0.25, -0.5, 0.75])
  assert.equal(euclideanDistance(v, Float32Array.from(v)), 0)
})

test("euclideanDistance is symmetric", () => {
  const a = Float32Array.from([1.5, -2.5, 3.5])
  const b = Float32Array.from([-4.5, 5.5, -6.5])
  assert.equal(euclideanDistance(a, b), euclideanDistance(b, a))
})

test("euclideanDistance throws on length mismatch", () => {
  assert.throws(
    () => euclideanDistance(new Float32Array(128), new Float32Array(64)),
    /Descriptor lengths do not match/,
  )
})

function seededDescriptor(seed, len = 128) {
  let s = seed >>> 0
  const out = new Float32Array(len)
  for (let i = 0; i < len; i++) {
    s = (s * 1664525 + 1013904223) >>> 0
    out[i] = (s / 0xffffffff) * 2 - 1
  }
  return out
}

test("isMatch accepts the same face descriptor", () => {
  const d = seededDescriptor(42)
  assert.equal(isMatch(d, d), true)
})

test("isMatch rejects far-apart descriptors", () => {
  const a = seededDescriptor(1)
  const b = seededDescriptor(999999)
  assert.equal(isMatch(a, b), false)
})

test("MATCH_THRESHOLD defaults to 0.6", () => {
  assert.equal(MATCH_THRESHOLD, 0.6)
})

test("isMatch uses strict less-than at the exact boundary", () => {
  const registered = Float32Array.from([3, 4])
  const detected = new Float32Array(2)
  assert.equal(euclideanDistance(registered, detected), 5)
  assert.equal(isMatch(registered, detected, 5), false)
  assert.equal(isMatch(registered, detected, 5.000001), true)
})

test("isMatch separates near and far descriptors around the default threshold", () => {
  const base = seededDescriptor(7)
  const near = base.map((v, i) => (i === 0 ? v + 0.001 : v))
  const far = seededDescriptor(999999)
  assert.equal(isMatch(base, Float32Array.from(near)), true)
  assert.equal(isMatch(base, far), false)
})

test("custom threshold overrides the default", () => {
  const registered = Float32Array.from([3, 4])
  const detected = new Float32Array(2)
  assert.equal(isMatch(registered, detected, 10), true)
  assert.equal(isMatch(registered, detected, 1), false)
})
