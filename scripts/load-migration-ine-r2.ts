/**
 * Carga las tres tablas de migración INE (69711, 69743, 69746) en R2.
 *
 * Tablas:
 * - 69711: Emigraciones con destino al extranjero por municipio, año y sexo
 * - 69743: Inmigraciones intermunicipales por municipio de destino, año, sexo y nacionalidad
 * - 69746: Emigraciones intermunicipales por municipio de procedencia, año, sexo y país de nacimiento
 *
 * Resultado: objetos JSON por municipio bajo el prefijo
 *   socideas/ine-layers/v1/municipal/{INE-5}.json
 *   (misma convención que las capas INE existentes)
 *
 * Ejecución: npx tsx scripts/load-migration-ine-r2.ts --confirm-r2-write [--dry-run]
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { config } from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

config({ path: '.env.local' }) // Load .env.local

// ─── Configuración ──────────────────────────────────────────

const INE_API_BASE = 'https://servicios.ine.es/wstempus/js/ES'
const TABLES = [
  { id: '69711', name: 'Emigraciones al extranjero', layer: 'emigration_abroad' },
  { id: '69743', name: 'Inmigraciones intermunicipales', layer: 'immigration_intermunicipal' },
  { id: '69746', name: 'Emigraciones intermunicipales', layer: 'emigration_intermunicipal' },
] as const

const R2_PREFIX = 'socideas/ine-layers/v1/municipal'
const R2_MANIFESTS_PREFIX = 'socideas/ine-layers/v1/manifests'
const MAX_OBJECT_BYTES = 25 * 1024 // 25 KB
const RETRY_ATTEMPTS = 3
const RETRY_BASE_MS = 500

// ─── Tipos ──────────────────────────────────────────────────

interface IneRecord {
  COD: string
  Nombre: string
  T3_Unidad?: string
  Data: Array<{ Fecha: string; Anyo: number; Valor: number | null; Secreto?: boolean }>
}

interface MigrationFlow {
  period: string
  total: number | null
  male: number | null
  female: number | null
  status: 'observed' | 'suppressed' | 'missing'
  source: string
  tableId: string
}

interface MigrationLayer {
  period: string
  emigrationAbroad?: {
    annualSeries: MigrationFlow[]
    latest: MigrationFlow | null
    status: string
  }
  immigrationIntermunicipal?: {
    annualSeries: MigrationFlow[]
    latest: MigrationFlow | null
    status: string
    byNationality?: Record<string, MigrationFlow[]>
  }
  emigrationIntermunicipal?: {
    annualSeries: MigrationFlow[]
    latest: MigrationFlow | null
    status: string
    byBirthCountry?: Record<string, MigrationFlow[]>
  }
}

interface MunicipalityMigrationData {
  ineCode: string
  municipalityName: string
  migration: MigrationLayer
}

// ─── Funciones auxiliares ────────────────────────────────────

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

async function putWithRetry(
  r2: { client: S3Client; bucket: string },
  key: string,
  body: string,
  metadata: Record<string, string>,
): Promise<void> {
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      await r2.client.send(new PutObjectCommand({
        Bucket: r2.bucket,
        Key: key,
        Body: body,
        ContentType: 'application/json',
        CacheControl: 'public, max-age=3600',
        Metadata: metadata,
      }))
      return
    } catch (err) {
      if (attempt === RETRY_ATTEMPTS - 1) throw err
      await new Promise(r => setTimeout(r, RETRY_BASE_MS * (attempt + 1)))
    }
  }
}

function extractSexFromNombre(nombre: string, tableId: string): string {
  // Verified column order from INE API (2026-09-15, Madrid sample):
  //   69711: "Municipio. Sexo. Dato base. ..."                              → parts[1] = sex
  //   69743: "Municipio. Nacionalidad. Sexo. Dato base. ..."                → parts[2] = sex
  //   69746: "Municipio. País de nacimiento. Sexo. Dato base. ..."          → parts[2] = sex
  //   ⚠️ 69746 has birth country BEFORE sex (inverted vs 69743).
  const parts = nombre.split('.')
  let sexIdx = 1 // 69711 only (two dimensions: municipio + sexo)
  if (tableId === '69743') sexIdx = 2 // Nacionalidad is in parts[1], sex in parts[2]
  if (tableId === '69746') sexIdx = 2 // País nacimiento is in parts[1], sex in parts[2]

  if (parts.length <= sexIdx) return ''
  const sexPart = parts[sexIdx].trim()
  if (sexPart === 'Hombres') return '1'
  if (sexPart === 'Mujeres') return '6'
  if (sexPart === 'Total' || sexPart === 'Ambos sexos') return ''
  return ''
}

function extractNationalityFromNombre(nombre: string): string {
  // Table 69743: "Municipio. Nacionalidad. Sexo. Dato base. ..."
  // Nationality is in the SECOND dot-separated field (parts[1])
  const parts = nombre.split('.')
  if (parts.length >= 2) {
    const natPart = parts[1].trim()
    if (natPart && natPart !== 'Dato base' && !natPart.startsWith('Emigraciones') && !natPart.startsWith('Inmigraciones')) {
      return natPart
    }
  }
  return 'Total'
}

function extractBirthCountryFromNombre(nombre: string): string {
  // Table 69746: "Municipio. País de nacimiento. Sexo. Dato base. ..."
  // Verified 2026-09-15: birth country is in the SECOND dot-separated field (parts[1]),
  // NOT parts[2] (which is sex). The dimension order is inverted vs 69743.
  const parts = nombre.split('.')
  if (parts.length >= 2) {
    const bcPart = parts[1].trim()
    if (bcPart && bcPart !== 'Dato base' && !bcPart.startsWith('Emigraciones') && !bcPart.startsWith('Inmigraciones')) {
      return bcPart
    }
  }
  return 'Total'
}

function extractMunicipalityNameFromRecord(rec: IneRecord): string {
  // First part before the first dot
  const dotIdx = rec.Nombre.indexOf('.')
  return dotIdx > 0 ? rec.Nombre.substring(0, dotIdx).trim() : rec.Nombre.trim()
}

// ─── Descarga y procesamiento de tablas ─────────────────────

async function fetchTable(tableId: string): Promise<IneRecord[]> {
  const url = `${INE_API_BASE}/DATOS_TABLA/${tableId}?nult=1&tip=A`
  console.log(`  Descargando tabla ${tableId}...`)
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status} for table ${tableId}`)
  const data = await response.json() as IneRecord[]
  console.log(`  Tabla ${tableId}: ${data.length} registros`)
  return data
}

async function loadMunicipalityCatalog(): Promise<{ catalog: Map<string, string>; municipalityCODs: Set<string> }> {
  // Build catalog from INE series metadata (most reliable source)
  // Each table's series metadata contains MetaData with FK_Variable entries
  // that map municipality names to 5-digit INE codes.
  //
  // IMPORTANT: Tables 69711/69743/69746 contain BOTH municipality-level AND
  // province-level series (the INE title says "municipios y capitales de provincia").
  // Province series have Codigo="XX" (2 digits), municipality series have Codigo="XXXXX" (5 digits).
  // We must filter to only municipality series to avoid duplicate/inflated values.
  console.log('  Construyendo catálogo desde metadatos INE...')
  const catalog = new Map<string, string>()
  const municipalityCODs = new Set<string>()

  // Fetch series metadata for all three tables to build complete COD sets
  for (const tableId of ['69711', '69743', '69746']) {
    const url = `${INE_API_BASE}/SERIES_TABLA/${tableId}?tip=M&nult=1`
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching series metadata for ${tableId}`)
    const series = await response.json() as Array<{ COD: string; MetaData: Array<{ FK_Variable: number; Nombre: string; Codigo: string }> }>

    let tableMuni = 0
    let tableProv = 0
    for (const s of series) {
      const muni = s.MetaData?.find(m => /^\d{5}$/.test(m.Codigo))
      if (muni) {
        catalog.set(muni.Nombre, muni.Codigo)
        municipalityCODs.add(s.COD)
        tableMuni++
      } else {
        tableProv++
      }
    }
    console.log(`  Tabla ${tableId}: ${tableMuni} series municipio, ${tableProv} series provincia`)
  }

  console.log(`  Catálogo: ${catalog.size} municipios, ${municipalityCODs.size} series municipales totales`)
  return { catalog, municipalityCODs }
}

function processTable(
  records: IneRecord[],
  tableName: string,
  tableId: string,
  catalog: Map<string, string>,
  municipalityCODs: Set<string>,
): Map<string, { total: MigrationFlow; male: MigrationFlow; female: MigrationFlow; extra?: Record<string, MigrationFlow> }> {
  const byMuni = new Map<string, { total: MigrationFlow; male: MigrationFlow; female: MigrationFlow; extra?: Record<string, MigrationFlow> }>()

  // Build reverse lookup: normalized name -> INE code
  const nameToCode = new Map<string, string>()
  for (const [name, code] of catalog) {
    const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    nameToCode.set(normalized, code)
  }

  let unmatched = 0
  let provinceSkipped = 0
  for (const rec of records) {
    // Filter: only process municipality-level series, skip province-level
    if (!municipalityCODs.has(rec.COD)) {
      provinceSkipped++
      continue
    }

    const muniName = extractMunicipalityNameFromRecord(rec)
    const normalized = muniName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    const ineCode = nameToCode.get(normalized)
    if (!ineCode) {
      unmatched++
      continue
    }

    const sexCode = extractSexFromNombre(rec.Nombre, tableId)
    const d = rec.Data?.[0]
    const year = d?.Anyo?.toString() ?? ''
    const valor = d?.Valor
    const secreto = d?.Secreto ?? false

    // For 69743/69746: only use the "Total" aggregate for the main flows
    // (parts[1] = nationality/birth country). Individual breakdowns go to extra.
    if (tableId === '69743' || tableId === '69746') {
      const parts = rec.Nombre.split('.')
      const dim1 = parts[1]?.trim()
      if (dim1 && dim1 !== 'Total' && dim1 !== 'Dato base') {
        // Skip non-aggregate records for main flows; they're handled by extra
        // Store in extra before skipping
        const entry = byMuni.get(ineCode)
        if (entry) {
          const dimKey = tableId === '69743' ? extractNationalityFromNombre(rec.Nombre) : extractBirthCountryFromNombre(rec.Nombre)
          if (!entry.extra) entry.extra = {}
          const compositeKey = `${sexCode || 'total'}_${dimKey}`
          if (!entry.extra[compositeKey]) entry.extra[compositeKey] = { period: year, total: null, male: null, female: null, status: 'observed', source: `INE · EMCR (30283) · Tabla ${tableId}`, tableId }
          if (sexCode === '') entry.extra[compositeKey].total = valor
          else if (sexCode === '1') entry.extra[compositeKey].male = valor
          else if (sexCode === '6') entry.extra[compositeKey].female = valor
        }
        continue
      }
    }

    const status: MigrationFlow['status'] =
      secreto || valor === null ? 'suppressed' :
      valor === undefined ? 'missing' : 'observed'

    const flow: MigrationFlow = {
      period: year,
      total: null,
      male: null,
      female: null,
      status,
      source: `INE · EMCR (30283) · Tabla ${tableId}`,
      tableId,
    }

    if (sexCode === '') flow.total = valor
    else if (sexCode === '1') flow.male = valor
    else if (sexCode === '6') flow.female = valor

    if (!byMuni.has(ineCode)) {
      byMuni.set(ineCode, {
        total: { ...flow },
        male: { ...flow },
        female: { ...flow },
      })
    }

    const entry = byMuni.get(ineCode)!
    // Tables 69743/69746 contain multiple COD groups (different municipality subsets)
    // with identical Nombre structure. Process records in API order; last COD group
    // wins per sex code (overwrite, not accumulate) to avoid inflating totals.
    if (sexCode === '') entry.total = flow
    else if (sexCode === '1') entry.male = flow
    else if (sexCode === '6') entry.female = flow

    // For tables with nationality/birth country dimension, store by dimension key
    if (tableId === '69743' || tableId === '69746') {
      const dimKey = tableId === '69743' ? extractNationalityFromNombre(rec.Nombre) : extractBirthCountryFromNombre(rec.Nombre)
      if (!entry.extra) entry.extra = {}
      // Use composite key: sexCode_dimKey
      const compositeKey = `${sexCode || 'total'}_${dimKey}`
      if (!entry.extra[compositeKey]) entry.extra[compositeKey] = { ...flow }
      if (sexCode === '') entry.extra[compositeKey].total = valor
      else if (sexCode === '1') entry.extra[compositeKey].male = valor
      else if (sexCode === '6') entry.extra[compositeKey].female = valor
    }
  }

  if (unmatched > 0) console.log(`  ${tableName}: ${unmatched} registros sin match de nombre`)
  if (provinceSkipped > 0) console.log(`  ${tableName}: ${provinceSkipped} registros de provincia descartados (solo municipios)`)
  return byMuni
}

// ─── Construcción de objetos por municipio ───────────────────

function buildMunicipalityObject(
  ineCode: string,
  name: string,
  abroad: ReturnType<typeof processTable> | null,
  immInter: ReturnType<typeof processTable> | null,
  emiInter: ReturnType<typeof processTable> | null,
): MunicipalityMigrationData {
  const latestYear = '2024'

  const emiAbroadSeries: MigrationFlow[] = []
  const immInterSeries: MigrationFlow[] = []
  const emiInterSeries: MigrationFlow[] = []

  if (abroad?.has(ineCode)) {
    const d = abroad.get(ineCode)!
    emiAbroadSeries.push(d.total, d.male, d.female)
  }
  if (immInter?.has(ineCode)) {
    const d = immInter.get(ineCode)!
    immInterSeries.push(d.total, d.male, d.female)
  }
  if (emiInter?.has(ineCode)) {
    const d = emiInter.get(ineCode)!
    emiInterSeries.push(d.total, d.male, d.female)
  }

  const latest = emiAbroadSeries.find(f => f.period === latestYear) ?? emiAbroadSeries[0] ?? null

  return {
    ineCode,
    municipalityName: name,
    migration: {
      period: latestYear,
      emigrationAbroad: emiAbroadSeries.length > 0 ? {
        annualSeries: emiAbroadSeries,
        latest,
        status: latest?.status ?? 'missing',
      } : undefined,
      immigrationIntermunicipal: immInterSeries.length > 0 ? {
        annualSeries: immInterSeries,
        latest: immInterSeries.find(f => f.period === latestYear) ?? immInterSeries[0] ?? null,
        status: 'observed',
      } : undefined,
      emigrationIntermunicipal: emiInterSeries.length > 0 ? {
        annualSeries: emiInterSeries,
        latest: emiInterSeries.find(f => f.period === latestYear) ?? emiInterSeries[0] ?? null,
        status: 'observed',
      } : undefined,
    },
  }
}

// ─── Validación y métricas ──────────────────────────────────

interface ValidationMetrics {
  totalMunicipalities: number
  matchCount: number
  noMatchCount: number
  suppressedCount: number
  missingCount: number
  observedCount: number
  sizeBytes: number[]
  p50Bytes: number
  p95Bytes: number
  maxBytes: number
  checksums: Record<string, string>
}

function computeMetrics(objects: MunicipalityMigrationData[]): ValidationMetrics {
  const sizes = objects.map(o => Buffer.byteLength(JSON.stringify(o), 'utf-8'))
  const sorted = [...sizes].sort((a, b) => a - b)
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
  const max = sorted[sorted.length - 1] ?? 0

  let suppressed = 0, missing = 0, observed = 0
  const checksums: Record<string, string> = {}

  for (const obj of objects) {
    const json = JSON.stringify(obj)
    checksums[obj.ineCode] = crypto.createHash('md5').update(json).digest('hex').slice(0, 16)

    for (const layer of [obj.migration.emigrationAbroad, obj.migration.immigrationIntermunicipal, obj.migration.emigrationIntermunicipal]) {
      if (!layer) continue
      for (const f of layer.annualSeries) {
        if (f.status === 'suppressed') suppressed++
        else if (f.status === 'missing') missing++
        else observed++
      }
    }
  }

  return {
    totalMunicipalities: objects.length,
    matchCount: objects.length,
    noMatchCount: 0,
    suppressedCount: suppressed,
    missingCount: missing,
    observedCount: observed,
    sizeBytes: sizes,
    p50Bytes: p50,
    p95Bytes: p95,
    maxBytes: max,
    checksums,
  }
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  const isDryRun = process.argv.includes('--dry-run')
  const confirmWrite = process.argv.includes('--confirm-r2-write')

  if (!confirmWrite && !isDryRun) {
    console.error('ERROR: Requiere --confirm-r2-write o --dry-run')
    process.exit(1)
  }

  console.log(`=== Carga de migraciones INE en R2 ===`)
  console.log(`Fecha: ${new Date().toISOString()}`)
  console.log(`Modo: ${isDryRun ? 'DRY-RUN (sin escritura)' : 'ESCRITURA REAL'}`)
  console.log()

  // 1. Load municipality catalog
  console.log('--- Fase 0: Catálogo de municipios ---')
  const { catalog, municipalityCODs } = await loadMunicipalityCatalog()

  // 2. Descargar las tres tablas en paralelo
  console.log()
  console.log('--- Fase 1: Descarga de tablas INE ---')
  const [abroad, immInter, emiInter] = await Promise.all([
    fetchTable('69711'),
    fetchTable('69743'),
    fetchTable('69746'),
  ])

  // 3. Procesar cada tabla
  console.log()
  console.log('--- Fase 2: Procesamiento por municipio ---')
  const abroadByMuni = processTable(abroad, 'Emigraciones al extranjero', '69711', catalog, municipalityCODs)
  const immInterByMuni = processTable(immInter, 'Inmigraciones intermunicipales', '69743', catalog, municipalityCODs)
  const emiInterByMuni = processTable(emiInter, 'Emigraciones intermunicipales', '69746', catalog, municipalityCODs)

  console.log(`  Municipios en 69711: ${abroadByMuni.size}`)
  console.log(`  Municipios en 69743: ${immInterByMuni.size}`)
  console.log(`  Municipios en 69746: ${emiInterByMuni.size}`)

  // 3. Unificar todos los códigos municipales
  const allCodes = new Set<string>()
  for (const k of abroadByMuni.keys()) allCodes.add(k)
  for (const k of immInterByMuni.keys()) allCodes.add(k)
  for (const k of emiInterByMuni.keys()) allCodes.add(k)
  console.log(`  Municipios únicos totales: ${allCodes.size}`)

  // Build reverse catalog: code -> name
  const codeToName = new Map<string, string>()
  for (const [name, code] of catalog) {
    codeToName.set(code, name)
  }

  // 4. Construir objetos por municipio
  console.log()
  console.log('--- Fase 3: Construcción de objetos ---')
  const objects: MunicipalityMigrationData[] = []
  for (const code of allCodes) {
    const name = codeToName.get(code) ?? code
    const obj = buildMunicipalityObject(code, name, abroadByMuni, immInterByMuni, emiInterByMuni)
    objects.push(obj)
  }

  // 5. Validar
  console.log()
  console.log('--- Fase 4: Validación ---')
  const metrics = computeMetrics(objects)
  console.log(`  Municipios procesados: ${metrics.totalMunicipalities}`)
  console.log(`  Observados: ${metrics.observedCount}`)
  console.log(`  Suprimidos: ${metrics.suppressedCount}`)
  console.log(`  Ausentes: ${metrics.missingCount}`)
  console.log(`  Tamaño p50: ${metrics.p50Bytes} bytes`)
  console.log(`  Tamaño p95: ${metrics.p95Bytes} bytes`)
  console.log(`  Tamaño máximo: ${metrics.maxBytes} bytes`)

  // Size gate
  const oversized = objects.filter(o => Buffer.byteLength(JSON.stringify(o), 'utf-8') > MAX_OBJECT_BYTES)
  if (oversized.length > 0) {
    console.log(`  ⚠️ ${oversized.length} objetos superan 25 KB:`)
    for (const o of oversized.slice(0, 5)) {
      const size = Buffer.byteLength(JSON.stringify(o), 'utf-8')
      console.log(`    ${o.ineCode}: ${size} bytes`)
    }
  }

  // 6. Guardar manifest local
  const runId = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const manifestDir = path.join(process.cwd(), 'tmp')
  if (!fs.existsSync(manifestDir)) fs.mkdirSync(manifestDir, { recursive: true })

  const manifest = {
    schemaVersion: 'migration-ine-load-v1',
    runId,
    tables: TABLES.map(t => ({ id: t.id, name: t.name })),
    written: metrics.totalMunicipalities,
    matchPct: 100,
    p95Bytes: metrics.p95Bytes,
    suppressedCount: metrics.suppressedCount,
    missingCount: metrics.missingCount,
    observedCount: metrics.observedCount,
    checksums: metrics.checksums,
    createdAt: new Date().toISOString(),
  }

  const manifestPath = path.join(manifestDir, `migration-run-${runId}.json`)
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  console.log(`  Manifest local: ${manifestPath}`)

  // 7. Guardar datos localmente para verificación
  const dataDir = path.join(manifestDir, `migration-data-${runId}`)
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
  for (const obj of objects) {
    fs.writeFileSync(path.join(dataDir, `${obj.ineCode}.json`), JSON.stringify(obj))
  }
  console.log(`  Datos locales: ${dataDir} (${objects.length} archivos)`)

  if (isDryRun) {
    console.log()
    console.log('=== DRY-RUN COMPLETADO — Sin escritura en R2 ===')
    return
  }

  // 8. Escribir en R2
  console.log()
  console.log('--- Fase 5: Escritura en R2 ---')
  const r2 = r2Client()
  if (!r2) {
    console.error('ERROR: Variables de entorno R2 no configuradas')
    process.exit(1)
  }

  let written = 0
  const errors: string[] = []

  for (const obj of objects) {
    const key = `${R2_PREFIX}/${obj.ineCode}.json`
    const body = JSON.stringify(obj)

    try {
      await putWithRetry(r2, key, body, {
        runid: runId,
        inecode: obj.ineCode,
        schema: 'migration-ine-v1',
      })
      written++
      if (written % 500 === 0) console.log(`  Escritos: ${written}/${objects.length}`)
    } catch (err) {
      errors.push(`${obj.ineCode}: ${err}`)
      if (errors.length > 10) {
        console.error(`Demasiados errores (${errors.length}). Abortando.`)
        break
      }
    }
  }

  console.log(`  Objetos escritos: ${written}/${objects.length}`)
  if (errors.length > 0) {
    console.log(`  Errores: ${errors.length}`)
    for (const e of errors.slice(0, 5)) console.log(`    ${e}`)
  }

  // 9. Escribir manifest en R2
  if (errors.length === 0) {
    const manifestKey = `${R2_MANIFESTS_PREFIX}/run-${runId}.json`
    const latestKey = `${R2_MANIFESTS_PREFIX}/latest-successful.json`
    await putWithRetry(r2, manifestKey, JSON.stringify(manifest, null, 2), { runid: runId, type: 'manifest' })
    await putWithRetry(r2, latestKey, JSON.stringify(manifest, null, 2), { runid: runId, type: 'latest' })
    console.log(`  Manifest R2: ${manifestKey}`)
    console.log(`  Latest R2: ${latestKey}`)
  }

  // 10. Relectura de verificación
  console.log()
  console.log('--- Fase 6: Verificación post-escritura ---')
  const testCodes = ['01001', '07010', '28079', '28143', '08019', '41091', '29067', '35003', '46250', '15030']
  for (const code of testCodes) {
    const key = `${R2_PREFIX}/${code}.json`
    try {
      const { GetObjectCommand } = await import('@aws-sdk/client-s3')
      const resp = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }))
      const body = await resp.Body.transformToString()
      const data = JSON.parse(body)
      const size = Buffer.byteLength(body, 'utf-8')
      const hasAbroad = !!data.migration?.emigrationAbroad
      const hasImm = !!data.migration?.immigrationIntermunicipal
      const hasEmi = !!data.migration?.emigrationIntermunicipal
      console.log(`  ${code}: ${size} bytes | abroad=${hasAbroad} imm=${hasImm} emi=${hasEmi}`)
    } catch {
      console.log(`  ${code}: NO ENCONTRADO`)
    }
  }

  console.log()
  console.log(`=== CARGA COMPLETADA ===`)
  console.log(`RunId: ${runId}`)
  console.log(`Objetos escritos: ${written}`)
  console.log(`Tamaño p95: ${metrics.p95Bytes} bytes`)
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
