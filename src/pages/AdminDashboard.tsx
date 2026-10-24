import { lazy, Suspense, useCallback, useEffect, useState } from "react"
import { useLocation } from "react-router-dom"
import {
  Building2,
  BookOpen,
  Crosshair,
  LayoutDashboard,
  MapPin,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react"
import StatCard from "@/components/dashboard/StatCard"
import DashboardShell from "@/components/DashboardShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"
import { fullScreenOnMobile } from "@/lib/dialogClasses"
import {
  DEFAULT_MAP_CENTER,
  MAX_RADIUS_M,
  MIN_RADIUS_M,
  SMALL_FENCE_NOTICE,
  boxCentroid,
  fenceHalfSize,
  geolocationErrorMessage,
  getCurrentPosition,
  isSmallFence,
  isValidLatitude,
  isValidLongitude,
  isValidRadius,
  orderBoxCorners,
  parseLatLng,
  validateBox,
  validateGeofence,
} from "@/lib/geofence"
import type { Corner, FenceShape } from "@/lib/geofence"
import { cn } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { StaffEmailRow, VenueRow } from "@/types/db"

const ROOT = "/admin"

const VenueGeofenceMap = lazy(() => import("@/components/admin/VenueGeofenceMap"))

type VenueWriteError = { code?: string; message: string }

function venueWriteMessage(error: VenueWriteError): string {
  if (error.code === "23503") {
    return "This room has sessions and cannot be deleted"
  }
  if (error.code === "23505") {
    return "A venue with that name already exists."
  }
  return error.message
}

function asVenueMessage(error: unknown, fallback: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return venueWriteMessage(error as VenueWriteError)
  }
  return error instanceof Error ? error.message : fallback
}

function formatLatLng(lat: number, lng: number): string {
  return `${Number(lat.toFixed(6))}, ${Number(lng.toFixed(6))}`
}

/* ---------------------------------------------------------------- */
/* Home section                                                     */
/* ---------------------------------------------------------------- */

function AdminHome() {
  const [stats, setStats] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  const loadStats = useCallback(async () => {
    const [users, venues, sessions] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("venues").select("id", { count: "exact", head: true }),
      supabase.from("class_sessions").select("id", { count: "exact", head: true }),
    ])
    setStats({
      users: users.count ?? 0,
      venues: venues.count ?? 0,
      sessions: sessions.count ?? 0,
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    async function load() {
      await loadStats()
    }
    void load()
  }, [loadStats])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatCard
        icon={LayoutDashboard}
        label="Sessions"
        value={stats.sessions?.toString() ?? "—"}
        hint={loading ? "Loading…" : "Total class sessions"}
      />
      <StatCard
        icon={UserRound}
        label="Users"
        value={stats.users?.toString() ?? "—"}
        hint={loading ? "Loading…" : "Total user profiles"}
      />
      <StatCard
        icon={Building2}
        label="Venues"
        value={stats.venues?.toString() ?? "—"}
        hint={loading ? "Loading…" : "Total venues"}
      />
    </div>
  )
}

/* ---------------------------------------------------------------- */
/* Venues section                                                   */
/* ---------------------------------------------------------------- */

function AdminVenues() {
  const [venues, setVenues] = useState<VenueRow[]>([])
  const [newName, setNewName] = useState("")
  const [newBuilding, setNewBuilding] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const [geofenceVenue, setGeofenceVenue] = useState<VenueRow | null>(null)
  const [draftName, setDraftName] = useState("")
  const [draftBuilding, setDraftBuilding] = useState("")
  const [draftShape, setDraftShape] = useState<FenceShape>("circle")
  const [draftLat, setDraftLat] = useState("")
  const [draftLng, setDraftLng] = useState("")
  const [draftRadius, setDraftRadius] = useState("10")
  const [draftCorners, setDraftCorners] = useState<(Corner | null)[]>([
    null,
    null,
    null,
    null,
  ])
  const [cornerInputs, setCornerInputs] = useState(["", "", "", ""])
  const [cornerAccuracy, setCornerAccuracy] = useState<(number | null)[]>([
    null,
    null,
    null,
    null,
  ])
  const [geofenceError, setGeofenceError] = useState("")
  const [savingGeofence, setSavingGeofence] = useState(false)
  const [locating, setLocating] = useState(false)
  const [reportedAccuracy, setReportedAccuracy] = useState<number | null>(null)
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false)
  const [removingFence, setRemovingFence] = useState(false)

  const loadVenues = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("venues")
      .select(
        "id, name, building, geofence_id, geofences(id, shape, center_lat, center_lng, radius_m, c1_lat, c1_lng, c2_lat, c2_lng, c3_lat, c3_lng, c4_lat, c4_lng, created_at, updated_at)",
      )
      .order("name", { ascending: true })
    if (fetchError) {
      setError(fetchError.message)
      return
    }
    setVenues((data ?? []) as unknown as VenueRow[])
  }, [])

  useEffect(() => {
    async function load() {
      await loadVenues()
    }
    void load()
  }, [loadVenues])

  const addVenue = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const { error: insertError } = await supabase
        .from("venues")
        .insert({ name: newName.trim(), building: newBuilding.trim() || null })
      if (insertError) throw insertError
      setNewName("")
      setNewBuilding("")
      void loadVenues()
    } catch (err) {
      setError(asVenueMessage(err, "Failed to add venue"))
    } finally {
      setLoading(false)
    }
  }

  const deleteVenue = async (id: string) => {
    if (!window.confirm("Delete this venue?")) return
    const { error: delError } = await supabase.from("venues").delete().eq("id", id)
    if (delError) {
      setError(asVenueMessage(delError, "Failed to delete venue"))
      return
    }
    void loadVenues()
  }

  const openGeofence = (venue: VenueRow) => {
    setGeofenceVenue(venue)
    setDraftName(venue.name)
    setDraftBuilding(venue.building ?? "")
    setGeofenceError("")
    setReportedAccuracy(null)
    setCornerAccuracy([null, null, null, null])
    setRemoveConfirmOpen(false)

    const fence = venue.geofences
    if (fence?.shape === "box") {
      const corners: (Corner | null)[] = [
        fence.c1_lat !== null && fence.c1_lng !== null
          ? { lat: fence.c1_lat, lng: fence.c1_lng }
          : null,
        fence.c2_lat !== null && fence.c2_lng !== null
          ? { lat: fence.c2_lat, lng: fence.c2_lng }
          : null,
        fence.c3_lat !== null && fence.c3_lng !== null
          ? { lat: fence.c3_lat, lng: fence.c3_lng }
          : null,
        fence.c4_lat !== null && fence.c4_lng !== null
          ? { lat: fence.c4_lat, lng: fence.c4_lng }
          : null,
      ]
      setDraftShape("box")
      setDraftLat("")
      setDraftLng("")
      setDraftCorners(corners)
      setCornerInputs(
        corners.map((corner) =>
          corner ? formatLatLng(corner.lat, corner.lng) : "",
        ),
      )
      return
    }

    setDraftShape("circle")
    setDraftLat(
      fence?.center_lat !== null && fence?.center_lat !== undefined
        ? String(Number(fence.center_lat.toFixed(6)))
        : "",
    )
    setDraftLng(
      fence?.center_lng !== null && fence?.center_lng !== undefined
        ? String(Number(fence.center_lng.toFixed(6)))
        : "",
    )
    setDraftRadius(
      fence?.radius_m !== null && fence?.radius_m !== undefined
        ? String(Number(fence.radius_m))
        : "10",
    )
    setDraftCorners([null, null, null, null])
    setCornerInputs(["", "", "", ""])
  }

  const closeGeofence = () => {
    if (savingGeofence || removingFence) return
    setGeofenceVenue(null)
    setGeofenceError("")
    setRemoveConfirmOpen(false)
  }

  const handleCoordinateChange = (
    value: string,
    field: "latitude" | "longitude",
  ) => {
    const parsed = parseLatLng(value)
    if (parsed) {
      setDraftLat(String(parsed.latitude))
      setDraftLng(String(parsed.longitude))
      return
    }
    if (field === "latitude") setDraftLat(value)
    else setDraftLng(value)
  }

  const handleCenterChange = (latitude: number, longitude: number) => {
    setDraftLat(String(Number(latitude.toFixed(6))))
    setDraftLng(String(Number(longitude.toFixed(6))))
  }

  const setCorner = (index: number, corner: Corner | null) => {
    setDraftCorners((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? corner : item)),
    )
    setCornerInputs((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? corner
            ? formatLatLng(corner.lat, corner.lng)
            : ""
          : item,
      ),
    )
  }

  const handleCornerChange = (
    index: number,
    latitude: number,
    longitude: number,
  ) => {
    setCorner(index, { lat: latitude, lng: longitude })
  }

  const handleCornerInputChange = (index: number, value: string) => {
    setCornerInputs((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? value : item)),
    )

    const parsed = parseLatLng(value)
    if (parsed) {
      setDraftCorners((current) =>
        current.map((item, itemIndex) =>
          itemIndex === index
            ? { lat: parsed.latitude, lng: parsed.longitude }
            : item,
        ),
      )
    } else if (!value.trim()) {
      setDraftCorners((current) =>
        current.map((item, itemIndex) =>
          itemIndex === index ? null : item,
        ),
      )
    }
  }

  const handleMapClick = (latitude: number, longitude: number) => {
    if (draftShape === "circle") {
      handleCenterChange(latitude, longitude)
      return
    }

    const emptyIndex = draftCorners.findIndex((corner) => corner === null)
    if (emptyIndex === -1) return
    setCorner(emptyIndex, { lat: latitude, lng: longitude })
  }

  const locateVenue = async () => {
    setLocating(true)
    setGeofenceError("")
    try {
      const location = await getCurrentPosition()
      if (draftShape === "circle") {
        handleCenterChange(location.latitude, location.longitude)
        setReportedAccuracy(location.accuracy)
      } else {
        const emptyIndex = draftCorners.findIndex((corner) => corner === null)
        if (emptyIndex === -1) {
          setGeofenceError(
            "All four corners are set. Clear a corner or drag a marker before using your location.",
          )
          return
        }
        setCorner(emptyIndex, {
          lat: location.latitude,
          lng: location.longitude,
        })
        setCornerAccuracy((current) =>
          current.map((item, itemIndex) =>
            itemIndex === emptyIndex ? location.accuracy : item,
          ),
        )
      }
    } catch (err) {
      setGeofenceError(
        geolocationErrorMessage(err) ?? "Could not get your current location.",
      )
    } finally {
      setLocating(false)
    }
  }

  const saveGeofence = async () => {
    if (!geofenceVenue) return
    setGeofenceError("")

    const name = draftName.trim()
    if (!name) {
      setGeofenceError("Venue name is required.")
      return
    }

    const hadFence = geofenceVenue.geofence_id !== null
    let fencePayload: {
      shape: FenceShape
      lat: number | null
      lng: number | null
      radius: number | null
      corners: Corner[] | null
    } | null = null

    if (draftShape === "circle") {
      const latText = draftLat.trim()
      const lngText = draftLng.trim()
      const hasLat = latText !== ""
      const hasLng = lngText !== ""

      if (!hasLat && !hasLng) {
        if (hadFence) {
          setGeofenceError("Use Remove fence to clear this room's geofence.")
          return
        }
      } else {
        if (!hasLat || !hasLng) {
          setGeofenceError(
            "Enter both latitude and longitude, or use your current location.",
          )
          return
        }
        const latitude = Number(latText)
        const longitude = Number(lngText)
        const radius = Number(draftRadius)
        const validationError = validateGeofence({ latitude, longitude, radius })
        if (validationError) {
          setGeofenceError(validationError)
          return
        }
        fencePayload = {
          shape: "circle",
          lat: latitude,
          lng: longitude,
          radius,
          corners: null,
        }
      }
    } else {
      const parsed = cornerInputs.map((input) => parseLatLng(input))
      if (parsed.some((corner) => corner === null)) {
        setGeofenceError(
          'Each corner needs a pasted "lat, lng" pair, or click the map to place it.',
        )
        return
      }

      const corners = parsed
        .filter(
          (corner): corner is { latitude: number; longitude: number } =>
            corner !== null,
        )
        .map((corner) => ({ lat: corner.latitude, lng: corner.longitude }))
      const ordered = orderBoxCorners(corners)
      const validationError = validateBox(ordered)
      if (validationError) {
        setGeofenceError(validationError)
        return
      }

      fencePayload = {
        shape: "box",
        lat: null,
        lng: null,
        radius: null,
        corners: ordered,
      }
    }

    setSavingGeofence(true)
    try {
      if (fencePayload) {
        const { error: fenceError } = await supabase.rpc("set_venue_geofence", {
          p_venue_id: geofenceVenue.id,
          p_shape: fencePayload.shape,
          p_lat: fencePayload.lat,
          p_lng: fencePayload.lng,
          p_radius_m: fencePayload.radius,
          p_corners: fencePayload.corners,
        })
        if (fenceError) throw fenceError
      }

      const { error: updateError } = await supabase
        .from("venues")
        .update({ name, building: draftBuilding.trim() || null })
        .eq("id", geofenceVenue.id)
      if (updateError) throw updateError

      setGeofenceVenue(null)
      void loadVenues()
    } catch (err) {
      setGeofenceError(asVenueMessage(err, "Failed to save venue"))
    } finally {
      setSavingGeofence(false)
    }
  }

  const removeFence = async () => {
    if (!geofenceVenue) return
    const fenceId = geofenceVenue.geofence_id
    if (!fenceId) {
      setRemoveConfirmOpen(false)
      setGeofenceVenue(null)
      return
    }

    setRemovingFence(true)
    setGeofenceError("")
    try {
      const { error: deleteError } = await supabase
        .from("geofences")
        .delete()
        .eq("id", fenceId)
      if (deleteError) throw deleteError
      setRemoveConfirmOpen(false)
      setGeofenceVenue(null)
      void loadVenues()
    } catch (err) {
      setGeofenceError(asVenueMessage(err, "Failed to remove the geofence"))
      setRemoveConfirmOpen(false)
    } finally {
      setRemovingFence(false)
    }
  }

  const hasBothCoordinates =
    draftLat.trim() !== "" && draftLng.trim() !== ""
  const latitude = Number(draftLat)
  const longitude = Number(draftLng)
  const radius = Number(draftRadius)
  const circleCenter =
    hasBothCoordinates &&
    isValidLatitude(latitude) &&
    isValidLongitude(longitude)
      ? { latitude, longitude }
      : DEFAULT_MAP_CENTER

  const placedCorners = draftCorners.filter(
    (corner): corner is Corner => corner !== null,
  )
  const boxCenter = boxCentroid(placedCorners)
  const mapCenter =
    draftShape === "circle"
      ? circleCenter
      : boxCenter
        ? { latitude: boxCenter.lat, longitude: boxCenter.lng }
        : DEFAULT_MAP_CENTER
  const sliderRadius = isValidRadius(radius) ? radius : MIN_RADIUS_M
  const liveHalfSize =
    draftShape === "circle"
      ? fenceHalfSize({ shape: "circle", radius })
      : placedCorners.length === 4
        ? fenceHalfSize({ shape: "box", corners: placedCorners })
        : null
  const showSmallFence = isSmallFence(liveHalfSize)
  const hadFence = geofenceVenue?.geofence_id != null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Venues
        </CardTitle>
        <CardDescription>
          Create venues, edit their details and set the geofence used for proximity checks.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <form onSubmit={addVenue} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label htmlFor="venue-name" className="text-sm font-medium">
                Venue name
              </label>
              <Input
                id="venue-name"
                type="text"
                required
                placeholder="LT1"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="venue-building" className="text-sm font-medium">
                Building
              </label>
              <Input
                id="venue-building"
                type="text"
                placeholder="Main Block"
                value={newBuilding}
                onChange={(e) => setNewBuilding(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={loading || !newName.trim()} className="w-full">
                {loading ? "Adding…" : <><Plus className="mr-2 h-4 w-4" /> Add venue</>}
              </Button>
            </div>
          </div>
        </form>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Existing venues
          </p>
          {venues.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No venues configured.</p>
          ) : (
            <ul className="space-y-1">
              {venues.map((v) => {
                const fence = v.geofences
                return (
                  <li
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-md border border-border text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{v.name}</p>
                      {v.building && (
                        <p className="truncate text-xs text-muted-foreground">
                          {v.building}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {fence ? (
                        <Badge variant="secondary" className="gap-1">
                          <MapPin className="size-3" aria-hidden="true" />
                          {fence.shape === "circle"
                            ? `Circle, ${Number(fence.radius_m)} m`
                            : "Box"}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Not set</Badge>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openGeofence(v)}
                        aria-label={`Edit ${v.name}`}
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon-sm"
                        onClick={() => void deleteVenue(v.id)}
                        aria-label={`Delete ${v.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </CardContent>

      <Dialog
        open={geofenceVenue !== null}
        onOpenChange={(open) => {
          if (!open) closeGeofence()
        }}
      >
        <DialogContent className={cn(fullScreenOnMobile, "sm:max-w-2xl")}>
          <DialogHeader>
            <DialogTitle>Venue location &amp; geofence</DialogTitle>
            <DialogDescription>
              Draw a circle around the room, or mark the four corners of a class box.
              The fence is the proximity area used at check-in.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="edit-venue-name" className="text-sm font-medium">
                  Venue name
                </label>
                <Input
                  id="edit-venue-name"
                  type="text"
                  required
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-venue-building" className="text-sm font-medium">
                  Building
                </label>
                <Input
                  id="edit-venue-building"
                  type="text"
                  value={draftBuilding}
                  onChange={(e) => setDraftBuilding(e.target.value)}
                />
              </div>
            </div>

            <Suspense
              fallback={
                <div className="flex h-64 w-full items-center justify-center rounded-lg border border-border bg-muted text-sm text-muted-foreground sm:h-72">
                  Loading map…
                </div>
              }
            >
              <VenueGeofenceMap
                shape={draftShape}
                center={mapCenter}
                radius={sliderRadius}
                corners={draftCorners}
                onMapClick={handleMapClick}
                onCenterChange={handleCenterChange}
                onCornerChange={handleCornerChange}
              />
            </Suspense>

            <Tabs
              value={draftShape}
              onValueChange={(value) => setDraftShape(value as FenceShape)}
            >
              <TabsList>
                <TabsTrigger value="circle">Circle</TabsTrigger>
                <TabsTrigger value="box">Class box</TabsTrigger>
              </TabsList>

              <TabsContent value="circle" className="space-y-4 pt-2">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="venue-latitude" className="text-sm font-medium">
                      Latitude
                    </label>
                    <Input
                      id="venue-latitude"
                      type="text"
                      inputMode="decimal"
                      placeholder="-15.7894 or paste -15.7894, 35.038"
                      value={draftLat}
                      onChange={(e) =>
                        handleCoordinateChange(e.target.value, "latitude")
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="venue-longitude" className="text-sm font-medium">
                      Longitude
                    </label>
                    <Input
                      id="venue-longitude"
                      type="text"
                      inputMode="decimal"
                      placeholder="35.038"
                      value={draftLng}
                      onChange={(e) =>
                        handleCoordinateChange(e.target.value, "longitude")
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="venue-radius" className="text-sm font-medium">
                      Geofence radius
                    </label>
                    <span className="text-xs text-muted-foreground">
                      {MIN_RADIUS_M}–{MAX_RADIUS_M} m
                    </span>
                  </div>
                  <input
                    id="venue-radius-slider"
                    type="range"
                    min={MIN_RADIUS_M}
                    max={MAX_RADIUS_M}
                    step={0.5}
                    value={sliderRadius}
                    onChange={(e) => setDraftRadius(e.target.value)}
                    className="w-full accent-primary"
                    aria-label="Geofence radius slider"
                  />
                  <Input
                    id="venue-radius"
                    type="number"
                    min={MIN_RADIUS_M}
                    max={MAX_RADIUS_M}
                    step={0.5}
                    value={draftRadius}
                    onChange={(e) => setDraftRadius(e.target.value)}
                  />
                </div>
              </TabsContent>

              <TabsContent value="box" className="space-y-4 pt-2">
                <p className="text-xs text-muted-foreground">
                  Click the map to place the next empty corner, or drag a numbered
                  marker. Each row also accepts a pasted &quot;lat, lng&quot; pair.
                </p>
                <div className="space-y-3">
                  {cornerInputs.map((value, index) => {
                    const accuracy = cornerAccuracy[index]
                    return (
                      <div key={index} className="space-y-1">
                        <label
                          htmlFor={`venue-corner-${index}`}
                          className="text-sm font-medium"
                        >
                          Corner {index + 1}
                        </label>
                        <Input
                          id={`venue-corner-${index}`}
                          type="text"
                          inputMode="decimal"
                          placeholder="-15.7894, 35.038"
                          value={value}
                          onChange={(e) =>
                            handleCornerInputChange(index, e.target.value)
                          }
                        />
                        {accuracy !== null && (
                          <p className="text-xs text-muted-foreground">
                            Reported accuracy: {Math.round(accuracy)} m
                            {accuracy > 10 ? " (above the 10 m guidance)" : ""}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => void locateVenue()}
                disabled={locating}
              >
                <Crosshair className="mr-2 h-4 w-4" aria-hidden="true" />
                {locating
                  ? "Getting location…"
                  : draftShape === "box"
                    ? "Use my current location for the next corner"
                    : "Use my current location"}
              </Button>
              {draftShape === "circle" && reportedAccuracy !== null && (
                <p className="text-xs text-muted-foreground">
                  Reported accuracy: {Math.round(reportedAccuracy)} m
                  {reportedAccuracy > 10 ? " (above the 10 m guidance)" : ""}
                </p>
              )}
            </div>

            {showSmallFence && (
              <p className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                {SMALL_FENCE_NOTICE}
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              Check-in is blocked for a room without a fence until one is set.
            </p>

            {geofenceError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {geofenceError}
              </p>
            )}

            {hadFence && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setRemoveConfirmOpen(true)}
                disabled={savingGeofence || removingFence}
              >
                Remove fence
              </Button>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeGeofence}
              disabled={savingGeofence || removingFence}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void saveGeofence()}
              disabled={savingGeofence || removingFence || !draftName.trim()}
            >
              {savingGeofence ? "Saving…" : "Save venue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removeConfirmOpen} onOpenChange={setRemoveConfirmOpen}>
        <DialogContent className={fullScreenOnMobile}>
          <DialogHeader>
            <DialogTitle>Remove geofence?</DialogTitle>
            <DialogDescription>
              Check-in for {geofenceVenue?.name ?? "this room"} will be blocked until a
              fence is set.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemoveConfirmOpen(false)}
              disabled={removingFence}
            >
              Keep fence
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void removeFence()}
              disabled={removingFence}
            >
              {removingFence ? "Removing…" : "Remove geofence"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

/* ---------------------------------------------------------------- */
/* Users & Roles section                                            */
/* ---------------------------------------------------------------- */

function AdminUsers() {
  const [emails, setEmails] = useState<StaffEmailRow[]>([])
  const [newEmail, setNewEmail] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const loadEmails = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("staff_emails")
      .select("email, created_at")
      .order("created_at", { ascending: false })
    if (fetchError) {
      setError(fetchError.message)
      return
    }
    setEmails((data ?? []) as StaffEmailRow[])
  }, [])

  useEffect(() => {
    async function load() {
      await loadEmails()
    }
    void load()
  }, [loadEmails])

  const addEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const { error: insertError } = await supabase
        .from("staff_emails")
        .insert({ email: newEmail.trim().toLowerCase() })
      if (insertError) throw insertError
      setNewEmail("")
      void loadEmails()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add email")
    } finally {
      setLoading(false)
    }
  }

  const deleteEmail = async (email: string) => {
    if (!window.confirm(`Remove ${email} from the staff allowlist?`)) return
    const { error: delError } = await supabase.from("staff_emails").delete().eq("email", email)
    if (delError) {
      setError(delError.message)
      return
    }
    void loadEmails()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Users & Roles
        </CardTitle>
        <CardDescription>
          Manage staff emails allowed to register as lecturers.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <form onSubmit={addEmail} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label htmlFor="staff-email" className="text-sm font-medium">
                Staff email
              </label>
              <Input
                id="staff-email"
                type="email"
                required
                placeholder="lecturer@example.edu"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="submit"
                disabled={loading || !newEmail.trim()}
                className="w-full"
              >
                {loading ? "Adding…" : <><Plus className="mr-2 h-4 w-4" /> Add lecturer email</>}
              </Button>
            </div>
          </div>
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Allowed staff emails
            </p>
            {emails.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No staff emails configured.</p>
            ) : (
              <ul className="space-y-1">
                {emails.map((row) => (
                  <li
                    key={row.email}
                    className="flex items-center justify-between px-3 py-2 rounded-md border border-border text-sm"
                  >
                    <span className="font-medium">{row.email}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {new Date(row.created_at).toLocaleDateString()}
                      </span>
                      <Button
                        variant="destructive"
                        size="icon-sm"
                        onClick={() => void deleteEmail(row.email)}
                        aria-label={`Remove ${row.email}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/* ---------------------------------------------------------------- */
/* System Logs section                                              */
/* ---------------------------------------------------------------- */

function AdminLogs() {
  const [logs, setLogs] = useState<{ action: string; entity_type: string; created_at: string }[]>([])
  const [loading, setLoading] = useState(true)

  const loadLogs = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("audit_logs")
      .select("action, entity_type, created_at")
      .order("created_at", { ascending: false })
      .limit(50)
    if (fetchError) {
      setLoading(false)
      return
    }
    setLogs((data ?? []) as { action: string; entity_type: string; created_at: string }[])
    setLoading(false)
  }, [])

  useEffect(() => {
    async function load() {
      await loadLogs()
    }
    void load()
  }, [loadLogs])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          System Logs
        </CardTitle>
        <CardDescription>
          Recent system audit events.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <p className="text-sm text-muted-foreground italic">Loading…</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No audit events recorded.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2">Time</th>
                <th className="pb-2">Action</th>
                <th className="pb-2">Entity</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={`${log.created_at}-${log.action}`} className="border-t border-border">
                  <td className="py-2 text-muted-foreground">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="py-2 font-medium">{log.action}</td>
                  <td className="py-2 text-muted-foreground">{log.entity_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}

/* ---------------------------------------------------------------- */
/* AdminDashboard                                                   */
/* ---------------------------------------------------------------- */

export default function AdminDashboard() {
  const location = useLocation()
  const activeTab = location.pathname || ROOT

  return (
    <DashboardShell title="Admin dashboard" description="System administration">
      <div className="space-y-6">
        {/* Home */}
        {activeTab === ROOT && <AdminHome />}

        {/* Venues */}
        {activeTab === "/admin/venues" && <AdminVenues />}

        {/* Users & Roles */}
        {activeTab === "/admin/users" && <AdminUsers />}

        {/* System Logs */}
        {activeTab === "/admin/logs" && <AdminLogs />}

      </div>
    </DashboardShell>
  )
}
