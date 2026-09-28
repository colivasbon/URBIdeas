// Bloques demográficos nuevos: nacionalidad, nacimiento y arraigo.
// Presentacionales, sin datos propios ni animaciones (reduced motion por
// construcción). Sin filtros, sin tablas largas, sin iconografía decorativa.
import StatCard from "./StatCard";
import { CHART, FIGURE_ROW, LEDE, MUSGO_SEQ, NOTE, SOURCE_NOTE } from "./ficha-ui";
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
    <p className={SOURCE_NOTE}>
      Fuente: {label}, tabla {tableId}. Periodo: <span className="tabular-nums">{period}</span>.
    </p>
  );
}

function EstadoLinea({ estado }: { estado: string }) {
  if (estado === "suppressed") {
    return (
      <p role="status" className="max-w-[70ch] rounded-[6px] border border-dashed border-[var(--border-default)] px-4 py-3 text-sm leading-relaxed text-[var(--text-secondary)]">
        Dato no publicado por secreto estadístico: el INE no lo difunde para este municipio.
      </p>
    );
  }
  if (estado === "missing") {
    return (
      <p role="status" className="max-w-[70ch] rounded-[6px] border border-dashed border-[var(--border-default)] px-4 py-3 text-sm leading-relaxed text-[var(--text-secondary)]">
        La fuente no publica este dato para este municipio.
      </p>
    );
  }
  return (
    <p role="status" className="max-w-[70ch] rounded-[6px] border border-dashed border-[var(--border-default)] px-4 py-3 text-sm leading-relaxed text-[var(--text-secondary)]">
      Cobertura parcial: consulte la fuente y el período antes de usar el dato.
    </p>
  );
}

function Barra({ etiqueta, valor, pct, color }: { etiqueta: string; valor: string; pct: number | null; color: string }) {
  return (
    <div>
      <div className="flex justify-between gap-3 text-sm">
        <span className="font-medium text-[var(--text-primary)]">{etiqueta}</span>
        <span className="tabular-nums text-[var(--text-secondary)]">{valor}</span>
      </div>
      <div className="mt-1 h-3 overflow-hidden bg-[var(--bg-surface-sunken)]" role="img" aria-label={`${etiqueta}: ${valor}`}>
        <div className="h-full" style={{ width: `${pct ?? 0}%`, background: color }} />
      </div>
    </div>
  );
}

export function NacionalidadBlock({ data }: { data: NationalityData }) {
  const ok = data.status === "observed" && data.spanish !== null && data.foreign !== null && data.total !== null;
  return (
    <section aria-label="Nacionalidad" className="border-t border-[var(--border-subtle)] py-10">
      <h2 className="type-h3 text-[var(--text-primary)]">Nacionalidad</h2>
      <p className={LEDE}>Población empadronada según nacionalidad española o extranjera.</p>
      {!ok ? (
        <div className="mt-4"><EstadoLinea estado={data.status} /></div>
      ) : (
        <div className="mt-4">
          <div className={`${FIGURE_ROW} sm:grid-cols-2`}>
            <StatCard
              etiqueta="Nacionalidad española"
              valor={fmt(data.spanish)}
              detalle={`${data.spanishPercent !== null ? `${data.spanishPercent.toLocaleString("es-ES")} % sobre el total. ` : ""}INE, ${data.period}`}
            />
            <StatCard
              etiqueta="Nacionalidad extranjera"
              valor={fmt(data.foreign)}
              detalle={`${data.foreignPercent !== null ? `${data.foreignPercent.toLocaleString("es-ES")} % sobre el total. ` : ""}INE, ${data.period}`}
            />
          </div>
          <div className="mt-8 max-w-[48rem]">
            <div className="flex flex-col gap-3">
              <Barra etiqueta="Española" valor={`${fmt(data.spanish)}${data.spanishPercent !== null ? ` (${data.spanishPercent.toLocaleString("es-ES")} %)` : ""}`} pct={data.spanishPercent} color={CHART.municipio} />
              <Barra etiqueta="Extranjera" valor={`${fmt(data.foreign)}${data.foreignPercent !== null ? ` (${data.foreignPercent.toLocaleString("es-ES")} %)` : ""}`} pct={data.foreignPercent} color={CHART.ccaa} />
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
    <section aria-label="Lugar de nacimiento" className="border-t border-[var(--border-subtle)] py-10">
      <h2 className="type-h3 text-[var(--text-primary)]">Lugar de nacimiento</h2>
      <p className={LEDE}>Principales países de nacimiento publicados por el INE para el municipio.</p>
      {empty ? (
        <div className="mt-4"><EstadoLinea estado={data.status} /></div>
      ) : (
        <div className="mt-4">
          {showSpain && data.spain && (
            <div className={`${FIGURE_ROW} sm:grid-cols-2`}>
              <StatCard
                etiqueta={`Nacida en ${data.spain.label}`}
                valor={fmt(data.spain.value)}
                detalle={`INE, ${data.period}`}
              />
            </div>
          )}
          {countries.length > 0 && (
            <div className="mt-8 max-w-[48rem]">
              <div className="flex flex-col gap-3">
                {countries.map((c) => {
                  const pct = c.value !== null && maxCountry > 0 ? Math.round((c.value / maxCountry) * 1000) / 10 : null;
                  return <Barra key={c.label} etiqueta={c.label} valor={fmt(c.value)} pct={pct} color={CHART.municipio} />;
                })}
              </div>
            </div>
          )}
          <p className={NOTE}>
            La tabla recoge categorías de país publicadas por el INE; no equivale a una
            distribución completa de población nacida en el extranjero.
          </p>
        </div>
      )}
      <Trace label="Instituto Nacional de Estadística" tableId={data.source.tableId} period={data.period} />
    </section>
  );
}

const ARRAIGO_TONES = MUSGO_SEQ;

export function ArraigoBlock({ data }: { data: ArraigoData }) {
  const cats = data.categories.filter((c) => c.value !== null);
  const total = data.total;
  const ok = data.status === "observed" && total !== null && cats.length === 5;
  const sumaPct = ok ? cats.reduce((a, c) => a + (c.percent ?? 0), 0) : null;
  return (
    <section aria-label="Arraigo territorial" className="border-t border-[var(--border-subtle)] py-10">
      <h2 className="type-h3 text-[var(--text-primary)]">Arraigo territorial</h2>
      <p className={LEDE}>Relación entre el lugar de nacimiento y el de residencia de la población.</p>
      {!ok ? (
        <div className="mt-4"><EstadoLinea estado={data.status} /></div>
      ) : (
        <div className="mt-4">
          <div className="max-w-[48rem]">
            <div className="flex h-4 w-full gap-px overflow-hidden bg-[var(--bg-canvas)]" role="img" aria-label={`Distribución de arraigo sobre ${fmt(total)} personas`}>
              {cats.map((c, i) => (
                <div key={c.key} title={`${c.label}: ${fmt(c.value)}`} style={{ width: `${c.percent ?? 0}%`, background: ARRAIGO_TONES[i % ARRAIGO_TONES.length] }} />
              ))}
            </div>
            <ul className="mt-4 flex flex-col">
              {cats.map((c, i) => (
                <li key={c.key} className="flex justify-between gap-3 border-t border-[var(--border-subtle)] py-2 text-sm">
                  <span className="inline-flex items-center gap-2 text-[var(--text-primary)]">
                    <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0" style={{ background: ARRAIGO_TONES[i % ARRAIGO_TONES.length] }} />
                    {c.label}
                  </span>
                  <span className="tabular-nums text-[var(--text-secondary)]">
                    {fmt(c.value)}{c.percent !== null ? ` (${c.percent.toLocaleString("es-ES")} %)` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {sumaPct !== null && (
              <p className="mt-3 text-xs tabular-nums text-[var(--text-muted)]">
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
