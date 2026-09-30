"use client";

// Buscador de indicadores del atlas de secciones, organizado por pestañas
// temáticas.
//
// Regla de honestidad: la lista sale SOLO del catálogo que trae el atlas del
// municipio (`atlas.indicators` + `atlas.cobertura`). Una pestaña sin
// indicadores en el catálogo se muestra con 0 y remite a la ficha municipal;
// nunca se rellena con un indicador que SOCideas no haya ingerido.

import { useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import Link from "next/link";
import { admiteValor } from "@/lib/socideas-secciones";
import type { SeccionesAtlasV1, SeccionIndicador, SeccionIndicadorCobertura, SeccionTema } from "@/lib/socideas-secciones";
import { INDICADORES_NO_SECCIONALES } from "@/lib/ine-censo-education-housing";

export interface GrupoTema {
  id: string;
  etiqueta: string;
  temas: SeccionTema[];
}

/** Pestañas temáticas. Las que no tienen temas en el catálogo actual quedan
 *  vacías (badge 0) hasta que se ingiera su operación. */
export const GRUPOS_TEMA: ReadonlyArray<GrupoTema> = [
  { id: "economico", etiqueta: "Económico", temas: ["renta", "desigualdad"] },
  { id: "demografia", etiqueta: "Población", temas: ["demografia"] },
  { id: "educacion", etiqueta: "Educación", temas: ["educacion"] },
  // La relación con la actividad del Censo Anual se presenta como «Actividad»:
  // su base es la población de 16 años o más y sus denominadores NO son los de
  // Educación, así que mezclarlas en una sola pestaña sería un error de lectura.
  { id: "laboral", etiqueta: "Actividad", temas: ["laboral"] },
  { id: "politica", etiqueta: "Política", temas: ["politica"] },
  { id: "vivienda", etiqueta: "Vivienda", temas: ["vivienda"] },
];

type EstadoIndicador = "ok" | "nd" | "no";

interface ItemIndicador {
  indicador: SeccionIndicador;
  grupoId: string;
  periodo: number | null;
  estado: EstadoIndicador;
}

const ETIQUETA_ESTADO: Record<EstadoIndicador, { marca: string; texto: string }> = {
  ok: { marca: "✓", texto: "Disponible" },
  nd: { marca: "ND", texto: "Disponible, con celdas sin dato" },
  no: { marca: "—", texto: "No disponible para este municipio" },
};

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** ND en el último periodo: alguna sección CON observación para ese indicador y
 *  ese periodo se queda sin valor. Se mira el periodo mostrado, no la cobertura
 *  agregada de todos los periodos.
 *
 *  Dos precisiones que importan para no marcar casi todo como ND:
 *   · Una sección SIN observación no es una celda sin dato: es que la fuente no
 *     publica ese indicador a ese grano para ella (agregado de distrito, otra
 *     vintage, otro dominio). Contarla como ND llenaba la lista de distintivos.
 *   · Un valor derivado con numerador y denominador (porcentajes del Censo
 *     Anual, ratios del ADRH) es publicable: se admite con `admiteValor`. */
function hayNd(obs: SeccionesAtlasV1["observations"], indicatorId: string, periodo: number): boolean {
  for (const sec of Object.keys(obs ?? {})) {
    if (!/^\d{10}$/.test(sec) || sec.endsWith("000")) continue;
    const porIndicador = obs[sec]?.[indicatorId];
    if (!porIndicador) continue;
    const o = porIndicador[String(periodo)];
    if (!o) continue; // esa sección no publica este indicador en este periodo
    if (!admiteValor(o.status) || typeof o.value !== "number") return true;
  }
  return false;
}

function grupoDe(tema: SeccionTema): string {
  return GRUPOS_TEMA.find((g) => g.temas.includes(tema))?.id ?? "economico";
}

export default function SeccionesIndicadorBuscador({
  codigoINE,
  municipioNombre,
  indicadores,
  cobertura,
  observaciones,
  indicadorId,
  cargando,
  onSeleccionar,
}: {
  codigoINE: string;
  municipioNombre: string;
  indicadores: ReadonlyArray<SeccionIndicador>;
  cobertura: ReadonlyArray<SeccionIndicadorCobertura>;
  observaciones: SeccionesAtlasV1["observations"];
  indicadorId: string | null;
  /** `true` mientras se aplica la selección: se anuncia a lectores de pantalla. */
  cargando: boolean;
  onSeleccionar: (indicador: SeccionIndicador, grupoId: string) => void;
}) {
  const baseId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const items = useMemo<ItemIndicador[]>(
    () => {
      const todosLosIndicadores = [...indicadores, ...INDICADORES_NO_SECCIONALES];
      return todosLosIndicadores.map((indicador) => {
        const cob = cobertura.find((c) => c.indicatorId === indicador.id);
        const periodo = cob && cob.periodos.length ? Math.max(...cob.periodos) : null;
        let estado: EstadoIndicador = "ok";
        if (!indicador.publicadoPorSeccion || periodo === null) estado = "no";
        else if (hayNd(observaciones, indicador.id, periodo)) estado = "nd";
        return { indicador, grupoId: grupoDe(indicador.tema), periodo, estado };
      });
    },
    [indicadores, cobertura, observaciones],
  );

  const grupoDelActivo = items.find((i) => i.indicador.id === indicadorId)?.grupoId ?? GRUPOS_TEMA[0].id;
  const [pestana, setPestana] = useState<string>(grupoDelActivo);
  const [consulta, setConsulta] = useState("");
  const [hoja, setHoja] = useState(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const conteo = (grupoId: string) => items.filter((i) => i.grupoId === grupoId && i.estado !== "no").length;
  const q = normalizar(consulta.trim());
  const coincide = (i: ItemIndicador) =>
    !q || normalizar(`${i.indicador.etiqueta} ${i.indicador.unidad} ${i.indicador.sourceTable}`).includes(q);

  const activo = items.find((i) => i.indicador.id === indicadorId) ?? null;
  const enBusqueda = q.length > 0;
  const visibles = items.filter((i) => i.grupoId === pestana && coincide(i));
  const porGrupoBusqueda = GRUPOS_TEMA.map((g) => ({
    grupo: g,
    lista: items.filter((i) => i.grupoId === g.id && coincide(i)),
  })).filter((x) => x.lista.length > 0);

  const seleccionar = (i: ItemIndicador) => {
    if (i.estado === "no") return;
    onSeleccionar(i.indicador, i.grupoId);
    setHoja(false);
  };

  const teclasPestanas = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    let destino = idx;
    if (e.key === "ArrowRight") destino = (idx + 1) % GRUPOS_TEMA.length;
    else if (e.key === "ArrowLeft") destino = (idx - 1 + GRUPOS_TEMA.length) % GRUPOS_TEMA.length;
    else if (e.key === "Home") destino = 0;
    else if (e.key === "End") destino = GRUPOS_TEMA.length - 1;
    else return;
    e.preventDefault();
    setPestana(GRUPOS_TEMA[destino].id);
    tabRefs.current[destino]?.focus();
  };

  const fila = (i: ItemIndicador) => {
    const seleccionado = i.indicador.id === indicadorId;
    const est = ETIQUETA_ESTADO[i.estado];
    return (
      <li key={i.indicador.id}>
        <button
          type="button"
          role="radio"
          aria-checked={seleccionado}
          aria-disabled={i.estado === "no"}
          disabled={i.estado === "no"}
          onClick={() => seleccionar(i)}
          className={`flex min-h-[44px] w-full items-center gap-3 rounded-[6px] border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--border-focus)] ${
            // Seleccionada: fondo + peso + filete. Indisponible: superficie
            // hundida, borde tenue y texto secundario legible (no se opaca).
            seleccionado
              ? "border-[var(--border-strong)] bg-[var(--musgo)] font-bold text-[var(--hueso)]"
              : i.estado === "no"
                ? "cursor-not-allowed border-[var(--border-subtle)] bg-[var(--bg-surface-sunken)] text-[var(--text-secondary)]"
                : "border-transparent text-[var(--text-primary)] hover:border-[var(--border-default)] hover:bg-[var(--bg-surface-sunken)]"
          }`}
        >
          <span className="min-w-0 flex-1 leading-snug">{i.indicador.etiqueta}</span>
          {/* El periodo hereda el color de la fila. Si fijara su propio tono
              Secondary sobre el musgo de la fila seleccionada caería a 1,2:1 en
              modo claro: el año desaparecía justo en la fila activa. */}
          <span
            className={`tnum flex-none text-xs ${seleccionado ? "" : "text-[var(--text-secondary)]"}`}
          >
            {i.periodo ?? ""}
          </span>
          <span
            title={est.texto}
            className="tnum flex-none rounded-[6px] border border-current px-1.5 text-[11px] leading-5"
          >
            <span aria-hidden="true">{est.marca}</span>
            <span className="sr-only">{est.texto}</span>
          </span>
        </button>
      </li>
    );
  };

  const contenido = (
    <>
      <div className="mb-3">
        <label htmlFor={`${baseId}-q`} className="type-label mb-1.5 block text-[var(--text-secondary)]">
          Buscar indicador
        </label>
        <input
          id={`${baseId}-q`}
          type="search"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder="Renta, población, Gini…"
          autoComplete="off"
          className="min-h-[44px] w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]"
        />
      </div>

      {/* Escritorio: pestañas. Móvil (<768 px): selector. */}
      {!enBusqueda && (
        <>
          <div
            role="tablist"
            aria-label="Temas de indicadores"
            className="mb-3 hidden flex-wrap gap-1 md:flex"
          >
            {GRUPOS_TEMA.map((g, idx) => {
              const sel = pestana === g.id;
              return (
                <button
                  key={g.id}
                  ref={(el) => {
                    tabRefs.current[idx] = el;
                  }}
                  id={`${baseId}-tab-${g.id}`}
                  type="button"
                  role="tab"
                  aria-selected={sel}
                  aria-controls={`${baseId}-panel`}
                  tabIndex={sel ? 0 : -1}
                  onClick={() => setPestana(g.id)}
                  onKeyDown={(e) => teclasPestanas(e, idx)}
                  className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-[6px] border px-2.5 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)] ${
                    // La pestaña activa se distingue por fondo, peso Y filete.
                    sel
                      ? "border-[var(--border-strong)] bg-[var(--musgo)] font-bold text-[var(--hueso)]"
                      : "border-[var(--border-default)] bg-[var(--bg-surface)] font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-sunken)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {g.etiqueta}
                  <span className="tnum rounded-[6px] bg-[var(--crisopa,#C2E189)] px-1.5 text-[11px] leading-5 font-semibold text-[var(--carbon-900,#1E2220)]">
                    {conteo(g.id)}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mb-3 md:hidden">
            <label htmlFor={`${baseId}-sel`} className="type-label mb-1.5 block text-[var(--text-secondary)]">
              Tema
            </label>
            <select
              id={`${baseId}-sel`}
              value={pestana}
              onChange={(e) => setPestana(e.target.value)}
              className="min-h-[44px] w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
            >
              {GRUPOS_TEMA.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.etiqueta} ({conteo(g.id)})
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <div
        id={`${baseId}-panel`}
        role={enBusqueda ? undefined : "tabpanel"}
        aria-labelledby={enBusqueda ? undefined : `${baseId}-tab-${pestana}`}
        className="max-h-[60vh] overflow-y-auto overscroll-contain rounded-[6px] border border-[var(--border-subtle)] p-1"
      >
        {enBusqueda ? (
          porGrupoBusqueda.length === 0 ? (
            <p className="p-3 text-sm text-[var(--text-muted)]">Ningún indicador coincide con «{consulta.trim()}».</p>
          ) : (
            porGrupoBusqueda.map(({ grupo, lista }) => (
              <details key={grupo.id} open className="mb-1">
                <summary className="cursor-pointer rounded-[6px] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]">
                  {grupo.etiqueta} ({lista.length})
                </summary>
                <ul role="radiogroup" aria-label={grupo.etiqueta} className="flex flex-col gap-0.5">
                  {lista.map(fila)}
                </ul>
              </details>
            ))
          )
        ) : (
          <>
            {conteo(pestana) === 0 && (
              <p className="p-3 text-sm text-[var(--text-secondary)]" role="status">
                No hay datos seccionales disponibles para {municipioNombre} en esta categoría. Consulta la{" "}
                <Link
                  href={`/socideas/${codigoINE}`}
                  className="font-semibold underline underline-offset-2"
                >
                  ficha municipal
                </Link>{" "}
                para datos agregados.
              </p>
            )}
            {visibles.length > 0 && (
              <ul role="radiogroup" aria-label="Indicadores" className="flex flex-col gap-0.5">
                {visibles.map(fila)}
              </ul>
            )}
          </>
        )}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]" aria-live="polite">
        {cargando ? "Aplicando indicador…" : "✓ disponible · ND con celdas sin dato · — no disponible"}
      </p>
    </>
  );

  return (
    <div>
      {/* Móvil: botón que abre la hoja inferior. */}
      <div className="md:hidden">
        <p className="type-label mb-1.5 text-[var(--text-secondary)]">Indicador con dato por sección</p>
        <button
          type="button"
          onClick={() => setHoja(true)}
          aria-haspopup="dialog"
          aria-expanded={hoja}
          className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-left text-sm text-[var(--text-primary)]"
        >
          <span className="min-w-0 truncate">{activo?.indicador.etiqueta ?? "Elegir indicador"}</span>
          <span className="tnum flex-none text-xs text-[var(--text-muted)]">{activo?.periodo ?? ""}</span>
        </button>
      </div>
      {hoja && (
        <button
          type="button"
          aria-label="Cerrar selector de indicadores"
          onClick={() => setHoja(false)}
          className="fixed inset-0 z-[1090] bg-[var(--carbon-900,#1E2220)]/60 md:hidden"
        />
      )}
      <div
        role={hoja ? "dialog" : undefined}
        aria-modal={hoja ? true : undefined}
        aria-label={hoja ? "Selector de indicadores" : undefined}
        className={
          hoja
            ? "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-[1100] max-md:max-h-[85vh] max-md:overflow-y-auto max-md:rounded-t-[6px] max-md:border-t max-md:border-[var(--border-strong)] max-md:bg-[var(--bg-canvas)] max-md:p-4"
            : "max-md:hidden"
        }
      >
        {hoja && (
          <button
            type="button"
            onClick={() => setHoja(false)}
            className="mb-3 ml-auto flex min-h-[44px] items-center rounded-[6px] border border-[var(--border-default)] px-3 text-sm md:hidden"
          >
            Cerrar
          </button>
        )}
        <p className="type-label mb-1.5 hidden text-[var(--text-secondary)] md:block">
          Indicador con dato por sección
        </p>
        {contenido}
      </div>
    </div>
  );
}
