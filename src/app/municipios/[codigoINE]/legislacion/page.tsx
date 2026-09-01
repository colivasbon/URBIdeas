"use client"

import { useState, useEffect, use } from "react"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { Card, CardHeader, CardTitle } from "@/components/ui/Card"
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
        // Fetch SIU data
        const siuResponse = await fetch(`/api/siu?codigo_ine=${resolvedParams.codigoINE}`)
        const siuResult = await siuResponse.json()
        
        if (siuResult.data && siuResult.data.length > 0) {
          setSIUData(siuResult.data[0])
        }

        // Fetch directorio data
        const dirResponse = await fetch(`/api/directorio-ayuntamientos?codigo_ine=${resolvedParams.codigoINE}`)
        const dirResult = await dirResponse.json()
        
        if (dirResult.data && dirResult.data.length > 0) {
          setDirectorioData(dirResult.data[0])
        }

        // Fetch normativa municipal
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
            <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-[var(--color-secondary)] border-t-transparent" />
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">
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
          <Card className="max-w-md">
            <p className="text-center text-[var(--color-text-secondary)]">{error}</p>
            <div className="mt-4 text-center">
              <Link
                href="/legislacion"
                className="text-sm font-medium text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)]"
              >
                Volver a Legislación
              </Link>
            </div>
          </Card>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          {/* Breadcrumb */}
          <nav className="mb-6 text-sm text-[var(--color-text-muted)]">
            <Link href="/legislacion" className="hover:text-[var(--color-secondary)]">
              Legislación
            </Link>
            <span className="mx-2">/</span>
            <span className="text-[var(--color-text-primary)]">
              {siuData?.nombre || directorioData?.nombre_ayuntamiento || resolvedParams.codigoINE}
            </span>
          </nav>

          {/* Título */}
          <section className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
              {siuData?.nombre || directorioData?.nombre_ayuntamiento || "Municipio"}
            </h1>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Código INE: {resolvedParams.codigoINE}
            </p>
          </section>

          {/* Datos SIU */}
          {siuData && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">Planeamiento Urbanístico (SIU)</CardTitle>
              </CardHeader>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">
                    Figura vigente
                  </p>
                  <Badge variant={figuraColors[siuData.figura_vigente] || "primary"} className="mt-1">
                    {siuData.figura_vigente}
                  </Badge>
                </div>
                
                {siuData.fecha_figura && (
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      Fecha de aprobación
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                      {siuData.fecha_figura}
                    </p>
                  </div>
                )}
              </div>

              {siuData.observaciones && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">
                    Observaciones
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                    {siuData.observaciones}
                  </p>
                </div>
              )}

              {siuData.url_link && (
                <div className="mt-4 pt-4 border-t border-[var(--color-border-subtle)]">
                  <a
                    href={siuData.url_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)]"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                    {siuData.texto_link || "Visor de planeamiento"}
                  </a>
                </div>
              )}
            </Card>
          )}

          {/* Directorio del Ayuntamiento */}
          {directorioData && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">Enlaces del Ayuntamiento</CardTitle>
              </CardHeader>
              
              <div className="space-y-3">
                {directorioData.url_web_oficial && (
                  <a
                    href={directorioData.url_web_oficial}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-input-bg)] hover:bg-[var(--color-input-bg-hover)] transition-colors"
                  >
                    <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center">
                      <svg className="h-5 w-5 text-[var(--color-secondary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-[var(--color-text-primary)]">Web oficial</p>
                      <p className="text-xs text-[var(--color-text-muted)] truncate max-w-xs">
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
                    className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-input-bg)] hover:bg-[var(--color-input-bg-hover)] transition-colors"
                  >
                    <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-[var(--color-secondary)]/15 flex items-center justify-center">
                      <svg className="h-5 w-5 text-[var(--color-secondary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-[var(--color-text-primary)]">Legislación urbanística</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
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
                    className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-input-bg)] hover:bg-[var(--color-input-bg-hover)] transition-colors"
                  >
                    <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-[var(--color-accent)]/15 flex items-center justify-center">
                      <svg className="h-5 w-5 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-[var(--color-text-primary)]">Plan de ordenación</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
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
                    className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-input-bg)] hover:bg-[var(--color-input-bg-hover)] transition-colors"
                  >
                    <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center">
                      <svg className="h-5 w-5 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-[var(--color-text-primary)]">Boletín municipal</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        Publicaciones oficiales del ayuntamiento
                      </p>
                    </div>
                  </a>
                )}
              </div>

              {directorioData.tiene_datos_abiertos && (
                <div className="mt-4 pt-4 border-t border-[var(--color-border-subtle)]">
                  <Badge variant="success">Datos abiertos disponibles</Badge>
                </div>
              )}
            </Card>
          )}

          {/* Normativa específica del municipio */}
          {normativaData.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">Normativa Municipal</CardTitle>
              </CardHeader>
              
              <div className="space-y-3">
                {normativaData.map((norma) => (
                  <div 
                    key={norma.id}
                    className="flex items-start justify-between gap-4 p-3 rounded-lg bg-[var(--color-input-bg)]"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[var(--color-text-primary)] truncate">
                        {norma.titulo}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                        {norma.referencia_legal}
                      </p>
                      {norma.fecha_publicacion && (
                        <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                          Publicación: {new Date(norma.fecha_publicacion).toLocaleDateString("es-ES")}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Badge variant={norma.estado_vigencia === "vigente" ? "success" : "primary"}>
                        {norma.estado_vigencia}
                      </Badge>
                      {norma.enlace_boe_boletin && (
                        <a
                          href={norma.enlace_boe_boletin}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)]"
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
            </Card>
          )}

          {/* Mensaje si no hay datos */}
          {!siuData && !directorioData && normativaData.length === 0 && (
            <Card>
              <div className="py-12 text-center">
                <svg className="mx-auto h-12 w-12 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                  No se encontró información para este municipio.
                </p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  Código INE: {resolvedParams.codigoINE}
                </p>
              </div>
            </Card>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
