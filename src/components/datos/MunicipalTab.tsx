"use client"

import { useState, useEffect } from "react"
import { Card, CardHeader, CardTitle } from "@/components/ui/Card"
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
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, activeView, pagination.offset])

  return (
    <div className="space-y-6">
      {/* Controles */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveView("siu")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeView === "siu"
                ? "bg-[var(--color-primary)] text-white"
                : "bg-[var(--color-input-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-input-bg-hover)]"
            }`}
          >
            SIU Estatal
          </button>
          <button
            onClick={() => setActiveView("directorio")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeView === "directorio"
                ? "bg-[var(--color-primary)] text-white"
                : "bg-[var(--color-input-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-input-bg-hover)]"
            }`}
          >
            Directorio Ayuntamientos
          </button>
        </div>
        
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="Buscar municipio..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 pl-10 text-sm bg-[var(--color-input-bg)] border border-[var(--color-border-subtle)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
          />
          <svg
            className="absolute left-3 top-2.5 h-4 w-4 text-[var(--color-text-muted)]"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-secondary)] border-t-transparent" />
          <span className="ml-3 text-sm text-[var(--color-text-muted)]">
            Cargando datos...
          </span>
        </div>
      ) : activeView === "siu" ? (
        // Vista SIU
        <div>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">
                Datos del Sistema de Información Urbana (SIU)
              </CardTitle>
            </CardHeader>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Información oficial de planeamiento urbanístico de {siuData.length} municipios.
              Fuente: Ministerio de Vivienda y Agenda Urbana.
            </p>
          </Card>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {siuData.map((municipio) => (
              <Card key={municipio.codigo_ine} className="flex flex-col" hover>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-[var(--color-text-primary)]">
                      {municipio.nombre}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                      INE: {municipio.codigo_ine}
                    </p>
                  </div>
                  <Badge variant={figuraColors[municipio.figura_vigente] || "primary"}>
                    {municipio.figura_vigente}
                  </Badge>
                </div>
                
                {municipio.fecha_figura && (
                  <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                    Aprobación: {municipio.fecha_figura}
                  </p>
                )}
                
                {municipio.observaciones && (
                  <p className="mt-1 text-xs text-[var(--color-text-muted)] line-clamp-2">
                    {municipio.observaciones}
                  </p>
                )}
                
                <div className="mt-auto pt-3 border-t border-[var(--color-border-subtle)]">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/municipios/${municipio.codigo_ine}/legislacion`}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-light)] transition-colors"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                      Ver detalles
                    </Link>
                    {municipio.url_link && (
                      <a
                        href={municipio.url_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)] transition-colors"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                        {municipio.texto_link || "Ver planeamiento"}
                      </a>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        // Vista Directorio
        <div>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">
                Directorio de Ayuntamientos
              </CardTitle>
            </CardHeader>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Enlaces directos a las webs oficiales de los ayuntamientos con información urbanística.
            </p>
          </Card>

          {directorioData.length === 0 ? (
            <Card>
              <p className="py-12 text-center text-sm text-[var(--color-text-muted)]">
                No se encontraron ayuntamientos en el directorio.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {directorioData.map((ayuntamiento) => (
                <Card key={ayuntamiento.id} className="flex flex-col" hover>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-[var(--color-text-primary)]">
                        {ayuntamiento.nombre_ayuntamiento}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                        INE: {ayuntamiento.codigo_ine}
                      </p>
                    </div>
                    {ayuntamiento.tiene_datos_abiertos && (
                      <Badge variant="success">Datos Abiertos</Badge>
                    )}
                  </div>
                  
                  <div className="mt-3 space-y-2">
                    {ayuntamiento.url_web_oficial && (
                      <a
                        href={ayuntamiento.url_web_oficial}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)]"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                        </svg>
                        Web oficial
                      </a>
                    )}
                    {ayuntamiento.url_legislacion_urbanistica && (
                      <a
                        href={ayuntamiento.url_legislacion_urbanistica}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)]"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                        </svg>
                        Legislación urbanística
                      </a>
                    )}
                    {ayuntamiento.url_plan_ordenacion && (
                      <a
                        href={ayuntamiento.url_plan_ordenacion}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)]"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                        </svg>
                        Plan de ordenación
                      </a>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Paginación */}
          {pagination.total > pagination.limit && (
            <div className="flex justify-center gap-2 mt-6">
              <button
                onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
                disabled={pagination.offset === 0}
                className="px-4 py-2 text-sm font-medium bg-[var(--color-input-bg)] border border-[var(--color-border-subtle)] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--color-input-bg-hover)]"
              >
                Anterior
              </button>
              <span className="px-4 py-2 text-sm text-[var(--color-text-muted)]">
                {Math.floor(pagination.offset / pagination.limit) + 1} de {Math.ceil(pagination.total / pagination.limit)}
              </span>
              <button
                onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
                disabled={pagination.offset + pagination.limit >= pagination.total}
                className="px-4 py-2 text-sm font-medium bg-[var(--color-input-bg)] border border-[var(--color-border-subtle)] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--color-input-bg-hover)]"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
