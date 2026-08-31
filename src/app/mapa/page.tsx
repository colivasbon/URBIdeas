"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import dynamic from "next/dynamic"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { ControlCapas } from "@/components/mapa/ControlCapas"
import { FileLayerPanel } from "@/components/mapa/FileLayerPanel"
import type { FileLayer } from "@/components/mapa/fileLayerUtils"
import type { CapaWMS } from "@/lib/types"

const VisorMapa = dynamic(() => import("@/components/mapa/VisorMapa"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[500px] items-center justify-center bg-[var(--color-input-bg)]">
      <div className="text-center">
        <div className="animate-spin inline-block w-8 h-8 border-2 border-[var(--color-secondary)] border-t-transparent rounded-full mb-3" />
        <p className="text-sm text-[var(--color-text-secondary)]">Cargando mapa...</p>
      </div>
    </div>
  ),
})

function readUrlParams() {
  if (typeof window === "undefined") return null
  const params = new URLSearchParams(window.location.search)
  const lat = parseFloat(params.get("lat") || "")
  const lng = parseFloat(params.get("lng") || "")
  const zoom = parseInt(params.get("zoom") || "", 10)
  const capas = params.get("capas") || ""
  const base = params.get("base") || ""
  const opacity = params.get("opacity") || ""
  return {
    lat: isNaN(lat) ? 40.0 : lat,
    lng: isNaN(lng) ? -3.7 : lng,
    zoom: isNaN(zoom) ? 6 : zoom,
    capas: capas ? capas.split(",").filter(Boolean) : [],
    base: base || "osm",
    opacity,
  }
}

function writeUrlParams(lat: number, lng: number, zoom: number, capas: string[], base: string, opacity: number) {
  const params = new URLSearchParams()
  params.set("lat", lat.toFixed(4))
  params.set("lng", lng.toFixed(4))
  params.set("zoom", String(zoom))
  if (capas.length > 0) params.set("capas", capas.join(","))
  if (base && base !== "osm") params.set("base", base)
  if (opacity < 100) params.set("opacity", String(opacity))
  const url = `${window.location.pathname}?${params.toString()}`
  window.history.replaceState({}, "", url)
}

export default function MapaPage() {
  const [capas, setCapas] = useState<CapaWMS[]>([])
  const [activeCapas, setActiveCapas] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [mapCenter, setMapCenter] = useState<[number, number]>(() => {
    const params = readUrlParams()
    return params ? [params.lat, params.lng] : [40.0, -3.7]
  })
  const [mapZoom, setMapZoom] = useState(() => {
    const params = readUrlParams()
    return params ? params.zoom : 6
  })
  const [baseLayer, setBaseLayer] = useState(() => {
    const params = readUrlParams()
    return params ? params.base : "osm"
  })
  const [baseOpacity, setBaseOpacity] = useState(() => {
    const params = readUrlParams()
    const o = parseInt(params?.opacity || "", 10)
    return isNaN(o) ? 100 : Math.min(100, Math.max(0, o))
  })
  const [fileLayers, setFileLayers] = useState<FileLayer[]>([])
  const [zoomToLayerId, setZoomToLayerId] = useState<string | null>(null)
  const [capasPanelOpen, setCapasPanelOpen] = useState(false)
  const [filePanelOpen, setFilePanelOpen] = useState(false)
  const initializedRef = useRef(false)
  const initialCapasRef = useRef<string[]>([])

  useEffect(() => {
    const params = readUrlParams()
    if (params && params.capas.length > 0) {
      initialCapasRef.current = params.capas
    }
  }, [])

  useEffect(() => {
    async function fetchCapas() {
      try {
        const res = await fetch("/api/capas-wms")
        const json = await res.json()
        if (!json.error && json.data) {
          setCapas(json.data)
          const initialCapas = initialCapasRef.current
          if (initialCapas.length > 0) {
            const validIds = json.data.map((c: CapaWMS) => c.id)
            setActiveCapas(initialCapas.filter(id => validIds.includes(id)))
          }
          initializedRef.current = true
        }
      } catch {
        // Error silently ignored
      } finally {
        setLoading(false)
      }
    }
    fetchCapas()
  }, [])

  const toggleCapa = useCallback((id: string) => {
    setActiveCapas(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }, [])

  const handleMapMove = useCallback((lat: number, lng: number, zoom: number) => {
    setMapCenter([lat, lng])
    setMapZoom(zoom)
  }, [])

  const handleBaseLayerChange = useCallback((layer: string) => {
    setBaseLayer(layer)
  }, [])

  const addFileLayer = useCallback((layer: FileLayer) => {
    setFileLayers(prev => [...prev, layer])
  }, [])

  const removeFileLayer = useCallback((id: string) => {
    setFileLayers(prev => prev.filter(l => l.id !== id))
  }, [])

  const toggleFileLayer = useCallback((id: string) => {
    setFileLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l))
  }, [])

  const changeFileLayerColor = useCallback((id: string, color: string) => {
    setFileLayers(prev => prev.map(l => l.id === id ? { ...l, color } : l))
  }, [])

  const zoomToFileLayer = useCallback((id: string) => {
    setZoomToLayerId(id)
  }, [])

  useEffect(() => {
    if (!initializedRef.current) return
    writeUrlParams(mapCenter[0], mapCenter[1], mapZoom, activeCapas, baseLayer, baseOpacity)
  }, [mapCenter, mapZoom, activeCapas, baseLayer, baseOpacity])

  const selectedCapas = capas
    .filter(c => activeCapas.includes(c.id))
    .map(c => ({
      id: c.id,
      nombre_capa: c.nombre_capa,
      url_servicio: c.url_servicio,
      formato_soportado: c.formato_soportado || "image/png",
    }))

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <section className="mb-4">
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl">
              Visor de Mapa
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
              Explora las capas WMS disponibles y visualiza el planeamiento urbanístico sobre el mapa.
            </p>
          </section>

          {/* Barra de herramientas superior */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => { setCapasPanelOpen(!capasPanelOpen); setFilePanelOpen(false) }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[var(--border-radius)] border transition-colors ${
                capasPanelOpen
                  ? 'bg-[var(--color-secondary)] text-[#1A1A1A] border-[var(--color-secondary)]'
                  : 'bg-[var(--color-card-bg)] text-[var(--color-text-primary)] border-[var(--color-border)] hover:border-[var(--color-secondary)]'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Capas WMS
              {activeCapas.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-[var(--color-secondary)]/20 text-[var(--color-secondary)]">
                  {activeCapas.length}
                </span>
              )}
            </button>

            <button
              onClick={() => { setFilePanelOpen(!filePanelOpen); setCapasPanelOpen(false) }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[var(--border-radius)] border transition-colors ${
                filePanelOpen
                  ? 'bg-[var(--color-secondary)] text-[#1A1A1A] border-[var(--color-secondary)]'
                  : 'bg-[var(--color-card-bg)] text-[var(--color-text-primary)] border-[var(--color-border)] hover:border-[var(--color-secondary)]'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
              </svg>
              Mis capas
              {fileLayers.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-[var(--color-secondary)]/20 text-[var(--color-secondary)]">
                  {fileLayers.length}
                </span>
              )}
            </button>

            {activeCapas.length > 0 && (
              <button
                onClick={() => setActiveCapas([])}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-red-400 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Desactivar todas ({activeCapas.length})
              </button>
            )}
          </div>

          {/* Paneles desplegables */}
          {capasPanelOpen && (
            <div className="mb-3 bg-[var(--color-card-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] overflow-hidden" style={{ maxHeight: '400px' }}>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-4 border-[var(--color-secondary)] border-t-transparent" />
                  <span className="ml-2 text-sm text-[var(--color-text-secondary)]">Cargando capas...</span>
                </div>
              ) : (
                <ControlCapas
                  capasSeleccionadas={activeCapas}
                  onToggleCapa={toggleCapa}
                />
              )}
            </div>
          )}

          {filePanelOpen && (
            <div className="mb-3 bg-[var(--color-card-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] p-4">
              <FileLayerPanel
                fileLayers={fileLayers}
                onAdd={addFileLayer}
                onRemove={removeFileLayer}
                onToggle={toggleFileLayer}
                onColorChange={changeFileLayerColor}
                onZoomTo={zoomToFileLayer}
              />
            </div>
          )}

          {/* Mapa */}
          <div className="h-[600px] rounded-[var(--border-radius)] border border-[var(--color-border)]" style={{ position: 'relative', zIndex: 0 }}>
            <VisorMapa
              capasActivas={selectedCapas}
              fileLayers={fileLayers}
              center={mapCenter}
              zoom={mapZoom}
              baseLayer={baseLayer}
              baseOpacity={baseOpacity}
              onMapMove={handleMapMove}
              onBaseLayerChange={handleBaseLayerChange}
              onBaseOpacityChange={setBaseOpacity}
              zoomToLayerId={zoomToLayerId}
              onZoomToDone={() => setZoomToLayerId(null)}
            />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
