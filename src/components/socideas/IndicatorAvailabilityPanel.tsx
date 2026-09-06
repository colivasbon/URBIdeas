import {
  COVERAGE_GROUP_LABEL,
  groupCoverage,
  type CoverageEntry,
} from "@/lib/socideas-availability";

/** Panel final discreto: cobertura, límites y próximos datos. Sin números falsos. */
export default function IndicatorAvailabilityPanel({
  entries,
  heading = "Cobertura, límites y próximos datos",
}: {
  entries: CoverageEntry[];
  heading?: string;
}) {
  if (entries.length === 0) return null;
  const groups = groupCoverage(entries);
  const resumen = groups.map((g) => `${COVERAGE_GROUP_LABEL[g.estado]}: ${g.items.length}`).join(" · ");
  return (
    <section aria-label={heading} className="ideas-section">
      <h2 className="ideas-h2">{heading}</h2>
      <p className="mt-2 text-xs text-[var(--color-text-muted)]" role="status">
        {resumen}. La ausencia de dato nunca equivale a cero.
      </p>
      <details className="premium-card mt-3 p-5" open={entries.length <= 3}>
        <summary className="cursor-pointer text-sm font-semibold text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]">
          Ver detalle de cobertura ({entries.length})
        </summary>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g.estado}>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                {COVERAGE_GROUP_LABEL[g.estado]}
              </p>
              <ul className="mt-2 space-y-2">
                {g.items.map((e) => (
                  <li
                    key={e.titulo}
                    className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)] px-3.5 py-3"
                  >
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">{e.titulo}</p>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">{e.detalle}</p>
                    {(e.fuente || e.periodo) && (
                      <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                        {[e.fuente, e.periodo].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
