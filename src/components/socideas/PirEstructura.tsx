"use client";

import type { CSSProperties, ReactNode } from "react";
import type { EstructuraView, EstructuraViewRow } from "@/lib/socideas-population-presentation";
import { formatInt, formatNumber, formatSigned, shortBandLabel } from "@/lib/socideas-population-presentation";

const HATCH_STYLE: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(45deg, var(--color-text-muted) 0, var(--color-text-muted) 1px, transparent 1px, transparent 4px)",
};

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
      <span className="font-semibold text-[var(--color-text-primary)]">
        {sex === "male" ? "Hombres" : "Mujeres"}:
      </span>{" "}
      {people === null ? "ND (no disponible; no equivale a 0)" : `${formatInt(people)} personas`} ·{" "}
      {shareValue === null ? "% del municipio: ND" : `${formatNumber(shareValue, 1)} % del municipio`}
      {hasReference && (
        <>
          {" "}
          · {refShare === null ? `% en ${refName}: ND` : `% en ${refName}: ${formatNumber(refShare, 1)} %`} ·{" "}
          {difference === null ? "Diferencia: ND" : `Diferencia: ${formatSigned(difference, 1)} pp`}
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
        className={`relative flex h-4 w-full items-center overflow-hidden bg-[var(--color-input-bg)] ${
          isLeft ? "justify-end rounded-l" : "justify-start rounded-r"
        }`}
      >
        {!isDifference && hasReference && reference !== null && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 z-10 border border-dashed border-[var(--color-text-secondary)]"
            style={{ width: `${width(reference)}%`, ...(isLeft ? { right: 0 } : { left: 0 }) }}
          />
        )}
        {value !== null && (
          <span
            aria-hidden="true"
            className={`h-full ${isLeft ? "rounded-l" : "rounded-r"} ${
              negative ? "border border-[var(--color-text-secondary)]" : "bg-[var(--color-primary)]"
            }`}
            style={{ width: `${width(value)}%`, ...(negative ? HATCH_STYLE : {}) }}
          />
        )}
      </span>
    );
  };

  const valueCell = (value: number | null, align: "right" | "left"): ReactNode => (
    <span
      className={`hidden text-[11px] tabular-nums text-[var(--color-text-secondary)] sm:block ${
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
        <p className="text-xs font-semibold text-[var(--color-text-primary)]">{title}</p>
        <p className="text-[11px] text-[var(--color-text-muted)]">
          Escala simétrica · máx. {formatNumber(scale, 1)} {unit} · Hombres a la izquierda · Mujeres a la derecha
        </p>
      </div>

      <ul className="mt-3 flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.band} className={ROW_GRID}>
            {valueCell(barValue(row, "male"), "right")}
            {bar(row, "male")}
            <span
              className="text-center text-[10px] font-semibold tabular-nums text-[var(--color-text-secondary)] sm:text-[11px]"
              title={row.band}
            >
              {shortBandLabel(row.band)}
            </span>
            {bar(row, "female")}
            {valueCell(barValue(row, "female"), "left")}
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden w-[min(21rem,82vw)] -translate-x-1/2 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-card-bg)] p-3 text-left text-[11px] leading-relaxed text-[var(--color-text-secondary)] shadow-lg group-hover:block group-focus-within:block"
            >
              <span className="block text-xs font-bold text-[var(--color-text-primary)]">
                {row.band} · {period}
              </span>
              <SexoDetalle row={row} sex="male" refName={refName} hasReference={hasReference} />
              <SexoDetalle row={row} sex="female" refName={refName} hasReference={hasReference} />
              {!hasReference && <span className="mt-1 block">Sin referencia territorial disponible para comparar.</span>}
            </span>
          </li>
        ))}
      </ul>

      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[var(--color-text-muted)]">
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-4 rounded-[2px] bg-[var(--color-primary)]" />
          Municipio: {municipalName}
        </li>
        {hasReference && !isDifference && (
          <li className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2.5 w-4 rounded-[2px] border border-dashed border-[var(--color-text-secondary)]"
            />
            Referencia (contorno discontinuo): {refName}
          </li>
        )}
        {hasReference && isDifference && (
          <>
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-4 rounded-[2px] bg-[var(--color-primary)]" />
              Por encima de {refName}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-4 rounded-[2px] border border-[var(--color-text-secondary)]" style={HATCH_STYLE} />
              Por debajo de {refName}
            </li>
          </>
        )}
        <li>Eje central {isDifference ? "= 0 pp" : "simétrico"} · Valor 0 observado se rotula «0»; ND nunca es 0.</li>
      </ul>

      {ndBands > 0 && (
        <p className="mt-2 text-[11px] text-[var(--color-text-muted)]" role="note">
          {ndBands} {ndBands === 1 ? "grupo presenta" : "grupos presentan"} dato no disponible (ND) en la fuente; no se
          representa como 0.
        </p>
      )}
    </div>
  );
}