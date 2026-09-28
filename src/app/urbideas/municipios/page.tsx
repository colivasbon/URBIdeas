"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import dynamic from "next/dynamic"
import UrbideasHeader from "@/components/platform/UrbideasHeader"
import PlatformFooter from "@/components/platform/PlatformFooter"
import { Badge } from "@/components/ui/Badge"
import PageShell from "@/components/ui/PageShell"
import Breadcrumbs from "@/components/ui/Breadcrumbs"
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
  const base = "badge"
  switch (estado.toLowerCase()) {
    case "aprobado":
    case "vigente":
      return `${base} badge-available`
    case "en tramite":
    case "en trámite":
    case "pendiente":
      return `${base} badge-warning`
    case "borrador":
    case "avance":
      return `${base} badge-info`
    case "derogado":
    case "caducado":
      return `${base} badge-danger`
    default:
      return `${base} badge-pending`
  }
}

function Cargando({ texto }: { texto: string }) {
  return (
    <div className="flex items-center gap-3 py-4" role="status" aria-live="polite">
      <span className="spinner text-[var(--moss-ink)]" aria-hidden="true" />
      <span className="text-sm text-[var(--text-muted)]">{texto}</span>
    </div>
  )
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
      setErrorComparacion("No se pudieron cargar los datos de la comparativa.")
      setMunicipiosComparados([])
    }

    setLoadingComparacion(false)
  }, [])

  useEffect(() => {
    if (comparando && comparisonRef.current) {
      comparisonRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, [comparando, municipiosComparados])

  const cerrarComparativa = () => {
    setComparando(false)
    setMunicipiosComparados([])
    setErrorComparacion(null)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <UrbideasHeader />

      <main id="contenido" className="flex-1">
        <div className="container-ima pb-16">
          <PageShell
            breadcrumbs={
              <Breadcrumbs
                items={[
                  { label: "IDEAS Sostenibilidad", href: "/" },
                  { label: "URBideas", href: "/urbideas" },
                  { label: "Municipios" },
                ]}
              />
            }
            title="Municipios"
            lede="Seleccione un municipio para consultar su planeamiento, la legislación aplicable y las capas disponibles, o compare hasta diez municipios de una misma provincia."
          />

          <div className="grid gap-12 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-16">
            <aside className="flex flex-col gap-10">
              <section aria-labelledby="filtro-ubicacion">
                <h2 id="filtro-ubicacion" className="type-h4 mb-5 text-[var(--text-primary)]">
                  Ubicación
                </h2>
                <FiltroCascada onMunicipioSeleccionado={handleMunicipioSeleccionado} onProvinciaSeleccionada={setProvinciaId} />
              </section>

              <section aria-labelledby="comparacion-multiple" className="border-t border-[var(--border-subtle)] pt-8">
                <h2 id="comparacion-multiple" className="type-h4 text-[var(--text-primary)]">
                  Comparar municipios
                </h2>
                <p className="type-body-sm mt-2 mb-5 text-[var(--text-secondary)]">
                  Elija hasta diez municipios de la provincia seleccionada.
                </p>
                <SelectorMultiMunicipio onCompare={handleCompare} provinciaId={provinciaId} />
              </section>
            </aside>

            <div className="min-w-0">
              {!selectedMunicipio && !comparando && (
                <div>
                  <p className="type-h4 text-[var(--text-primary)]">Ningún municipio seleccionado</p>
                  <p className="type-body-sm mt-2 max-w-[60ch] text-[var(--text-secondary)]">
                    Elija comunidad autónoma, provincia y municipio en el filtro de ubicación para ver su
                    ficha urbanística.
                  </p>
                </div>
              )}

              {selectedMunicipio && (
                <article aria-labelledby="municipio-titulo">
                  <header>
                    <h2 id="municipio-titulo" className="type-h2 text-[var(--text-primary)]">
                      {selectedMunicipio.nombre}
                    </h2>
                    <dl className="tnum mt-5 flex flex-wrap gap-x-10 gap-y-4">
                      {selectedMunicipio.provincia?.comunidad_autonoma?.nombre && (
                        <div>
                          <dt className="type-label text-[var(--text-muted)]">Comunidad autónoma</dt>
                          <dd className="mt-1 text-sm text-[var(--text-primary)]">
                            {selectedMunicipio.provincia.comunidad_autonoma.nombre}
                          </dd>
                        </div>
                      )}
                      {selectedMunicipio.provincia?.nombre && (
                        <div>
                          <dt className="type-label text-[var(--text-muted)]">Provincia</dt>
                          <dd className="mt-1 text-sm text-[var(--text-primary)]">{selectedMunicipio.provincia.nombre}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="type-label text-[var(--text-muted)]">Código INE</dt>
                        <dd className="mt-1 text-sm text-[var(--text-primary)]">{selectedMunicipio.codigo_ine}</dd>
                      </div>
                      {selectedMunicipio.poblacion != null && (
                        <div>
                          <dt className="type-label text-[var(--text-muted)]">Población</dt>
                          <dd className="mt-1 text-sm text-[var(--text-primary)]">
                            {selectedMunicipio.poblacion.toLocaleString("es-ES")} habitantes
                          </dd>
                        </div>
                      )}
                    </dl>
                  </header>

                  <div className="mt-8 overflow-hidden rounded-[6px] border border-[var(--border-subtle)]">
                    <MunicipioMapa
                      lat={nominatimCoords?.lat ?? selectedMunicipio.lat ?? null}
                      lng={nominatimCoords?.lng ?? selectedMunicipio.lng ?? null}
                      nombre={selectedMunicipio.nombre}
                    />
                  </div>

                  {/* Instrumentos de planeamiento */}
                  {(loadingPlaneamiento || instrumentos.length > 0) && (
                    <section aria-labelledby="sec-planeamiento" className="mt-12">
                      <h3 id="sec-planeamiento" className="type-h3 text-[var(--text-primary)]">
                        Instrumentos de planeamiento
                      </h3>
                      {loadingPlaneamiento ? (
                        <Cargando texto="Cargando planeamiento…" />
                      ) : instrumentos.length === 0 ? (
                        <p className="mt-3 text-sm text-[var(--text-muted)]">
                          Sin datos de planeamiento verificados para este municipio.
                        </p>
                      ) : (
                        <ul className="mt-4 border-t border-[var(--border-subtle)]">
                          {instrumentos.map((inst) => (
                            <li
                              key={inst.id}
                              className="flex flex-col gap-3 border-b border-[var(--border-subtle)] py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-semibold text-[var(--text-primary)]">{inst.tipo}</span>
                                  <span className={getEstadoBadge(inst.estado)}>{inst.estado}</span>
                                </div>
                                <div className="tnum mt-1.5 flex flex-col gap-0.5 text-xs text-[var(--text-secondary)]">
                                  {inst.fecha_aprobacion_definitiva && (
                                    <span>Aprobación definitiva: {inst.fecha_aprobacion_definitiva}</span>
                                  )}
                                  {inst.fecha_aprobacion_inicial && !inst.fecha_aprobacion_definitiva && (
                                    <span>Aprobación inicial: {inst.fecha_aprobacion_inicial}</span>
                                  )}
                                  {inst.fuente && <span className="text-[var(--text-muted)]">Fuente: {inst.fuente}</span>}
                                </div>
                              </div>
                              {(inst.enlace_documento_oficial || inst.enlace_geoportal) && (
                                <div className="flex shrink-0 flex-wrap gap-x-5 gap-y-2 text-sm">
                                  {inst.enlace_documento_oficial && (
                                    <a
                                      href={inst.enlace_documento_oficial}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="link link-external"
                                    >
                                      Documento oficial
                                    </a>
                                  )}
                                  {inst.enlace_geoportal && (
                                    <a
                                      href={inst.enlace_geoportal}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="link link-external"
                                    >
                                      Geoportal
                                    </a>
                                  )}
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  )}

                  {/* Legislación aplicable */}
                  {(loadingNormativa || normativa.length > 0) && (
                    <section aria-labelledby="sec-legislacion" className="mt-12">
                      <h3 id="sec-legislacion" className="type-h3 text-[var(--text-primary)]">
                        Legislación aplicable
                      </h3>
                      {loadingNormativa ? (
                        <Cargando texto="Cargando legislación…" />
                      ) : (
                        <div className="mt-4 border-t border-[var(--border-subtle)]">
                          {(["estatal", "autonomica", "municipal"] as const).map((ambito) => {
                            const items = normativa.filter((n) => n.ambito === ambito)
                            if (items.length === 0) return null
                            const isOpen = openNormativa === ambito
                            const labels: Record<string, string> = {
                              estatal: "Normativa estatal",
                              autonomica: "Normativa autonómica",
                              municipal: "Instrumento municipal",
                            }
                            return (
                              <div key={ambito} className="border-b border-[var(--border-subtle)]">
                                <button
                                  type="button"
                                  onClick={() => setOpenNormativa(isOpen ? "" : ambito)}
                                  aria-expanded={isOpen}
                                  className="flex min-h-11 w-full items-center justify-between gap-4 py-3 text-left text-sm font-medium text-[var(--text-primary)] transition-colors hover:text-[var(--text-link)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                                >
                                  <span>{labels[ambito]}</span>
                                  <span className="flex items-center gap-3">
                                    <span className="tnum text-xs text-[var(--text-muted)]">
                                      {items.length} {items.length === 1 ? "norma" : "normas"}
                                    </span>
                                    <svg
                                      className={`h-4 w-4 text-[var(--text-muted)] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                      aria-hidden="true"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </span>
                                </button>
                                {isOpen && (
                                  <ul className="pb-3">
                                    {items.map((norm) => (
                                      <li key={norm.id} className="border-t border-[var(--border-subtle)] py-3 pl-4">
                                        <p className="max-w-[70ch] text-sm font-medium text-[var(--text-primary)]">
                                          {norm.titulo}
                                        </p>
                                        <div className="tnum mt-1 flex flex-col gap-0.5 text-xs text-[var(--text-secondary)]">
                                          {norm.referencia_legal && <span>Referencia: {norm.referencia_legal}</span>}
                                          {norm.fecha_publicacion && <span>Publicación: {norm.fecha_publicacion}</span>}
                                        </div>
                                        <div className="mt-2 flex flex-wrap items-center gap-3">
                                          <Badge
                                            variant={
                                              norm.estado_vigencia === "vigente"
                                                ? "success"
                                                : norm.estado_vigencia === "derogada"
                                                  ? "danger"
                                                  : "muted"
                                            }
                                          >
                                            {norm.estado_vigencia}
                                          </Badge>
                                          {norm.enlace_boe_boletin && (
                                            <a
                                              href={norm.enlace_boe_boletin}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="link link-external text-sm"
                                            >
                                              Ver boletín
                                            </a>
                                          )}
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </section>
                  )}

                  {/* Capas aplicables */}
                  {(loadingCapas || capas.length > 0) && (
                    <section aria-labelledby="sec-capas" className="mt-12">
                      <h3 id="sec-capas" className="type-h3 text-[var(--text-primary)]">
                        Capas disponibles para informe
                      </h3>
                      {loadingCapas ? (
                        <Cargando texto="Cargando capas…" />
                      ) : (
                        <div className="mt-4 border-t border-[var(--border-subtle)]">
                          {Object.entries(groupedCapas).map(([categoria, capasGrupo]) => {
                            const isOpen = openCapaCategoria.includes(categoria)
                            return (
                              <div key={categoria} className="border-b border-[var(--border-subtle)]">
                                <button
                                  type="button"
                                  onClick={() => toggleCapaCategoria(categoria)}
                                  aria-expanded={isOpen}
                                  className="flex min-h-11 w-full items-center justify-between gap-4 py-3 text-left text-sm font-medium text-[var(--text-primary)] transition-colors hover:text-[var(--text-link)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                                >
                                  <span>{categoria}</span>
                                  <span className="flex items-center gap-3">
                                    <span className="tnum text-xs text-[var(--text-muted)]">
                                      {capasGrupo.length} {capasGrupo.length === 1 ? "capa" : "capas"}
                                    </span>
                                    <svg
                                      className={`h-4 w-4 text-[var(--text-muted)] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                      aria-hidden="true"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </span>
                                </button>
                                {isOpen && (
                                  <ul className="pb-3">
                                    {capasGrupo.map((capa) => (
                                      <li
                                        key={capa.id}
                                        className="flex items-center justify-between gap-4 border-t border-[var(--border-subtle)] py-3 pl-4"
                                      >
                                        <div className="flex min-w-0 flex-col">
                                          <span className="truncate text-sm text-[var(--text-primary)]">{capa.nombre_capa}</span>
                                          <span className="text-xs text-[var(--text-muted)]">{capa.tipo_servicio}</span>
                                        </div>
                                        <a
                                          href={`/urbideas/mapa?layers=${capa.id}&center=${selectedMunicipio?.lng || 0},${selectedMunicipio?.lat || 0}&zoom=12`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="btn btn-secondary btn-sm shrink-0"
                                        >
                                          Ver en el mapa
                                        </a>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </section>
                  )}

                  {!loadingPlaneamiento && !loadingNormativa && !loadingCapas &&
                    instrumentos.length === 0 && normativa.length === 0 && capas.length === 0 && (
                    <p className="mt-10 text-sm text-[var(--text-muted)]">
                      Cargando datos del municipio…
                    </p>
                  )}
                </article>
              )}

              {/* Comparativa */}
              {comparando && (
                <section
                  ref={comparisonRef}
                  aria-labelledby="comparativa-titulo"
                  className={selectedMunicipio ? "mt-16 border-t border-[var(--border-strong)] pt-6" : undefined}
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <h2 id="comparativa-titulo" className="type-h2 text-[var(--text-primary)]">
                      Comparativa de municipios
                    </h2>
                    <button type="button" onClick={cerrarComparativa} className="btn btn-ghost btn-sm">
                      Cerrar comparativa
                    </button>
                  </div>

                  {loadingComparacion ? (
                    <div className="mt-4">
                      <Cargando texto="Cargando la comparativa…" />
                    </div>
                  ) : errorComparacion ? (
                    <div className="note note-danger mt-6" role="alert">
                      <p className="font-medium text-[var(--text-primary)]">{errorComparacion}</p>
                      <p className="mt-1">Revise la selección de municipios y vuelva a compararlos.</p>
                    </div>
                  ) : municipiosComparados.length === 0 ? (
                    <p className="mt-6 text-sm text-[var(--text-muted)]">
                      No hay datos de planeamiento para los municipios seleccionados. Pruebe con otra selección.
                    </p>
                  ) : (
                    <>
                      <div className="mt-6 overflow-hidden rounded-[6px] border border-[var(--border-subtle)]">
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
                      <div className="data-table-wrap mt-8 rounded-[6px] border border-[var(--border-subtle)]">
                        <table className="data-table min-w-[640px]">
                          <thead>
                            <tr>
                              <th scope="col">Municipio</th>
                              <th scope="col">Provincia</th>
                              <th scope="col">Comunidad autónoma</th>
                              <th scope="col">Planeamiento</th>
                              <th scope="col">Estado</th>
                              <th scope="col" className="num">Aprobación</th>
                              <th scope="col">Documento</th>
                            </tr>
                          </thead>
                          <tbody>
                            {municipiosComparados.map((m) => (
                              <tr key={m.id}>
                                <td className="font-medium">{m.nombre}</td>
                                <td className="meta">{m.provincia}</td>
                                <td className="meta">{m.ccaa}</td>
                                <td className="meta">{m.tipo_planeamiento}</td>
                                <td>
                                  {m.estado ? (
                                    <Badge variant={estadoBadgeVariant[m.estado] ?? "primary"}>{m.estado}</Badge>
                                  ) : (
                                    <span className="text-[var(--text-muted)]">—</span>
                                  )}
                                </td>
                                <td className="num meta">
                                  {m.fecha_aprobacion
                                    ? new Date(m.fecha_aprobacion).toLocaleDateString("es-ES")
                                    : "—"}
                                </td>
                                <td>
                                  {m.enlace ? (
                                    <a
                                      href={m.enlace}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="link link-external"
                                    >
                                      Ver documento
                                    </a>
                                  ) : (
                                    <span className="text-[var(--text-muted)]">—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </section>
              )}
            </div>
          </div>
        </div>
      </main>

      <PlatformFooter />
    </div>
  )
}
