import assert from "node:assert/strict"
import { test } from "node:test"
import {
  DESCRIPTOR_LENGTH,
  MATCH_THRESHOLD,
  averageDescriptors,
  euclideanDistance,
  isMatch,
  isValidDescriptor,
  medianDistance,
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

function descriptorWith(index, value) {
  const descriptor = new Float32Array(DESCRIPTOR_LENGTH)
  descriptor[index] = value
  return descriptor
}

test("isValidDescriptor accepts a 128-d non-zero descriptor", () => {
  assert.equal(isValidDescriptor(descriptorWith(0, 1)), true)
})

test("isValidDescriptor rejects wrong length, non-finite, and zero-norm values", () => {
  assert.equal(isValidDescriptor(null), false)
  assert.equal(isValidDescriptor(undefined), false)
  assert.equal(isValidDescriptor(new Float32Array(64)), false)
  assert.equal(isValidDescriptor(descriptorWith(0, Number.NaN)), false)
  assert.equal(isValidDescriptor(descriptorWith(0, Number.POSITIVE_INFINITY)), false)
  assert.equal(isValidDescriptor(new Float32Array(DESCRIPTOR_LENGTH)), false)
})

test("averageDescriptors averages valid descriptors", () => {
  const averaged = averageDescriptors([
    descriptorWith(0, 1),
    descriptorWith(0, 3),
  ])
  assert.ok(averaged instanceof Float32Array)
  assert.equal(averaged.length, DESCRIPTOR_LENGTH)
  assert.equal(averaged[0], 2)
})

test("averageDescriptors rejects empty and invalid input", () => {
  assert.equal(averageDescriptors([]), null)
  assert.equal(averageDescriptors([descriptorWith(0, 1), new Float32Array(64)]), null)
})

test("medianDistance returns the median distance and closest descriptor", () => {
  const stored = descriptorWith(127, 1)
  const descriptors = [
    descriptorWith(0, 1),
    descriptorWith(0, 2),
    descriptorWith(0, 3),
  ]
  const result = medianDistance(stored, descriptors)
  assert.ok(result)
  assert.ok(Math.abs(result.distance - Math.sqrt(5)) < 1e-6)
  assert.equal(result.descriptor, descriptors[1])
  assert.deepEqual(result.distances, [
    Math.sqrt(2),
    Math.sqrt(5),
    Math.sqrt(10),
  ])
})
