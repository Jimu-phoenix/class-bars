export const MIN_RADIUS_M = 2
export const MAX_RADIUS_M = 50
export const MAX_ACCURACY_M = 100
export const GOOD_ACCURACY_M = 10
export const SMALL_FENCE_THRESHOLD_M = 10

export const SMALL_FENCE_NOTICE =
  "This fence is smaller than phone GPS can usually resolve indoors. Students whose location is clearly inside will pass; others near the edge will be accepted and flagged for review instead of blocked."

export const LOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 0,
}

export type Coordinates = {
  latitude: number
  longitude: number
  accuracy: number
}

export type LatLng = {
  latitude: number
  longitude: number
}

export type Corner = {
  lat: number
  lng: number
}

export type FenceShape = "circle" | "box"

export type GeofenceValues = LatLng & {
  radius: number
}

export const DEFAULT_MAP_CENTER: LatLng = {
  latitude: -15.7894,
  longitude: 35.038,
}

export const LOCATION_DENIED_MESSAGE =
  "Location permission was denied. Allow location access and try again."
export const LOCATION_UNAVAILABLE_MESSAGE =
  "Your location is unavailable. Move to an open area and try again."
export const LOCATION_TIMEOUT_MESSAGE =
  "Getting your location timed out. Try again."
export const ACCURACY_TOO_POOR_MESSAGE =
  "Your location accuracy is too poor to check in. Move somewhere with a clearer view of the sky and try again."
export const NO_GEOFENCE_MESSAGE =
  "This room has no location set. Ask your lecturer to set the room's geofence."
export const OUTSIDE_ROOM_MESSAGE =
  "You appear to be outside the room. Move closer and try again."
export const FLAGGED_CHECKIN_MESSAGE =
  "Checked in, flagged for review because your location accuracy was low."

export class LocationError extends Error {
  readonly code: number

  constructor(code: number, message: string) {
    super(message)
    this.name = "LocationError"
    this.code = code
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

export function isValidLatitude(value: unknown): value is number {
  return isFiniteNumber(value) && value >= -90 && value <= 90
}

export function isValidLongitude(value: unknown): value is number {
  return isFiniteNumber(value) && value >= -180 && value <= 180
}

export function isValidRadius(value: unknown): value is number {
  return isFiniteNumber(value) && value >= MIN_RADIUS_M && value <= MAX_RADIUS_M
}

export function validateGeofence({
  latitude,
  longitude,
  radius,
}: GeofenceValues): string | null {
  if (!isValidLatitude(latitude)) {
    return "Latitude must be between -90 and 90."
  }
  if (!isValidLongitude(longitude)) {
    return "Longitude must be between -180 and 180."
  }
  if (!isValidRadius(radius)) {
    return `Radius must be between ${MIN_RADIUS_M} and ${MAX_RADIUS_M} metres.`
  }
  return null
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

function isValidCorner(corner: unknown): corner is Corner {
  if (typeof corner !== "object" || corner === null) return false
  const { lat, lng } = corner as { lat: unknown; lng: unknown }
  return isValidLatitude(lat) && isValidLongitude(lng)
}

/** Average of the corners: close enough to the centroid for sorting. */
export function boxCentroid(corners: Corner[]): Corner | null {
  if (corners.length === 0 || !corners.every(isValidCorner)) return null
  const lat = corners.reduce((sum, corner) => sum + corner.lat, 0) / corners.length
  const lng = corners.reduce((sum, corner) => sum + corner.lng, 0) / corners.length
  return { lat, lng }
}

/** Haversine distance in metres between two coordinates. */
export function distanceMeters(a: Corner, b: Corner): number {
  const earthRadiusM = 6_371_008.8
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * earthRadiusM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Equirectangular area approximation in square metres. Accurate enough at
 * classroom scale, and matches the UI's "small fence" hint.
 */
export function boxAreaM2(corners: Corner[]): number {
  if (corners.length < 3 || !corners.every(isValidCorner)) return 0

  const origin = corners[0]
  const metresPerDegreeLat = 110_540
  const metresPerDegreeLng =
    111_320 * Math.cos(toRadians(origin.lat))

  const points = corners.map((corner) => ({
    x: (corner.lng - origin.lng) * metresPerDegreeLng,
    y: (corner.lat - origin.lat) * metresPerDegreeLat,
  }))

  let twiceArea = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    twiceArea += current.x * next.y - next.x * current.y
  }
  return Math.abs(twiceArea) / 2
}

function orientation(a: Corner, b: Corner, c: Corner): number {
  return (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng)
}

function onSegment(a: Corner, b: Corner, c: Corner): boolean {
  return (
    Math.min(a.lat, b.lat) <= c.lat &&
    c.lat <= Math.max(a.lat, b.lat) &&
    Math.min(a.lng, b.lng) <= c.lng &&
    c.lng <= Math.max(a.lng, b.lng)
  )
}

function segmentsIntersect(a: Corner, b: Corner, c: Corner, d: Corner): boolean {
  const o1 = orientation(a, b, c)
  const o2 = orientation(a, b, d)
  const o3 = orientation(c, d, a)
  const o4 = orientation(c, d, b)
  const epsilon = 1e-15

  if (
    ((o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon)) &&
    ((o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon))
  ) {
    return true
  }

  if (Math.abs(o1) <= epsilon && onSegment(a, b, c)) return true
  if (Math.abs(o2) <= epsilon && onSegment(a, b, d)) return true
  if (Math.abs(o3) <= epsilon && onSegment(c, d, a)) return true
  if (Math.abs(o4) <= epsilon && onSegment(c, d, b)) return true
  return false
}

function isCrossedBox(corners: Corner[]): boolean {
  return (
    segmentsIntersect(corners[0], corners[1], corners[2], corners[3]) ||
    segmentsIntersect(corners[1], corners[2], corners[3], corners[0])
  )
}

/**
 * Sort corners around the centroid so a saved ring is never a bow tie.
 * Clockwise and anticlockwise input both come out in the same order.
 */
export function orderBoxCorners(corners: Corner[]): Corner[] {
  const centroid = boxCentroid(corners)
  if (!centroid) return [...corners]

  const cosLat = Math.cos(toRadians(centroid.lat))
  return [...corners].sort((a, b) => {
    const angleA = Math.atan2(a.lat - centroid.lat, (a.lng - centroid.lng) * cosLat)
    const angleB = Math.atan2(b.lat - centroid.lat, (b.lng - centroid.lng) * cosLat)
    if (Math.abs(angleA - angleB) > 1e-12) return angleA - angleB

    const distanceA = distanceMeters(centroid, a)
    const distanceB = distanceMeters(centroid, b)
    if (Math.abs(distanceA - distanceB) > 1e-9) return distanceA - distanceB
    if (a.lat !== b.lat) return a.lat - b.lat
    return a.lng - b.lng
  })
}

export function validateBox(corners: Corner[]): string | null {
  if (corners.length !== 4) {
    return "A class box needs exactly four corners."
  }
  if (!corners.every(isValidCorner)) {
    return "Every corner needs a valid latitude and longitude."
  }
  if (isCrossedBox(corners)) {
    return "Box corners are crossed. Reorder them around the room."
  }

  const centroid = boxCentroid(corners)
  if (!centroid) {
    return "Every corner needs a valid latitude and longitude."
  }

  if (boxAreaM2(corners) < 4) {
    return "Box must be at least 4 square metres."
  }

  if (corners.some((corner) => distanceMeters(centroid, corner) > 50)) {
    return "Every box corner must be within 50 metres of the box centre."
  }

  return null
}

export type FenceSizeInput = {
  shape: FenceShape
  radius?: number | null
  corners?: Corner[] | null
}

/**
 * Half of the fence's smaller span, in metres. A circle uses its radius; a
 * box uses sqrt(area) / 2. Matches the SQL `half_size` calculation closely.
 */
export function fenceHalfSize({
  shape,
  radius,
  corners,
}: FenceSizeInput): number | null {
  if (shape === "circle") {
    return isValidRadius(radius) ? radius : null
  }

  if (!corners || corners.length !== 4 || !corners.every(isValidCorner)) {
    return null
  }
  return Math.sqrt(boxAreaM2(corners)) / 2
}

export function isSmallFence(halfSize: number | null): boolean {
  return halfSize !== null && halfSize < SMALL_FENCE_THRESHOLD_M
}

/** Parse a pasted "lat, lng" pair. Returns null for anything invalid. */
export function parseLatLng(input: string): LatLng | null {
  const parts = input.split(",")
  if (parts.length !== 2) return null

  const latText = parts[0]?.trim() ?? ""
  const lngText = parts[1]?.trim() ?? ""
  if (!latText || !lngText) return null

  const latitude = Number(latText)
  const longitude = Number(lngText)
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null

  return { latitude, longitude }
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message
  }
  return typeof error === "string" ? error : ""
}

function codeOf(error: unknown): number | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "number"
  ) {
    return (error as { code: number }).code
  }
  return null
}

export function geolocationErrorMessage(error: unknown): string | null {
  const code = codeOf(error)
  if (code === 1) return LOCATION_DENIED_MESSAGE
  if (code === 2) return LOCATION_UNAVAILABLE_MESSAGE
  if (code === 3) return LOCATION_TIMEOUT_MESSAGE
  if (error instanceof LocationError) {
    if (error.code === 1) return LOCATION_DENIED_MESSAGE
    if (error.code === 2) return LOCATION_UNAVAILABLE_MESSAGE
    if (error.code === 3) return LOCATION_TIMEOUT_MESSAGE
  }
  return null
}

/**
 * Map a server-side check-in block reason to a short plain message.
 * Returns null for unrelated errors (e.g. "already recorded"), so callers
 * can fall back to the original message.
 */
export function checkInBlockMessage(error: unknown): string | null {
  const message = messageOf(error)
  if (/\bno_location\b/.test(message)) return ACCURACY_TOO_POOR_MESSAGE
  if (/\bno_geofence\b/.test(message)) return NO_GEOFENCE_MESSAGE
  if (/\boutside_good_accuracy\b/.test(message)) return OUTSIDE_ROOM_MESSAGE
  if (/\boutside\b/.test(message)) return OUTSIDE_ROOM_MESSAGE
  return null
}

/**
 * Thin wrapper around navigator.geolocation. The argument is injectable so
 * the wrapper can be tested without a browser; callers normally omit it.
 */
export function getCurrentPosition(
  geolocation: Geolocation | undefined = typeof navigator !== "undefined"
    ? navigator.geolocation
    : undefined,
  options: PositionOptions = LOCATION_OPTIONS,
): Promise<Coordinates> {
  if (!geolocation) {
    return Promise.reject(
      new LocationError(2, "Geolocation is not available in this browser."),
    )
  }

  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        })
      },
      (error) => reject(new LocationError(error.code, error.message)),
      options,
    )
  })
}
