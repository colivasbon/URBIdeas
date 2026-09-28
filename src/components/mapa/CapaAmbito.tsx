"use client"
import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

/**
 * Render del ámbito activo + encuadre al crearse. Trazo musgo sobre halo hueso
 * y relleno crisopa: se lee igual sobre callejero y sobre ortofoto. Leaflet
 * necesita colores literales (paleta corporativa).
 */
const MUSGO = '#3E665C'
const HUESO = '#F1F1F1'
const CRISOPA = '#C2E189'

export function CapaAmbito({ geojson, encuadrarKey }: { geojson: GeoJSON.FeatureCollection | null; encuadrarKey: number }) {
  const map = useMap()

  useEffect(() => {
    if (!geojson) return
    // Halo: mismo recinto, trazo ancho claro y sin relleno ni interacción.
    const halo = L.geoJSON(geojson as GeoJSON.GeoJsonObject, {
      interactive: false,
      style: { color: HUESO, weight: 6, opacity: 0.85, fill: false },
      pointToLayer: (_f, latlng) => L.circleMarker(latlng, { radius: 9, color: HUESO, weight: 3, fill: false, interactive: false }),
    }).addTo(map)
    const layer = L.geoJSON(geojson as GeoJSON.GeoJsonObject, {
      style: { color: MUSGO, weight: 2.5, fillColor: CRISOPA, fillOpacity: 0.25 },
      pointToLayer: (_f, latlng) => L.circleMarker(latlng, { radius: 7, color: HUESO, weight: 2, fillColor: MUSGO, fillOpacity: 1 }),
    }).addTo(map)
    if (encuadrarKey > 0) {
      try {
        const b = layer.getBounds()
        if (b.isValid()) map.fitBounds(b, { padding: [32, 32], maxZoom: 16 })
      } catch { /* ignore */ }
    }
    return () => { map.removeLayer(layer); map.removeLayer(halo) }
  }, [map, geojson, encuadrarKey])

  return null
}
