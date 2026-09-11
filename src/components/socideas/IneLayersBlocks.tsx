"use client";

/**
 * Bloques de capas INE laterales nuevas (movilidad migratoria y educación).
 * Presentacionales y sin datos propios: solo se renderizan cuando el municipio
 * tiene la capa validada. Sin cards gigantes, sin gráficos obligatorios, sin
 * scroll horizontal. Estados con punto + texto (nunca solo color).
 */
import DataStatusBadge from "./DataStatusBadge";
import StatCard from "./StatCard";
import type {
  IneEducationDistribution,
  IneMigrationYear,
  IneValue,
  MunicipalIneLayersV1,
} from "@/lib/socideas-ine-layers";

function fmtNum(n: number): string {
  return n.toLocaleString("es-ES");
}

/** Valor visible: ND para null (nunca 0), con signo para saldos negativos. */
export function fmtIneValue(v: IneValue | undefined | null): string {
  if (!v || v.value === null) return "ND";
  const sign = v.value > 0 && v.unit === "personas" ? "+" : "";
  return `${sign}${fmtNum(v.value)}${v.unit === "%" ? " %" : ""}`;
}

function estadoDe(v: IneValue | undefined | null): "consolidado" | "secreto" | "pendiente" {
  if (!v || v.status === "missing" || v.status === "not_available") return "pendiente";
  if (v.status === "suppressed") return "secreto";
  return "consolidado";
}

export function MigracionBlock({ data }: { data: NonNullable<MunicipalIneLayersV1["layers"]["migration"]> }) {
  if (!data.latest) return null;
  const y: IneMigrationYear = data.latest;
  const serie = data.annualSeries ?? [];
  return (
    <section aria-label="Movilidad migratoria" className="mb-10">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="ideas-h2">Movilidad migratoria</h2>
        <DataStatusBadge estado={estadoDe(y.total)} />
      </div>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Saldo migratorio · INE · Tabla {y.total.tableId} · {y.total.period}
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard etiqueta="Saldo total" valor={fmtIneValue(y.total)} detalle={`INE · ${y.total.period}`} />
        <StatCard etiqueta="Saldo interior" valor={fmtIneValue(y.interior)} detalle={`INE · ${y.interior.period}`} />
        <StatCard etiqueta="Saldo exterior" valor={fmtIneValue(y.exterior)} detalle={`INE · ${y.exterior.period}`} />
      </div>
      {serie.length > 1 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--color-secondary)]">Serie anual</summary>
          <div className="mt-2 max-w-full overflow-x-auto">
            <table className="w-full min-w-[16rem] text-xs">
              <caption className="sr-only">Serie anual del saldo migratorio</caption>
              <thead>
                <tr className="text-left text-[var(--color-text-muted)]">
                  <th scope="col" className="py-1 pr-3 font-semibold">Año</th>
                  <th scope="col" className="py-1 pr-3 text-right font-semibold">Total</th>
                  <th scope="col" className="py-1 pr-3 text-right font-semibold">Interior</th>
                  <th scope="col" className="py-1 text-right font-semibold">Exterior</th>
                </tr>
              </thead>
              <tbody>
                {serie.map((row) => (
                  <tr key={row.period} className="border-t border-[var(--color-border-subtle)]">
                    <td className="py-1 pr-3 tabular-nums">{row.period}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{fmtIneValue(row.total)}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{fmtIneValue(row.interior)}</td>
                    <td className="py-1 text-right tabular-nums">{fmtIneValue(row.exterior)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <p className="mt-3 text-xs text-[var(--color-text-muted)]">
        Fuente: INE · Tabla {y.total.tableId} · Cálculo de saldo según publicación oficial. La ausencia de
        dato se muestra como ND; nunca como 0.
      </p>
    </section>
  );
}

const EDUCACION_LABELS: [keyof IneEducationDistribution, string][] = [
  ["primaryOrBelow", "Educación primaria o inferior"],
  ["lowerSecondary", "Primera etapa de secundaria"],
  ["upperSecondaryPostSecondary", "Segunda etapa / postsecundaria no superior"],
  ["higher", "Educación superior"],
];

export function EducacionBlock({ data }: { data: NonNullable<MunicipalIneLayersV1["layers"]["education"]> }) {
  const dist = data.total ?? data.bySex?.male;
  if (!dist) return null;
  return (
    <section aria-label="Nivel educativo" className="mb-10">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="ideas-h2">Nivel educativo</h2>
        <DataStatusBadge estado={data.status === "observed" ? "consolidado" : "parcial"} />
      </div>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Censo de Población y Viviendas 2021 · INE · Tabla {dist.higher.tableId}
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {EDUCACION_LABELS.map(([key, label]) => (
          <StatCard key={key} etiqueta={label} valor={fmtIneValue(dist[key])} detalle="Censo 2021 · dato estructural" />
        ))}
      </div>
      <p className="mt-3 text-xs text-[var(--color-text-muted)]">
        Dato estructural · Censo de Población y Viviendas 2021. No es una serie anual y no se compara con
        una evolución inexistente.
      </p>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
        La categoría «No aplicable: menor de 15 años» se conserva en la fuente y no se suma a las
        categorías educativas.
      </p>
    </section>
  );
}
