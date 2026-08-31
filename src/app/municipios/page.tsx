"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import dynamic from "next/dynamic"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { Card, CardHeader, CardTitle } from "@/components/ui/Card"
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
  const base = "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
  switch (estado.toLowerCase()) {
    case "aprobado":
    case "vigente":
      return `${base} bg-emerald-500/15 text-emerald-400 border border-emerald-500/25`
    case "en tramite":
    case "en trámite":
    case "pendiente":
      return `${base} bg-amber-500/15 text-amber-400 border border-amber-500/25`
    case "borrador":
    case "avance":
      return `${base} bg-blue-500/15 text-blue-400 border border-blue-500/25`
    case "derogado":
    case "caducado":
      return `${base} bg-red-500/15 text-red-400 border border-red-500/25`
    default:
      return `${base} bg-[var(--color-input-bg)] text-[var(--color-text-secondary)] border border-[var(--color-border)]`
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
  const comparisonRef = useRef<HTMLDivElement>(null)

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
  }, [])

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
      <Header />

      <main className="flex-1">
        <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <section className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
              Municipios
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
              Busca, filtra y compara el planeamiento urbanístico de municipios de toda España.
            </p>
          </section>

          <div className="flex flex-col gap-6 lg:flex-row">
            {/* Left sidebar */}
            <div className="w-full shrink-0 lg:w-80">
              <Card>
                <CardHeader>
                  <CardTitle>Filtro por ubicación</CardTitle>
                </CardHeader>
                <FiltroCascada onMunicipioSeleccionado={handleMunicipioSeleccionado} onProvinciaSeleccionada={setProvinciaId} />
              </Card>

              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>Selección múltiple</CardTitle>
                </CardHeader>
                <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
                  Busca y selecciona hasta 10 municipios para comparar.
                </p>
                <SelectorMultiMunicipio onCompare={handleCompare} provinciaId={provinciaId} />
              </Card>
            </div>

            {/* Right content area */}
            <div className="flex-1 min-w-0">
              {selectedMunicipio && (
                <Card className="animate-fade-in">
                  <CardHeader>
                    <CardTitle>{selectedMunicipio.nombre}</CardTitle>
                  </CardHeader>
                  <div className="flex flex-col gap-1.5 text-sm text-[var(--color-text-secondary)] mb-4">
                    {selectedMunicipio.provincia?.comunidad_autonoma?.nombre && (
                      <p>
                        <span className="font-medium text-[var(--color-text-primary)]">CCAA:</span>{" "}
                        {selectedMunicipio.provincia.comunidad_autonoma.nombre}
                      </p>
                    )}
                    {selectedMunicipio.provincia?.nombre && (
                      <p>
                        <span className="font-medium text-[var(--color-text-primary)]">Provincia:</span>{" "}
                        {selectedMunicipio.provincia.nombre}
                      </p>
                    )}
                    <p>
                      <span className="font-medium text-[var(--color-text-primary)]">Código INE:</span>{" "}
                      {selectedMunicipio.codigo_ine}
                    </p>
                    {selectedMunicipio.poblacion != null && (
                      <p>
                        <span className="font-medium text-[var(--color-text-primary)]">Población:</span>{" "}
                        {selectedMunicipio.poblacion.toLocaleString("es-ES")} habitantes
                      </p>
                    )}
                  </div>

                  <div className="rounded-[var(--border-radius-lg)] overflow-hidden">
                    <MunicipioMapa
                      lat={selectedMunicipio.lat ?? null}
                      lng={selectedMunicipio.lng ?? null}
                      nombre={selectedMunicipio.nombre}
                    />
                  </div>

                  {/* Instrumentos de Planeamiento */}
                  {(loadingPlaneamiento || instrumentos.length > 0) && (
                    <div className="pt-4 mt-4 border-t border-[var(--color-border-subtle)]">
                      <p className="text-sm font-semibold text-[var(--color-secondary)] mb-3">
                        Instrumentos de Planeamiento
                      </p>
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
                        <div className="flex flex-col gap-2">
                          {instrumentos.map((inst) => (
                            <div
                              key={inst.id}
                              className="p-3 bg-[var(--color-input-bg)] border border-[var(--color-border-subtle)] rounded-[var(--border-radius)] transition-colors hover:border-[var(--color-border)]"
                            >
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-sm font-medium text-[var(--color-text-primary)]">{inst.tipo}</span>
                                <span className={getEstadoBadge(inst.estado)}>{inst.estado}</span>
                              </div>
                              {inst.fecha_aprobacion_definitiva && (
                                <p className="text-xs text-[var(--color-text-secondary)]">
                                  Aprobación definitiva: {inst.fecha_aprobacion_definitiva}
                                </p>
                              )}
                              {inst.fecha_aprobacion_inicial && !inst.fecha_aprobacion_definitiva && (
                                <p className="text-xs text-[var(--color-text-secondary)]">
                                  Aprobación inicial: {inst.fecha_aprobacion_inicial}
                                </p>
                              )}
                              {inst.fuente && (
                                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                                  Fuente: {inst.fuente}
                                </p>
                              )}
                              <div className="flex gap-3 mt-2">
                                {inst.enlace_documento_oficial && (
                                  <a
                                    href={inst.enlace_documento_oficial}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)] transition-colors"
                                  >
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                    </svg>
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
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                    </svg>
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

                  {/* Legislación Aplicable */}
                  {(loadingNormativa || normativa.length > 0) && (
                    <div className="pt-4 mt-4 border-t border-[var(--color-border-subtle)]">
                      <p className="text-sm font-semibold text-[var(--color-secondary)] mb-3">
                        Legislación Aplicable
                      </p>
                      {loadingNormativa ? (
                        <div className="flex items-center gap-2 py-4">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-secondary)] border-t-transparent" />
                          <span className="text-sm text-[var(--color-text-muted)]">Cargando...</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
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
                                className="bg-[var(--color-input-bg)] border border-[var(--color-border-subtle)] rounded-[var(--border-radius)] overflow-hidden"
                              >
                                <button
                                  type="button"
                                  onClick={() => setOpenNormativa(isOpen ? "" : ambito)}
                                  className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-input-bg-hover)] transition-colors duration-[var(--duration-fast)]"
                                >
                                  <span>{labels[ambito]}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[var(--color-text-muted)] text-xs">
                                      {items.length} {items.length === 1 ? "norma" : "normas"}
                                    </span>
                                    <svg
                                      className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform duration-[var(--duration-normal)] ${isOpen ? "rotate-180" : ""}`}
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </div>
                                </button>
                                {isOpen && (
                                  <div className="px-3 pb-3 flex flex-col gap-2">
                                    {items.map((norm) => (
                                      <div
                                        key={norm.id}
                                        className="p-2.5 border-t border-[var(--color-border-subtle)]"
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
                                        <div className="flex items-center gap-3 mt-1.5">
                                          <span className={`inline-flex items-center text-xs px-1.5 py-0.5 rounded-full ${
                                            norm.estado_vigencia === "vigente"
                                              ? "bg-emerald-500/15 text-emerald-400"
                                              : norm.estado_vigencia === "derogada"
                                                ? "bg-red-500/15 text-red-400"
                                                : "bg-[var(--color-input-bg)] text-[var(--color-text-secondary)]"
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

                  {/* Capas Aplicables */}
                  {(loadingCapas || capas.length > 0) && (
                    <div className="pt-4 mt-4 border-t border-[var(--color-border-subtle)]">
                      <p className="text-sm font-semibold text-[var(--color-secondary)] mb-3">
                        Capas disponibles para informe
                      </p>
                      {loadingCapas ? (
                        <div className="flex items-center gap-2 py-4">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-secondary)] border-t-transparent" />
                          <span className="text-sm text-[var(--color-text-muted)]">Cargando...</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {Object.entries(groupedCapas).map(([categoria, capasGrupo]) => {
                            const isOpen = openCapaCategoria.includes(categoria)
                            return (
                              <div
                                key={categoria}
                                className="bg-[var(--color-input-bg)] border border-[var(--color-border-subtle)] rounded-[var(--border-radius)] overflow-hidden"
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleCapaCategoria(categoria)}
                                  className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-input-bg-hover)] transition-colors duration-[var(--duration-fast)]"
                                >
                                  <span>{categoria}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[var(--color-text-muted)] text-xs">
                                      {capasGrupo.length} {capasGrupo.length === 1 ? "capa" : "capas"}
                                    </span>
                                    <svg
                                      className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform duration-[var(--duration-normal)] ${isOpen ? "rotate-180" : ""}`}
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </div>
                                </button>
                                {isOpen && (
                                  <div className="px-3 pb-3 flex flex-col gap-1.5">
                                    {capasGrupo.map((capa) => (
                                      <div
                                        key={capa.id}
                                        className="flex items-center justify-between p-2.5 border-t border-[var(--color-border-subtle)]"
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
                                          href={`/mapa?layers=${capa.id}&center=${selectedMunicipio?.lng || 0},${selectedMunicipio?.lat || 0}&zoom=12`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="shrink-0 ml-3 inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 bg-[var(--color-primary)] text-white rounded-[var(--border-radius)] hover:bg-[var(--color-primary-light)] transition-colors duration-[var(--duration-fast)] active:scale-[0.97]"
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
                    <p className="text-sm text-[var(--color-text-muted)] italic mt-2">
                      Cargando datos del municipio...
                    </p>
                  )}
                </Card>
              )}

              {/* Comparison Table */}
              {comparando && (
                <div ref={comparisonRef} className="mt-6 animate-fade-in">
                  <Card>
                    <CardHeader>
                      <CardTitle>Comparativa de municipios</CardTitle>
                    </CardHeader>

                    {loadingComparacion ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-secondary)] border-t-transparent" />
                        <span className="ml-3 text-sm text-[var(--color-text-muted)]">
                          Cargando datos...
                        </span>
                      </div>
                    ) : errorComparacion ? (
                      <div className="py-8 text-center">
                        <p className="text-sm text-red-400 mb-3">{errorComparacion}</p>
                        <button
                          onClick={() => {
                            setComparando(false)
                            setMunicipiosComparados([])
                            setErrorComparacion(null)
                          }}
                          className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-[var(--border-radius)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-input-bg)]"
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
                        <div className="mb-4 rounded-[var(--border-radius-lg)] overflow-hidden">
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
                        <div className="overflow-x-auto -mx-5 sm:-mx-6 px-5 sm:px-6">
                          <table className="w-full text-sm min-w-[600px]">
                            <thead>
                              <tr className="border-b border-[var(--color-border-subtle)]">
                                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Municipio</th>
                                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Provincia</th>
                                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">CCAA</th>
                                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Tipo</th>
                                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Estado</th>
                                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Fecha</th>
                                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Enlace</th>
                              </tr>
                            </thead>
                            <tbody>
                              {municipiosComparados.map((m) => (
                                <tr
                                  key={m.id}
                                  className="border-b border-[var(--color-border-subtle)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-input-bg)]"
                                >
                                  <td className="px-3 py-2.5 font-medium text-[var(--color-text-primary)]">{m.nombre}</td>
                                  <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">{m.provincia}</td>
                                  <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">{m.ccaa}</td>
                                  <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">{m.tipo_planeamiento}</td>
                                  <td className="px-3 py-2.5">
                                    {m.estado ? (
                                      <Badge variant={estadoBadgeVariant[m.estado] ?? "primary"}>
                                        {m.estado}
                                      </Badge>
                                    ) : (
                                      <span className="text-[var(--color-text-muted)]">—</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">
                                    {m.fecha_aprobacion
                                      ? new Date(m.fecha_aprobacion).toLocaleDateString("es-ES")
                                      : "—"}
                                  </td>
                                  <td className="px-3 py-2.5">
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

                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={() => {
                          setComparando(false)
                          setMunicipiosComparados([])
                          setErrorComparacion(null)
                        }}
                        className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-[var(--border-radius)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-input-bg)]"
                      >
                        Cerrar comparativa
                      </button>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
