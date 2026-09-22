import type { IndicatorCatalogEntry } from "@/lib/socideas-indicator-catalog";
import { getIndicatorCatalogEntry } from "@/lib/socideas-indicator-catalog";

/**
 * Aviso breve y reutilizable de fuente/metodología. Solo se pinta cuando
 * explica una ausencia o una no-comparabilidad relevante (blocked_source,
 * missing_by_design, pending…): nunca recarga la interfaz ni fabrica valores.
 */
export default function SourceMethodologyNotice({
  slugs,
  entries,
  className = "",
}: {
  /** Slugs del catálogo a consultar (se ignoran los no presentes). */
  slugs?: string[];
  /** Entradas ya resueltas (tiene prioridad sobre `slugs`). */
  entries?: IndicatorCatalogEntry[];
  className?: string;
}) {
  const resolved = (entries ?? (slugs ?? []).map((s) => getIndicatorCatalogEntry(s)).filter((e): e is IndicatorCatalogEntry => e !== null)).filter(
    (e) => e.coverageStatus !== "available",
  );
  if (resolved.length === 0) return null;
  return (
    <div className={`space-y-2 ${className}`}>
      {resolved.map((e) => (
        <p
          key={e.slug}
          role="note"
          className="max-w-3xl rounded-[6px] border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)] px-4 py-3 text-xs leading-relaxed text-[var(--color-text-secondary)]"
        >
          <strong>{e.label} · {e.sourceName}.</strong>{" "}
          {e.coverageNotes ?? e.missingReason}
          {e.period ? <> Periodo: {e.period}.</> : null}
        </p>
      ))}
    </div>
  );
}
