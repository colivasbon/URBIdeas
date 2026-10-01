"use client";

// Buscador de indicadores del atlas de secciones, organizado por pestañas
// temáticas.
//
// Regla de honestidad: la lista sale SOLO del catálogo que trae el atlas del
// municipio (`atlas.indicators` + `atlas.cobertura`). Una pestaña sin
// indicadores en el catálogo se muestra con 0 y remite a la ficha municipal;
// nunca se rellena con un indicador que SOCideas no haya ingerido.
//
// La URL es la única fuente de verdad del grupo activo: las pestañas viven en
// `SeccionesDominioTabs`, por encima de la bifurcación entre el motor numérico y
// el panel político, y escriben `?g=` a través del callback del padre. Este
// componente ya no guarda pestaña propia: deriva la que toca de `grupoActivo`.

import { useRef, useState } from "react";
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

export interface ItemIndicador {
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

/** Catálogo del municipio agrupado por grupo en indicador, con su estado de dato.
 *  Lo calcula UNA vez el atlas y lo comparten las pestañas y el listado: antes
 *  cada uno recorría el catálogo por su cuenta. */
export function construirItemsIndicadores(
  indicadores: ReadonlyArray<SeccionIndicador>,
  cobertura: ReadonlyArray<SeccionIndicadorCobertura>,
  observaciones: SeccionesAtlasV1["observations"],
): ItemIndicador[] {
  const todosLosIndicadores = [...indicadores, ...INDICADORES_NO_SECCIONALES];
  return todosLosIndicadores.map((indicador) => {
    const cob = cobertura.find((c) => c.indicatorId === indicador.id);
    const periodo = cob && cob.periodos.length ? Math.max(...cob.periodos) : null;
    let estado: EstadoIndicador = "ok";
    if (!indicador.publicadoPorSeccion || periodo === null) estado = "no";
    else if (hayNd(observaciones, indicador.id, periodo)) estado = "nd";
    return { indicador, grupoId: grupoDe(indicador.tema), periodo, estado };
  });
}

/** Indicadores con dato por grupo: el número del badge de cada pestaña. */
export function conteosPorGrupo(items: ReadonlyArray<ItemIndicador>): Record<string, number> {
  const conteos: Record<string, number> = {};
  for (const g of GRUPOS_TEMA) conteos[g.id] = 0;
  for (const i of items) {
    if (i.estado === "no") continue;
    conteos[i.grupoId] = (conteos[i.grupoId] ?? 0) + 1;
  }
  return conteos;
}

/** Pestañas de dominio, escritas por el padre en `?g=`.
 *
 *  Vive FUERA del panel de Política para que desde esa pestaña se pueda volver
 *  al motor numérico sin editar la URL a mano: el nodo de la pestaña enfocada
 *  no se desmonta al cambiar de contenido, así que el foco sobrevive.
 *
 *  Una pestaña cuyo grupo no está en `gruposDisponibles` queda `aria-disabled`
 *  y NO escribe nada: `grupoActivo` la rechazaría y el efecto de limpieza de
 *  parámetros la borraría de la URL, dejando la vista y la URL en desacuerdo. */
export function SeccionesDominioTabs({
  idBase,
  panelId,
  grupoActivo,
  gruposDisponibles,
  conteos,
  onGrupo,
}: {
  /** Prefijo de id compartido con el panel del buscador. */
  idBase: string;
  /** Id del `tabpanel` de indicadores; se omite cuando la pestaña activa no
   *  muestra ese panel (Política), para no apuntar a un nodo inexistente. */
  panelId?: string;
  grupoActivo: string;
  gruposDisponibles: ReadonlyArray<{ id: string }>;
  conteos: Readonly<Record<string, number>>;
  onGrupo: (grupoId: string) => void;
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const disponible = (grupoId: string) => gruposDisponibles.some((g) => g.id === grupoId);

  const teclasPestanas = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    let destino = idx;
    if (e.key === "ArrowRight") destino = (idx + 1) % GRUPOS_TEMA.length;
    else if (e.key === "ArrowLeft") destino = (idx - 1 + GRUPOS_TEMA.length) % GRUPOS_TEMA.length;
    else if (e.key === "Home") destino = 0;
    else if (e.key === "End") destino = GRUPOS_TEMA.length - 1;
    else return;
    e.preventDefault();
    // El foco se mueve SIEMPRE (también sobre una pestaña sin datos: es
    // alcanzable y hay que poder salir de ella), pero solo se escribe un `g`
    // que `grupoActivo` vaya a aceptar.
    const id = GRUPOS_TEMA[destino].id;
    if (disponible(id)) onGrupo(id);
    tabRefs.current[destino]?.focus();
  };

  return (
    <>
      {/* Escritorio: pestañas. Móvil (<768 px): selector. */}
      <div
        role="tablist"
        aria-label="Temas de indicadores"
        className="mb-3 hidden flex-wrap gap-1 md:flex"
      >
        {GRUPOS_TEMA.map((g, idx) => {
          const sel = grupoActivo === g.id;
          const habilitada = disponible(g.id);
          return (
            <button
              key={g.id}
              ref={(el) => {
                tabRefs.current[idx] = el;
              }}
              id={`${idBase}-tab-${g.id}`}
              type="button"
              role="tab"
              aria-selected={sel}
              // Sin `disabled`: el botón sigue siendo alcanzable por teclado y
              // el mensaje «sin datos» del panel sigue siendo legible.
              aria-disabled={!habilitada}
              aria-controls={panelId}
              tabIndex={sel ? 0 : -1}
              onClick={() => {
                if (habilitada) onGrupo(g.id);
              }}
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
                {conteos[g.id] ?? 0}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mb-3 md:hidden">
        <label htmlFor={`${idBase}-sel`} className="type-label mb-1.5 block text-[var(--text-secondary)]">
          Tema
        </label>
        <select
          id={`${idBase}-sel`}
          value={grupoActivo}
          onChange={(e) => {
            if (disponible(e.target.value)) onGrupo(e.target.value);
          }}
          className="min-h-[44px] w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          {GRUPOS_TEMA.map((g) => (
            <option key={g.id} value={g.id} disabled={!disponible(g.id)}>
              {g.etiqueta} ({conteos[g.id] ?? 0})
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

export default function SeccionesIndicadorBuscador({
  codigoINE,
  municipioNombre,
  idBase,
  items,
  conteos,
  indicadorId,
  grupoActivo,
  cargando,
  onSeleccionar,
}: {
  codigoINE: string;
  municipioNombre: string;
  /** Prefijo de id del `tabpanel`, el mismo que usa `SeccionesDominioTabs`. */
  idBase: string;
  items: ReadonlyArray<ItemIndicador>;
  conteos: Readonly<Record<string, number>>;
  indicadorId: string | null;
  /** Grupo activo leído de `?g=` por el atlas. Es la fuente de verdad: este
   *  componente no mantiene pestaña propia. */
  grupoActivo: string;
  /** `true` mientras se aplica la selección: se anuncia a lectores de pantalla. */
  cargando: boolean;
  onSeleccionar: (indicador: SeccionIndicador, grupoId: string) => void;
}) {
  const [consulta, setConsulta] = useState("");
  const [hoja, setHoja] = useState(false);

  // El grupo visible es SIEMPRE el de la URL. Sin este estado local no puede
  // haber solape: la pestaña y la vista se mueven a la vez porque las dos leen
  // el mismo `?g=`.
  const pestana = grupoActivo;
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
        <label htmlFor={`${idBase}-q`} className="type-label mb-1.5 block text-[var(--text-secondary)]">
          Buscar indicador
        </label>
        <input
          id={`${idBase}-q`}
          type="search"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder="Renta, población, Gini…"
          autoComplete="off"
          className="min-h-[44px] w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]"
        />
      </div>

      <div
        id={`${idBase}-panel`}
        role={enBusqueda ? undefined : "tabpanel"}
        aria-labelledby={enBusqueda ? undefined : `${idBase}-tab-${pestana}`}
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
            {(conteos[pestana] ?? 0) === 0 && (
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