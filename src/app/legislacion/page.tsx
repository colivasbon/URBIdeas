"use client"

import { useState, useEffect } from "react"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { Card, CardHeader, CardTitle } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"

interface NormativaItem {
  id: string
  ambito: "estatal" | "autonomico"
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
    enlace: "https://www.boe.es/buscar/act.php?id=BOE-A-2015-11746",
  },
  {
    titulo: "Ley 8/2013, de 26 de junio, de Rehabilitación Urbana",
    descripcion:
      "Regula los instrumentos de intervención en la urbanización, rehabilitación integral de edificios y regeneración y renovación urbanas.",
    referencia: "Ley 8/2013",
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
  const [tab, setTab] = useState<"estatal" | "autonomico">("estatal")
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

  return (
    <div className="flex min-h-screen flex-col transition-colors duration-200">
      <Header />

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <section className="mb-8">
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl">
              Legislación Urbanística
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
              Consulta la normativa urbanística estatal y autonómica vigente en España.
            </p>
          </section>

          <div className="mb-6 flex gap-2">
            <button
              onClick={() => setTab("estatal")}
              className={`rounded-[var(--border-radius)] px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                tab === "estatal"
                  ? "bg-[var(--color-primary)] text-[var(--color-text-primary)]"
                  : "bg-[var(--color-input-bg)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              Legislación Estatal
            </button>
            <button
              onClick={() => setTab("autonomico")}
              className={`rounded-[var(--border-radius)] px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                tab === "autonomico"
                  ? "bg-[var(--color-primary)] text-[var(--color-text-primary)]"
                  : "bg-[var(--color-input-bg)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              Legislación Autonómica
            </button>
          </div>

          {tab === "estatal" && (
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {leyesEstatales.map((ley) => (
                <Card key={ley.referencia} className="flex flex-col">
                  <CardHeader>
                    <CardTitle className="text-base">{ley.titulo}</CardTitle>
                  </CardHeader>
                  <div className="flex flex-1 flex-col gap-3">
                    <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
                      {ley.descripcion}
                    </p>
                    <div className="flex flex-col gap-1 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--color-text-primary)]">Referencia:</span>
                        <Badge variant="primary">{ley.referencia}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--color-text-primary)]">Fecha:</span>
                        <span className="text-[var(--color-text-secondary)]">{ley.fecha}</span>
                      </div>
                    </div>
                    <div className="mt-auto pt-3 border-t border-[var(--color-border)]">
                      <a
                        href={ley.enlace}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-secondary)] hover:text-[var(--color-accent)] transition-colors"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                        Ver en BOE
                      </a>
                    </div>
                  </div>
                </Card>
              ))}
            </section>
          )}

          {tab === "autonomico" && (
            <section>
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-secondary)] border-t-transparent" />
                  <span className="ml-3 text-sm text-[var(--color-text-secondary)]">
                    Cargando legislación autonómica...
                  </span>
                </div>
              ) : grouped.length === 0 ? (
                <Card>
                  <p className="py-12 text-center text-sm text-[var(--color-text-secondary)]">
                    No se encontró legislación autonómica registrada.
                  </p>
                </Card>
              ) : (
                <div className="flex flex-col gap-3">
                  {grouped.map(([ccaa, leyes]) => {
                    const isExpanded = expandedCCAA[ccaa] ?? false
                    return (
                      <div
                        key={ccaa}
                        className="rounded-[var(--border-radius)] border border-[var(--color-border)] bg-[var(--color-card-bg)] overflow-hidden transition-colors duration-200"
                      >
                        <button
                          onClick={() => toggleGroup(ccaa)}
                          className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors duration-200 hover:bg-[var(--color-input-bg)]"
                        >
                          <div className="flex items-center gap-3">
                            <svg
                              className={`h-5 w-5 shrink-0 text-[var(--color-text-secondary)] transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                            <span className="font-semibold text-[var(--color-text-primary)]">{ccaa}</span>
                          </div>
                          <Badge variant="primary">{leyes.length}</Badge>
                        </button>
                        <div
                          className={`overflow-hidden transition-all duration-200 ease-in-out ${
                            isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
                          }`}
                        >
                          <div className="border-t border-[var(--color-border)] px-5 py-4">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                              {leyes.map((ley) => (
                                <Card key={ley.id} className="flex flex-col">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-medium text-[var(--color-text-primary)]">{ley.titulo}</p>
                                    <Badge variant={vigenciaVariant[ley.estado_vigencia] ?? "primary"}>
                                      {ley.estado_vigencia}
                                    </Badge>
                                  </div>
                                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                                    {ley.referencia_legal}
                                  </p>
                                  {ley.fecha_publicacion && (
                                    <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                                      Publicación: {new Date(ley.fecha_publicacion).toLocaleDateString("es-ES")}
                                    </p>
                                  )}
                                  <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                                    {ley.enlace_boe_boletin ? (
                                      <a
                                        href={ley.enlace_boe_boletin}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-secondary)] hover:text-[var(--color-accent)] transition-colors"
                                      >
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                        </svg>
                                        Ver en boletín oficial
                                      </a>
                                    ) : (
                                      <span className="text-xs text-[var(--color-text-secondary)]">
                                        Enlace no disponible
                                      </span>
                                    )}
                                  </div>
                                </Card>
                              ))}
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
        </div>
      </main>

      <Footer />
    </div>
  )
}
