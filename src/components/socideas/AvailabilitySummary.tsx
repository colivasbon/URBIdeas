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
    <div
      className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-muted)]"
      role="status"
      aria-label={`Disponibilidad del bloque ${bloque}`}
    >
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-input-bg)] px-3 py-1 font-semibold text-[var(--color-text-secondary)]">
        <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
        {partes.join(" · ")}
        {periodo ? ` · Periodo ${periodo}` : ""}
      </span>
      {fuentes?.map((f) => (
        <span key={f} className="inline-flex items-center rounded-full border border-[var(--color-border-subtle)] px-3 py-1">
          {f}
        </span>
      ))}
    </div>
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
        className="ideas-status mt-4"
        data-state="pending"
        role="status"
        aria-label={emptyTitle}
      >
        <div className="ideas-status__head">
          <p className="ideas-status__title">{emptyTitle}</p>
          <span className="ideas-status__badge">Sin datos</span>
        </div>
        <div className="ideas-status__body">
          <p>{emptyDescription}</p>
        </div>
      </div>
    );
  }
  const cols = kpis.length === 1 ? "sm:grid-cols-1" : kpis.length === 2 ? "sm:grid-cols-2" : kpis.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-4";
  return (
    <div className={`mt-4 grid grid-cols-1 gap-4 ${cols}`}>
      {kpis.map((k) => (
        <div key={k.etiqueta} className="data-card">
          <p className="data-card__label">{k.etiqueta}</p>
          <p className="data-card__value">{k.valor}</p>
          {k.detalle && <p className="data-card__detail">{k.detalle}</p>}
          {k.estado && k.estado !== "available" && (
            <p className="mt-1.5 inline-flex rounded-full bg-[var(--color-input-bg)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-text-secondary)]">
              {AVAILABILITY_LABEL[k.estado]}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
