"use client";

import StatCard from "./StatCard";
import EvolutionChart, { type SerieEvo } from "./EvolutionChart";
import Traceability from "./Traceability";
import CopyTableButton from "./CopyTableButton";
import StatusCard, { type BlockState } from "./StatusCard";
import type { IndicatorValue, PerfilEconomico } from "@/lib/socideas";

const PENDIENTE_TEXTO =
  "Este indicador requiere la integración de una fuente oficial estatal, autonómica o municipal cuya cobertura todavía no es homogénea para todos los municipios.";

function slugOf(v: IndicatorValue): string {
  return (v.indicator as unknown as { slug?: string } | undefined)?.slug ?? "";
}

function fmt(n: number | null, dec = 0): string {
  if (n === null) return "—";
  return n.toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function filasPorSlug(valores: IndicatorValue[], slug: string): IndicatorValue[] {
  return valores
    .filter((v) => slugOf(v) === slug && v.valor_numerico !== null)
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

export default function EconomiaFicha({
  codigoINE,
  initial,
}: {
  codigoINE: string;
  initial: PerfilEconomico;
}) {
  const { valores, municipio } = initial;

  const bloques: { clave: string; titulo: string; state: BlockState; ultimoAnio: number | null; n: number }[] = [
    bloque("Renta y capacidad económica", ["irpf_declaraciones", "irpf_renta_bruta_media", "irpf_renta_disponible_media", "renta_neta_media_persona", "renta_neta_media_hogar", "renta_bruta_media_persona", "renta_bruta_media_hogar"]),
    bloque("Desigualdad", ["gini", "p80_p20"]),
    bloque("Tejido empresarial", ["empresas_total", "empresas_industria", "empresas_construccion", "empresas_servicios", "empresas_comercio_hosteleria"]),
    bloque("Estructura agraria", ["agr_sau_total", "agr_tierra_arable", "agr_cultivos_lenosos", "agr_pastos", "agr_huertos", "agr_explotaciones"]),
    bloque("Ganadería", ["gan_bovino_exp", "gan_bovino_cab", "gan_ovino_caprino_exp", "gan_ovino_caprino_cab", "gan_porcino_exp", "gan_porcino_cab", "gan_aves_exp", "gan_aves_cab", "gan_ug_total"]),
  ];

  function bloque(titulo: string, slugs: string[]): { clave: string; titulo: string; state: BlockState; ultimoAnio: number | null; n: number } {
    const hay = slugs.filter((s) => filasPorSlug(valores, s).length > 0);
    const anios = hay.flatMap((s) => filasPorSlug(valores, s).map((v) => v.anio_referencia ?? 0));
    return {
      clave: titulo,
      titulo,
      state: hay.length === 0 ? "pending" : hay.length < slugs.length ? "partial" : "ok",
      ultimoAnio: anios.length > 0 ? Math.max(...anios) : null,
      n: hay.length,
    };
  }

  const sincronizado = initial.sincronizado;
  const vista = [
    `Bloques con datos: ${bloques.filter((b) => b.state !== "pending").length} de ${bloques.length}`,
    `Última sincronización económica: ${initial.ultima_sincronizacion ?? "—"}`,
  ];

  if (!sincronizado) {
    return (
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
    );
  }

  const gini = ultimo(valores, "gini");
  const p80 = ultimo(valores, "p80_p20");
  const giniSerie: SerieEvo[] = [
    { clave: "gini", etiqueta: `${municipio.nombre} · Municipio`, color: "var(--color-secondary)", puntos: serie(valores, "gini") },
  ];
  const p80Serie: SerieEvo[] = [
    { clave: "p80", etiqueta: `${municipio.nombre} · Municipio`, color: "var(--color-secondary)", puntos: serie(valores, "p80_p20") },
  ];

  const empTotal = ultimo(valores, "empresas_total");
  const empInd = ultimo(valores, "empresas_industria");
  const empCon = ultimo(valores, "empresas_construccion");
  const empSer = ultimo(valores, "empresas_servicios");
  const empCom = ultimo(valores, "empresas_comercio_hosteleria");
  const empTotalV = empTotal?.valor_numerico ?? null;
  const empSerV = empSer?.valor_numerico ?? null;
  const empComV = empCom?.valor_numerico ?? null;
  // Partición sin doble conteo: industria + construcción + comercio/host. + resto.
  const empRestoV = empSerV !== null && empComV !== null ? empSerV - empComV : null;
  const pct = (v: number | null): number | null =>
    v === null || empTotalV === null || empTotalV === 0 ? null : Math.round((v / empTotalV) * 1000) / 10;

  const agrSau = ultimo(valores, "agr_sau_total");
  const agrExp = ultimo(valores, "agr_explotaciones");
  const agrCats = [
    { e: "Tierra arable", v: ultimo(valores, "agr_tierra_arable")?.valor_numerico ?? null },
    { e: "Cultivos leñosos", v: ultimo(valores, "agr_cultivos_lenosos")?.valor_numerico ?? null },
    { e: "Pastos permanentes", v: ultimo(valores, "agr_pastos")?.valor_numerico ?? null },
    { e: "Huertos", v: ultimo(valores, "agr_huertos")?.valor_numerico ?? null },
  ];
  const agrSuma = agrCats.reduce((a, c) => a + (c.v ?? 0), 0);

  const especies = [
    { nombre: "Bovino", exp: ultimo(valores, "gan_bovino_exp")?.valor_numerico ?? null, cab: ultimo(valores, "gan_bovino_cab")?.valor_numerico ?? null },
    { nombre: "Ovino y caprino", exp: ultimo(valores, "gan_ovino_caprino_exp")?.valor_numerico ?? null, cab: ultimo(valores, "gan_ovino_caprino_cab")?.valor_numerico ?? null },
    { nombre: "Porcino", exp: ultimo(valores, "gan_porcino_exp")?.valor_numerico ?? null, cab: ultimo(valores, "gan_porcino_cab")?.valor_numerico ?? null },
    { nombre: "Aves de corral", exp: ultimo(valores, "gan_aves_exp")?.valor_numerico ?? null, cab: ultimo(valores, "gan_aves_cab")?.valor_numerico ?? null },
  ];

  return (
    <div>
      {/* Visión general */}
      <section aria-label="Visión general de la economía" className="mb-10">
        <h2 className="ideas-h2">Visión general</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {bloques.map((b) => (
            <StatCard
              key={b.clave}
              etiqueta={b.titulo}
              valor={b.state === "pending" ? "Pendiente" : `${b.n} indicadores · ${b.ultimoAnio ?? "—"}`}
              detalle={b.state === "pending" ? "Sin cobertura verificada" : `Último año disponible`}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-[var(--color-text-muted)]">
          Contexto económico de {municipio.nombre} a partir de fuentes oficiales. Cada subbloque funciona
          de forma autónoma y declara su año de referencia y su fuente.
        </p>
      </section>

      {/* Renta */}
      <section aria-label="Renta y capacidad económica" className="ideas-section">
        <h2 className="ideas-h2">Renta y capacidad económica</h2>
        {bloques[0].state === "pending" ? (
          <PendingBlock titulo="Renta y capacidad económica" />
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard etiqueta="Declaraciones de IRPF" valor={fmt(ultimo(valores, "irpf_declaraciones")?.valor_numerico ?? null)} detalle={fuenteDe(ultimo(valores, "irpf_declaraciones"))} />
              <StatCard etiqueta="Renta bruta media por declaración" valor={`${fmt(ultimo(valores, "irpf_renta_bruta_media")?.valor_numerico ?? null)} €`} detalle={fuenteDe(ultimo(valores, "irpf_renta_bruta_media"))} />
              <StatCard etiqueta="Renta disponible media por declaración" valor={`${fmt(ultimo(valores, "irpf_renta_disponible_media")?.valor_numerico ?? null)} €`} detalle={fuenteDe(ultimo(valores, "irpf_renta_disponible_media"))} />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <StatCard etiqueta="Renta neta media por habitante (ADRH)" valor={`${fmt(ultimo(valores, "renta_neta_media_persona")?.valor_numerico ?? null)} €`} detalle={fuenteDe(ultimo(valores, "renta_neta_media_persona"))} />
              <StatCard etiqueta="Renta neta media por hogar (ADRH)" valor={`${fmt(ultimo(valores, "renta_neta_media_hogar")?.valor_numerico ?? null)} €`} detalle={fuenteDe(ultimo(valores, "renta_neta_media_hogar"))} />
              <StatCard etiqueta="Renta bruta media por habitante (ADRH)" valor={`${fmt(ultimo(valores, "renta_bruta_media_persona")?.valor_numerico ?? null)} €`} detalle={fuenteDe(ultimo(valores, "renta_bruta_media_persona"))} />
              <StatCard etiqueta="Renta bruta media por hogar (ADRH)" valor={`${fmt(ultimo(valores, "renta_bruta_media_hogar")?.valor_numerico ?? null)} €`} detalle={fuenteDe(ultimo(valores, "renta_bruta_media_hogar"))} />
            </div>
            <RentaTable codigoINE={codigoINE} valores={valores} />
            <p className="ideas-note">
              Nota metodológica: importes medios por declaración, no renta media por habitante. La renta
              por declaración depende de la modalidad de tributación (individual o conjunta) y no equivale
              a la renta de los hogares (ADRH) ni a la renta por persona.
            </p>
          </>
        )}
      </section>

      {/* Desigualdad */}
      <section aria-label="Desigualdad" className="ideas-section">
        <h2 className="ideas-h2">Desigualdad</h2>
        {bloques[1].state === "pending" ? (
          <PendingBlock titulo="Desigualdad" />
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <StatCard etiqueta="Índice de Gini" valor={gini?.valor_numerico !== null && gini?.valor_numerico !== undefined ? `${fmt(gini.valor_numerico, 1)}` : "—"} detalle={fuenteDe(gini)} />
              <StatCard etiqueta="Ratio P80/P20" valor={p80?.valor_numerico !== null && p80?.valor_numerico !== undefined ? `${fmt(p80.valor_numerico, 1)}` : "—"} detalle={fuenteDe(p80)} />
            </div>
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
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--color-secondary)]">Ayuda metodológica</summary>
              <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
                El índice de Gini (0-100) mide la desigualdad de la renta por unidad de consumo; el ratio
                P80/P20 compara el percentil 80 con el 20. Fuente: Atlas de Distribución de Renta de los
                Hogares (INE), serie 2015-2023, solo municipios con 100 o más residentes. SOCideas no
                calcula estos indicadores: los reproduce de la fuente oficial.
              </p>
            </details>
          </>
        )}
      </section>

      {/* Empresas */}
      <section aria-label="Tejido empresarial" className="ideas-section">
        <h2 className="ideas-h2">Tejido empresarial</h2>
        {bloques[2].state === "pending" ? (
          <PendingBlock titulo="Tejido empresarial" />
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <StatCard etiqueta="Total de empresas" valor={fmt(empTotalV)} detalle={fuenteDe(empTotal)} />
              <StatCard etiqueta="Año de referencia" valor={empTotal?.anio_referencia ? String(empTotal.anio_referencia) : "—"} detalle="DIRCE, referencia a 1 de enero" />
            </div>
            <Barras
              filas={[
                { e: "Industria", v: empInd?.valor_numerico ?? null, p: pct(empInd?.valor_numerico ?? null) },
                { e: "Construcción", v: empCon?.valor_numerico ?? null, p: pct(empCon?.valor_numerico ?? null) },
                { e: "Comercio, transporte y hostelería", v: empComV, p: pct(empComV) },
                { e: "Resto de servicios", v: empRestoV, p: pct(empRestoV) },
              ]}
            />
            <p className="ideas-note">
              Fuente: DIRCE (INE), empresas con sede en el municipio. Servicios en conjunto:{" "}
              {empSerV === null ? "ND" : `${fmt(empSerV)} (${pct(empSerV) ?? "—"} %)`}. El número de
              empresas no equivale al número de personas ocupadas. Desglose según tamaño municipal.
            </p>
          </>
        )}
      </section>

      {/* Agrario */}
      <section aria-label="Estructura agraria" className="ideas-section">
        <h2 className="ideas-h2">Estructura agraria <span className="ideas-tag">Estructural · 2020</span></h2>
        {bloques[3].state === "pending" ? (
          <PendingBlock titulo="Estructura agraria" />
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <StatCard etiqueta="Superficie agraria censada" valor={`${fmt(agrSau?.valor_numerico ?? null)} ha`} detalle={fuenteDe(agrSau)} />
              <StatCard etiqueta="Explotaciones agrarias" valor={fmt(agrExp?.valor_numerico ?? null)} detalle={fuenteDe(agrExp)} />
            </div>
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
          </>
        )}
      </section>

      {/* Ganadería */}
      <section aria-label="Ganadería" className="ideas-section">
        <h2 className="ideas-h2">Ganadería <span className="ideas-tag">Estructural · 2020</span></h2>
        {bloques[4].state === "pending" ? (
          <PendingBlock titulo="Ganadería" />
        ) : (
          <>
            {(ultimo(valores, "gan_ug_total")?.valor_numerico ?? null) !== null && (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <StatCard etiqueta="Unidades ganaderas totales" valor={fmt(ultimo(valores, "gan_ug_total")?.valor_numerico ?? null)} detalle={fuenteDe(ultimo(valores, "gan_ug_total"))} />
              </div>
            )}
            <div className="mt-3 overflow-x-auto">
              <table id={`tabla-gan-${codigoINE}`} className="ideas-table">
                <thead>
                  <tr>
                    <th>Especie</th>
                    <th className="text-right">Explotaciones</th>
                    <th className="text-right">Cabezas</th>
                  </tr>
                </thead>
                <tbody>
                  {especies.map((s) => (
                    <tr key={s.nombre}>
                      <td>{s.nombre}</td>
                      <td className="text-right">{s.exp === null ? "ND" : fmt(s.exp)}</td>
                      <td className="text-right">{s.cab === null ? "ND" : fmt(s.cab)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3">
              <CopyTableButton tableId={`tabla-gan-${codigoINE}`} label="Copiar" />
            </div>
            <p className="ideas-note">
              Censo Agrario 2020 (INE). ND = no difundido por secreto estadístico; nunca equivale a cero.
            </p>
          </>
        )}
      </section>

      {/* Pendientes */}
      <section aria-label="Indicadores pendientes" className="ideas-section">
        <h2 className="ideas-h2">Indicadores pendientes</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {["Empleo y desempleo", "Afiliación a la Seguridad Social", "Presupuesto municipal", "Ayudas y subvenciones", "Suelo industrial"].map((t) => (
            <StatusCard key={t} state="pending" titulo={t}>
              <p>{PENDIENTE_TEXTO}</p>
            </StatusCard>
          ))}
        </div>
      </section>

      <Traceability valores={valores} pendientes={[]} vista={vista} />
    </div>
  );
}

function PendingBlock({ titulo }: { titulo: string }) {
  return (
    <StatusCard state="pending" titulo={titulo}>
      <p>{PENDIENTE_TEXTO}</p>
    </StatusCard>
  );
}

function Barras({ filas, unidad }: { filas: { e: string; v: number | null; p: number | null }[]; unidad?: string }) {
  return (
    <div className="mt-4 rounded-[var(--border-radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-card-bg)] p-5">
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
  const anios = [...new Set(
    ["irpf_declaraciones", "irpf_renta_bruta_media", "irpf_renta_disponible_media", "renta_neta_media_persona", "renta_neta_media_hogar", "renta_bruta_media_hogar"]
      .flatMap((s) => filasPorSlug(valores, s).map((v) => v.anio_referencia ?? 0)),
  )].filter((a) => a > 0).sort((a, b) => a - b);
  const val = (slug: string, anio: number): number | null =>
    filasPorSlug(valores, slug).find((v) => v.anio_referencia === anio)?.valor_numerico ?? null;
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Tabla anual de renta</h3>
        <CopyTableButton tableId={`tabla-renta-${codigoINE}`} label="Copiar" />
      </div>
      <div className="mt-3 overflow-x-auto">
        <table id={`tabla-renta-${codigoINE}`} className="ideas-table">
          <thead>
            <tr>
              <th>Año</th>
              <th className="text-right">Declaraciones</th>
              <th className="text-right">Bruta media/decl. (€)</th>
              <th className="text-right">Disponible media/decl. (€)</th>
              <th className="text-right">Neta/hab. (€)</th>
              <th className="text-right">Neta/hogar (€)</th>
              <th className="text-right">Bruta/hogar (€)</th>
            </tr>
          </thead>
          <tbody>
            {anios.map((a) => (
              <tr key={a}>
                <td>{a}</td>
                <td className="text-right">{fmt(val("irpf_declaraciones", a))}</td>
                <td className="text-right">{fmt(val("irpf_renta_bruta_media", a))}</td>
                <td className="text-right">{fmt(val("irpf_renta_disponible_media", a))}</td>
                <td className="text-right">{fmt(val("renta_neta_media_persona", a))}</td>
                <td className="text-right">{fmt(val("renta_neta_media_hogar", a))}</td>
                <td className="text-right">{fmt(val("renta_bruta_media_hogar", a))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
