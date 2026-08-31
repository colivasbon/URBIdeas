"use client"

import { useEffect, useRef } from "react"

interface MunicipioMarker {
  id: string
  nombre: string
  lat: number
  lng: number
}

interface MunicipioMapaProps {
  lat?: number | null
  lng?: number | null
  nombre?: string
  municipios?: MunicipioMarker[]
}

const MARKER_COLORS = [
  "#3E665C",
  "#D4543B",
  "#2563EB",
  "#D97706",
  "#7C3AED",
  "#059669",
  "#DC2626",
  "#0891B2",
  "#C026D3",
  "#65A30D",
]

export default function MunicipioMapa({ lat, lng, nombre, municipios }: MunicipioMapaProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<unknown>(null)

  const isMulti = Array.isArray(municipios) && municipios.length > 0

  useEffect(() => {
    if (!mapRef.current) return
    if (!isMulti && (!lat || !lng)) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any

    async function initMap() {
      const L = (await import("leaflet")).default

      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove()
      }

      if (isMulti) {
        const validMarkers = municipios.filter(
          (m) => typeof m.lat === "number" && typeof m.lng === "number" && !isNaN(m.lat) && !isNaN(m.lng)
        )

        if (validMarkers.length === 0) return

        const bounds = L.latLngBounds(validMarkers.map((m) => [m.lat, m.lng] as [number, number]))
        const center = bounds.getCenter()

        const m = L.map(mapRef.current!, {
          center: [center.lat, center.lng],
          zoom: 6,
          zoomControl: true,
          scrollWheelZoom: false,
        })

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap",
          maxZoom: 19,
        }).addTo(m)

        validMarkers.forEach((mun, index) => {
          const color = MARKER_COLORS[index % MARKER_COLORS.length]
          const icon = L.divIcon({
            className: "custom-marker",
            html: `<div style="background:${color};width:24px;height:24px;border-radius:50%;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:bold">${index + 1}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          })

          L.marker([mun.lat, mun.lng], { icon })
            .addTo(m)
            .bindPopup(`<strong>${mun.nombre}</strong>`)
        })

        m.fitBounds(bounds, { padding: [40, 40] })

        map = m
        mapInstanceRef.current = m
      } else {
        const safeLat = lat as number
        const safeLng = lng as number

        const m = L.map(mapRef.current!, {
          center: [safeLat, safeLng],
          zoom: 12,
          zoomControl: true,
          scrollWheelZoom: false,
        })

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: `© OpenStreetMap · ${nombre ?? ""}`,
          maxZoom: 19,
        }).addTo(m)

        const icon = L.divIcon({
          className: "custom-marker",
          html: `<div style="background:var(--color-primary,#3E665C);width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        })

        L.marker([safeLat, safeLng], { icon }).addTo(m)

        map = m
        mapInstanceRef.current = m
      }
    }

    initMap()

    return () => {
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove()
        mapInstanceRef.current = null
      }
    }
  }, [lat, lng, nombre, isMulti, municipios])

  if (isMulti) {
    const validMarkers = municipios.filter(
      (m) => typeof m.lat === "number" && typeof m.lng === "number" && !isNaN(m.lat) && !isNaN(m.lng)
    )
    if (validMarkers.length === 0) {
      return (
        <div className="flex items-center justify-center h-[300px] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] text-sm text-[var(--color-text-secondary)]">
          No hay coordenadas disponibles para los municipios seleccionados
        </div>
      )
    }
  } else if (!lat || !lng) {
    return (
      <div className="flex items-center justify-center h-[300px] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] text-sm text-[var(--color-text-secondary)]">
        No hay coordenadas verificadas disponibles para este municipio
      </div>
    )
  }

  return (
    <div
      ref={mapRef}
      className="h-[300px] w-full rounded-[var(--border-radius)] border border-[var(--color-border)]"
      style={{ zIndex: 0 }}
    />
  )
}
