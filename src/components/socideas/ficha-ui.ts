/**
 * Clases compartidas de la ficha municipal (dirección técnica-cartográfica).
 * Solo presentación: bloques separados por filetes, cifras tabulares, notas de
 * fuente legibles. Todo color sale de tokens del sistema (claro y oscuro).
 */

/** Bloque de análisis: filete superior y aire generoso; sin tarjeta ni sombra. */
export const BLOCK = "border-t border-[var(--border-subtle)] py-10";

/** Título de bloque (h2/h3 semántico según contexto). */
export const BLOCK_TITLE = "type-h3 text-[var(--text-primary)]";

/** Subtítulo de sub-bloque o de gráfico dentro de un bloque. */
export const SUBTITLE = "type-h4 text-[var(--text-primary)]";

/** Entradilla de una línea bajo el título del bloque. */
export const LEDE = "mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--text-secondary)]";

/** Nota de fuente y periodo al pie de un bloque. */
export const SOURCE_NOTE = "mt-4 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]";

/** Nota secundaria (metodología, aviso breve) en texto de apoyo. */
export const NOTE = "mt-2 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]";

/** Estado sin dato / pendiente: filete discontinuo, texto que orienta. */
export const PENDING_NOTE =
  "max-w-[70ch] rounded-[6px] border border-dashed border-[var(--border-default)] px-4 py-3 text-sm leading-relaxed text-[var(--text-secondary)]";

/** Fila de cifras clave: rejilla sin tarjetas; cada cifra lleva su filete. */
export const FIGURE_ROW = "grid grid-cols-1 gap-x-8 gap-y-6";

/** Cifra clave individual. */
export const FIGURE = "min-w-0 border-t border-[var(--border-strong)] pt-3";
export const FIGURE_VALUE = "type-h3 tnum font-semibold text-[var(--text-primary)]";
export const FIGURE_LABEL = "mt-1 text-sm text-[var(--text-secondary)]";
export const FIGURE_DETAIL = "mt-1 text-xs leading-relaxed text-[var(--text-muted)]";

/** Etiqueta de control de formulario. */
export const FIELD_LABEL = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";

/** Select / input compacto con tokens. */
export const SELECT =
  "min-h-[44px] rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)] sm:min-h-[36px]";

/** Enlace de despliegue (<summary>, «Ver más»). */
export const DISCLOSURE =
  "cursor-pointer text-sm font-medium text-[var(--text-link)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]";

/** Enlace de texto en línea. */
export const TEXT_LINK =
  "font-medium text-[var(--text-link)] underline underline-offset-2 hover:text-[var(--text-link-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]";

/** Tabla simple de apoyo (sin shell): cabeceras en texto secundario, filetes. */
export const MINI_TH = "py-2 pr-3 text-left text-xs font-semibold text-[var(--text-secondary)]";
export const MINI_TH_NUM = "py-2 pr-3 text-right text-xs font-semibold text-[var(--text-secondary)]";
export const MINI_TR = "border-t border-[var(--border-subtle)]";
export const MINI_TD = "py-2 pr-3 text-[var(--text-primary)]";
export const MINI_TD_NUM = "py-2 pr-3 text-right tabular-nums text-[var(--text-primary)]";

/**
 * Series de gráficos. Pirámide: hombres Musgo, mujeres Conífera-700 (par único
 * en toda la ficha). Comparativas territoriales en tintes Carbón/Limo.
 */
export const CHART = {
  hombres: "var(--musgo)",
  mujeres: "var(--conifera-700)",
  municipio: "var(--musgo)",
  provincia: "var(--carbon-400)",
  ccaa: "var(--limo-700)",
  espana: "var(--carbon-300)",
  track: "var(--bg-surface-sunken)",
  grid: "var(--border-subtle)",
  axis: "var(--text-muted)",
} as const;

/** Escala secuencial corta en Musgo (categorías ordenadas, p. ej. arraigo). */
export const MUSGO_SEQ = [
  "var(--musgo-700)",
  "var(--musgo-500)",
  "var(--musgo-400)",
  "var(--musgo-300)",
  "var(--limo-500)",
] as const;
