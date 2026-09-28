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
      <p className="border-t border-[var(--border-subtle)] py-6 text-sm text-[var(--text-secondary)]">
        Seleccione municipios para generar la tabla comparativa.
      </p>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-8" role="status" aria-live="polite">
        <span className="spinner text-[var(--moss-ink)]" aria-hidden="true" />
        <span className="text-sm text-[var(--text-secondary)]">Cargando la comparativa…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="note note-danger" role="alert">
        <p className="font-medium text-[var(--text-primary)]">No se pudo cargar la comparativa.</p>
        <p className="mt-1">{error}. Revise la selección y vuelva a intentarlo.</p>
      </div>
    )
  }

  if (filas.length === 0) {
    return (
      <p className="border-t border-[var(--border-subtle)] py-6 text-sm text-[var(--text-secondary)]">
        No hay datos para los municipios seleccionados. Pruebe con otra selección.
      </p>
    )
  }

  const totalInstrumentos = filas.reduce((acc, f) => acc + f.instrumentos.length, 0)

  return (
    <div>
      <div className="data-table-wrap rounded-[6px] border border-[var(--border-subtle)]">
        <table className="data-table min-w-[800px]">
          <thead>
            <tr>
              <th scope="col">Municipio</th>
              <th scope="col">Provincia</th>
              <th scope="col">Comunidad autónoma</th>
              <th scope="col">Planeamiento</th>
              <th scope="col">Estado</th>
              <th scope="col" className="num">Aprobación</th>
              <th scope="col">Documento</th>
              <th scope="col">Geoportal</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => {
              const inst = fila.instrumentos[0]
              const tieneVigente = fila.instrumentos.some((i) => i.estado === "vigente")

              return (
                <tr
                  key={fila.municipio.id}
                  className={!tieneVigente ? "[&>td]:bg-[var(--bg-surface-sunken)]" : undefined}
                >
                  <td className="font-medium">
                    {fila.municipio.nombre}
                    {!tieneVigente && <span className="sr-only"> (sin planeamiento vigente)</span>}
                  </td>
                  <td className="meta">{fila.provincia?.nombre || "—"}</td>
                  <td className="meta">{fila.ccaa?.nombre || "—"}</td>
                  <td className="meta">{inst?.tipo || "No registrado"}</td>
                  <td>
                    {inst?.estado ? (
                      <Badge variant={estadoBadgeVariant[inst.estado] ?? "primary"}>
                        {inst.estado}
                      </Badge>
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    )}
                  </td>
                  <td className="num meta">
                    {inst?.fecha_aprobacion_definitiva
                      ? new Date(inst.fecha_aprobacion_definitiva).toLocaleDateString("es-ES")
                      : "—"}
                  </td>
                  <td>
                    {inst?.enlace_documento_oficial ? (
                      <a
                        href={inst.enlace_documento_oficial}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link link-external"
                      >
                        Documento
                      </a>
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    )}
                  </td>
                  <td>
                    {inst?.enlace_geoportal ? (
                      <a
                        href={inst.enlace_geoportal}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link link-external"
                      >
                        Geoportal
                      </a>
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="tnum mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-sm text-[var(--text-secondary)]">
        <span>
          {filas.length} {filas.length === 1 ? "municipio" : "municipios"}
        </span>
        <span>Instrumentos registrados: {totalInstrumentos}</span>
      </div>
    </div>
  )
}
