"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import dynamic from "next/dynamic"
import UrbideasHeader from "@/components/platform/UrbideasHeader"
import PlatformFooter from "@/components/platform/PlatformFooter"
import { Badge } from "@/components/ui/Badge"
import FiltroCascada from "@/components/filtros/FiltroCascada"
import SelectorMultiMunicipio from "@/components/filtros/SelectorMultiMunicipio"

const MunicipioMapa = dynamic(() => import("@/components/mapa/MunicipioMapa"), { ssr: false })

interface Municipio {
  id: string
  nombre: string
  codigo_ine: string
  poblacion: number | null
  provincia_id: string
  lat?: number
  lng?: number
  provincia?: {
    nombre: string
    comunidad_autonoma?: { nombre: string }
  }
}

interface Instrumento {
  id: string
  tipo: string
  estado: string
  fecha_aprobacion_inicial: string | null
  fecha_aprobacion_definitiva: string | null
  enlace_documento_oficial: string | null
  enlace_geoportal: string | null
  fuente: string | null
}

interface Normativa {
  id: string
  ambito: string
  titulo: string
  referencia_legal: string
  fecha_publicacion: string | null
  enlace_boe_boletin: string | null
  estado_vigencia: string
}

interface CapaAplicable {
  id: string
  nombre_capa: string
  tipo_servicio: string
  categoria: string
  url_servicio: string
  comunidad_autonoma?: { nombre: string }
}

interface MunicipioComparado {
  id: string
  nombre: string
  provincia: string
  ccaa: string
  lat: number | null
  lng: number | null
  tipo_planeamiento: string | null
  estado: string | null
  fecha_aprobacion: string | null
  enlace: string | null
}

const estadoBadgeVariant: Record<string, "success" | "primary" | "accent" | "danger"> = {
  vigente: "success",
  "en tramitación": "accent",
  "en revisión": "primary",
  "aprobado definitivamente": "success",
  "aprobado provisionalmente": "accent",
}

function getEstadoBadge(estado: string) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-[6px] text-xs font-semibold border"
  switch (estado.toLowerCase()) {
    case "aprobado":
    case "vigente":
      return `${base} bg-conifera-dark text-white border-[var(--conifera-active)]`
    case "en tramite":
    case "en trámite":
    case "pendiente":
      return `${base} bg-crisopa text-carbon border-conifera`
    case "borrador":
    case "avance":
      return `${base} bg-musgo text-hueso border-[var(--musgo-active)]`
    case "derogado":
    case "caducado":
      return `${base} bg-rupestre text-hueso border-rupestre`
    default:
      return `${base} bg-[var(--color-input-bg)] text-[var(--color-text-secondary)] border-[var(--color-border)]`
  }
}

export default function MunicipiosPage() {
  const [selectedMunicipio, setSelectedMunicipio] = useState<Municipio | null>(null)
  const [instrumentos, setInstrumentos] = useState<Instrumento[]>([])
  const [loadingPlaneamiento, setLoadingPlaneamiento] = useState(false)
  const [normativa, setNormativa] = useState<Normativa[]>([])
  const [loadingNormativa, setLoadingNormativa] = useState(false)
  const [openNormativa, setOpenNormativa] = useState<string>("")
  const [capas, setCapas] = useState<CapaAplicable[]>([])
  const [loadingCapas, setLoadingCapas] = useState(false)
  const [openCapaCategoria, setOpenCapaCategoria] = useState<string[]>([])

  const [comparando, setComparando] = useState(false)
  const [municipiosComparados, setMunicipiosComparados] = useState<MunicipioComparado[]>([])
  const [loadingComparacion, setLoadingComparacion] = useState(false)
  const [errorComparacion, setErrorComparacion] = useState<string | null>(null)
  const [provinciaId, setProvinciaId] = useState<string | null>(null)
  const [nominatimCoords, setNominatimCoords] = useState<{ lat: number; lng: number } | null>(null)
  const comparisonRef = useRef<HTMLDivElement>(null)
  const nominatimCacheRef = useRef<Map<string, { lat: number; lng: number }>>(new Map())

  const abortPlaneamientoRef = useRef<AbortController | null>(null)
  const abortNormativaRef = useRef<AbortController | null>(null)
  const abortCapasRef = useRef<AbortController | null>(null)

  const handleMunicipioSeleccionado = useCallback((municipio: Municipio | null) => {
    setSelectedMunicipio(municipio)
    setInstrumentos([])
    setNormativa([])
    setCapas([])
    setOpenNormativa("")
    setOpenCapaCategoria([])
    setNominatimCoords(null)
  }, [])

  useEffect(() => {
    if (!selectedMunicipio?.nombre) return

    const cacheKey = `${selectedMunicipio.nombre}|${selectedMunicipio.provincia?.nombre || ""}`
    const cached = nominatimCacheRef.current.get(cacheKey)
    if (cached) {
      setNominatimCoords(cached)
      return
    }

    const provincia = selectedMunicipio.provincia?.nombre || ""
    const query = provincia
      ? `${selectedMunicipio.nombre}, ${provincia}, España`
      : `${selectedMunicipio.nombre}, España`

    const controller = new AbortController()

    async function searchNominatim() {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1&countrycodes=es`
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { "Accept": "application/json" }
        })
        if (!res.ok) return
        const data = await res.json()
        if (data.length > 0) {
          const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
          nominatimCacheRef.current.set(cacheKey, result)
          setNominatimCoords(result)
        }
      } catch { }
    }

    searchNominatim()
    return () => controller.abort()
  }, [selectedMunicipio])

  useEffect(() => {
    if (!selectedMunicipio) return

    const munId = selectedMunicipio.id

    abortPlaneamientoRef.current?.abort()
    abortNormativaRef.current?.abort()
    abortCapasRef.current?.abort()

    const cPlaneamiento = new AbortController()
    const cNormativa = new AbortController()
    const cCapas = new AbortController()

    abortPlaneamientoRef.current = cPlaneamiento
    abortNormativaRef.current = cNormativa
    abortCapasRef.current = cCapas

    async function fetchPlaneamiento() {
      setLoadingPlaneamiento(true)
      try {
        const res = await fetch(`/api/planeamiento?municipio_ids=${munId}`, { signal: cPlaneamiento.signal })
        const json = await res.json()
        if (!cPlaneamiento.signal.aborted && !json.error && json.data) setInstrumentos(json.data)
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return
      }
      if (!cPlaneamiento.signal.aborted) setLoadingPlaneamiento(false)
    }

    async function fetchNormativa() {
      setLoadingNormativa(true)
      try {
        const res = await fetch(`/api/legislacion-aplicable?municipio_id=${munId}`, { signal: cNormativa.signal })
        const json = await res.json()
        if (!cNormativa.signal.aborted && !json.error && json.data) {
          const all = [
            ...(json.data.estatal || []),
            ...(json.data.autonomico || []),
            ...(json.data.municipal || []),
          ]
          setNormativa(all)
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return
      }
      if (!cNormativa.signal.aborted) setLoadingNormativa(false)
    }

    async function fetchCapas() {
      setLoadingCapas(true)
      try {
        const res = await fetch(`/api/capas-aplicables?municipio_id=${munId}`, { signal: cCapas.signal })
        const json = await res.json()
        if (!cCapas.signal.aborted && !json.error && json.data) {
          const all = Object.values(json.data).flat() as CapaAplicable[]
          setCapas(all)
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return
      }
      if (!cCapas.signal.aborted) setLoadingCapas(false)
    }

    fetchPlaneamiento()
    fetchNormativa()
    fetchCapas()

    return () => {
      cPlaneamiento.abort()
      cNormativa.abort()
      cCapas.abort()
    }
  }, [selectedMunicipio])

  const groupedCapas = capas.reduce<Record<string, CapaAplicable[]>>((acc, capa) => {
    if (!acc[capa.categoria]) acc[capa.categoria] = []
    acc[capa.categoria].push(capa)
    return acc
  }, {})

  const toggleCapaCategoria = useCallback((cat: string) => {
    setOpenCapaCategoria((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    )
  }, [])

  const handleCompare = useCallback(async (municipioIds: string[]) => {
    setComparando(true)
    setLoadingComparacion(true)
    setErrorComparacion(null)

    try {
      const res = await fetch(`/api/comparar?municipio_ids=${municipioIds.join(",")}`)
      const json = await res.json()

      if (json.error) {
        setErrorComparacion(json.error)
        setMunicipiosComparados([])
        setLoadingComparacion(false)
        return
      }

      const comparados: MunicipioComparado[] = (json.data || []).map((m: {
        id: string
        nombre: string
        lat?: number | null
        lng?: number | null
        provincia?: { nombre?: string; comunidad_autonoma?: { nombre?: string } } | null
        instrumentos_planeamiento?: { tipo?: string; estado?: string; fecha_aprobacion_definitiva?: string; enlace_documento_oficial?: string }[] | null
      }) => {
        const prov = Array.isArray(m.provincia) ? m.provincia[0] : m.provincia
        const ccaa = prov?.comunidad_autonoma
          ? (Array.isArray(prov.comunidad_autonoma) ? prov.comunidad_autonoma[0] : prov.comunidad_autonoma)
          : null
        const inst = Array.isArray(m.instrumentos_planeamiento)
          ? m.instrumentos_planeamiento[0]
          : m.instrumentos_planeamiento

        return {
          id: String(m.id),
          nombre: m.nombre,
          provincia: prov?.nombre ?? "—",
          ccaa: ccaa?.nombre ?? "—",
          lat: m.lat ?? null,
          lng: m.lng ?? null,
          tipo_planeamiento: inst?.tipo ?? "Sin datos verificados",
          estado: inst?.estado ?? null,
          fecha_aprobacion: inst?.fecha_aprobacion_definitiva ?? null,
          enlace: inst?.enlace_documento_oficial ?? null,
        }
      })

      setMunicipiosComparados(comparados)

      const enriched = await Promise.all(
        comparados.map(async (m) => {
          const cacheKey = `${m.nombre}|${m.provincia}`
          const cached = nominatimCacheRef.current.get(cacheKey)
          if (cached) return { ...m, lat: cached.lat, lng: cached.lng }

          const query = m.provincia && m.provincia !== "—"
            ? `${m.nombre}, ${m.provincia}, España`
            : `${m.nombre}, España`

          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=es`,
              { headers: { "Accept": "application/json" } }
            )
            if (!res.ok) return m
            const data = await res.json()
            if (data.length > 0) {
              const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
              nominatimCacheRef.current.set(cacheKey, result)
              return { ...m, lat: result.lat, lng: result.lng }
            }
          } catch { }
          return m
        })
      )

      setMunicipiosComparados(enriched)
    } catch {
      setErrorComparacion("Error al cargar los datos de comparación")
      setMunicipiosComparados([])
    }

    setLoadingComparacion(false)
  }, [])

  useEffect(() => {
    if (comparando && comparisonRef.current) {
      comparisonRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, [comparando, municipiosComparados])

  return (
    <div className="flex min-h-screen flex-col">
      <UrbideasHeader />

      <main className="flex-1">
        <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <section className="mb-8 border-b-2 border-musgo pb-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-0.5 w-8 bg-conifera" />
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--moss-ink)]">
                Exploración · URBideas
              </p>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
              Municipios
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--color-text-secondary)]">
              Busca, filtra y compara el planeamiento urbanístico de municipios de toda España.
            </p>
          </section>

          <div className="flex flex-col gap-6 lg:flex-row">
            {/* Left sidebar — distinct background panel */}
            <div className="w-full shrink-0 lg:w-80">
              <div className="premium-card p-5">
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">
                  Filtro por ubicación
                </h2>
                <FiltroCascada onMunicipioSeleccionado={handleMunicipioSeleccionado} onProvinciaSeleccionada={setProvinciaId} />
              </div>

              <div className="premium-card p-5 mt-4">
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">
                  Comparación múltiple
                </h2>
                <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
                  Busca y selecciona hasta 10 municipios para comparar.
                </p>
                <SelectorMultiMunicipio onCompare={handleCompare} provinciaId={provinciaId} />
              </div>
            </div>

            {/* Right content area */}
            <div className="flex-1 min-w-0">
              {selectedMunicipio && (
                <div className="animate-fade-in">
                  {/* Municipality header */}
                  <div className="mb-6">
                    <h2 className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">
                      {selectedMunicipio.nombre}
                    </h2>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-sm text-[var(--color-text-secondary)]">
                      {selectedMunicipio.provincia?.comunidad_autonoma?.nombre && (
                        <span>{selectedMunicipio.provincia.comunidad_autonoma.nombre}</span>
                      )}
                      {selectedMunicipio.provincia?.nombre && (
                        <span className="text-[var(--color-text-muted)]">·</span>
                      )}
                      {selectedMunicipio.provincia?.nombre && (
                        <span>{selectedMunicipio.provincia.nombre}</span>
                      )}
                      <span className="text-[var(--color-text-muted)]">·</span>
                      <span>INE {selectedMunicipio.codigo_ine}</span>
                      {selectedMunicipio.poblacion != null && (
                        <>
                          <span className="text-[var(--color-text-muted)]">·</span>
                          <span>{selectedMunicipio.poblacion.toLocaleString("es-ES")} habitantes</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Map */}
                  <div className="rounded-[6px] overflow-hidden mb-8">
                    <MunicipioMapa
                      lat={nominatimCoords?.lat ?? selectedMunicipio.lat ?? null}
                      lng={nominatimCoords?.lng ?? selectedMunicipio.lng ?? null}
                      nombre={selectedMunicipio.nombre}
                    />
                  </div>

                  {/* Planning instruments */}
                  {(loadingPlaneamiento || instrumentos.length > 0) && (
                    <div className="mb-8">
                      <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">
                        Instrumentos de Planeamiento
                      </h3>
                      {loadingPlaneamiento ? (
                        <div className="flex items-center gap-2 py-4">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-secondary)] border-t-transparent" />
                          <span className="text-sm text-[var(--color-text-muted)]">Cargando...</span>
                        </div>
                      ) : instrumentos.length === 0 ? (
                        <p className="text-sm text-[var(--color-text-muted)] italic">
                          Sin datos de planeamiento verificados para este municipio
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {instrumentos.map((inst) => (
                            <div
                              key={inst.id}
                              className="flex items-start justify-between gap-4 p-4 bg-[var(--color-card-bg)] border border-[var(--color-border-subtle)] rounded-[6px]"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm font-semibold text-[var(--color-text-primary)]">{inst.tipo}</span>
                                  <span className={getEstadoBadge(inst.estado)}>{inst.estado}</span>
                                </div>
                                {inst.fecha_aprobacion_definitiva && (
                                  <p className="text-xs text-[var(--color-text-muted)]">
                                    Aprobación definitiva: {inst.fecha_aprobacion_definitiva}
                                  </p>
                                )}
                                {inst.fecha_aprobacion_inicial && !inst.fecha_aprobacion_definitiva && (
                                  <p className="text-xs text-[var(--color-text-muted)]">
                                    Aprobación inicial: {inst.fecha_aprobacion_inicial}
                                  </p>
                                )}
                                {inst.fuente && (
                                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                                    Fuente: {inst.fuente}
                                  </p>
                                )}
                              </div>
                              <div className="flex gap-3 shrink-0 mt-0.5">
                                {inst.enlace_documento_oficial && (
                                  <a
                                    href={inst.enlace_documento_oficial}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)] transition-colors"
                                  >
                                    Documento oficial
                                  </a>
                                )}
                                {inst.enlace_geoportal && (
                                  <a
                                    href={inst.enlace_geoportal}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)] transition-colors"
                                  >
                                    Geoportal
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Applicable legislation */}
                  {(loadingNormativa || normativa.length > 0) && (
                    <div className="mb-8">
                      <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">
                        Legislación Aplicable
                      </h3>
                      {loadingNormativa ? (
                        <div className="flex items-center gap-2 py-4">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-secondary)] border-t-transparent" />
                          <span className="text-sm text-[var(--color-text-muted)]">Cargando...</span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {(["estatal", "autonomica", "municipal"] as const).map((ambito) => {
                            const items = normativa.filter((n) => n.ambito === ambito)
                            if (items.length === 0) return null
                            const isOpen = openNormativa === ambito
                            const labels: Record<string, string> = {
                              estatal: "Normativa Estatal",
                              autonomica: "Normativa Autonómica",
                              municipal: "Instrumento Municipal",
                            }
                            return (
                              <div
                                key={ambito}
                                className="bg-[var(--color-card-bg)] border border-[var(--color-border-subtle)] rounded-[6px] overflow-hidden"
                              >
                                <button
                                  type="button"
                                  onClick={() => setOpenNormativa(isOpen ? "" : ambito)}
                                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-input-bg-hover)] transition-colors"
                                >
                                  <span>{labels[ambito]}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[var(--color-text-muted)] text-xs">
                                      {items.length} {items.length === 1 ? "norma" : "normas"}
                                    </span>
                                    <svg
                                      className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </div>
                                </button>
                                {isOpen && (
                                  <div className="px-4 pb-4 space-y-2">
                                    {items.map((norm) => (
                                      <div
                                        key={norm.id}
                                        className="p-3 border-t border-[var(--color-border-subtle)]"
                                      >
                                        <p className="text-sm font-medium text-[var(--color-text-primary)]">
                                          {norm.titulo}
                                        </p>
                                        {norm.referencia_legal && (
                                          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                                            Ref: {norm.referencia_legal}
                                          </p>
                                        )}
                                        {norm.fecha_publicacion && (
                                          <p className="text-xs text-[var(--color-text-muted)]">
                                            Publicación: {norm.fecha_publicacion}
                                          </p>
                                        )}
                                        <div className="flex items-center gap-3 mt-2">
                                          <span className={`inline-flex items-center text-xs font-semibold px-1.5 py-0.5 rounded-[6px] border ${
                                            norm.estado_vigencia === "vigente"
                                              ? "bg-conifera-dark text-white border-[var(--conifera-active)]"
                                              : norm.estado_vigencia === "derogada"
                                                ? "bg-rupestre text-hueso border-rupestre"
                                                : "bg-[var(--color-input-bg)] text-[var(--color-text-secondary)] border-[var(--color-border)]"
                                          }`}>
                                            {norm.estado_vigencia}
                                          </span>
                                          {norm.enlace_boe_boletin && (
                                            <a
                                              href={norm.enlace_boe_boletin}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)] transition-colors"
                                            >
                                              Ver boletín
                                            </a>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Applicable layers */}
                  {(loadingCapas || capas.length > 0) && (
                    <div className="mb-8">
                      <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">
                        Capas disponibles para informe
                      </h3>
                      {loadingCapas ? (
                        <div className="flex items-center gap-2 py-4">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-secondary)] border-t-transparent" />
                          <span className="text-sm text-[var(--color-text-muted)]">Cargando...</span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {Object.entries(groupedCapas).map(([categoria, capasGrupo]) => {
                            const isOpen = openCapaCategoria.includes(categoria)
                            return (
                              <div
                                key={categoria}
                                className="bg-[var(--color-card-bg)] border border-[var(--color-border-subtle)] rounded-[6px] overflow-hidden"
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleCapaCategoria(categoria)}
                                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-input-bg-hover)] transition-colors"
                                >
                                  <span>{categoria}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[var(--color-text-muted)] text-xs">
                                      {capasGrupo.length} {capasGrupo.length === 1 ? "capa" : "capas"}
                                    </span>
                                    <svg
                                      className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </div>
                                </button>
                                {isOpen && (
                                  <div className="px-4 pb-4 space-y-2">
                                    {capasGrupo.map((capa) => (
                                      <div
                                        key={capa.id}
                                        className="flex items-center justify-between p-3 border-t border-[var(--color-border-subtle)]"
                                      >
                                        <div className="flex flex-col min-w-0">
                                          <span className="text-sm text-[var(--color-text-primary)] truncate">
                                            {capa.nombre_capa}
                                          </span>
                                          <span className="text-xs text-[var(--color-text-muted)]">
                                            {capa.tipo_servicio}
                                          </span>
                                        </div>
                                        <a
                                          href={`/urbideas/mapa?layers=${capa.id}&center=${selectedMunicipio?.lng || 0},${selectedMunicipio?.lat || 0}&zoom=12`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="shrink-0 ml-3 inline-flex min-h-[36px] items-center gap-1 text-xs font-semibold px-2.5 py-1 bg-musgo text-hueso rounded-[6px] hover:bg-musgo-hover transition-colors"
                                        >
                                          Ver en mapa
                                        </a>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {!loadingPlaneamiento && !loadingNormativa && !loadingCapas &&
                    instrumentos.length === 0 && normativa.length === 0 && capas.length === 0 && (
                    <p className="text-sm text-[var(--color-text-muted)] italic">
                      Cargando datos del municipio...
                    </p>
                  )}
                </div>
              )}

              {/* Comparison Table */}
              {comparando && (
                <div ref={comparisonRef} className="mt-6 animate-fade-in">
                  <div className="bg-[var(--color-card-bg)] border border-[var(--color-border-subtle)] rounded-[6px] overflow-hidden">
                    <div className="px-6 py-4 border-b border-[var(--color-border-subtle)]">
                      <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Comparativa de municipios</h3>
                    </div>

                    {loadingComparacion ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-secondary)] border-t-transparent" />
                        <span className="ml-3 text-sm text-[var(--color-text-muted)]">
                          Cargando datos...
                        </span>
                      </div>
                    ) : errorComparacion ? (
                      <div className="py-8 text-center px-6">
                        <p className="text-sm font-semibold text-[var(--danger-ink)] mb-3" role="alert">{errorComparacion}</p>
                        <button
                          onClick={() => {
                            setComparando(false)
                            setMunicipiosComparados([])
                            setErrorComparacion(null)
                          }}
                          className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-[6px] transition-colors hover:bg-[var(--color-input-bg)]"
                        >
                          Cerrar
                        </button>
                      </div>
                    ) : municipiosComparados.length === 0 ? (
                      <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">
                        No se encontraron datos para los municipios seleccionados.
                      </p>
                    ) : (
                      <>
                        <div className="m-6 rounded-[6px] overflow-hidden">
                          <MunicipioMapa
                            municipios={municipiosComparados
                              .filter((m) => m.lat != null && m.lng != null)
                              .map((m) => ({
                                id: m.id,
                                nombre: m.nombre,
                                lat: m.lat!,
                                lng: m.lng!,
                              }))}
                          />
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm min-w-[600px]">
                            <thead>
                              <tr className="border-b border-[var(--color-border-subtle)]">
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Municipio</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Provincia</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">CCAA</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Tipo</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Estado</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Fecha</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Enlace</th>
                              </tr>
                            </thead>
                            <tbody>
                              {municipiosComparados.map((m) => (
                                <tr
                                  key={m.id}
                                  className="border-b border-[var(--color-border-subtle)] transition-colors hover:bg-[var(--color-input-bg)]"
                                >
                                  <td className="px-4 py-3 font-medium text-[var(--color-text-primary)]">{m.nombre}</td>
                                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">{m.provincia}</td>
                                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">{m.ccaa}</td>
                                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">{m.tipo_planeamiento}</td>
                                  <td className="px-4 py-3">
                                    {m.estado ? (
                                      <Badge variant={estadoBadgeVariant[m.estado] ?? "primary"}>
                                        {m.estado}
                                      </Badge>
                                    ) : (
                                      <span className="text-[var(--color-text-muted)]">—</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                                    {m.fecha_aprobacion
                                      ? new Date(m.fecha_aprobacion).toLocaleDateString("es-ES")
                                      : "—"}
                                  </td>
                                  <td className="px-4 py-3">
                                    {m.enlace ? (
                                      <a
                                        href={m.enlace}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)] transition-colors font-medium"
                                      >
                                        Ver documento
                                      </a>
                                    ) : (
                                      <span className="text-[var(--color-text-muted)]">—</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}

                    <div className="px-6 py-4 flex justify-end border-t border-[var(--color-border-subtle)]">
                      <button
                        onClick={() => {
                          setComparando(false)
                          setMunicipiosComparados([])
                          setErrorComparacion(null)
                        }}
                        className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-lg transition-colors hover:bg-[var(--color-input-bg)]"
                      >
                        Cerrar comparativa
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <PlatformFooter />
    </div>
  )
}
