"use client"

import { useEffect, useRef } from "react"

interface MunicipioMarker { id: string; nombre: string; lat: number; lng: number }
interface MunicipioMapaProps { lat?: number | null; lng?: number | null; nombre?: string; municipios?: MunicipioMarker[] }

const MARKER_COLORS = ["#3E665C","#D4543B","#2563EB","#D97706","#7C3AED","#059669","#DC2626","#0891B2","#C026D3","#65A30D"]

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
        mapInstanceRef.current = null
      }

      const container = mapRef.current!

      map = L.map(container, {
        zoom: isMulti ? 6 : 12,
        zoomControl: true,
        scrollWheelZoom: false,
        attributionControl: true,
      })

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: isMulti ? "© OpenStreetMap" : `© OpenStreetMap · ${nombre ?? ""}`,
        maxZoom: 19,
      }).addTo(map)

      if (isMulti) {
        const valid = municipios.filter(m => typeof m.lat === "number" && typeof m.lng === "number" && !isNaN(m.lat) && !isNaN(m.lng))
        if (valid.length === 0) return

        valid.forEach((m, i) => {
          const color = MARKER_COLORS[i % MARKER_COLORS.length]
          const icon = L.divIcon({
            className: "",
            html: `<div style="background:${color};width:24px;height:24px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:bold">${i + 1}</div>`,
            iconSize: [24, 24], iconAnchor: [12, 12],
          })
          L.marker([m.lat, m.lng], { icon }).addTo(map).bindPopup(`<strong>${m.nombre}</strong>`)
        })
        const bounds = L.latLngBounds(valid.map(m => [m.lat, m.lng] as [number, number]))
        map.fitBounds(bounds, { padding: [50, 50] })
      } else {
        const icon = L.divIcon({
          className: "",
          html: `<div style="background:#3E665C;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
          iconSize: [14, 14], iconAnchor: [7, 7],
        })
        L.marker([lat!, lng!], { icon }).addTo(map).bindPopup(`<strong>${nombre ?? ""}</strong>`)
      }

      mapInstanceRef.current = map

      setTimeout(() => {
        map.invalidateSize()
        if (!isMulti && lat && lng) {
          map.setView([lat, lng], map.getZoom())
        }
      }, 200)
      setTimeout(() => map.invalidateSize(), 500)
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
    const valid = municipios.filter(m => typeof m.lat === "number" && typeof m.lng === "number" && !isNaN(m.lat) && !isNaN(m.lng))
    if (valid.length === 0) {
      return <div className="flex items-center justify-center h-[300px] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] text-sm text-[var(--color-text-secondary)]">No hay coordenadas disponibles</div>
    }
  } else if (!lat || !lng) {
    return <div className="flex items-center justify-center h-[300px] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] text-sm text-[var(--color-text-secondary)]">No hay coordenadas verificadas</div>
  }

  return <div ref={mapRef} className="rounded-[var(--border-radius)] border border-[var(--color-border)]" style={{ width: "100%", height: "300px", position: "relative" }} />
}
