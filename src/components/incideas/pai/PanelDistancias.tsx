"use client";

import { useEffect, useRef } from "react";
import type { Medicion } from "@/lib/incideas/pai/entorno";
import { fmtDistancia } from "@/lib/incideas/pai/geo";
import { GRUPOS, GRUPO_POR_ID, type GrupoId } from "@/lib/incideas/pai/grupos";
import type { EstadoAnalisis, FuenteProgreso } from "./useAnalisisEntorno";

export interface FiltrosMedicion {
  grupos: Set<GrupoId>;
  maxKm: number | null;
  texto: string;
}

interface Props {
  estado: EstadoAnalisis;
  visibles: Medicion[];
  filtros: FiltrosMedicion;
  etiquetas: boolean;
  resaltado: string | null;
  seleccionado: string | null;
  onFiltros: (f: FiltrosMedicion) => void;
  onEtiquetas: (v: boolean) => void;
  onHover: (id: string | null) => void;
  onSeleccion: (id: string) => void;
  onEncuadrar: () => void;
  onExportar: (formato: "geojson" | "kml") => void;
}

const DISTANCIAS: { valor: number | null; etiqueta: string }[] = [
  { valor: null, etiqueta: "Cualquier distancia" },
  { valor: 1, etiqueta: "Hasta 1 km" },
  { valor: 2, etiqueta: "Hasta 2 km" },
  { valor: 5, etiqueta: "Hasta 5 km" },
  { valor: 10, etiqueta: "Hasta 10 km" },
  { valor: 25, etiqueta: "Hasta 25 km" },
];

function Progreso({ fuentes, fase, duracionMs }: { fuentes: FuenteProgreso[]; fase: EstadoAnalisis["fase"]; duracionMs: number | null }) {
  const hechas = fuentes.filter((f) => f.estado === "ok" || f.estado === "error" || f.estado === "omitida").length;
  const errores = fuentes.filter((f) => f.estado === "error").length;
  const color = (e: FuenteProgreso["estado"]) =>
    e === "ok" ? "bg-[#86B73D]" : e === "error" ? "bg-[#643335]" : e === "cargando" ? "bg-[#FBE122] animate-pulse" : e === "omitida" ? "bg-[#B0BDB0]" : "bg-[var(--border-default)]";
  const resumen =
    fase === "cargando"
      ? `Consultando fuentes: ${hechas} de ${fuentes.length}`
      : `${fuentes.length} fuentes consultadas${duracionMs ? ` en ${Math.round(duracionMs / 1000)} s` : ""}${errores ? ` · ${errores} con aviso` : ""}`;
  return (
    <details open={fase === "cargando" || errores > 0} className="rounded-[6px] border border-[var(--border-subtle)] px-3 py-2">
      <summary className="cursor-pointer select-none text-sm font-medium text-[var(--text-primary)]">{resumen}</summary>
      <div className="mt-2 h-1.5 overflow-hidden rounded-[6px] bg-[var(--border-subtle)]" role="progressbar" aria-valuemin={0} aria-valuemax={fuentes.length} aria-valuenow={hechas}>
        <div className="h-full rounded-[6px] bg-[#86B73D] transition-[width] duration-500" style={{ width: `${fuentes.length ? (hechas / fuentes.length) * 100 : 0}%` }} />
      </div>
      <ul className="mt-3 space-y-1.5">
        {fuentes.map((f) => (
          <li key={f.id} className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${color(f.estado)}`} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              {f.nombre}
              {f.estado === "error" && <span className="block text-[#643335]">{f.detalle}</span>}
            </span>
            <span className="shrink-0 tabular-nums text-[var(--text-muted)]">
              {f.estado === "ok" && f.ms ? `${(f.ms / 1000).toFixed(1)} s` : f.estado === "cargando" ? "…" : f.estado === "omitida" ? "—" : f.estado === "error" ? "error" : ""}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function PanelDistancias(p: Props) {
  const { estado, filtros } = p;
  const lista = useRef<HTMLUListElement>(null);

  const cuentas = new Map<GrupoId, number>();
  for (const m of estado.mediciones) cuentas.set(m.grupo, (cuentas.get(m.grupo) ?? 0) + 1);

  const alternar = (g: GrupoId) => {
    const s = new Set(filtros.grupos);
    if (s.has(g)) s.delete(g);
    else s.add(g);
    p.onFiltros({ ...filtros, grupos: s });
  };
  const todos = () => p.onFiltros({ ...filtros, grupos: new Set(GRUPOS.map((g) => g.id)) });
  const ninguno = () => p.onFiltros({ ...filtros, grupos: new Set() });
  const soloEste = (g: GrupoId) => p.onFiltros({ ...filtros, grupos: new Set([g]) });

  const ordenadas = [...p.visibles].sort((a, b) => a.distancia - b.distancia);

  useEffect(() => {
    if (!p.seleccionado) return;
    lista.current?.querySelector(`[data-id="${p.seleccionado}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [p.seleccionado]);

  if (estado.fase === "reposo") {
    return (
      <div className="rounded-[6px] border border-dashed border-[var(--border-default)] p-6 text-center text-sm text-[var(--text-secondary)]">
        Define el ámbito en la pestaña Figuras y pulsa «Analizar entorno». Las distancias aparecerán aquí y se irán dibujando en el mapa según lleguen los datos.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {estado.error && (
        <p role="alert" className="rounded-[6px] bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-[var(--status-danger-fg)]">
          {estado.error}
        </p>
      )}
      <Progreso fuentes={estado.fuentes} fase={estado.fase} duracionMs={estado.duracionMs} />

      {estado.ubicacion.municipio && (
        <p className="text-sm text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-primary)]">{estado.ubicacion.municipio}</span>
          {estado.ubicacion.provincia ? ` (${estado.ubicacion.provincia})` : ""}
          {typeof estado.ubicacion.altitud === "number" ? ` · ${estado.ubicacion.altitud.toLocaleString("es-ES")} m s.n.m.` : ""}
        </p>
      )}

      <section aria-labelledby="dist-filtros">
        <div className="flex items-center justify-between gap-3">
          <h3 id="dist-filtros" className="text-sm font-semibold text-[var(--text-primary)]">Filtrar por tipo</h3>
          <span className="text-xs text-[var(--text-secondary)]">
            <button type="button" className="underline-offset-2 hover:underline" onClick={todos}>Todos</button>
            {" · "}
            <button type="button" className="underline-offset-2 hover:underline" onClick={ninguno}>Ninguno</button>
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {GRUPOS.map((g) => {
            const n = cuentas.get(g.id) ?? 0;
            const on = filtros.grupos.has(g.id);
            return (
              <button
                key={g.id}
                type="button"
                aria-pressed={on}
                disabled={n === 0}
                title={`${g.descripcion}. Doble clic: solo este tipo.`}
                onClick={() => alternar(g.id)}
                onDoubleClick={() => soloEste(g.id)}
                className="inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  borderColor: on && n ? g.color : "var(--border-subtle)",
                  backgroundColor: on && n ? `${g.color}26` : "transparent",
                  color: on && n ? "var(--text-primary)" : "var(--text-muted)",
                }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.color, opacity: on && n ? 1 : 0.4 }} aria-hidden="true" />
                {g.nombre}
                <span className="tabular-nums text-[var(--text-muted)]">{n}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="dist-max" className="field-label">Distancia</label>
            <select id="dist-max" className="input" value={filtros.maxKm ?? ""} onChange={(e) => p.onFiltros({ ...filtros, maxKm: e.target.value === "" ? null : Number(e.target.value) })}>
              {DISTANCIAS.map((d) => (
                <option key={d.etiqueta} value={d.valor ?? ""}>{d.etiqueta}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="dist-texto" className="field-label">Buscar</label>
            <input id="dist-texto" className="input" value={filtros.texto} onChange={(e) => p.onFiltros({ ...filtros, texto: e.target.value })} placeholder="Nombre…" />
          </div>
        </div>

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-[var(--text-primary)]">
          <input type="checkbox" className="h-4 w-4 accent-[var(--moss-ink)]" checked={p.etiquetas} onChange={(e) => p.onEtiquetas(e.target.checked)} />
          Mostrar la distancia sobre cada línea del mapa
        </label>
      </section>

      <section aria-labelledby="dist-lista">
        <div className="flex items-center justify-between gap-3">
          <h3 id="dist-lista" className="text-sm font-semibold text-[var(--text-primary)]">
            Distancias ({ordenadas.length}
            {ordenadas.length !== estado.mediciones.length ? ` de ${estado.mediciones.length}` : ""})
          </h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={p.onEncuadrar} disabled={!ordenadas.length}>
            Encuadrar
          </button>
        </div>
        {ordenadas.length === 0 ? (
          <p className="mt-2 rounded-[6px] border border-dashed border-[var(--border-default)] p-4 text-center text-sm text-[var(--text-secondary)]">
            {estado.fase === "cargando" ? "Esperando los primeros datos…" : "Ninguna medición coincide con los filtros."}
          </p>
        ) : (
          <ul ref={lista} className="mt-2 divide-y divide-[var(--border-subtle)] rounded-[6px] border border-[var(--border-subtle)]">
            {ordenadas.map((m) => {
              const g = GRUPO_POR_ID[m.grupo];
              const activo = p.resaltado === m.id || p.seleccionado === m.id;
              return (
                <li key={m.id} data-id={m.id}>
                  <button
                    type="button"
                    onMouseEnter={() => p.onHover(m.id)}
                    onMouseLeave={() => p.onHover(null)}
                    onFocus={() => p.onHover(m.id)}
                    onBlur={() => p.onHover(null)}
                    onClick={() => p.onSeleccion(m.id)}
                    className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--surface-hover)] ${activo ? "bg-[var(--surface-hover)]" : ""}`}
                  >
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: g.color }} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-[var(--text-primary)]">{m.nombre}</span>
                      <span className="block text-xs text-[var(--text-secondary)]">
                        {m.distancia <= 10 ? (m.distancia === 0 ? "Dentro del ámbito" : "Colindante") : `${fmtDistancia(m.distancia, true)}${m.rumbo ? ` al ${m.rumbo}` : ""}`}
                        {m.ruta ? ` · ${m.ruta.minutos} min en coche (${m.ruta.km.toLocaleString("es-ES")} km)` : ""}
                      </span>
                      {m.detalle && <span className="block text-xs text-[var(--text-muted)]">{m.detalle}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {ordenadas.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => p.onExportar("geojson")}>Exportar GeoJSON</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => p.onExportar("kml")}>Exportar KML</button>
          </div>
        )}
      </section>
    </div>
  );
}
