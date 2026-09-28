"use client"

import { useState, useEffect, use } from "react"
import UrbideasHeader from "@/components/platform/UrbideasHeader"
import PlatformFooter from "@/components/platform/PlatformFooter"
import PageShell from "@/components/ui/PageShell"
import Breadcrumbs from "@/components/ui/Breadcrumbs"
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

  const nombreMunicipio = siuData?.nombre || directorioData?.nombre_ayuntamiento

  const breadcrumbs = (
    <Breadcrumbs
      items={[
        { label: "SOCideas", href: "/" },
        { label: "URBideas", href: "/urbideas" },
        { label: "Legislación", href: "/urbideas/legislacion" },
        { label: nombreMunicipio || resolvedParams.codigoINE },
      ]}
    />
  )

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <UrbideasHeader />
        <main id="contenido" className="flex-1">
          <div className="container-ima py-16">
            <div className="flex items-center gap-3" role="status" aria-live="polite">
              <span className="spinner text-[var(--moss-ink)]" aria-hidden="true" />
              <p className="text-sm text-[var(--text-muted)]">Cargando información del municipio…</p>
            </div>
          </div>
        </main>
        <PlatformFooter />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col">
        <UrbideasHeader />
        <main id="contenido" className="flex-1">
          <div className="container-ima pb-16">
            <PageShell breadcrumbs={breadcrumbs} title="Legislación municipal" />
            <div className="note note-danger max-w-[70ch]" role="alert">
              <p className="font-medium text-[var(--text-primary)]">
                No se pudo cargar la información del municipio {resolvedParams.codigoINE}.
              </p>
              <p className="mt-1">
                Compruebe la conexión y recargue la página, o consulte la normativa general en{" "}
                <Link href="/urbideas/legislacion" className="link">
                  Legislación
                </Link>
                .
              </p>
            </div>
          </div>
        </main>
        <PlatformFooter />
      </div>
    )
  }

  const enlacesAyuntamiento = directorioData
    ? [
        {
          href: directorioData.url_web_oficial,
          nombre: "Web oficial",
          descripcion: directorioData.url_web_oficial,
          breakAll: true,
        },
        {
          href: directorioData.url_legislacion_urbanistica,
          nombre: "Legislación urbanística",
          descripcion: "Normativa y ordenanzas municipales",
          breakAll: false,
        },
        {
          href: directorioData.url_plan_ordenacion,
          nombre: "Plan de ordenación",
          descripcion: "PGOU, normas subsidiarias y planeamiento",
          breakAll: false,
        },
        {
          href: directorioData.url_boletin_municipal,
          nombre: "Boletín municipal",
          descripcion: "Publicaciones oficiales del ayuntamiento",
          breakAll: false,
        },
      ].filter((e): e is { href: string; nombre: string; descripcion: string; breakAll: boolean } => Boolean(e.href))
    : []

  return (
    <div className="flex min-h-screen flex-col">
      <UrbideasHeader />

      <main id="contenido" className="flex-1">
        <div className="container-ima pb-16">
          <PageShell
            breadcrumbs={breadcrumbs}
            title={nombreMunicipio || "Municipio"}
            lede="Planeamiento urbanístico comunicado al SIU, enlaces del ayuntamiento y normativa municipal registrada."
            meta={<span className="tnum text-sm text-[var(--text-secondary)]">Código INE {resolvedParams.codigoINE}</span>}
          />

          <div className="flex flex-col gap-14">
            {/* Planeamiento (SIU) */}
            {siuData && (
              <section aria-labelledby="sec-siu">
                <h2 id="sec-siu" className="type-h3 text-[var(--text-primary)]">
                  Planeamiento urbanístico (SIU)
                </h2>
                <dl className="module-index mt-5">
                  <div className="module-index__row">
                    <dt className="text-sm text-[var(--text-secondary)]">Figura vigente</dt>
                    <dd>
                      <Badge variant={figuraColors[siuData.figura_vigente] || "primary"}>
                        {siuData.figura_vigente}
                      </Badge>
                    </dd>
                  </div>
                  {siuData.fecha_figura && (
                    <div className="module-index__row">
                      <dt className="text-sm text-[var(--text-secondary)]">Fecha de aprobación</dt>
                      <dd className="tnum text-sm text-[var(--text-primary)]">{siuData.fecha_figura}</dd>
                    </div>
                  )}
                  {siuData.observaciones && (
                    <div className="module-index__row">
                      <dt className="text-sm text-[var(--text-secondary)]">Observaciones</dt>
                      <dd className="max-w-[70ch] text-sm leading-relaxed text-[var(--text-primary)]">
                        {siuData.observaciones}
                      </dd>
                    </div>
                  )}
                  {siuData.url_link && (
                    <div className="module-index__row">
                      <dt className="text-sm text-[var(--text-secondary)]">Visor</dt>
                      <dd className="text-sm">
                        <a
                          href={siuData.url_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link link-external"
                        >
                          {siuData.texto_link || "Visor de planeamiento"}
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
              </section>
            )}

            {/* Directorio del ayuntamiento */}
            {directorioData && (
              <section aria-labelledby="sec-ayuntamiento">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 id="sec-ayuntamiento" className="type-h3 text-[var(--text-primary)]">
                    Enlaces del ayuntamiento
                  </h2>
                  {directorioData.tiene_datos_abiertos && <Badge variant="success">Datos abiertos disponibles</Badge>}
                </div>
                {enlacesAyuntamiento.length > 0 ? (
                  <dl className="module-index mt-5">
                    {enlacesAyuntamiento.map((e) => (
                      <div key={e.nombre} className="module-index__row">
                        <dt className="text-sm">
                          <a href={e.href} target="_blank" rel="noopener noreferrer" className="link link-external font-medium">
                            {e.nombre}
                          </a>
                        </dt>
                        <dd className={`module-index__desc ${e.breakAll ? "break-all" : ""}`}>{e.descripcion}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-4 text-sm text-[var(--text-secondary)]">
                    El directorio no recoge enlaces para este ayuntamiento.
                  </p>
                )}
              </section>
            )}

            {/* Normativa municipal */}
            {normativaData.length > 0 && (
              <section aria-labelledby="sec-normativa">
                <h2 id="sec-normativa" className="type-h3 text-[var(--text-primary)]">
                  Normativa municipal
                </h2>
                <ul className="mt-5 border-t border-[var(--border-strong)]">
                  {normativaData.map((norma) => (
                    <li
                      key={norma.id}
                      className="grid gap-3 border-b border-[var(--border-subtle)] py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-8"
                    >
                      <div className="min-w-0">
                        <p className="max-w-[70ch] text-sm font-medium text-[var(--text-primary)]">{norma.titulo}</p>
                        <p className="tnum mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--text-muted)]">
                          {norma.referencia_legal && <span>{norma.referencia_legal}</span>}
                          {norma.fecha_publicacion && (
                            <span>Publicación: {new Date(norma.fecha_publicacion).toLocaleDateString("es-ES")}</span>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 self-start">
                        <Badge variant={norma.estado_vigencia === "vigente" ? "success" : "primary"}>
                          {norma.estado_vigencia}
                        </Badge>
                        {norma.enlace_boe_boletin && (
                          <a
                            href={norma.enlace_boe_boletin}
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
              </section>
            )}

            {/* Estado vacío */}
            {!siuData && !directorioData && normativaData.length === 0 && (
              <div>
                <p className="type-h4 text-[var(--text-primary)]">Sin información registrada para este municipio</p>
                <p className="type-body-sm mt-2 max-w-[65ch] text-[var(--text-secondary)]">
                  No constan datos del SIU, del directorio de ayuntamientos ni normativa municipal para el
                  código INE {resolvedParams.codigoINE}. Compruebe el código o consulte la normativa estatal y
                  autonómica en{" "}
                  <Link href="/urbideas/legislacion" className="link">
                    Legislación
                  </Link>
                  .
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      <PlatformFooter />
    </div>
  )
}
