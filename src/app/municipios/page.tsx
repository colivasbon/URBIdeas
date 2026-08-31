"use client"

import { useState, useCallback } from "react"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { Card, CardHeader, CardTitle } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import FiltroCascada from "@/components/filtros/FiltroCascada"
import SelectorMultiMunicipio from "@/components/filtros/SelectorMultiMunicipio"
import { supabase } from "@/lib/supabase"

interface MunicipioComparado {
  id: number
  nombre: string
  provincia: string
  ccaa: string
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

export default function MunicipiosPage() {
  const [comparando, setComparando] = useState(false)
  const [municipiosComparados, setMunicipiosComparados] = useState<MunicipioComparado[]>([])
  const [loadingComparacion, setLoadingComparacion] = useState(false)

  const handleCompare = useCallback(async (municipioIds: number[]) => {
    setComparando(true)
    setLoadingComparacion(true)

    const { data: municipios, error } = await supabase
      .from("municipios")
      .select(`
        id,
        nombre,
        provincia:provincias(
          nombre,
          comunidad_autonoma:comunidades_autonomas(nombre)
        ),
        instrumentos_planeamiento(
          tipo,
          estado,
          fecha_aprobacion_definitiva,
          enlace_documento_oficial
        )
      `)
      .in("id", municipioIds)

    if (error || !municipios) {
      setLoadingComparacion(false)
      return
    }

    const comparados: MunicipioComparado[] = municipios.map((m) => {
      const prov = Array.isArray(m.provincia) ? m.provincia[0] : m.provincia
      const ccaa = prov ? (Array.isArray(prov.comunidad_autonoma) ? prov.comunidad_autonoma[0] : prov.comunidad_autonoma) : null
      const inst = Array.isArray(m.instrumentos_planeamiento)
        ? m.instrumentos_planeamiento[0]
        : m.instrumentos_planeamiento

      return {
        id: m.id,
        nombre: m.nombre,
        provincia: prov?.nombre ?? "—",
        ccaa: ccaa?.nombre ?? "—",
        tipo_planeamiento: inst?.tipo ?? "No registrado",
        estado: inst?.estado ?? null,
        fecha_aprobacion: inst?.fecha_aprobacion_definitiva ?? null,
        enlace: inst?.enlace_documento_oficial ?? null,
      }
    })

    setMunicipiosComparados(comparados)
    setLoadingComparacion(false)
  }, [])

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <section className="mb-8">
            <h1 className="text-2xl font-bold text-white sm:text-3xl">
              Municipios
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
              Busca, filtra y compara el planeamiento urbanístico de municipios de toda España.
            </p>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle>Filtro por ubicación</CardTitle>
                </CardHeader>
                <FiltroCascada />
              </Card>
            </div>

            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Selección múltiple para comparación</CardTitle>
                </CardHeader>
                <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
                  Busca y selecciona hasta 10 municipios para comparar su planeamiento lado a lado.
                </p>
                <SelectorMultiMunicipio onCompare={handleCompare} />
              </Card>
            </div>
          </div>

          {comparando && (
            <section className="mt-8">
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
                ) : municipiosComparados.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[var(--color-text-secondary)]">
                    No se encontraron datos para los municipios seleccionados.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--color-border)]">
                          <th className="px-4 py-3 text-left font-semibold text-white">Municipio</th>
                          <th className="px-4 py-3 text-left font-semibold text-white">Provincia</th>
                          <th className="px-4 py-3 text-left font-semibold text-white">CCAA</th>
                          <th className="px-4 py-3 text-left font-semibold text-white">Tipo Planeamiento</th>
                          <th className="px-4 py-3 text-left font-semibold text-white">Estado</th>
                          <th className="px-4 py-3 text-left font-semibold text-white">Fecha Aprobación</th>
                          <th className="px-4 py-3 text-left font-semibold text-white">Enlace</th>
                        </tr>
                      </thead>
                      <tbody>
                        {municipiosComparados.map((m) => (
                          <tr
                            key={m.id}
                            className="border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-input-bg)]"
                          >
                            <td className="px-4 py-3 font-medium text-white">{m.nombre}</td>
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
                                  className="text-[var(--color-secondary)] hover:text-[var(--color-accent)] transition-colors underline underline-offset-2"
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
                )}

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => {
                      setComparando(false)
                      setMunicipiosComparados([])
                    }}
                    className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-white rounded-[var(--border-radius)] transition-colors hover:bg-[var(--color-input-bg)]"
                  >
                    Cerrar comparativa
                  </button>
                </div>
              </Card>
            </section>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
