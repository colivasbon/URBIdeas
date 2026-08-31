"use client"
import React, { useState, useCallback, useRef, useEffect } from 'react'
import { MapContainer, TileLayer, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { WmsTileLayer } from './WmsTileLayer'
import { GetFeatureInfoPopup, type FeatureInfo } from './GetFeatureInfoPopup'
import { FileGeoJsonLayer } from './FileGeoJsonLayer'
import type { FileLayer } from './fileLayerUtils'
import { getFileLayerBounds } from './fileLayerUtils'

interface CapaActiva {
  id: string
  nombre_capa: string
  url_servicio: string
  formato_soportado: string
}

interface VisorMapaProps {
  capasActivas: CapaActiva[]
  fileLayers?: FileLayer[]
  center?: [number, number]
  zoom?: number
  baseLayer?: string
  onMapMove?: (lat: number, lng: number, zoom: number) => void
  onBaseLayerChange?: (layer: string) => void
  zoomToLayerId?: string | null
  onZoomToDone?: () => void
}

const BASE_LAYERS: Record<string, { url: string; attribution: string; name: string }> = {
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    name: 'Callejero',
  },
  pnoa: {
    url: 'https://tile-a.ign.es/imagery/pnoa-ma/{z}/{x}/{y}.jpeg',
    attribution: '&copy; <a href="https://www.ign.es/">IGN - PNOA</a>',
    name: 'Satélite (PNOA)',
  },
  esri: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a> - World Imagery',
    name: 'Satélite (Esri)',
  },
  ignBase: {
    url: 'https://www.ign.es/wmts/ign-base?service=WMTS&request=GetTile&version=1.0.0&layer=IGNBaseTodo&style=default&tilematrixset=EPSG%3A3857&tilematrix={z}&tilecol={x}&tilerow={y}&format=image/jpeg',
    attribution: '&copy; <a href="https://www.ign.es/">IGN</a>',
    name: 'IGN Base',
  },
}

function MapEventsHandler({ onMapClick }: { onMapClick: (latlng: L.LatLng) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng)
    },
  })
  return null
}

function MapMoveReporter({ onMove }: { onMove: (lat: number, lng: number, zoom: number) => void }) {
  const map = useMap()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useMapEvents({
    moveend() {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const center = map.getCenter()
        onMove(center.lat, center.lng, map.getZoom())
      }, 300)
    },
  })

  return null
}

function MapInitializer({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap()
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!initializedRef.current) {
      map.setView(center, zoom)
      initializedRef.current = true
    }
  }, [map, center, zoom])

  return null
}

function ZoomToLayer({
  layerId,
  fileLayers,
  onDone,
}: {
  layerId: string | null
  fileLayers: FileLayer[]
  onDone: () => void
}) {
  const map = useMap()

  useEffect(() => {
    if (!layerId) return
    const layer = fileLayers.find(l => l.id === layerId)
    if (!layer) { onDone(); return }

    const bounds = getFileLayerBounds(layer)
    if (bounds) {
      map.fitBounds(bounds, { padding: [20, 20], maxZoom: 14 })
    }
    onDone()
  }, [layerId, fileLayers, map, onDone])

  return null
}

function FeatureInfoFetcher({
  capasActivas,
  onInfo,
}: {
  capasActivas: CapaActiva[]
  onInfo: (features: FeatureInfo[], latlng: L.LatLng) => void
}) {
  const map = useMap()
  const fetchingRef = useRef(false)

  const handleClick = useCallback(
    async (latlng: L.LatLng) => {
      if (fetchingRef.current || capasActivas.length === 0) {
        return
      }

      fetchingRef.current = true
      const size = 256
      const point = map.latLngToContainerPoint(latlng)
      const bounds = map.getBounds()
      const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`

      const results: FeatureInfo[] = []

      for (const capa of capasActivas) {
        try {
          const params = new URLSearchParams({
            service: 'WMS',
            version: '1.1.1',
            request: 'GetFeatureInfo',
            layers: capa.nombre_capa,
            query_layers: capa.nombre_capa,
            info_format: 'application/json',
            feature_count: '10',
            srs: 'EPSG:4326',
            bbox,
            width: String(size),
            height: String(size),
            x: String(Math.floor(point.x * (size / map.getSize().x))),
            y: String(Math.floor(point.y * (size / map.getSize().y))),
          })

          const url = `${capa.url_servicio}?${params.toString()}`
          const response = await fetch(url)

          if (!response.ok) continue

          const contentType = response.headers.get('content-type') || ''
          let atributos: Record<string, string> = {}

          if (contentType.includes('application/json')) {
            const json = await response.json()
            if (json.features && json.features.length > 0) {
              atributos = json.features[0].properties || {}
            }
          } else {
            const text = await response.text()
            if (text.includes('<Layer')) {
              const parser = new DOMParser()
              const doc = parser.parseFromString(text, 'text/xml')
              const features = doc.querySelectorAll('Feature')
              if (features.length > 0) {
                const attrs = features[0].querySelectorAll('Attribute')
                for (const attr of attrs) {
                  const name = attr.getAttribute('name') || ''
                  const value = attr.textContent || ''
                  if (name) atributos[name] = value
                }
              }
            }
          }

          if (Object.keys(atributos).length > 0) {
            results.push({ capa: capa.nombre_capa, atributos })
          }
        } catch {
          // Silently skip failed GetFeatureInfo requests
        }
      }

      onInfo(results, latlng)
      fetchingRef.current = false
    },
    [capasActivas, map, onInfo]
  )

  return <MapEventsHandler onMapClick={handleClick} />
}

function FeatureInfoPopup({
  featureInfo,
  popupPos,
  onClose,
}: {
  featureInfo: FeatureInfo[]
  popupPos: L.LatLng
  onClose: () => void
}) {
  const map = useMap()

  const handleClose = useCallback(() => {
    map.closePopup()
    onClose()
  }, [map, onClose])

  return (
    <Popup
      position={popupPos}
      maxWidth={360}
      minWidth={200}
      className="urbideas-popup"
      closeButton={true}
      autoPan={true}
      eventHandlers={{
        remove: handleClose,
      }}
    >
      <GetFeatureInfoPopup
        features={featureInfo}
        coordenadas={{ lat: popupPos.lat, lng: popupPos.lng }}
      />
    </Popup>
  )
}

function BaseLayerControl({
  activeLayer,
  onChange,
}: {
  activeLayer: string
  onChange: (layer: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="absolute top-2 right-2 z-[1000]" style={{ fontFamily: 'var(--font-family)' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-[var(--border-radius)] border shadow-sm transition-colors"
        style={{
          background: 'var(--color-card-bg)',
          color: 'var(--color-text-primary)',
          borderColor: 'var(--color-border)',
        }}
        title="Capa base"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
        {BASE_LAYERS[activeLayer]?.name || 'Callejero'}
        <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {expanded && (
        <div
          className="absolute top-full right-0 mt-1 rounded-[var(--border-radius)] border shadow-lg overflow-hidden min-w-[180px]"
          style={{
            background: 'var(--color-card-bg)',
            borderColor: 'var(--color-border)',
          }}
        >
          {Object.entries(BASE_LAYERS).map(([key, layer]) => (
            <button
              key={key}
              onClick={() => { onChange(key); setExpanded(false) }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${
                activeLayer === key
                  ? 'font-medium'
                  : 'hover:opacity-80'
              }`}
              style={{
                color: activeLayer === key ? 'var(--color-secondary)' : 'var(--color-text-primary)',
                background: activeLayer === key ? 'var(--color-primary)' + '20' : 'transparent',
              }}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{
                  background: activeLayer === key ? 'var(--color-secondary)' : 'var(--color-border)',
                }}
              />
              {layer.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function VisorMapaInner({
  capasActivas = [],
  fileLayers = [],
  center = [40.0, -3.7],
  zoom = 6,
  baseLayer = 'osm',
  onMapMove,
  onBaseLayerChange,
  zoomToLayerId = null,
  onZoomToDone,
}: VisorMapaProps) {
  const [featureInfo, setFeatureInfo] = useState<FeatureInfo[]>([])
  const [popupPos, setPopupPos] = useState<L.LatLng | null>(null)

  const handleFeatureInfo = useCallback((features: FeatureInfo[], latlng: L.LatLng) => {
    setFeatureInfo(features)
    setPopupPos(latlng)
  }, [])

  const closePopup = useCallback(() => {
    setPopupPos(null)
    setFeatureInfo([])
  }, [])

  const activeBase = BASE_LAYERS[baseLayer] || BASE_LAYERS.osm

  return (
    <div className="relative w-full h-full" style={{ fontFamily: 'var(--font-family)' }}>
      <MapContainer
        center={center}
        zoom={zoom}
        className="w-full h-full"
        style={{ background: 'var(--color-dark-bg)' }}
        zoomControl={false}
      >
        <TileLayer
          key={baseLayer}
          attribution={activeBase.attribution}
          url={activeBase.url}
        />

        {capasActivas.map(capa => (
          <WmsTileLayer
            key={capa.id}
            url={capa.url_servicio}
            layers={capa.nombre_capa}
            name={capa.nombre_capa}
            format={capa.formato_soportado || 'image/png'}
            visible={true}
          />
        ))}

        {fileLayers.map(layer => (
          <FileGeoJsonLayer key={layer.id} layer={layer} />
        ))}

        <MapInitializer center={center} zoom={zoom} />
        <MapMoveReporter onMove={onMapMove || (() => {})} />
        <ZoomToLayer
          layerId={zoomToLayerId}
          fileLayers={fileLayers}
          onDone={onZoomToDone || (() => {})}
        />

        <FeatureInfoFetcher
          capasActivas={capasActivas}
          onInfo={handleFeatureInfo}
        />

        {popupPos && (
          <FeatureInfoPopup
            featureInfo={featureInfo}
            popupPos={popupPos}
            onClose={closePopup}
          />
        )}
      </MapContainer>

      <BaseLayerControl
        activeLayer={baseLayer}
        onChange={onBaseLayerChange || (() => {})}
      />

      <div
        className="absolute bottom-3 left-3 z-[1000] px-3 py-1.5 flex items-center gap-2"
        style={{
          background: 'var(--color-card-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--border-radius)',
          fontSize: 11,
          color: 'var(--color-text-secondary)',
        }}
      >
        <span className="inline-block w-2 h-2 rounded-full bg-[var(--color-secondary)]" />
        Ideas Medioambientales — Registro Urbanístico España
      </div>
    </div>
  )
}

export default VisorMapaInner
