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
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-secondary)] border-t-transparent" />
        <span className="ml-3 text-sm text-[var(--color-text-secondary)]">
          Cargando planeamiento...
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

  if (instrumentos.length === 0) {
    return (
      <div className="py-12 text-center">
        <svg
          className="mx-auto mb-3 h-10 w-10 text-[var(--color-text-secondary)]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
          />
        </svg>
        <p className="text-sm text-[var(--color-text-secondary)]">
          No se encontraron instrumentos de planeamiento para este municipio.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <th className="px-4 py-3 text-left font-semibold text-white">Tipo</th>
            <th className="px-4 py-3 text-left font-semibold text-white">Estado</th>
            <th className="px-4 py-3 text-left font-semibold text-white">
              Fecha Aprobación Inicial
            </th>
            <th className="px-4 py-3 text-left font-semibold text-white">
              Fecha Aprobación Definitiva
            </th>
            <th className="px-4 py-3 text-left font-semibold text-white">Fuente</th>
            <th className="px-4 py-3 text-left font-semibold text-white">Enlace</th>
          </tr>
        </thead>
        <tbody>
          {instrumentos.map((inst) => (
            <tr
              key={inst.id}
              className="border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-input-bg)]"
            >
              <td className="px-4 py-3 font-medium text-white">{inst.tipo}</td>
              <td className="px-4 py-3">
                <Badge variant={estadoBadgeVariant[inst.estado] ?? "primary"}>
                  {inst.estado}
                </Badge>
              </td>
              <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                {inst.fecha_aprobacion_inicial
                  ? new Date(inst.fecha_aprobacion_inicial).toLocaleDateString("es-ES")
                  : "—"}
              </td>
              <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                {inst.fecha_aprobacion_definitiva
                  ? new Date(inst.fecha_aprobacion_definitiva).toLocaleDateString("es-ES")
                  : "—"}
              </td>
              <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                {inst.fuente || "—"}
              </td>
              <td className="px-4 py-3">
                {inst.enlace_documento_oficial ? (
                  <a
                    href={inst.enlace_documento_oficial}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[var(--color-secondary)] transition-colors hover:text-[var(--color-accent)]"
                    title="Abrir documento oficial"
                  >
                    <svg
                      className="h-4 w-4"
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
                    <span className="text-xs underline underline-offset-2">Enlace</span>
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
  )
}
