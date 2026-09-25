import Link from "next/link";
import {
  FICHA_SHEETS,
  SHEET_GLYPH,
  sheetGlyphFor,
  type EstadoGlyphOverrides,
  type FichaSheetKey,
} from "./ficha-sheets";
import { SheetStatusGlyph } from "./DataStatusBadge";
import TabPendingIndicator from "./TabPendingIndicator";

/**
 * Navegación por hojas del libro. Sustituye a la antigua cápsula
 * Demografía · Economía · Secciones censales: ahora cada hoja del XLSX tiene su
 * propio apartado. La hoja activa se marca con `aria-current` y color primario.
 *
 * v2.3 — mejoras generales:
 * - Glifo de estado por hoja (✓ ~ ⏳ —) SIEMPRE acompañado de texto accesible
 *   (sr-only + `title`), nunca glifo solo para lectores de pantalla.
 * - Tira horizontal con `overflow-x-auto` + `scroll-smooth` + overscroll táctil:
 *   a 375 px la página no se desborda, la tira desplaza y las pestañas nunca
 *   se comprimen (`shrink-0`).
 * - Con >6 hojas, respaldo en `<select>` nativo etiquetado (`sm:hidden`), que
 *   navega con un GET nativo: sin JS, sin `"use client"`, sin enlaces dobles
 *   que rompan el tabulado (por encima de 640 px el select no está en el DOM
 *   accesible ni enfocable).
 *
 * No usa estado cliente: los enlaces son navegación de servidor con `Link`.
 */
export default function SheetTabs({
  codigoINE,
  activa,
  searchParams,
  estadoPorHoja,
}: {
  codigoINE: string;
  activa: FichaSheetKey;
  searchParams: Record<string, string>;
  /**
   * Estado por hoja derivado del municipio (opcional), p. ej.
   * `{ patrimonio: "no-disponible" }` para pintar «—». Sin override manda el
   * estado editorial de `FICHA_SHEETS`.
   */
  estadoPorHoja?: EstadoGlyphOverrides;
}) {
  const hrefFor = (key: FichaSheetKey): string => {
    const p = new URLSearchParams(searchParams);
    // La hoja manda: se elimina el parámetro histórico `categoria` para no
    // entrar en conflicto con `?hoja=`.
    p.delete("categoria");
    if (key === "demografia") p.delete("hoja");
    else p.set("hoja", key);
    const qs = p.toString();
    return qs ? `/socideas/${codigoINE}?${qs}` : `/socideas/${codigoINE}`;
  };

  // Parámetros que el respaldo por select debe conservar al navegar (GET).
  const conservadas = Object.entries(searchParams).filter(
    ([k]) => k !== "hoja" && k !== "categoria",
  );
  const conSelect = FICHA_SHEETS.length > 6;

  return (
    <nav aria-label="Hojas del libro municipal" className="w-full min-w-0 max-w-full">
      {/* Respaldo accesible a 375 px: select nativo + envío GET, sin JS. */}
      {conSelect && (
        <form
          method="get"
          action={`/socideas/${codigoINE}`}
          className="mb-2 flex items-end gap-2 sm:hidden"
        >
          <div className="min-w-0 flex-1">
            <label
              htmlFor="ficha-hoja-select"
              className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]"
            >
              Ir a la hoja del libro
            </label>
            <select
              id="ficha-hoja-select"
              name="hoja"
              defaultValue={activa}
              className="w-full rounded-[6px] border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs font-semibold text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss-ink)]"
            >
              {FICHA_SHEETS.map((s) => {
                const g = SHEET_GLYPH[sheetGlyphFor(s, estadoPorHoja)];
                return (
                  <option key={s.key} value={s.key}>
                    {`${s.code} · ${s.label}: ${g.glifo} ${g.texto}`}
                  </option>
                );
              })}
            </select>
          </div>
          <button
            type="submit"
            aria-label="Ir a la hoja seleccionada"
            className="inline-flex min-h-[36px] items-center rounded-[6px] border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss-ink)]"
          >
            Ir
          </button>
          {conservadas.map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        </form>
      )}

      {/* Tira de pestañas: scroll horizontal propio, ancho mínimo legible. */}
      <div className="flex w-full min-w-0 gap-2 overflow-x-auto scroll-smooth p-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
        {FICHA_SHEETS.map((s) => {
          const selected = s.key === activa;
          return (
            <Link
              key={s.key}
              href={hrefFor(s.key)}
              aria-current={selected ? "page" : undefined}
              title={s.descripcion}
              className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[6px] border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss-ink)] ${
                selected
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                  : "border-[var(--color-border-subtle)] bg-[var(--color-card-bg)] text-[var(--color-text-secondary)] hover:border-[var(--color-border)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              <span
                aria-hidden="true"
                className={`font-mono text-[10px] tabular-nums ${
                  selected ? "text-white/80" : "text-[var(--color-text-muted)]"
                }`}
              >
                {s.code}
              </span>
              <span>{s.label}</span>
              <SheetStatusGlyph sheet={s} overrides={estadoPorHoja} selected={selected} />
              <TabPendingIndicator />
            </Link>
          );
        })}
        <Link
          href={`/socideas/${codigoINE}/secciones-censales`}
          title="Geometría de secciones censales del municipio"
          className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[6px] border border-dashed border-[var(--color-border)] bg-[var(--color-card-bg)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss-ink)]"
        >
          <span aria-hidden="true" className="font-mono text-[10px] text-[var(--color-text-muted)]">
            SC
          </span>
          Secciones censales
          <TabPendingIndicator />
        </Link>
      </div>
    </nav>
  );
}
