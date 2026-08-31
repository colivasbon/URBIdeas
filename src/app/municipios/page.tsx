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
  const base = "inline-block px-2 py-0.5 rounded-full text-xs font-medium transition-colors duration-200"
  switch (estado.toLowerCase()) {
    case "aprobado":
    case "vigente":
      return `${base} bg-green-900/50 text-green-300 border border-green-700/50`
    case "en tramite":
    case "en trámite":
    case "pendiente":
      return `${base} bg-yellow-900/50 text-yellow-300 border border-yellow-700/50`
    case "borrador":
    case "avance":
      return `${base} bg-blue-900/50 text-blue-300 border border-blue-700/50`
    case "derogado":
    case "caducado":
      return `${base} bg-red-900/50 text-red-300 border border-red-700/50`
    default:
      return `${base} bg-gray-900/50 text-gray-300 border border-gray-700/50`
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
    <div className="flex min-h-screen flex-col transition-colors duration-200">
      <Header />

      <main className="flex-1">
        <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 lg:px-8">
          <section className="mb-8">
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl">
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
                <FiltroCascada onMunicipioSeleccionado={handleMunicipioSeleccionado} />
              </Card>

              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>Selección múltiple</CardTitle>
                </CardHeader>
                <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
                  Busca y selecciona hasta 10 municipios para comparar.
                </p>
                <SelectorMultiMunicipio onCompare={handleCompare} />
              </Card>
            </div>

            {/* Right content area */}
            <div className="flex-1 min-w-0">
              {/* Municipio Info Card */}
              {selectedMunicipio && (
                <Card>
                  <CardHeader>
                    <CardTitle>{selectedMunicipio.nombre}</CardTitle>
                  </CardHeader>
                  <div className="flex flex-col gap-1 text-sm text-[var(--color-text-secondary)] mb-4">
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

                  <MunicipioMapa
                    lat={selectedMunicipio.lat ?? null}
                    lng={selectedMunicipio.lng ?? null}
                    nombre={selectedMunicipio.nombre}
                  />

                  {/* Instrumentos de Planeamiento */}
                  {(loadingPlaneamiento || instrumentos.length > 0) && (
                    <div className="pt-3 border-t border-[var(--color-border)]">
                      <p className="text-sm font-medium text-[var(--color-secondary)] mb-2">
                        Instrumentos de Planeamiento
                      </p>
                      {loadingPlaneamiento ? (
                        <p className="text-sm text-[var(--color-text-secondary)]">Cargando...</p>
                      ) : instrumentos.length === 0 ? (
                        <p className="text-sm text-[var(--color-text-secondary)] italic">
                          Sin datos de planeamiento verificados para este municipio
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {instrumentos.map((inst) => (
                            <div
                              key={inst.id}
                              className="p-3 bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)]"
                            >
                              <div className="flex items-center justify-between mb-1">
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
                                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                                  Fuente: {inst.fuente}
                                </p>
                              )}
                              <div className="flex gap-3 mt-2">
                                {inst.enlace_documento_oficial && (
                                  <a
                                    href={inst.enlace_documento_oficial}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-[var(--color-secondary)] underline hover:text-[var(--color-accent)] transition-colors duration-200"
                                  >
                                    Documento oficial
                                  </a>
                                )}
                                {inst.enlace_geoportal && (
                                  <a
                                    href={inst.enlace_geoportal}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-[var(--color-secondary)] underline hover:text-[var(--color-accent)] transition-colors duration-200"
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

                  {/* Legislación Aplicable Accordion */}
                  {(loadingNormativa || normativa.length > 0) && (
                    <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                      <p className="text-sm font-medium text-[var(--color-secondary)] mb-2">
                        Legislación Aplicable
                      </p>
                      {loadingNormativa ? (
                        <p className="text-sm text-[var(--color-text-secondary)]">Cargando...</p>
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
                                className="bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)]"
                              >
                                <button
                                  type="button"
                                  onClick={() => setOpenNormativa(isOpen ? "" : ambito)}
                                  className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-border)] rounded-[var(--border-radius)] transition-colors duration-200"
                                >
                                  <span>{labels[ambito]}</span>
                                  <span className="text-[var(--color-text-secondary)] text-xs">
                                    {items.length} {items.length === 1 ? "norma" : "normas"}
                                  </span>
                                  <svg
                                    className={`w-4 h-4 text-[var(--color-text-secondary)] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                                {isOpen && (
                                  <div className="px-3 pb-3 flex flex-col gap-2">
                                    {items.map((norm) => (
                                      <div
                                        key={norm.id}
                                        className="p-2 border-t border-[var(--color-border)]"
                                      >
                                        <p className="text-sm font-medium text-[var(--color-text-primary)]">
                                          {norm.titulo}
                                        </p>
                                        {norm.referencia_legal && (
                                          <p className="text-xs text-[var(--color-text-secondary)]">
                                            Ref: {norm.referencia_legal}
                                          </p>
                                        )}
                                        {norm.fecha_publicacion && (
                                          <p className="text-xs text-[var(--color-text-secondary)]">
                                            Publicación: {norm.fecha_publicacion}
                                          </p>
                                        )}
                                        <div className="flex items-center gap-3 mt-1">
                                          <span className={`text-xs px-1.5 py-0.5 rounded transition-colors duration-200 ${
                                            norm.estado_vigencia === "vigente"
                                              ? "bg-green-900/50 text-green-300"
                                              : norm.estado_vigencia === "derogada"
                                                ? "bg-red-900/50 text-red-300"
                                                : "bg-gray-900/50 text-gray-300"
                                          }`}>
                                            {norm.estado_vigencia}
                                          </span>
                                          {norm.enlace_boe_boletin && (
                                            <a
                                              href={norm.enlace_boe_boletin}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-xs text-[var(--color-secondary)] underline hover:text-[var(--color-accent)] transition-colors duration-200"
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
                    <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                      <p className="text-sm font-medium text-[var(--color-secondary)] mb-2">
                        Capas disponibles para informe
                      </p>
                      {loadingCapas ? (
                        <p className="text-sm text-[var(--color-text-secondary)]">Cargando...</p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {Object.entries(groupedCapas).map(([categoria, capasGrupo]) => {
                            const isOpen = openCapaCategoria.includes(categoria)
                            return (
                              <div
                                key={categoria}
                                className="bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)]"
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleCapaCategoria(categoria)}
                                  className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-border)] rounded-[var(--border-radius)] transition-colors duration-200"
                                >
                                  <span>{categoria}</span>
                                  <span className="text-[var(--color-text-secondary)] text-xs">
                                    {capasGrupo.length} {capasGrupo.length === 1 ? "capa" : "capas"}
                                  </span>
                                  <svg
                                    className={`w-4 h-4 text-[var(--color-text-secondary)] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                                {isOpen && (
                                  <div className="px-3 pb-3 flex flex-col gap-2">
                                    {capasGrupo.map((capa) => (
                                      <div
                                        key={capa.id}
                                        className="flex items-center justify-between p-2 border-t border-[var(--color-border)]"
                                      >
                                        <div className="flex flex-col">
                                          <span className="text-sm text-[var(--color-text-primary)]">
                                            {capa.nombre_capa}
                                          </span>
                                          <span className="text-xs text-[var(--color-text-secondary)]">
                                            {capa.tipo_servicio}
                                          </span>
                                        </div>
                                        <a
                                          href={`/mapa?layers=${capa.id}&center=${selectedMunicipio?.lng || 0},${selectedMunicipio?.lat || 0}&zoom=12`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs px-2 py-1 bg-[var(--color-secondary)] text-[#1A1A1A] rounded-[var(--border-radius)] hover:opacity-80 transition-colors duration-200"
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

                  {/* Empty state when nothing loaded */}
                  {!loadingPlaneamiento && !loadingNormativa && !loadingCapas &&
                    instrumentos.length === 0 && normativa.length === 0 && capas.length === 0 && (
                    <p className="text-sm text-[var(--color-text-secondary)] italic mt-2">
                      Cargando datos del municipio...
                    </p>
                  )}
                </Card>
              )}

              {/* Comparison Table */}
              {comparando && (
                <div ref={comparisonRef} className="mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Comparativa de municipios</CardTitle>
                    </CardHeader>

                    {loadingComparacion ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-secondary)] border-t-transparent" />
                        <span className="ml-3 text-sm text-[var(--color-text-secondary)]">
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
                          className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-[var(--border-radius)] transition-colors duration-200 hover:bg-[var(--color-input-bg)]"
                        >
                          Cerrar
                        </button>
                      </div>
                    ) : municipiosComparados.length === 0 ? (
                      <p className="py-8 text-center text-sm text-[var(--color-text-secondary)]">
                        No se encontraron datos para los municipios seleccionados.
                      </p>
                    ) : (
                      <>
                        <div className="mb-4">
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
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-[var(--color-border)]">
                              <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">Municipio</th>
                              <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">Provincia</th>
                              <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">CCAA</th>
                              <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">Tipo Planeamiento</th>
                              <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">Estado</th>
                              <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">Fecha Aprobación</th>
                              <th className="px-4 py-3 text-left font-semibold text-[var(--color-text-primary)]">Enlace</th>
                            </tr>
                          </thead>
                          <tbody>
                            {municipiosComparados.map((m) => (
                              <tr
                                key={m.id}
                                className="border-b border-[var(--color-border)] transition-colors duration-200 hover:bg-[var(--color-input-bg)]"
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
                                    <span className="text-[var(--color-text-secondary)]">—</span>
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
                                      className="text-[var(--color-secondary)] hover:text-[var(--color-accent)] transition-colors duration-200 underline underline-offset-2"
                                    >
                                      Ver documento
                                    </a>
                                  ) : (
                                    <span className="text-[var(--color-text-secondary)]">—</span>
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
                        className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-[var(--border-radius)] transition-colors duration-200 hover:bg-[var(--color-input-bg)]"
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
