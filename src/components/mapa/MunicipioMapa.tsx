"use client"

import { useEffect, useRef } from "react"
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

interface MunicipioMarker { id: string; nombre: string; lat: number; lng: number }
interface MunicipioMapaProps { lat?: number | null; lng?: number | null; nombre?: string; municipios?: MunicipioMarker[] }

const MARKER_COLORS = ["#3E665C","#D4543B","#2563EB","#D97706","#7C3AED","#059669","#DC2626","#0891B2","#C026D3","#65A30D"]

function MapCenterHandler({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap()
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!initializedRef.current) {
      map.setView(center, zoom)
      initializedRef.current = true
    }
  }, [map, center, zoom])

  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 200)
    return () => clearTimeout(timer)
  }, [map])

  return null
}

function SingleMunicipioMap({ lat, lng, nombre }: { lat: number; lng: number; nombre: string }) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={12}
      className="w-full h-full"
      style={{ background: "#e5e3df" }}
      zoomControl={true}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[lat, lng]}>
        <Popup><strong>{nombre}</strong></Popup>
      </Marker>
      <MapCenterHandler center={[lat, lng]} zoom={12} />
    </MapContainer>
  )
}

function MultiMunicipioMap({ municipios }: { municipios: MunicipioMarker[] }) {
  const valid = municipios.filter(m => typeof m.lat === "number" && typeof m.lng === "number" && !isNaN(m.lat) && !isNaN(m.lng))

  const center: [number, number] = valid.length > 0
    ? [valid.reduce((s, m) => s + m.lat, 0) / valid.length, valid.reduce((s, m) => s + m.lng, 0) / valid.length]
    : [40.0, -3.7]

  return (
    <MapContainer
      center={center}
      zoom={6}
      className="w-full h-full"
      style={{ background: "#e5e3df" }}
      zoomControl={true}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {valid.map((m, i) => {
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
      })}
      <MapCenterHandler center={center} zoom={6} />
    </MapContainer>
  )
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

  return (
    <div className="rounded-[var(--border-radius)] border border-[var(--color-border)]" style={{ width: "100%", height: "300px" }}>
      {isMulti ? (
        <MultiMunicipioMap municipios={municipios} />
      ) : (
        <SingleMunicipioMap lat={lat!} lng={lng!} nombre={nombre ?? ""} />
      )}
    </div>
  )
}
