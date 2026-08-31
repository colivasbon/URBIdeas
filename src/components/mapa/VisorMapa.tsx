"use client"
import React, { useState, useCallback, useRef } from 'react'
import { MapContainer, TileLayer, LayersControl, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { WmsTileLayer } from './WmsTileLayer'
import { GetFeatureInfoPopup, type FeatureInfo } from './GetFeatureInfoPopup'

interface CapaActiva {
  id: string
  nombre_capa: string
  url_servicio: string
  formato_soportado: string
}

interface VisorMapaProps {
  capasActivas: CapaActiva[]
}

function MapEventsHandler({ onMapClick }: { onMapClick: (latlng: L.LatLng) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng)
    },
  })
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
        onInfo([], latlng)
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

function VisorMapaInner({ capasActivas = [] }: VisorMapaProps) {
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

  return (
    <div className="relative w-full h-full" style={{ fontFamily: 'var(--font-family)' }}>
      <MapContainer
        center={[40.0, -3.7]}
        zoom={6}
        className="w-full h-full"
        style={{ background: 'var(--color-dark-bg)' }}
        zoomControl={false}
      >
        <LayersControl position="topleft">
          <LayersControl.BaseLayer checked name="OpenStreetMap">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Grayscale (Dark)">
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
          </LayersControl.BaseLayer>
        </LayersControl>

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
