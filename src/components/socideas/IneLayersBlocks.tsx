"use client";

/**
 * Bloques de capas INE laterales nuevas (movilidad migratoria y educación).
 * Presentacionales y sin datos propios: solo se renderizan cuando el municipio
 * tiene la capa validada. Sin cards gigantes, sin gráficos obligatorios, sin
 * scroll horizontal. Estados con punto + texto (nunca solo color).
 */
import DataStatusBadge from "./DataStatusBadge";
import StatCard from "./StatCard";
import { DISCLOSURE, FIGURE_ROW, LEDE, NOTE, SOURCE_NOTE } from "./ficha-ui";
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
    <section aria-label="Movilidad migratoria" className="border-t border-[var(--border-subtle)] py-10">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="type-h3 text-[var(--text-primary)]">Movilidad migratoria</h2>
        <DataStatusBadge estado={estadoDe(y.total)} />
      </div>
      <p className={LEDE}>Saldo migratorio total, interior y exterior del municipio.</p>
      <div className={`mt-6 ${FIGURE_ROW} sm:grid-cols-3`}>
        <StatCard etiqueta="Saldo total" valor={fmtIneValue(y.total)} detalle={`INE, ${y.total.period}`} />
        <StatCard etiqueta="Saldo interior" valor={fmtIneValue(y.interior)} detalle={`INE, ${y.interior.period}`} />
        <StatCard etiqueta="Saldo exterior" valor={fmtIneValue(y.exterior)} detalle={`INE, ${y.exterior.period}`} />
      </div>
      {serie.length > 1 && (
        <details className="mt-6">
          <summary className={DISCLOSURE}>Ver serie anual</summary>
          <div className="socideas-table-shell__scroll max-w-[40rem] overflow-x-auto">
            <table className="socideas-table min-w-[16rem]">
              <caption className="sr-only">Serie anual del saldo migratorio</caption>
              <thead>
                <tr>
                  <th scope="col" className="socideas-table__year">Año</th>
                  <th scope="col" className="socideas-table__numeric">Total</th>
                  <th scope="col" className="socideas-table__numeric">Interior</th>
                  <th scope="col" className="socideas-table__numeric">Exterior</th>
                </tr>
              </thead>
              <tbody>
                {serie.map((row) => (
                  <tr key={row.period}>
                    <td className="socideas-table__year">{row.period}</td>
                    <td className="socideas-table__numeric">{fmtIneValue(row.total)}</td>
                    <td className="socideas-table__numeric">{fmtIneValue(row.interior)}</td>
                    <td className="socideas-table__numeric">{fmtIneValue(row.exterior)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <p className={SOURCE_NOTE}>
        Fuente: INE, tabla {y.total.tableId}. Periodo: <span className="tabular-nums">{y.total.period}</span>. Saldo
        según publicación oficial; la ausencia de dato se muestra como ND, nunca como 0.
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
    <section aria-label="Nivel educativo" className="border-t border-[var(--border-subtle)] py-10">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="type-h3 text-[var(--text-primary)]">Nivel educativo</h2>
        <DataStatusBadge estado={data.status === "observed" ? "consolidado" : "parcial"} />
      </div>
      <p className={LEDE}>Población de 15 años o más por nivel de estudios terminados.</p>
      <div className={`mt-6 ${FIGURE_ROW} sm:grid-cols-2 lg:grid-cols-4`}>
        {EDUCACION_LABELS.map(([key, label]) => (
          <StatCard key={key} etiqueta={label} valor={fmtIneValue(dist[key])} detalle="INE, Censo 2021" />
        ))}
      </div>
      <p className={SOURCE_NOTE}>
        Fuente: INE, Censo de Población y Viviendas 2021, tabla {dist.higher.tableId}. Dato estructural: no es una serie anual y no se compara con
        una evolución inexistente.
      </p>
      <p className={NOTE}>
        «ND» = valor no difundido o no disponible en la fuente oficial; nunca equivale a 0.
      </p>
      <p className={NOTE}>
        La categoría «No aplicable: menor de 15 años» se conserva en la fuente y no se suma a las
        categorías educativas.
      </p>
    </section>
  );
}
