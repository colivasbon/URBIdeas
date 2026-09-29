"use client";

// Leyenda lateral del atlas de secciones. Solo presentación: recibe las clases
// ya calculadas por `clasificar()` y no recalcula nada.
//
// Layout (lo decide el contenedor con CSS, sin posicionamiento absoluto en
// escritorio): >=1024 px columna a la derecha del mapa; 768-1023 px fila
// horizontal bajo el mapa; <768 px colapsada tras el botón «Ver leyenda», que
// la superpone en la parte inferior del mapa.

import { useId, useState } from "react";
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
  const idTrama = `leg${useId().replace(/[^a-zA-Z0-9]/g, "")}-trama`;
  const idPanel = `${idTrama}-panel`;
  const [abiertaMovil, setAbiertaMovil] = useState(false);
  const [popover, setPopover] = useState(false);

  const clases = entradas.filter((e) => !e.esSinDato);
  const nd = entradas.find((e) => e.esSinDato) ?? null;
  const total = entradas.reduce((s, e) => s + (e.secciones ?? 0), 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbiertaMovil((v) => !v)}
        aria-expanded={abiertaMovil}
        aria-controls={idPanel}
        className="absolute bottom-3 left-3 z-[500] min-h-[44px] rounded-[6px] border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm font-medium text-[var(--text-primary)] md:hidden"
      >
        {abiertaMovil ? "Ocultar leyenda" : "Ver leyenda"}
      </button>

      <section
        id={idPanel}
        aria-label="Leyenda del mapa"
        className={`min-w-0 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-[var(--text-primary)] max-md:absolute max-md:inset-x-3 max-md:bottom-16 max-md:z-[500] max-md:max-h-[60%] max-md:overflow-y-auto md:flex md:flex-wrap md:items-start md:gap-x-6 md:gap-y-2 ${
          abiertaMovil ? "" : "max-md:hidden"
        }`}
      >
        <svg width="0" height="0" aria-hidden="true" focusable="false" className="absolute">
          <defs>
            <pattern id={idTrama} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="8" height="8" fill={COLOR_SIN_DATO} />
              <line x1="0" y1="0" x2="0" y2="8" stroke={COLOR_CONTORNO_SIN_DATO} strokeWidth="2" />
            </pattern>
          </defs>
        </svg>

        <header className="min-w-0 md:max-w-[16rem]">
          <p className="line-clamp-2 text-[14px] font-bold leading-snug" title={titulo}>
            {titulo}
          </p>
          {unidad ? <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{unidad}</p> : null}
          {anio !== null ? <p className="tnum text-[12px] text-[var(--text-muted)]">Período {anio}</p> : null}
        </header>

        <hr className="my-2.5 border-[var(--border-subtle)] md:hidden lg:block" />

        {sinValores ? (
          <p className="text-[12px] leading-snug text-[var(--text-muted)]">
            Sin escala: no hay valores observados que representar.
          </p>
        ) : (
          <ul className="tnum flex flex-col gap-1 md:flex-row md:flex-wrap md:gap-x-4 lg:flex-col">
            {clases.map((e, i) => (
              <li key={`${e.etiqueta}-${i}`} className="flex items-center gap-2 text-[12px] leading-snug">
                <span
                  aria-hidden="true"
                  className="inline-block h-3.5 w-3.5 flex-none rounded-[3px] border border-[var(--border-default)]"
                  style={{ background: e.color }}
                />
                <span className="min-w-0">{e.etiqueta}</span>
                {e.secciones !== null ? (
                  <span className="text-[var(--text-muted)]">({e.secciones})</span>
                ) : null}
              </li>
            ))}
            {nd ? (
              <li className="flex items-center gap-2 text-[12px] leading-snug">
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false" className="flex-none">
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
                <span>ND — Sin dato</span>
                {nd.secciones !== null ? <span className="text-[var(--text-muted)]">({nd.secciones})</span> : null}
              </li>
            ) : null}
          </ul>
        )}

        {!sinValores && (
          <p className="tnum mt-1.5 text-[11px] text-[var(--text-muted)] md:mt-0">Total: {total} secciones</p>
        )}

        <hr className="my-2.5 border-[var(--border-subtle)] md:hidden lg:block" />

        <div className="relative">
          <p className="text-[11px] text-[var(--text-muted)]">
            {etiquetaModoCorta(modo)} · {clases.length} {clases.length === 1 ? "clase" : "clases"}
          </p>
          <button
            type="button"
            disabled={sinValores}
            onClick={() => setPopover((v) => !v)}
            aria-expanded={popover}
            aria-haspopup="true"
            className="mt-1.5 min-h-[36px] w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-xs font-medium hover:border-[var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cambiar clasificación
          </button>
          {popover && (
            <div
              role="radiogroup"
              aria-label="Método de clasificación"
              onKeyDown={(e) => {
                if (e.key === "Escape") setPopover(false);
              }}
              className="absolute bottom-full left-0 z-[600] mb-1 w-full min-w-[12rem] rounded-[6px] border border-[var(--border-strong)] bg-[var(--bg-surface)] p-1 shadow-none"
            >
              {MODOS.map((m) => (
                <button
                  key={m.valor}
                  type="button"
                  role="radio"
                  aria-checked={modo === m.valor}
                  onClick={() => {
                    onModo(m.valor);
                    setPopover(false);
                  }}
                  className={`flex min-h-[36px] w-full items-center rounded-[6px] px-2.5 text-left text-xs ${
                    modo === m.valor
                      ? "bg-[var(--musgo)] font-semibold text-[var(--hueso)]"
                      : "hover:bg-[var(--bg-surface-sunken)]"
                  }`}
                >
                  {m.etiqueta}
                </button>
              ))}
              <p className="px-2.5 py-1 text-[11px] leading-snug text-[var(--text-muted)]">
                Los cortes manuales se escriben en los ajustes de clasificación.
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
