"use client"

import { useState, useEffect } from "react"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { Badge } from "@/components/ui/Badge"
import MunicipalTab from "@/components/datos/MunicipalTab"

interface NormativaItem {
  id: string
  ambito: "estatal" | "autonomico" | "provincial" | "municipal"
  titulo: string
  referencia_legal: string
  fecha_publicacion: string | null
  enlace_boe_boletin: string | null
  estado_vigencia: "vigente" | "derogada" | "parcialmente derogada" | "en revisión"
  comunidad_autonoma?: { nombre: string } | null
}

const vigenciaVariant: Record<string, "success" | "danger" | "accent" | "primary"> = {
  vigente: "success",
  derogada: "danger",
  "parcialmente derogada": "accent",
  "en revisión": "primary",
}

const leyesEstatales = [
  {
    titulo: "Real Decreto Legislativo 7/2015, de 30 de octubre",
    descripcion:
      "Texto Refundido de la Ley de Suelo y Rehabilitación Urbana. Norma estatal básica que regula el suelo, la edificación y la rehabilitación urbana en todo el territorio nacional.",
    referencia: "RDL 7/2015",
    fecha: "30/10/2015",
    enlace: "https://www.boe.es/eli/es/rdlg/2015/10/30/7/con",
  },
  {
    titulo: "Constitución Española de 1978 (arts. 33, 47, 148.1.3 y 149)",
    descripcion:
      "Competencias sobre urbanismo, derecho a la vivienda y distribución de competencias entre Estado y CCAA.",
    referencia: "CE 1978",
    fecha: "27/12/1978",
    enlace: "https://www.boe.es/buscar/act.php?id=BOE-A-1978-31229",
  },
  {
    titulo: "Ley 7/1985, de 2 de abril, Reguladora de las Bases del Régimen Local",
    descripcion:
      "Competencia municipal sobre urbanismo, ordenanzas y planeamiento. Arts. 25 y 125.",
    referencia: "LRBRL",
    fecha: "02/04/1985",
    enlace: "https://www.boe.es/buscar/act.php?id=BOE-A-1985-5392",
  },
  {
    titulo: "Ley 38/1999, de 5 de noviembre, de Ordenación de la Edificación",
    descripcion:
      "Agentes, proyecto y requisitos de la edificación. Regula los agentes participantes y el proceso de edificación.",
    referencia: "LOE",
    fecha: "05/11/1999",
    enlace: "https://www.boe.es/buscar/act.php?id=BOE-A-1999-23532",
  },
  {
    titulo: "Código Técnico de la Edificación",
    descripcion:
      "Requisitos técnicos de las obras: eficiencia energética, seguridad, habitabilidad, accesibilidad y sostenibilidad.",
    referencia: "CTE",
    fecha: "17/03/2006",
    enlace: "https://www.boe.es/buscar/act.php?id=BOE-A-2006-4477",
  },
  {
    titulo: "Ley 22/1988, de 28 de julio, de Costas",
    descripcion:
      "Dominio público marítimo-terrestre y servidumbres. Relevante para suelo costero y planeamiento litoral.",
    referencia: "Ley de Costas",
    fecha: "28/07/1988",
    enlace: "https://www.boe.es/buscar/act.php?id=BOE-A-1988-21632",
  },
  {
    titulo: "Ley 21/2013, de 9 de diciembre, de Evaluación Ambiental",
    descripcion:
      "Evaluación ambiental de planes y proyectos. Relevante para planes de desarrollo y grandes actuaciones urbanísticas.",
    referencia: "Ley Eval. Ambiental",
    fecha: "09/12/2013",
    enlace: "https://www.boe.es/buscar/act.php?id=BOE-A-2013-13588",
  },
  {
    titulo: "Ley 12/2023, de 24 de mayo, por el derecho a la vivienda",
    descripcion:
      "Incidencia sobre ordenación y usos residenciales. Regula la función social de la vivienda y medidas de protección.",
    referencia: "Ley Derecho Vivienda",
    fecha: "24/05/2023",
    enlace: "https://www.boe.es/buscar/act.php?id=BOE-A-2023-12167",
  },
  {
    titulo: "Real Decreto 2159/1978, Reglamento de Planeamiento",
    descripcion:
      "Aplicación residual o supletoria del Reglamento de Planeamiento Urbanístico.",
    referencia: "RD Planeamiento",
    fecha: "30/07/1978",
    enlace: "https://www.boe.es/buscar/act.php?id=BOE-A-1978-23729",
  },
  {
    titulo: "Real Decreto 3288/1978, Reglamento de Gestión Urbanística",
    descripcion:
      "Gestión y reparcelación, carácter residual. Aplicable supletoriamente donde la legislación autonómica no lo regula.",
    referencia: "RD Gestión Urbanística",
    fecha: "10/11/1978",
    enlace: "https://www.boe.es/buscar/act.php?id=BOE-A-1978-27337",
  },
  {
    titulo: "Real Decreto 2187/1978, Reglamento de Disciplina Urbanística",
    descripcion:
      "Restauración de la legalidad urbanística, carácter residual. Procedimiento sancionador y reposición.",
    referencia: "RD Disciplina Urbanística",
    fecha: "11/08/1978",
    enlace: "https://www.boe.es/buscar/act.php?id=BOE-A-1978-25025",
  },
  {
    titulo: "Real Decreto Legislativo 1346/1976, Texto Refundido de la Ley del Suelo",
    descripcion:
      "Supletorio; sigue siendo relevante en Ceuta y Melilla. Base histórica del régimen del suelo.",
    referencia: "RDL Suelo 1976",
    fecha: "09/04/1976",
    enlace: "https://www.boe.es/buscar/act.php?id=BOE-A-1976-17930",
  },
  {
    titulo: "Ley 5/2002, de 4 de abril, reguladora de los Boletines Oficiales de las Provincias",
    descripcion:
      "Publicación provincial de actos locales. Regula la estructura y contenido de los BOP.",
    referencia: "Ley BOP",
    fecha: "04/04/2002",
    enlace: "https://www.boe.es/buscar/act.php?id=BOE-A-2002-7922",
  },
  {
    titulo: "Ley 8/2013, de 26 de junio, de Rehabilitación Urbana",
    descripcion:
      "Regula los instrumentos de intervención en la urbanización, rehabilitación integral de edificios y regeneración y renovación urbanas.",
    referencia: "Ley Rehabilitación",
    fecha: "26/06/2013",
    enlace: "https://www.boe.es/buscar/act.php?id=BOE-A-2013-6947",
  },
  {
    titulo: "Ley 13/2015, de 30 de junio, de Modificación de la Ley de Suelo",
    descripcion:
      "Modifica el texto refundido de la Ley de Suelo y Rehabilitación Urbana para adaptarlo a la jurisprudencia del Tribunal Constitucional.",
    referencia: "Ley 13/2015",
    fecha: "30/06/2015",
    enlace: "https://www.boe.es/buscar/act.php?id=BOE-A-2015-7082",
  },
]

const fuentesEstatalesGeo = [
  {
    titulo: "Sistema de Información Urbana (SIU)",
    descripcion: "Visor del Ministerio de Vivienda y Agenda Urbana. Cubre 5.745 municipios (98,48% de la población). Clasificación y planeamiento comunicado por los ayuntamientos.",
    url: "https://www.mivau.gob.es/urbanismo-y-suelo/sistema-de-informacion-urbana",
  },
  {
    titulo: "SIU Servicios OGC (WFS)",
    descripcion: "Endpoint WFS del SIU estatal para reutilización en clientes GIS y apps.",
    url: "https://mapas.fomento.gob.es/arcgis/services/SIU/Servicios_OGC/MapServer/WFSServer",
  },
  {
    titulo: "IDEe - Ocupación del Suelo (WMS)",
    descripcion: "WMS de Ocupación de Suelo de España del IGN/IDEE. SIOSE, CLC, ocupación del suelo estatal.",
    url: "https://servicios.idee.es/wms-inspire/ocupacion-suelo",
  },
]

function groupByComunidad(items: NormativaItem[]) {
  const groups: Record<string, NormativaItem[]> = {}
  for (const item of items) {
    const key = item.comunidad_autonoma?.nombre ?? "Sin asignar"
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  }
  return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]))
}

export default function LegislacionPage() {
  const [tab, setTab] = useState<"estatal" | "autonomico" | "municipal" | "geoespacial">("estatal")
  const [normativa, setNormativa] = useState<NormativaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedCCAA, setExpandedCCAA] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (tab !== "autonomico") return

    async function fetchNormativa() {
      setLoading(true)
      try {
        const response = await fetch("/api/legislacion?ambito=autonomico")
        const json = await response.json()
        if (json.data) {
          const mapped = json.data.map((n: Record<string, unknown>) => ({
            ...n,
            comunidad_autonoma: Array.isArray(n.comunidad_autonoma)
              ? (n.comunidad_autonoma as Record<string, unknown>[])[0]
              : n.comunidad_autonoma,
          }))
          setNormativa(mapped)
          const groups: Record<string, boolean> = {}
          mapped.forEach((n: NormativaItem) => {
            const key = n.comunidad_autonoma?.nombre ?? "Sin asignar"
            groups[key] = false
          })
          setExpandedCCAA(groups)
        }
      } catch {
        setNormativa([])
      }
      setLoading(false)
    }
    fetchNormativa()
  }, [tab])

  const grouped = groupByComunidad(normativa)

  function toggleGroup(name: string) {
    setExpandedCCAA((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  const tabs = [
    { key: "estatal" as const, label: "Estatal" },
    { key: "autonomico" as const, label: "Autonómico" },
    { key: "municipal" as const, label: "Municipal" },
    { key: "geoespacial" as const, label: "Geoespacial" },
  ]

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {/* Page header */}
          <section className="mb-6 border-b border-[var(--color-border-subtle)] pb-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-secondary)] mb-2">
              Normativa
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
              Legislación Urbanística
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--color-text-muted)]">
              La legislación urbanística española se consulta en cuatro capas: el Estado fija el
              régimen básico del suelo; cada comunidad aprueba la ley urbanística de aplicación
              directa; la provincia publica el planeamiento en su boletín; el municipio aprueba el
              plan que rige cada parcela.
            </p>
          </section>

          {/* Tabs */}
          <div className="mb-6 flex gap-0 border-b border-[var(--color-border-subtle)]">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={[
                  'px-4 py-2.5 text-sm font-medium transition-colors duration-150 -mb-px',
                  tab === t.key
                    ? 'text-[var(--color-text-primary)] border-b-2 border-[var(--color-secondary)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
                ].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Estatal */}
          {tab === "estatal" && (
            <section>
              <div className="border border-[var(--color-border-subtle)] rounded-[var(--border-radius-lg)] divide-y divide-[var(--color-border-subtle)]">
                {leyesEstatales.map((ley) => (
                  <div key={ley.referencia} className="px-5 py-4 transition-colors hover:bg-[var(--color-card-bg)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[var(--color-text-primary)] leading-snug">{ley.titulo}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-muted)] leading-relaxed">
                          {ley.descripcion}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-[var(--color-text-muted)]">
                          <span>Ref: <Badge variant="primary">{ley.referencia}</Badge></span>
                          <span>{ley.fecha}</span>
                        </div>
                      </div>
                      <a
                        href={ley.enlace}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)] transition-colors"
                      >
                        BOE
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Autonómico */}
          {tab === "autonomico" && (
            <section>
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-secondary)] border-t-transparent" />
                  <span className="ml-3 text-xs text-[var(--color-text-muted)]">
                    Cargando legislación autonómica...
                  </span>
                </div>
              ) : grouped.length === 0 ? (
                <p className="py-12 text-center text-xs text-[var(--color-text-muted)]">
                  No se encontró legislación autonómica registrada.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {grouped.map(([ccaa, leyes]) => {
                    const isExpanded = expandedCCAA[ccaa] ?? false
                    return (
                      <div
                        key={ccaa}
                        className="border border-[var(--color-border-subtle)] rounded-[var(--border-radius-lg)] overflow-hidden"
                      >
                        <button
                          onClick={() => toggleGroup(ccaa)}
                          className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors duration-150 hover:bg-[var(--color-card-bg)]"
                        >
                          <div className="flex items-center gap-2.5">
                            <svg
                              className={`h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)] transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                            <span className="text-sm font-semibold text-[var(--color-text-primary)]">{ccaa}</span>
                          </div>
                          <Badge variant="primary">{leyes.length}</Badge>
                        </button>
                        <div
                          className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-250 ease-out ${
                            isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                          }`}
                        >
                          <div className="overflow-hidden">
                            <div className="border-t border-[var(--color-border-subtle)] px-5 py-4">
                              <div className="border border-[var(--color-border-subtle)] rounded-[var(--border-radius-lg)] divide-y divide-[var(--color-border-subtle)]">
                                {leyes.map((ley) => (
                                  <div key={ley.id} className="px-4 py-3 transition-colors hover:bg-[var(--color-card-bg)]">
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="text-sm font-medium text-[var(--color-text-primary)] leading-snug">{ley.titulo}</p>
                                      <Badge variant={vigenciaVariant[ley.estado_vigencia] ?? "primary"}>
                                        {ley.estado_vigencia}
                                      </Badge>
                                    </div>
                                    <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                                      {ley.referencia_legal}
                                    </p>
                                    {ley.fecha_publicacion && (
                                      <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                                        Publicación: {new Date(ley.fecha_publicacion).toLocaleDateString("es-ES")}
                                      </p>
                                    )}
                                    <div className="mt-2">
                                      {ley.enlace_boe_boletin ? (
                                        <a
                                          href={ley.enlace_boe_boletin}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)] transition-colors"
                                        >
                                          Ver en boletín oficial
                                        </a>
                                      ) : (
                                        <span className="text-[11px] text-[var(--color-text-muted)]">
                                          Enlace no disponible
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )}

          {/* Municipal */}
          {tab === "municipal" && (
            <section>
              <MunicipalTab />
            </section>
          )}

          {/* Geoespacial */}
          {tab === "geoespacial" && (
            <section>
              <div className="border border-[var(--color-border-subtle)] rounded-[var(--border-radius-lg)] p-5 mb-5">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">Fuentes geoespaciales estatales</h3>
                <p className="text-xs text-[var(--color-text-muted)] mb-4">
                  Servicios interoperables reutilizables en toda España para SIOSE, SIU y ocupación del suelo.
                </p>
                <div className="border border-[var(--color-border-subtle)] rounded-[var(--border-radius-lg)] divide-y divide-[var(--color-border-subtle)]">
                  {fuentesEstatalesGeo.map((fuente) => (
                    <div key={fuente.titulo} className="px-4 py-3 transition-colors hover:bg-[var(--color-card-bg)]">
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">{fuente.titulo}</p>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)] leading-relaxed">{fuente.descripcion}</p>
                      <div className="mt-2">
                        <a
                          href={fuente.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)] transition-colors"
                        >
                          Abrir servicio
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
