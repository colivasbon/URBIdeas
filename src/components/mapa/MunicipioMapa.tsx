"use client"

import { useEffect, useRef } from "react"
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

interface MunicipioMarker { id: string; nombre: string; lat: number; lng: number }
interface MunicipioMapaProps { lat?: number | null; lng?: number | null; nombre?: string; municipios?: MunicipioMarker[] }

const MARKER_COLORS = ["#3E665C","#D4543B","#2563EB","#D97706","#7C3AED","#059669","#DC2626","#0891B2","#C026D3","#65A30D"]

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

  const center: [number, number] = isMulti
    ? (() => {
        const valid = municipios.filter(m => typeof m.lat === "number" && typeof m.lng === "number")
        return [valid.reduce((s, m) => s + m.lat, 0) / valid.length, valid.reduce((s, m) => s + m.lng, 0) / valid.length]
      })()
    : [lat!, lng!]

  const zoom = isMulti ? 6 : 12

  return (
    <div style={{ width: "100%", height: "300px", borderRadius: "var(--border-radius)", border: "1px solid var(--color-border)", overflow: "hidden" }}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ width: "100%", height: "100%", background: "#e5e3df" }}
        zoomControl={true}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {isMulti ? (
          municipios
            .filter(m => typeof m.lat === "number" && typeof m.lng === "number" && !isNaN(m.lat) && !isNaN(m.lng))
            .map((m, i) => {
              const color = MARKER_COLORS[i % MARKER_COLORS.length]
              const icon = L.divIcon({
                className: "",
                html: `<div style="background:${color};width:24px;height:24px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:bold">${i + 1}</div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12],
              })
              return (
                <Marker key={m.id} position={[m.lat, m.lng]} icon={icon}>
                  <Popup><strong>{m.nombre}</strong></Popup>
                </Marker>
              )
            })
        ) : (
          <Marker position={[lat!, lng!]}>
            <Popup><strong>{nombre ?? ""}</strong></Popup>
          </Marker>
        )}
        <MapFix />
      </MapContainer>
    </div>
  )
}
