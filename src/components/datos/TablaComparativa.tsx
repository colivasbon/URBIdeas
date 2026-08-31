"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Badge } from "@/components/ui/Badge"
import type { InstrumentoPlaneamiento, Municipio, Provincia, ComunidadAutonoma } from "@/lib/types"

interface TablaComparativaProps {
  municipioIds: string[]
}

interface FilaComparativa {
  municipio: Municipio
  provincia: Provincia
  ccaa: ComunidadAutonoma
  instrumentos: InstrumentoPlaneamiento[]
}

const estadoBadgeVariant: Record<string, "success" | "accent" | "primary" | "danger"> = {
  vigente: "success",
  "en tramitación": "accent",
  "en revisión": "primary",
  "aprobado definitivamente": "success",
  "aprobado provisionalmente": "accent",
}

export default function TablaComparativa({ municipioIds }: TablaComparativaProps) {
  const [filas, setFilas] = useState<FilaComparativa[]>([])
  const [loading, setLoading] = useState(municipioIds.length > 0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (municipioIds.length === 0) return

    let cancelado = false

    async function cargarDatos() {
      setLoading(true)
      setError(null)

      const { data: municipios, error: supaError } = await supabase
        .from("municipios")
        .select(`
          *,
          provincia:provincias(
            *,
            comunidad_autonoma:comunidades_autonomas(*)
          ),
          instrumentos_planeamiento(
            id, tipo, estado, fecha_aprobacion_inicial, fecha_aprobacion_definitiva,
            enlace_documento_oficial, enlace_geoportal, fuente
          )
        `)
        .in("id", municipioIds)
        .order("nombre")

      if (cancelado) return

      if (supaError) {
        setError(supaError.message)
        setFilas([])
      } else {
        const filasMapeadas: FilaComparativa[] = (municipios || []).map((m: Record<string, unknown>) => {
          const prov = Array.isArray(m.provincia) ? m.provincia[0] : m.provincia
          const ccaa = prov
            ? Array.isArray(prov.comunidad_autonoma)
              ? prov.comunidad_autonoma[0]
              : prov.comunidad_autonoma
            : null
          const insts = Array.isArray(m.instrumentos_planeamiento)
            ? m.instrumentos_planeamiento
            : m.instrumentos_planeamiento
              ? [m.instrumentos_planeamiento]
              : []

          return {
            municipio: m as unknown as Municipio,
            provincia: (prov as Provincia) || ({} as Provincia),
            ccaa: (ccaa as ComunidadAutonoma) || ({} as ComunidadAutonoma),
            instrumentos: (insts as InstrumentoPlaneamiento[]) || [],
          }
        })

        filasMapeadas.sort((a, b) => a.municipio.nombre.localeCompare(b.municipio.nombre, "es"))
        setFilas(filasMapeadas)
      }

      setLoading(false)
    }

    cargarDatos()

    return () => {
      cancelado = true
    }
  }, [municipioIds])

  if (municipioIds.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--color-text-secondary)]">
        Selecciona municipios para generar la tabla comparativa.
      </p>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-secondary)] border-t-transparent" />
        <span className="ml-3 text-sm text-[var(--color-text-secondary)]">
          Cargando comparativa...
        </span>
      </div>
    )
  }

  if (error) {
    return (
      <p className="py-8 text-center text-sm text-red-400">
        Error al cargar datos: {error}
      </p>
    )
  }

  if (filas.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--color-text-secondary)]">
        No se encontraron datos para los municipios seleccionados.
      </p>
    )
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-[var(--border-radius)] border border-[var(--color-border)]">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-input-bg)]">
              <th className="px-4 py-3 text-left font-semibold text-white">Municipio</th>
              <th className="px-4 py-3 text-left font-semibold text-white">Provincia</th>
              <th className="px-4 py-3 text-left font-semibold text-white">CCAA</th>
              <th className="px-4 py-3 text-left font-semibold text-white">Tipo Planeamiento</th>
              <th className="px-4 py-3 text-left font-semibold text-white">Estado</th>
              <th className="px-4 py-3 text-left font-semibold text-white">
                Fecha Aprobación
              </th>
              <th className="px-4 py-3 text-left font-semibold text-white">
                Enlace al Documento
              </th>
              <th className="px-4 py-3 text-left font-semibold text-white">
                Enlace al Geoportal
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => {
              const inst = fila.instrumentos[0]
              const tieneVigente = fila.instrumentos.some((i) => i.estado === "vigente")

              return (
                <tr
                  key={fila.municipio.id}
                  className={
                    !tieneVigente
                      ? "border-b border-[var(--color-border)] bg-[var(--color-accent)]/5 transition-colors hover:bg-[var(--color-accent)]/10"
                      : "border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-input-bg)]"
                  }
                >
                  <td className="px-4 py-3 font-medium text-white">{fila.municipio.nombre}</td>
                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                    {fila.provincia?.nombre || "—"}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                    {fila.ccaa?.nombre || "—"}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                    {inst?.tipo || "No registrado"}
                  </td>
                  <td className="px-4 py-3">
                    {inst?.estado ? (
                      <Badge variant={estadoBadgeVariant[inst.estado] ?? "primary"}>
                        {inst.estado}
                      </Badge>
                    ) : (
                      <span className="text-[var(--color-text-secondary)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                    {inst?.fecha_aprobacion_definitiva
                      ? new Date(inst.fecha_aprobacion_definitiva).toLocaleDateString("es-ES")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {inst?.enlace_documento_oficial ? (
                      <a
                        href={inst.enlace_documento_oficial}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[var(--color-secondary)] transition-colors hover:text-[var(--color-accent)]"
                      >
                        <svg
                          className="h-4 w-4 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                          />
                        </svg>
                        <span className="text-xs underline underline-offset-2">Documento</span>
                      </a>
                    ) : (
                      <span className="text-[var(--color-text-secondary)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {inst?.enlace_geoportal ? (
                      <a
                        href={inst.enlace_geoportal}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[var(--color-secondary)] transition-colors hover:text-[var(--color-accent)]"
                      >
                        <svg
                          className="h-4 w-4 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934a2.999 2.999 0 0 1-2.502 0L5.998 3.412c-.349-.174-.751-.174-1.1.001L4.5 3.42"
                          />
                        </svg>
                        <span className="text-xs underline underline-offset-2">Geoportal</span>
                      </a>
                    ) : (
                      <span className="text-[var(--color-text-secondary)]">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-[var(--color-text-secondary)]">
        <span>
          Mostrando <strong className="text-white">{filas.length}</strong>{" "}
          {filas.length === 1 ? "municipio" : "municipios"}
        </span>
        <span>
          Total instrumentos:{" "}
          <strong className="text-white">
            {filas.reduce((acc, f) => acc + f.instrumentos.length, 0)}
          </strong>
        </span>
      </div>
    </div>
  )
}
