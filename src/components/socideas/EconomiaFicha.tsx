"use client";

import Link from "next/link";
import EvolutionChart, { type SerieEvo } from "./EvolutionChart";
import Traceability from "./Traceability";
import DataTableShell from "./DataTableShell";
import DataTableToolbar from "./DataTableToolbar";
import TableWorkspace from "./TableWorkspace";
import AvailabilitySummary, { AvailableIndicators } from "./AvailabilitySummary";
import IndicatorAvailabilityPanel from "./IndicatorAvailabilityPanel";
import {
  ComparadorPeriodos,
  FiltroTabla,
  FuenteOficial,
  HerramientasConsulta,
  Metodologia,
} from "./ConsultaTools";
import { isRealValue, type CoverageEntry } from "@/lib/socideas-availability";
import type { IndicatorValue, PerfilEconomico } from "@/lib/socideas";

function slugOf(v: IndicatorValue): string {
  return (v.indicator as unknown as { slug?: string } | undefined)?.slug ?? "";
}

function fmt(n: number | null, dec = 0): string {
  if (!isRealValue(n)) return "ND";
  return n.toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function filasPorSlug(valores: IndicatorValue[], slug: string): IndicatorValue[] {
  return valores
    .filter((v) => slugOf(v) === slug && isRealValue(v.valor_numerico))
    .sort((a, b) => (a.anio_referencia ?? 0) - (b.anio_referencia ?? 0));
}

function ultimo(valores: IndicatorValue[], slug: string, ambito = "municipio"): IndicatorValue | null {
  const list = filasPorSlug(valores, slug).filter((v) => (v.dimensiones?.ambito ?? "municipio") === ambito);
  return list.length > 0 ? list[list.length - 1] : null;
}

function serie(valores: IndicatorValue[], slug: string, ambito = "municipio"): { anio: number; valor: number }[] {
  return filasPorSlug(valores, slug)
    .filter((v) => (v.dimensiones?.ambito ?? "municipio") === ambito)
    .map((v) => ({ anio: v.anio_referencia ?? 0, valor: v.valor_numerico as number }));
}

function fuenteDe(v: IndicatorValue | null): string {
  if (!v) return "";
  const org = (v.source as unknown as { organismo?: string } | undefined)?.organismo ?? "";
  return `${org} · ${v.anio_referencia ?? "—"}`;
}

const RENTA_SLUGS = ["irpf_declaraciones", "irpf_renta_bruta_media", "irpf_renta_disponible_media", "renta_neta_media_persona", "renta_neta_media_hogar", "renta_bruta_media_persona", "renta_bruta_media_hogar"];
const DESIGUALDAD_SLUGS = ["gini", "p80_p20"];
const EMPRESAS_SLUGS = ["empresas_total", "empresas_industria", "empresas_construccion", "empresas_servicios", "empresas_comercio_hosteleria"];
const AGR_SLUGS = ["agr_sau_total", "agr_tierra_arable", "agr_cultivos_lenosos", "agr_pastos", "agr_huertos", "agr_explotaciones"];
const GAN_SLUGS = ["gan_bovino_exp", "gan_bovino_cab", "gan_ovino_caprino_exp", "gan_ovino_caprino_cab", "gan_porcino_exp", "gan_porcino_cab", "gan_aves_exp", "gan_aves_cab", "gan_ug_total"];

export default function EconomiaFicha({
  codigoINE,
  initial,
}: {
  codigoINE: string;
  initial: PerfilEconomico;
}) {
  const { valores, municipio } = initial;

  const hasData = (slugs: string[]): boolean => slugs.some((s) => filasPorSlug(valores, s).length > 0);
  const countData = (slugs: string[]): number => slugs.filter((s) => filasPorSlug(valores, s).length > 0).length;
  const lastYear = (slugs: string[]): number | null => {
    const anios = slugs.flatMap((s) => filasPorSlug(valores, s).map((v) => v.anio_referencia ?? 0)).filter((a) => a > 0);
    return anios.length > 0 ? Math.max(...anios) : null;
  };

  const rentaOk = hasData(RENTA_SLUGS);
  const desigOk = hasData(DESIGUALDAD_SLUGS);
  const empOk = hasData(EMPRESAS_SLUGS);
  const agrOk = hasData(AGR_SLUGS);
  const ganOk = hasData(GAN_SLUGS);

  const sincronizado = initial.sincronizado;
  if (!sincronizado) {
    return (
      <div>
        <div className="ideas-status" data-state="pending" role="status">
          <div className="ideas-status__head">
            <p className="ideas-status__title">Economía en preparación</p>
            <span className="ideas-status__badge">Pendiente</span>
          </div>
          <div className="ideas-status__body">
            <p>
              Este municipio aún no tiene su bloque económico sincronizado. La sincronización la realiza
              el equipo técnico desde el servidor con fuentes oficiales; ningún dato se muestra sin
              trazabilidad.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---- Visión general: solo indicadores reales, ordenados por utilidad analítica ----
  const rentaNetaPersona = ultimo(valores, "renta_neta_media_persona");
  const rentaNetaHogar = ultimo(valores, "renta_neta_media_hogar");
  const empTotal = ultimo(valores, "empresas_total");
  const gini = ultimo(valores, "gini");
  const p80 = ultimo(valores, "p80_p20");
  const irpfBruta = ultimo(valores, "irpf_renta_bruta_media");
  const irpfDisp = ultimo(valores, "irpf_renta_disponible_media");
  const rentaBrutaHogar = ultimo(valores, "renta_bruta_media_hogar");

  const candidatos = [
    rentaNetaPersona && isRealValue(rentaNetaPersona.valor_numerico)
      ? { etiqueta: "Renta neta media por persona", valor: `${fmt(rentaNetaPersona.valor_numerico)} €`, detalle: fuenteDe(rentaNetaPersona) } : null,
    rentaNetaHogar && isRealValue(rentaNetaHogar.valor_numerico)
      ? { etiqueta: "Renta neta media por hogar", valor: `${fmt(rentaNetaHogar.valor_numerico)} €`, detalle: fuenteDe(rentaNetaHogar) } : null,
    empTotal && isRealValue(empTotal.valor_numerico)
      ? { etiqueta: "Empresas activas", valor: fmt(empTotal.valor_numerico), detalle: fuenteDe(empTotal) } : null,
    gini && isRealValue(gini.valor_numerico)
      ? { etiqueta: "Índice de Gini", valor: fmt(gini.valor_numerico, 1), detalle: fuenteDe(gini) } : null,
    p80 && isRealValue(p80.valor_numerico)
      ? { etiqueta: "Ratio P80/P20", valor: fmt(p80.valor_numerico, 1), detalle: fuenteDe(p80) } : null,
    irpfBruta && isRealValue(irpfBruta.valor_numerico)
      ? { etiqueta: "Renta bruta media por declaración", valor: `${fmt(irpfBruta.valor_numerico)} €`, detalle: fuenteDe(irpfBruta) } : null,
    irpfDisp && isRealValue(irpfDisp.valor_numerico)
      ? { etiqueta: "Renta disponible media por declaración", valor: `${fmt(irpfDisp.valor_numerico)} €`, detalle: fuenteDe(irpfDisp) } : null,
    rentaBrutaHogar && isRealValue(rentaBrutaHogar.valor_numerico)
      ? { etiqueta: "Renta bruta media por hogar", valor: `${fmt(rentaBrutaHogar.valor_numerico)} €`, detalle: fuenteDe(rentaBrutaHogar) } : null,
  ].filter((k): k is NonNullable<typeof k> => k !== null);
  const kpis = candidatos.slice(0, 4);

  const bloquesConDatos = [rentaOk, desigOk, empOk, agrOk, ganOk].filter(Boolean).length;
  const fuentesResumen = [...new Set(valores.map((v) => (v.source as unknown as { organismo?: string } | undefined)?.organismo ?? "").filter(Boolean))];
  const ultimoAnioGlobal = lastYear([...RENTA_SLUGS, ...DESIGUALDAD_SLUGS, ...EMPRESAS_SLUGS, ...AGR_SLUGS, ...GAN_SLUGS]);

  // ---- Empresas (partición sin doble conteo) ----
  const empInd = ultimo(valores, "empresas_industria");
  const empCon = ultimo(valores, "empresas_construccion");
  const empSer = ultimo(valores, "empresas_servicios");
  const empCom = ultimo(valores, "empresas_comercio_hosteleria");
  const empTotalV = empTotal?.valor_numerico ?? null;
  const empSerV = empSer?.valor_numerico ?? null;
  const empComV = empCom?.valor_numerico ?? null;
  const empRestoV = empSerV !== null && empComV !== null ? empSerV - empComV : null;
  const pct = (v: number | null): number | null =>
    v === null || empTotalV === null || empTotalV === 0 ? null : Math.round((v / empTotalV) * 1000) / 10;

  // ---- Agrario / ganadería ----
  const agrSau = ultimo(valores, "agr_sau_total");
  const agrExp = ultimo(valores, "agr_explotaciones");
  const agrCats = [
    { e: "Tierra arable", v: ultimo(valores, "agr_tierra_arable")?.valor_numerico ?? null },
    { e: "Cultivos leñosos", v: ultimo(valores, "agr_cultivos_lenosos")?.valor_numerico ?? null },
    { e: "Pastos permanentes", v: ultimo(valores, "agr_pastos")?.valor_numerico ?? null },
    { e: "Huertos", v: ultimo(valores, "agr_huertos")?.valor_numerico ?? null },
  ].filter((c) => c.v !== null);
  const agrSuma = agrCats.reduce((a, c) => a + (c.v ?? 0), 0);
  const especies = [
    { nombre: "Bovino", exp: ultimo(valores, "gan_bovino_exp")?.valor_numerico ?? null, cab: ultimo(valores, "gan_bovino_cab")?.valor_numerico ?? null },
    { nombre: "Ovino y caprino", exp: ultimo(valores, "gan_ovino_caprino_exp")?.valor_numerico ?? null, cab: ultimo(valores, "gan_ovino_caprino_cab")?.valor_numerico ?? null },
    { nombre: "Porcino", exp: ultimo(valores, "gan_porcino_exp")?.valor_numerico ?? null, cab: ultimo(valores, "gan_porcino_cab")?.valor_numerico ?? null },
    { nombre: "Aves de corral", exp: ultimo(valores, "gan_aves_exp")?.valor_numerico ?? null, cab: ultimo(valores, "gan_aves_cab")?.valor_numerico ?? null },
  ].filter((s) => s.exp !== null || s.cab !== null);

  const giniSerie: SerieEvo[] = [
    { clave: "gini", etiqueta: `${municipio.nombre} · Municipio`, color: "var(--color-secondary)", puntos: serie(valores, "gini") },
  ];
  const p80Serie: SerieEvo[] = [
    { clave: "p80", etiqueta: `${municipio.nombre} · Municipio`, color: "var(--color-secondary)", puntos: serie(valores, "p80_p20") },
  ];
  const rentaNetaSerie = serie(valores, "renta_neta_media_persona");
  const rentaAnios = [...new Set(
    RENTA_SLUGS.flatMap((s) => filasPorSlug(valores, s).map((v) => v.anio_referencia ?? 0)),
  )].filter((a) => a > 0).sort((a, b) => a - b);

  const vista = [
    `Bloques con datos: ${bloquesConDatos} de 5`,
    `Última sincronización económica: ${initial.ultima_sincronizacion ?? "—"}`,
  ];

  const cobertura: CoverageEntry[] = [];
  if (!rentaOk) cobertura.push({ titulo: "Renta y capacidad económica", estado: "pending", detalle: "Pendiente de incorporación: requiere AEAT EDM (fichero del ejercicio) o ADRH municipal. No se rellena con valores." });
  if (!desigOk) cobertura.push({ titulo: "Desigualdad (Gini, P80/P20)", estado: "pending", detalle: "Pendiente de incorporación vía ADRH. En municipios de menos de 100 residentes no se difunde por secreto estadístico." });
  if (!empOk) cobertura.push({ titulo: "Tejido empresarial", estado: "pending", detalle: "Pendiente de incorporación vía DIRCE." });
  if (!agrOk) cobertura.push({ titulo: "Estructura agraria", estado: "pending", detalle: "Pendiente de incorporación vía Censo Agrario. Indicador estructural, no anual." });
  if (!ganOk) cobertura.push({ titulo: "Ganadería", estado: "pending", detalle: "Sin cobertura verificable en este municipio (Censo Agrario 2020 con secreto estadístico)." });
  cobertura.push({ titulo: "Empleo y desempleo (paro registrado)", estado: "pending", detalle: "Pendiente de conector SEPE en batch 1 (dry-run). No se muestra como cero." });
  cobertura.push({ titulo: "Afiliación a la Seguridad Social", estado: "pending", detalle: "Pendiente de conector TGSS en batch 1 (dry-run). Valores “<5” se tratarán como ausencia con bandera, nunca como cero." });
  cobertura.push({ titulo: "Presupuesto municipal, liquidación y ayudas", estado: "without_coverage", detalle: "La fuente no publica este indicador de forma homogénea para el municipio. No se presentan presupuestos previstos como liquidación real." });
  cobertura.push({ titulo: "Fuente provisional", estado: "provisional", detalle: "No hay fuente provisional configurada para economía (ADRH provisional 2024 excluido). Se conserva el último dato consolidado." });
  if (lastYear(DESIGUALDAD_SLUGS) !== null && lastYear(EMPRESAS_SLUGS) !== null && lastYear(DESIGUALDAD_SLUGS) !== lastYear(EMPRESAS_SLUGS)) {
    cobertura.push({ titulo: "Periodos con rezago", estado: "partial", detalle: `Desigualdad (ADRH ${lastYear(DESIGUALDAD_SLUGS)}) y empresas (DIRCE ${lastYear(EMPRESAS_SLUGS)}) son de operaciones distintas: no deben leerse como contemporáneas.` });
  }

  return (
    <div>
      {/* Visión general: solo KPIs reales */}
      <section aria-label="Visión general de la economía" className="mb-10">
        <h2 className="ideas-h2">Visión general</h2>
        <AvailabilitySummary
          bloque="Economía"
          disponibles={countData([...RENTA_SLUGS, ...DESIGUALDAD_SLUGS, ...EMPRESAS_SLUGS, ...AGR_SLUGS, ...GAN_SLUGS])}
          periodo={ultimoAnioGlobal ? String(ultimoAnioGlobal) : null}
          fuentes={fuentesResumen}
        />
        <AvailableIndicators
          kpis={kpis}
          emptyTitle="Sin indicadores económicos con valor"
          emptyDescription="La fuente no publica estos indicadores para el municipio. El detalle de cobertura figura al final; nada se rellena con ceros."
        />
        <p className="mt-3 text-xs text-[var(--color-text-muted)]">
          Contexto económico de {municipio.nombre} a partir de fuentes oficiales. Cada indicador
          declara su año de referencia y su fuente; cada subbloque funciona de forma autónoma.
        </p>
        <div className="mt-3">
          <Link
            href={`/socideas/${codigoINE}/descargas/economia`}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[var(--color-secondary)] border border-[var(--color-border)] rounded-xl hover:bg-[var(--color-input-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
          >
            Descargar tablas de Economía →
          </Link>
        </div>
      </section>

      {/* Herramientas de consulta (bajo el resumen, nunca por encima de los datos) */}
      <HerramientasConsulta>
        <ComparadorPeriodos serie={rentaNetaSerie} unidad="€" titulo="Comparador de renta neta por persona" />
        <FiltroTabla tableId={`tabla-renta-${codigoINE}`} anios={rentaAnios} placeholder="Filtrar renta por año o valor…" />
      </HerramientasConsulta>

      {/* Renta */}
      {rentaOk && (
        <section aria-label="Renta y capacidad económica" className="ideas-section">
          <h2 className="ideas-h2">Renta y capacidad económica</h2>
          <RentaCards valores={valores} />
          <RentaTable codigoINE={codigoINE} valores={valores} />
          <p className="ideas-note">
            Nota metodológica: importes medios por declaración (AEAT), no renta media por habitante. La renta
            por declaración depende de la modalidad de tributación (individual o conjunta) y no equivale
            a la renta de los hogares (ADRH) ni a la renta por persona. Ambas familias se presentan por
            separado y nunca se mezclan.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Metodologia
              nombre="Renta neta media por persona (ADRH)"
              definicion="Renta neta media por persona del Atlas de Distribución de Renta de los Hogares."
              fuente={fuenteDe(ultimo(valores, "renta_neta_media_persona")) || "INE · ADRH"}
              periodo={String(ultimo(valores, "renta_neta_media_persona")?.anio_referencia ?? "—")}
              cobertura={`Municipio ${municipio.nombre}`}
              estado="Consolidado"
              limitacion="No equivale a la renta por declaración (AEAT)."
            />
            <FuenteOficial url={ultimo(valores, "renta_neta_media_persona")?.source_url} />
          </div>
        </section>
      )}

      {/* Desigualdad */}
      {desigOk && (
        <section aria-label="Desigualdad" className="ideas-section">
          <h2 className="ideas-h2">Desigualdad</h2>
          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div>
              <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Evolución del índice de Gini</h3>
              <EvolutionChart series={giniSerie} id={`gini-${codigoINE}`} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Evolución del ratio P80/P20</h3>
              <EvolutionChart series={p80Serie} id={`p80-${codigoINE}`} />
            </div>
          </div>
          <div className="mt-4">
            <ComparadorPeriodos serie={serie(valores, "gini")} unidad="puntos" titulo="Comparador del índice de Gini" />
          </div>
          <Metodologia
            nombre="Gini y P80/P20 (ADRH)"
            definicion="El índice de Gini (0-100) mide la desigualdad de la renta por unidad de consumo; el ratio P80/P20 compara el percentil 80 con el 20."
            fuente="INE · Atlas de Distribución de Renta de los Hogares, serie 2015-2023"
            periodo={gini?.anio_referencia ? String(gini.anio_referencia) : "—"}
            cobertura="Municipios con 100 o más residentes"
            estado="Consolidado"
            limitacion="SOCideas no calcula estos indicadores: los reproduce de la fuente oficial."
          />
        </section>
      )}

      {/* Empresas */}
      {empOk && (
        <section aria-label="Tejido empresarial" className="ideas-section">
          <h2 className="ideas-h2">Tejido empresarial</h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            {isRealValue(empTotalV) ? `${fmt(empTotalV)} empresas` : "ND"} · {fuenteDe(empTotal)} · DIRCE, referencia a 1 de enero
          </p>
          <Barras
            filas={[
              { e: "Industria", v: empInd?.valor_numerico ?? null, p: pct(empInd?.valor_numerico ?? null) },
              { e: "Construcción", v: empCon?.valor_numerico ?? null, p: pct(empCon?.valor_numerico ?? null) },
              { e: "Comercio, transporte y hostelería", v: empComV, p: pct(empComV) },
              { e: "Resto de servicios", v: empRestoV, p: pct(empRestoV) },
            ].filter((r) => r.v !== null)}
          />
          <p className="ideas-note">
            Fuente: DIRCE (INE), empresas con sede en el municipio. Servicios en conjunto:{" "}
            {empSerV === null ? "ND" : `${fmt(empSerV)} (${pct(empSerV) ?? "—"} %)`}. El número de
            empresas no equivale al número de personas ocupadas. Desglose según tamaño municipal.
          </p>
        </section>
      )}

      {/* Agrario */}
      {agrOk && (
        <section aria-label="Estructura agraria" className="ideas-section">
          <h2 className="ideas-h2">Estructura agraria <span className="ideas-tag">Estructural · 2020</span></h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            {isRealValue(agrSau?.valor_numerico) ? `${fmt(agrSau?.valor_numerico ?? null)} ha` : "ND"} de superficie agraria
            {isRealValue(agrExp?.valor_numerico) ? ` · ${fmt(agrExp?.valor_numerico ?? null)} explotaciones` : ""} · {fuenteDe(agrSau ?? agrExp)}
          </p>
          <Barras
            unidad="ha"
            filas={agrCats.map((c) => ({
              e: c.e,
              v: c.v,
              p: c.v !== null && agrSuma > 0 ? Math.round((c.v / agrSuma) * 1000) / 10 : null,
            }))}
          />
          <p className="ideas-note">
            Indicador estructural del Censo Agrario 2020 (INE); no representa un dato anual actualizado.
            Unidad en hectáreas.
          </p>
        </section>
      )}

      {/* Ganadería */}
      {ganOk && (
        <section aria-label="Ganadería" className="ideas-section">
          <h2 className="ideas-h2">Ganadería <span className="ideas-tag">Estructural · 2020</span></h2>
          <TableWorkspace
            table={
              <DataTableShell
                title="Cabaña ganadera por especie"
                subtitle="Censo Agrario 2020 (estructural, no anual)"
                meta={{ fuente: fuenteDe(ultimo(valores, "gan_ug_total") ?? ultimo(valores, "gan_bovino_cab")).split("·")[0].trim() || "INE · Censo Agrario 2020", periodo: "2020", cobertura: `Municipio ${municipio.nombre}`, estado: "consolidado" }}
                toolbar={<DataTableToolbar tableId={`tabla-gan-${codigoINE}`} sourceUrl={ultimo(valores, "gan_ug_total")?.source_url ?? ultimo(valores, "gan_bovino_cab")?.source_url} />}
                footnote="ND = no difundido por secreto estadístico; nunca equivale a cero."
              >
                <table id={`tabla-gan-${codigoINE}`} className="socideas-table">
                  <caption className="sr-only">Cabaña ganadera por especie, Censo Agrario 2020</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="socideas-table__text">Especie</th>
                      <th scope="col" className="socideas-table__numeric">Explotaciones</th>
                      <th scope="col" className="socideas-table__numeric">Cabezas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {especies.map((s) => (
                      <tr key={s.nombre}>
                        <td className="socideas-table__text">{s.nombre}</td>
                        <td className="socideas-table__numeric">{s.exp === null ? "ND" : fmt(s.exp)}</td>
                        <td className="socideas-table__numeric">{s.cab === null ? "ND" : fmt(s.cab)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTableShell>
            }
          />
          <p className="ideas-note">
            Censo Agrario 2020 (INE). ND = no difundido por secreto estadístico; nunca equivale a cero.
          </p>
        </section>
      )}

      <IndicatorAvailabilityPanel entries={cobertura} />

      <Traceability valores={valores} pendientes={[]} vista={vista} />
    </div>
  );
}

function RentaCards({ valores }: { valores: IndicatorValue[] }) {
  const defs: { slug: string; etiqueta: string; suffix?: string }[] = [
    { slug: "irpf_declaraciones", etiqueta: "Declaraciones de IRPF" },
    { slug: "irpf_renta_bruta_media", etiqueta: "Renta bruta media por declaración", suffix: " €" },
    { slug: "irpf_renta_disponible_media", etiqueta: "Renta disponible media por declaración", suffix: " €" },
    { slug: "renta_neta_media_persona", etiqueta: "Renta neta media por habitante (ADRH)", suffix: " €" },
    { slug: "renta_neta_media_hogar", etiqueta: "Renta neta media por hogar (ADRH)", suffix: " €" },
    { slug: "renta_bruta_media_persona", etiqueta: "Renta bruta media por habitante (ADRH)", suffix: " €" },
    { slug: "renta_bruta_media_hogar", etiqueta: "Renta bruta media por hogar (ADRH)", suffix: " €" },
  ];
  const cards = defs
    .map((d) => ({ d, v: ultimo(valores, d.slug) }))
    .filter((x) => isRealValue(x.v?.valor_numerico));
  if (cards.length === 0) return null;
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map(({ d, v }) => (
        <div key={d.slug} className="data-card">
          <p className="data-card__label">{d.etiqueta}</p>
          <p className="data-card__value">{fmt(v?.valor_numerico ?? null)}{d.suffix ?? ""}</p>
          <p className="data-card__detail">{fuenteDe(v)}</p>
        </div>
      ))}
    </div>
  );
}

function Barras({ filas, unidad }: { filas: { e: string; v: number | null; p: number | null }[]; unidad?: string }) {
  if (filas.length === 0) return null;
  return (
    <div className="premium-card mt-4 p-5">
      <div className="flex flex-col gap-3">
        {filas.map((r) => (
          <div key={r.e}>
            <div className="flex justify-between gap-3 text-sm">
              <span className="font-medium text-[var(--color-text-primary)]">{r.e}</span>
              <span className="tabular-nums text-[var(--color-text-secondary)]">
                {r.v === null ? "ND" : `${fmt(r.v)}${unidad ? ` ${unidad}` : ""}`}
                {r.p !== null ? ` · ${r.p.toLocaleString("es-ES")} %` : ""}
              </span>
            </div>
            <div className="mt-1 h-3 overflow-hidden rounded bg-[var(--color-input-bg)]" role="img" aria-label={`${r.e}: ${r.v === null ? "no disponible" : r.v}`}>
              <div className="h-full rounded bg-[var(--color-secondary)]" style={{ width: `${r.p ?? 0}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RentaTable({ codigoINE, valores }: { codigoINE: string; valores: IndicatorValue[] }) {
  const cols = [
    { slug: "irpf_declaraciones", label: "Declaraciones" },
    { slug: "irpf_renta_bruta_media", label: "Bruta media/decl. (€)" },
    { slug: "irpf_renta_disponible_media", label: "Disponible media/decl. (€)" },
    { slug: "renta_neta_media_persona", label: "Neta/hab. (€)" },
    { slug: "renta_neta_media_hogar", label: "Neta/hogar (€)" },
    { slug: "renta_bruta_media_hogar", label: "Bruta/hogar (€)" },
  ];
  const val = (slug: string, anio: number): number | null =>
    filasPorSlug(valores, slug).find((v) => v.anio_referencia === anio)?.valor_numerico ?? null;
  const anios = [...new Set(
    cols.flatMap((c) => filasPorSlug(valores, c.slug).map((v) => v.anio_referencia ?? 0)),
  )].filter((a) => a > 0).sort((a, b) => a - b);
  // Oculta columnas completamente vacías: nunca una columna de guiones.
  const visibles = cols.filter((c) => anios.some((a) => val(c.slug, a) !== null));
  if (anios.length === 0 || visibles.length === 0) return null;
  const primera = ultimo(valores, visibles[0].slug);
  const fuenteCorta = (primera?.source as unknown as { organismo?: string } | undefined)?.organismo ?? "AEAT · INE ADRH";
  return (
    <DataTableShell
      title="Tabla anual de renta"
      subtitle="AEAT por declaración y ADRH por persona/hogar, sin mezclar"
      meta={{ fuente: fuenteCorta, periodo: `${anios[0]}–${anios[anios.length - 1]}`, cobertura: undefined, estado: "consolidado" }}
      toolbar={<DataTableToolbar tableId={`tabla-renta-${codigoINE}`} sourceUrl={primera?.source_url} />}
    >
      <table id={`tabla-renta-${codigoINE}`} className="socideas-table">
        <thead>
          <tr>
            <th scope="col" className="socideas-table__year">Año</th>
            {visibles.map((c) => (<th scope="col" key={c.slug} className="socideas-table__numeric">{c.label}</th>))}
          </tr>
        </thead>
        <tbody>
          {anios.map((a) => (
            <tr key={a}>
              <td className="socideas-table__year">{a}</td>
              {visibles.map((c) => (<td key={c.slug} className="socideas-table__numeric">{fmt(val(c.slug, a))}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </DataTableShell>
  );
}
