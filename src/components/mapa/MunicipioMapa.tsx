"use client"

import { useEffect, useRef } from "react"

interface MunicipioMapaProps {
  lat: number | null
  lng: number | null
  nombre: string
}

export default function MunicipioMapa({ lat, lng, nombre }: MunicipioMapaProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<unknown>(null)

  useEffect(() => {
    if (!mapRef.current || !lat || !lng) return

    const safeLat = lat as number
    const safeLng = lng as number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any

    async function initMap() {
      const L = (await import("leaflet")).default

      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove()
      }

      const m = L.map(mapRef.current!, {
        center: [safeLat, safeLng],
        zoom: 12,
        zoomControl: true,
        scrollWheelZoom: false,
      })

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: `© OpenStreetMap · ${nombre}`,
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

    initMap()

    return () => {
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove()
        mapInstanceRef.current = null
      }
    }
  }, [lat, lng, nombre])

  if (!lat || !lng) {
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
