// Bloque de flujos migratorios: emigración al extranjero (69711),
// inmigración intermunicipal (69743) y emigración intermunicipal (69746).
// Presentacional, sin datos propios ni animaciones (reduced motion por
// construcción). Sin filtros, sin tablas largas, sin iconografía decorativa.
//
// Representación (rediseño): en lugar de tres tarjetas idénticas por flujo
// (Total/Hombres/Mujeres), cada flujo ocupa una tarjeta con su total y una barra
// proporcional por sexo; y se añade, cuando ambos flujos intermunicipales están
// publicados, el saldo intermunicipal como indicador DERIVADO explícitamente
// etiquetado como cálculo SOCideas (nunca como dato oficial).
import StatCard from "./StatCard";
import { CHART } from "./ficha-ui";
import type {
  MigrationFlowGroup,
  MigrationPresentationData,
} from "@/lib/socideas-migration-summary";
import type { MigrationBalancePresentation } from "@/lib/socideas-migration-balances";

function fmt(n: number | null): string {
  return n === null ? "ND" : n.toLocaleString("es-ES");
}

function signed(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toLocaleString("es-ES")}`;
}

function Trace({ label, tableId, period }: { label: string; tableId: string; period: string }) {
  return (
    <p className="mt-4 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">
      Fuente: {label}, tabla {tableId}. Periodo: <span className="tabular-nums">{period}</span>.
    </p>
  );
}

function EstadoLinea({ estado }: { estado: string }) {
  if (estado === "suppressed") {
    return (
      <p role="status" className="max-w-[70ch] rounded-[6px] border border-dashed border-[var(--border-default)] px-4 py-3 text-sm leading-relaxed text-[var(--text-secondary)]">
        Dato no publicado por secreto estadístico: la fuente no lo difunde para este municipio.
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

/** Barra horizontal proporcional por sexo. Escala al mayor valor observado
 *  (no inventa un total si la fuente no lo publica). */
function SexBar({
  label,
  male,
  female,
}: {
  label: string;
  male: number | null;
  female: number | null;
}) {
  const max = Math.max(male ?? 0, female ?? 0, 1);
  const pMale = ((male ?? 0) / max) * 100;
  const pFemale = ((female ?? 0) / max) * 100;
  const aria = `Composición por sexo de ${label}: hombres ${fmt(male)}, mujeres ${fmt(female)}`;
  return (
    <div className="min-w-0">
      <div
        className="flex h-3 w-full gap-px overflow-hidden bg-[var(--bg-surface-sunken)]"
        role="img"
        aria-label={aria}
      >
        {male !== null && male > 0 && (
          <div className="h-full" style={{ width: `${pMale}%`, background: CHART.hombres }} />
        )}
        {female !== null && female > 0 && (
          <div className="h-full" style={{ width: `${pFemale}%`, background: CHART.mujeres }} />
        )}
      </div>
      <dl className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2.5 w-2.5" style={{ background: CHART.hombres }} />
          <dt className="text-[var(--text-muted)]">Hombres</dt>
          <dd className="font-semibold tabular-nums text-[var(--text-primary)]">{fmt(male)}</dd>
        </div>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2.5 w-2.5" style={{ background: CHART.mujeres }} />
          <dt className="text-[var(--text-muted)]">Mujeres</dt>
          <dd className="font-semibold tabular-nums text-[var(--text-primary)]">{fmt(female)}</dd>
        </div>
      </dl>
    </div>
  );
}

function FlowCard({ group }: { group: MigrationFlowGroup }) {
  const hasAny = group.total !== null || group.male !== null || group.female !== null;
  return (
    <article className="min-w-0 border-t border-[var(--border-strong)] pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{group.label}</h3>
        <span className="text-xs tabular-nums text-[var(--text-muted)]">
          {group.period}
        </span>
      </div>
      {!hasAny ? (
        <div className="mt-3">
          <EstadoLinea estado={group.status} />
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="shrink-0">
            <p className="type-h3 tnum font-semibold text-[var(--text-primary)]">{fmt(group.total)}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Personas
            </p>
          </div>
          <div className="min-w-[180px] flex-1">
            <SexBar label={group.label} male={group.male} female={group.female} />
          </div>
        </div>
      )}
      <Trace
        label="Instituto Nacional de Estadística"
        tableId={group.source.tableId}
        period={group.period}
      />
    </article>
  );
}

/** Saldo intermunicipal derivado: inmigración − emigración. Solo se calcula si
 *  ambos totales están publicados; se etiqueta siempre como cálculo SOCideas. */
function SaldoIntermunicipal({ data }: { data: MigrationPresentationData }) {
  const inm = data.immigrationIntermunicipal?.total ?? null;
  const emi = data.emigrationIntermunicipal?.total ?? null;
  const saldo = inm !== null && emi !== null ? inm - emi : null;
  return (
    <div className="mt-8">
      <h3 className="type-h4 text-[var(--text-primary)]">Saldo intermunicipal</h3>
      <p className="mb-5 mt-1 max-w-[70ch] text-sm leading-relaxed text-[var(--text-secondary)]">
        Inmigración intermunicipal menos emigración intermunicipal (tablas INE 69743 y 69746).
      </p>
      {saldo !== null ? (
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-3">
          <StatCard
            etiqueta="Saldo intermunicipal"
            valor={signed(saldo)}
            detalle={`Inmigración ${fmt(inm)} − Emigración ${fmt(emi)}`}
          />
          <StatCard etiqueta="Inmigración" valor={fmt(inm)} detalle={`INE, tabla 69743, ${data.period}`} />
          <StatCard etiqueta="Emigración" valor={fmt(emi)} detalle={`INE, tabla 69746, ${data.period}`} />
        </div>
      ) : (
        <p
          role="status"
          className="max-w-[70ch] rounded-[6px] border border-dashed border-[var(--border-default)] px-4 py-3 text-sm leading-relaxed text-[var(--text-secondary)]"
        >
          No se calcula el saldo: falta el total de alguno de los dos flujos intermunicipales.
        </p>
      )}
      <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">
        Saldo derivado: cálculo propio SOCideas sobre flujos oficiales del INE; no es un saldo
        migratorio publicado como tal por la fuente.
      </p>
    </div>
  );
}

export function FlujosMigratoriosBlock({ data }: { data: MigrationPresentationData }) {
  const groups = [data.emigrationAbroad, data.immigrationIntermunicipal, data.emigrationIntermunicipal].filter(
    (g): g is MigrationFlowGroup => !!g,
  );
  const hasIntermunicipal = !!data.immigrationIntermunicipal || !!data.emigrationIntermunicipal;
  return (
    <section aria-label="Flujos migratorios" className="border-t border-[var(--border-subtle)] py-10">
      <h2 className="type-h3 text-[var(--text-primary)]">Flujos migratorios</h2>
      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--text-secondary)]">
        Emigración al extranjero, inmigración y emigración intermunicipal del municipio.
      </p>
      {groups.length === 0 ? (
        <div className="mt-4">
          <EstadoLinea estado={data.status} />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-8 lg:grid-cols-3">
          {groups.map((g) => (
            <FlowCard key={g.source.tableId} group={g} />
          ))}
        </div>
      )}
      {hasIntermunicipal && <SaldoIntermunicipal data={data} />}
      <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">
        La ausencia de dato se muestra como ND; nunca como 0. Las barras comparan hombres y mujeres
        dentro de cada flujo, no flujos entre sí.
      </p>
    </section>
  );
}

// ── Saldo migratorio neto (INE 69767) — complementario a los flujos ──

function fmtSigned(n: number | null): string {
  return n === null ? "ND" : `${n > 0 ? "+" : ""}${n.toLocaleString("es-ES")}`;
}

function BalanceCard({
  label,
  value,
  period,
  tableId,
}: {
  label: string;
  value: number | null;
  period: string;
  tableId: string;
}) {
  return (
    <article className="min-w-0 border-t border-[var(--border-strong)] pt-3">
      <p className="type-h3 tnum font-semibold text-[var(--text-primary)]">{fmtSigned(value)}</p>
      <h3 className="mt-1 text-sm text-[var(--text-secondary)]">{label} (personas, neto)</h3>
      <Trace label="Instituto Nacional de Estadística" tableId={tableId} period={period} />
    </article>
  );
}

/**
 * Bloque "Saldo migratorio neto": saldo total / exterior / interior (69767) y
 * desglose por sexo. Separado explícitamente de "Flujos migratorios": el saldo
 * es la diferencia neta, no el número de movimientos. ND nunca es 0.
 */
export function SaldosMigratoriosBlock({ data }: { data: MigrationBalancePresentation }) {
  const hasData =
    data.total.value !== null || data.interior.value !== null || data.exterior.value !== null;
  return (
    <section aria-label="Saldo migratorio neto" className="border-t border-[var(--border-subtle)] py-10">
      <h2 className="type-h3 text-[var(--text-primary)]">Saldo migratorio neto</h2>
      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--text-secondary)]">
        Diferencia neta entre entradas y salidas de población del municipio.
      </p>
      {!hasData ? (
        <div className="mt-4">
          <EstadoLinea estado={data.status} />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-3">
          <BalanceCard label="Saldo total" value={data.total.value} period={data.period} tableId={data.tableId} />
          <BalanceCard label="Saldo exterior" value={data.exterior.value} period={data.period} tableId={data.tableId} />
          <BalanceCard label="Saldo interior" value={data.interior.value} period={data.period} tableId={data.tableId} />
        </div>
      )}
      {data.bySex && (
        <div className="mt-8 max-w-sm">
          <article>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Saldo total por sexo</h3>
            <dl className="mt-2 text-sm">
              <div className="flex items-baseline justify-between gap-3 border-t border-[var(--border-subtle)] py-2">
                <dt className="text-[var(--text-secondary)]">Hombres</dt>
                <dd className="font-semibold tabular-nums text-[var(--text-primary)]">
                  {fmtSigned(data.bySex.male.total.value)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-[var(--border-subtle)] py-2">
                <dt className="text-[var(--text-secondary)]">Mujeres</dt>
                <dd className="font-semibold tabular-nums text-[var(--text-primary)]">
                  {fmtSigned(data.bySex.female.total.value)}
                </dd>
              </div>
            </dl>
          </article>
        </div>
      )}
      <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">
        El saldo es la diferencia neta entre entradas y salidas; no es el número total de movimientos.
        Los flujos migratorios se muestran en el bloque anterior.
      </p>
    </section>
  );
}
