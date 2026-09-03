"use client"
import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

/** Render del ámbito activo (naranja expediente) + encuadre al crearse. */
export function CapaAmbito({ geojson, encuadrarKey }: { geojson: GeoJSON.FeatureCollection | null; encuadrarKey: number }) {
  const map = useMap()

  useEffect(() => {
    if (!geojson) return
    const layer = L.geoJSON(geojson as GeoJSON.GeoJsonObject, {
      style: { color: '#e07b39', weight: 2.5, fillColor: '#e07b39', fillOpacity: 0.18 },
      pointToLayer: (_f, latlng) => L.circleMarker(latlng, { radius: 7, color: '#e07b39', fillColor: '#e07b39', fillOpacity: 0.9 }),
    }).addTo(map)
    if (encuadrarKey > 0) {
      try {
        const b = layer.getBounds()
        if (b.isValid()) map.fitBounds(b, { padding: [32, 32], maxZoom: 16 })
      } catch { /* ignore */ }
    }
    return () => { map.removeLayer(layer) }
  }, [map, geojson, encuadrarKey])

  return null
}
