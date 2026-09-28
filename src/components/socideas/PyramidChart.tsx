"use client";

import { useId, useMemo, useState } from "react";
import type { MunicipalStructureWithBenchmarks } from "@/lib/socideas-population-runtime";
import type { EstructuraModo, EstructuraRefKey } from "@/lib/socideas-population-presentation";
import {
  buildEstructuraView,
  estructuraRefOptions,
  formatInt,
  formatNumber,
  formatSigned,
  shortBandLabel,
} from "@/lib/socideas-population-presentation";
import { CHART } from "./ficha-ui";

const REF_OPTIONS: { key: EstructuraRefKey | "none"; label: string }[] = [
  { key: "none", label: "Sin comparación" },
  { key: "provincia", label: "Provincia" },
  { key: "ccaa", label: "CCAA" },
  { key: "espana", label: "España" },
];

const MODOS: { key: EstructuraModo; label: string }[] = [
  { key: "perfil", label: "Perfil" },
  { key: "diferencia", label: "Diferencia" },
];

interface PyramidChartProps {
  data?: MunicipalStructureWithBenchmarks | null;
  municipioNombre: string;
  provinciaNombre?: string | null;
  ccaaNombre?: string | null;
  initialRef?: EstructuraRefKey | "none";
  initialModo?: EstructuraModo;
}

export default function PyramidChart({
  data = null,
  municipioNombre,
  provinciaNombre,
  ccaaNombre,
  initialRef = "none",
  initialModo = "perfil",
}: PyramidChartProps) {
  const [refKey, setRefKey] = useState<EstructuraRefKey | "none">(
    initialRef === "none" ? "none" : initialRef,
  );
  const [modo, setModo] = useState<EstructuraModo>(initialModo);
  const [hoveredBand, setHoveredBand] = useState<string | null>(null);
  const [focusedBand, setFocusedBand] = useState<string | null>(null);

  if (!data) {
    return (
      <div className="max-w-[70ch] rounded-[6px] border border-dashed border-[var(--border-default)] px-4 py-3 text-sm text-[var(--text-secondary)]" role="status">
        Pirámide de población no disponible para este municipio: la fuente no publica la estructura por edad y sexo.
      </div>
    );
  }

  const baseId = useId();
  const options = useMemo(
    () => estructuraRefOptions(data, { provincia: provinciaNombre, ccaa: ccaaNombre }),
    [data, provinciaNombre, ccaaNombre],
  );

  const view = useMemo(() => {
    const effectiveRef = refKey === "none" ? "espana" : refKey;
    return buildEstructuraView(data, effectiveRef, modo, {
      provincia: provinciaNombre,
      ccaa: ccaaNombre,
    });
  }, [data, refKey, modo, provinciaNombre, ccaaNombre]);

  const hasReference = refKey !== "none" && view.hasReference;
  const scale = view.scale;
  const unit = modo === "diferencia" ? "pp" : "%";

  const barValue = (row: (typeof view.rows)[number], sex: "male" | "female"): number | null => {
    if (modo === "diferencia") {
      return sex === "male" ? row.maleDiffPp : row.femaleDiffPp;
    }
    return sex === "male" ? row.maleShare : row.femaleShare;
  };

  const refValue = (row: (typeof view.rows)[number], sex: "male" | "female"): number | null => {
    return sex === "male" ? row.refMaleShare : row.refFemaleShare;
  };

  const width = (value: number | null): number => {
    if (value === null) return 0;
    return Math.min(100, (Math.abs(value) / scale) * 100);
  };

  const valueText = (value: number | null): string => {
    if (value === null) return "ND";
    return modo === "diferencia" ? formatSigned(value, 1) : formatNumber(value, 1);
  };

  const getRefOption = (key: EstructuraRefKey | "none") => {
    if (key === "none") return { key: "none" as const, label: "Sin comparación", available: true, total: null };
    return options.find((o) => o.key === key) ?? { key, label: key, available: false, total: null };
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <fieldset>
          <legend className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
            Comparar con
          </legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Territorio de comparación">
            {REF_OPTIONS.map((opt) => {
              const refOpt = getRefOption(opt.key);
              const available = opt.key === "none" || refOpt.available;
              return (
                <label
                  key={opt.key}
                  className={`inline-flex min-h-[44px] items-center gap-2 rounded-[6px] border px-3 text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--border-focus)] sm:min-h-[36px] ${
                    refKey === opt.key
                      ? "border-[var(--color-secondary)] bg-[var(--bg-surface)] font-semibold text-[var(--text-primary)]"
                      : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-default)]"
                  } ${available ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                >
                  <input
                    type="radio"
                    name={`${baseId}-ref`}
                    value={opt.key}
                    checked={refKey === opt.key}
                    disabled={!available}
                    onChange={() => setRefKey(opt.key)}
                    className="h-3.5 w-3.5 accent-[var(--musgo)]"
                  />
                  <span>{opt.label}</span>
                  {opt.key !== "none" && refOpt.total !== null && (
                    <span className="text-xs tabular-nums text-[var(--text-muted)]">
                      {formatInt(refOpt.total)} hab.
                    </span>
                  )}
                  {opt.key !== "none" && !available && (
                    <span className="text-xs text-[var(--text-muted)]">(sin dato)</span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
            Modo
          </legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Modo de visualización">
            {MODOS.map((m) => (
              <label
                key={m.key}
                className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[6px] border px-3 text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--border-focus)] sm:min-h-[36px] ${
                  modo === m.key
                    ? "border-[var(--color-secondary)] bg-[var(--bg-surface)] font-semibold text-[var(--text-primary)]"
                    : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-default)]"
                }`}
              >
                <input
                  type="radio"
                  name={`${baseId}-modo`}
                  value={m.key}
                  checked={modo === m.key}
                  onChange={() => setModo(m.key)}
                  className="h-3.5 w-3.5 accent-[var(--musgo)]"
                />
                <span>{m.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <p className="max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-secondary)]">
        {modo === "perfil"
          ? "Modo Perfil: cuánto pesa cada grupo de edad y sexo sobre el total de la población del territorio."
          : "Modo Diferencia: distancia entre el peso del municipio y el de la referencia, en puntos porcentuales (pp)."}
      </p>

      <figure>
        <figcaption className="sr-only">
          Pirámide de población de {municipioNombre} en {data.period} por grupos quinquenales y sexo
          {hasReference ? `, con comparación frente a ${view.refName}` : ", sin comparación territorial"}.
          La tabla equivalente figura a continuación.
        </figcaption>

        <div
          role="img"
          aria-label={`Pirámide de población de ${municipioNombre} en ${data.period}. Escala máxima ${formatNumber(scale, 1)} ${unit}. Hombres a la izquierda, mujeres a la derecha.`}
          className="space-y-1"
        >
          <div className="grid grid-cols-[2.5rem_1fr_2.5rem_1fr_2.5rem] items-center gap-x-1 text-[10px] font-semibold text-[var(--text-muted)] sm:grid-cols-[3.5rem_1fr_3.5rem_1fr_3.5rem] sm:text-[11px]" aria-hidden="true">
            <span className="text-right">H</span>
            <span className="text-right">Hombres</span>
            <span className="text-center">Edad</span>
            <span>Mujeres</span>
            <span>M</span>
          </div>

          <ul className="flex flex-col gap-0.5">
            {view.rows.map((row) => {
              const isHovered = hoveredBand === row.band;
              const isFocused = focusedBand === row.band;
              const showTooltip = isHovered || isFocused;
              return (
                <li
                  key={row.band}
                  className="group relative grid grid-cols-[2.5rem_1fr_2.5rem_1fr_2.5rem] items-center gap-x-1 sm:grid-cols-[3.5rem_1fr_3.5rem_1fr_3.5rem]"
                  onMouseEnter={() => setHoveredBand(row.band)}
                  onMouseLeave={() => setHoveredBand(null)}
                  onFocus={() => setFocusedBand(row.band)}
                  onBlur={() => setFocusedBand(null)}
                  tabIndex={0}
                  aria-label={`${row.band}: hombres ${formatInt(row.male)} (${formatNumber(row.maleShare, 1)}%), mujeres ${formatInt(row.female)} (${formatNumber(row.femaleShare, 1)}%)${hasReference ? `, diferencia hombres ${formatSigned(row.maleDiffPp, 1)} pp, diferencia mujeres ${formatSigned(row.femaleDiffPp, 1)} pp` : ""}`}
                >
                  <span className="text-right text-[10px] tabular-nums text-[var(--text-secondary)] sm:text-[11px]">
                    {valueText(barValue(row, "male"))}
                  </span>
                  <span className="flex h-4 justify-end overflow-hidden bg-[var(--bg-surface-sunken)]">
                    {barValue(row, "male") !== null && (
                      <span
                        aria-hidden="true"
                        className="h-full"
                        style={{
                          width: `${width(barValue(row, "male"))}%`,
                          ...(modo === "diferencia" && barValue(row, "male")! < 0
                            ? { border: `1px solid ${CHART.hombres}`, background: `color-mix(in srgb, ${CHART.hombres} 18%, transparent)` }
                            : { background: CHART.hombres }),
                        }}
                      />
                    )}
                    {hasReference && modo === "perfil" && refValue(row, "male") !== null && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 right-0 z-10 border border-dashed border-[var(--text-primary)]"
                        style={{ width: `${width(refValue(row, "male"))}%` }}
                      />
                    )}
                  </span>
                  <span className="text-center text-[9px] font-semibold tabular-nums text-[var(--text-secondary)] sm:text-[11px]">
                    {shortBandLabel(row.band)}
                  </span>
                  <span className="flex h-4 justify-start overflow-hidden bg-[var(--bg-surface-sunken)]">
                    {barValue(row, "female") !== null && (
                      <span
                        aria-hidden="true"
                        className="h-full"
                        style={{
                          width: `${width(barValue(row, "female"))}%`,
                          ...(modo === "diferencia" && barValue(row, "female")! < 0
                            ? { border: `1px solid ${CHART.mujeres}`, background: `color-mix(in srgb, ${CHART.mujeres} 18%, transparent)` }
                            : { background: CHART.mujeres }),
                        }}
                      />
                    )}
                    {hasReference && modo === "perfil" && refValue(row, "female") !== null && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 left-0 z-10 border border-dashed border-[var(--text-primary)]"
                        style={{ width: `${width(refValue(row, "female"))}%` }}
                      />
                    )}
                  </span>
                  <span className="text-[10px] tabular-nums text-[var(--text-secondary)] sm:text-[11px]">
                    {valueText(barValue(row, "female"))}
                  </span>

                  {showTooltip && (
                    <div
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 w-[min(21rem,82vw)] -translate-x-1/2 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-left text-xs leading-relaxed text-[var(--text-secondary)] shadow-[var(--shadow-2)]"
                    >
                      <span className="block text-xs font-semibold text-[var(--text-primary)]">
                        {row.band}, {data.period}
                      </span>
                      <span className="mt-1 block">
                        <span className="font-semibold text-[var(--text-primary)]">Hombres:</span>{" "}
                        {row.male === null ? "ND" : `${formatInt(row.male)} personas`} ·{" "}
                        {row.maleShare === null ? "ND" : `${formatNumber(row.maleShare, 1)}%`}
                        {hasReference && row.maleDiffPp !== null && (
                          <span className="block">Diferencia: {formatSigned(row.maleDiffPp, 1)} pp</span>
                        )}
                      </span>
                      <span className="mt-0.5 block">
                        <span className="font-semibold text-[var(--text-primary)]">Mujeres:</span>{" "}
                        {row.female === null ? "ND" : `${formatInt(row.female)} personas`} ·{" "}
                        {row.femaleShare === null ? "ND" : `${formatNumber(row.femaleShare, 1)}%`}
                        {hasReference && row.femaleDiffPp !== null && (
                          <span className="block">Diferencia: {formatSigned(row.femaleDiffPp, 1)} pp</span>
                        )}
                      </span>
                      {row.status !== "observed" && (
                        <span className="mt-1 block text-[var(--text-muted)]">
                          Dato no disponible en la fuente (ND ≠ 0)
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-4" style={{ background: CHART.hombres }} />
              Hombres
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-4" style={{ background: CHART.mujeres }} />
              Mujeres
            </span>
            {hasReference && modo === "perfil" && (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2.5 w-4 border border-dashed border-[var(--text-primary)]" />
                Referencia: {view.refName}
              </span>
            )}
            <span>
              Escala: máximo {formatNumber(scale, 1)} {unit}; eje central {modo === "diferencia" ? "en 0 pp" : "simétrico"}
            </span>
          </div>

          {view.ndBands > 0 && (
            <p className="mt-2 text-xs text-[var(--text-muted)]" role="note">
              {view.ndBands} {view.ndBands === 1 ? "grupo presenta" : "grupos presentan"} dato no disponible (ND) en la
              fuente; no se representa como 0.
            </p>
          )}
        </div>
      </figure>

      <div className="socideas-table-shell__scroll overflow-x-auto">
        <table className="socideas-table">
          <caption className="sr-only">
            Tabla de estructura de población de {municipioNombre} por sexo y grupos quinquenales de edad en{" "}
            {data.period}, con valores absolutos y porcentajes sobre el total.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="socideas-table__text">
                Grupo de edad
              </th>
              <th scope="col" className="socideas-table__numeric">
                Hombres
              </th>
              <th scope="col" className="socideas-table__numeric">
                Mujeres
              </th>
              <th scope="col" className="socideas-table__numeric">
                Total
              </th>
              <th scope="col" className="socideas-table__numeric">
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.band}>
                <th scope="row" className="socideas-table__text border-t border-[var(--border-subtle)] px-[14px] py-2 text-left font-medium text-[var(--text-primary)]">
                  {row.band}
                </th>
                <td className="socideas-table__numeric">
                  {formatInt(row.male)}
                </td>
                <td className="socideas-table__numeric">
                  {formatInt(row.female)}
                </td>
                <td className="socideas-table__numeric">
                  {formatInt(row.total)}
                </td>
                <td className="socideas-table__numeric">
                  {row.total !== null && view.municipalTotal !== null && view.municipalTotal > 0
                    ? formatNumber((row.total / view.municipalTotal) * 100, 1)
                    : "ND"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--border-default)] font-semibold">
              <th scope="row" className="socideas-table__text border-t border-[var(--border-default)] px-[14px] py-3 text-left font-semibold text-[var(--text-primary)]">
                Total
              </th>
              <td className="socideas-table__numeric border-t border-[var(--border-default)] px-[14px] py-3 font-semibold">
                {formatInt(view.municipalMale)}
              </td>
              <td className="socideas-table__numeric border-t border-[var(--border-default)] px-[14px] py-3 font-semibold">
                {formatInt(view.municipalFemale)}
              </td>
              <td className="socideas-table__numeric border-t border-[var(--border-default)] px-[14px] py-3 font-semibold">
                {formatInt(view.municipalTotal)}
              </td>
              <td className="socideas-table__numeric border-t border-[var(--border-default)] px-[14px] py-3 font-semibold">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
