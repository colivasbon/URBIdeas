"use client"
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

export type ModoDibujo = null | 'poligono' | 'punto' | 'linea'

interface Props {
  modo: ModoDibujo
  onPoligono: (geojson: GeoJSON.FeatureCollection) => void
  onPunto: (lat: number, lng: number) => void
  onLinea: (geojson: GeoJSON.FeatureCollection) => void
  onCancelar?: () => void
}

/**
 * Dibujo propio ligero sobre el Leaflet ya montado (sin leaflet-draw):
 * clic añade vértices; doble clic o Intro cierra polígono/línea; clic simple pone punto.
 * Punto y línea no acreditan superficie (lo declara la ficha, no este control).
 */
export function DibujoAmbito({ modo, onPoligono, onPunto, onLinea }: Props) {
  const map = useMap()
  const ptsRef = useRef<L.LatLng[]>([])
  const lineRef = useRef<L.Layer | null>(null)
  const markersRef = useRef<L.CircleMarker[]>([])
  const modoRef = useRef(modo)
  const cbRef = useRef({ onPoligono, onPunto, onLinea })
  useEffect(() => {
    modoRef.current = modo
    cbRef.current = { onPoligono, onPunto, onLinea }
  }, [modo, onPoligono, onPunto, onLinea])

  function limpiar() {
    if (lineRef.current) { map.removeLayer(lineRef.current); lineRef.current = null }
    for (const m of markersRef.current) map.removeLayer(m)
    markersRef.current = []
    ptsRef.current = []
  }

  function redibujar() {
    const pts = ptsRef.current
    if (lineRef.current) { map.removeLayer(lineRef.current); lineRef.current = null }
    if (pts.length === 0) return
    const modo = modoRef.current
    if (modo === 'poligono') {
      lineRef.current = L.polygon(pts as L.LatLngExpression[], {
        color: '#e07b39', weight: 2, dashArray: '6 4', fillOpacity: 0.15,
      }).addTo(map)
    } else if (modo === 'linea' && pts.length >= 1) {
      lineRef.current = L.polyline(pts as L.LatLngExpression[], {
        color: '#e07b39', weight: 3, dashArray: '6 4',
      }).addTo(map)
    }
  }

  function cerrar() {
    const pts = ptsRef.current
    const { onPoligono, onLinea } = cbRef.current
    if (modoRef.current === 'poligono' && pts.length >= 3) {
      const ring = pts.map(p => [p.lng, p.lat])
      ring.push(ring[0])
      onPoligono({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }] })
    } else if (modoRef.current === 'linea' && pts.length >= 2) {
      onLinea({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts.map(p => [p.lng, p.lat]) } }] })
    }
    limpiar()
  }

  useEffect(() => {
    limpiar()
    map.getContainer().style.cursor = modo ? 'crosshair' : ''
    map.doubleClickZoom.disable()
    function onClick(e: L.LeafletMouseEvent) {
      const m = modoRef.current
      if (!m) return
      if (m === 'punto') {
        cbRef.current.onPunto(e.latlng.lat, e.latlng.lng)
        return
      }
      ;(L.DomEvent as unknown as { stopPropagation: (ev: unknown) => void }).stopPropagation(e.originalEvent)
      ptsRef.current.push(e.latlng)
      const dot = L.circleMarker(e.latlng, { radius: 4, color: '#e07b39', fillColor: '#e07b39', fillOpacity: 1 }).addTo(map)
      markersRef.current.push(dot)
      redibujar()
    }
    function onDblClick(e: L.LeafletMouseEvent) {
      if (!modoRef.current || modoRef.current === 'punto') return
      ;(L.DomEvent as unknown as { stopPropagation: (ev: unknown) => void }).stopPropagation(e.originalEvent)
      ptsRef.current.push(e.latlng)
      cerrar()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter') cerrar()
      if (e.key === 'Escape') limpiar()
    }
    map.on('click', onClick)
    map.on('dblclick', onDblClick)
    document.addEventListener('keydown', onKey)
    return () => {
      map.off('click', onClick)
      map.off('dblclick', onDblClick)
      document.removeEventListener('keydown', onKey)
      map.doubleClickZoom.enable()
      map.getContainer().style.cursor = ''
      limpiar()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, modo])

  return null
}
