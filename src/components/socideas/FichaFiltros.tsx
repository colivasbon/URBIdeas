"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import StatCard from "./StatCard";
import EvolutionChart, { type SerieEvo } from "./EvolutionChart";
import PyramidChart from "./PyramidChart";
import Traceability from "./Traceability";
import AvailabilitySummary from "./AvailabilitySummary";
import IndicatorAvailabilityPanel from "./IndicatorAvailabilityPanel";
import DataTableShell from "./DataTableShell";
import DataTableMeta from "./DataTableMeta";
import DataTableToolbar from "./DataTableToolbar";
import TableWorkspace from "./TableWorkspace";
import { SERIES_MAX_HEIGHT, SERIES_SCROLL_THRESHOLD } from "@/lib/socideas-table-density";
import {
  ComparadorPeriodos,
  FuenteOficial,
  Metodologia,
} from "./ConsultaTools";
import type { CoverageEntry } from "@/lib/socideas-availability";
import type { AmbitoTerritorial, PerfilDemografico, IndicatorValue } from "@/lib/socideas";
import { AMBITOS } from "@/lib/socideas";

type SexoModo = "total" | "hombres" | "mujeres" | "comparar";
type PirModo = "abs" | "pct";

interface FiltrosUI {
  anio: number | null;
  sexo: SexoModo;
  evoDesde: number | null;
  evoHasta: number | null;
  comparar: AmbitoTerritorial[];
  pirAnio: number | null;
  pirModo: PirModo;
}

const DEFAULT_COMPARAR: AmbitoTerritorial[] = ["municipio"];

const AMBITO_LABEL: Record<AmbitoTerritorial, string> = {
  municipio: "Municipio",
  provincia: "Provincia",
  ccaa: "CCAA",
  espana: "España",
};

const SERIE_COLOR: Record<AmbitoTerritorial, string> = {
  municipio: "var(--color-secondary)",
  provincia: "var(--color-primary)",
  ccaa: "#b7791f",
  espana: "var(--color-text-muted)",
};

function esAnioValido(v: string | null, lista: number[]): number | null {
  if (!v || !/^\d{4}$/.test(v)) return null;
  const n = parseInt(v, 10);
  return lista.includes(n) ? n : null;
}

function filtrosIniciales(sp: URLSearchParams, d: PerfilDemografico["disponibles"]): FiltrosUI {
  const anio = esAnioValido(sp.get("anio"), d.anios_municipio);
  const evoDesde = esAnioValido(sp.get("evo_desde"), d.anios_evolucion);
  const evoHasta = esAnioValido(sp.get("evo_hasta"), d.anios_evolucion);
  const pirAnio = esAnioValido(sp.get("pir_anio"), d.piramide_anios);
  const sexoRaw = sp.get("sexo");
  const sexo: SexoModo =
    sexoRaw === "hombres" || sexoRaw === "mujeres" || sexoRaw === "comparar" ? sexoRaw : "total";
  const pirModo: PirModo = sp.get("pir_modo") === "pct" ? "pct" : "abs";
  const compararRaw = (sp.get("comparar") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is AmbitoTerritorial => (AMBITOS as string[]).includes(s));
  return {
    anio,
    sexo,
    evoDesde: evoDesde !== null && evoHasta !== null && evoDesde > evoHasta ? null : evoDesde,
    evoHasta: evoDesde !== null && evoHasta !== null && evoDesde > evoHasta ? null : evoHasta,
    comparar: compararRaw.length > 0 ? compararRaw : [...DEFAULT_COMPARAR],
    pirAnio,
    pirModo,
  };
}

function aURL(codigoINE: string, f: FiltrosUI, def: FiltrosUI): string {
  const p = new URLSearchParams();
  if (f.anio !== null) p.set("anio", String(f.anio));
  if (f.sexo !== "total") p.set("sexo", f.sexo);
  if (f.evoDesde !== null) p.set("evo_desde", String(f.evoDesde));
  if (f.evoHasta !== null) p.set("evo_hasta", String(f.evoHasta));
  if (f.comparar.join(",") !== def.comparar.join(",")) p.set("comparar", f.comparar.join(","));
  if (f.pirAnio !== null) p.set("pir_anio", String(f.pirAnio));
  if (f.pirModo !== "abs") p.set("pir_modo", f.pirModo);
  // Preserva el estado validado del explorador (x_*) sin tocar su semántica.
  if (typeof window !== "undefined") {
    for (const [k, v] of new URLSearchParams(window.location.search)) {
      if (k.startsWith("x_") && !p.has(k)) p.set(k, v);
    }
  }
  const qs = p.toString();
  return qs ? `/socideas/${codigoINE}?${qs}` : `/socideas/${codigoINE}`;
}

function fmt(n: number | null): string {
  return n === null ? "ND" : n.toLocaleString("es-ES");
}

const selectCls =
  "rounded-xl border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]";
const labelCls = "mb-1 block text-xs font-semibold text-[var(--color-text-muted)]";

export default function FichaFiltros({
  codigoINE,
  initial,
  searchParams,
}: {
  codigoINE: string;
  initial: PerfilDemografico;
  searchParams: Record<string, string>;
}) {
  const sp = new URLSearchParams(searchParams);
  const defectos: FiltrosUI = {
    anio: null,
    sexo: "total",
    evoDesde: null,
    evoHasta: null,
    comparar: [...DEFAULT_COMPARAR],
    pirAnio: null,
    pirModo: "abs",
  };
  const [filtros, setFiltros] = useState<FiltrosUI>(() => filtrosIniciales(sp, initial.disponibles));

  // Derivación local sin R2 ni fetch: reutiliza initial.valores ya entregados por el Server Component.
  // Memoizado para evitar recalcular tablas y gráficos en cada render.
  const perfil = useMemo(() => derivarPerfil(initial, filtros), [initial, filtros]);

  const rangoInvalido =
    filtros.evoDesde !== null && filtros.evoHasta !== null && filtros.evoDesde > filtros.evoHasta;

  const syncUrl = (next: FiltrosUI) => {
    const url = aURL(codigoINE, next, defectos);
    if (typeof window !== "undefined") window.history.replaceState(null, "", url);
  };

  const set = (patch: Partial<FiltrosUI>) => {
    setFiltros((f) => {
      const next = { ...f, ...patch };
      syncUrl(next);
      return next;
    });
  };
  const restablecer = () => {
    syncUrl(defectos);
    setFiltros({ ...defectos });
  };

  const d = perfil.disponibles;
  const total = perfil.total?.valor_numerico ?? null;
  const hombres = perfil.hombres?.valor_numerico ?? null;
  const mujeres = perfil.mujeres?.valor_numerico ?? null;
  const refAnio = perfil.total?.anio_referencia ?? null;

  // Pirámide en % sobre el total del año elegido.
  const pirSuma = perfil.piramide.grupos.reduce((a, g) => a + g.hombres + g.mujeres, 0);
  const pirGrupos =
    filtros.pirModo === "pct" && pirSuma > 0
      ? perfil.piramide.grupos.map((g) => ({
          tramo: g.tramo,
          hombres: Math.round((g.hombres / pirSuma) * 1000) / 10,
          mujeres: Math.round((g.mujeres / pirSuma) * 1000) / 10,
        }))
      : perfil.piramide.grupos;

  // Series del gráfico de evolución según ámbitos activos.
  const evoPuntos = (list: PerfilDemografico["evolucion"]) =>
    list.filter((v) => v.valor_numerico !== null).map((v) => ({ anio: v.anio_referencia ?? 0, valor: v.valor_numerico as number }));
  const series: SerieEvo[] = [];
  if (filtros.comparar.includes("municipio")) {
    series.push({ clave: "municipio", etiqueta: `${perfil.municipio.nombre} · Municipio`, color: SERIE_COLOR.municipio, puntos: evoPuntos(perfil.evolucion) });
  }
  const comp = (amb: AmbitoTerritorial, lista: PerfilDemografico["evolucion"]) => {
    if (!filtros.comparar.includes(amb)) return;
    const nombre = lista[0]?.dimensiones?.nombre ?? AMBITO_LABEL[amb];
    series.push({ clave: amb, etiqueta: `${nombre} · ${AMBITO_LABEL[amb]}`, color: SERIE_COLOR[amb], puntos: evoPuntos(lista) });
  };
  comp("provincia", perfil.comparativas.provincia);
  comp("ccaa", perfil.comparativas.ccaa);
  comp("espana", perfil.comparativas.espana);

  const filasTabla = tablaComparada(perfil, filtros.comparar);
  const ambitoSinDatos = (amb: AmbitoTerritorial): boolean => {
    if (amb === "municipio") return perfil.evolucion.length === 0;
    const l =
      amb === "provincia" ? perfil.comparativas.provincia : amb === "ccaa" ? perfil.comparativas.ccaa : perfil.comparativas.espana;
    return l.length === 0;
  };
  const vista: string[] = [
    `Período de evolución: ${filtros.evoDesde ?? d.anios_evolucion[0] ?? "—"}–${filtros.evoHasta ?? d.anios_evolucion[d.anios_evolucion.length - 1] ?? "—"}`,
    `Ámbitos: ${filtros.comparar.map((a) => AMBITO_LABEL[a]).join(", ") || "ninguno"}`,
    `Población: ${perfil.total?.anio_referencia ?? "—"} · Pirámide: ${perfil.piramide.anio ?? "—"}`,
  ];
  if (perfil.piramide.anio !== null && refAnio !== null && perfil.piramide.anio !== refAnio) {
    vista.push(`Aviso: la pirámide (${perfil.piramide.anio}) y la población total (${refAnio}) son de operaciones distintas, no contemporáneas.`);
  }
  for (const a of filtros.comparar) {
    const r = d.ambitos[a];
    if (r.puntos === 0) vista.push(`Sin comparativa de ${AMBITO_LABEL[a]} para el período.`);
  }

  const coberturaDemografia: CoverageEntry[] = [    { titulo: "Densidad de población", estado: "pending", detalle: "Pendiente de integración de fuente de superficie. Nada se estima." },
    { titulo: "Población extranjera y saldo migratorio", estado: "without_coverage", detalle: "La fuente no publica estos indicadores a nivel municipal de forma verificada en Tempus3." },
    { titulo: "Natalidad, mortalidad y educación", estado: "without_coverage", detalle: "Sin cobertura municipal verificada en esta ficha; solo se incorporarían con fuente oficial y periodo homogéneo." },
    { titulo: "Fuente provisional", estado: "provisional", detalle: "No hay fuente provisional configurada para demografía. Se conserva el último dato consolidado." },
  ];
  if (perfil.piramide.anio !== null && refAnio !== null && perfil.piramide.anio !== refAnio) {
    coberturaDemografia.push({ titulo: "Periodos con rezago", estado: "partial", detalle: `La pirámide (${perfil.piramide.anio}) y la población total (${refAnio}) son de operaciones distintas, no contemporáneas.` });
  }

  // (Sin bloque "Explorar datos" separado: los controles viven integrados en
  //  cada bloque de análisis y la cobertura va al final.)

  return (
    <div>
      {/* Bloque 1: población actual */}
      <section aria-label="Población actual" className="mb-10">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <h2 className="ideas-h2">Población actual</h2>
          <div className="ml-auto flex flex-wrap gap-3">
            <div>
              <label htmlFor="f-anio" className={labelCls}>Año</label>
              <select id="f-anio" value={filtros.anio ?? ""} onChange={(e) => set({ anio: e.target.value ? parseInt(e.target.value, 10) : null })} className={selectCls}>
                {d.anios_municipio.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="f-sexo" className={labelCls}>Dato</label>
              <select id="f-sexo" value={filtros.sexo} onChange={(e) => set({ sexo: e.target.value as SexoModo })} className={selectCls}>
                <option value="total">Total</option>
                <option value="hombres">Hombres</option>
                <option value="mujeres">Mujeres</option>
                <option value="comparar">Comparativa por sexo</option>
              </select>
            </div>
          </div>
        </div>
        {filtros.sexo === "comparar" ? (
          <SexoBarras hombres={hombres} mujeres={mujeres} anio={refAnio} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard etiqueta="Población total" valor={fmt(total)} detalle={`INE · ${refAnio ?? "—"}`} />
            <StatCard etiqueta="Hombres" valor={fmt(hombres)} detalle={`INE · ${perfil.hombres?.anio_referencia ?? "—"}`} />
            <StatCard etiqueta="Mujeres" valor={fmt(mujeres)} detalle={`INE · ${perfil.mujeres?.anio_referencia ?? "—"}`} />
          </div>
        )}
        <AvailabilitySummary
          bloque="Demografía"
          disponibles={[total, hombres, mujeres, perfil.evolucion.length > 0 ? 1 : 0, perfil.piramide.grupos.length > 0 ? 1 : 0].filter((v) => v !== null && v !== 0).length}
          periodo={refAnio ? String(refAnio) : null}
          fuentes={["INE"]}
        />
        <TableWorkspace
          table={
            <DataTableShell
              title={`Tabla del año ${refAnio ?? "—"}`}
              narrow
              meta={{ fuente: "INE", periodo: refAnio ? String(refAnio) : null, cobertura: `Municipio ${perfil.municipio.nombre}`, estado: "consolidado" }}
              toolbar={<DataTableToolbar tableId={`tabla-actual-${codigoINE}`} />}
            >
              <table id={`tabla-actual-${codigoINE}`} className="socideas-table">
                <thead>
                  <tr>
                    <th scope="col" className="socideas-table__text">Concepto</th>
                    <th scope="col" className="socideas-table__numeric">Personas</th>
                    <th scope="col" className="socideas-table__numeric">% sobre total</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { c: "Total", v: total, p: total !== null ? 100 : null },
                    { c: "Hombres", v: hombres, p: total ? Math.round(((hombres ?? 0) / total) * 1000) / 10 : null },
                    { c: "Mujeres", v: mujeres, p: total ? Math.round(((mujeres ?? 0) / total) * 1000) / 10 : null },
                  ].map((r) => (
                    <tr key={r.c}>
                      <td className="socideas-table__text">{r.c}</td>
                      <td className="socideas-table__numeric">{fmt(r.v)}</td>
                      <td className="socideas-table__numeric">{r.p === null ? "ND" : `${r.p.toLocaleString("es-ES")} %`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>
          }
        />
      </section>

      {/* Bloque 2: evolución + comparativas */}
      <section aria-label="Evolución demográfica" className="premium-card mb-10 p-5 sm:p-6">
        <div className="flex flex-wrap items-end gap-3">
          <h2 className="ideas-h2">Evolución demográfica</h2>
          <div className="ml-auto flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="f-desde" className={labelCls}>Desde</label>
              <select id="f-desde" value={filtros.evoDesde ?? ""} onChange={(e) => set({ evoDesde: e.target.value ? parseInt(e.target.value, 10) : null })} className={selectCls}>
                <option value="">Inicio</option>
                {d.anios_evolucion.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="f-hasta" className={labelCls}>Hasta</label>
              <select id="f-hasta" value={filtros.evoHasta ?? ""} onChange={(e) => set({ evoHasta: e.target.value ? parseInt(e.target.value, 10) : null })} className={selectCls}>
                <option value="">Fin</option>
                {d.anios_evolucion.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pb-0.5" role="group" aria-label="Accesos rápidos de período">
              <RangoBtn etiqueta="5 años" onClick={() => setRango(5, d)} />
              <RangoBtn etiqueta="10 años" onClick={() => setRango(10, d)} />
              <RangoBtn etiqueta="Todo" onClick={() => set({ evoDesde: null, evoHasta: null })} />
            </div>
          </div>
        </div>
        {rangoInvalido && (
          <p role="alert" className="mt-3 text-sm text-red-500">
            El año inicial no puede ser posterior al final. Ajuste el rango.
          </p>
        )}
        <fieldset className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          <legend className="sr-only">Comparativas territoriales</legend>
          {AMBITOS.map((a) => (
            <label key={a} className="inline-flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <input
                type="checkbox"
                checked={filtros.comparar.includes(a)}
                onChange={(e) =>
                  set({
                    comparar: e.target.checked
                      ? [...filtros.comparar, a]
                      : filtros.comparar.filter((x) => x !== a),
                  })
                }
                className="h-4 w-4 accent-[var(--color-secondary)]"
              />
              {AMBITO_LABEL[a]}
              {d.ambitos[a].puntos === 0 && <span className="text-xs text-[var(--color-text-muted)]">(sin datos)</span>}
            </label>
          ))}
        </fieldset>
        <TableWorkspace
          layout="half"
          table={
            <DataTableShell
              title="Tabla anual por ámbito"
              narrow={filtros.comparar.length <= 3}
              series={filasTabla.length > SERIES_SCROLL_THRESHOLD}
              meta={{
                fuente: "INE · Tempus3",
                periodo: filasTabla.length > 0 ? `${filasTabla[0].anio}–${filasTabla[filasTabla.length - 1].anio}` : null,
                cobertura: filtros.comparar.map((a) => AMBITO_LABEL[a]).join(" · ") || null,
                estado: "consolidado",
              }}
              toolbar={<DataTableToolbar tableId={`tabla-evo-${codigoINE}`} />}
              maxHeight={filasTabla.length > SERIES_SCROLL_THRESHOLD ? SERIES_MAX_HEIGHT : undefined}
              footnote={filasTabla.length === 0 ? "Sin datos para el período y los ámbitos seleccionados. Active al menos un ámbito con cobertura." : undefined}
            >
              <table id={`tabla-evo-${codigoINE}`} className={`socideas-table${filtros.comparar.length <= 1 ? " socideas-table--compact-two" : ""}`}>
                <thead>
                  <tr>
                    <th scope="col" className="socideas-table__year">Año</th>
                    {filtros.comparar.includes("municipio") && <th scope="col" className="socideas-table__numeric">Municipio</th>}
                    {filtros.comparar.includes("provincia") && <th scope="col" className="socideas-table__numeric">Provincia</th>}
                    {filtros.comparar.includes("ccaa") && <th scope="col" className="socideas-table__numeric">CCAA</th>}
                    {filtros.comparar.includes("espana") && <th scope="col" className="socideas-table__numeric">España</th>}
                  </tr>
                </thead>
                <tbody>
                  {filasTabla.map((row) => (
                    <tr key={row.anio}>
                      <td className="socideas-table__year">{row.anio}</td>
                      {filtros.comparar.includes("municipio") && <td className="socideas-table__numeric">{fmt(row.municipio)}</td>}
                      {filtros.comparar.includes("provincia") && <td className="socideas-table__numeric">{fmt(row.provincia)}</td>}
                      {filtros.comparar.includes("ccaa") && <td className="socideas-table__numeric">{fmt(row.ccaa)}</td>}
                      {filtros.comparar.includes("espana") && <td className="socideas-table__numeric">{fmt(row.espana)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>
          }
          visual={
            <div>
              <h3 className="socideas-table-shell__title">Evolución anual</h3>
              <div className="mt-2">
                <DataTableMeta meta={{ fuente: "INE · Tempus3", periodo: filasTabla.length > 0 ? `${filasTabla[0].anio}–${filasTabla[filasTabla.length - 1].anio}` : null, unidad: "habitantes" }} />
              </div>
              <div className="mt-3">
                <EvolutionChart series={series} id={`evo-${codigoINE}`} />
              </div>
            </div>
          }
          visualLabel="Gráfico de evolución anual de la población"
        />
        {filtros.comparar.some((a) => ambitoSinDatos(a)) && (
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
            Algún ámbito activado no tiene datos en este período: no se muestra como equivalente.
            CCAA y España llegan a 2021; municipio y provincia, a 2025.
          </p>
        )}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ComparadorPeriodos
            serie={perfil.evolucion.filter((v) => v.valor_numerico !== null).map((v) => ({ anio: v.anio_referencia ?? 0, valor: v.valor_numerico as number }))}
            unidad="hab."
            titulo="Comparador de periodos (municipio)"
          />
          <Metodologia
            nombre="Población y evolución (DPOP, INE)"
            definicion="Cifras oficiales de población municipal y serie anual de evolución, con comparativas de provincia, comunidad autónoma y conjunto nacional."
            fuente="INE · Tempus3 (DPOP provincial + tabla CCAA 70)"
            periodo={`${d.anios_evolucion[0] ?? "—"}–${d.anios_evolucion[d.anios_evolucion.length - 1] ?? "—"}`}
            cobertura="Municipio, provincia, CCAA y España (CCAA/España con rezago a 2021)"
            estado="Consolidado"
            limitacion="Los ámbitos con rezago no deben leerse como contemporáneos sin indicarlo."
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <FuenteOficial url={perfil.evolucion[0]?.source_url} />
        </div>
      </section>

      {/* Bloque 3: pirámide */}
      <section aria-label="Población por edad y sexo" className="premium-card mb-10 p-5 sm:p-6">
        <div className="flex flex-wrap items-end gap-3">
          <h2 className="ideas-h2">
            Población por edad y sexo{perfil.piramide.anio ? ` (${perfil.piramide.anio})` : ""}
          </h2>
          <div className="ml-auto flex flex-wrap gap-3">
            <div>
              <label htmlFor="f-piranio" className={labelCls}>Año</label>
              <select id="f-piranio" value={filtros.pirAnio ?? perfil.piramide.anio ?? ""} onChange={(e) => set({ pirAnio: e.target.value ? parseInt(e.target.value, 10) : null })} className={selectCls}>
                {d.piramide_anios.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="f-pirmodo" className={labelCls}>Modo</label>
              <select id="f-pirmodo" value={filtros.pirModo} onChange={(e) => set({ pirModo: e.target.value as PirModo })} className={selectCls}>
                <option value="abs">Absolutos</option>
                <option value="pct">Porcentaje</option>
              </select>
            </div>
          </div>
        </div>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Padrón Continuo (INE).{filtros.pirModo === "pct" ? " Porcentaje sobre la población total del municipio ese año." : ""}
        </p>
        <TableWorkspace
          layout="half"
          table={
            <DataTableShell
              title={`Tabla por grupos${filtros.pirModo === "pct" ? " (%)" : ""}`}
              narrow
              series={pirGrupos.length > SERIES_SCROLL_THRESHOLD}
              meta={{ fuente: "INE · Padrón Continuo", periodo: perfil.piramide.anio ? String(perfil.piramide.anio) : null, cobertura: `Municipio ${perfil.municipio.nombre}`, estado: "consolidado" }}
              toolbar={<DataTableToolbar tableId={`tabla-pir-${codigoINE}`} />}
              maxHeight={pirGrupos.length > SERIES_SCROLL_THRESHOLD ? SERIES_MAX_HEIGHT : undefined}
            >
              <table id={`tabla-pir-${codigoINE}`} className="socideas-table">
                <thead>
                  <tr>
                    <th scope="col" className="socideas-table__text">Edad</th>
                    <th scope="col" className="socideas-table__numeric">H{filtros.pirModo === "pct" ? " %" : ""}</th>
                    <th scope="col" className="socideas-table__numeric">M{filtros.pirModo === "pct" ? " %" : ""}</th>
                  </tr>
                </thead>
                <tbody>
                  {pirGrupos.map((g) => (
                    <tr key={g.tramo}>
                      <td className="socideas-table__text">{g.tramo}</td>
                      <td className="socideas-table__numeric">{filtros.pirModo === "pct" ? g.hombres.toLocaleString("es-ES") : fmt(g.hombres)}</td>
                      <td className="socideas-table__numeric">{filtros.pirModo === "pct" ? g.mujeres.toLocaleString("es-ES") : fmt(g.mujeres)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>
          }
          visual={
            <div>
              <h3 className="socideas-table-shell__title">Pirámide de población</h3>
              <div className="mt-2">
                <DataTableMeta meta={{ fuente: "INE · Padrón Continuo", periodo: perfil.piramide.anio ? String(perfil.piramide.anio) : null, unidad: "personas" }} />
              </div>
              <div className="mt-3">
                <PyramidChart grupos={pirGrupos} anio={perfil.piramide.anio} />
              </div>
            </div>
          }
          visualLabel="Pirámide de población por edad y sexo"
        />
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {perfil.derivados.indice_envejecimiento !== null ? (
            <StatCard
              etiqueta="Índice de envejecimiento"
              valor={`${perfil.derivados.indice_envejecimiento.toLocaleString("es-ES")} %`}
              detalle="Población 65+ / 0-14 × 100"
            />
          ) : (
            <p className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)] px-4 py-3 text-xs text-[var(--color-text-muted)]" role="status">
              Índice de envejecimiento: no disponible para el período seleccionado.
            </p>
          )}
          {perfil.derivados.indice_dependencia !== null ? (
            <StatCard
              etiqueta="Índice de dependencia"
              valor={`${perfil.derivados.indice_dependencia.toLocaleString("es-ES")} %`}
              detalle="(0-14 + 65+) / 15-64 × 100"
            />
          ) : (
            <p className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)] px-4 py-3 text-xs text-[var(--color-text-muted)]" role="status">
              Índice de dependencia: no disponible para el período seleccionado.
            </p>
          )}
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--color-secondary)]">Cómo se calcula</summary>
          <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
            Envejecimiento = población de 65 o más años dividida por la de 0 a 14, por 100.
            Dependencia = suma de 0-14 y 65+ dividida por la de 15 a 64, por 100.
            Ambos usan la estructura por edad del año de pirámide seleccionado.
          </p>
        </details>
      </section>

      {/* Bloque 4: densidad */}
      <section aria-label="Densidad y lectura territorial" className="premium-card mb-10 p-5 sm:p-6">
        <h2 className="ideas-h2">Densidad y lectura territorial</h2>
        {perfil.densidad.valor !== null ? (
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            {perfil.densidad.valor.toLocaleString("es-ES")} hab/km²
          </p>
        ) : (
          <div className="ideas-status mt-3" data-state="pending" role="status">
            <div className="ideas-status__head">
              <p className="ideas-status__title">Densidad no disponible</p>
              <span className="ideas-status__badge">Pendiente</span>
            </div>
            <div className="ideas-status__body">
              <p>{perfil.densidad.pendiente ?? "Pendiente de integración de fuente de superficie"}. El detalle figura en el panel de cobertura final; nada se estima.</p>
            </div>
          </div>
        )}
      </section>

      {/* Bloque 5: derivados */}
      <section aria-label="Indicadores derivados" className="mb-10">
        <h2 className="ideas-h2 mb-4">Variaciones del período</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {perfil.derivados.cambio_5y !== null ? (
            <StatCard
              etiqueta="Variación 5 años"
              valor={`${perfil.derivados.cambio_5y > 0 ? "+" : ""}${perfil.derivados.cambio_5y.toLocaleString("es-ES")} %`}
              detalle="Cálculo propio sobre serie oficial"
            />
          ) : (
            <p className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)] px-4 py-3 text-xs text-[var(--color-text-muted)]" role="status">
              Variación 5 años: no disponible para el período seleccionado (sin año comparable; no se muestra 0 %).
            </p>
          )}
          {perfil.derivados.cambio_10y !== null ? (
            <StatCard
              etiqueta="Variación 10 años"
              valor={`${perfil.derivados.cambio_10y > 0 ? "+" : ""}${perfil.derivados.cambio_10y.toLocaleString("es-ES")} %`}
              detalle="Cálculo propio sobre serie oficial"
            />
          ) : (
            <p className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)] px-4 py-3 text-xs text-[var(--color-text-muted)]" role="status">
              Variación 10 años: no disponible para el período seleccionado (sin año comparable; no se muestra 0 %).
            </p>
          )}
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--color-secondary)]">Cómo se calcula</summary>
          <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
            Variación = (población del año de referencia − población de 5/10 años antes) /
            población de entonces, por 100. El año de referencia es el año seleccionado
            o el último del período visible. Si falta el año comparable, no se muestra 0 %:
            se indica no disponible.
          </p>
        </details>
      </section>

      <IndicatorAvailabilityPanel entries={coberturaDemografia} />

      <Traceability valores={perfil.valores} pendientes={pendientesFijas} vista={vista} />

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href={`/socideas/${codigoINE}/descargas/demografia`}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[var(--color-primary)] rounded-xl hover:bg-[var(--color-primary-light)] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
        >
          Descargar tablas de Demografía →
        </Link>
        <button
          type="button"
          onClick={restablecer}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-xl hover:text-[var(--color-text-primary)] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
        >
          Restablecer filtros
        </button>
      </div>
    </div>
  );

  function setRango(anos: 5 | 10, disp: PerfilDemografico["disponibles"]) {
    const ev = disp.anios_evolucion;
    if (ev.length === 0) return;
    const fin = ev[ev.length - 1];
    set({ evoDesde: fin - anos, evoHasta: fin });
  }
}

function slugOf(v: IndicatorValue): string {
  return (v.indicator as unknown as { slug?: string } | undefined)?.slug ?? "";
}
function isMunicipioAmbito(v: IndicatorValue): boolean {
  return (v.dimensiones?.ambito ?? "municipio") === "municipio";
}
function derivarPerfil(base: PerfilDemografico, filtros: FiltrosUI): PerfilDemografico {
  const d = base.disponibles;
  const anioEff = filtros.anio !== null && d.anios_municipio.includes(filtros.anio) ? filtros.anio : null;
  let desde = filtros.evoDesde;
  let hasta = filtros.evoHasta;
  if (desde !== null && !d.anios_evolucion.includes(desde)) desde = null;
  if (hasta !== null && !d.anios_evolucion.includes(hasta)) hasta = null;
  if (desde !== null && hasta !== null && desde > hasta) { desde = null; hasta = null; }
  const pirAnioEff = filtros.pirAnio !== null && d.piramide_anios.includes(filtros.pirAnio) ? filtros.pirAnio : (d.piramide_anios.length > 0 ? d.piramide_anios[d.piramide_anios.length - 1] : null);
  const ambitosEff = filtros.comparar.length > 0 ? filtros.comparar : [...AMBITOS] as AmbitoTerritorial[];
  const valores = base.valores;
  const bySlug = (slug: string) => valores.filter((v) => slugOf(v) === slug);
  const latestIn = (anio: number | null, slug: string): IndicatorValue | null => {
    const list = bySlug(slug).filter((v) => isMunicipioAmbito(v) && v.valor_numerico !== null && (anio === null || v.anio_referencia === anio));
    list.sort((a, b) => (b.anio_referencia ?? 0) - (a.anio_referencia ?? 0));
    return (list[0] as IndicatorValue) ?? null;
  };
  const total = latestIn(anioEff, "population_total");
  const hombres = latestIn(anioEff, "population_male");
  const mujeres = latestIn(anioEff, "population_female");
  const evoAll = bySlug("population_evolution").filter((v) => isMunicipioAmbito(v) && v.valor_numerico !== null).sort((a,b)=>(a.anio_referencia??0)-(b.anio_referencia??0));
  const inRange = (a:number, lo:number|null, hi:number|null) => (lo===null||a>=lo)&&(hi===null||a<=hi);
  const evolucion = evoAll.filter((v)=> inRange(v.anio_referencia??0, desde, hasta)) as PerfilDemografico["evolucion"];
  const serie = (list: IndicatorValue[]) => list.filter((v)=> v.valor_numerico!==null).sort((a,b)=>(a.anio_referencia??0)-(b.anio_referencia??0));
  const inAmbito = (amb:string)=>(v:IndicatorValue)=> v.dimensiones?.ambito===amb;
  const comparativas = {
    provincia: ambitosEff.includes("provincia") ? serie(bySlug("population_total").filter(inAmbito("provincia"))).filter((v)=>inRange(v.anio_referencia??0, desde, hasta)) as PerfilDemografico["evolucion"] : [],
    ccaa: ambitosEff.includes("ccaa") ? serie(bySlug("population_total").filter(inAmbito("ccaa"))).filter((v)=>inRange(v.anio_referencia??0, desde, hasta)) as PerfilDemografico["evolucion"] : [],
    espana: ambitosEff.includes("espana") ? serie(bySlug("population_total").filter(inAmbito("espana"))).filter((v)=>inRange(v.anio_referencia??0, desde, hasta)) as PerfilDemografico["evolucion"] : [],
  };
  const ageRows = bySlug("population_age_sex").filter((v)=> v.valor_numerico!==null);
  const ageMap2 = new Map<string, {hombres:number; mujeres:number}>();
  for (const v of ageRows.filter((v)=> v.anio_referencia===pirAnioEff)) {
    const tramo = (v.dimensiones as Record<string,string>)?.tramo_edad;
    if (!tramo) continue;
    const e = ageMap2.get(tramo) ?? {hombres:0, mujeres:0};
    if ((v.dimensiones as Record<string,string>)?.sexo==="hombres") e.hombres = v.valor_numerico ?? 0;
    if ((v.dimensiones as Record<string,string>)?.sexo==="mujeres") e.mujeres = v.valor_numerico ?? 0;
    ageMap2.set(tramo, e);
  }
  const TRAMO_ORDER = ["0-4","5-9","10-14","15-19","20-24","25-29","30-34","35-39","40-44","45-49","50-54","55-59","60-64","65-69","70-74","75-79","80-84","85-89","90-94","95-99","100+"];
  const grupos = TRAMO_ORDER.filter(t=> ageMap2.has(t)).map(t=> ({ tramo:t, hombres: ageMap2.get(t)!.hombres, mujeres: ageMap2.get(t)!.mujeres }));
  const evoByYear = new Map(evoAll.map(v=> [v.anio_referencia, v.valor_numerico as number]));
  const lastShown = evolucion.length>0 ? (evolucion[evolucion.length-1].anio_referencia ?? null) : null;
  const refYear = anioEff ?? lastShown;
  const pctChange = (back:number):number|null=> {
    if (refYear===null) return null;
    const baseVal = evoByYear.get(refYear-back);
    const now = evoByYear.get(refYear);
    if (baseVal===undefined||now===undefined||baseVal===0) return null;
    return Math.round(((now-baseVal)/baseVal)*1000)/10;
  };
  const sumTramos = (pred:(t:string)=>boolean)=> grupos.filter(g=> pred(g.tramo)).reduce((a,g)=>a+g.hombres+g.mujeres,0);
  const isOld = (t:string)=> { const n=parseInt(t.split("-")[0],10); return Number.isFinite(n)&&n>=65; };
  const isYoung = (t:string)=> { const n=parseInt(t.split("-")[0],10); return Number.isFinite(n)&&n<15; };
  const isWork = (t:string)=> !isOld(t)&&!isYoung(t);
  const pop65=sumTramos(isOld); const pop014=sumTramos(isYoung); const pop1564=sumTramos(isWork);
  const indiceEnvejecimiento = pop014>0 ? Math.round((pop65/pop014)*1000)/10 : null;
  const indiceDependencia = pop1564>0 ? Math.round(((pop014+pop65)/pop1564)*1000)/10 : null;
  return {
    ...base,
    total: total as PerfilDemografico["total"],
    hombres: hombres as PerfilDemografico["hombres"],
    mujeres: mujeres as PerfilDemografico["mujeres"],
    evolucion,
    comparativas,
    piramide: { anio: pirAnioEff, grupos },
    derivados: {
      cambio_5y: pctChange(5),
      cambio_10y: pctChange(10),
      indice_envejecimiento: grupos.length>0 ? indiceEnvejecimiento : null,
      indice_dependencia: grupos.length>0 ? indiceDependencia : null,
    },
    filtros: { anio: anioEff, desde: desde ?? null, hasta: hasta ?? null, ambitos: ambitosEff, pir_anio: pirAnioEff },
  };
}

const pendientesFijas = [
  "Densidad: pendiente de integración de fuente de superficie.",
  "Población extranjera y saldo migratorio: sin cobertura municipal verificada en Tempus3.",
];

function tablaComparada(perfil: PerfilDemografico, ambitos: AmbitoTerritorial[]) {
  const get = (list: PerfilDemografico["evolucion"]) => {
    const m = new Map<number, number | null>();
    for (const v of list) m.set(v.anio_referencia ?? 0, v.valor_numerico);
    return m;
  };
  const muni = get(perfil.evolucion);
  const prov = get(perfil.comparativas.provincia);
  const ccaa = get(perfil.comparativas.ccaa);
  const esp = get(perfil.comparativas.espana);
  const anios = [...new Set([...muni.keys(), ...prov.keys(), ...ccaa.keys(), ...esp.keys()])].sort((a, b) => a - b);
  return anios.map((anio) => ({
    anio,
    municipio: ambitos.includes("municipio") ? (muni.get(anio) ?? null) : null,
    provincia: ambitos.includes("provincia") ? (prov.get(anio) ?? null) : null,
    ccaa: ambitos.includes("ccaa") ? (ccaa.get(anio) ?? null) : null,
    espana: ambitos.includes("espana") ? (esp.get(anio) ?? null) : null,
  }));
}

function SexoBarras({ hombres, mujeres, anio }: { hombres: number | null; mujeres: number | null; anio: number | null }) {
  if (hombres === null || mujeres === null || hombres + mujeres === 0) {
    return <p className="text-sm text-[var(--color-text-muted)]">Comparativa no disponible para {anio ?? "este año"}.</p>;
  }
  const total = hombres + mujeres;
  const pH = Math.round((hombres / total) * 1000) / 10;
  const pM = Math.round((mujeres / total) * 1000) / 10;
  return (
    <div className="premium-card p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
        Comparativa por sexo · {anio}
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {[
          { e: "Hombres", v: hombres, p: pH, cls: "bg-[var(--color-primary)]" },
          { e: "Mujeres", v: mujeres, p: pM, cls: "bg-[var(--color-secondary)]" },
        ].map((r) => (
          <div key={r.e}>
            <div className="flex justify-between text-sm">
              <span className="font-medium text-[var(--color-text-primary)]">{r.e}</span>
              <span className="tabular-nums text-[var(--color-text-secondary)]">
                {r.v.toLocaleString("es-ES")} · {r.p.toLocaleString("es-ES")} %
              </span>
            </div>
            <div className="mt-1 h-3 overflow-hidden rounded bg-[var(--color-input-bg)]">
              <div className={`h-full rounded ${r.cls}`} style={{ width: `${r.p}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RangoBtn({ etiqueta, onClick }: { etiqueta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-lg hover:text-[var(--color-text-primary)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
    >
      {etiqueta}
    </button>
  );
}
