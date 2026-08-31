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
        color: layer.color,
        weight: 2,
        opacity: 0.8,
        fillColor: layer.color,
        fillOpacity: 0.25,
      },
      onEachFeature: (feature, leafletLayer) => {
        if (feature.properties) {
          const popupContent = Object.entries(feature.properties)
            .filter(([, v]) => v !== null && v !== undefined)
            .map(([k, v]) => `<tr><td style="padding:2px 6px 2px 0;font-weight:500;color:#888;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:2px 0">${v}</td></tr>`)
            .join('')
          if (popupContent) {
            leafletLayer.bindPopup(
              `<table style="font-size:12px;border-collapse:collapse;width:100%"><tbody>${popupContent}</tbody></table>`,
              { maxWidth: 300, className: 'urbideas-popup' }
            )
          }
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
  }, [map, layer.geojson, layer.color, layer.visible])

  return null
}
