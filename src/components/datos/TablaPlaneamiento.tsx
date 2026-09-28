"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Badge } from "@/components/ui/Badge"
import type { InstrumentoPlaneamiento } from "@/lib/types"

interface TablaPlaneamientoProps {
  municipioId: string
}

const estadoBadgeVariant: Record<string, "success" | "accent" | "primary" | "danger"> = {
  vigente: "success",
  "en tramitación": "accent",
  "en revisión": "primary",
  "aprobado definitivamente": "success",
  "aprobado provisionalmente": "accent",
}

export default function TablaPlaneamiento({ municipioId }: TablaPlaneamientoProps) {
  const [instrumentos, setInstrumentos] = useState<InstrumentoPlaneamiento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false

    async function cargarDatos() {
      setLoading(true)
      setError(null)

      const { data, error: supaError } = await supabase
        .from("instrumentos_planeamiento")
        .select("*")
        .eq("municipio_id", municipioId)
        .order("fecha_aprobacion_definitiva", { ascending: false, nullsFirst: false })

      if (cancelado) return

      if (supaError) {
        setError(supaError.message)
        setInstrumentos([])
      } else {
        setInstrumentos((data as InstrumentoPlaneamiento[]) || [])
      }

      setLoading(false)
    }

    cargarDatos()

    return () => {
      cancelado = true
    }
  }, [municipioId])

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-8" role="status" aria-live="polite">
        <span className="spinner text-[var(--moss-ink)]" aria-hidden="true" />
        <span className="text-sm text-[var(--text-secondary)]">Cargando planeamiento…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="note note-danger" role="alert">
        <p className="font-medium text-[var(--text-primary)]">No se pudo cargar el planeamiento del municipio.</p>
        <p className="mt-1">{error}. Recargue la página para intentarlo de nuevo.</p>
      </div>
    )
  }

  if (instrumentos.length === 0) {
    return (
      <p className="border-t border-[var(--border-subtle)] py-6 text-sm text-[var(--text-secondary)]">
        No hay instrumentos de planeamiento registrados para este municipio.
      </p>
    )
  }

  return (
    <div className="data-table-wrap rounded-[6px] border border-[var(--border-subtle)]">
      <table className="data-table min-w-[720px]">
        <thead>
          <tr>
            <th scope="col">Tipo</th>
            <th scope="col">Estado</th>
            <th scope="col" className="num">Aprobación inicial</th>
            <th scope="col" className="num">Aprobación definitiva</th>
            <th scope="col">Fuente</th>
            <th scope="col">Documento</th>
          </tr>
        </thead>
        <tbody>
          {instrumentos.map((inst) => (
            <tr key={inst.id}>
              <td className="font-medium">{inst.tipo}</td>
              <td>
                <Badge variant={estadoBadgeVariant[inst.estado] ?? "primary"}>
                  {inst.estado}
                </Badge>
              </td>
              <td className="num meta">
                {inst.fecha_aprobacion_inicial
                  ? new Date(inst.fecha_aprobacion_inicial).toLocaleDateString("es-ES")
                  : "—"}
              </td>
              <td className="num meta">
                {inst.fecha_aprobacion_definitiva
                  ? new Date(inst.fecha_aprobacion_definitiva).toLocaleDateString("es-ES")
                  : "—"}
              </td>
              <td className="meta">{inst.fuente || "—"}</td>
              <td>
                {inst.enlace_documento_oficial ? (
                  <a
                    href={inst.enlace_documento_oficial}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link link-external"
                  >
                    Documento oficial
                  </a>
                ) : (
                  <span className="text-[var(--text-muted)]">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
