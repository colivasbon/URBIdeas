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
      <div className="rounded-[6px] border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)] p-4 text-xs text-[var(--color-text-muted)]" role="status">
        Pirámide de población: no disponible para este municipio.
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
          <legend className="mb-1.5 block text-xs font-semibold text-[var(--color-text-muted)]">
            Comparar con
          </legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Territorio de comparación">
            {REF_OPTIONS.map((opt) => {
              const refOpt = getRefOption(opt.key);
              const available = opt.key === "none" || refOpt.available;
              return (
                <label
                  key={opt.key}
                  className={`inline-flex min-h-[34px] items-center gap-2 rounded-[6px] border px-3 text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--moss-ink)] ${
                    refKey === opt.key
                      ? "border-[var(--color-secondary)] bg-[var(--color-input-bg)] font-semibold text-[var(--color-text-primary)]"
                      : "border-[var(--color-border)] text-[var(--color-text-secondary)]"
                  } ${available ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                >
                  <input
                    type="radio"
                    name={`${baseId}-ref`}
                    value={opt.key}
                    checked={refKey === opt.key}
                    disabled={!available}
                    onChange={() => setRefKey(opt.key)}
                    className="h-3.5 w-3.5 accent-[var(--color-secondary)]"
                  />
                  <span>{opt.label}</span>
                  {opt.key !== "none" && refOpt.total !== null && (
                    <span className="text-[11px] tabular-nums text-[var(--color-text-muted)]">
                      {formatInt(refOpt.total)} hab.
                    </span>
                  )}
                  {opt.key !== "none" && !available && (
                    <span className="text-[11px] text-[var(--color-text-muted)]">(sin dato)</span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 block text-xs font-semibold text-[var(--color-text-muted)]">
            Modo
          </legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Modo de visualización">
            {MODOS.map((m) => (
              <label
                key={m.key}
                className={`inline-flex min-h-[34px] cursor-pointer items-center gap-2 rounded-[6px] border px-3 text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--moss-ink)] ${
                  modo === m.key
                    ? "border-[var(--color-secondary)] bg-[var(--color-input-bg)] font-semibold text-[var(--color-text-primary)]"
                    : "border-[var(--color-border)] text-[var(--color-text-secondary)]"
                }`}
              >
                <input
                  type="radio"
                  name={`${baseId}-modo`}
                  value={m.key}
                  checked={modo === m.key}
                  onChange={() => setModo(m.key)}
                  className="h-3.5 w-3.5 accent-[var(--color-secondary)]"
                />
                <span>{m.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
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
          <div className="grid grid-cols-[2.5rem_1fr_2.5rem_1fr_2.5rem] items-center gap-x-1 text-[10px] font-semibold text-[var(--color-text-muted)] sm:grid-cols-[3.5rem_1fr_3.5rem_1fr_3.5rem] sm:text-[11px]" aria-hidden="true">
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
                  <span className="text-right text-[10px] tabular-nums text-[var(--color-text-secondary)] sm:text-[11px]">
                    {valueText(barValue(row, "male"))}
                  </span>
                  <span className="flex h-4 justify-end overflow-hidden rounded-l bg-[var(--color-input-bg)]">
                    {barValue(row, "male") !== null && (
                      <span
                        aria-hidden="true"
                        className={`h-full rounded-l ${
                          modo === "diferencia" && barValue(row, "male")! < 0
                            ? "border border-[var(--color-text-secondary)]"
                            : "bg-[var(--color-primary)]"
                        }`}
                        style={{
                          width: `${width(barValue(row, "male"))}%`,
                          ...(modo === "diferencia" && barValue(row, "male")! < 0
                            ? {
                                backgroundImage:
                                  "repeating-linear-gradient(45deg, var(--color-text-muted) 0, var(--color-text-muted) 1px, transparent 1px, transparent 4px)",
                              }
                            : {}),
                        }}
                      />
                    )}
                    {hasReference && modo === "perfil" && refValue(row, "male") !== null && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 right-0 z-10 border border-dashed border-[var(--color-text-secondary)]"
                        style={{ width: `${width(refValue(row, "male"))}%` }}
                      />
                    )}
                  </span>
                  <span className="text-center text-[9px] font-semibold tabular-nums text-[var(--color-text-secondary)] sm:text-[11px]">
                    {shortBandLabel(row.band)}
                  </span>
                  <span className="flex h-4 justify-start overflow-hidden rounded-r bg-[var(--color-input-bg)]">
                    {barValue(row, "female") !== null && (
                      <span
                        aria-hidden="true"
                        className={`h-full rounded-r ${
                          modo === "diferencia" && barValue(row, "female")! < 0
                            ? "border border-[var(--color-text-secondary)]"
                            : "bg-[var(--color-secondary)]"
                        }`}
                        style={{
                          width: `${width(barValue(row, "female"))}%`,
                          ...(modo === "diferencia" && barValue(row, "female")! < 0
                            ? {
                                backgroundImage:
                                  "repeating-linear-gradient(45deg, var(--color-text-muted) 0, var(--color-text-muted) 1px, transparent 1px, transparent 4px)",
                              }
                            : {}),
                        }}
                      />
                    )}
                    {hasReference && modo === "perfil" && refValue(row, "female") !== null && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 left-0 z-10 border border-dashed border-[var(--color-text-secondary)]"
                        style={{ width: `${width(refValue(row, "female"))}%` }}
                      />
                    )}
                  </span>
                  <span className="text-[10px] tabular-nums text-[var(--color-text-secondary)] sm:text-[11px]">
                    {valueText(barValue(row, "female"))}
                  </span>

                  {showTooltip && (
                    <div
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 w-[min(21rem,82vw)] -translate-x-1/2 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-card-bg)] p-3 text-left text-[11px] leading-relaxed text-[var(--color-text-secondary)] shadow-lg"
                    >
                      <span className="block text-xs font-bold text-[var(--color-text-primary)]">
                        {row.band} · {data.period}
                      </span>
                      <span className="mt-1 block">
                        <span className="font-semibold text-[var(--color-text-primary)]">Hombres:</span>{" "}
                        {row.male === null ? "ND" : `${formatInt(row.male)} personas`} ·{" "}
                        {row.maleShare === null ? "ND" : `${formatNumber(row.maleShare, 1)}%`}
                        {hasReference && row.maleDiffPp !== null && (
                          <span className="block">Diferencia: {formatSigned(row.maleDiffPp, 1)} pp</span>
                        )}
                      </span>
                      <span className="mt-0.5 block">
                        <span className="font-semibold text-[var(--color-text-primary)]">Mujeres:</span>{" "}
                        {row.female === null ? "ND" : `${formatInt(row.female)} personas`} ·{" "}
                        {row.femaleShare === null ? "ND" : `${formatNumber(row.femaleShare, 1)}%`}
                        {hasReference && row.femaleDiffPp !== null && (
                          <span className="block">Diferencia: {formatSigned(row.femaleDiffPp, 1)} pp</span>
                        )}
                      </span>
                      {row.status !== "observed" && (
                        <span className="mt-1 block italic text-[var(--color-text-muted)]">
                          Dato no disponible en la fuente (ND ≠ 0)
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-[var(--color-text-muted)] sm:text-[11px]">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-4 rounded-[2px] bg-[var(--color-primary)]" />
              Hombres
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-4 rounded-[2px] bg-[var(--color-secondary)]" />
              Mujeres
            </span>
            {hasReference && modo === "perfil" && (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2.5 w-4 rounded-[2px] border border-dashed border-[var(--color-text-secondary)]" />
                Referencia: {view.refName}
              </span>
            )}
            <span>
              Escala: máx. {formatNumber(scale, 1)} {unit} · Eje central = {modo === "diferencia" ? "0 pp" : "simétrico"}
            </span>
          </div>

          {view.ndBands > 0 && (
            <p className="mt-2 text-[11px] text-[var(--color-text-muted)]" role="note">
              {view.ndBands} {view.ndBands === 1 ? "grupo presenta" : "grupos presentan"} dato no disponible (ND) en la
              fuente; no se representa como 0.
            </p>
          )}
        </div>
      </figure>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px] sm:text-xs">
          <caption className="sr-only">
            Tabla de estructura de población de {municipioNombre} por sexo y grupos quinquenales de edad en{" "}
            {data.period}, con valores absolutos y porcentajes sobre el total.
          </caption>
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th scope="col" className="py-2 pr-3 font-semibold text-[var(--color-text-primary)]">
                Grupo de edad
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold text-[var(--color-text-primary)]">
                Hombres
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold text-[var(--color-text-primary)]">
                Mujeres
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold text-[var(--color-text-primary)]">
                Total
              </th>
              <th scope="col" className="py-2 text-right font-semibold text-[var(--color-text-primary)]">
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.band} className="border-b border-[var(--color-border-subtle)]">
                <th scope="row" className="py-1.5 pr-3 font-normal text-[var(--color-text-secondary)]">
                  {row.band}
                </th>
                <td className="py-1.5 pr-3 text-right tabular-nums text-[var(--color-text-secondary)]">
                  {formatInt(row.male)}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-[var(--color-text-secondary)]">
                  {formatInt(row.female)}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-[var(--color-text-secondary)]">
                  {formatInt(row.total)}
                </td>
                <td className="py-1.5 text-right tabular-nums text-[var(--color-text-secondary)]">
                  {row.total !== null && view.municipalTotal !== null && view.municipalTotal > 0
                    ? formatNumber((row.total / view.municipalTotal) * 100, 1)
                    : "ND"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--color-border)] font-semibold">
              <th scope="row" className="py-2 pr-3 text-[var(--color-text-primary)]">
                Total
              </th>
              <td className="py-2 pr-3 text-right tabular-nums text-[var(--color-text-primary)]">
                {formatInt(view.municipalMale)}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-[var(--color-text-primary)]">
                {formatInt(view.municipalFemale)}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-[var(--color-text-primary)]">
                {formatInt(view.municipalTotal)}
              </td>
              <td className="py-2 text-right tabular-nums text-[var(--color-text-primary)]">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
