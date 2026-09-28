// Bloques de mercado de trabajo: paro registrado (SEPE) y afiliación (TGSS).
// Presentacionales, sin datos propios ni animaciones (reduced motion por
// construcción). Sin filtros, sin tablas largas, sin iconografía decorativa.
// Replica el patrón de DemographicBlocks/MigrationBlocks SIN modificarlos:
// mismos StatCard, mismos estados, misma trazabilidad, mismas clases del
// sistema compartido (NINGÚN estilo nuevo).
//
// INTEGRADO en la ficha de Economía (EconomiaFicha, patrón
// FlujosMigratoriosBlock): se pintan solo con DTO no nulo; sin filas no hay
// bloque. Mercado de trabajo = Economía, nunca Demografía.
//
// Regla temporal: ambos bloques pintan la advertencia de dato MENSUAL; los
// años mensuales nunca se igualan a los bloques anuales. Ausencia = ND,
// nunca 0.
import StatCard from "./StatCard";
import { CHART } from "./ficha-ui";
import type {
  AfiliacionPresentationData,
  ParoPresentationData,
} from "@/lib/socideas-labor-summary";

function fmt(n: number | null): string {
  return n === null ? "ND" : n.toLocaleString("es-ES");
}

function Trace({ label, tableId, period }: { label: string; tableId: string; period: string }) {
  return (
    <p className="mt-4 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">
      Fuente: {label}, tabla {tableId}. Periodo: <span className="tabular-nums">{period}</span>.
    </p>
  );
}

function NotaMensual({ nota }: { nota: string }) {
  return (
    <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">
      {nota}
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

function WarningList({ warnings }: { warnings: { regla: string; detalle: string }[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="note mt-6 max-w-[70ch]" role="alert">
      <p className="font-medium text-[var(--text-primary)]">Advertencias de reconciliación</p>
      <ul className="mt-1 space-y-1">
        {warnings.map((w, i) => (
          <li key={i}>
            <span className="font-medium text-[var(--text-primary)]">{w.regla}:</span> {w.detalle}
          </li>
        ))}
      </ul>
    </div>
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

const SECTOR_LABELS: { clave: string; etiqueta: string }[] = [
  { clave: "agricultura", etiqueta: "Agricultura" },
  { clave: "industria", etiqueta: "Industria" },
  { clave: "construccion", etiqueta: "Construcción" },
  { clave: "servicios", etiqueta: "Servicios" },
  { clave: "sin_empleo_anterior", etiqueta: "Sin empleo anterior" },
];

const REGIMEN_LABELS: { clave: string; etiqueta: string }[] = [
  { clave: "general", etiqueta: "Régimen General" },
  { clave: "agrario", etiqueta: "S. E. Agrario" },
  { clave: "hogar", etiqueta: "S. E. Hogar" },
  { clave: "mar", etiqueta: "R. E. Mar" },
  { clave: "autonomos", etiqueta: "R. E. T. Autónomos" },
  { clave: "carbon", etiqueta: "R. E. Minería del Carbón" },
];

const TRAMO_LABELS = ["Menores de 25", "De 25 a 45", "Mayores de 45"];

function pctOf(v: number | null, total: number | null): number | null {
  if (v === null || total === null || total <= 0) return null;
  return Math.round((v / total) * 1000) / 10;
}

export function ParoRegistradoBlock({ data }: { data: ParoPresentationData }) {
  const ok = (data.status === "observed" || data.status === "partial") && data.total !== null;
  const denomHM = (data.hombres.total ?? 0) + (data.mujeres.total ?? 0);
  return (
    <section aria-label="Paro registrado" className="border-t border-[var(--border-subtle)] py-10">
      <h2 className="type-h3 text-[var(--text-primary)]">Paro registrado</h2>
      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--text-secondary)]">
        Demandantes parados registrados en las oficinas de empleo, dato mensual.
      </p>
      <NotaMensual nota={data.notaTemporal} />
      {!ok ? (
        <div className="mt-4"><EstadoLinea estado={data.status} /></div>
      ) : (
        <div className="mt-4">
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-3">
            <StatCard etiqueta="Total" valor={fmt(data.total)} detalle={`SEPE, ${data.tableId}, ${data.etiquetaPeriodo}`} />
            <StatCard etiqueta="Hombres" valor={fmt(data.hombres.total)} detalle={`SEPE, ${data.tableId}, ${data.etiquetaPeriodo}`} />
            <StatCard etiqueta="Mujeres" valor={fmt(data.mujeres.total)} detalle={`SEPE, ${data.tableId}, ${data.etiquetaPeriodo}`} />
          </div>
          <div className="mt-8 grid max-w-[48rem] grid-cols-1 gap-3">
            <Barra
              etiqueta="Hombres"
              valor={`${fmt(data.hombres.total)}${pctOf(data.hombres.total, denomHM) !== null ? ` (${pctOf(data.hombres.total, denomHM)} %)` : ""}`}
              pct={pctOf(data.hombres.total, denomHM)}
              color={CHART.hombres}
            />
            <Barra
              etiqueta="Mujeres"
              valor={`${fmt(data.mujeres.total)}${pctOf(data.mujeres.total, denomHM) !== null ? ` (${pctOf(data.mujeres.total, denomHM)} %)` : ""}`}
              pct={pctOf(data.mujeres.total, denomHM)}
              color={CHART.mujeres}
            />
          </div>
          <h3 className="type-h4 mt-10 text-[var(--text-primary)]">Por sector de actividad</h3>
          <div className="mt-4 grid max-w-[48rem] grid-cols-1 gap-3">
            {SECTOR_LABELS.map((s) => {
              const v = data.sectores[s.clave as keyof typeof data.sectores] ?? null;
              return (
                <Barra
                  key={s.clave}
                  etiqueta={s.etiqueta}
                  valor={`${fmt(v)}${pctOf(v, data.total) !== null ? ` (${pctOf(v, data.total)} %)` : ""}`}
                  pct={pctOf(v, data.total)}
                  color={CHART.municipio}
                />
              );
            })}
          </div>
          <h3 className="type-h4 mt-10 text-[var(--text-primary)]">Por sexo y tramo de edad</h3>
          <div className="mt-4 grid max-w-[64rem] grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-[var(--text-secondary)]">Hombres</p>
              <div className="mt-2 grid grid-cols-1 gap-3">
                {TRAMO_LABELS.map((t, i) => (
                  <Barra key={t} etiqueta={t} valor={fmt(data.hombres.tramos[i] ?? null)} pct={pctOf(data.hombres.tramos[i] ?? null, data.hombres.total)} color={CHART.hombres} />
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--text-secondary)]">Mujeres</p>
              <div className="mt-2 grid grid-cols-1 gap-3">
                {TRAMO_LABELS.map((t, i) => (
                  <Barra key={t} etiqueta={t} valor={fmt(data.mujeres.tramos[i] ?? null)} pct={pctOf(data.mujeres.tramos[i] ?? null, data.mujeres.total)} color={CHART.mujeres} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <WarningList warnings={data.warnings} />
      <Trace label="Servicio Público de Empleo Estatal" tableId={data.tableId} period={data.etiquetaPeriodo} />
      <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">
        La ausencia de dato se muestra como ND; nunca como 0.
      </p>
    </section>
  );
}

export function AfiliacionBlock({ data }: { data: AfiliacionPresentationData }) {
  const ok = (data.status === "observed" || data.status === "partial") && data.total !== null;
  return (
    <section aria-label="Afiliación a la Seguridad Social" className="border-t border-[var(--border-subtle)] py-10">
      <h2 className="type-h3 text-[var(--text-primary)]">Afiliación a la Seguridad Social</h2>
      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--text-secondary)]">
        Afiliados a la Seguridad Social el último día del mes, dato mensual.
      </p>
      <NotaMensual nota={data.notaTemporal} />
      {!ok ? (
        <div className="mt-4"><EstadoLinea estado={data.status} /></div>
      ) : (
        <div className="mt-4">
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
            <StatCard etiqueta="Total afiliados" valor={fmt(data.total)} detalle={`TGSS, ${data.tableId}, ${data.etiquetaPeriodo}`} />
            <StatCard etiqueta="Régimen General" valor={fmt(data.regimenes.general)} detalle={`TGSS, ${data.tableId}, ${data.etiquetaPeriodo}`} />
          </div>
          <h3 className="type-h4 mt-10 text-[var(--text-primary)]">Por régimen</h3>
          <div className="mt-4 grid max-w-[48rem] grid-cols-1 gap-3">
            {REGIMEN_LABELS.map((r) => {
              const v = data.regimenes[r.clave as keyof typeof data.regimenes] ?? null;
              return (
                <Barra
                  key={r.clave}
                  etiqueta={r.etiqueta}
                  valor={`${fmt(v)}${pctOf(v, data.total) !== null ? ` (${pctOf(v, data.total)} %)` : ""}`}
                  pct={pctOf(v, data.total)}
                  color={CHART.municipio}
                />
              );
            })}
          </div>
        </div>
      )}
      <WarningList warnings={data.warnings} />
      <Trace label="Tesorería General de la Seguridad Social" tableId={data.tableId} period={data.etiquetaPeriodo} />
      <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">
        La ausencia de dato se muestra como ND; nunca como 0.
      </p>
    </section>
  );
}
