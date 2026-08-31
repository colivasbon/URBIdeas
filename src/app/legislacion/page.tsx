"use client"

import { useState, useEffect } from "react"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { Card, CardHeader, CardTitle } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { supabase } from "@/lib/supabase"

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

export default function LegislacionPage() {
  const [tab, setTab] = useState<"estatal" | "autonomico">("estatal")
  const [normativa, setNormativa] = useState<NormativaItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (tab !== "autonomico") return

    async function fetchNormativa() {
      setLoading(true)
      const { data, error } = await supabase
        .from("normativa_vigente")
        .select(`
          id,
          ambito,
          titulo,
          referencia_legal,
          fecha_publicacion,
          enlace_boe_boletin,
          estado_vigencia,
          comunidad_autonoma:comunidades_autonomas(nombre)
        `)
        .eq("ambito", "autonomico")
        .order("titulo")

      if (!error && data) {
        const mapped = data.map((n) => ({
          ...n,
          comunidad_autonoma: Array.isArray(n.comunidad_autonoma)
            ? n.comunidad_autonoma[0]
            : n.comunidad_autonoma,
        }))
        setNormativa(mapped)
      }
      setLoading(false)
    }
    fetchNormativa()
  }, [tab])

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <section className="mb-8">
            <h1 className="text-2xl font-bold text-white sm:text-3xl">
              Legislación Urbanística
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
              Consulta la normativa urbanística estatal y autonómica vigente en España.
            </p>
          </section>

          <div className="mb-6 flex gap-2">
            <button
              onClick={() => setTab("estatal")}
              className={`rounded-[var(--border-radius)] px-4 py-2 text-sm font-medium transition-colors ${
                tab === "estatal"
                  ? "bg-[var(--color-primary)] text-white"
                  : "bg-[var(--color-input-bg)] text-[var(--color-text-secondary)] hover:text-white"
              }`}
            >
              Legislación Estatal
            </button>
            <button
              onClick={() => setTab("autonomico")}
              className={`rounded-[var(--border-radius)] px-4 py-2 text-sm font-medium transition-colors ${
                tab === "autonomico"
                  ? "bg-[var(--color-primary)] text-white"
                  : "bg-[var(--color-input-bg)] text-[var(--color-text-secondary)] hover:text-white"
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
                        <span className="font-medium text-white">Referencia:</span>
                        <Badge variant="primary">{ley.referencia}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">Fecha:</span>
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
              ) : normativa.length === 0 ? (
                <Card>
                  <p className="py-12 text-center text-sm text-[var(--color-text-secondary)]">
                    No se encontró legislación autonómica registrada.
                  </p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {normativa.map((n) => {
                    const ccaa = n.comunidad_autonoma?.nombre ?? "Sin asignar"
                    return (
                      <Card key={n.id} className="flex flex-col">
                        <CardHeader>
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-base">{ccaa}</CardTitle>
                            <Badge variant={vigenciaVariant[n.estado_vigencia] ?? "primary"}>
                              {n.estado_vigencia}
                            </Badge>
                          </div>
                        </CardHeader>
                        <div className="flex flex-1 flex-col gap-3">
                          <div>
                            <p className="text-sm font-medium text-white">{n.titulo}</p>
                            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                              {n.referencia_legal}
                            </p>
                          </div>

                          <div className="flex flex-col gap-1 text-sm">
                            {n.fecha_publicacion && (
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-white">Publicación:</span>
                                <span className="text-[var(--color-text-secondary)]">
                                  {new Date(n.fecha_publicacion).toLocaleDateString("es-ES")}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="mt-auto pt-3 border-t border-[var(--color-border)]">
                            {n.enlace_boe_boletin ? (
                              <a
                                href={n.enlace_boe_boletin}
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
                        </div>
                      </Card>
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
