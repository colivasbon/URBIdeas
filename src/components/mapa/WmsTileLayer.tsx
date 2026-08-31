"use client"
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

interface WmsTileLayerProps {
  url: string
  layers: string
  name: string
  format?: string
  transparent?: boolean
  crs?: string
  visible?: boolean
}

export function WmsTileLayer({
  url,
  layers,
  name,
  format = 'image/png',
  transparent = true,
  crs = 'EPSG:3857',
  visible = true
}: WmsTileLayerProps) {
  const map = useMap()
  const layerRef = useRef<L.TileLayer.WMS | null>(null)

  useEffect(() => {
    if (!visible) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
      return
    }

    const crsKey = crs.replace(':', '_') as keyof typeof L.CRS
    const leafletCrs = L.CRS[crsKey] || L.CRS.EPSG3857

    const wmsLayer = L.tileLayer.wms(url, {
      layers,
      format,
      transparent,
      crs: leafletCrs,
      attribution: ''
    })

    wmsLayer.addTo(map)
    layerRef.current = wmsLayer

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
    }
  }, [map, url, layers, visible, format, transparent, crs, name])

  return null
}
