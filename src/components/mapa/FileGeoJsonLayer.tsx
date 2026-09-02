"use client"
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import type { FileLayer } from './fileLayerUtils'

interface FileGeoJsonLayerProps {
  layer: FileLayer
}

export function FileGeoJsonLayer({ layer }: FileGeoJsonLayerProps) {
  const map = useMap()
  const layerRef = useRef<L.GeoJSON | null>(null)

  useEffect(() => {
    if (!layer.visible) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
      return
    }

    const geoJsonLayer = L.geoJSON(layer.geojson, {
      style: {
        color: layer.borderColor,
        weight: layer.weight,
        opacity: 0.8,
        fillColor: layer.color,
        fillOpacity: layer.fillOpacity,
      },
      pointToLayer: (feature, latlng) => {
        return L.circleMarker(latlng, {
          radius: 8,
          fillColor: layer.color,
          color: layer.borderColor,
          weight: layer.weight,
          opacity: 1,
          fillOpacity: layer.fillOpacity,
        })
      },
      onEachFeature: (feature, leafletLayer) => {
        if (feature.properties) {
          const entries = Object.entries(feature.properties)
            .filter(([, v]) => v !== null && v !== undefined && v !== "")

          if (entries.length === 0) return

          // Propiedades "buenas" que siempre se muestran primero
          const goodKeys = ["name", "Name", "NAME", "description", "Description", "DESCRIPCION"]
          const sorted = [...entries].sort((a, b) => {
            const ai = goodKeys.indexOf(a[0])
            const bi = goodKeys.indexOf(b[0])
            if (ai !== -1 && bi !== -1) return ai - bi
            if (ai !== -1) return -1
            if (bi !== -1) return 1
            return 0
          })

          const MAX_VISIBLE = 12
          const visible = sorted.slice(0, MAX_VISIBLE)
          const hidden = sorted.length - MAX_VISIBLE

          const popupContent = visible
            .map(([k, v]) => `<tr><td style="padding:2px 6px 2px 0;font-weight:500;color:var(--color-text-muted);white-space:nowrap;vertical-align:top;font-size:11px">${k}</td><td style="padding:2px 0;font-size:11px;word-break:break-word">${String(v).substring(0, 120)}${String(v).length > 120 ? '...' : ''}</td></tr>`)
            .join('')

          const moreText = hidden > 0
            ? `<div style="font-size:10px;color:var(--color-text-muted);text-align:center;padding:4px 0;border-top:1px solid var(--color-border-subtle);margin-top:4px">+${hidden} campos más</div>`
            : ''

          leafletLayer.bindPopup(
            `<div style="max-height:250px;overflow-y:auto;font-size:12px"><table style="border-collapse:collapse;width:100%"><tbody>${popupContent}</tbody></table>${moreText}</div>`,
            { maxWidth: 280, maxHeight: 300, className: 'urbideas-popup' }
          )
        }
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
  }, [map, layer.geojson, layer.color, layer.visible, layer.fillOpacity, layer.weight, layer.borderColor])

  return null
}
