// DTO de presentación del bloque de mercado de trabajo (lectura pura).
// Entrada: filas EXPANDIDAS del envelope v2 (forma de `expandV2Envelope`:
// anio_referencia, valor_numerico, dimensiones, indicator.slug,
// source_table_id, source_url). Sin I/O, sin R2, sin Supabase.
//
// Nota de fuente: `expandV2Envelope` resuelve la fuente por tableId y los
// tableId `sepe_*`/`tgss_*` aún no están mapeados en `sourceSlugForTable`
// (ese fichero lo posee otro bloque; cambio de 1 línea pendiente). Este
// constructor resuelve la fuente por prefijo de tableId por sí mismo para
// no depender de ese fallback.

import type { LaborRegimen, LaborSector } from './socideas-labor-envelope'
import { LABOR_REGIMENES, LABOR_SECTORS } from './socideas-labor-envelope'

export type LaborStatus = 'observed' | 'suppressed' | 'missing' | 'partial'

export interface LaborExpandedRow {
  anio_referencia: number | null
  valor_numerico: number | null
  dimensiones: Record<string, string>
  indicator: { slug: string }
  source_table_id: string | null
  source_url: string | null
}

export interface ParoSexoDetalle {
  total: number | null
  tramos: (number | null)[] // [<25, 25-45, >=45]
}

export interface ParoPresentationData {
  periodo: string // "2026-07"
  etiquetaPeriodo: string // "Julio de 2026"
  notaTemporal: string // advertencia: dato mensual, no igualable a bloques anuales
  total: number | null
  hombres: ParoSexoDetalle
  mujeres: ParoSexoDetalle
  sectores: Record<LaborSector, number | null>
  status: LaborStatus
  tableId: string
  sourceUrl: string | null
}

export interface AfiliacionPresentationData {
  periodo: string
  etiquetaPeriodo: string
  notaTemporal: string
  total: number | null
  regimenes: Record<LaborRegimen, number | null>
  status: LaborStatus
  tableId: string
  sourceUrl: string | null
}

const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export function etiquetaPeriodoLabor(periodo: string): string {
  const m = periodo.match(/^(\d{4})-(\d{2})$/)
  if (!m) return periodo
  const idx = Number(m[2]) - 1
  if (idx < 0 || idx > 11) return periodo
  return `${MESES_ES[idx]} de ${m[1]}`
}

const NOTA_TEMPORAL =
  'Dato mensual de coyuntura; no es comparable con los bloques anuales de la ficha.'

function tablePrefix(tableId: string | null): 'sepe' | 'tgss' | null {
  if (!tableId) return null
  if (tableId.startsWith('sepe_')) return 'sepe'
  if (tableId.startsWith('tgss_')) return 'tgss'
  return null
}

interface PickOpts {
  slug: 'paro_registrado' | 'afiliacion_total'
  prefix: 'sepe' | 'tgss'
}

function pickRows(rows: LaborExpandedRow[], opts: PickOpts): LaborExpandedRow[] {
  return rows.filter(
    (r) =>
      r.indicator?.slug === opts.slug &&
      tablePrefix(r.source_table_id) === opts.prefix &&
      typeof r.valor_numerico === 'number',
  )
}

/** Último periodo disponible en las filas (las dimensiones mandan, no el año). */
function latestPeriodo(cands: LaborExpandedRow[]): string | null {
  const periods = new Set<string>()
  for (const r of cands) {
    const p = r.dimensiones?.periodo
    if (typeof p === 'string' && /^\d{4}-\d{2}$/.test(p)) periods.add(p)
  }
  if (periods.size === 0) return null
  return [...periods].sort().at(-1) ?? null
}

function cell(
  rows: LaborExpandedRow[],
  periodo: string,
  extra: Record<string, string>,
): number | null {
  const hit = rows.find((r) => {
    const d = r.dimensiones ?? {}
    if (d.periodo !== periodo || d.ambito !== 'municipio') return false
    return Object.entries(extra).every(([k, v]) => d[k] === v)
  })
  return typeof hit?.valor_numerico === 'number' ? hit.valor_numerico : null
}

function statusOf(vals: (number | null)[]): LaborStatus {
  if (vals.every((v) => typeof v === 'number')) return 'observed'
  if (vals.every((v) => v === null)) return 'missing'
  return 'partial'
}

/** Construye el DTO de paro registrado. null si no hay filas SEPE. Puro. */
export function buildParoPresentation(rows: LaborExpandedRow[]): ParoPresentationData | null {
  const cands = pickRows(rows, { slug: 'paro_registrado', prefix: 'sepe' })
  if (cands.length === 0) return null
  const periodo = latestPeriodo(cands) ?? 'desconocido'
  const inPeriod = cands.filter((r) => r.dimensiones?.periodo === periodo)
  const total = cell(inPeriod, periodo, {})
  const hombres: ParoSexoDetalle = {
    total: cell(inPeriod, periodo, { sexo: 'hombres' }),
    tramos: ['<25', '25-45', '>=45'].map((t) =>
      cell(inPeriod, periodo, { sexo: 'hombres', tramo_edad: t }),
    ),
  }
  const mujeres: ParoSexoDetalle = {
    total: cell(inPeriod, periodo, { sexo: 'mujeres' }),
    tramos: ['<25', '25-45', '>=45'].map((t) =>
      cell(inPeriod, periodo, { sexo: 'mujeres', tramo_edad: t }),
    ),
  }
  const sectores = Object.fromEntries(
    LABOR_SECTORS.map((s) => [s, cell(inPeriod, periodo, { sector: s })]),
  ) as Record<LaborSector, number | null>
  const all = [total, hombres.total, mujeres.total, ...hombres.tramos, ...mujeres.tramos, ...Object.values(sectores)]
  const tableId = inPeriod[0]?.source_table_id ?? ''
  return {
    periodo,
    etiquetaPeriodo: etiquetaPeriodoLabor(periodo),
    notaTemporal: NOTA_TEMPORAL,
    total,
    hombres,
    mujeres,
    sectores,
    status: statusOf(all),
    tableId,
    sourceUrl: inPeriod[0]?.source_url ?? null,
  }
}

/** Construye el DTO de afiliación. null si no hay filas TGSS. Puro. */
export function buildAfiliacionPresentation(
  rows: LaborExpandedRow[],
): AfiliacionPresentationData | null {
  const cands = pickRows(rows, { slug: 'afiliacion_total', prefix: 'tgss' })
  if (cands.length === 0) return null
  const periodo = latestPeriodo(cands) ?? 'desconocido'
  const inPeriod = cands.filter((r) => r.dimensiones?.periodo === periodo)
  const total = cell(inPeriod, periodo, {})
  const regimenes = Object.fromEntries(
    LABOR_REGIMENES.map((r) => [r, cell(inPeriod, periodo, { regimen: r })]),
  ) as Record<LaborRegimen, number | null>
  const tableId = inPeriod[0]?.source_table_id ?? ''
  return {
    periodo,
    etiquetaPeriodo: etiquetaPeriodoLabor(periodo),
    notaTemporal: NOTA_TEMPORAL,
    total,
    regimenes,
    status: statusOf([total, ...Object.values(regimenes)]),
    tableId,
    sourceUrl: inPeriod[0]?.source_url ?? null,
  }
}
