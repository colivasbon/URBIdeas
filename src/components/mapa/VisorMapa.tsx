"use client"
import React, { useState, useCallback, useRef, useEffect } from 'react'
import { MapContainer, TileLayer, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { WmsTileLayer } from './WmsTileLayer'
import { GetFeatureInfoPopup, type FeatureInfo } from './GetFeatureInfoPopup'
import { FileGeoJsonLayer } from './FileGeoJsonLayer'
import { SoilGeoJsonLayer } from './SoilGeoJsonLayer'
import { DibujoAmbito, type ModoDibujo } from './DibujoAmbito'
import { CapaAmbito } from './CapaAmbito'
import { parseWmsResponse } from '@/lib/getfeatureinfo'
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
  soilGeoJSON?: GeoJSON.FeatureCollection | null
  center?: [number, number]
  zoom?: number
  baseLayer?: string
  baseOpacity?: number
  onMapMove?: (lat: number, lng: number, zoom: number) => void
  onBaseLayerChange?: (layer: string) => void
  onBaseOpacityChange?: (opacity: number) => void
  zoomToLayerId?: string | null
  onZoomToDone?: () => void
  modoDibujo?: ModoDibujo
  ambitoGeoJSON?: GeoJSON.FeatureCollection | null
  encuadrarAmbitoKey?: number
  volarA?: { lat: number; lng: number; zoom?: number; key: number } | null
  onDibujarPoligono?: (geojson: GeoJSON.FeatureCollection) => void
  onDibujarPunto?: (lat: number, lng: number) => void
  onDibujarLinea?: (geojson: GeoJSON.FeatureCollection) => void
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

function VolarA({ destino }: { destino: { lat: number; lng: number; zoom?: number; key: number } | null | undefined }) {
  const map = useMap()
  const ultimoKey = useRef(0)
  useEffect(() => {
    if (!destino || destino.key === ultimoKey.current) return
    ultimoKey.current = destino.key
    map.flyTo([destino.lat, destino.lng], destino.zoom ?? 14, { duration: 1.2 })
  }, [map, destino])
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
    <div className="absolute top-3 right-3 z-[1000]">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls="visor-capa-base"
        className="flex min-h-[44px] items-center gap-2 rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-sm font-medium text-[var(--text-primary)] shadow-[var(--shadow-2)] transition-colors hover:border-[var(--border-strong)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none sm:min-h-[36px]"
        title="Capa base"
      >
        <span className="sr-only">Capa base: </span>
        {BASE_LAYERS[activeLayer]?.name || 'Callejero'}
        <svg aria-hidden="true" className={`h-3.5 w-3.5 text-[var(--text-muted)] transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {expanded && (
        <div
          id="visor-capa-base"
          className="absolute top-full right-0 mt-1 min-w-[200px] overflow-hidden rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-2)]"
        >
          {Object.entries(BASE_LAYERS).map(([key, layer]) => {
            const activa = activeLayer === key
            return (
              <button
                key={key}
                type="button"
                aria-pressed={activa}
                onClick={() => { onChange(key); setExpanded(false) }}
                className={`flex min-h-[40px] w-full items-center gap-2 px-3 text-left text-sm transition-colors hover:bg-[var(--bg-surface-sunken)] focus-visible:bg-[var(--bg-surface-sunken)] focus-visible:outline-none ${
                  activa ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 rounded-full ${activa ? 'bg-[var(--musgo)]' : 'border border-[var(--border-default)]'}`}
                />
                {layer.name}
              </button>
            )
          })}
          <div className="border-t border-[var(--border-subtle)] px-3 py-3">
            <label htmlFor="visor-opacidad-base" className="mb-1 block text-xs text-[var(--text-secondary)]">
              Opacidad de la capa base: <span className="tnum">{opacity} %</span>
            </label>
            <input
              id="visor-opacidad-base"
              type="range"
              min={0}
              max={100}
              value={opacity}
              onChange={(e) => onOpacityChange(Number(e.target.value))}
              className="w-full cursor-pointer accent-[var(--musgo)]"
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
  soilGeoJSON = null,
  center = [40.0, -3.7],
  zoom = 6,
  baseLayer = 'osm',
  baseOpacity = 100,
  onMapMove,
  onBaseLayerChange,
  onBaseOpacityChange,
  zoomToLayerId = null,
  onZoomToDone,
  modoDibujo = null,
  ambitoGeoJSON = null,
  encuadrarAmbitoKey = 0,
  volarA = null,
  onDibujarPoligono,
  onDibujarPunto,
  onDibujarLinea,
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
    <div className="relative h-full w-full">
      <MapContainer
        center={center}
        zoom={zoom}
        className="w-full h-full"
        style={{ background: 'var(--bg-surface-sunken)' }}
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

        <SoilGeoJsonLayer geojson={soilGeoJSON} />

        <CapaAmbito geojson={ambitoGeoJSON} encuadrarKey={encuadrarAmbitoKey} />
        <VolarA destino={volarA} />
        {modoDibujo && (
          <DibujoAmbito
            modo={modoDibujo}
            onPoligono={onDibujarPoligono || (() => {})}
            onPunto={onDibujarPunto || (() => {})}
            onLinea={onDibujarLinea || (() => {})}
          />
        )}

        <MapInitializer center={center} zoom={zoom} />
        <MapMoveReporter onMove={onMapMove || (() => {})} />
        <ZoomToLayer
          layerId={zoomToLayerId}
          fileLayers={fileLayers}
          onDone={onZoomToDone || (() => {})}
        />

        {!modoDibujo && (
          <FeatureInfoFetcher
            capasActivas={capasActivas}
            onInfo={handleFeatureInfo}
          />
        )}

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

      <p className="pointer-events-none absolute bottom-2 left-2 z-[1000] rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-[11px] text-[var(--text-secondary)]">
        Registro urbanístico de Ideas Medioambientales
      </p>
    </div>
  )
}

export default VisorMapaInner
