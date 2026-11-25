import assert from "node:assert/strict"
import { test } from "node:test"
import {
  ACCURACY_TOO_POOR_MESSAGE,
  GOOD_ACCURACY_M,
  LocationError,
  MAX_ACCURACY_M,
  MAX_RADIUS_M,
  MIN_RADIUS_M,
  NO_GEOFENCE_MESSAGE,
  OUTSIDE_ROOM_MESSAGE,
  SMALL_FENCE_NOTICE,
  boxAreaM2,
  checkInBlockMessage,
  fenceHalfSize,
  geolocationErrorMessage,
  getCurrentPosition,
  isDesktopDevice,
  isSmallFence,
  isValidLatitude,
  isValidLongitude,
  isValidRadius,
  orderBoxCorners,
  parseLatLng,
  validateBox,
  validateGeofence,
} from "../src/lib/geofence.ts"
import type { Corner } from "../src/lib/geofence.ts"

const BASE_LAT = -15.7894
const BASE_LNG = 35.038

function cornersFor(metresNorthSouth: number, metresEastWest: number): Corner[] {
  const halfLat = metresNorthSouth / 2 / 110_540
  const halfLng =
    metresEastWest / 2 / (111_320 * Math.cos((BASE_LAT * Math.PI) / 180))

  const north = BASE_LAT + halfLat
  const south = BASE_LAT - halfLat
  const west = BASE_LNG - halfLng
  const east = BASE_LNG + halfLng

  return [
    { lat: south, lng: west },
    { lat: south, lng: east },
    { lat: north, lng: east },
    { lat: north, lng: west },
  ]
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items]
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(
      (rest) => [item, ...rest],
    ),
  )
}

test("coordinate and radius validation boundaries", () => {
  assert.equal(MIN_RADIUS_M, 2)
  assert.equal(MAX_RADIUS_M, 50)

  assert.equal(isValidLatitude(-90), true)
  assert.equal(isValidLatitude(90), true)
  assert.equal(isValidLatitude(90.0001), false)
  assert.equal(isValidLatitude(Number.NaN), false)

  assert.equal(isValidLongitude(-180), true)
  assert.equal(isValidLongitude(180), true)
  assert.equal(isValidLongitude(180.0001), false)

  assert.equal(isValidRadius(2), true)
  assert.equal(isValidRadius(50), true)
  assert.equal(isValidRadius(1.9), false)
  assert.equal(isValidRadius(50.1), false)
})

test("accuracy ceilings match the server rules", () => {
  assert.equal(GOOD_ACCURACY_M, 10)
  assert.equal(MAX_ACCURACY_M, 200)

  // Exactly 200 m is usable; anything above it is no location.
  assert.ok(200 <= MAX_ACCURACY_M)
  assert.ok(200.01 > MAX_ACCURACY_M)

  // Exactly 10 m is still good; 10.1 m is poor (may be flagged for review).
  assert.ok(10 <= GOOD_ACCURACY_M)
  assert.ok(10.1 > GOOD_ACCURACY_M)
  assert.ok(10.1 <= MAX_ACCURACY_M)
})

test("validateGeofence returns a message for each invalid circle field", () => {
  assert.match(
    validateGeofence({ latitude: 91, longitude: 0, radius: 10 }) ?? "",
    /Latitude/,
  )
  assert.match(
    validateGeofence({ latitude: 0, longitude: -181, radius: 10 }) ?? "",
    /Longitude/,
  )
  assert.match(
    validateGeofence({ latitude: 0, longitude: 0, radius: 1 }) ?? "",
    /Radius/,
  )
  assert.equal(
    validateGeofence({ latitude: -15.7894, longitude: 35.038, radius: 12 }),
    null,
  )
})

test("orderBoxCorners puts every permutation in the same ring order", () => {
  const corners = cornersFor(6, 6)
  const expected = [corners[0], corners[1], corners[2], corners[3]]

  for (const permutation of permutations(corners)) {
    assert.deepEqual(orderBoxCorners(permutation), expected)
  }
})

test("boxAreaM2 is close to the true classroom-scale area", () => {
  assert.ok(Math.abs(boxAreaM2(cornersFor(6, 6)) - 36) < 0.05)
  assert.ok(Math.abs(boxAreaM2(cornersFor(10, 5)) - 50) < 0.05)
})

test("validateBox accepts a normal box and rejects bad geometry", () => {
  assert.equal(validateBox(orderBoxCorners(cornersFor(6, 6))), null)

  assert.match(validateBox(cornersFor(6, 6).slice(0, 3)) ?? "", /four corners/)

  const outOfRange = cornersFor(6, 6)
  outOfRange[0] = { lat: 91, lng: outOfRange[0].lng }
  assert.match(validateBox(outOfRange) ?? "", /valid latitude/)

  assert.match(validateBox(cornersFor(1, 1)) ?? "", /at least 4 square/)

  assert.match(validateBox(cornersFor(120, 120)) ?? "", /within 50 metres/)

  const [sw, se, ne, nw] = cornersFor(6, 6)
  assert.match(
    validateBox([nw, se, ne, sw]) ?? "",
    /crossed/,
  )
})

test("fenceHalfSize uses the radius or half the box area", () => {
  assert.equal(fenceHalfSize({ shape: "circle", radius: 2 }), 2)
  assert.equal(fenceHalfSize({ shape: "circle", radius: 12 }), 12)
  assert.equal(fenceHalfSize({ shape: "circle", radius: 1 }), null)
  assert.equal(fenceHalfSize({ shape: "circle", radius: 51 }), null)

  const halfSize = fenceHalfSize({ shape: "box", corners: cornersFor(6, 6) })
  assert.ok(halfSize !== null && Math.abs(halfSize - 3) < 0.01)
  assert.equal(fenceHalfSize({ shape: "box", corners: cornersFor(6, 6).slice(0, 3) }), null)
})

test("small fence notice applies below the ten metre threshold", () => {
  assert.equal(isSmallFence(9.9), true)
  assert.equal(isSmallFence(10), false)
  assert.equal(isSmallFence(null), false)
  assert.match(SMALL_FENCE_NOTICE, /accepted and flagged for review/)
})

test("parseLatLng accepts a pasted pair and rejects malformed input", () => {
  assert.deepEqual(parseLatLng(" -15.7894, 35.038 "), {
    latitude: -15.7894,
    longitude: 35.038,
  })
  assert.equal(parseLatLng("91, 35"), null)
  assert.equal(parseLatLng("35, 181"), null)
  assert.equal(parseLatLng("-15.7"), null)
  assert.equal(parseLatLng("-15.7, 35.0, 1"), null)
  assert.equal(parseLatLng(", 35"), null)
  assert.equal(parseLatLng("abc, 35"), null)
})

test("server block reasons map to short plain messages", () => {
  assert.equal(
    checkInBlockMessage(new Error("no_location")),
    ACCURACY_TOO_POOR_MESSAGE,
  )
  assert.equal(
    checkInBlockMessage(new Error("no_geofence")),
    NO_GEOFENCE_MESSAGE,
  )
  assert.equal(
    checkInBlockMessage(new Error("outside")),
    OUTSIDE_ROOM_MESSAGE,
  )
  assert.equal(
    checkInBlockMessage(new Error("outside_good_accuracy")),
    OUTSIDE_ROOM_MESSAGE,
  )
  assert.equal(
    checkInBlockMessage(new Error("Attendance already recorded for this session")),
    null,
  )
})

test("geolocation errors map by browser code", () => {
  assert.match(geolocationErrorMessage({ code: 1 }) ?? "", /denied/i)
  assert.match(geolocationErrorMessage({ code: 2 }) ?? "", /unavailable/i)
  assert.match(geolocationErrorMessage({ code: 3 }) ?? "", /timed out/i)
  assert.equal(geolocationErrorMessage({ code: 99 }), null)
})

test("getCurrentPosition forwards strict options and resolves coordinates", async () => {
  let receivedOptions: PositionOptions | undefined

  const geolocation = {
    getCurrentPosition: (
      success: PositionCallback,
      _error: PositionErrorCallback,
      options?: PositionOptions,
    ) => {
      void _error
      receivedOptions = options
      success({
        coords: {
          latitude: -15.7894,
          longitude: 35.038,
          accuracy: 7,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      })
    },
  } as unknown as Geolocation

  const position = await getCurrentPosition(geolocation)
  assert.deepEqual(position, {
    latitude: -15.7894,
    longitude: 35.038,
    accuracy: 7,
  })
  assert.equal(receivedOptions?.enableHighAccuracy, true)
  assert.equal(receivedOptions?.timeout, 10_000)
  assert.equal(receivedOptions?.maximumAge, 0)
})

test("getCurrentPosition rejects with a typed LocationError", async () => {
  const geolocation = {
    getCurrentPosition: (
      _success: PositionCallback,
      error: PositionErrorCallback,
    ) => {
      void _success
      error({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 })
    },
  } as unknown as Geolocation

  await assert.rejects(getCurrentPosition(geolocation), (error: unknown) => {
    assert.ok(error instanceof LocationError)
    assert.equal(error.code, 1)
    return true
  })
})

test("isDesktopDevice returns false in non-browser environments", () => {
  assert.equal(isDesktopDevice(), false)
})

test("isDesktopDevice is memoised", () => {
  const first = isDesktopDevice()
  const second = isDesktopDevice()
  assert.equal(first, second)
})

test("getCurrentPosition falls back to one-shot getCurrentPosition when watchPosition is absent", async () => {
  let receivedOptions: PositionOptions | undefined
  let calls = 0

  const geolocation = {
    getCurrentPosition: (
      success: PositionCallback,
      _error: PositionErrorCallback,
      options?: PositionOptions,
    ) => {
      void _error
      calls += 1
      receivedOptions = options
      success({
        coords: {
          latitude: -15.7894,
          longitude: 35.038,
          accuracy: 7,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      })
    },
  } as unknown as Geolocation

  const position = await getCurrentPosition(geolocation)
  assert.deepEqual(position, {
    latitude: -15.7894,
    longitude: 35.038,
    accuracy: 7,
  })
  assert.equal(calls, 1)
  assert.deepEqual(receivedOptions, {
    enableHighAccuracy: true,
    timeout: 20_000,
    maximumAge: 0,
  })
})

test("getCurrentPosition watchPosition fallback rejects when neither method exists", async () => {
  const geolocation = {} as unknown as Geolocation
  await assert.rejects(getCurrentPosition(geolocation), (error: unknown) => {
    assert.ok(error instanceof LocationError)
    assert.equal(error.code, 2)
    return true
  })
})
