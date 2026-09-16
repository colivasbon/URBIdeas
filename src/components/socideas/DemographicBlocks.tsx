// Bloques demográficos nuevos: nacionalidad, nacimiento y arraigo.
// Presentacionales, sin datos propios ni animaciones (reduced motion por
// construcción). Sin filtros, sin tablas largas, sin iconografía decorativa.
import StatCard from "./StatCard";
import type {
  ArraigoData,
  BirthCountryData,
  NationalityData,
} from "@/lib/socideas-demographic-summary";

function fmt(n: number | null): string {
  return n === null ? "ND" : n.toLocaleString("es-ES");
}

function Trace({ label, tableId, period }: { label: string; tableId: string; period: string }) {
  return (
    <p className="mt-3 text-xs text-[var(--color-text-muted)]">
      Fuente: {label} · Tabla {tableId} · {period}
    </p>
  );
}

function EstadoLinea({ estado }: { estado: string }) {
  if (estado === "suppressed") {
    return (
      <p role="status" className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)] px-4 py-3 text-xs text-[var(--color-text-muted)]">
        Dato no publicado por secreto estadístico.
      </p>
    );
  }
  if (estado === "missing") {
    return (
      <p role="status" className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)] px-4 py-3 text-xs text-[var(--color-text-muted)]">
        Información no disponible para este municipio.
      </p>
    );
  }
  return (
    <p role="status" className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)] px-4 py-3 text-xs text-[var(--color-text-muted)]">
      Cobertura parcial; consultar fuente y período.
    </p>
  );
}

function Barra({ etiqueta, valor, pct, color }: { etiqueta: string; valor: string; pct: number | null; color: string }) {
  return (
    <div>
      <div className="flex justify-between gap-3 text-sm">
        <span className="font-medium text-[var(--color-text-primary)]">{etiqueta}</span>
        <span className="tabular-nums text-[var(--color-text-secondary)]">{valor}</span>
      </div>
      <div className="mt-1 h-3 overflow-hidden rounded bg-[var(--color-input-bg)]" role="img" aria-label={`${etiqueta}: ${valor}`}>
        <div className="h-full rounded" style={{ width: `${pct ?? 0}%`, background: color }} />
      </div>
    </div>
  );
}

export function NacionalidadBlock({ data }: { data: NationalityData }) {
  const ok = data.status === "observed" && data.spanish !== null && data.foreign !== null && data.total !== null;
  return (
    <section aria-label="Nacionalidad" className="mb-10">
      <h2 className="ideas-h2">Nacionalidad</h2>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Población por nacionalidad · INE · {data.period}
      </p>
      {!ok ? (
        <div className="mt-4"><EstadoLinea estado={data.status} /></div>
      ) : (
        <div className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard
              etiqueta="Nacionalidad española"
              valor={fmt(data.spanish)}
              detalle={`${data.spanishPercent !== null ? `${data.spanishPercent.toLocaleString("es-ES")} % sobre total · ` : ""}INE · ${data.period}`}
            />
            <StatCard
              etiqueta="Nacionalidad extranjera"
              valor={fmt(data.foreign)}
              detalle={`${data.foreignPercent !== null ? `${data.foreignPercent.toLocaleString("es-ES")} % sobre total · ` : ""}INE · ${data.period}`}
            />
          </div>
          <div className="premium-card mt-4 p-5">
            <div className="flex flex-col gap-3">
              <Barra etiqueta="Española" valor={`${fmt(data.spanish)}${data.spanishPercent !== null ? ` · ${data.spanishPercent.toLocaleString("es-ES")} %` : ""}`} pct={data.spanishPercent} color="var(--color-primary)" />
              <Barra etiqueta="Extranjera" valor={`${fmt(data.foreign)}${data.foreignPercent !== null ? ` · ${data.foreignPercent.toLocaleString("es-ES")} %` : ""}`} pct={data.foreignPercent} color="var(--color-secondary)" />
            </div>
          </div>
        </div>
      )}
      <Trace label="Instituto Nacional de Estadística" tableId={data.source.tableId} period={data.period} />
    </section>
  );
}

export function NacimientoBlock({ data }: { data: BirthCountryData }) {
  const showSpain = data.spain !== null && data.spain.value !== null;
  const countries = data.topCountries.filter((c) => c.value !== null);
  // Magnitud relativa al máximo del propio ranking mostrado (no al total de
  // población ni a "Nacida en España"): el primer país (máximo) llena el 100 %.
  const maxCountry = countries.reduce<number>((m, c) => (c.value !== null && c.value > m ? c.value : m), 0);
  const empty = data.status !== "observed" || (!showSpain && countries.length === 0);
  return (
    <section aria-label="Lugar de nacimiento" className="mb-10">
      <h2 className="ideas-h2">Lugar de nacimiento</h2>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Principales países de nacimiento publicados · INE · {data.period}
      </p>
      {empty ? (
        <div className="mt-4"><EstadoLinea estado={data.status} /></div>
      ) : (
        <div className="mt-4">
          {showSpain && data.spain && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <StatCard
                etiqueta={`Nacida en ${data.spain.label}`}
                valor={fmt(data.spain.value)}
                detalle={`INE · ${data.period}`}
              />
            </div>
          )}
          {countries.length > 0 && (
            <div className="premium-card mt-4 p-5">
              <div className="flex flex-col gap-3">
                {countries.map((c) => {
                  const pct = c.value !== null && maxCountry > 0 ? Math.round((c.value / maxCountry) * 1000) / 10 : null;
                  return <Barra key={c.label} etiqueta={c.label} valor={fmt(c.value)} pct={pct} color="var(--color-primary)" />;
                })}
              </div>
            </div>
          )}
          <p className="mt-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
            La tabla recoge categorías de país publicadas por el INE; no equivale a una
            distribución completa de población nacida en el extranjero.
          </p>
        </div>
      )}
      <Trace label="Instituto Nacional de Estadística" tableId={data.source.tableId} period={data.period} />
    </section>
  );
}

const ARRAIGO_TONES = [
  "var(--color-primary)",
  "var(--color-secondary)",
  "color-mix(in srgb, var(--color-primary) 65%, var(--color-input-bg))",
  "color-mix(in srgb, var(--color-primary) 40%, var(--color-input-bg))",
  "color-mix(in srgb, var(--color-text-muted) 55%, transparent)",
];

export function ArraigoBlock({ data }: { data: ArraigoData }) {
  const cats = data.categories.filter((c) => c.value !== null);
  const total = data.total;
  const ok = data.status === "observed" && total !== null && cats.length === 5;
  const sumaPct = ok ? cats.reduce((a, c) => a + (c.percent ?? 0), 0) : null;
  return (
    <section aria-label="Arraigo territorial" className="mb-10">
      <h2 className="ideas-h2">Arraigo territorial</h2>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Relación entre lugar de nacimiento y residencia · INE · {data.period}
      </p>
      {!ok ? (
        <div className="mt-4"><EstadoLinea estado={data.status} /></div>
      ) : (
        <div className="mt-4">
          <div className="premium-card p-5">
            <div className="flex h-4 w-full overflow-hidden rounded" role="img" aria-label={`Distribución de arraigo sobre ${fmt(total)} personas`}>
              {cats.map((c, i) => (
                <div key={c.key} title={`${c.label}: ${fmt(c.value)}`} style={{ width: `${c.percent ?? 0}%`, background: ARRAIGO_TONES[i % ARRAIGO_TONES.length] }} />
              ))}
            </div>
            <ul className="mt-4 flex flex-col gap-2.5">
              {cats.map((c) => (
                <li key={c.key} className="flex justify-between gap-3 text-sm">
                  <span className="text-[var(--color-text-primary)]">{c.label}</span>
                  <span className="tabular-nums text-[var(--color-text-secondary)]">
                    {fmt(c.value)}{c.percent !== null ? ` · ${c.percent.toLocaleString("es-ES")} %` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {sumaPct !== null && (
              <p className="mt-3 text-xs tabular-nums text-[var(--color-text-muted)]">
                Suma de categorías: {sumaPct.toLocaleString("es-ES")} % del total publicado ({fmt(total)}).
              </p>
            )}
          </div>
        </div>
      )}
      <Trace label="Instituto Nacional de Estadística" tableId={data.source.tableId} period={data.period} />
    </section>
  );
}
