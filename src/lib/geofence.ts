export const MIN_RADIUS_M = 2
export const MAX_RADIUS_M = 50
export const MAX_ACCURACY_M = 200
// Mirrors MAX_USABLE_ACCURACY_M in SQL check_in_attendance (migrations/30).
export const GOOD_ACCURACY_M = 10
export const SMALL_FENCE_THRESHOLD_M = 10
export const TARGET_ACCURACY_M = 20
export const LOCATION_DEADLINE_MS = 15_000
export const LOCATION_ACCURACY_POOR_CODE = 4

export const SMALL_FENCE_NOTICE =
  "This fence is smaller than phone GPS can usually resolve indoors. Students whose location is clearly inside will pass; others near the edge will be accepted and flagged for review instead of blocked."

export const LOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 20_000,
  maximumAge: 0,
}

let _desktopCache: { value: boolean; computed: boolean } = {
  value: false,
  computed: false,
}

/**
 * Detects desktop/laptop (pointer: fine) vs mobile/touch (pointer: coarse).
 * Runs once and is memoised. Returns false in non-browser environments.
 */
export function isDesktopDevice(): boolean {
  if (_desktopCache.computed) {
    return _desktopCache.value
  }
  let result = false
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    result = window.matchMedia("(pointer: fine)").matches
    const ua = navigator.userAgent
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      ua,
    )
    const isDesktopOS =
      /Windows|Macintosh|Linux|CrOS/i.test(ua) && !isMobileUA
    // A fine pointer or a desktop OS string indicates desktop/laptop.
    result = result || isDesktopOS
    if (isMobileUA) {
      result = false
    }
  }
  _desktopCache = { value: result, computed: true }
  return result
}

function desktopLocationOptions(): PositionOptions {
  return {
    enableHighAccuracy: false,
    timeout: 30_000,
    maximumAge: 30_000,
  }
}

function defaultLocationOptions(): PositionOptions {
  return isDesktopDevice() ? desktopLocationOptions() : LOCATION_OPTIONS
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
  "Your location accuracy is too poor to check in. Try again from a location with better signal."
export const NO_GEOFENCE_MESSAGE =
  "This room has no location set. Ask your lecturer to set the room's geofence."
export const OUTSIDE_ROOM_MESSAGE =
  "You appear to be outside the room. Move closer and try again."
export const FLAGGED_CHECKIN_MESSAGE = "Checked in, flagged for review."

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

export function boxCentroid(corners: Corner[]): Corner | null {
  if (corners.length === 0 || !corners.every(isValidCorner)) return null
  const lat = corners.reduce((sum, corner) => sum + corner.lat, 0) / corners.length
  const lng = corners.reduce((sum, corner) => sum + corner.lng, 0) / corners.length
  return { lat, lng }
}

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
  if (code === LOCATION_ACCURACY_POOR_CODE) return ACCURACY_TOO_POOR_MESSAGE
  if (error instanceof LocationError) {
    if (error.code === 1) return LOCATION_DENIED_MESSAGE
    if (error.code === 2) return LOCATION_UNAVAILABLE_MESSAGE
    if (error.code === 3) return LOCATION_TIMEOUT_MESSAGE
    if (error.code === LOCATION_ACCURACY_POOR_CODE) return ACCURACY_TOO_POOR_MESSAGE
  }
  return null
}

export function checkInBlockMessage(error: unknown): string | null {
  const message = messageOf(error)
  if (/\bno_location\b/.test(message)) return ACCURACY_TOO_POOR_MESSAGE
  if (/\bno_geofence\b/.test(message)) return NO_GEOFENCE_MESSAGE
  if (/\boutside_good_accuracy\b/.test(message)) return OUTSIDE_ROOM_MESSAGE
  if (/\boutside\b/.test(message)) return OUTSIDE_ROOM_MESSAGE
  return null
}

export type GetCurrentPositionOptions = {
  signal?: AbortSignal
  onProgress?: (c: Coordinates) => void
  targetAccuracyM?: number
  deadlineMs?: number
}

export function getCurrentPosition(
  geolocation: Geolocation | undefined = typeof navigator !== "undefined"
    ? navigator.geolocation
    : undefined,
  options: PositionOptions = defaultLocationOptions(),
  watchOptions?: GetCurrentPositionOptions,
): Promise<Coordinates> {
  if (!geolocation) {
    return Promise.reject(
      new LocationError(2, "Geolocation is not available in this browser."),
    )
  }

  const targetAccuracy =
    watchOptions?.targetAccuracyM != null &&
    Number.isFinite(watchOptions.targetAccuracyM) &&
    watchOptions.targetAccuracyM > 0
      ? watchOptions.targetAccuracyM
      : TARGET_ACCURACY_M

  const deadlineMs =
    watchOptions?.deadlineMs != null &&
    Number.isFinite(watchOptions.deadlineMs) &&
    watchOptions.deadlineMs > 0
      ? watchOptions.deadlineMs
      : isDesktopDevice()
        ? 30_000
        : LOCATION_DEADLINE_MS

  if (watchOptions?.signal?.aborted) {
    let abortErr: Error | DOMException
    if (typeof DOMException !== "undefined") {
      abortErr = new DOMException("Aborted", "AbortError")
    } else {
      abortErr = new Error("Aborted")
      abortErr.name = "AbortError"
    }
    return Promise.reject(abortErr)
  }

  return new Promise((resolve, reject) => {
    let settled = false
    let watchId: number | null = null
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null
    let best: Coordinates | null = null
    let lastError: GeolocationPositionError | null = null

    const clearAll = () => {
      if (watchId !== null) {
        geolocation.clearWatch(watchId)
        watchId = null
      }
      if (deadlineTimer !== null) {
        clearTimeout(deadlineTimer)
        deadlineTimer = null
      }
    }

    const settle = (value: Coordinates | null, err?: Error) => {
      if (settled) return
      settled = true
      clearAll()
      if (err) reject(err)
      else resolve(value as Coordinates)
    }

    const handlePosition = (position: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = position.coords
      if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude) || !isFiniteNumber(accuracy)) {
        return
      }
      const coords: Coordinates = { latitude, longitude, accuracy }

      // Desktop IP/Wi-Fi geolocation does not meaningfully improve over time,
      // so accept the first fix immediately instead of hunting for GPS.
      if (isDesktopDevice()) {
        settle(coords)
        return
      }

      if (best === null || accuracy < best.accuracy) {
        best = coords
        try {
          watchOptions?.onProgress?.(coords)
        } catch {
          // ignore callback errors
        }
        if (accuracy <= targetAccuracy) {
          settle(coords)
        }
      }
    }

    const handleError = (error: GeolocationPositionError) => {
      lastError = error
      if (error.code === 1) {
        settle(null, new LocationError(error.code, error.message))
      }
    }

    const handleDeadline = () => {
      if (settled) return
      // Desktop: return the best fix we have (may be coarse IP/Wi-Fi accuracy).
      // Mobile: only accept fixes within the 200 m accuracy ceiling.
      if (best !== null && (isDesktopDevice() || best.accuracy <= MAX_ACCURACY_M)) {
        settle(best)
        return
      }
      if (lastError !== null) {
        settle(null, new LocationError(lastError.code, lastError.message))
      } else {
        settle(null, new LocationError(3, LOCATION_TIMEOUT_MESSAGE))
      }
    }

    if (typeof geolocation.watchPosition === "function") {
      watchId = geolocation.watchPosition(handlePosition, handleError, options)
    } else if (typeof geolocation.getCurrentPosition === "function") {
      // One-shot fallback for environments without watchPosition (e.g. tests,
      // some locked-down desktop browsers). Desktop settles on first fix via
      // handlePosition; mobile waits for deadline like watchPosition mode.
      geolocation.getCurrentPosition(handlePosition, handleError, options)
    } else {
      settle(null, new LocationError(2, "Geolocation is not available in this browser."))
    }

    deadlineTimer = setTimeout(handleDeadline, deadlineMs)

    if (watchOptions?.signal) {
      const onAbort = () => {
        if (settled) return
        settled = true
        clearAll()
        let abortErr: Error | DOMException
        if (typeof DOMException !== "undefined") {
          abortErr = new DOMException("Aborted", "AbortError")
        } else {
          abortErr = new Error("Aborted")
          abortErr.name = "AbortError"
        }
        reject(abortErr)
      }
      watchOptions.signal.addEventListener("abort", onAbort, { once: true })
    }
  })
}
