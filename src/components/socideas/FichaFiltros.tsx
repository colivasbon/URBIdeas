"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import StatCard from "./StatCard";
import EvolutionChart, { type SerieEvo } from "./EvolutionChart";
import PyramidChart from "./PyramidChart";
import Traceability from "./Traceability";
import CopyTableButton from "./CopyTableButton";
import type { AmbitoTerritorial, PerfilDemografico } from "@/lib/socideas";
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

const DEFAULT_COMPARAR: AmbitoTerritorial[] = ["municipio", "provincia"];

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
  const qs = p.toString();
  return qs ? `/socideas/${codigoINE}?${qs}` : `/socideas/${codigoINE}`;
}

function fmt(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("es-ES");
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
  const router = useRouter();
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
  const [perfil, setPerfil] = useState<PerfilDemografico>(initial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const primero = useRef(true);

  const rangoInvalido =
    filtros.evoDesde !== null && filtros.evoHasta !== null && filtros.evoDesde > filtros.evoHasta;

  useEffect(() => {
    if (primero.current) {
      primero.current = false;
      return;
    }
    if (rangoInvalido) return;
    // Sin setState síncrono aquí (regla set-state-in-effect): el estado de
    // carga se activa en los manejadores que cambian los filtros.
    const q = new URLSearchParams();
    if (filtros.anio !== null) q.set("anio", String(filtros.anio));
    if (filtros.evoDesde !== null) q.set("desde", String(filtros.evoDesde));
    if (filtros.evoHasta !== null) q.set("hasta", String(filtros.evoHasta));
    q.set("comparar", filtros.comparar.join(","));
    if (filtros.pirAnio !== null) q.set("pir_anio", String(filtros.pirAnio));
    const qs = q.toString();
    fetch(`/api/socideas/perfil/${codigoINE}${qs ? `?${qs}` : ""}`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok || !j.data) throw new Error(j.error ?? "Error al cargar los datos");
        setPerfil(j.data as PerfilDemografico);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar los datos"))
      .finally(() => setCargando(false));
    router.replace(aURL(codigoINE, filtros, defectos), { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  const set = (patch: Partial<FiltrosUI>) => {
    setCargando(true);
    setError(null);
    setFiltros((f) => ({ ...f, ...patch }));
  };
  const restablecer = () => {
    setCargando(true);
    setError(null);
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
    series.push({ clave: "municipio", etiqueta: perfil.municipio.nombre, color: SERIE_COLOR.municipio, puntos: evoPuntos(perfil.evolucion) });
  }
  const comp = (amb: AmbitoTerritorial, lista: PerfilDemografico["evolucion"], nombre: string | null) => {
    if (!filtros.comparar.includes(amb)) return;
    series.push({ clave: amb, etiqueta: nombre ?? AMBITO_LABEL[amb], color: SERIE_COLOR[amb], puntos: evoPuntos(lista) });
  };
  comp("provincia", perfil.comparativas.provincia, perfil.comparativas.provincia[0]?.dimensiones?.nombre ?? null);
  comp("ccaa", perfil.comparativas.ccaa, perfil.comparativas.ccaa[0]?.dimensiones?.nombre ?? null);
  comp("espana", perfil.comparativas.espana, "España");

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

  return (
    <div aria-busy={cargando}>
      {cargando && (
        <p role="status" className="mb-4 text-xs font-semibold text-[var(--color-secondary)]">
          Actualizando datos…
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-red-500/40 p-4 text-sm text-red-500">
          {error} Se mantienen los últimos datos cargados.
        </p>
      )}

      {/* Bloque 1: población actual */}
      <section aria-label="Población actual" className="mb-10">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Población actual</h2>
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
        <div className="mt-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Tabla del año {refAnio ?? "—"}</h3>
          <CopyTableButton tableId={`tabla-actual-${codigoINE}`} label="Copiar tabla para Word" />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table id={`tabla-actual-${codigoINE}`} className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
                <th className="py-2 pr-4">Concepto</th>
                <th className="py-2 text-right">Personas</th>
                <th className="py-2 text-right">% sobre total</th>
              </tr>
            </thead>
            <tbody>
              {[
                { c: "Total", v: total, p: null as number | null },
                { c: "Hombres", v: hombres, p: total ? Math.round(((hombres ?? 0) / total) * 1000) / 10 : null },
                { c: "Mujeres", v: mujeres, p: total ? Math.round(((mujeres ?? 0) / total) * 1000) / 10 : null },
              ].map((r) => (
                <tr key={r.c} className="border-t border-[var(--color-border-subtle)] tabular-nums">
                  <td className="py-2 pr-4">{r.c}</td>
                  <td className="py-2 text-right">{fmt(r.v)}</td>
                  <td className="py-2 text-right">{r.p === null ? "—" : `${r.p.toLocaleString("es-ES")} %`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bloque 2: evolución + comparativas */}
      <section aria-label="Evolución demográfica" className="mb-10 rounded-[var(--border-radius-lg)] border border-[var(--color-border-subtle)] p-5 sm:p-6">
        <div className="flex flex-wrap items-end gap-3">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Evolución demográfica</h2>
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
        <div className="mt-4">
          <EvolutionChart series={series} id={`evo-${codigoINE}`} />
        </div>
        <div className="mt-6 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Tabla anual por ámbito</h3>
          <CopyTableButton tableId={`tabla-evo-${codigoINE}`} label="Copiar tabla para Word" />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table id={`tabla-evo-${codigoINE}`} className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
                <th className="py-2 pr-4">Año</th>
                {filtros.comparar.includes("municipio") && <th className="py-2 pr-4 text-right">Municipio</th>}
                {filtros.comparar.includes("provincia") && <th className="py-2 pr-4 text-right">Provincia</th>}
                {filtros.comparar.includes("ccaa") && <th className="py-2 pr-4 text-right">CCAA</th>}
                {filtros.comparar.includes("espana") && <th className="py-2 text-right">España</th>}
              </tr>
            </thead>
            <tbody>
              {filasTabla.map((row) => (
                <tr key={row.anio} className="border-t border-[var(--color-border-subtle)] tabular-nums">
                  <td className="py-2 pr-4">{row.anio}</td>
                  {filtros.comparar.includes("municipio") && <td className="py-2 pr-4 text-right">{fmt(row.municipio)}</td>}
                  {filtros.comparar.includes("provincia") && <td className="py-2 pr-4 text-right">{fmt(row.provincia)}</td>}
                  {filtros.comparar.includes("ccaa") && <td className="py-2 pr-4 text-right">{fmt(row.ccaa)}</td>}
                  {filtros.comparar.includes("espana") && <td className="py-2 text-right">{fmt(row.espana)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {filasTabla.length === 0 && (
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Sin datos para el período y los ámbitos seleccionados. Active al menos un ámbito con cobertura.
            </p>
          )}
        </div>
        {filtros.comparar.some((a) => ambitoSinDatos(a)) && (
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
            Algún ámbito activado no tiene datos en este período: no se muestra como equivalente.
            CCAA y España llegan a 2021; municipio y provincia, a 2025.
          </p>
        )}
      </section>

      {/* Bloque 3: pirámide */}
      <section aria-label="Población por edad y sexo" className="mb-10 rounded-[var(--border-radius-lg)] border border-[var(--color-border-subtle)] p-5 sm:p-6">
        <div className="flex flex-wrap items-end gap-3">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
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
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-8">
          <PyramidChart grupos={pirGrupos} anio={perfil.piramide.anio} />
          <div className="flex flex-col gap-4">
            <StatCard
              etiqueta="Índice de envejecimiento"
              valor={perfil.derivados.indice_envejecimiento !== null ? `${perfil.derivados.indice_envejecimiento.toLocaleString("es-ES")} %` : "No disponible para el período seleccionado"}
              detalle="Población 65+ / 0-14 × 100"
            />
            <StatCard
              etiqueta="Índice de dependencia"
              valor={perfil.derivados.indice_dependencia !== null ? `${perfil.derivados.indice_dependencia.toLocaleString("es-ES")} %` : "No disponible para el período seleccionado"}
              detalle="(0-14 + 65+) / 15-64 × 100"
            />
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-[var(--color-secondary)]">Cómo se calcula</summary>
              <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
                Envejecimiento = población de 65 o más años dividida por la de 0 a 14, por 100.
                Dependencia = suma de 0-14 y 65+ dividida por la de 15 a 64, por 100.
                Ambos usan la estructura por edad del año de pirámide seleccionado.
              </p>
            </details>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
            Tabla por grupos de edad{filtros.pirModo === "pct" ? " (%)" : ""}
          </h3>
          <CopyTableButton tableId={`tabla-pir-${codigoINE}`} label="Copiar tabla para Word" />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table id={`tabla-pir-${codigoINE}`} className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
                <th className="py-2 pr-4">Edad</th>
                <th className="py-2 pr-4 text-right">Hombres{filtros.pirModo === "pct" ? " %" : ""}</th>
                <th className="py-2 text-right">Mujeres{filtros.pirModo === "pct" ? " %" : ""}</th>
              </tr>
            </thead>
            <tbody>
              {pirGrupos.map((g) => (
                <tr key={g.tramo} className="border-t border-[var(--color-border-subtle)] tabular-nums">
                  <td className="py-2 pr-4">{g.tramo}</td>
                  <td className="py-2 pr-4 text-right">{filtros.pirModo === "pct" ? g.hombres.toLocaleString("es-ES") : fmt(g.hombres)}</td>
                  <td className="py-2 text-right">{filtros.pirModo === "pct" ? g.mujeres.toLocaleString("es-ES") : fmt(g.mujeres)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bloque 4: densidad */}
      <section aria-label="Densidad y lectura territorial" className="mb-10 rounded-[var(--border-radius-lg)] border border-[var(--color-border-subtle)] p-5 sm:p-6">
        <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Densidad y lectura territorial</h2>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          {perfil.densidad.valor !== null
            ? `${perfil.densidad.valor.toLocaleString("es-ES")} hab/km²`
            : perfil.densidad.pendiente ?? "Pendiente de integración de fuente de superficie"}
        </p>
      </section>

      {/* Bloque 5: derivados */}
      <section aria-label="Indicadores derivados" className="mb-10">
        <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-4">Variaciones del período</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard
            etiqueta="Variación 5 años"
            valor={perfil.derivados.cambio_5y !== null ? `${perfil.derivados.cambio_5y > 0 ? "+" : ""}${perfil.derivados.cambio_5y.toLocaleString("es-ES")} %` : "No disponible para el período seleccionado"}
            detalle="Cálculo propio sobre serie oficial"
          />
          <StatCard
            etiqueta="Variación 10 años"
            valor={perfil.derivados.cambio_10y !== null ? `${perfil.derivados.cambio_10y > 0 ? "+" : ""}${perfil.derivados.cambio_10y.toLocaleString("es-ES")} %` : "No disponible para el período seleccionado"}
            detalle="Cálculo propio sobre serie oficial"
          />
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

      <Traceability valores={perfil.valores} pendientes={pendientesFijas} vista={vista} />

      <div className="mt-8">
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
    <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-card-bg)] p-5">
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
