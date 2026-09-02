"use client"

import { useState, useEffect, use } from "react"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { Badge } from "@/components/ui/Badge"
import Link from "next/link"

interface SIUMunicipio {
  codigo_ine: string
  nombre: string
  figura_vigente: string
  fecha_figura: number | null
  observaciones: string
  comentario_visor: string
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
  url_boletin_municipal: string | null
  tiene_datos_abiertos: boolean
}

interface NormativaMunicipal {
  id: string
  titulo: string
  referencia_legal: string
  fecha_publicacion: string | null
  enlace_boe_boletin: string | null
  estado_vigencia: string
}

const figuraColors: Record<string, "success" | "primary" | "accent" | "danger"> = {
  "Plan General": "success",
  "Normas Subsidiarias": "primary",
  "PGOU": "success",
  "OTP": "accent",
  "Planes Parciales": "danger",
  "Planes de sector": "primary",
}

export default function LegislacionMunicipioPage({ 
  params 
}: { 
  params: Promise<{ codigoINE: string }> 
}) {
  const resolvedParams = use(params)
  const [siuData, setSIUData] = useState<SIUMunicipio | null>(null)
  const [directorioData, setDirectorioData] = useState<DirectorioAyuntamiento | null>(null)
  const [normativaData, setNormativaData] = useState<NormativaMunicipal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError(null)
      
      try {
        const siuResponse = await fetch(`/api/siu?codigo_ine=${resolvedParams.codigoINE}`)
        const siuResult = await siuResponse.json()
        
        if (siuResult.data && siuResult.data.length > 0) {
          setSIUData(siuResult.data[0])
        }

        const dirResponse = await fetch(`/api/directorio-ayuntamientos?codigo_ine=${resolvedParams.codigoINE}`)
        const dirResult = await dirResponse.json()
        
        if (dirResult.data && dirResult.data.length > 0) {
          setDirectorioData(dirResult.data[0])
        }

        const normResponse = await fetch(`/api/legislacion?ambito=municipal&codigo_ine=${resolvedParams.codigoINE}`)
        const normResult = await normResponse.json()
        
        if (normResult.data) {
          setNormativaData(normResult.data)
        }

      } catch {
        setError("Error al cargar los datos del municipio")
      }
      
      setLoading(false)
    }

    fetchData()
  }, [resolvedParams.codigoINE])

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="h-6 w-6 mx-auto animate-spin rounded-full border-2 border-[var(--color-secondary)] border-t-transparent" />
            <p className="mt-3 text-xs text-[var(--color-text-muted)]">
              Cargando información del municipio...
            </p>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="border border-[var(--color-border-subtle)] rounded-[var(--border-radius-lg)] p-6 max-w-md text-center">
            <p className="text-sm text-[var(--color-text-secondary)]">{error}</p>
            <div className="mt-4">
              <Link
                href="/legislacion"
                className="text-xs font-medium text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)]"
              >
                Volver a Legislación
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {/* Breadcrumb */}
          <nav className="mb-4 text-[11px] text-[var(--color-text-muted)]">
            <Link href="/legislacion" className="hover:text-[var(--color-secondary)] transition-colors">
              Legislación
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-[var(--color-text-secondary)]">
              {siuData?.nombre || directorioData?.nombre_ayuntamiento || resolvedParams.codigoINE}
            </span>
          </nav>

          {/* Title */}
          <section className="mb-6 border-b border-[var(--color-border-subtle)] pb-6">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl" style={{ fontFamily: "var(--font-serif)" }}>
              {siuData?.nombre || directorioData?.nombre_ayuntamiento || "Municipio"}
            </h1>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Código INE: {resolvedParams.codigoINE}
            </p>
          </section>

          {/* SIU Data */}
          {siuData && (
            <div className="border border-[var(--color-border-subtle)] rounded-[var(--border-radius-lg)] mb-5">
              <div className="px-5 py-4 border-b border-[var(--color-border-subtle)]">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Planeamiento Urbanístico (SIU)</h3>
              </div>
              <div className="px-5 py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                      Figura vigente
                    </p>
                    <Badge variant={figuraColors[siuData.figura_vigente] || "primary"}>
                      {siuData.figura_vigente}
                    </Badge>
                  </div>
                  
                  {siuData.fecha_figura && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                        Fecha de aprobación
                      </p>
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        {siuData.fecha_figura}
                      </p>
                    </div>
                  )}
                </div>

                {siuData.observaciones && (
                  <div className="mt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                      Observaciones
                    </p>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      {siuData.observaciones}
                    </p>
                  </div>
                )}

                {siuData.url_link && (
                  <div className="mt-4 pt-3 border-t border-[var(--color-border-subtle)]">
                    <a
                      href={siuData.url_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)] transition-colors"
                    >
                      {siuData.texto_link || "Visor de planeamiento"}
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Directorio del Ayuntamiento */}
          {directorioData && (
            <div className="border border-[var(--color-border-subtle)] rounded-[var(--border-radius-lg)] mb-5">
              <div className="px-5 py-4 border-b border-[var(--color-border-subtle)]">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Enlaces del Ayuntamiento</h3>
              </div>
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {directorioData.url_web_oficial && (
                  <a
                    href={directorioData.url_web_oficial}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--color-card-bg)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">Web oficial</p>
                      <p className="text-[11px] text-[var(--color-text-muted)] truncate max-w-xs">
                        {directorioData.url_web_oficial}
                      </p>
                    </div>
                  </a>
                )}

                {directorioData.url_legislacion_urbanistica && (
                  <a
                    href={directorioData.url_legislacion_urbanistica}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--color-card-bg)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">Legislación urbanística</p>
                      <p className="text-[11px] text-[var(--color-text-muted)]">
                        Normativa y ordenanzas municipales
                      </p>
                    </div>
                  </a>
                )}

                {directorioData.url_plan_ordenacion && (
                  <a
                    href={directorioData.url_plan_ordenacion}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--color-card-bg)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">Plan de ordenación</p>
                      <p className="text-[11px] text-[var(--color-text-muted)]">
                        PGOU, normas subsidiarias y planeamiento
                      </p>
                    </div>
                  </a>
                )}

                {directorioData.url_boletin_municipal && (
                  <a
                    href={directorioData.url_boletin_municipal}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--color-card-bg)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">Boletín municipal</p>
                      <p className="text-[11px] text-[var(--color-text-muted)]">
                        Publicaciones oficiales del ayuntamiento
                      </p>
                    </div>
                  </a>
                )}
              </div>

              {directorioData.tiene_datos_abiertos && (
                <div className="px-5 py-3 border-t border-[var(--color-border-subtle)]">
                  <Badge variant="success">Datos abiertos disponibles</Badge>
                </div>
              )}
            </div>
          )}

          {/* Normativa específica del municipio */}
          {normativaData.length > 0 && (
            <div className="border border-[var(--color-border-subtle)] rounded-[var(--border-radius-lg)] mb-5">
              <div className="px-5 py-4 border-b border-[var(--color-border-subtle)]">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Normativa Municipal</h3>
              </div>
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {normativaData.map((norma) => (
                  <div 
                    key={norma.id}
                    className="flex items-start justify-between gap-4 px-5 py-3 transition-colors hover:bg-[var(--color-card-bg)]"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                        {norma.titulo}
                      </p>
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                        {norma.referencia_legal}
                      </p>
                      {norma.fecha_publicacion && (
                        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                          Publicación: {new Date(norma.fecha_publicacion).toLocaleDateString("es-ES")}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={norma.estado_vigencia === "vigente" ? "success" : "primary"}>
                        {norma.estado_vigencia}
                      </Badge>
                      {norma.enlace_boe_boletin && (
                        <a
                          href={norma.enlace_boe_boletin}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)] transition-colors"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!siuData && !directorioData && normativaData.length === 0 && (
            <div className="border border-[var(--color-border-subtle)] rounded-[var(--border-radius-lg)] py-12 text-center px-5">
              <p className="text-sm text-[var(--color-text-muted)]">
                No se encontró información para este municipio.
              </p>
              <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                Código INE: {resolvedParams.codigoINE}
              </p>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
