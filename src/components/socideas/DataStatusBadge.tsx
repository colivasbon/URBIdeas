/**
 * Badge unificado de estado de dato/tabla SOCideas.
 * Punto + texto siempre (nunca solo color). Amarillo solo para alerta genuina,
 * rojo solo para error real. Legible en modo oscuro y claro.
 */
import {
  SHEET_GLYPH,
  sheetGlyphFor,
  type EstadoGlyph,
  type EstadoGlyphOverrides,
  type FichaSheetMeta,
} from "./ficha-sheets";

export type DataEstado =
  | "consolidado"
  | "provisional"
  | "parcial"
  | "pendiente"
  | "sin-cobertura"
  | "secreto"
  | "no-comparable"
  | "no-aplicable"
  | "error";

const CONFIG: Record<DataEstado, { tono: "mineral" | "positive" | "draft" | "alert" | "error" | undefined; etiqueta: string }> = {
  consolidado: { tono: "mineral", etiqueta: "Consolidado" },
  provisional: { tono: "draft", etiqueta: "Provisional" },
  parcial: { tono: "positive", etiqueta: "Cobertura parcial" },
  pendiente: { tono: undefined, etiqueta: "Pendiente" },
  "sin-cobertura": { tono: undefined, etiqueta: "Sin cobertura" },
  secreto: { tono: undefined, etiqueta: "Secreto estadístico" },
  "no-comparable": { tono: undefined, etiqueta: "No comparable" },
  "no-aplicable": { tono: undefined, etiqueta: "No aplicable" },
  error: { tono: "error", etiqueta: "Error" },
};

export default function DataStatusBadge({ estado }: { estado: DataEstado }) {
  const c = CONFIG[estado];
  return (
    <span className="socideas-badge" data-tone={c.tono} role="status">
      <span aria-hidden="true" className="socideas-badge__dot" />
      {c.etiqueta}
    </span>
  );
}

/* ============================================================
   Glifo de estado por hoja (Índice de la ficha / ProyectoSheet)
   Reutilizable por el coordinador en cualquier lista de hojas.
   El glifo va oculto para lectores de pantalla y el texto accesible
   se emite en paralelo (sr-only): nunca se lee solo un «✓».
   ============================================================ */

/** Color del glifo sobre tarjeta/pestaña inactiva (todos ≥4.5:1 en ambos temas). */
const GLYPH_COLOR: Record<EstadoGlyph, string> = {
  ok: "text-[var(--color-success)]",
  stale: "text-[var(--color-warning)]",
  pronto: "text-[var(--color-text-muted)]",
  "no-disponible": "text-[var(--color-text-secondary)]",
};

/**
 * Glifo de estado de una hoja: `✓` reciente · `~` posible rezago ·
 * `⏳` próximamente · `—` no disponible para este municipio.
 *
 * Uso (Server Component, sin estado cliente):
 *   <SheetStatusGlyph sheet={s} overrides={estadoPorHoja} selected={selected} />
 * Devuelve un fragmento: glifo decorativo (con `title`) + texto sr-only.
 */
export function SheetStatusGlyph({
  sheet,
  overrides,
  selected = false,
}: {
  sheet: FichaSheetMeta;
  /** Overrides por municipio (p. ej. `no-disponible`), ver `EstadoGlyphOverrides`. */
  overrides?: EstadoGlyphOverrides;
  /** Pestaña activa: el glifo pasa a blanco (fondo primario) manteniendo contraste. */
  selected?: boolean;
}) {
  const estado = sheetGlyphFor(sheet, overrides);
  const { glifo, texto } = SHEET_GLYPH[estado];
  return (
    <>
      <span
        aria-hidden="true"
        title={texto}
        className={`text-[11px] leading-none ${selected ? "text-white" : GLYPH_COLOR[estado]}`}
      >
        {glifo}
      </span>
      <span className="sr-only">{texto}</span>
    </>
  );
}
