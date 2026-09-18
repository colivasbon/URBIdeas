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
import type {
  MigrationFlowGroup,
  MigrationPresentationData,
} from "@/lib/socideas-migration-summary";

function fmt(n: number | null): string {
  return n === null ? "ND" : n.toLocaleString("es-ES");
}

function signed(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toLocaleString("es-ES")}`;
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
      <p role="status" className="rounded-[6px] border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)] px-4 py-3 text-xs text-[var(--color-text-muted)]">
        Dato no publicado por secreto estadístico.
      </p>
    );
  }
  if (estado === "missing") {
    return (
      <p role="status" className="rounded-[6px] border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)] px-4 py-3 text-xs text-[var(--color-text-muted)]">
        Información no disponible para este municipio.
      </p>
    );
  }
  return (
    <p role="status" className="rounded-[6px] border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)] px-4 py-3 text-xs text-[var(--color-text-muted)]">
      Cobertura parcial; consultar fuente y período.
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
        className="flex h-3.5 w-full overflow-hidden rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)]"
        role="img"
        aria-label={aria}
      >
        {male !== null && male > 0 && (
          <div className="h-full bg-[var(--color-primary)]" style={{ width: `${pMale}%` }} />
        )}
        {female !== null && female > 0 && (
          <div className="h-full bg-[var(--color-secondary)]" style={{ width: `${pFemale}%` }} />
        )}
      </div>
      <dl className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-[var(--color-primary)]" />
          <dt className="text-[var(--color-text-muted)]">Hombres</dt>
          <dd className="font-semibold tabular-nums text-[var(--color-text-primary)]">{fmt(male)}</dd>
        </div>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-[var(--color-secondary)]" />
          <dt className="text-[var(--color-text-muted)]">Mujeres</dt>
          <dd className="font-semibold tabular-nums text-[var(--color-text-primary)]">{fmt(female)}</dd>
        </div>
      </dl>
    </div>
  );
}

function FlowCard({ group }: { group: MigrationFlowGroup }) {
  const hasAny = group.total !== null || group.male !== null || group.female !== null;
  return (
    <article className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-card-bg)] p-4 shadow-[var(--shadow-premium-sm)]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-bold text-[var(--color-text-primary)]">{group.label}</h3>
        <span className="font-mono text-xs tabular-nums text-[var(--color-text-muted)]">
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
            <p className="data-card__value leading-none">{fmt(group.total)}</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
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
      <h3 className="ideas-h2 mb-1">Saldo intermunicipal</h3>
      <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-secondary)]">
        Inmigración intermunicipal − Emigración intermunicipal (tablas INE 69743 y 69746).
      </p>
      {saldo !== null ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            etiqueta="Saldo intermunicipal"
            valor={signed(saldo)}
            detalle={`Inmigración ${fmt(inm)} − Emigración ${fmt(emi)}`}
          />
          <StatCard etiqueta="Inmigración" valor={fmt(inm)} detalle={`INE · Tabla 69743 · ${data.period}`} />
          <StatCard etiqueta="Emigración" valor={fmt(emi)} detalle={`INE · Tabla 69746 · ${data.period}`} />
        </div>
      ) : (
        <p
          role="status"
          className="rounded-[6px] border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)] px-4 py-3 text-xs text-[var(--color-text-muted)]"
        >
          No se calcula el saldo: falta el total de alguno de los dos flujos intermunicipales.
        </p>
      )}
      <p className="mt-3 text-xs text-[var(--color-text-muted)]">
        Saldo derivado — cálculo propio SOCideas sobre flujos oficiales del INE; no es un saldo
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
    <section aria-label="Flujos migratorios" className="mb-10">
      <h2 className="ideas-h2">Flujos migratorios</h2>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Emigración al extranjero e intermunicipal · INE · {data.period}
      </p>
      {groups.length === 0 ? (
        <div className="mt-4">
          <EstadoLinea estado={data.status} />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {groups.map((g) => (
            <FlowCard key={g.source.tableId} group={g} />
          ))}
        </div>
      )}
      {hasIntermunicipal && <SaldoIntermunicipal data={data} />}
      <p className="mt-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
        La ausencia de dato se muestra como ND; nunca como 0. Las barras comparan hombres y mujeres
        dentro de cada flujo, no flujos entre sí.
      </p>
    </section>
  );
}
