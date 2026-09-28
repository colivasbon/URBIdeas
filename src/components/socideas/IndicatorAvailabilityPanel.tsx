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
  const resumen = groups.map((g) => `${COVERAGE_GROUP_LABEL[g.estado]}: ${g.items.length}`).join("; ");
  return (
    <section aria-label={heading} className="border-t border-[var(--border-subtle)] py-10">
      <h2 className="type-h3 text-[var(--text-primary)]">{heading}</h2>
      <p className="mt-2 max-w-[70ch] text-sm text-[var(--text-secondary)]" role="status">
        {resumen}. La ausencia de dato nunca equivale a cero.
      </p>
      <details className="mt-5" open={entries.length <= 3}>
        <summary className="cursor-pointer text-sm font-medium text-[var(--text-link)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]">
          Ver detalle de cobertura ({entries.length})
        </summary>
        <div className="mt-5 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
          {groups.map((g) => (
            <div key={g.estado}>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {COVERAGE_GROUP_LABEL[g.estado]}
              </p>
              <ul className="mt-2">
                {g.items.map((e) => (
                  <li key={e.titulo} className="border-t border-[var(--border-subtle)] py-3">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{e.titulo}</p>
                    <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-secondary)]">{e.detalle}</p>
                    {(e.fuente || e.periodo) && (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {[e.fuente, e.periodo].filter(Boolean).join(", ")}
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
