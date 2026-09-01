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
    <div className="flex h-full min-h-[400px] sm:min-h-[500px] items-center justify-center bg-[var(--color-input-bg)] rounded-[var(--border-radius-lg)]">
      <div className="text-center">
        <div className="animate-spin inline-block w-8 h-8 border-2 border-[var(--color-secondary)] border-t-transparent rounded-full mb-3" />
        <p className="text-sm text-[var(--color-text-muted)]">Cargando mapa...</p>
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [soilGeoJSON, setSoilGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null)
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

  const handleSoilToggle = useCallback((geojson: GeoJSON.FeatureCollection | null) => {
    setSoilGeoJSON(geojson)
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
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
          <section className="mb-6 sm:mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
              Visor de Mapa
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
              Explora las capas WMS disponibles y visualiza el planeamiento urbanístico sobre el mapa.
            </p>
          </section>

          <div className="flex flex-col gap-4 lg:gap-6 lg:flex-row">
            {/* Map */}
            <div className="flex-1 min-h-[400px] sm:min-h-[500px] order-1 lg:order-none">
              <div className="h-full rounded-[var(--border-radius-lg)] border border-[var(--color-border-subtle)] overflow-hidden shadow-[var(--shadow-sm)]" style={{ position: 'relative', zIndex: 0 }}>
                <VisorMapa
                  capasActivas={selectedCapas}
                  fileLayers={fileLayers}
                  soilGeoJSON={soilGeoJSON}
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

            {/* Mobile sidebar toggle */}
            <div className="lg:hidden order-2">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-card-bg)] border border-[var(--color-border-subtle)] rounded-[var(--border-radius)] transition-all duration-[var(--duration-normal)] hover:border-[var(--color-border)] hover:text-[var(--color-text-primary)]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75 6.429 9.75m11.142 0l4.179 2.25-9.75 5.25-9.75-5.25 4.179-2.25" />
                </svg>
                Capas{activeCapas.length > 0 && ` (${activeCapas.length})`}
                <svg className={`h-4 w-4 transition-transform duration-[var(--duration-normal)] ${sidebarOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
            </div>

            {/* Sidebar */}
            <div className={`w-full shrink-0 lg:w-80 order-3 lg:block ${sidebarOpen ? 'block' : 'hidden'}`}>
              <div className="bg-[var(--color-card-bg)] backdrop-blur-sm border border-[var(--color-border-subtle)] rounded-[var(--border-radius-lg)] shadow-[var(--shadow-sm)] lg:sticky lg:top-20" style={{ maxHeight: sidebarOpen ? 'none' : 'calc(100vh - 120px)', overflowY: 'auto' }}>
                <FileLayerPanel
                  fileLayers={fileLayers}
                  onAdd={addFileLayer}
                  onRemove={removeFileLayer}
                  onToggle={toggleFileLayer}
                  onColorChange={changeFileLayerColor}
                  onZoomTo={zoomToFileLayer}
                  onSoilToggle={handleSoilToggle}
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
