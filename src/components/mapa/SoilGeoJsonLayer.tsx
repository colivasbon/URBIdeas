"use client"
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

const CLASE_SUELO_COLORS: Record<string, string> = {
  'SUELO URBANO': '#e74c3c',
  'SUELO URBANO NO CONSOLIDADO': '#e67e22',
  'SUELO URBANIZABLE DELIMITADO O SECTORIZADO': '#f1c40f',
  'SUELO URBANIZABLE NO DELIMITADO O SECTORIZADO': '#2ecc71',
  'SUELO NO URBANIZABLE': '#3498db',
  'SISTEMAS GENERALES': '#9b59b6',
}

interface SoilGeoJsonLayerProps {
  geojson: GeoJSON.FeatureCollection | null
}

export function SoilGeoJsonLayer({ geojson }: SoilGeoJsonLayerProps) {
  const map = useMap()
  const layerRef = useRef<L.GeoJSON | null>(null)

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current)
      layerRef.current = null
    }

    if (!geojson || geojson.features.length === 0) return

    const geoJsonLayer = L.geoJSON(geojson, {
      style: (feature) => {
        const clase = feature?.properties?.ClaseSuelo || ''
        const color = CLASE_SUELO_COLORS[clase] || 'var(--color-text-muted)'
        return {
          color: 'var(--color-border)',
          weight: 0.5,
          opacity: 0.6,
          fillColor: color,
          fillOpacity: 0.5,
        }
      },
      onEachFeature: (feature, leafletLayer) => {
        const props = feature.properties || {}
        const clase = props.ClaseSuelo || ''
        const color = CLASE_SUELO_COLORS[clase] || 'var(--color-text-muted)'

        const popupContent = `
          <div style="font-family:var(--font-family);min-width:180px">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
              <div style="width:12px;height:12px;border-radius:3px;background:${color};border:1px solid var(--color-border)"></div>
              <strong style="font-size:12px">${clase}</strong>
            </div>
            <table style="font-size:11px;border-collapse:collapse;width:100%">
              ${props.NuclRural ? `<tr><td style="padding:2px 6px 2px 0;color:var(--color-text-muted)">Núcleo rural</td><td style="padding:2px 0">${props.NuclRural}</td></tr>` : ''}
              ${props.AreaLamber ? `<tr><td style="padding:2px 6px 2px 0;color:var(--color-text-muted)">Área (Lambert)</td><td style="padding:2px 0">${Number(props.AreaLamber).toLocaleString()} m²</td></tr>` : ''}
            </table>
          </div>
        `
        leafletLayer.bindPopup(popupContent, { maxWidth: 300, className: 'urbideas-popup' })
      },
    })

    geoJsonLayer.addTo(map)
    layerRef.current = geoJsonLayer

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
    }
  }, [map, geojson])

  return null
}
