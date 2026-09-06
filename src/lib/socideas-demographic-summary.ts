// Adaptador server-side de SOLO LECTURA del resumen demográfico municipal.
// Lee UN objeto R2 de la colección lateral (prefijo nuevo, no consumido por
// la ficha clásica) y devuelve un DTO reducido para presentación.
// Garantías: sin listados R2 en petición, sin Supabase, sin CSV, sin escrituras,
// tolerante a ausencia/error/schema inválido/INE distinto (null + log seguro).
// Nunca expone bucket, prefijos internos, claves ni stack traces al navegador.
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'

const PREFIX = 'socideas/demographics/ine/v1/municipal'
const SCHEMA = 'ine-demographic-summary-v1'
const MAX_COUNTRIES = 5

export type DimStatus = 'observed' | 'suppressed' | 'missing' | 'partial'

export interface NationalityData {
  period: string
  total: number | null
  spanish: number | null
  foreign: number | null
  spanishPercent: number | null
  foreignPercent: number | null
  status: DimStatus
  source: { label: string; tableId: '68535' }
}

export interface CountryValue {
  label: string
  value: number | null
  status: 'observed' | 'suppressed' | 'missing'
}

export interface BirthCountryData {
  period: string
  spain: CountryValue | null
  topCountries: CountryValue[]
  status: DimStatus
  source: { label: string; tableId: '66322' }
  note: string
}

export interface ArraigoCategory {
  key: 'sameMunicipality' | 'sameProvinceOtherMunicipality' | 'sameAutonomousCommunityOtherProvince' | 'otherAutonomousCommunity' | 'bornAbroad'
  label: string
  value: number | null
  percent: number | null
  status: 'observed' | 'suppressed' | 'missing'
}

export interface ArraigoData {
  period: string
  total: number | null
  categories: ArraigoCategory[]
  status: DimStatus
  source: { label: string; tableId: '68540' }
}

export interface DemographicPresentationData {
  nationality?: NationalityData
  birthCountry?: BirthCountryData
  birthResidenceRelation?: ArraigoData
}

interface RawSummary {
  schemaVersion?: string
  ineCode?: string
  nationality?: { period: string; total: number | null; spanish: number | null; foreign: number | null; status: DimStatus }
  birthCountry?: {
    period: string
    categories?: { sourceCode: string; sourceLabel: string; value: number | null; status: 'observed' | 'suppressed' | 'missing' }[]
    status: DimStatus
  }
  birthResidenceRelation?: {
    period: string
    total: number | null
    sameMunicipality: number | null
    sameProvinceOtherMunicipality: number | null
    sameAutonomousCommunityOtherProvince: number | null
    otherAutonomousCommunity: number | null
    bornAbroad: number | null
    status: DimStatus
  }
}

function r2Client(): { client: S3Client; bucket: string } | null {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null
  return {
    client: new S3Client({ region: 'auto', endpoint: `https://${accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey } }),
    bucket,
  }
}

/** Lee el objeto lateral. null ante ausencia, error, schema o INE distinto. */
export async function readDemographicSummary(codigoIne: string): Promise<RawSummary | null> {
  if (!/^\d{5}$/.test(codigoIne)) return null
  try {
    const r2 = r2Client()
    if (!r2) return null
    const res = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: `${PREFIX}/${codigoIne}.json` }))
    const text = await res.Body?.transformToString()
    if (!text) return null
    const json = JSON.parse(text) as RawSummary
    if (json.schemaVersion !== SCHEMA || json.ineCode !== codigoIne) {
      console.error(`[socideas][demografia] objeto descartado para ${codigoIne}: schema o INE no coincidente`)
      return null
    }
    return json
  } catch {
    return null
  }
}

function pct1(part: number | null, total: number | null): number | null {
  if (part === null || total === null || total === 0) return null
  return Math.round((part / total) * 1000) / 10
}

const normLo = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, '')

/** Construye el DTO de presentación. Puro y testeable; sin I/O. */
export function buildDemographicPresentation(raw: RawSummary | null): DemographicPresentationData | null {
  if (!raw) return null
  const out: DemographicPresentationData = {}

  const nat = raw.nationality
  if (nat && nat.period) {
    out.nationality = {
      period: nat.period,
      total: nat.total,
      spanish: nat.spanish,
      foreign: nat.foreign,
      spanishPercent: pct1(nat.spanish, nat.total),
      foreignPercent: pct1(nat.foreign, nat.total),
      status: nat.status,
      source: { label: 'Instituto Nacional de Estadística', tableId: '68535' },
    }
  }

  const bc = raw.birthCountry
  if (bc && bc.period && Array.isArray(bc.categories)) {
    const isTotal = (label: string): boolean => normLo(label) === 'total'
    const isSpain = (label: string): boolean => normLo(label) === 'espana'
    const spainRow = bc.categories.find((c) => isSpain(c.sourceLabel))
    const pool = bc.categories.filter(
      (c) => !isTotal(c.sourceLabel) && !isSpain(c.sourceLabel) && c.value !== null && !Number.isNaN(c.value),
    )
    const seen = new Set<string>()
    const top = [...pool]
      .sort((a, b) => (b.value as number) - (a.value as number))
      .filter((c) => {
        const k = normLo(c.sourceLabel)
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      .slice(0, MAX_COUNTRIES)
      .map((c) => ({ label: c.sourceLabel, value: c.value, status: c.status }))
    out.birthCountry = {
      period: bc.period,
      spain: spainRow && spainRow.value !== null
        ? { label: spainRow.sourceLabel, value: spainRow.value, status: spainRow.status }
        : null,
      topCountries: top,
      status: bc.status,
      source: { label: 'Instituto Nacional de Estadística', tableId: '66322' },
      note: 'La tabla recoge categorías de país publicadas por el INE; no equivale a una distribución completa de población nacida en el extranjero.',
    }
  }

  const ar = raw.birthResidenceRelation
  if (ar && ar.period) {
    const defs: { key: ArraigoCategory['key']; label: string; value: number | null }[] = [
      { key: 'sameMunicipality', label: 'Nacida/o en este municipio', value: ar.sameMunicipality },
      { key: 'sameProvinceOtherMunicipality', label: 'Nacida/o en otro municipio de la provincia', value: ar.sameProvinceOtherMunicipality },
      { key: 'sameAutonomousCommunityOtherProvince', label: 'Nacida/o en otra provincia de la comunidad autónoma', value: ar.sameAutonomousCommunityOtherProvince },
      { key: 'otherAutonomousCommunity', label: 'Nacida/o en otra comunidad autónoma', value: ar.otherAutonomousCommunity },
      { key: 'bornAbroad', label: 'Nacida/o en el extranjero', value: ar.bornAbroad },
    ]
    out.birthResidenceRelation = {
      period: ar.period,
      total: ar.total,
      categories: defs.map((d) => ({
        ...d,
        percent: pct1(d.value, ar.total),
        status: (d.value === null ? 'missing' : 'observed') as ArraigoCategory['status'],
      })),
      status: ar.status,
      source: { label: 'Instituto Nacional de Estadística', tableId: '68540' },
    }
  }

  return out.nationality || out.birthCountry || out.birthResidenceRelation ? out : null
}

/** Lectura + DTO en una sola llamada lateral por carga de ficha. */
export async function readDemographicPresentation(codigoIne: string): Promise<DemographicPresentationData | null> {
  const raw = await readDemographicSummary(codigoIne)
  return buildDemographicPresentation(raw)
}
