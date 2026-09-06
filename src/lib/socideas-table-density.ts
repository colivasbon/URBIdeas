/**
 * Densidad presentacional de tablas SOCideas (solo visual, nunca datos).
 * Cada tabla clasifica su layout según columnas, filas y visual asociada.
 */
export type TableDensity =
  | 'compact-two-columns'
  | 'compact-metrics'
  | 'series'
  | 'comparison'
  | 'wide';

/** Scroll interno solo con más de 11 filas: 9–11 visibles, resto con scroll. */
export const SERIES_SCROLL_THRESHOLD = 11;
/** Altura máxima del contenedor de series largas (~10 filas compactas). */
export const SERIES_MAX_HEIGHT = '24rem';
/** Ancho máximo de tablas estrechas de 2 columnas. */
export const NARROW_TABLE_MAX_WIDTH = 560;

export function tableDensityFor(
  columnCount: number,
  rowCount: number,
  hasVisual: boolean,
): TableDensity {
  if (columnCount <= 2) return 'compact-two-columns';
  if (columnCount > 5) return 'wide';
  if (rowCount > SERIES_SCROLL_THRESHOLD) return 'series';
  if (hasVisual) return 'comparison';
  return 'compact-metrics';
}

/** Scroll interno solo si hay más de 11 filas; si no, altura natural. */
export function needsInternalScroll(rowCount: number): boolean {
  return rowCount > SERIES_SCROLL_THRESHOLD;
}
