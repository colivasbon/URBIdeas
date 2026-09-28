"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/Badge"
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
    <article className="card p-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="type-h4 text-[var(--text-primary)]">{municipio.nombre}</h3>
          <span className="tnum shrink-0 text-xs text-[var(--text-muted)]">INE {municipio.codigo_ine}</span>
        </div>

        <p className="text-sm text-[var(--text-secondary)]">
          {provinciaNombre || "Provincia desconocida"}
          {ccaaNombre ? `, ${ccaaNombre}` : ""}
        </p>

        <dl className="tnum flex items-baseline gap-2 text-sm">
          <dt className="text-[var(--text-secondary)]">Población</dt>
          <dd className="font-medium text-[var(--text-primary)]">{formatearPoblacion(municipio.poblacion)}</dd>
        </dl>

        {instrumento && (
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
            <span className="text-xs text-[var(--text-secondary)]">Planeamiento</span>
            <Badge variant={estadoBadgeVariant[instrumento.estado] ?? "primary"}>
              {instrumento.tipo}
            </Badge>
            <Badge variant={estadoBadgeVariant[instrumento.estado] ?? "primary"} className="capitalize">
              {instrumento.estado}
            </Badge>
          </div>
        )}

        <div className="mt-1">
          <Link href={`/urbideas/municipios/${municipio.id}`} className="link text-sm font-medium">
            Ver ficha del municipio
          </Link>
        </div>
      </div>
    </article>
  )
}
