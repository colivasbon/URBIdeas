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
  baseOpacity?: number
  onMapMove?: (lat: number, lng: number, zoom: number) => void
  onBaseLayerChange?: (layer: string) => void
  onBaseOpacityChange?: (opacity: number) => void
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
    url: 'https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&layer=OI.OrthoimageCoverage&style=default&tilematrixset=EPSG%3A3857&tilematrix={z}&tilecol={x}&tilerow={y}&format=image/jpeg',
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

function TileErrorFallback({
  activeLayer,
  onFallback,
}: {
  activeLayer: string
  onFallback: (layer: string) => void
}) {
  const map = useMap()
  const errorCountRef = useRef(0)
  const warnedRef = useRef(false)

  useEffect(() => {
    if (activeLayer === 'osm') return

    errorCountRef.current = 0
    warnedRef.current = false

    function handleTileError() {
      errorCountRef.current++
      if (errorCountRef.current >= 3 && !warnedRef.current) {
        warnedRef.current = true
        onFallback('osm')
      }
    }

    map.on('tileerror', handleTileError)
    return () => {
      map.off('tileerror', handleTileError)
    }
  }, [map, activeLayer, onFallback])

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

function parseWmsResponse(text: string, contentType: string): Record<string, string> {
  const atributos: Record<string, string> = {}

  if (contentType.includes('application/json')) {
    try {
      const json = JSON.parse(text)
      if (json.features?.length > 0) {
        return json.features[0].properties || {}
      }
    } catch { /* ignore */ }
    return atributos
  }

  if (contentType.includes('text/html')) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/html')
    const rows = doc.querySelectorAll('tr')
    for (const row of rows) {
      const cells = row.querySelectorAll('td')
      if (cells.length >= 2) {
        const key = cells[0].textContent?.trim() || ''
        const val = cells[1].textContent?.trim() || ''
        if (key) atributos[key] = val
      }
    }
    if (Object.keys(atributos).length > 0) return atributos
  }

  if (contentType.includes('text/plain') || contentType.includes('text/xml') || contentType.includes('application/vnd.ogc.gml')) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/xml')

    const featureMembers = doc.querySelectorAll('gml\\:featureMember, featureMember')
    if (featureMembers.length > 0) {
      for (const fm of featureMembers) {
        const children = fm.children
        if (children.length > 0) {
          const attrs = children[0].children
          for (const attr of attrs) {
            const name = attr.localName || attr.tagName?.split(':').pop() || ''
            const value = attr.textContent?.trim() || ''
            if (name && value) atributos[name] = value
          }
          if (Object.keys(atributos).length > 0) return atributos
        }
      }
    }

    const ogcFeatures = doc.querySelectorAll('ogc\\:Feature, Feature')
    for (const feat of ogcFeatures) {
      const attrs = feat.querySelectorAll('Attribute')
      for (const attr of attrs) {
        const name = attr.getAttribute('name') || ''
        const value = attr.textContent?.trim() || ''
        if (name) atributos[name] = value
      }
      if (Object.keys(atributos).length > 0) return atributos
    }

    const plainAttrs = doc.querySelectorAll('[name]')
    for (const el of plainAttrs) {
      const name = el.getAttribute('name') || ''
      const value = el.textContent?.trim() || ''
      if (name && value && name !== 'name') atributos[name] = value
    }
    if (Object.keys(atributos).length > 0) return atributos
  }

  if (contentType.includes('text/plain') || (!contentType.includes('xml') && !contentType.includes('html') && !contentType.includes('json'))) {
    const lines = text.split('\n')
    for (const line of lines) {
      const eqIdx = line.indexOf('=')
      if (eqIdx > 0) {
        const key = line.substring(0, eqIdx).trim()
        const val = line.substring(eqIdx + 1).trim()
        if (key && val) atributos[key] = val
      }
    }
  }

  return atributos
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
            info_format: 'text/plain',
            feature_count: '10',
            srs: 'EPSG:4326',
            bbox,
            width: String(size),
            height: String(size),
            x: String(Math.floor(point.x * (size / map.getSize().x))),
            y: String(Math.floor(point.y * (size / map.getSize().y))),
            styles: '',
          })

          const wmsUrl = `${capa.url_servicio}?${params.toString()}`
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 15000)

          let response: Response
          try {
            if (wmsUrl.length > 2000) {
              response = await fetch('/api/wms-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: wmsUrl }),
                signal: controller.signal,
              })
            } else {
              const proxyUrl = `/api/wms-proxy?url=${encodeURIComponent(wmsUrl)}`
              response = await fetch(proxyUrl, { signal: controller.signal })
            }
          } catch (fetchErr) {
            clearTimeout(timeout)
            const msg = fetchErr instanceof DOMException && fetchErr.name === 'AbortError'
              ? 'Tiempo de espera agotado'
              : 'No disponible (CORS o red)'
            results.push({ capa: capa.nombre_capa, atributos: {}, error: msg })
            continue
          }
          clearTimeout(timeout)

          if (!response.ok) {
            results.push({ capa: capa.nombre_capa, atributos: {}, error: `HTTP ${response.status}` })
            continue
          }

          const respContentType = response.headers.get('content-type') || ''
          const text = await response.text()
          const atributos = parseWmsResponse(text, respContentType)

          if (Object.keys(atributos).length > 0) {
            results.push({ capa: capa.nombre_capa, atributos })
          }
        } catch {
          results.push({ capa: capa.nombre_capa, atributos: {}, error: 'Error inesperado' })
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
  opacity,
  onChange,
  onOpacityChange,
}: {
  activeLayer: string
  opacity: number
  onChange: (layer: string) => void
  onOpacityChange: (opacity: number) => void
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
          <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <label className="text-[10px] text-[var(--color-text-secondary)] block mb-1">
              Opacidad: {opacity}%
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={opacity}
              onChange={(e) => onOpacityChange(Number(e.target.value))}
              className="w-full h-1 accent-[var(--color-secondary)]"
              style={{ cursor: 'pointer' }}
            />
          </div>
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
  baseOpacity = 100,
  onMapMove,
  onBaseLayerChange,
  onBaseOpacityChange,
  zoomToLayerId = null,
  onZoomToDone,
}: VisorMapaProps) {
  const [featureInfo, setFeatureInfo] = useState<FeatureInfo[]>([])
  const [popupPos, setPopupPos] = useState<L.LatLng | null>(null)

  const handleFeatureInfo = useCallback((features: FeatureInfo[], latlng: L.LatLng) => {
    const hasData = features.some(f => Object.keys(f.atributos).length > 0)
    if (hasData) {
      setFeatureInfo(features)
      setPopupPos(latlng)
    }
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
        attributionControl={false}
      >
        <TileLayer
          key={baseLayer}
          attribution={activeBase.attribution}
          url={activeBase.url}
          opacity={baseOpacity / 100}
        />

        <TileErrorFallback
          activeLayer={baseLayer}
          onFallback={onBaseLayerChange || (() => {})}
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
        opacity={baseOpacity}
        onChange={onBaseLayerChange || (() => {})}
        onOpacityChange={onBaseOpacityChange || (() => {})}
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
