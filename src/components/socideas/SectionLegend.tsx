"use client";

// Leyenda del atlas de secciones,Compositor WEB.
//
// Solo presentación: recibe las clases ya calculadas por `clasificar()` y no
// recalcula nada.
//
// DISPOSICIÓN (cerrada por especificación, no por CSS heredado)
//  - La leyenda va SIEMPRE DEBAJO del mapa, en el flujo normal. No hay columna
//    lateral ni superposición: el mapa ocupa el 100 % del ancho del área
//    cartográfica y la leyenda ocupa el 100 % de ese mismo ancho debajo.
//  - >=1024 px: cabecera y clases en una o dos filas como máximo (flex-wrap),
//    nunca una columna vertical.
//  - 768-1023 px: mismo comportamiento, con más saltos de línea.
//  - <768 px: colapsada por defecto tras un botón «Ver leyenda» que vive en el
//    flujo, debajo del mapa. Al desplegarse empuja el contenido (no tapa el
//    mapa) y se cierra con el botón o con Escape.
//
// Los cuatro estados de los controles se distinguen por más que el color:
// normal / seleccionado / hover-foco / deshabilitado.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { COLOR_CONTORNO_SIN_DATO, COLOR_SIN_DATO } from "@/lib/socideas-secciones";
import type { ModoClasificacion } from "@/lib/socideas-secciones";
import type { EntradaLeyendaAtlas } from "./SeccionesAtlasMap";

const MODOS: Array<{ valor: ModoClasificacion; etiqueta: string }> = [
  { valor: "cuantil", etiqueta: "Cuantiles" },
  { valor: "intervalos_iguales", etiqueta: "Intervalos iguales" },
  { valor: "jenks", etiqueta: "Jenks" },
  { valor: "cortes_manuales", etiqueta: "Manual" },
];

export function etiquetaModoCorta(modo: ModoClasificacion): string {
  return MODOS.find((m) => m.valor === modo)?.etiqueta ?? modo;
}

/** Botón secundario del atlas. Estados explícitos y foco visible. */
const BTN =
  "inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-xs font-medium text-[var(--text-primary)] transition-colors " +
  "hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-sunken)] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)] " +
  // Deshabilitado: legible, pero con fondo hundido, borde tenue y sin hover.
  "disabled:cursor-not-allowed disabled:border-[var(--border-subtle)] disabled:bg-[var(--bg-surface-sunken)] disabled:text-[var(--text-muted)] disabled:opacity-100 disabled:hover:border-[var(--border-subtle)] disabled:hover:bg-[var(--bg-surface-sunken)]";

export default function SectionLegend({
  titulo,
  unidad,
  anio,
  entradas,
  modo,
  onModo,
  sinValores,
}: {
  titulo: string;
  unidad: string;
  anio: number | null;
  entradas: ReadonlyArray<EntradaLeyendaAtlas>;
  modo: ModoClasificacion;
  onModo: (modo: ModoClasificacion) => void;
  /** Sin valores observados no hay escala que mostrar. */
  sinValores: boolean;
}) {
  const idBase = useId().replace(/[^a-zA-Z0-9]/g, "");
  const idTrama = `leg${idBase}-trama`;
  const idPanel = `leg${idBase}-panel`;
  const idPopover = `leg${idBase}-popover`;
  const botonRef = useRef<HTMLButtonElement | null>(null);
  const botonLeyendaRef = useRef<HTMLButtonElement | null>(null);
  const cajaPopoverRef = useRef<HTMLDivElement | null>(null);
  const [abiertaMovil, setAbiertaMovil] = useState(false);
  const [popover, setPopover] = useState(false);
  /** `true` cuando el desplegable se abre hacia abajo por falta de espacio. */
  const [popoverAbajo, setPopoverAbajo] = useState(false);

  /** Abre el desplegable eligiendo el lado según el espacio disponible. */
  const abrirPopover = useCallback(() => {
    const caja = cajaPopoverRef.current;
    if (caja) {
      const r = caja.getBoundingClientRect();
      // Alto aproximado del desplegable: cinco filas más la ayuda.
      setPopoverAbajo(r.top < 240);
    }
    setPopover(true);
  }, []);

  const cerrarPopover = useCallback(() => {
    setPopover(false);
    botonRef.current?.focus();
  }, []);

  // Escape cierra el desplegable de clasificación y devuelve el foco.
  useEffect(() => {
    if (!popover) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        cerrarPopover();
      }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [popover, cerrarPopover]);

  // Escape cierra también la leyenda desplegada en móvil. Se escucha en
  // `document` porque el foco puede estar en el botón «Ver leyenda», que vive
  // FUERA del panel: con un `onKeyDown` local no se cerraría nunca.
  useEffect(() => {
    if (!abiertaMovil) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbiertaMovil(false);
        botonLeyendaRef.current?.focus();
      }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [abiertaMovil]);

  const clases = entradas.filter((e) => !e.esSinDato);
  const nd = entradas.find((e) => e.esSinDato) ?? null;
  // El total que se declara es la suma REAL de los recuentos que se pintan.
  const total = entradas.reduce((s, e) => s + (e.secciones ?? 0), 0);
  const totalClases = clases.reduce((s, e) => s + (e.secciones ?? 0), 0);

  return (
    <section
      className="mt-3 min-w-0 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)]"
      aria-label="Leyenda del mapa"
    >
      {/* ── Cabecera: indicador, unidad y periodo ─────────────────────────── */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-3 pt-3">
        <h2 className="min-w-0 text-[14px] font-bold leading-snug text-[var(--text-primary)]">
          {titulo}
        </h2>
        {unidad ? (
          <p className="text-[12px] leading-snug text-[var(--text-secondary)]">
            <span className="sr-only">Unidad: </span>
            {unidad}
          </p>
        ) : null}
        {anio !== null ? (
          <p className="tnum text-[12px] leading-snug text-[var(--text-secondary)]">
            <span className="sr-only">Periodo: </span>Período {anio}
          </p>
        ) : null}
      </div>

      <svg width="0" height="0" aria-hidden="true" focusable="false" className="absolute">
        <defs>
          <pattern
            id={idTrama}
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="8" height="8" fill={COLOR_SIN_DATO} />
            <line x1="0" y1="0" x2="0" y2="8" stroke={COLOR_CONTORNO_SIN_DATO} strokeWidth="2" />
          </pattern>
        </defs>
      </svg>

      {/* ── Botón «Ver leyenda»: solo móvil, en el flujo bajo el mapa ──────── */}
      <div className="px-3 pt-2 md:hidden">
        <button
          ref={botonLeyendaRef}
          type="button"
          onClick={() => setAbiertaMovil((v) => !v)}
          aria-expanded={abiertaMovil}
          aria-controls={idPanel}
          className={`${BTN} w-full min-h-[44px] text-sm`}
        >
          <span aria-hidden="true">{abiertaMovil ? "▾" : "▸"}</span>
          {abiertaMovil ? "Ocultar leyenda" : "Ver leyenda"}
        </button>
      </div>

      {/* ── Cuerpo: en escritorio siempre visible; en móvil, según el botón ─ */}
      <div
        id={idPanel}
        className={`px-3 pb-3 pt-2 ${abiertaMovil ? "" : "hidden md:block"}`}
        onKeyDown={(e) => {
          if (e.key === "Escape" && abiertaMovil) setAbiertaMovil(false);
        }}
      >
        {sinValores ? (
          <p className="text-[12px] leading-snug text-[var(--text-secondary)]">
            Sin escala: no hay valores observados que representar.
          </p>
        ) : (
          <>
            {/* Clases en filas flexibles: nunca una columna, nunca scroll
                horizontal en la página. */}
            <ul className="flex flex-wrap items-start gap-x-5 gap-y-1.5">
              {clases.map((e, i) => (
                <li
                  key={`${e.etiqueta}-${i}`}
                  className="flex min-w-0 items-center gap-2 text-[12px] leading-snug"
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-3.5 w-3.5 flex-none rounded-[3px] border border-[var(--border-strong)]"
                    style={{ background: e.color }}
                  />
                  <span className="min-w-0 text-[var(--text-primary)]">{e.etiqueta}</span>
                  {e.secciones !== null ? (
                    <span className="tnum flex-none text-[var(--text-secondary)]">
                      <span className="sr-only">{e.secciones} secciones. </span>
                      ({e.secciones})
                    </span>
                  ) : null}
                </li>
              ))}
              {nd ? (
                <li className="flex min-w-0 items-center gap-2 text-[12px] leading-snug">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    aria-hidden="true"
                    focusable="false"
                    className="flex-none"
                  >
                    <rect
                      x="0.5"
                      y="0.5"
                      width="13"
                      height="13"
                      rx="3"
                      fill={`url(#${idTrama})`}
                      stroke={COLOR_CONTORNO_SIN_DATO}
                    />
                  </svg>
                  <span className="text-[var(--text-primary)]">ND — Sin dato oficial</span>
                  {nd.secciones !== null ? (
                    <span className="tnum flex-none text-[var(--text-secondary)]">
                      <span className="sr-only">{nd.secciones} secciones. </span>({nd.secciones})
                    </span>
                  ) : null}
                </li>
              ) : null}
            </ul>

            {nd ? (
              <p className="mt-2 text-[11px] leading-snug text-[var(--text-secondary)]">
                ND significa «sin dato oficial»: la fuente no difunde valor para esas secciones. No
                equivale a cero y esas secciones no entran en la escala de color.
              </p>
            ) : null}
          </>
        )}

        {/* ── Pie: método, número de clases y total ──────────────────────── */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border-subtle)] pt-2.5">
          {!sinValores ? (
            <p className="tnum text-[11px] leading-snug text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)]">
                {etiquetaModoCorta(modo)} · {clases.length}{" "}
                {clases.length === 1 ? "clase" : "clases"}
              </span>
              {" · "}
              {totalClases} secciones con dato
              {nd ? ` · ${nd.secciones ?? 0} ND` : ""}
              {` · ${total} representadas en total`}
            </p>
          ) : null}

          <div className="relative ml-auto" ref={cajaPopoverRef}>
            <button
              ref={botonRef}
              type="button"
              disabled={sinValores}
              onClick={abrirPopover}
              aria-expanded={popover}
              aria-haspopup="true"
              aria-controls={idPopover}
              className={BTN}
            >
              Cambiar clasificación
              <span aria-hidden="true">{popover ? "▴" : "▾"}</span>
            </button>
            {popover ? (
              <div
                id={idPopover}
                role="radiogroup"
                aria-label="Método de clasificación"
                className={`absolute z-[600] w-[15rem] max-w-[calc(100vw-3rem)] rounded-[6px] border border-[var(--border-strong)] bg-[var(--bg-surface)] p-1 shadow-[var(--shadow-2)] ${
                  // Se abre hacia abajo si no cabe hacia arriba: una leyenda
                  // cerca del borde superior no puede esconder el desplegable
                  // detrás de la cabecera fija.
                  popoverAbajo ? "top-full left-0 mt-1.5" : "bottom-full right-0 mb-1.5"
                }`}
              >
                {MODOS.map((m) => {
                  const sel = modo === m.valor;
                  return (
                    <button
                      key={m.valor}
                      type="button"
                      role="radio"
                      aria-checked={sel}
                      onClick={() => {
                        onModo(m.valor);
                        setPopover(false);
                      }}
                      className={`flex min-h-[36px] w-full items-center justify-between gap-2 rounded-[6px] px-2.5 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--border-focus)] ${
                        sel
                          ? "border border-[var(--border-strong)] bg-[var(--musgo)] font-semibold text-[var(--hueso)]"
                          : "border border-transparent text-[var(--text-primary)] hover:bg-[var(--bg-surface-sunken)]"
                      }`}
                    >
                      <span>{m.etiqueta}</span>
                      {sel ? (
                        <span aria-hidden="true" className="flex-none">
                          ●
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                <p className="px-2.5 py-1.5 text-[11px] leading-snug text-[var(--text-muted)]">
                  Los cortes manuales se escriben en los ajustes de clasificación.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
