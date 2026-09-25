// Lector server-side de dimensiones demográficas INE (SOLO LECTURA).
// Consulta únicamente endpoints públicos del INE (jaxiT3 CSV). Sin R2,
// sin Supabase, sin escrituras, sin cachés persistentes, sin secretos.
// Distingue siempre: cero real / ausente / secreto / no disponible / error.
import { EcoError, fetchEco, parseEsNumber } from './socideas-eco-common'

export type DemographicDimensionId = 'nationality' | 'birth_country' | 'birth_residence_relation'

export type ObservationStatus = 'observed' | 'suppressed' | 'missing' | 'not_available'

export interface DemographicDimensionObservation {
  ineCode: string
  municipalityName: string | null
  dimension: DemographicDimensionId
  period: string
  sex: string | null
  ageGroup: string | null
  categoryCode: string
  categoryLabel: string
  value: number | null
  status: ObservationStatus
  sourceTable: string
  sourceUrl: string
}

export interface DimensionTableConfig {
  dimension: DemographicDimensionId
  tableId: number
  humanUrl: string
  expectedTitle: string
  dimColumnHint: string[]
  requiredCategories: string[]
  sexTotal: string
  ageTotal: string | null
}

export const DIMENSION_TABLES: DimensionTableConfig[] = [
  {
    dimension: 'nationality',
    tableId: 68535,
    humanUrl: 'https://www.ine.es/jaxiT3/Tabla.htm?t=68535',
    expectedTitle: 'Población por sexo, edad (grupos quinquenales) y nacionalidad (española/extranjera)',
    dimColumnHint: ['nacionalidad'],
    requiredCategories: ['Total', 'Española', 'Extranjera'],
    sexTotal: 'Total',
    ageTotal: 'Todas las edades',
  },
  {
    dimension: 'birth_country',
    tableId: 66322,
    humanUrl: 'https://www.ine.es/jaxiT3/Tabla.htm?t=66322',
    expectedTitle: 'Población por sexo y país de nacimiento (principales países)',
    dimColumnHint: ['nacimiento', 'pais'],
    requiredCategories: ['Total', 'España'],
    sexTotal: 'Total',
    ageTotal: null,
  },
  {
    dimension: 'birth_residence_relation',
    tableId: 68540,
    humanUrl: 'https://www.ine.es/jaxiT3/Tabla.htm?t=68540',
    expectedTitle: 'Población por sexo, edad (grandes grupos) y relación entre lugar de nacimiento y lugar de residencia',
    dimColumnHint: ['relacion', 'residencia'],
    requiredCategories: [
      'Total',
      'Mismo municipio',
      'Distinto municipio',
      'Distinta provincia',
      'Distinta comunidad',
      'extranjero',
    ],
    sexTotal: 'Total',
    ageTotal: 'Todas las edades',
  },
]

export function csvUrl(tableId: number): string {
  return `https://www.ine.es/jaxiT3/files/t/csv_bd/${tableId}.csv`
}

const norm = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export interface RawDimRow {
  ine: string
  nombre: string
  sexo: string
  edad: string | null
  categoria: string
  periodo: string
  rawValor: string
}

/** Parsea UNA línea jaxiT3 con Índices ya resueltos. Puro y testeable. */
export function parseDimLine(
  cols: string[],
  idx: { muni: number; sexo: number; edad: number; dim: number; per: number; val: number },
): RawDimRow | null {
  const m = (cols[idx.muni] ?? '').match(/\b(\d{5})\b/)
  if (!m) return null
  return {
    ine: m[1],
    nombre: (cols[idx.muni] ?? '').replace(/^\s*\d{5}\s*/, '').trim(),
    sexo: (cols[idx.sexo] ?? '').trim(),
    edad: idx.edad >= 0 ? (cols[idx.edad] ?? '').trim() : null,
    categoria: (cols[idx.dim] ?? '').trim(),
    periodo: (cols[idx.per] ?? '').trim(),
    rawValor: (cols[idx.val] ?? '').trim(),
  }
}

const SECRETO = new Set(['.', '..', ':', 'ND', 'n.d.', '-', ''])

export interface NormalizedObservation extends RawDimRow {
  valor: number | null
  suprimido: boolean
}

/** Normaliza sin inventar: secreto/ausencia → null+flag, nunca 0. */
export function normalizeDimRow(r: RawDimRow): NormalizedObservation {
  const suprimido = r.rawValor === '' || SECRETO.has(r.rawValor) || r.rawValor === '-'
  const valor = suprimido ? null : parseEsNumber(r.rawValor)
  return { ...r, valor, suprimido }
}

export function toObservation(
  r: NormalizedObservation,
  dimension: DemographicDimensionId,
  tableId: number,
): DemographicDimensionObservation {
  return {
    ineCode: r.ine,
    municipalityName: r.nombre || null,
    dimension,
    period: r.periodo,
    sex: r.sexo || null,
    ageGroup: r.edad,
    categoryCode: norm(r.categoria),
    categoryLabel: r.categoria,
    value: r.valor,
    status: r.suprimido || r.valor === null ? 'suppressed' : 'observed',
    sourceTable: String(tableId),
    sourceUrl: csvUrl(tableId),
  }
}

/** Descarga el CSV oficial con timeout + reintento (patrón del proyecto). */
export async function fetchDimensionCsv(tableId: number, timeoutMs = 60000): Promise<string> {
  const url = csvUrl(tableId)
  const res = await fetchEco(url, timeoutMs)
  const text = await res.text()
  if (/<html[\s>]/i.test(text.slice(0, 2000))) {
    throw new EcoError('La fuente devolvió HTML en lugar de CSV', url)
  }
  return text
}
