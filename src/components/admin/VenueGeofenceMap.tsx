import { useEffect, useMemo, useRef, useState } from "react"
import { divIcon } from "leaflet"
import type { Marker as LeafletMarker } from "leaflet"
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet"
import type { Corner, FenceShape, LatLng as LatLngType } from "@/lib/geofence"
import "leaflet/dist/leaflet.css"

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

type VenueGeofenceMapProps = {
  shape: FenceShape
  center: LatLngType
  radius: number
  corners: (Corner | null)[]
  onMapClick: (latitude: number, longitude: number) => void
  onCenterChange: (latitude: number, longitude: number) => void
  onCornerChange: (index: number, latitude: number, longitude: number) => void
}

function MapClick({
  onMapClick,
}: Pick<VenueGeofenceMapProps, "onMapClick">) {
  useMapEvents({
    click(event) {
      onMapClick(event.latlng.lat, event.latlng.lng)
    },
  })
  return null
}

function DraggableCenter({
  center,
  onCenterChange,
}: Pick<VenueGeofenceMapProps, "center" | "onCenterChange">) {
  const [dragging, setDragging] = useState(false)

  useMapEvents({
    mousemove(event) {
      if (dragging) onCenterChange(event.latlng.lat, event.latlng.lng)
    },
    mouseup() {
      setDragging(false)
    },
    mouseout() {
      setDragging(false)
    },
  })

  return (
    <CircleMarker
      center={[center.latitude, center.longitude]}
      radius={9}
      bubblingMouseEvents={false}
      pathOptions={{
        color: "#2563eb",
        weight: 3,
        fillColor: "#ffffff",
        fillOpacity: 1,
      }}
      eventHandlers={{
        mousedown: () => setDragging(true),
      }}
    />
  )
}

function Recenter({ center }: Pick<VenueGeofenceMapProps, "center">) {
  const map = useMap()
  const previous = useRef(center)
  const { latitude, longitude } = center

  useEffect(() => {
    const moved =
      Math.abs(latitude - previous.current.latitude) +
      Math.abs(longitude - previous.current.longitude)
    if (moved > 0.001) {
      map.setView([latitude, longitude], Math.max(map.getZoom(), 17))
    }
    previous.current = { latitude, longitude }
  }, [latitude, longitude, map])

  return null
}

export default function VenueGeofenceMap({
  shape,
  center,
  radius,
  corners,
  onMapClick,
  onCenterChange,
  onCornerChange,
}: VenueGeofenceMapProps) {
  const cornerIcons = useMemo(
    () =>
      [1, 2, 3, 4].map((number) =>
        divIcon({
          className: "class-bars-corner-marker",
          html: `<span style="display:flex;height:24px;width:24px;align-items:center;justify-content:center;border-radius:9999px;background:#2563eb;color:#fff;font:600 12px/1 sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.4)">${number}</span>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      ),
    [],
  )

  const placed = corners.filter((corner): corner is Corner => corner !== null)

  return (
    <MapContainer
      center={[center.latitude, center.longitude]}
      zoom={17}
      maxZoom={22}
      scrollWheelZoom={false}
      className="h-64 w-full overflow-hidden rounded-lg border border-border sm:h-72"
    >
      <TileLayer
        url={TILE_URL}
        attribution={TILE_ATTRIBUTION}
        maxNativeZoom={19}
        maxZoom={22}
      />

      {shape === "circle" && (
        <>
          <Circle
            center={[center.latitude, center.longitude]}
            radius={radius}
            pathOptions={{
              color: "#2563eb",
              weight: 2,
              fillColor: "#2563eb",
              fillOpacity: 0.12,
            }}
          />
          <DraggableCenter center={center} onCenterChange={onCenterChange} />
          <Recenter center={center} />
        </>
      )}

      {shape === "box" && (
        <>
          {placed.length >= 3 && (
            <Polygon
              positions={placed.map((corner) => [corner.lat, corner.lng])}
              pathOptions={{
                color: "#2563eb",
                weight: 2,
                fillColor: "#2563eb",
                fillOpacity: 0.12,
              }}
            />
          )}
          {corners.map((corner, index) =>
            corner ? (
              <Marker
                key={`${index}-${corner.lat}-${corner.lng}`}
                position={[corner.lat, corner.lng]}
                icon={cornerIcons[index]}
                draggable
                bubblingMouseEvents={false}
                eventHandlers={{
                  dragend: (event) => {
                    const position = (event.target as LeafletMarker).getLatLng()
                    onCornerChange(index, position.lat, position.lng)
                  },
                }}
              />
            ) : null,
          )}
        </>
      )}

      <MapClick onMapClick={onMapClick} />
    </MapContainer>
  )
}
