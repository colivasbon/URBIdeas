// Jerarquía de disponibilidad SOCideas (compartida por Demografía y Economía).
// Fuente única de verdad para ordenar "datos reales primero, límites al final".
// Sin inventar valores: la ausencia nunca equivale a 0 y ningún estado fabrica cifras.

export type IndicatorAvailability =
  | 'available'
  | 'partial'
  | 'pending'
  | 'without_coverage'
  | 'provisional'
  | 'not_applicable';

export const AVAILABILITY_LABEL: Record<IndicatorAvailability, string> = {
  available: 'Disponible',
  partial: 'Cobertura parcial',
  pending: 'Pendiente de incorporación',
  without_coverage: 'Sin cobertura verificable',
  provisional: 'Provisional',
  not_applicable: 'No aplicable',
};

export const AVAILABILITY_DESCRIPTION: Record<IndicatorAvailability, string> = {
  available: 'Valor consolidado publicado por la fuente oficial para este municipio y periodo.',
  partial: 'Parte del bloque tiene valor real; el resto se documenta al final sin rellenar.',
  pending: 'Requiere una fuente oficial cuya cobertura aún no es homogénea para todos los municipios.',
  without_coverage: 'La fuente no publica este indicador para el municipio.',
  provisional: 'Dato sujeto a revisión; nunca sustituye al consolidado.',
  not_applicable: 'El indicador no aplica a este municipio (p. ej. umbral de población o ámbito fiscal).',
};

/** Un número real es number finito. null/undefined/NaN = ausencia, nunca 0. */
export function isRealValue(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Valor publicable en ficha y descargas (solo lectura: no altera el envelope,
 * el parser ni la sincronización). El INE marca la desigualdad suprimida con
 * `.` en el CSV; esa marca llegó al envelope como `0` literal en algunos
 * municipios. Gini ∈ (0,100] y P80/P20 ≥ 1 por construcción: un 0 exacto en
 * `gini`/`p80_p20` nunca es un dato publicado, sino secreto estadístico, y se
 * trata como ausencia (ND + cobertura explícita). Los ceros de conteos
 * (pirámide, población) sí pueden ser reales y se conservan.
 */
export function isPublishableValue(slug: string, v: number | null | undefined): boolean {
  if (!isRealValue(v)) return false;
  if ((slug === 'gini' || slug === 'p80_p20') && v === 0) return false;
  return true;
}

/** Orden analítico: disponibles y parciales primero, provisionales después,
 *  pendientes/sin cobertura/no aplicables al final (panel de cobertura). */
const RANK: Record<IndicatorAvailability, number> = {
  available: 0,
  partial: 1,
  provisional: 2,
  pending: 3,
  without_coverage: 4,
  not_applicable: 5,
};

export function compareAvailability(a: IndicatorAvailability, b: IndicatorAvailability): number {
  return RANK[a] - RANK[b];
}

export interface AvailabilityPartition<T> {
  main: T[];
  provisional: T[];
  coverage: T[];
}

/** Separa elementos con datos (main) de provisionales y de límites finales. */
export function partitionByAvailability<T>(
  items: T[],
  availabilityOf: (item: T) => IndicatorAvailability,
): AvailabilityPartition<T> {
  const main: T[] = [];
  const provisional: T[] = [];
  const coverage: T[] = [];
  for (const item of items) {
    const a = availabilityOf(item);
    if (a === 'available' || a === 'partial') main.push(item);
    else if (a === 'provisional') provisional.push(item);
    else coverage.push(item);
  }
  const byRank = (x: T, y: T) => compareAvailability(availabilityOf(x), availabilityOf(y));
  main.sort(byRank);
  provisional.sort(byRank);
  coverage.sort(byRank);
  return { main, provisional, coverage };
}

export interface CoverageEntry {
  titulo: string;
  estado: Extract<IndicatorAvailability, 'pending' | 'without_coverage' | 'provisional' | 'not_applicable' | 'partial'>;
  detalle: string;
  fuente?: string;
  periodo?: string;
}

export const COVERAGE_GROUP_ORDER: CoverageEntry['estado'][] = [
  'without_coverage',
  'pending',
  'provisional',
  'partial',
  'not_applicable',
];

export const COVERAGE_GROUP_LABEL: Record<CoverageEntry['estado'], string> = {
  without_coverage: 'Sin cobertura',
  pending: 'Pendiente',
  provisional: 'Fuente provisional no configurada',
  partial: 'Periodos con rezago',
  not_applicable: 'No aplicable',
};

/** Agrupa entradas de cobertura para el panel final, en orden estable. */
export function groupCoverage(entries: CoverageEntry[]): { estado: CoverageEntry['estado']; items: CoverageEntry[] }[] {
  return COVERAGE_GROUP_ORDER.map((estado) => ({
    estado,
    items: entries.filter((e) => e.estado === estado),
  })).filter((g) => g.items.length > 0);
}

/** Valida que una URL de fuente sea pública antes de enlazarla. Nunca adivinar URLs. */
export function isPublicSourceUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
