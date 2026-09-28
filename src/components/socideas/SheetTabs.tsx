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
import { FIELD_LABEL, SELECT } from "./ficha-ui";

/**
 * Navegación por hojas del libro. Sustituye a la antigua cápsula
 * Demografía · Economía · Secciones censales: ahora cada hoja del XLSX tiene su
 * propio apartado. La hoja activa se marca con `aria-current` y subrayado Conífera.
 *
 * v2.3 — mejoras generales:
 * - Glifo de estado por hoja (✓ ~ ○ —) SIEMPRE acompañado de texto accesible
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
          className="mb-3 flex items-end gap-2 sm:hidden"
        >
          <div className="min-w-0 flex-1">
            <label htmlFor="ficha-hoja-select" className={FIELD_LABEL}>
              Ir a la hoja del libro
            </label>
            <select
              id="ficha-hoja-select"
              name="hoja"
              defaultValue={activa}
              className={`${SELECT} w-full`}
            >
              {FICHA_SHEETS.map((s) => {
                const g = SHEET_GLYPH[sheetGlyphFor(s, estadoPorHoja)];
                return (
                  <option key={s.key} value={s.key}>
                    {`${s.code} ${s.label} (${g.texto.toLowerCase()})`}
                  </option>
                );
              })}
            </select>
          </div>
          <button type="submit" aria-label="Ir a la hoja seleccionada" className="btn btn-secondary btn-sm">
            Ir
          </button>
          {conservadas.map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        </form>
      )}

      {/* Pestañas subrayadas: scroll horizontal propio, sin comprimir. */}
      <div className="flex w-full min-w-0 overflow-x-auto border-b border-[var(--border-subtle)] [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] [scrollbar-color:var(--border-default)_transparent]">
        {FICHA_SHEETS.map((s) => {
          const selected = s.key === activa;
          return (
            <Link
              key={s.key}
              href={hrefFor(s.key)}
              aria-current={selected ? "page" : undefined}
              title={s.descripcion}
              className={`${TAB} ${selected ? TAB_ACTIVE : ""}`}
            >
              <span aria-hidden="true" className="text-xs tabular-nums text-[var(--text-muted)]">
                {s.code}
              </span>
              <span>{s.label}</span>
              <SheetStatusGlyph sheet={s} overrides={estadoPorHoja} selected={selected} />
              <TabPendingIndicator />
            </Link>
          );
        })}
        <span aria-hidden="true" className="mx-2 my-3 w-px shrink-0 bg-[var(--border-subtle)]" />
        <Link
          href={`/socideas/${codigoINE}/secciones-censales`}
          title="Atlas por sección censal del municipio"
          className={TAB}
        >
          Secciones censales
          <TabPendingIndicator />
        </Link>
      </div>
    </nav>
  );
}

/** Pestaña subrayada: indicador Conífera de 2 px en la activa. */
const TAB =
  "relative inline-flex min-h-[44px] shrink-0 items-center gap-2 whitespace-nowrap px-3 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--border-focus)]";
const TAB_ACTIVE =
  "font-semibold text-[var(--text-primary)] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-[var(--conifera)] after:content-['']";
