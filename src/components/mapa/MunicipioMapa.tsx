"use client"

import { useEffect, useRef } from "react"
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

interface MunicipioMarker { id: string; nombre: string; lat: number; lng: number }
interface MunicipioMapaProps { lat?: number | null; lng?: number | null; nombre?: string; municipios?: MunicipioMarker[] }

const MARKER_COLORS = ["#3E665C","#D4543B","#2563EB","#D97706","#7C3AED","#059669","#DC2626","#0891B2","#C026D3","#65A30D"]

function createNumberIcon(num: number, color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};width:28px;height:28px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold;line-height:1">${num}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  })
}

function createPinIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:24px;height:36px">
      <div style="width:24px;height:24px;background:#3E665C;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4)"></div>
      <div style="position:absolute;top:6px;left:6px;width:12px;height:12px;background:white;border-radius:50%"></div>
    </div>`,
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -36],
  })
}

function MapFix() {
  const map = useMap()
  const initRef = useRef(false)

  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true
      setTimeout(() => map.invalidateSize(), 100)
      setTimeout(() => map.invalidateSize(), 400)
    }
  }, [map])

  return null
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap()

  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions)
      map.fitBounds(bounds, { padding: [50, 50] })
    }
  }, [map, positions])

  return null
}

export default function MunicipioMapa({ lat, lng, nombre, municipios }: MunicipioMapaProps) {
  const isMulti = Array.isArray(municipios) && municipios.length > 0

  if (isMulti) {
    const valid = municipios.filter(m => typeof m.lat === "number" && typeof m.lng === "number" && !isNaN(m.lat) && !isNaN(m.lng))
    if (valid.length === 0) {
      return <div className="flex items-center justify-center h-[300px] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] text-sm text-[var(--color-text-secondary)]">No hay coordenadas disponibles</div>
    }
  } else if (!lat || !lng) {
    return <div className="flex items-center justify-center h-[300px] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] text-sm text-[var(--color-text-secondary)]">No hay coordenadas verificadas</div>
  }

  const validMunicipios = isMulti
    ? municipios.filter(m => typeof m.lat === "number" && typeof m.lng === "number" && !isNaN(m.lat) && !isNaN(m.lng))
    : []

  const center: [number, number] = isMulti
    ? [validMunicipios.reduce((s, m) => s + m.lat, 0) / validMunicipios.length, validMunicipios.reduce((s, m) => s + m.lng, 0) / validMunicipios.length]
    : [lat!, lng!]

  const positions: [number, number][] = isMulti
    ? validMunicipios.map(m => [m.lat, m.lng])
    : [[lat!, lng!]]

  return (
    <div style={{ width: "100%", height: "300px", borderRadius: "var(--border-radius)", border: "1px solid var(--color-border)", overflow: "hidden" }}>
      <MapContainer
        center={center}
        zoom={isMulti ? 6 : 12}
        style={{ width: "100%", height: "100%", background: "#e5e3df" }}
        zoomControl={true}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {isMulti ? (
          <>
            {validMunicipios.map((m, i) => {
              const color = MARKER_COLORS[i % MARKER_COLORS.length]
              return (
                <Marker key={m.id} position={[m.lat, m.lng]} icon={createNumberIcon(i + 1, color)}>
                  <Popup><strong>{m.nombre}</strong></Popup>
                </Marker>
              )
            })}
            <FitBounds positions={positions} />
          </>
        ) : (
          <>
            <Marker position={[lat!, lng!]} icon={createPinIcon()}>
              <Popup><strong>{nombre ?? ""}</strong></Popup>
            </Marker>
            <MapFix />
          </>
        )}
      </MapContainer>
    </div>
  )
}
