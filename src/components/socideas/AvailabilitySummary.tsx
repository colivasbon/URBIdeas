import { FIGURE, FIGURE_DETAIL, FIGURE_LABEL, FIGURE_ROW, FIGURE_VALUE } from "./ficha-ui";
import {
  AVAILABILITY_LABEL,
  type IndicatorAvailability,
} from "@/lib/socideas-availability";

interface Kpi {
  etiqueta: string;
  valor: string;
  detalle?: string;
  estado?: IndicatorAvailability;
}

/** Resumen honesto de qué hay disponible antes de las tablas. Sin números falsos. */
export default function AvailabilitySummary({
  bloque,
  disponibles,
  parciales = 0,
  provisionales = 0,
  periodo,
  fuentes,
}: {
  bloque: string;
  disponibles: number;
  parciales?: number;
  provisionales?: number;
  periodo?: string | null;
  fuentes?: string[];
}) {
  const partes: string[] = [`${disponibles} indicador${disponibles === 1 ? "" : "es"} disponible${disponibles === 1 ? "" : "s"}`];
  if (parciales > 0) partes.push(`${parciales} parcial${parciales === 1 ? "" : "es"}`);
  if (provisionales > 0) partes.push(`${provisionales} provisional${provisionales === 1 ? "" : "es"}`);
  return (
    <p
      className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-[var(--text-muted)]"
      role="status"
      aria-label={`Disponibilidad del bloque ${bloque}`}
    >
      <span className="inline-flex items-center gap-2 font-medium text-[var(--text-secondary)]">
        <span
          aria-hidden="true"
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            disponibles === 0 ? "bg-[var(--text-muted)]" : "bg-[var(--status-success-fg)]"
          }`}
        />
        {partes.join(", ")}
      </span>
      {periodo ? (
        <span>
          Periodo <span className="tabular-nums text-[var(--text-secondary)]">{periodo}</span>
        </span>
      ) : null}
      {fuentes && fuentes.length > 0 ? (
        <span>
          Fuente: <span className="text-[var(--text-secondary)]">{fuentes.join(", ")}</span>
        </span>
      ) : null}
    </p>
  );
}

/** Cuadrícula de KPIs reales (2–4). Si no hay ninguno, EmptyState elegante — nunca cuadrícula vacía. */
export function AvailableIndicators({
  kpis,
  emptyTitle,
  emptyDescription,
}: {
  kpis: Kpi[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (kpis.length === 0) {
    return (
      <div
        className="mt-4 rounded-[6px] border border-dashed border-[var(--border-default)] px-5 py-4"
        data-state="pending"
        role="status"
        aria-label={emptyTitle}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="type-h4 text-[var(--text-primary)]">{emptyTitle}</p>
          <span className="socideas-badge" data-tone="draft">
            <span aria-hidden="true" className="socideas-badge__dot" />
            Sin datos
          </span>
        </div>
        <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--text-secondary)]">{emptyDescription}</p>
      </div>
    );
  }
  const cols = kpis.length === 1 ? "sm:grid-cols-1" : kpis.length === 2 ? "sm:grid-cols-2" : kpis.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-4";
  return (
    <div className={`mt-6 ${FIGURE_ROW} ${cols}`}>
      {kpis.map((k) => (
        <div key={k.etiqueta} className={FIGURE}>
          <p className={FIGURE_VALUE}>{k.valor}</p>
          <p className={FIGURE_LABEL}>{k.etiqueta}</p>
          {k.detalle && <p className={FIGURE_DETAIL}>{k.detalle}</p>}
          {k.estado && k.estado !== "available" && (
            <p className="mt-1.5 text-xs font-medium text-[var(--text-secondary)]">
              {AVAILABILITY_LABEL[k.estado]}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
