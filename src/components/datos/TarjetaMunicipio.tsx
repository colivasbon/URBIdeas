"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/Badge"
import { Card } from "@/components/ui/Card"
import type { InstrumentoPlaneamiento, Municipio } from "@/lib/types"

interface TarjetaMunicipioProps {
  municipio: Municipio
  instrumento?: InstrumentoPlaneamiento
}

const estadoBadgeVariant: Record<string, "success" | "accent" | "primary" | "danger"> = {
  vigente: "success",
  "en tramitación": "accent",
  "en revisión": "primary",
  "aprobado definitivamente": "success",
  "aprobado provisionalmente": "accent",
}

function formatearPoblacion(poblacion: number | null): string {
  if (poblacion === null || poblacion === undefined) return "Sin dato"
  return poblacion.toLocaleString("es-ES")
}

export default function TarjetaMunicipio({ municipio, instrumento }: TarjetaMunicipioProps) {
  const provinciaNombre = municipio.provincia?.nombre
  const ccaaNombre = municipio.provincia?.comunidad_autonoma?.nombre

  return (
    <Card className="group transition-colors hover:border-[var(--color-secondary)]">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)] leading-snug">
            {municipio.nombre}
          </h3>
          <Badge variant="primary" className="shrink-0">
            {municipio.codigo_ine}
          </Badge>
        </div>

        <p className="text-sm text-[var(--color-text-secondary)]">
          {provinciaNombre || "Provincia desconocida"}
          {ccaaNombre ? ` · ${ccaaNombre}` : ""}
        </p>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-[var(--color-text-secondary)]">Población:</span>
          <span className="font-medium text-[var(--color-text-primary)]">
            {formatearPoblacion(municipio.poblacion)}
          </span>
        </div>

        {instrumento && (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--color-text-secondary)]">Planeamiento:</span>
            <Badge variant={estadoBadgeVariant[instrumento.estado] ?? "primary"}>
              {instrumento.tipo}
            </Badge>
            <Badge variant={estadoBadgeVariant[instrumento.estado] ?? "primary"} className="capitalize">
              {instrumento.estado}
            </Badge>
          </div>
        )}

        <div className="mt-2">
          <Link
            href={`/municipios/${municipio.id}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-secondary)] transition-colors hover:text-[var(--color-accent)]"
          >
            Ver detalles completos
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
                d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
              />
            </svg>
          </Link>
        </div>
      </div>
    </Card>
  )
}
