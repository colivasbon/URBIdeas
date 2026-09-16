// Adaptador server-side de SOLO LECTURA de los flujos migratorios municipales.
// Lee UN objeto R2 de la colección `socideas/ine-layers/v1/municipal` escrito
// por scripts/load-migration-ine-r2.ts (tablas INE 69711, 69743, 69746) y
// devuelve un DTO reducido para presentación.
// Garantías: sin listados R2 en petición, sin Supabase, sin CSV, sin escrituras,
// tolerante a ausencia/error/schema inválido/INE distinto (null + log seguro).
// Nunca expone bucket, prefijos internos, claves ni stack traces al navegador.
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'

const PREFIX = 'socideas/ine-layers/v1/municipal'

export type MigrationFlowStatus = 'observed' | 'suppressed' | 'missing'
export type MigrationDimStatus = 'observed' | 'suppressed' | 'missing' | 'partial'

export interface MigrationFlowValue {
  period: string
  total: number | null
  male: number | null
  female: number | null
  status: MigrationFlowStatus
  source: { label: string; tableId: '69711' | '69743' | '69746' }
}

/** Un flujo migratorio colapsado: un valor por sexo para el período. */
export interface MigrationFlowGroup {
  label: string
  period: string
  total: number | null
  male: number | null
  female: number | null
  status: MigrationDimStatus
  source: { label: string; tableId: '69711' | '69743' | '69746' }
}

export interface MigrationPresentationData {
  period: string
  emigrationAbroad?: MigrationFlowGroup
  immigrationIntermunicipal?: MigrationFlowGroup
  emigrationIntermunicipal?: MigrationFlowGroup
  status: MigrationDimStatus
}

interface RawFlow {
  period?: string
  total?: number | null
  male?: number | null
  female?: number | null
  status?: string
  tableId?: string
}

interface RawMigrationObject {
  ineCode?: string
  municipalityName?: string
  migration?: {
    period?: string
    emigrationAbroad?: { annualSeries?: RawFlow[]; status?: string }
    immigrationIntermunicipal?: { annualSeries?: RawFlow[]; status?: string }
    emigrationIntermunicipal?: { annualSeries?: RawFlow[]; status?: string }
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

/** Lee el objeto de migración. null ante ausencia, error, schema o INE distinto. */
export async function readMigrationSummary(codigoIne: string): Promise<RawMigrationObject | null> {
  if (!/^\d{5}$/.test(codigoIne)) return null
  try {
    const r2 = r2Client()
    if (!r2) return null
    const res = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: `${PREFIX}/${codigoIne}.json` }))
    const text = await res.Body?.transformToString()
    if (!text) return null
    const json = JSON.parse(text) as RawMigrationObject
    if (json.ineCode !== codigoIne || !json.migration || typeof json.migration.period !== 'string') {
      console.error(`[socideas][migracion] objeto descartado para ${codigoIne}: INE o estructura no coincidente`)
      return null
    }
    return json
  } catch {
    return null
  }
}

type MigrationTableId = '69711' | '69743' | '69746'

function asTableId(v: unknown): MigrationTableId | null {
  return v === '69711' || v === '69743' || v === '69746' ? v : null
}

function asFlowStatus(v: unknown): MigrationFlowStatus {
  return v === 'suppressed' ? 'suppressed' : v === 'missing' ? 'missing' : 'observed'
}

/** Colapsa los 3 flujos (total/hombres/mujeres) en un grupo por sexo y período. Puro y testeable; sin I/O. */
function collapseGroup(
  label: string,
  period: string,
  series: RawFlow[] | undefined,
  fallbackTableId: MigrationTableId,
): MigrationFlowGroup | undefined {
  if (!Array.isArray(series) || series.length === 0) return undefined
  let total: number | null = null
  let male: number | null = null
  let female: number | null = null
  let tableId: MigrationTableId = fallbackTableId
  const statuses = new Set<MigrationFlowStatus>()
  for (const f of series) {
    if (typeof f.total === 'number') total = f.total
    if (typeof f.male === 'number') male = f.male
    if (typeof f.female === 'number') female = f.female
    const tid = asTableId(f.tableId)
    if (tid) tableId = tid
    statuses.add(asFlowStatus(f.status))
  }
  const status: MigrationDimStatus =
    total !== null || male !== null || female !== null
      ? 'observed'
      : statuses.has('suppressed')
        ? 'suppressed'
        : 'missing'
  return {
    label,
    period,
    total,
    male,
    female,
    status,
    source: { label: 'Instituto Nacional de Estadística', tableId },
  }
}

/** Construye el DTO de presentación. Puro y testeable; sin I/O. */
export function buildMigrationPresentation(raw: RawMigrationObject | null): MigrationPresentationData | null {
  if (!raw?.migration?.period) return null
  const period = raw.migration.period
  const out: MigrationPresentationData = { period, status: 'missing' }
  const abroad = collapseGroup('Emigración al extranjero', period, raw.migration.emigrationAbroad?.annualSeries, '69711')
  const imm = collapseGroup('Inmigración intermunicipal', period, raw.migration.immigrationIntermunicipal?.annualSeries, '69743')
  const emi = collapseGroup('Emigración intermunicipal', period, raw.migration.emigrationIntermunicipal?.annualSeries, '69746')
  if (abroad) out.emigrationAbroad = abroad
  if (imm) out.immigrationIntermunicipal = imm
  if (emi) out.emigrationIntermunicipal = emi
  const groups = [abroad, imm, emi].filter((g): g is MigrationFlowGroup => !!g)
  if (groups.length === 0) return null
  out.status = groups.every((g) => g.status === 'observed')
    ? 'observed'
    : groups.some((g) => g.status === 'observed')
      ? 'partial'
      : groups.every((g) => g.status === 'suppressed')
        ? 'suppressed'
        : 'missing'
  return out
}

/** Lectura + DTO en una sola llamada lateral por carga de ficha. */
export async function readMigrationPresentation(codigoIne: string): Promise<MigrationPresentationData | null> {
  const raw = await readMigrationSummary(codigoIne)
  return buildMigrationPresentation(raw)
}
