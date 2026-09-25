// Lectura runtime de la estructura de población SOCideas v2 desde R2.
//
// SOLO SERVIDOR. Sin Supabase, sin CSV, sin escrituras y sin secretos en logs:
// los únicos mensajes son la clave lógica del objeto y el nombre del error
// (nunca credenciales, endpoints firmados, cuerpos ni stack traces).
//
// Layout R2 (layout canónico de `socideas-population-structure.ts`):
//   socideas/population-structure/v1/municipio/<INE>.json
//   socideas/population-structure/v1/provincia/<CC>.json
//   socideas/population-structure/v1/ccaa/<CCAA>.json
//   socideas/population-structure/v1/nacional/ES.json
//
// Reglas:
//   - Fail closed: un objeto ausente, ilegible o que no pasa el validador se
//     devuelve como `null`. NUNCA se cae a una pirámide de otro año: no existe
//     fallback silencioso a 2022 ni a ninguna estructura distinta de la pedida.
//   - Caché razonable con `unstable_cache` (24 h + tags) y degradación a lectura
//     directa fuera del runtime de Next (scripts). Un objeto ausente/inválido
//     lanza DENTRO del ámbito cacheado, de modo que un `null` jamás se persiste
//     en Data Cache (así, al publicarse el objeto, deja de verse el hueco).

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { unstable_cache } from 'next/cache'
import {
  POPULATION_STRUCTURE_R2_PREFIX,
  POPULATION_STRUCTURE_TAG,
  computeStructureIndicators,
  populationStructureObjectKey,
  validatePopulationStructure,
  validateTerritorialStructure,
  type PopulationStructureAnnual,
  type PopulationStructureBand,
  type StructureIndicator,
  type TerritorialLevel,
  type TerritorialPopulationStructure,
  type TerritorialQuality,
  type TerritorialSource,
} from './socideas-population-structure'

/** Prefijo R2 reservado por este módulo (reexportado para scripts y QA). */
export const POPULATION_STRUCTURE_RUNTIME_PREFIX = POPULATION_STRUCTURE_R2_PREFIX
/** Tag base de Data Cache para invalidación selectiva de la estructura. */
export const POPULATION_STRUCTURE_RUNTIME_TAG = POPULATION_STRUCTURE_TAG
/** Ventana de revalidación de la caché (segundos). */
export const POPULATION_STRUCTURE_REVALIDATE_SECONDS = 86400
/** Timeout de cada lectura de objeto R2 (ms). */
const R2_TIMEOUT_MS = 12000

/**
 * Correspondencia provincia (2 dígitos) → comunidad autónoma (2 dígitos),
 * derivada de la jerarquía oficial de la tabla INE 68521 (misma que consolida
 * `tmp/audit/estructura-2025/refs.json`). Se usa para elegir el benchmark CCAA
 * de un municipio sin leer objetos adicionales.
 */
export const PROVINCIA_TO_CCAA: Readonly<Record<string, string>> = {
  '01': '16',
  '02': '08',
  '03': '10',
  '04': '01',
  '05': '07',
  '06': '11',
  '07': '04',
  '08': '09',
  '09': '07',
  '10': '11',
  '11': '01',
  '12': '10',
  '13': '08',
  '14': '01',
  '15': '12',
  '16': '08',
  '17': '09',
  '18': '01',
  '19': '08',
  '20': '16',
  '21': '01',
  '22': '02',
  '23': '01',
  '24': '07',
  '25': '09',
  '26': '17',
  '27': '12',
  '28': '13',
  '29': '01',
  '30': '14',
  '31': '15',
  '32': '12',
  '33': '03',
  '34': '07',
  '35': '05',
  '36': '12',
  '37': '07',
  '38': '05',
  '39': '06',
  '40': '07',
  '41': '01',
  '42': '07',
  '43': '09',
  '44': '02',
  '45': '08',
  '46': '10',
  '47': '07',
  '48': '16',
  '49': '07',
  '50': '02',
  '51': '18',
  '52': '19',
}

/** Procedencia de un objeto municipal/territorial publicado en R2. */
export interface PopulationStructureSourceRef {
  table: '68535' | '68534' | '68521'
  url: string
  checksum: string
  retrievedAt: string
}

/** Benchmark territorial slim: bandas + totales + indicadores + calidad. */
export interface TerritorialBenchmark {
  level: TerritorialLevel
  code: string
  name: string
  period: string
  bands: PopulationStructureBand[]
  totals: { total: number | null; male: number | null; female: number | null }
  indicators: StructureIndicator[]
  quality: TerritorialQuality
  source: TerritorialSource
}

/**
 * DTO de la estructura municipal con benchmarks. Extiende
 * `PopulationStructureAnnual`, así que es asignable a `populationStructure`
 * del libro sin adaptador, y añade `bands`/`indicators`/`source`/`benchmarks`
 * (los benchmarks pueden ser `null` si su objeto R2 aún no está publicado).
 */
export interface MunicipalStructureWithBenchmarks extends PopulationStructureAnnual {
  /** Alias de `ageBands5y` para el consumo slim. */
  bands: PopulationStructureBand[]
  indicators: StructureIndicator[]
  source: PopulationStructureSourceRef
  benchmarks: {
    provincia: TerritorialBenchmark | null
    ccaa: TerritorialBenchmark | null
    nacional: TerritorialBenchmark | null
  }
}

// ============================================================================
// Acceso a R2 (S3, solo lectura)
// ============================================================================

/** Objeto ausente (404/NoSuchKey). No se cachea y no se confunde con error. */
class R2ObjectMissing extends Error {
  constructor(key: string) {
    super(`objeto R2 ausente: ${key}`)
    this.name = 'R2ObjectMissing'
  }
}

function r2Client(): { client: S3Client; bucket: string } | null {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null
  return {
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket,
  }
}

function isNotFound(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const candidate = err as { name?: unknown; $metadata?: { httpStatusCode?: unknown } }
  if (candidate.name === 'NoSuchKey' || candidate.name === 'NotFound') return true
  return candidate.$metadata?.httpStatusCode === 404
}

function errorName(err: unknown): string {
  if (err instanceof Error && err.name.length > 0) return err.name
  return 'UnknownError'
}

/** Log seguro: solo clave lógica y nombre de error; nunca valores ni trazas. */
function warnSafe(message: string): void {
  console.error(`[socideas][population-structure] ${message}`)
}

/** Lee el texto de un objeto; lanza `R2ObjectMissing` si no existe. */
async function getR2Text(key: string): Promise<string> {
  const r2 = r2Client()
  if (!r2) throw new Error('R2 no configurado')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), R2_TIMEOUT_MS)
  try {
    const res = await r2.client.send(
      new GetObjectCommand({ Bucket: r2.bucket, Key: key }),
      { abortSignal: controller.signal },
    )
    const text = await res.Body?.transformToString()
    if (text === undefined || text === null || text === '') throw new R2ObjectMissing(key)
    return text
  } catch (err) {
    if (err instanceof R2ObjectMissing) throw err
    if (isNotFound(err)) throw new R2ObjectMissing(key)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function isMissingCacheStore(err: unknown): boolean {
  return err instanceof Error && err.message.includes('incrementalCache missing')
}

/**
 * Lectura cacheada de un JSON de R2. El objeto se valida FUERA (con el
 * validador del contrato), de modo que esta caché solo guarda JSON 200.
 */
async function readR2JsonCached(key: string, perObjectTag: string): Promise<unknown> {
  const fetchValidated = async (k: string): Promise<unknown> => {
    const text = await getR2Text(k)
    return JSON.parse(text) as unknown
  }
  try {
    const cached = unstable_cache(fetchValidated, [key], {
      revalidate: POPULATION_STRUCTURE_REVALIDATE_SECONDS,
      tags: [POPULATION_STRUCTURE_TAG, perObjectTag],
    })
    return await cached(key)
  } catch (err) {
    if (isMissingCacheStore(err)) {
      // Fuera del runtime de Next (tsx): lectura directa, sin persistir.
      return fetchValidated(key)
    }
    throw err
  }
}

// ============================================================================
// API pública
// ============================================================================

/**
 * Estructura municipal anual (INE 68535/68534) validada, o `null` si no está
 * publicada/validable. Un `null` NO se sustituye por ninguna pirámide previa.
 */
export async function readMunicipalStructure(ine: string): Promise<PopulationStructureAnnual | null> {
  if (!/^\d{5}$/.test(ine)) return null
  const key = populationStructureObjectKey('municipio', ine)
  try {
    const json = await readR2JsonCached(key, `${POPULATION_STRUCTURE_TAG}-municipio-${ine}`)
    const parsed = validatePopulationStructure(json)
    if (!parsed.ok) {
      warnSafe(`objeto municipal descartado (${ine}): ${parsed.errors.length} error(es) de contrato`)
      return null
    }
    if (parsed.data.ineCode !== ine) {
      warnSafe(`INE no coincidente en el objeto municipal (${ine})`)
      return null
    }
    return parsed.data
  } catch (err) {
    if (err instanceof R2ObjectMissing) {
      warnSafe(`sin estructura municipal publicada (${ine}); el bloque queda pendiente`)
      return null
    }
    warnSafe(`lectura municipal fallida (${ine}) [${errorName(err)}]`)
    return null
  }
}

/**
 * Objeto territorial de benchmark (nacional/CCAA/provincia) validado, o `null`.
 */
export async function readBenchmark(
  level: TerritorialLevel,
  code: string,
): Promise<TerritorialPopulationStructure | null> {
  if (level === 'nacional') {
    if (code !== 'ES') return null
  } else if (!/^\d{2}$/.test(code)) {
    return null
  }
  const key = populationStructureObjectKey(level, code)
  try {
    const json = await readR2JsonCached(key, `${POPULATION_STRUCTURE_TAG}-${level}-${code}`)
    const parsed = validateTerritorialStructure(json, level)
    if (!parsed.ok) {
      warnSafe(`benchmark descartado (${level} ${code}): ${parsed.errors.length} error(es) de contrato`)
      return null
    }
    if (parsed.data.territoryCode !== code) {
      warnSafe(`código no coincidente en benchmark (${level} ${code})`)
      return null
    }
    return parsed.data
  } catch (err) {
    if (err instanceof R2ObjectMissing) {
      warnSafe(`sin benchmark publicado (${level} ${code})`)
      return null
    }
    warnSafe(`lectura benchmark fallida (${level} ${code}) [${errorName(err)}]`)
    return null
  }
}

function toBenchmark(t: TerritorialPopulationStructure): TerritorialBenchmark {
  return {
    level: t.territoryLevel,
    code: t.territoryCode,
    name: t.territoryName,
    period: t.period,
    bands: t.ageBands,
    totals: { total: t.total, male: t.male, female: t.female },
    indicators: t.derivedIndicators,
    quality: t.quality,
    source: t.source,
  }
}

/**
 * Estructura municipal + benchmarks (provincia, CCAA y nacional). Devuelve
 * `null` solo si falta el municipio; si falta un benchmark, ese campo queda
 * `null` y el resto se mantiene. Es directamente asignable a
 * `populationStructure` del libro v2.
 */
export async function readMunicipalStructureWithBenchmarks(
  ine: string,
): Promise<MunicipalStructureWithBenchmarks | null> {
  const municipal = await readMunicipalStructure(ine)
  if (municipal === null) return null
  const provincia = ine.slice(0, 2)
  const ccaa = PROVINCIA_TO_CCAA[provincia] ?? null
  const [prov, com, nac] = await Promise.all([
    readBenchmark('provincia', provincia),
    ccaa === null ? Promise.resolve(null) : readBenchmark('ccaa', ccaa),
    readBenchmark('nacional', 'ES'),
  ])
  return {
    ...municipal,
    bands: municipal.ageBands5y,
    indicators: computeStructureIndicators(municipal),
    source: {
      table: municipal.sourceTable,
      url: municipal.sourceUrl,
      checksum: municipal.quality.sourceChecksum,
      retrievedAt: municipal.retrievedAt,
    },
    benchmarks: {
      provincia: prov === null ? null : toBenchmark(prov),
      ccaa: com === null ? null : toBenchmark(com),
      nacional: nac === null ? null : toBenchmark(nac),
    },
  }
}
