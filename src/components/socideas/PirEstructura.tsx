"use client";

import type { CSSProperties, ReactNode } from "react";
import type { EstructuraView, EstructuraViewRow } from "@/lib/socideas-population-presentation";
import { formatInt, formatNumber, formatSigned, shortBandLabel } from "@/lib/socideas-population-presentation";
import { CHART } from "./ficha-ui";

const SEX_COLOR = { male: CHART.hombres, female: CHART.mujeres } as const;

/** Barra negativa (por debajo de la referencia): contorno del color del sexo y tinte claro, sin trama. */
function negativeStyle(sex: "male" | "female"): CSSProperties {
  return {
    border: `1px solid ${SEX_COLOR[sex]}`,
    background: `color-mix(in srgb, ${SEX_COLOR[sex]} 18%, transparent)`,
  };
}

const ROW_GRID =
  "group relative grid grid-cols-[minmax(0,1fr)_4.75rem_minmax(0,1fr)] items-center gap-x-1.5 sm:grid-cols-[3.5rem_minmax(0,1fr)_7rem_minmax(0,1fr)_3.5rem]";

function SexoDetalle({
  row,
  sex,
  refName,
  hasReference,
}: {
  row: EstructuraViewRow;
  sex: "male" | "female";
  refName: string;
  hasReference: boolean;
}) {
  const people = sex === "male" ? row.male : row.female;
  const shareValue = sex === "male" ? row.maleShare : row.femaleShare;
  const refShare = sex === "male" ? row.refMaleShare : row.refFemaleShare;
  const difference = sex === "male" ? row.maleDiffPp : row.femaleDiffPp;
  return (
    <p>
      <span className="font-semibold text-[var(--text-primary)]">
        {sex === "male" ? "Hombres" : "Mujeres"}:
      </span>{" "}
      {people === null ? "ND (no disponible; no equivale a 0)" : `${formatInt(people)} personas`},{" "}
      {shareValue === null ? "% del municipio: ND" : `${formatNumber(shareValue, 1)} % del municipio`}
      {hasReference && (
        <>
          {"; "}
          {refShare === null ? `% en ${refName}: ND` : `${formatNumber(refShare, 1)} % en ${refName}`};{" "}
          {difference === null ? "diferencia: ND" : `diferencia: ${formatSigned(difference, 1)} pp`}
        </>
      )}
    </p>
  );
}

export default function PirEstructura({
  view,
  municipalName,
}: {
  view: EstructuraView;
  municipalName: string;
}) {
  const { rows, isDifference, hasReference, refName, scale, period, ndBands } = view;
  const unit = isDifference ? "pp" : "%";
  const title = isDifference
    ? `Diferencia en puntos porcentuales frente a ${hasReference ? refName : "la referencia"}`
    : `Perfil de la población frente a ${hasReference ? refName : "la referencia"}`;

  const barValue = (row: EstructuraViewRow, sex: "male" | "female"): number | null =>
    isDifference
      ? sex === "male"
        ? row.maleDiffPp
        : row.femaleDiffPp
      : sex === "male"
        ? row.maleShare
        : row.femaleShare;

  const refValue = (row: EstructuraViewRow, sex: "male" | "female"): number | null =>
    sex === "male" ? row.refMaleShare : row.refFemaleShare;

  const width = (value: number | null): number =>
    value === null ? 0 : Math.min(100, (Math.abs(value) / scale) * 100);

  const valueText = (value: number | null): string => {
    if (value === null) return "ND";
    return isDifference ? formatSigned(value, 1) : formatNumber(value, 1);
  };

  const bar = (row: EstructuraViewRow, sex: "male" | "female"): ReactNode => {
    const value = barValue(row, sex);
    const reference = refValue(row, sex);
    const negative = isDifference && value !== null && value < 0;
    const isLeft = sex === "male";
    return (
      <span
        className={`relative flex h-4 w-full items-center overflow-hidden bg-[var(--bg-surface-sunken)] ${
          isLeft ? "justify-end" : "justify-start"
        }`}
      >
        {!isDifference && hasReference && reference !== null && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 z-10 border border-dashed border-[var(--text-primary)]"
            style={{ width: `${width(reference)}%`, ...(isLeft ? { right: 0 } : { left: 0 }) }}
          />
        )}
        {value !== null && (
          <span
            aria-hidden="true"
            className="h-full"
            style={{ width: `${width(value)}%`, ...(negative ? negativeStyle(sex) : { background: SEX_COLOR[sex] }) }}
          />
        )}
      </span>
    );
  };

  const valueCell = (value: number | null, align: "right" | "left"): ReactNode => (
    <span
      className={`hidden text-xs tabular-nums text-[var(--text-muted)] sm:block ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {valueText(value)}
      {value === null ? "" : ` ${unit}`}
    </span>
  );

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
        <p className="text-xs text-[var(--text-muted)]">
          Escala simétrica, máximo <span className="tabular-nums">{formatNumber(scale, 1)}</span> {unit}. Hombres a la
          izquierda, mujeres a la derecha.
        </p>
      </div>

      <ul className="mt-3 flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.band} className={ROW_GRID}>
            {valueCell(barValue(row, "male"), "right")}
            {bar(row, "male")}
            <span
              className="text-center text-[11px] font-medium tabular-nums text-[var(--text-secondary)] sm:text-xs"
              title={row.band}
            >
              {shortBandLabel(row.band)}
            </span>
            {bar(row, "female")}
            {valueCell(barValue(row, "female"), "left")}
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden w-[min(21rem,82vw)] -translate-x-1/2 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-left text-xs leading-relaxed text-[var(--text-secondary)] shadow-[var(--shadow-2)] group-hover:block group-focus-within:block"
            >
              <span className="block text-xs font-semibold text-[var(--text-primary)]">
                {row.band}, {period}
              </span>
              <SexoDetalle row={row} sex="male" refName={refName} hasReference={hasReference} />
              <SexoDetalle row={row} sex="female" refName={refName} hasReference={hasReference} />
              {!hasReference && <span className="mt-1 block">Sin referencia territorial disponible para comparar.</span>}
            </span>
          </li>
        ))}
      </ul>

      <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[var(--text-secondary)]">
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-4" style={{ background: CHART.hombres }} />
          Hombres, {municipalName}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-4" style={{ background: CHART.mujeres }} />
          Mujeres, {municipalName}
        </li>
        {hasReference && !isDifference && (
          <li className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2.5 w-4 border border-dashed border-[var(--text-primary)]"
            />
            Referencia (contorno discontinuo): {refName}
          </li>
        )}
        {hasReference && isDifference && (
          <>
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-4" style={{ background: CHART.hombres }} />
              Relleno: por encima de {refName}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-4" style={negativeStyle("male")} />
              Contorno: por debajo de {refName}
            </li>
          </>
        )}
        <li className="text-[var(--text-muted)]">
          Eje central {isDifference ? "en 0 pp" : "simétrico"}. Un 0 observado se rotula «0»; ND nunca es 0.
        </li>
      </ul>

      {ndBands > 0 && (
        <p className="mt-2 text-xs text-[var(--text-muted)]" role="note">
          {ndBands} {ndBands === 1 ? "grupo presenta" : "grupos presentan"} dato no disponible (ND) en la fuente; no se
          representa como 0.
        </p>
      )}
    </div>
  );
}