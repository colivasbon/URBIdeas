"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/Badge"
import Link from "next/link"

interface SIUMunicipio {
  codigo_ine: string
  nombre: string
  figura_vigente: string
  fecha_figura: number | null
  observaciones: string
  texto_link: string
  url_link: string
}

interface DirectorioAyuntamiento {
  id: string
  codigo_ine: string
  nombre_ayuntamiento: string
  url_web_oficial: string | null
  url_legislacion_urbanistica: string | null
  url_plan_ordenacion: string | null
  tiene_datos_abiertos: boolean
}

const figuraColors: Record<string, "success" | "primary" | "accent" | "danger"> = {
  "Plan General": "success",
  "Normas Subsidiarias": "primary",
  "PGOU": "success",
  "OTP": "accent",
  "Planes Parciales": "danger",
  "Planes de sector": "primary",
}

export default function MunicipalTab() {
  const [searchTerm, setSearchTerm] = useState("")
  const [siuData, setSIUData] = useState<SIUMunicipio[]>([])
  const [directorioData, setDirectorioData] = useState<DirectorioAyuntamiento[]>([])
  const [loading, setLoading] = useState(false)
  const [activeView, setActiveView] = useState<"siu" | "directorio">("siu")
  const [pagination, setPagination] = useState({ offset: 0, limit: 20, total: 0 })

  async function fetchData() {
    setLoading(true)
    try {
      if (activeView === "siu") {
        const params = new URLSearchParams({
          ...(searchTerm && { nombre: searchTerm }),
          ambito: 'provincia'
        })
        const response = await fetch(`/api/siu?${params.toString()}`)
        const json = await response.json()
        if (json.data) {
          // Aplanar datos agrupados por provincia
          const allData: SIUMunicipio[] = []
          Object.values(json.data).forEach((provincia: unknown) => {
            if (Array.isArray(provincia)) {
              allData.push(...(provincia as SIUMunicipio[]))
            }
          })
          setSIUData(allData.slice(0, pagination.limit))
        }
      } else {
        const params = new URLSearchParams({
          limit: String(pagination.limit),
          offset: String(pagination.offset),
          ...(searchTerm && { nombre: searchTerm })
        })
        const response = await fetch(`/api/directorio-ayuntamientos?${params.toString()}`)
        const json = await response.json()
        if (json.data) {
          setDirectorioData(json.data)
          setPagination(prev => ({ ...prev, total: json.count || 0 }))
        }
      }
    } catch {
      console.error("Error fetching data")
    }
    setLoading(false)
  }

  useEffect(() => {
    // Carga inicial y recarga al cambiar búsqueda, vista o página.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, activeView, pagination.offset])

  const vistas = [
    { key: "siu" as const, label: "Planeamiento (SIU)" },
    { key: "directorio" as const, label: "Directorio de ayuntamientos" },
  ]

  return (
    <div className="flex flex-col gap-8">
      {/* Controles */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {vistas.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setActiveView(v.key)}
              aria-pressed={activeView === v.key}
              className={`btn btn-sm ${activeView === v.key ? "btn-secondary" : "btn-ghost text-[var(--text-secondary)]"}`}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-80">
          <label htmlFor="municipal-busqueda" className="field-label">
            Buscar municipio
          </label>
          <input
            id="municipal-busqueda"
            type="text"
            placeholder="Nombre del municipio"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input"
          />
        </div>
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="flex items-center gap-3 py-8" role="status" aria-live="polite">
          <span className="spinner text-[var(--moss-ink)]" aria-hidden="true" />
          <span className="text-sm text-[var(--text-muted)]">Cargando datos…</span>
        </div>
      ) : activeView === "siu" ? (
        <section aria-labelledby="municipal-siu">
          <h2 id="municipal-siu" className="type-h3 text-[var(--text-primary)]">
            Sistema de Información Urbana
          </h2>
          <p className="type-body-sm mt-2 max-w-[65ch] text-[var(--text-secondary)]">
            Planeamiento urbanístico comunicado al Ministerio de Vivienda y Agenda Urbana.{" "}
            <span className="tnum">
              {siuData.length} {siuData.length === 1 ? "municipio" : "municipios"} en esta vista.
            </span>
          </p>

          {siuData.length === 0 ? (
            <p className="mt-6 border-t border-[var(--border-subtle)] py-6 text-sm text-[var(--text-secondary)]">
              {searchTerm
                ? "Ningún municipio coincide con la búsqueda. Pruebe con otro nombre."
                : "No hay datos del SIU disponibles en este momento."}
            </p>
          ) : (
            <ul className="mt-6 border-t border-[var(--border-strong)]">
              {siuData.map((municipio) => (
                <li
                  key={municipio.codigo_ine}
                  className="grid gap-3 border-b border-[var(--border-subtle)] py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-8"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <Link
                        href={`/urbideas/municipios/${municipio.codigo_ine}/legislacion`}
                        className="link font-medium"
                      >
                        {municipio.nombre}
                      </Link>
                      <Badge variant={figuraColors[municipio.figura_vigente] || "primary"}>
                        {municipio.figura_vigente}
                      </Badge>
                    </div>
                    <p className="tnum mt-1 text-xs text-[var(--text-muted)]">
                      INE {municipio.codigo_ine}
                      {municipio.fecha_figura ? `, aprobación ${municipio.fecha_figura}` : ""}
                    </p>
                    {municipio.observaciones && (
                      <p className="mt-1.5 line-clamp-2 max-w-[70ch] text-xs text-[var(--text-secondary)]">
                        {municipio.observaciones}
                      </p>
                    )}
                  </div>
                  {municipio.url_link && (
                    <a
                      href={municipio.url_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link link-external self-start text-sm"
                    >
                      {municipio.texto_link || "Ver planeamiento"}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section aria-labelledby="municipal-directorio">
          <h2 id="municipal-directorio" className="type-h3 text-[var(--text-primary)]">
            Directorio de ayuntamientos
          </h2>
          <p className="type-body-sm mt-2 max-w-[65ch] text-[var(--text-secondary)]">
            Enlaces a las webs oficiales de los ayuntamientos con información urbanística.
          </p>

          {directorioData.length === 0 ? (
            <p className="mt-6 border-t border-[var(--border-subtle)] py-6 text-sm text-[var(--text-secondary)]">
              {searchTerm
                ? "Ningún ayuntamiento del directorio coincide con la búsqueda. Pruebe con otro nombre."
                : "El directorio de ayuntamientos todavía no tiene entradas."}
            </p>
          ) : (
            <ul className="mt-6 border-t border-[var(--border-strong)]">
              {directorioData.map((ayuntamiento) => (
                <li
                  key={ayuntamiento.id}
                  className="grid gap-3 border-b border-[var(--border-subtle)] py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-8"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="font-medium text-[var(--text-primary)]">
                        {ayuntamiento.nombre_ayuntamiento}
                      </span>
                      {ayuntamiento.tiene_datos_abiertos && <Badge variant="success">Datos abiertos</Badge>}
                    </div>
                    <p className="tnum mt-1 text-xs text-[var(--text-muted)]">INE {ayuntamiento.codigo_ine}</p>
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-2 self-start text-sm">
                    {ayuntamiento.url_web_oficial && (
                      <a
                        href={ayuntamiento.url_web_oficial}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link link-external"
                      >
                        Web oficial
                      </a>
                    )}
                    {ayuntamiento.url_legislacion_urbanistica && (
                      <a
                        href={ayuntamiento.url_legislacion_urbanistica}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link link-external"
                      >
                        Legislación urbanística
                      </a>
                    )}
                    {ayuntamiento.url_plan_ordenacion && (
                      <a
                        href={ayuntamiento.url_plan_ordenacion}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link link-external"
                      >
                        Plan de ordenación
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Paginación */}
          {pagination.total > pagination.limit && (
            <nav aria-label="Paginación del directorio" className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
                disabled={pagination.offset === 0}
                className="btn btn-secondary btn-sm"
              >
                Anterior
              </button>
              <span className="tnum text-sm text-[var(--text-secondary)]">
                Página {Math.floor(pagination.offset / pagination.limit) + 1} de {Math.ceil(pagination.total / pagination.limit)}
              </span>
              <button
                type="button"
                onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
                disabled={pagination.offset + pagination.limit >= pagination.total}
                className="btn btn-secondary btn-sm"
              >
                Siguiente
              </button>
            </nav>
          )}
        </section>
      )}
    </div>
  )
}
