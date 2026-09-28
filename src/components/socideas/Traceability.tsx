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
    <section aria-label="Trazabilidad de los datos" className="border-t border-[var(--border-subtle)] py-10">
      <h2 className="type-h3 text-[var(--text-primary)]">Trazabilidad: fuentes y consulta</h2>
      {vista && vista.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-[var(--text-primary)]">Vista actual</p>
          <ul className="mt-2 max-w-[70ch] list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)] marker:text-[var(--text-muted)]">
            {vista.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        </div>
      )}
      {fuentes.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--text-muted)]">Sin valores sincronizados.</p>
      ) : (
        <dl className="mt-6 grid grid-cols-1 gap-x-10 text-sm sm:grid-cols-2">
          {fuentes.map((v) => (
            <div key={`${v.source_id}-${v.anio_referencia}`} className="border-t border-[var(--border-subtle)] py-3">
              <dt className="text-sm font-medium text-[var(--text-primary)]">
                {(v.source as unknown as { organismo?: string } | undefined)?.organismo ?? "Fuente oficial"}
              </dt>
              <dd className="mt-1 text-[var(--text-secondary)]">
                {(v.source as unknown as { nombre?: string } | undefined)?.nombre ?? ""}
                {v.source_table_id ? `, tabla ${v.source_table_id}` : ""}
              </dd>
              <dd className="mt-0.5 text-xs tabular-nums text-[var(--text-muted)]">
                Año {v.anio_referencia}. Consultado el{" "}
                {new Date(v.obtenido_en).toLocaleDateString("es-ES")}
                {v.source_series_id ? `. Serie ${v.source_series_id}` : ""}
              </dd>
              {v.source_url && (
                <dd className="mt-1">
                  <a
                    href={v.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] font-medium text-[var(--text-link)] underline underline-offset-2 hover:text-[var(--text-link-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]"
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
        <div className="mt-6">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Limitaciones de cobertura
          </p>
          <ul className="mt-2 max-w-[70ch] list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)] marker:text-[var(--text-muted)]">
            {pendientes.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-6 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">
        Los indicadores de años distintos no deben presentarse como contemporáneos.
        Para validez administrativa, acuda a la fuente oficial.
      </p>
    </section>
  );
}
