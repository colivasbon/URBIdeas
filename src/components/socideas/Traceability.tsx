import type { IndicatorValue } from "@/lib/socideas";

interface Props {
  valores: IndicatorValue[];
  pendientes?: string[];
  /** Resumen dinámico de la vista actual (período, ámbitos, avisos). */
  vista?: string[];
}

// Bloque de trazabilidad: organismo, tabla, año, consulta y avisos.
export default function Traceability({ valores, pendientes, vista }: Props) {
  const vistos = new Map<string, IndicatorValue>();
  for (const v of valores) {
    const key = `${v.source_id}|${v.anio_referencia}`;
    if (!vistos.has(key)) vistos.set(key, v);
  }
  const fuentes = [...vistos.values()];
  return (
    <section aria-label="Trazabilidad de los datos" className="premium-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="editorial-eyebrow">Trazabilidad</p>
      </div>
      <h2 className="mt-2 text-base font-bold text-[var(--color-text-primary)]">Fuentes y consulta</h2>
      {vista && vista.length > 0 && (
        <ul className="mt-3 rounded-[6px] bg-[var(--color-input-bg)] p-4 text-sm text-[var(--color-text-secondary)]">
          {vista.map((v) => (
            <li key={v} className="mb-1 last:mb-0">· {v}</li>
          ))}
        </ul>
      )}
      {fuentes.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">Sin valores sincronizados.</p>
      ) : (
        <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          {fuentes.map((v) => (
            <div key={`${v.source_id}-${v.anio_referencia}`} className="border-b border-[var(--color-border-subtle)] pb-3">
              <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                {(v.source as unknown as { organismo?: string } | undefined)?.organismo ?? "Fuente oficial"}
              </dt>
              <dd className="mt-1 text-[var(--color-text-secondary)]">
                {(v.source as unknown as { nombre?: string } | undefined)?.nombre ?? ""}
                {v.source_table_id ? ` · Tabla ${v.source_table_id}` : ""}
              </dd>
              <dd className="text-xs text-[var(--color-text-muted)]">
                Año {v.anio_referencia} · Consultado el{" "}
                {new Date(v.obtenido_en).toLocaleDateString("es-ES")}
                {v.source_series_id ? ` · Serie ${v.source_series_id}` : ""}
              </dd>
              {v.source_url && (
                <dd className="mt-1">
                  <a
                    href={v.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-[var(--color-secondary)] hover:text-[var(--color-secondary-light)]"
                  >
                    Ver consulta reproducible en el INE
                  </a>
                </dd>
              )}
            </div>
          ))}
        </dl>
      )}
      {pendientes && pendientes.length > 0 && (
        <div className="mt-4 rounded-[6px] bg-[var(--color-input-bg)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Limitaciones de cobertura
          </p>
          <ul className="mt-2 list-disc pl-5 text-sm text-[var(--color-text-secondary)]">
            {pendientes.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-4 text-xs text-[var(--color-text-muted)]">
        Los indicadores de años distintos no deben presentarse como contemporáneos.
        Para validez administrativa, acuda a la fuente oficial.
      </p>
    </section>
  );
}
