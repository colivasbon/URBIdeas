"use client";

import DataStatusBadge from "./DataStatusBadge";
import DataTableShell from "./DataTableShell";
import DataTableToolbar from "./DataTableToolbar";
import { FuenteOficial } from "./ConsultaTools";
import PirEstructura from "./PirEstructura";
import type { MunicipalStructureWithBenchmarks } from "@/lib/socideas-population-runtime";
import {
  ESTRUCTURA_MODOS,
  buildEstructuraView,
  estructuraRefOptions,
  formatInt,
  formatNumber,
  formatSigned,
} from "@/lib/socideas-population-presentation";
import type { EstructuraCardView, EstructuraModo, EstructuraRefKey } from "@/lib/socideas-population-presentation";

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function isoToSpanishDate(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (match === null) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${Number(match[3])} de ${MESES[month - 1]} de ${match[1]}`;
}

function sharePct(value: number | null, total: number | null): number | null {
  if (value === null || total === null || total === 0) return null;
  return Math.round((value / total) * 1000) / 10;
}

function cardValue(card: EstructuraCardView, value: number | null): string {
  if (value === null) return "ND";
  if (card.unit === "%" || card.unit === "% del total") return `${formatNumber(value, card.precision)} %`;
  return `${formatNumber(value, card.precision)} ${card.unit}`;
}

export default function EstructuraPoblacionBlock({
  data,
  municipioNombre,
  provinciaNombre,
  ccaaNombre,
  refKey,
  modo,
  onRefChange,
  onModoChange,
}: {
  data: MunicipalStructureWithBenchmarks | null;
  municipioNombre: string;
  provinciaNombre?: string | null;
  ccaaNombre?: string | null;
  refKey: EstructuraRefKey;
  modo: EstructuraModo;
  onRefChange: (key: EstructuraRefKey) => void;
  onModoChange: (modo: EstructuraModo) => void;
}) {
  if (data === null) {
    return (
      <section
        id="estructura-poblacion"
        aria-label="Estructura de la población"
        className="premium-card mb-10 scroll-mt-24 p-5 sm:p-6"
      >
        <h2 className="ideas-h2">Estructura de la población</h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Censo Anual de Población 2025</p>
        <div className="ideas-status mt-3" data-state="pending" role="status">
          <div className="ideas-status__head">
            <p className="ideas-status__title">Sin estructura 2025 publicada para este municipio</p>
            <span className="ideas-status__badge">Pendiente</span>
          </div>
          <div className="ideas-status__body">
            <p>
              El objeto municipal de estructura de población aún no está disponible en el runtime. No se sustituye por
              una pirámide de otro año ni se rellena con estimaciones.
            </p>
          </div>
          <p className="ideas-status__source">
            Fuente prevista: INE,{" "}
            <a
              href="https://www.ine.es/jaxiT3/Tabla.htm?t=68535"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[var(--color-secondary)]"
            >
              tabla 68535 ·
            </a>
          </p>
        </div>
      </section>
    );
  }

  const options = estructuraRefOptions(data, { provincia: provinciaNombre, ccaa: ccaaNombre });
  const view = buildEstructuraView(data, refKey, modo, { provincia: provinciaNombre, ccaa: ccaaNombre });
  const validation = data.quality.validationStatus;
  const validationEstado = validation === "passed" ? "consolidado" : validation === "partial" ? "parcial" : "error";
  const consultado = isoToSpanishDate(data.source.retrievedAt);
  const tableId = `tabla-estructura-${data.ineCode}`;
  const refLabel = view.refName;

  return (
    <section
      id="estructura-poblacion"
      aria-label="Estructura de la población"
      className="premium-card mb-10 scroll-mt-24 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="ideas-h2">Estructura de la población</h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Censo Anual de Población 2025 · {municipioNombre} (INE {data.ineCode})
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <DataStatusBadge estado={validationEstado} />
          <p className="text-[11px] text-[var(--color-text-muted)]">Validación del objeto: {validation}</p>
        </div>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
        Referencia temporal: 1 de enero de {data.period}. Fuente: INE, tabla {data.source.table} (municipio) y tabla
        68521 (territorios de comparación). <FuenteOficial url={data.source.url} etiqueta="Consultar en INE" />
        {consultado !== null ? ` · Consultado: ${consultado}` : ""}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
        Reconciliaciones sin tolerancia: total = hombres + mujeres ({data.quality.totalBySexReconciled ? "OK" : "revisar"}) ·
        suma de los 21 grupos = total ({data.quality.totalByAgeReconciled ? "OK" : "revisar"}) · correspondencia territorial:{" "}
        {data.quality.territoryMatch}.
      </p>
      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
        Población total a 1 de enero de {data.period}:{" "}
        <strong className="tabular-nums">{formatInt(view.municipalTotal)}</strong> personas (hombres{" "}
        <span className="tabular-nums">{formatInt(view.municipalMale)}</span> · mujeres{" "}
        <span className="tabular-nums">{formatInt(view.municipalFemale)}</span>).
      </p>

      <div className="mt-4 flex flex-col gap-4 border-t border-[var(--color-border-subtle)] pt-4 lg:flex-row lg:items-start lg:gap-10">
        <fieldset>
          <legend className="mb-1.5 block text-xs font-semibold text-[var(--color-text-muted)]">Comparar con</legend>
          <div className="flex flex-wrap gap-2">
            {options.map((option) => (
              <label
                key={option.key}
                className={`inline-flex min-h-[34px] items-center gap-2 rounded-[6px] border px-3 text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--moss-ink)] ${
                  refKey === option.key
                    ? "border-[var(--color-secondary)] bg-[var(--color-input-bg)] font-semibold text-[var(--color-text-primary)]"
                    : "border-[var(--color-border)] text-[var(--color-text-secondary)]"
                } ${option.available ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
              >
                <input
                  type="radio"
                  name={`estructura-ref-${data.ineCode}`}
                  value={option.key}
                  checked={refKey === option.key}
                  disabled={!option.available}
                  onChange={() => onRefChange(option.key)}
                  className="h-3.5 w-3.5 accent-[var(--color-secondary)]"
                />
                <span>
                  {option.label === option.name ? option.name : `${option.label}: ${option.name}`}
                </span>
                {option.total !== null && (
                  <span className="text-[11px] tabular-nums text-[var(--color-text-muted)]">
                    {formatInt(option.total)} hab.
                  </span>
                )}
                {!option.available && <span className="text-[11px] text-[var(--color-text-muted)]">(sin dato)</span>}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 block text-xs font-semibold text-[var(--color-text-muted)]">Modo</legend>
          <div className="flex flex-wrap gap-2">
            {ESTRUCTURA_MODOS.map((value) => (
              <label
                key={value}
                className={`inline-flex min-h-[34px] cursor-pointer items-center gap-2 rounded-[6px] border px-3 text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--moss-ink)] ${
                  modo === value
                    ? "border-[var(--color-secondary)] bg-[var(--color-input-bg)] font-semibold text-[var(--color-text-primary)]"
                    : "border-[var(--color-border)] text-[var(--color-text-secondary)]"
                }`}
              >
                <input
                  type="radio"
                  name={`estructura-modo-${data.ineCode}`}
                  value={value}
                  checked={modo === value}
                  onChange={() => onModoChange(value)}
                  className="h-3.5 w-3.5 accent-[var(--color-secondary)]"
                />
                <span>{value === "perfil" ? "Perfil" : "Diferencia"}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
        {modo === "perfil"
          ? "Modo Perfil: cuánto pesa cada grupo de edad y sexo sobre el total de la población del territorio. La referencia elegida se dibuja como contorno, nunca como relleno."
          : "Modo Diferencia: distancia entre el peso del municipio y el de la referencia, en puntos porcentuales (pp). No es ganancia ni pérdida de habitantes: mide composición, no volumen."}
      </p>
      {!view.hasReference && (
        <p className="mt-2 text-xs text-[var(--color-text-muted)]" role="note">
          La referencia seleccionada ({refLabel}) no tiene objeto publicado: se muestran solo los datos del municipio y
          no se calculan diferencias.
        </p>
      )}

      <figure className="mt-4">
        <figcaption className="sr-only">
          Pirámide de población de {municipioNombre} en {data.period} por grupos quinquenales y sexo, con{" "}
          {view.hasReference ? `referencia ${refLabel}` : "sin referencia territorial disponible"}. La tabla equivalente
          figura a continuación.
        </figcaption>
        <PirEstructura view={view} municipalName={municipioNombre} />
      </figure>

      <h3 className="mt-6 text-sm font-bold text-[var(--color-text-primary)]">Indicadores comparados</h3>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {view.cards.map((card) => (
          <div key={card.key} className="data-card">
            <p className="data-card__label">{card.label}</p>
            <p className="data-card__value">{cardValue(card, card.municipal)}</p>
            <p className="data-card__detail">
              {card.municipalCount !== null ? `${formatInt(card.municipalCount)} personas · ` : ""}
              Referencia · {refLabel}: {cardValue(card, card.reference)}
            </p>
            <p className="data-card__detail">
              Diferencia: {card.difference === null ? "ND" : `${formatSigned(card.difference, card.precision)} ${card.differenceUnit}`}
            </p>
            <p className="data-card__detail">{card.definition}</p>
            <p className="data-card__detail">
              Período: {card.period} · Unidad: {card.unit}
            </p>
          </div>
        ))}
      </div>

      {view.narrative.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Lectura descriptiva</h3>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
            {view.narrative.map((line) => (
              <li key={line.ruleId} data-rule-id={line.ruleId}>
                {line.text}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-[var(--color-text-muted)]">
            Lectura determinista sobre los datos publicados; describe composición, sin atribuir causas.
          </p>
        </div>
      )}

      <div className="mt-6">
        <DataTableShell
          title="Tabla de estructura por edad y sexo"
          meta={{
            fuente: `INE · Censo Anual de Población 2025 (${data.source.table} / 68521)`,
            periodo: data.period,
            cobertura: `Municipio ${municipioNombre} · Referencia ${refLabel}`,
            estado: "consolidado",
            unidad: "personas · % · pp",
          }}
          toolbar={<DataTableToolbar tableId={tableId} />}
          footnote="ND: dato no disponible en la fuente (supresión o ausencia); no equivale a 0. pp: puntos porcentuales de peso sobre el total. Un 0 publicado es un valor observado."
        >
          <table id={tableId} className="socideas-table">
            <caption className="sr-only">
              Estructura de la población de {municipioNombre} por sexo y grupos quinquenales de edad en {data.period},
              con referencia {refLabel}: personas, porcentaje sobre el total y diferencia en puntos porcentuales.
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
                  Hombres (%)
                </th>
                <th scope="col" className="socideas-table__numeric">
                  Mujeres (%)
                </th>
                <th scope="col" className="socideas-table__numeric">
                  {refLabel} · Hombres (%)
                </th>
                <th scope="col" className="socideas-table__numeric">
                  {refLabel} · Mujeres (%)
                </th>
                <th scope="col" className="socideas-table__numeric">
                  Dif. Hombres (pp)
                </th>
                <th scope="col" className="socideas-table__numeric">
                  Dif. Mujeres (pp)
                </th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((row) => (
                <tr key={row.band}>
                  <th scope="row" className="socideas-table__text">
                    {row.band}
                  </th>
                  <td className="socideas-table__numeric">{formatInt(row.male)}</td>
                  <td className="socideas-table__numeric">{formatInt(row.female)}</td>
                  <td className="socideas-table__numeric">
                    {row.maleShare === null ? "ND" : `${formatNumber(row.maleShare, 1)} %`}
                  </td>
                  <td className="socideas-table__numeric">
                    {row.femaleShare === null ? "ND" : `${formatNumber(row.femaleShare, 1)} %`}
                  </td>
                  <td className="socideas-table__numeric">
                    {row.refMaleShare === null ? "ND" : `${formatNumber(row.refMaleShare, 1)} %`}
                  </td>
                  <td className="socideas-table__numeric">
                    {row.refFemaleShare === null ? "ND" : `${formatNumber(row.refFemaleShare, 1)} %`}
                  </td>
                  <td className="socideas-table__numeric">{formatSigned(row.maleDiffPp, 1)}</td>
                  <td className="socideas-table__numeric">{formatSigned(row.femaleDiffPp, 1)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="socideas-table__text">
                  Todas las edades
                </th>
                <td className="socideas-table__numeric">{formatInt(view.municipalMale)}</td>
                <td className="socideas-table__numeric">{formatInt(view.municipalFemale)}</td>
                <td className="socideas-table__numeric">
                  {sharePct(view.municipalMale, view.municipalTotal) === null
                    ? "ND"
                    : `${formatNumber(sharePct(view.municipalMale, view.municipalTotal), 1)} %`}
                </td>
                <td className="socideas-table__numeric">
                  {sharePct(view.municipalFemale, view.municipalTotal) === null
                    ? "ND"
                    : `${formatNumber(sharePct(view.municipalFemale, view.municipalTotal), 1)} %`}
                </td>
                <td className="socideas-table__numeric">
                  {sharePct(view.refMale, view.refTotal) === null ? "ND" : `${formatNumber(sharePct(view.refMale, view.refTotal), 1)} %`}
                </td>
                <td className="socideas-table__numeric">
                  {sharePct(view.refFemale, view.refTotal) === null
                    ? "ND"
                    : `${formatNumber(sharePct(view.refFemale, view.refTotal), 1)} %`}
                </td>
                <td className="socideas-table__numeric">
                  {sharePct(view.municipalMale, view.municipalTotal) === null || sharePct(view.refMale, view.refTotal) === null
                    ? "ND"
                    : formatSigned(sharePct(view.municipalMale, view.municipalTotal)! - sharePct(view.refMale, view.refTotal)!, 1)}
                </td>
                <td className="socideas-table__numeric">
                  {sharePct(view.municipalFemale, view.municipalTotal) === null || sharePct(view.refFemale, view.refTotal) === null
                    ? "ND"
                    : formatSigned(
                        sharePct(view.municipalFemale, view.municipalTotal)! - sharePct(view.refFemale, view.refTotal)!,
                        1,
                      )}
                </td>
              </tr>
            </tfoot>
          </table>
        </DataTableShell>
      </div>
    </section>
  );
}
