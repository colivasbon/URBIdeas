// Capas INE laterales municipales — SOLO SERVIDOR (lectura pública; escritura
// reservada a scripts/CLI con credenciales).
//
// Colección lateral NUEVA e inmutable respecto a las claves activas:
//   - NO toca `socideas/v2/municipios` ni `socideas/demographics/ine/v1`.
//   - Vive bajo `socideas/ine-layers/v1/`.
// R2 es solo almacenamiento: la fuente visible de cada dato es siempre el INE.
//
// Sin escrituras en este módulo. Sin Supabase. Sin secretos. Sin datos
// inventados: un valor no publicado es `suppressed`/`missing` con `value: null`,
// jamás 0.

export const INE_LAYERS_V1_SCHEMA = 'municipal-ine-layers-v1'
export const INE_LAYERS_V1_PREFIX = 'socideas/ine-layers/v1/municipal'
export const INE_LAYERS_V1_MANIFESTS_PREFIX = 'socideas/ine-layers/v1/manifests'

/** Estados de dato permitidos en todo el árbol de capas. */
export type IneValueStatus =
  | 'observed'
  | 'suppressed'
  | 'missing'
  | 'partial'
  | 'not_available'
  | 'derived'

export type LayerStatus = 'observed' | 'partial' | 'suppressed' | 'missing' | 'not_available'

/** Valor atómico con procedencia obligatoria. */
export interface IneValue {
  value: number | null
  unit: string
  status: IneValueStatus
  source: string
  tableId: string
  period: string
  /** true si SOCideas lo calcula sobre fuente oficial; false si es publicado. */
  derived: boolean
  definition?: string
}

export interface IneMigrationYear {
  period: string
  total: IneValue
  interior: IneValue
  exterior: IneValue
  bySex?: {
    total: IneValue
    male: IneValue
    female: IneValue
  }
}

export interface IneCategory {
  code: string
  label: string
  value: number | null
  status: IneValueStatus
}

export interface IneEducationDistribution {
  primaryOrBelow: IneValue
  lowerSecondary: IneValue
  upperSecondaryPostSecondary: IneValue
  higher: IneValue
  notApplicableUnder15: IneValue
}

export interface IneEducationBySex {
  male: IneEducationDistribution
  female: IneEducationDistribution
}

export interface IneLandUse {
  arableHoldings?: IneValue
  arableSurfaceHa?: IneValue
  woodyCropsHoldings?: IneValue
  woodyCropsSurfaceHa?: IneValue
  permanentPastureHoldings?: IneValue
  permanentPastureSurfaceHa?: IneValue
  kitchenGardens?: IneValue
  utilizedAgriculturalAreaHa?: IneValue
}

export interface IneLivestock {
  bovineHoldings?: IneValue
  bovineHeads?: IneValue
  sheepGoatHoldings?: IneValue
  sheepGoatHeads?: IneValue
  pigHoldings?: IneValue
  pigHeads?: IneValue
  poultryHoldings?: IneValue
  poultryHeads?: IneValue
}

export interface IneFarmHolders {
  total?: IneValue
  male?: IneValue
  female?: IneValue
  meanAge?: IneValue
}

export interface IneAgriculturalTraining {
  experienceOnly?: IneValue
  courses?: IneValue
  agriculturalVocational?: IneValue
  universityAgricultural?: IneValue
}

export interface IneBalanceSexBlock {
  total: IneValue
  interior: IneValue
  exterior: IneValue
}

/** Saldo migratorio neto municipal (INE 69767). Complementa — NO sustituye —
 *  a los flujos 69711/69743/69746. Nunca se suman saldos con flujos. */
export interface IneMigrationBalance {
  period: string
  tableId: string
  source: string
  total: IneValue
  interior: IneValue
  exterior: IneValue
  bySex?: { male: IneBalanceSexBlock; female: IneBalanceSexBlock }
  status: LayerStatus
}

export interface MunicipalIneLayersV1 {
  schemaVersion: typeof INE_LAYERS_V1_SCHEMA
  ineCode: string
  municipalityName: string
  generatedAt: string
  layers: {
    demographicDerived?: {
      density?: IneValue
      meanAge?: IneValue
      dependencyTotal?: IneValue
      dependencyYouth?: IneValue
      dependencyOlder?: IneValue
      ageingIndex?: IneValue
      populationChange5y?: IneValue
      populationChange10y?: IneValue
    }
    migration?: {
      period: string
      annualSeries?: IneMigrationYear[]
      latest?: IneMigrationYear
      status: LayerStatus
    }
    migrationBalance?: IneMigrationBalance
    nationalityDetail?: {
      period: string
      topNationalities: IneCategory[]
      status: LayerStatus
    }
    education?: {
      period: string
      censusYear: 2021
      total?: IneEducationDistribution
      bySex?: IneEducationBySex
      status: LayerStatus
    }
    agriculture?: {
      censusYear: 2020
      landUse?: IneLandUse
      livestock?: IneLivestock
      farmHolders?: IneFarmHolders
      agriculturalTraining?: IneAgriculturalTraining
      status: LayerStatus
    }
  }
  quality: {
    territoryMatch: 'exact' | 'missing' | 'invalid'
    sourceChecksums: Record<string, string>
    validationStatus: 'passed' | 'partial' | 'failed'
  }
}

const STATUSES: IneValueStatus[] = ['observed', 'suppressed', 'missing', 'partial', 'not_available', 'derived']
const LAYER_STATUSES: LayerStatus[] = ['observed', 'partial', 'suppressed', 'missing', 'not_available']

export function isValidIneCode(code: string): boolean {
  return /^\d{5}$/.test(code)
}

export function ineLayersKeyFor(codigoIne: string): string {
  return `${INE_LAYERS_V1_PREFIX}/${codigoIne}.json`
}

export function ineLayersManifestKeyFor(runId: string): string {
  return `${INE_LAYERS_V1_MANIFESTS_PREFIX}/run-${runId}.json`
}

/** Un valor es publicable si es numérico finito; en otro caso debe ser null. */
export function isPublishableIneValue(v: IneValue | undefined | null): boolean {
  if (!v) return false
  if (v.status === 'observed' || v.status === 'derived' || v.status === 'partial') {
    return typeof v.value === 'number' && Number.isFinite(v.value)
  }
  return v.value === null
}

function isIneValue(v: unknown): v is IneValue {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  if (!(o.value === null || typeof o.value === 'number')) return false
  if (typeof o.unit !== 'string') return false
  if (typeof o.status !== 'string' || !STATUSES.includes(o.status as IneValueStatus)) return false
  if (typeof o.source !== 'string' || o.source.length === 0) return false
  if (typeof o.tableId !== 'string') return false
  if (typeof o.period !== 'string' || o.period.length === 0) return false
  if (typeof o.derived !== 'boolean') return false
  if ((o.status === 'suppressed' || o.status === 'missing' || o.status === 'not_available') && o.value !== null) {
    return false
  }
  return true
}

function pushIneValueErrors(prefix: string, v: unknown, errors: string[]): void {
  if (v === undefined) return
  if (!isIneValue(v)) errors.push(`${prefix}: IneValue inválido`)
}

/**
 * Validación estricta del contrato lateral. Falla si aparecen estados no
 * permitidos, valores no numéricos marcados como publicados, o un secreto
 * convertido en número.
 */
export function validateMunicipalIneLayers(value: unknown): { ok: true; data: MunicipalIneLayersV1 } | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (!value || typeof value !== 'object') return { ok: false, errors: ['objeto raíz inválido'] }
  const o = value as Record<string, unknown>
  if (o.schemaVersion !== INE_LAYERS_V1_SCHEMA) errors.push('schemaVersion no coincide')
  if (typeof o.ineCode !== 'string' || !isValidIneCode(o.ineCode)) errors.push('ineCode no es INE-5')
  if (typeof o.municipalityName !== 'string' || o.municipalityName.length === 0) errors.push('municipalityName ausente')
  if (typeof o.generatedAt !== 'string' || Number.isNaN(Date.parse(o.generatedAt))) errors.push('generatedAt inválido')
  const layers = o.layers
  if (!layers || typeof layers !== 'object') {
    errors.push('layers ausente')
  } else {
    const L = layers as Record<string, unknown>
    const dd = L.demographicDerived as Record<string, unknown> | undefined
    if (dd) {
      for (const [k, v] of Object.entries(dd)) pushIneValueErrors(`demographicDerived.${k}`, v, errors)
    }
    const mig = L.migration as Record<string, unknown> | undefined
    if (mig) {
      if (typeof mig.status !== 'string' || !LAYER_STATUSES.includes(mig.status as LayerStatus)) errors.push('migration.status inválido')
      const series = mig.annualSeries
      if (series !== undefined && !Array.isArray(series)) errors.push('migration.annualSeries no es array')
      if (Array.isArray(series)) {
        series.forEach((y, i) => {
          const yy = y as Record<string, unknown>
          for (const key of ['total', 'interior', 'exterior']) pushIneValueErrors(`migration.annualSeries[${i}].${key}`, yy?.[key], errors)
        })
      }
      if (mig.latest) {
        const yy = mig.latest as Record<string, unknown>
        for (const key of ['total', 'interior', 'exterior']) pushIneValueErrors(`migration.latest.${key}`, yy?.[key], errors)
      }
    }
    const nat = L.nationalityDetail as Record<string, unknown> | undefined
    if (nat) {
      if (typeof nat.status !== 'string' || !LAYER_STATUSES.includes(nat.status as LayerStatus)) errors.push('nationalityDetail.status inválido')
      if (!Array.isArray(nat.topNationalities)) errors.push('nationalityDetail.topNationalities no es array')
      if (Array.isArray(nat.topNationalities)) {
        nat.topNationalities.forEach((c, i) => {
          const cc = c as Record<string, unknown>
          if (typeof cc?.code !== 'string' || typeof cc?.label !== 'string') errors.push(`nationalityDetail[${i}] sin código/etiqueta`)
          if (typeof cc?.status !== 'string' || !STATUSES.includes(cc.status as IneValueStatus)) errors.push(`nationalityDetail[${i}].status inválido`)
          if ((cc?.status === 'suppressed' || cc?.status === 'missing') && cc?.value !== null) errors.push(`nationalityDetail[${i}] secreto como número`)
        })
      }
    }
    const edu = L.education as Record<string, unknown> | undefined
    if (edu) {
      if (edu.censusYear !== 2021) errors.push('education.censusYear debe ser 2021')
      if (typeof edu.status !== 'string' || !LAYER_STATUSES.includes(edu.status as LayerStatus)) errors.push('education.status inválido')
      const dist = edu.total as Record<string, unknown> | undefined
      if (dist) for (const [k, v] of Object.entries(dist)) pushIneValueErrors(`education.total.${k}`, v, errors)
    }
    const agr = L.agriculture as Record<string, unknown> | undefined
    if (agr) {
      if (agr.censusYear !== 2020) errors.push('agriculture.censusYear debe ser 2020')
      if (typeof agr.status !== 'string' || !LAYER_STATUSES.includes(agr.status as LayerStatus)) errors.push('agriculture.status inválido')
      for (const group of ['landUse', 'livestock', 'farmHolders', 'agriculturalTraining'] as const) {
        const g = agr[group] as Record<string, unknown> | undefined
        if (g) for (const [k, v] of Object.entries(g)) pushIneValueErrors(`agriculture.${group}.${k}`, v, errors)
      }
    }
  }
  const q = o.quality as Record<string, unknown> | undefined
  if (!q || typeof q !== 'object') {
    errors.push('quality ausente')
  } else {
    if (!['exact', 'missing', 'invalid'].includes(q.territoryMatch as string)) errors.push('quality.territoryMatch inválido')
    if (!['passed', 'partial', 'failed'].includes(q.validationStatus as string)) errors.push('quality.validationStatus inválido')
    if (!q.sourceChecksums || typeof q.sourceChecksums !== 'object') errors.push('quality.sourceChecksums ausente')
  }
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, data: value as MunicipalIneLayersV1 }
}

function r2PublicBase(): string | null {
  const base = process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ?? process.env.SOCIDEAS_R2_PUBLIC_BASE
  return base ? base.replace(/\/$/, '') : null
}

/**
 * Lee el objeto lateral de capas INE del municipio desde la URL pública R2.
 * Devuelve null ante ausencia, error de red, timeout o schema inválido.
 * Solo acepta objetos válidos (nunca expone rutas, claves ni stack traces).
 */
export async function readMunicipalIneLayers(codigoIne: string): Promise<MunicipalIneLayersV1 | null> {
  if (!isValidIneCode(codigoIne)) return null
  const base = r2PublicBase()
  if (!base) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const res = await fetch(`${base}/${ineLayersKeyFor(codigoIne)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (res.status !== 200) return null
    const json = (await res.json()) as unknown
    const parsed = validateMunicipalIneLayers(json)
    if (!parsed.ok) {
      console.error(`[socideas][ine-layers] objeto descartado para ${codigoIne}: ${parsed.errors.join('; ')}`)
      return null
    }
    if (parsed.data.ineCode !== codigoIne) {
      console.error(`[socideas][ine-layers] INE no coincidente para ${codigoIne}`)
      return null
    }
    return parsed.data
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function latestMigration(series: IneMigrationYear[] | undefined): IneMigrationYear | null {
  if (!series || series.length === 0) return null
  return [...series].sort((a, b) => a.period.localeCompare(b.period))[series.length - 1]
}

// ---------- Vista previa de actualización (pura, reutilizable servidor/cliente) ----------

/** Capas aprobadas para carga persistente. Vacío: auditoría pendiente (Fase 4). */
export const APPROVED_LAYERS_FOR_LOAD: readonly string[] = []

export const UPDATE_BLOCKED_REASON =
  'No hay ninguna capa INE aprobada para carga (auditoría/preflight pendientes). No se ha escrito nada.'

export interface LayerPreviewItem {
  id: string
  label: string
  status: string
  period: string | null
  definitive: boolean
  provisional: boolean
}

export interface MunicipalUpdatePreview {
  ineCode: string
  municipalityName: string | null
  lastLoadedAt: string | null
  layers: LayerPreviewItem[]
  temporary: { present: boolean; label?: string; source?: string; period?: string } | null
  writableLayers: string[]
  canWrite: boolean
  blockedReason: string | null
}

const LAYER_LABELS: Record<string, string> = {
  demographicDerived: 'Indicadores demográficos derivados',
  migration: 'Movilidad migratoria',
  nationalityDetail: 'Nacionalidades principales',
  education: 'Nivel educativo (Censo 2021)',
  agriculture: 'Censo Agrario 2020',
}

/** Construye la vista previa sin I/O a partir de datos ya leídos. */
export function buildMunicipalUpdatePreview(
  codigoIne: string,
  layers: MunicipalIneLayersV1 | null,
  temporary: { label: string; source: string; period: string } | null,
): MunicipalUpdatePreview {
  const items: LayerPreviewItem[] = []
  if (layers) {
    const raw = layers.layers as Record<string, { status?: string; period?: string; censusYear?: number } | undefined>
    for (const [id, value] of Object.entries(raw)) {
      if (!value) continue
      items.push({
        id,
        label: LAYER_LABELS[id] ?? id,
        status: value.status ?? 'observed',
        period: value.period ?? (value.censusYear ? String(value.censusYear) : null),
        definitive: id !== 'migration' || value.status === 'observed',
        provisional: false,
      })
    }
  }
  if (temporary) {
    items.push({
      id: 'temporary',
      label: temporary.label,
      status: 'provisional',
      period: temporary.period,
      definitive: false,
      provisional: true,
    })
  }
  const writableLayers = APPROVED_LAYERS_FOR_LOAD.filter((id) => items.some((i) => i.id === id))
  return {
    ineCode: codigoIne,
    municipalityName: layers?.municipalityName ?? null,
    lastLoadedAt: layers?.generatedAt ?? null,
    layers: items,
    temporary: temporary ? { present: true, ...temporary } : null,
    writableLayers,
    canWrite: writableLayers.length > 0,
    blockedReason: writableLayers.length > 0 ? null : UPDATE_BLOCKED_REASON,
  }
}
