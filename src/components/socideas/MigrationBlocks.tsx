// Bloque de flujos migratorios: emigración al extranjero (69711),
// inmigración intermunicipal (69743) y emigración intermunicipal (69746).
// Presentacional, sin datos propios ni animaciones (reduced motion por
// construcción). Sin filtros, sin tablas largas, sin iconografía decorativa.
// Replica el patrón de DemographicBlocks (nacionalidad/nacimiento/arraigo)
// sin modificarlo: mismos StatCard, mismos estados, misma trazabilidad.
import StatCard from "./StatCard";
import type {
  MigrationFlowGroup,
  MigrationPresentationData,
} from "@/lib/socideas-migration-summary";

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

function FlowGroup({ group }: { group: MigrationFlowGroup }) {
  const ok = group.status === "observed" && (group.total !== null || group.male !== null || group.female !== null);
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{group.label}</h3>
      {!ok ? (
        <div className="mt-3"><EstadoLinea estado={group.status} /></div>
      ) : (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            etiqueta="Total"
            valor={fmt(group.total)}
            detalle={`INE · Tabla ${group.source.tableId} · ${group.period}`}
          />
          <StatCard
            etiqueta="Hombres"
            valor={fmt(group.male)}
            detalle={`INE · Tabla ${group.source.tableId} · ${group.period}`}
          />
          <StatCard
            etiqueta="Mujeres"
            valor={fmt(group.female)}
            detalle={`INE · Tabla ${group.source.tableId} · ${group.period}`}
          />
        </div>
      )}
      <Trace label="Instituto Nacional de Estadística" tableId={group.source.tableId} period={group.period} />
    </div>
  );
}

export function FlujosMigratoriosBlock({ data }: { data: MigrationPresentationData }) {
  const groups = [data.emigrationAbroad, data.immigrationIntermunicipal, data.emigrationIntermunicipal].filter(
    (g): g is MigrationFlowGroup => !!g,
  );
  return (
    <section aria-label="Flujos migratorios" className="mb-10">
      <h2 className="ideas-h2">Flujos migratorios</h2>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Emigración al extranjero e intermunicipal · INE · {data.period}
      </p>
      {groups.length === 0 ? (
        <div className="mt-4"><EstadoLinea estado={data.status} /></div>
      ) : (
        groups.map((g) => <FlowGroup key={g.source.tableId} group={g} />)
      )}
      <p className="mt-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
        La ausencia de dato se muestra como ND; nunca como 0.
      </p>
    </section>
  );
}
