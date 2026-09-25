// Publica la estructura de población SOCideas v2 (municipal + territorial) a R2
// con un gate fail-closed. NADA se escribe en R2 hasta pasar los controles.
//
// ORDEN DEL GATE (se detiene al primer fallo, sin escribir lo siguiente):
//   a) dry-run: valida los JSON locales (municipio + territorio) con los
//      validadores del contrato y construye un manifiesto con SHA-256 y bytes
//      por objeto. Escribe el manifiesto SOLO en tmp/ (nunca en R2).
//   b) backup: respalda en tmp/backup/population-structure/<fecha>/ cada clave
//      existente que vaya a reemplazarse (o registra "no existía").
//   c) restore rehearsal: restaura desde ese backup a un prefijo aislado
//      `socideas/population-structure/_restore-test/`, verifica byte a byte y
//      borra ÚNICAMENTE lo escrito por el ensayo.
//   d) escritura piloto: 45090 + provincia 45 + CCAA 08 + nacional ES.
//   e) read-back + comparación semántica del piloto contra local.
//   f) registro de auditoría en Supabase `data_sync_runs` (INSERT/UPDATE).
//   g) escritura completa (8.132 + 52 + 19 + 1) y read-back estratificado
//      (los 9 pilotos + 3 territorios). Cualquier fallo detiene la ejecución.
//
// USO
//   npx tsx scripts/publish-population-structure-r2.ts --dry-run   (por defecto)
//   npx tsx scripts/publish-population-structure-r2.ts --write
//   npx tsx scripts/publish-population-structure-r2.ts --write --only-pilots
//   npx tsx scripts/publish-population-structure-r2.ts --write --concurrency=24
//
// PROHIBIDO por diseño: borrar claves ajenas al prefijo, borrar datos de origen,
// reescribir el prefijo de restauración fuera del ensayo, tocar Supabase más
// allá de `data_sync_runs`. No imprime credenciales.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { config } from 'dotenv'
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'
import {
  POPULATION_STRUCTURE_DATASET_SCHEMA,
  POPULATION_STRUCTURE_R2_PREFIX,
  canonicalBandLabel,
  populationStructureObjectKey,
  structureBandKey,
  validatePopulationStructure,
  validatePopulationStructureDataset,
  validateTerritorialStructure,
  type PopulationSourceManifestEntry,
  type PopulationStructureDataset,
  type PopulationStructureObjectLevel,
  type TerritorialPopulationStructure,
  type TerritorialValidationStatus,
} from '../src/lib/socideas-population-structure'

config({ path: '.env.local' })

// ============================================================================
// Rutas y constantes
// ============================================================================

const AUDIT_DIR = path.join('tmp', 'audit')
const STRUCTURE_DIR = path.join(AUDIT_DIR, 'estructura-2025')
const TERR_DIR = path.join(STRUCTURE_DIR, 'territorio')
const MANIFEST_SOURCE = path.join(AUDIT_DIR, 'manifest-population-structure-v2-2.json')
const BACKUP_ROOT = path.join('tmp', 'backup', 'population-structure')
const R2_PREFIX = POPULATION_STRUCTURE_R2_PREFIX
const RESTORE_TEST_PREFIX = `${R2_PREFIX}/_restore-test`
const PERIOD = '2025'
const TIPO_SINCRONIZACION = 'socideas_population_structure_publish'

/** 9 municipios piloto (los libros ya auditados en tmp/audit). */
const PILOT_INES = ['45090', '16211', '28079', '51001', '01041', '48020', '15078', '52001', '07024']
/** 3 territorios piloto. */
const PILOT_TERRITORIES: { level: PopulationStructureObjectLevel; code: string }[] = [
  { level: 'provincia', code: '45' },
  { level: 'ccaa', code: '08' },
  { level: 'nacional', code: 'ES' },
]
const RESTORE_REHEARSAL_MAX = 25

type Args = {
  write: boolean
  onlyPilots: boolean
  concurrency: number
  limitMunicipios: number | null
  /** Publica SOLO `refs.json` (backup + read-back), sin tocar el resto del prefijo. */
  refsOnly: boolean
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const numeric = (prefix: string): number | null => {
    const hit = argv.find((a) => a.startsWith(prefix))
    if (hit === undefined) return null
    const value = Number(hit.slice(prefix.length))
    return Number.isFinite(value) && value > 0 ? value : null
  }
  return {
    write: argv.includes('--write'),
    onlyPilots: argv.includes('--only-pilots'),
    concurrency: numeric('--concurrency=') ?? 24,
    limitMunicipios: numeric('--limit-municipios='),
    refsOnly: argv.includes('--refs-only'),
  }
}

// ============================================================================
// Utilidades
// ============================================================================

function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex')
}

function short(hash: string): string {
  return `${hash.slice(0, 12)}…`
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      out[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return out
}

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown = null
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** i))
    }
  }
  const name = lastError instanceof Error ? lastError.name : 'UnknownError'
  throw new Error(`${label} falló tras ${attempts} intentos [${name}]`)
}

// ============================================================================
// R2
// ============================================================================

type R2 = { client: S3Client; bucket: string }

function r2Client(): R2 | null {
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

/** Devuelve los bytes del objeto, o `null` si no existe (404). */
async function getObjectBytes(r2: R2, key: string): Promise<Buffer | null> {
  try {
    const res = await withRetry(`GET ${key}`, () =>
      r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key })),
    )
    const bytes = await res.Body?.transformToByteArray()
    return bytes === undefined ? null : Buffer.from(bytes)
  } catch (err) {
    if (isNotFound(err)) return null
    throw err
  }
}

/** GET sin reintentos que trata 404 como ausencia (para backups opcionales). */
async function getObjectBytesMaybe(r2: R2, key: string): Promise<Buffer | null> {
  try {
    const res = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }))
    const bytes = await res.Body?.transformToByteArray()
    return bytes === undefined ? null : Buffer.from(bytes)
  } catch (err) {
    if (isNotFound(err)) return null
    throw err
  }
}

async function putObject(r2: R2, key: string, body: Buffer, kind: string): Promise<void> {
  await withRetry(`PUT ${key}`, () =>
    r2.client.send(
      new PutObjectCommand({
        Bucket: r2.bucket,
        Key: key,
        Body: body,
        ContentType: 'application/json',
        CacheControl: 'public, max-age=300, must-revalidate',
        Metadata: { kind, sha256: sha256(body) },
      }),
    ),
  )
}

async function deleteKeys(r2: R2, keys: readonly string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000).map((Key) => ({ Key }))
    if (batch.length === 0) continue
    await withRetry(`DELETE ${batch.length} clave(s)`, () =>
      r2.client.send(new DeleteObjectsCommand({ Bucket: r2.bucket, Delete: { Objects: batch } })),
    )
  }
}

async function listExistingKeys(r2: R2, prefix: string): Promise<Set<string>> {
  const keys = new Set<string>()
  let token: string | undefined
  do {
    const res = await withRetry(`LIST ${prefix}`, () =>
      r2.client.send(
        new ListObjectsV2Command({ Bucket: r2.bucket, Prefix: prefix, ContinuationToken: token }),
      ),
    )
    for (const obj of res.Contents ?? []) if (obj.Key) keys.add(obj.Key)
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token !== undefined)
  return keys
}

// ============================================================================
// Modelo de publicación
// ============================================================================

interface PublishItem {
  level: PopulationStructureObjectLevel
  code: string
  key: string
  localPath: string
  sha256: string
  bytes: number
}

interface PilotReadBack {
  key: string
  level: PopulationStructureObjectLevel
  code: string
  sha256: string
  bytes: number
}

// ============================================================================
// (a) Validación local + manifiesto
// ============================================================================

function hasCompleteBands(t: TerritorialPopulationStructure): boolean {
  const keys = t.ageBands.map((band) => structureBandKey(band.band))
  return keys.length === 21 && keys.every((key, i) => key === i * 5)
}

function reconciled(t: TerritorialPopulationStructure): boolean {
  return t.quality.totalBySexReconciled && t.quality.totalByAgeReconciled
}

function loadMunicipalItems(args: Args, problems: string[]): PublishItem[] {
  const names = readdirSync(STRUCTURE_DIR).filter((name) => /^\d{5}\.json$/.test(name)).sort()
  const limited = args.limitMunicipios === null ? names : names.slice(0, args.limitMunicipios)
  const items: PublishItem[] = []
  let invalid = 0
  for (const name of limited) {
    const ine = name.slice(0, 5)
    const localPath = path.join(STRUCTURE_DIR, name)
    const raw = readFileSync(localPath)
    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(raw.toString('utf8')) as unknown
    } catch (err) {
      invalid += 1
      problems.push(`${ine}: JSON ilegible (${err instanceof Error ? err.name : 'error'})`)
      continue
    }
    const parsed = validatePopulationStructure(parsedJson)
    if (!parsed.ok) {
      invalid += 1
      problems.push(`${ine}: contrato municipal inválido -> ${parsed.errors.slice(0, 3).join(' | ')}`)
      continue
    }
    if (parsed.data.ineCode !== ine) {
      invalid += 1
      problems.push(`${ine}: ineCode interno ${parsed.data.ineCode} no coincide con el fichero`)
      continue
    }
    items.push({
      level: 'municipio',
      code: ine,
      key: populationStructureObjectKey('municipio', ine),
      localPath,
      sha256: sha256(raw),
      bytes: raw.length,
    })
  }
  console.log(
    `[a] municipios: ${items.length} válidos de ${limited.length} en disco` +
      (invalid > 0 ? ` · ${invalid} inválidos` : ''),
  )
  return items
}

interface TerritorialLoad {
  items: PublishItem[]
  national: TerritorialPopulationStructure
  provinces: TerritorialPopulationStructure[]
  ccaa: TerritorialPopulationStructure[]
}

function loadTerritorialItems(problems: string[]): TerritorialLoad | null {
  const levels: { level: 'nacional' | 'ccaa' | 'provincia'; dir: string }[] = [
    { level: 'nacional', dir: path.join(TERR_DIR, 'nacional') },
    { level: 'ccaa', dir: path.join(TERR_DIR, 'ccaa') },
    { level: 'provincia', dir: path.join(TERR_DIR, 'provincia') },
  ]
  const items: PublishItem[] = []
  const provinces: TerritorialPopulationStructure[] = []
  const ccaa: TerritorialPopulationStructure[] = []
  let national: TerritorialPopulationStructure | null = null
  for (const { level, dir } of levels) {
    if (!existsSync(dir)) {
      problems.push(`territorio: falta el directorio ${dir}`)
      return null
    }
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
      const code = name.slice(0, -'.json'.length)
      const localPath = path.join(dir, name)
      const raw = readFileSync(localPath)
      let parsedJson: unknown
      try {
        parsedJson = JSON.parse(raw.toString('utf8')) as unknown
      } catch (err) {
        problems.push(`territorio ${level} ${code}: JSON ilegible (${err instanceof Error ? err.name : 'error'})`)
        continue
      }
      const parsed = validateTerritorialStructure(parsedJson, level)
      if (!parsed.ok) {
        problems.push(
          `territorio ${level} ${code}: inválido -> ${parsed.errors.slice(0, 3).join(' | ')}`,
        )
        continue
      }
      if (parsed.data.territoryCode !== code) {
        problems.push(`territorio ${level} ${code}: código interno ${parsed.data.territoryCode} no coincide`)
        continue
      }
      if (level === 'nacional') national = parsed.data
      else if (level === 'ccaa') ccaa.push(parsed.data)
      else provinces.push(parsed.data)
      items.push({
        level,
        code,
        key: populationStructureObjectKey(level, code),
        localPath,
        sha256: sha256(raw),
        bytes: raw.length,
      })
    }
  }
  if (national === null) {
    problems.push('territorio: no se encontró el objeto nacional ES')
    return null
  }
  console.log(`[a] territorios: ${items.length} válidos (${provinces.length} provincia · ${ccaa.length} CCAA · 1 nacional)`)
  return { items, national, provinces, ccaa }
}

function readSourceManifest(problems: string[]): PopulationSourceManifestEntry[] {
  if (!existsSync(MANIFEST_SOURCE)) {
    problems.push(`no se encontró el manifiesto de fuentes ${MANIFEST_SOURCE}`)
    return []
  }
  const raw = JSON.parse(readFileSync(MANIFEST_SOURCE, 'utf8')) as {
    fuentes?: Record<string, PopulationSourceManifestEntry>
  }
  const entries = Object.values(raw.fuentes ?? {})
  if (entries.length === 0) problems.push('el manifiesto de fuentes no contiene entradas')
  return entries
}

/**
 * Valida TODOS los territorios como un único dataset con el validador oficial
 * (`validatePopulationStructureDataset`), no solo objeto a objeto.
 */
function buildAndValidateDataset(
  load: TerritorialLoad,
  problems: string[],
): PopulationStructureDataset | null {
  const sourceManifest = readSourceManifest(problems)
  if (sourceManifest.length === 0) return null
  const all = [load.national, ...load.ccaa, ...load.provinces]
  const labelsCanonical = all.every((t) =>
    t.ageBands.every(
      (band, i) =>
        band.band === canonicalBandLabel(structureBandKey(band.band)) &&
        structureBandKey(band.band) === i * 5,
    ),
  )
  const anyFailed = all.some((t) => t.quality.validationStatus === 'failed')
  const anyPartial = all.some((t) => t.quality.validationStatus === 'partial')
  const validationStatus: TerritorialValidationStatus = anyFailed
    ? 'failed'
    : anyPartial
      ? 'partial'
      : 'passed'
  const dataset: PopulationStructureDataset = {
    schemaVersion: POPULATION_STRUCTURE_DATASET_SCHEMA,
    period: load.national.period,
    retrievedAt: load.national.source.retrievedAt,
    sourceManifest,
    provinces: load.provinces,
    autonomousCommunities: load.ccaa,
    national: load.national,
    quality: {
      provincesCount: load.provinces.length,
      autonomousCommunitiesCount: load.ccaa.length,
      provincesWithCompleteBands: load.provinces.filter(hasCompleteBands).length,
      autonomousCommunitiesWithCompleteBands: load.ccaa.filter(hasCompleteBands).length,
      nationalCompleteBands: hasCompleteBands(load.national),
      provincesReconciled: load.provinces.filter(reconciled).length,
      autonomousCommunitiesReconciled: load.ccaa.filter(reconciled).length,
      nationalReconciled: reconciled(load.national),
      bandLabelsConsistentWith68535: labelsCanonical,
      validationStatus,
    },
  }
  const parsed = validatePopulationStructureDataset(dataset)
  if (!parsed.ok) {
    for (const error of parsed.errors.slice(0, 10)) problems.push(`dataset territorial: ${error}`)
    return null
  }
  return parsed.data
}

interface PublishManifest {
  schema: 'socideas-population-structure-publish-manifest@1'
  generatedAt: string
  period: string
  prefix: string
  counts: {
    municipio: number
    provincia: number
    ccaa: number
    nacional: number
    total: number
    bytesTotal: number
  }
  hashes: { combinedSha256: string }
  items: { level: PopulationStructureObjectLevel; code: string; key: string; sha256: string; bytes: number }[]
}

function buildManifest(items: readonly PublishItem[]): PublishManifest {
  const counts = { municipio: 0, provincia: 0, ccaa: 0, nacional: 0 }
  let bytesTotal = 0
  for (const item of items) {
    counts[item.level] += 1
    bytesTotal += item.bytes
  }
  const combinedSha256 = sha256(
    items
      .map((i) => `${i.key}:${i.sha256}`)
      .sort()
      .join('\n'),
  )
  return {
    schema: 'socideas-population-structure-publish-manifest@1',
    generatedAt: new Date().toISOString(),
    period: PERIOD,
    prefix: R2_PREFIX,
    counts: { ...counts, total: items.length, bytesTotal },
    hashes: { combinedSha256 },
    items: items.map((i) => ({ level: i.level, code: i.code, key: i.key, sha256: i.sha256, bytes: i.bytes })),
  }
}

// ============================================================================
// Comparación semántica
// ============================================================================

/** Nivel a partir de la clave R2 `socideas/population-structure/v1/<nivel>/<c>.json`. */
function levelFromKey(key: string): PopulationStructureObjectLevel {
  const level = key.split('/')[3]
  if (level === 'municipio' || level === 'provincia' || level === 'ccaa' || level === 'nacional') {
    return level
  }
  return 'municipio'
}

function semanticMismatches(
  local: unknown,
  remote: unknown,
  level: PopulationStructureObjectLevel,
): string[] {
  const mismatches: string[] = []
  if (level === 'municipio') {
    const localParsed = validatePopulationStructure(local)
    const remoteParsed = validatePopulationStructure(remote)
    if (!localParsed.ok) return ['local municipal no válido (inesperado)']
    if (!remoteParsed.ok) return ['remoto municipal no pasa el validador']
    const l = localParsed.data
    const r = remoteParsed.data
    if (r.period !== l.period) mismatches.push(`period ${r.period} != ${l.period}`)
    if (JSON.stringify(r.totals) !== JSON.stringify(l.totals)) mismatches.push('totals difieren')
    if (JSON.stringify(r.ageBands5y) !== JSON.stringify(l.ageBands5y)) mismatches.push('ageBands5y difieren')
    if ((r.ageDetail === null) !== (l.ageDetail === null)) mismatches.push('ageDetail presencia difiere')
    if (r.quality.sourceChecksum !== l.quality.sourceChecksum) mismatches.push('sourceChecksum difiere')
    return mismatches
  }
  const localObj = local as TerritorialPopulationStructure
  const remoteParsed = validateTerritorialStructure(remote, localObj.territoryLevel)
  if (!remoteParsed.ok) return ['remoto territorial no pasa el validador']
  const r = remoteParsed.data
  if (r.period !== localObj.period) mismatches.push(`period ${r.period} != ${localObj.period}`)
  if (r.total !== localObj.total || r.male !== localObj.male || r.female !== localObj.female) {
    mismatches.push('totales difieren')
  }
  if (JSON.stringify(r.ageBands) !== JSON.stringify(localObj.ageBands)) mismatches.push('ageBands difieren')
  if (JSON.stringify(r.derivedIndicators.map((i) => [i.key, i.value])) !== JSON.stringify(localObj.derivedIndicators.map((i) => [i.key, i.value]))) {
    mismatches.push('indicadores derivados difieren')
  }
  if (r.source.checksum !== localObj.source.checksum) mismatches.push('sourceChecksum difiere')
  return mismatches
}

// ============================================================================
// Supabase (auditoría)
// ============================================================================

type SupabaseAudit = ReturnType<typeof createClient>

function supabaseAudit(): SupabaseAudit | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function insertAudit(
  supabase: SupabaseAudit,
  metadata: Record<string, unknown>,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('data_sync_runs')
    .insert({
      tipo_sincronizacion: TIPO_SINCRONIZACION,
      estado: 'ok',
      bloque: 'demografia',
      periodo: PERIOD,
      fuente: 'ine_68535_68534_68521',
      estado_dato: 'consolidado',
      inicio: new Date().toISOString(),
      registros_leidos: 0,
      registros_actualizados: 0,
      registros_con_error: 0,
      metadata,
    })
    .select('id')
    .maybeSingle()
  if (error) {
    console.error(`[f] INSERT data_sync_runs falló: ${error.message}`)
    return null
  }
  const id = (data as { id?: string } | null)?.id ?? null
  return id
}

async function updateAudit(
  supabase: SupabaseAudit,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('data_sync_runs').update(patch).eq('id', id)
  if (error) console.error(`[f] UPDATE data_sync_runs falló: ${error.message}`)
}

// ============================================================================
// Principal
// ============================================================================

interface BackupEntry {
  key: string
  existed: boolean
  sha256: string | null
  bytes: number | null
  body: Buffer | null
}

// ============================================================================
// Modo mínimo `--refs-only`: publica `refs.json` con backup + read-back.
// ============================================================================

const REFS_LOCAL = path.join(STRUCTURE_DIR, 'refs.json')
const REFS_KEY = `${POPULATION_STRUCTURE_R2_PREFIX}/refs.json`

async function publicarRefsSolo(write: boolean): Promise<void> {
  if (!existsSync(REFS_LOCAL)) {
    console.error(`[refs] FALLO: no existe ${REFS_LOCAL} (genera la estructura 2025 primero).`)
    process.exitCode = 1
    return
  }
  const body = readFileSync(REFS_LOCAL)
  const localSha = sha256(body)
  console.log(
    `SOCideas · publicación refs.json · modo ${write ? 'WRITE' : 'DRY-RUN (sin escrituras)'} · ` +
      `key ${REFS_KEY} · ${formatBytes(body.length)} · sha ${short(localSha)}`,
  )
  if (!write) {
    console.log('DRY-RUN refs completado: no se ha escrito nada en R2.')
    return
  }
  const r2 = r2Client()
  if (r2 === null) {
    console.error('[refs] FALLO: faltan credenciales R2 (R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET). Abortado sin escribir.')
    process.exitCode = 1
    return
  }

  // Backup del objeto vivo (si existe) en tmp/backup (nunca en R2).
  const runStamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = path.join(BACKUP_ROOT, runStamp)
  mkdirSync(backupDir, { recursive: true })
  const prev = await getObjectBytesMaybe(r2, REFS_KEY)
  let backupPath: string | null = null
  if (prev !== null) {
    backupPath = path.join(backupDir, 'refs.json')
    writeFileSync(backupPath, prev)
    console.log(`[refs][backup] ${backupPath} (${formatBytes(prev.length)}, sha ${short(sha256(prev))})`)
  } else {
    backupPath = path.join(backupDir, 'refs.json.no-existia')
    writeFileSync(backupPath, '')
    console.log('[refs][backup] el objeto no existía previamente')
  }

  // Escritura + read-back byte a byte.
  await putObject(r2, REFS_KEY, body, 'population-structure-refs')
  const rb = await getObjectBytes(r2, REFS_KEY)
  if (rb === null) throw new Error('read-back: el objeto no existe tras el PUT')
  const rbSha = sha256(rb)
  if (rbSha !== localSha) throw new Error(`read-back sha ${short(rbSha)} ≠ local ${short(localSha)}`)
  console.log(`[refs][read-back] OK · sha ${short(rbSha)} · bytes ${rb.length}`)

  const manifest = {
    publishedAt: new Date().toISOString(),
    key: REFS_KEY,
    local: REFS_LOCAL,
    sha256: localSha,
    bytes: body.length,
    backup: backupPath,
    readBack: { sha256: rbSha, bytes: rb.length },
  }
  const manifestPath = path.join(AUDIT_DIR, `publish-refs-manifest-${Date.now()}.json`)
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
  console.log(`[refs] manifiesto: ${manifestPath}`)
}

async function main(): Promise<void> {
  const args = parseArgs()
  const started = Date.now()
  if (args.refsOnly) {
    await publicarRefsSolo(args.write)
    return
  }
  console.log(
    `SOCideas · publicación estructura de población v2 · modo ${args.write ? 'WRITE' : 'DRY-RUN (sin escrituras)'} · ` +
      `prefijo ${R2_PREFIX}`,
  )

  // ---- (a) validación local + manifiesto ----
  const problems: string[] = []
  const municipalItems = loadMunicipalItems(args, problems)
  const territorial = loadTerritorialItems(problems)
  if (territorial === null) {
    console.error(`[a] FALLO: territorios no cargados (${problems.length} problema(s))`)
    for (const p of problems.slice(0, 20)) console.error(`  - ${p}`)
    process.exitCode = 1
    return
  }
  const dataset = buildAndValidateDataset(territorial, problems)
  if (dataset === null) {
    console.error('[a] FALLO: el dataset territorial no pasa validatePopulationStructureDataset')
    for (const p of problems.slice(0, 20)) console.error(`  - ${p}`)
    process.exitCode = 1
    return
  }
  const items = [...municipalItems, ...territorial.items]
  const manifest = buildManifest(items)
  const manifestPath = path.join(AUDIT_DIR, `publish-population-structure-manifest-${Date.now()}.json`)
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
  console.log(
    `[a] OK · ${manifest.counts.municipio} municipio + ${manifest.counts.provincia} provincia + ${manifest.counts.ccaa} CCAA + 1 nacional = ` +
      `${manifest.counts.total} objetos · ${formatBytes(manifest.counts.bytesTotal)} · sha conjunto ${short(manifest.hashes.combinedSha256)}`,
  )
  console.log(`[a] manifiesto local: ${manifestPath}`)

  if (!args.write) {
    console.log('DRY-RUN completado: validación y manifiesto OK. No se ha escrito nada en R2 ni Supabase.')
    return
  }

  const r2 = r2Client()
  if (r2 === null) {
    console.error('[b] FALLO: faltan credenciales R2 (R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET). Abortado sin escribir.')
    process.exitCode = 1
    return
  }

  const itemByKey = new Map(items.map((i) => [i.key, i]))
  const runStamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = path.join(BACKUP_ROOT, runStamp)
  mkdirSync(backupDir, { recursive: true })

  // ---- (b) backup ----
  const backupStarted = Date.now()
  const existing = await listExistingKeys(r2, `${R2_PREFIX}/`)
  const existingManaged = [...existing].filter((k) => !k.startsWith(`${RESTORE_TEST_PREFIX}/`))
  console.log(`[b] claves existentes bajo ${R2_PREFIX}/: ${existingManaged.length}`)
  const backups: BackupEntry[] = []
  let backupBytes = 0
  for (const key of existingManaged) {
    const body = await getObjectBytes(r2, key)
    if (body === null) {
      backups.push({ key, existed: false, sha256: null, bytes: null, body: null })
      continue
    }
    const file = path.join(backupDir, ...key.split('/'))
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, body)
    backupBytes += body.length
    backups.push({ key, existed: true, sha256: sha256(body), bytes: body.length, body })
  }
  const absentCount = items.length - existingManaged.filter((k) => itemByKey.has(k)).length
  writeFileSync(
    path.join(backupDir, '_index.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        prefix: R2_PREFIX,
        existing: existingManaged.length,
        bytes: backupBytes,
        items: backups.map((b) => ({ key: b.key, existed: b.existed, sha256: b.sha256, bytes: b.bytes })),
      },
      null,
      2,
    ),
    'utf8',
  )
  console.log(
    `[b] backup: ${backups.length} respaldadas · ${formatBytes(backupBytes)} en ${backupDir} · ` +
      `${absentCount} claves del manifiesto no existían · ${formatMs(Date.now() - backupStarted)}`,
  )

  // ---- (c) restore rehearsal ----
  const rehearsalStarted = Date.now()
  let rehearsalSource: { key: string; relative: string; body: Buffer; sha256: string }[]
  let rehearsalLabel: string
  if (backups.some((b) => b.existed && b.body !== null)) {
    rehearsalSource = backups
      .filter((b): b is BackupEntry & { body: Buffer; sha256: string; bytes: number } =>
        b.existed && b.body !== null && b.sha256 !== null && b.bytes !== null)
      .slice(0, RESTORE_REHEARSAL_MAX)
      .map((b) => ({ key: b.key, relative: b.key.slice(R2_PREFIX.length + 1), body: b.body, sha256: b.sha256 }))
    rehearsalLabel = `backup (muestra ${rehearsalSource.length} de ${backups.filter((b) => b.existed).length})`
  } else {
    // Primera publicación: no hay backup. Se ensaya el mecanismo con los bytes
    // locales del piloto (lo que se respaldaría en una re-publicación).
    const pilotKeys = new Set([
      populationStructureObjectKey('municipio', '45090'),
      ...PILOT_TERRITORIES.map((p) => populationStructureObjectKey(p.level, p.code)),
    ])
    rehearsalSource = items
      .filter((i) => pilotKeys.has(i.key))
      .map((i) => ({
        key: i.key,
        relative: i.key.slice(R2_PREFIX.length + 1),
        body: readFileSync(i.localPath),
        sha256: i.sha256,
      }))
    rehearsalLabel = `sin backup previo; ensayo con ${rehearsalSource.length} objetos piloto locales`
  }
  const testKeys = rehearsalSource.map((s) => `${RESTORE_TEST_PREFIX}/${s.relative}`)
  const rehearsalFailures: string[] = []
  try {
    for (const source of rehearsalSource) {
      const testKey = `${RESTORE_TEST_PREFIX}/${source.relative}`
      await putObject(r2, testKey, source.body, 'restore-rehearsal')
    }
    for (const source of rehearsalSource) {
      const testKey = `${RESTORE_TEST_PREFIX}/${source.relative}`
      const readBack = await getObjectBytes(r2, testKey)
      if (readBack === null) {
        rehearsalFailures.push(`${testKey}: no se pudo leer de vuelta`)
        continue
      }
      if (sha256(readBack) !== source.sha256) {
        rehearsalFailures.push(`${testKey}: SHA-256 distinto del origen`)
        continue
      }
      // El ensayo restaura desde el backup: la referencia semántica es el propio
      // backup (no el fichero local actual, que podría no ser el mismo objeto).
      const reference = JSON.parse(source.body.toString('utf8')) as unknown
      const remote = JSON.parse(readBack.toString('utf8')) as unknown
      const mismatches = semanticMismatches(reference, remote, levelFromKey(source.key))
      if (mismatches.length > 0) rehearsalFailures.push(`${testKey}: ${mismatches.join('; ')}`)
    }
  } finally {
    // Limpieza: SOLO las claves escritas por el ensayo.
    try {
      await deleteKeys(r2, testKeys)
    } catch (err) {
      console.error(`[c] aviso: no se pudieron limpiar todas las claves del ensayo [${err instanceof Error ? err.name : 'error'}]`)
    }
  }
  if (rehearsalFailures.length > 0) {
    console.error(`[c] FALLO: ensayo de restauración (${rehearsalLabel})`)
    for (const f of rehearsalFailures.slice(0, 10)) console.error(`  - ${f}`)
    process.exitCode = 1
    return
  }
  console.log(
    `[c] OK · ensayo de restauración (${rehearsalLabel}): ${rehearsalSource.length} objetos restaurados y verificados byte a byte; ` +
      `${testKeys.length} claves de ensayo limpiadas · ${formatMs(Date.now() - rehearsalStarted)}`,
  )

  // ---- (d) escritura piloto ----
  const pilotItems = [
    itemByKey.get(populationStructureObjectKey('municipio', '45090')),
    ...PILOT_TERRITORIES.map((p) => itemByKey.get(populationStructureObjectKey(p.level, p.code))),
  ].filter((i): i is PublishItem => i !== undefined)
  if (pilotItems.length !== 4) {
    console.error(`[d] FALLO: no se localizaron los 4 objetos piloto (encontrados ${pilotItems.length})`)
    process.exitCode = 1
    return
  }
  const pilotStarted = Date.now()
  for (const item of pilotItems) {
    await putObject(r2, item.key, readFileSync(item.localPath), item.level)
  }
  console.log(`[d] OK · piloto escrito: ${pilotItems.map((i) => `${i.level}/${i.code}`).join(', ')} · ${formatMs(Date.now() - pilotStarted)}`)

  // ---- (e) read-back piloto ----
  const readBackPilot: PilotReadBack[] = []
  const pilotFailures: string[] = []
  for (const item of pilotItems) {
    const bytes = await getObjectBytes(r2, item.key)
    if (bytes === null) {
      pilotFailures.push(`${item.key}: no se pudo leer de vuelta`)
      continue
    }
    if (sha256(bytes) !== item.sha256) {
      pilotFailures.push(`${item.key}: SHA-256 distinto`)
      continue
    }
    const local = JSON.parse(readFileSync(item.localPath, 'utf8')) as unknown
    let remote: unknown
    try {
      remote = JSON.parse(bytes.toString('utf8')) as unknown
    } catch (err) {
      pilotFailures.push(`${item.key}: JSON remoto ilegible (${err instanceof Error ? err.name : 'error'})`)
      continue
    }
    const mismatches = semanticMismatches(local, remote, item.level)
    if (mismatches.length > 0) {
      pilotFailures.push(`${item.key}: ${mismatches.join('; ')}`)
      continue
    }
    readBackPilot.push({ key: item.key, level: item.level, code: item.code, sha256: sha256(bytes), bytes: bytes.length })
  }
  if (pilotFailures.length > 0) {
    console.error('[e] FALLO: read-back del piloto')
    for (const f of pilotFailures) console.error(`  - ${f}`)
    process.exitCode = 1
    return
  }
  console.log(`[e] OK · read-back piloto verificado (SHA-256 + semántica) para ${readBackPilot.length} objetos`)

  // ---- (f) registro de auditoría ----
  const supabase = supabaseAudit()
  let auditId: string | null = null
  if (supabase === null) {
    console.error('[f] FALLO: faltan NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY para registrar auditoría. Abortado sin escritura completa.')
    process.exitCode = 1
    return
  }
  const baseMetadata = {
    run: 'scripts/publish-population-structure-r2.ts',
    prefix: R2_PREFIX,
    period: PERIOD,
    manifestPath,
    combinedSha256: manifest.hashes.combinedSha256,
    counts: manifest.counts,
    pilot: readBackPilot.map((p) => ({ key: p.key, sha256: p.sha256, bytes: p.bytes })),
    backupDir,
    backupExisting: backups.filter((b) => b.existed).length,
    restoreRehearsal: { source: rehearsalLabel, checked: rehearsalSource.length },
  }
  auditId = await insertAudit(supabase, { ...baseMetadata, phase: 'piloto_ok' })
  if (auditId === null) {
    console.error('[f] FALLO: no se pudo INSERTAR la fila de auditoría. Abortado sin escritura completa.')
    process.exitCode = 1
    return
  }
  console.log(`[f] OK · auditoría data_sync_runs id=${auditId} (fase piloto)`)

  if (args.onlyPilots) {
    await updateAudit(supabase, auditId, {
      fin: new Date().toISOString(),
      registros_leidos: pilotItems.length,
      registros_actualizados: pilotItems.length,
      metadata: { ...baseMetadata, phase: 'solo_pilotos', writeMode: 'only-pilots' },
    })
    console.log('[g] --only-pilots: escritura completa omitida a propósito. Fin.')
    return
  }

  // ---- (g) escritura completa + read-back estratificado ----
  const pilotKeySet = new Set(pilotItems.map((i) => i.key))
  const remaining = items.filter((i) => !pilotKeySet.has(i.key))
  const fullStarted = Date.now()
  let uploaded = pilotItems.length
  let uploadErrors = 0
  await mapLimit(remaining, args.concurrency, async (item) => {
    try {
      await putObject(r2, item.key, readFileSync(item.localPath), item.level)
      uploaded += 1
      if (uploaded % 1000 === 0) console.log(`[g] escritos ${uploaded}/${items.length}…`)
    } catch (err) {
      uploadErrors += 1
      console.error(`[g] PUT falló ${item.key} [${err instanceof Error ? err.name : 'error'}]`)
    }
  })
  if (uploadErrors > 0) {
    await updateAudit(supabase, auditId, {
      estado: 'error',
      fin: new Date().toISOString(),
      registros_leidos: items.length,
      registros_actualizados: uploaded,
      registros_con_error: uploadErrors,
      error_message: `Fallo de escritura en ${uploadErrors} objeto(s)`,
      metadata: { ...baseMetadata, phase: 'fallo_escritura', uploadErrors },
    })
    console.error(`[g] FALLO: ${uploadErrors} objeto(s) no se escribieron. Detenido.`)
    process.exitCode = 1
    return
  }
  console.log(`[g] escritura completa: ${uploaded}/${items.length} objetos · ${formatMs(Date.now() - fullStarted)}`)

  const stratInes = PILOT_INES
  const stratTerritories = PILOT_TERRITORIES
  const stratItems = [
    ...stratInes.map((ine) => itemByKey.get(populationStructureObjectKey('municipio', ine))),
    ...stratTerritories.map((p) => itemByKey.get(populationStructureObjectKey(p.level, p.code))),
  ].filter((i): i is PublishItem => i !== undefined)
  const stratFailures: string[] = []
  const stratChecked: string[] = []
  for (const item of stratItems) {
    const bytes = await getObjectBytes(r2, item.key)
    if (bytes === null) {
      stratFailures.push(`${item.key}: ausente en read-back`)
      continue
    }
    if (sha256(bytes) !== item.sha256) {
      stratFailures.push(`${item.key}: SHA-256 distinto`)
      continue
    }
    const local = JSON.parse(readFileSync(item.localPath, 'utf8')) as unknown
    let remote: unknown
    try {
      remote = JSON.parse(bytes.toString('utf8')) as unknown
    } catch (err) {
      stratFailures.push(`${item.key}: JSON remoto ilegible (${err instanceof Error ? err.name : 'error'})`)
      continue
    }
    const mismatches = semanticMismatches(local, remote, item.level)
    if (mismatches.length > 0) {
      stratFailures.push(`${item.key}: ${mismatches.join('; ')}`)
      continue
    }
    stratChecked.push(item.key)
  }
  if (stratFailures.length > 0) {
    await updateAudit(supabase, auditId, {
      estado: 'error',
      fin: new Date().toISOString(),
      registros_leidos: items.length,
      registros_actualizados: uploaded,
      registros_con_error: stratFailures.length,
      error_message: `Fallo de read-back estratificado en ${stratFailures.length} objeto(s)`,
      metadata: { ...baseMetadata, phase: 'fallo_readback', stratFailures },
    })
    console.error('[g] FALLO: read-back estratificado')
    for (const f of stratFailures) console.error(`  - ${f}`)
    process.exitCode = 1
    return
  }
  console.log(`[g] read-back estratificado OK: ${stratChecked.length} objetos (9 municipios + 3 territorios)`)

  await updateAudit(supabase, auditId, {
    fin: new Date().toISOString(),
    registros_leidos: items.length,
    registros_actualizados: uploaded,
    registros_con_error: 0,
    metadata: {
      ...baseMetadata,
      phase: 'completo',
      stratChecked: stratChecked.length,
      durationMs: Date.now() - started,
    },
  })

  console.log('')
  console.log(`Publicación completa: ${uploaded} objetos · ${formatBytes(manifest.counts.bytesTotal)} · ${formatMs(Date.now() - started)}`)
  console.log(`Backup: ${formatBytes(backupBytes)} · auditoría data_sync_runs id=${auditId}`)
}

main().catch((error: unknown) => {
  console.error(`ERROR ${error instanceof Error ? error.message : 'desconocido'}`)
  process.exitCode = 1
})
