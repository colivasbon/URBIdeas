/**
 * Carga "Nivel de estudios · Censo de Población y Viviendas 2021" (INE PC-Axis
 * tpx=55249) en la capa lateral INE (layers.education) — bloque de Contexto
 * Sociocultural.
 *
 * Fuente (verificada en vivo 2026-09-21):
 *   https://www.ine.es/jaxi/files/tpx/es/csv_bd/55249.csv  (CSV nacional, ~44 MB)
 *   Tabla PC-Axis: "Población por sexo, nacionalidad(española/extranjera) y
 *   nivel de estudios (agregado)" · Censo 2021 · Resultados municipales.
 *
 * CLAVE TERRITORIAL: código INE de 5 dígitos como prefijo de la columna
 * "Municipios" ("02001 Abengibre"). NUNCA join por nombre. Filas sin prefijo
 * INE-5 o fuera del catálogo se descartan.
 *
 * AÑO: 2021 (estructural censal, NO anual).
 *
 * Seguridad: merge por capa (preserva demografía, flujos, saldos, agrario, …),
 * ausencia/secreto → value null (jamás 0), tamaño por objeto < 150 KB.
 *
 * Uso:
 *   npx tsx scripts/load-education-censo-2021.ts --dry-run
 *   npx tsx scripts/load-education-censo-2021.ts --confirm-r2-write [--force]
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { config } from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

config({ path: '.env.local' })

const CSV_URL = 'https://www.ine.es/jaxi/files/tpx/es/csv_bd/55249.csv'
const TABLE_ID = '55249'
const CENSUS_YEAR = 2021
const PERIOD = '2021'
const SOURCE = 'INE · Censo de Población y Viviendas 2021 · Tabla 55249 (PC-Axis)'

const R2_PREFIX = 'socideas/ine-layers/v1/municipal'
const MAX_OBJECT_BYTES = 150 * 1024
const RETRY_ATTEMPTS = 3
const RETRY_BASE_MS = 500
const CONCURRENCY = 25

type Status = 'observed' | 'suppressed' | 'missing' | 'partial'

interface IneValue {
  value: number | null
  unit: 'personas'
  status: Status
  source: string
  tableId: string
  period: string
  derived: false
}

interface EducationDistribution {
  primaryOrBelow: IneValue
  lowerSecondary: IneValue
  upperSecondaryPostSecondary: IneValue
  higher: IneValue
  notApplicableUnder15: IneValue
}

interface EducationLayer {
  period: string
  censusYear: 2021
  total?: EducationDistribution
  bySex?: { male: EducationDistribution; female: EducationDistribution }
  status: 'observed' | 'partial' | 'missing'
}

// Categorías canónicas del Censo 2021 (texto real del CSV).
const CAT = {
  primaryOrBelow: 'Educación primaria e inferior',
  lowerSecondary: 'Primera etapa de Educación Secundaria y similar',
  upperSecondaryPostSecondary: 'Segunda etapa de Educación Secundaria y Educación Postsecundaria no Superior',
  higher: 'Educación Superior',
  notApplicableUnder15: 'No aplicable (menor de 15 años)',
} as const
type CatKey = keyof typeof CAT

function mkValue(v: number | null, seco: boolean, status: Status): IneValue {
  return {
    value: seco || v === null || !Number.isFinite(v) ? null : v,
    unit: 'personas',
    status: seco || v === null || !Number.isFinite(v) ? 'suppressed' : status,
    source: SOURCE,
    tableId: TABLE_ID,
    period: PERIOD,
    derived: false,
  }
}

function mkDist(): EducationDistribution {
  return {
    primaryOrBelow: mkValue(null, false, 'missing'),
    lowerSecondary: mkValue(null, false, 'missing'),
    upperSecondaryPostSecondary: mkValue(null, false, 'missing'),
    higher: mkValue(null, false, 'missing'),
    notApplicableUnder15: mkValue(null, false, 'missing'),
  }
}

function catOf(text: string): CatKey | null {
  for (const [k, v] of Object.entries(CAT)) if (text === v) return k as CatKey
  return null
}

function sexoOf(text: string): 'total' | 'male' | 'female' | null {
  if (text === 'Hombres') return 'male'
  if (text === 'Mujeres') return 'female'
  if (text === 'Ambos sexos') return 'total'
  return null
}

/** Parsea "47,400,798" (miles con coma, sin decimales en personas) o ND/SECRETO. */
function parsePersonas(raw: string): { v: number | null; seco: boolean } {
  const s = raw.trim()
  if (s === '' || /^\.+$/.test(s) || s.toUpperCase() === 'ND') return { v: null, seco: true }
  const clean = s.replace(/\./g, '').replace(/,/g, '')
  if (!/^-?\d+$/.test(clean)) return { v: null, seco: true }
  return { v: parseInt(clean, 10), seco: false }
}

interface RawCell {
  v: number | null
  seco: boolean
}

async function downloadCsv(): Promise<{ text: string; bytes: number; sha256: string }> {
  // Caché local: solo se descarga una vez (45 MB); después se reutiliza.
  const cachePath = path.join(process.cwd(), 'tmp', 'ine-55249-censo2021.csv')
  if (fs.existsSync(cachePath)) {
    const buf = fs.readFileSync(cachePath)
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex')
    console.log(`  CSV desde caché local: ${buf.length} bytes · sha256 ${sha256.slice(0, 16)}…`)
    return { text: buf.toString('utf8').replace(/^﻿/, ''), bytes: buf.length, sha256 }
  }
  let lastErr: unknown
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      console.log(`  Descargando ${CSV_URL} (intento ${attempt}/4) …`)
      const res = await fetch(CSV_URL, { signal: AbortSignal.timeout(600_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${CSV_URL}`)
      const buf = Buffer.from(await res.arrayBuffer())
      fs.mkdirSync(path.dirname(cachePath), { recursive: true })
      fs.writeFileSync(cachePath, buf)
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex')
      console.log(`  CSV: ${buf.length} bytes · sha256 ${sha256.slice(0, 16)}…`)
      return { text: buf.toString('utf8').replace(/^﻿/, ''), bytes: buf.length, sha256 }
    } catch (e) {
      lastErr = e
      console.log(`  Fallo intento ${attempt}: ${(e as Error).message} — esperando…`)
      await new Promise((r) => setTimeout(r, 8000 * attempt))
    }
  }
  throw lastErr
}

/**
 * Agrupa el CSV largo en: ine5 → sexo → categoría → celda.
 * Devuelve también el catálogo de códigos detectados y las filas descartadas.
 */
function parseEducation(
  text: string,
): { byIne: Map<string, Map<string, Map<string, RawCell>>>; ineCodes: Set<string>; discarded: number } {
  const lines = text.split(/\r?\n/)
  const header = (lines[0] ?? '').split('\t').map((h) => h.trim())
  const iNac = header.indexOf('Nacionalidad (española/extranjera)')
  const iMuni = header.indexOf('Municipios')
  const iSexo = header.indexOf('Sexo')
  const iNivel = header.indexOf('Nivel de estudios (grado)')
  const iVal = header.length - 1
  if (iMuni < 0 || iSexo < 0 || iNivel < 0) {
    throw new Error(`Cabecera PC-Axis inesperada: ${header.join(' | ')}`)
  }
  console.log(`  Cabecera: Nac=${iNac} Mun=${iMuni} Sexo=${iSexo} Nivel=${iNivel} Valor=${iVal}`)

  const byIne = new Map<string, Map<string, Map<string, RawCell>>>()
  const ineCodes = new Set<string>()
  let discarded = 0
  let skippedNac = 0

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const cols = line.split('\t')
    if (cols.length < header.length) continue
    // SOLO la nacionalidad agregada (TOTAL): no mezclar Española/Extranjera.
    if (iNac >= 0 && cols[iNac]?.trim() !== 'TOTAL') { skippedNac++; continue }
    const m = /^(\d{5})\s+\S/.exec(cols[iMuni] ?? '')
    if (!m) { discarded++; continue }
    const ine = m[1]
    const sexo = sexoOf(cols[iSexo]?.trim() ?? '')
    if (!sexo) { discarded++; continue }
    const cat = catOf(cols[iNivel]?.trim() ?? '')
    if (!cat) continue
    const cell = parsePersonas(cols[iVal] ?? '')
    ineCodes.add(ine)
    if (!byIne.has(ine)) byIne.set(ine, new Map())
    const bySex = byIne.get(ine)!
    if (!bySex.has(sexo)) bySex.set(sexo, new Map())
    bySex.get(sexo)!.set(cat, cell)
  }
  console.log(`  Filas con Nacionalidad ≠ TOTAL descartadas: ${skippedNac}`)
  return { byIne, ineCodes, discarded }
}

function buildDistribution(m: Map<string, RawCell> | undefined): EducationDistribution {
  const d = mkDist()
  if (!m) return d
  for (const [cat, cell] of m) {
    d[cat] = mkValue(cell.v, cell.seco, cell.v === null ? 'suppressed' : 'observed')
  }
  return d
}

function buildEducationLayer(
  bySex: Map<string, Map<string, RawCell>>,
): EducationLayer {
  const total = buildDistribution(bySex.get('total'))
  const male = buildDistribution(bySex.get('male'))
  const female = buildDistribution(bySex.get('female'))
  const any = (dist: EducationDistribution) => Object.values(dist).some((x) => x.value !== null)
  const status = any(total) ? 'observed' : any(male) || any(female) ? 'partial' : 'missing'
  return { period: PERIOD, censusYear: 2021, total, bySex: { male, female }, status }
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

async function putWithRetry(r2: { client: S3Client; bucket: string }, key: string, body: string, metadata: Record<string, string>): Promise<void> {
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      await r2.client.send(new PutObjectCommand({
        Bucket: r2.bucket, Key: key, Body: body,
        ContentType: 'application/json', CacheControl: 'public, max-age=3600', Metadata: metadata,
      }))
      return
    } catch (err) {
      if (attempt === RETRY_ATTEMPTS - 1) throw err
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * (attempt + 1)))
    }
  }
}

async function getExisting(r2: { client: S3Client; bucket: string }, key: string): Promise<{ found: boolean; data?: Record<string, unknown> }> {
  try {
    const resp = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }))
    const body = await resp.Body!.transformToString()
    return { found: true, data: JSON.parse(body) as Record<string, unknown> }
  } catch (e) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } }
    if (err?.name === 'NoSuchKey' || err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404) return { found: false }
    throw e
  }
}

const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const confirmWrite = args.includes('--confirm-r2-write')
const force = args.includes('--force')

const FIXTURES = ['28079', '02003', '28174', '15030', '41091', '31001', '01001']

async function main() {
  console.log('=== Educación · Censo 2021 (PC-Axis 55249) → layers.education ===')
  console.log(`Modo: ${isDryRun ? 'DRY-RUN' : confirmWrite ? 'ESCRITURA R2' : 'REVISIÓN (sin flag)'}`)
  if (!isDryRun && !confirmWrite) { console.error('Falta --dry-run o --confirm-r2-write'); process.exit(1) }

  const { text, bytes, sha256 } = await downloadCsv()
  const { byIne, ineCodes, discarded } = parseEducation(text)
  console.log(`  Municipios INE-5 detectados: ${ineCodes.size} · filas descartadas sin INE: ${discarded}`)

  // Construir capas
  const layers = new Map<string, EducationLayer>()
  for (const [ine, bySex] of byIne) layers.set(ine, buildEducationLayer(bySex))
  console.log(`  Capas education construidas: ${layers.size}`)

  // Validaciones de identidad sobre TODA la muestra (total = H+M por categoría)
  const catKeys = Object.keys(CAT) as CatKey[]
  let checked = 0, okCount = 0, fail = 0
  const failEx: string[] = []
  for (const [ine, layer] of layers) {
    if (!layer.total || !layer.bySex) continue
    for (const ck of catKeys) {
      const t = layer.total[ck].value
      const m = layer.bySex.male[ck].value
      const f = layer.bySex.female[ck].value
      if (t !== null && m !== null && f !== null) {
        checked++
        if (t === m + f) okCount++
        else { fail++; if (failEx.length < 5) failEx.push(`${ine}/${ck}: ${t}≠${m}+${f}`) }
      }
    }
  }
  console.log(`  Identidad total = H+M (por categoría): ${okCount}/${checked} OK (${fail} fallos)` + (failEx.length ? ` · ej: ${failEx.join(' | ')}` : ''))

  // ND nunca como 0: comprobar que no hay ceros con estado suppressed
  let zeroBugs = 0
  for (const layer of layers.values()) {
    for (const dist of [layer.total, layer.bySex?.male, layer.bySex?.female]) {
      if (!dist) continue
      for (const v of Object.values(dist)) {
        if (v.status === 'suppressed' && v.value !== null) zeroBugs++
      }
    }
  }
  console.log(`  ND/secreto como número (debe ser 0): ${zeroBugs}`)

  // Fixtures
  console.log('  --- Fixtures ---')
  for (const c of FIXTURES) {
    const l = layers.get(c)
    if (!l?.total) { console.log(`    ${c}: SIN DATOS`); continue }
    const p = l.total.primaryOrBelow.value, h = l.total.higher.value, na = l.total.notApplicableUnder15.value
    console.log(`    ${c}: primaria=${p} superior=${h} NA<15=${na} | status=${l.status} | censusYear=${l.censusYear}`)
  }

  // Tamaños
  const sizes = [...layers.values()].map((L) => Buffer.byteLength(JSON.stringify(L), 'utf-8')).sort((a, b) => a - b)
  const p95 = sizes[Math.floor(sizes.length * 0.95)] ?? 0
  const max = sizes[sizes.length - 1] ?? 0
  console.log(`  Tamaño capa p95=${p95} max=${max}`)

  const runId = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const manifest = {
    schemaVersion: 'education-censo-2021-v1',
    runId, tableId: TABLE_ID, censusYear: CENSUS_YEAR, sourceUrl: CSV_URL,
    csvBytes: bytes, sha256, municipalities: layers.size, discardedRows: discarded,
    identityTotalEqualsHM: `${okCount}/${checked}`, zeroBugs, p95Bytes: p95, maxBytes: max,
    createdAt: new Date().toISOString(),
  }
  const manifestDir = path.join(process.cwd(), 'tmp')
  if (!fs.existsSync(manifestDir)) fs.mkdirSync(manifestDir, { recursive: true })
  fs.writeFileSync(path.join(manifestDir, `education-censo-2021-${runId}.json`), JSON.stringify(manifest, null, 2))
  console.log(`  Manifest: tmp/education-censo-2021-${runId}.json`)

  if (max > MAX_OBJECT_BYTES) { console.error(`ABORTA: ${max} > ${MAX_OBJECT_BYTES}`); process.exit(1) }
  if (isDryRun) { console.log('=== DRY-RUN COMPLETADO — sin escritura ==='); return }

  const r2 = r2Client()
  if (!r2) { console.error('ERROR: R2 no configurado'); process.exit(1) }
  console.log('--- Escritura R2 (merge por bloque) ---')
  let written = 0, skipped = 0
  const errors: string[] = []
  const entries = [...layers.entries()]
  let idx = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (idx < entries.length) {
      const [code, layer] = entries[idx++]
      const key = `${R2_PREFIX}/${code}.json`
      try {
        const ex = await getExisting(r2, key)
        if (!force) {
          const edu = (ex.data as { layers?: { education?: { censusYear?: number } } } | undefined)?.layers?.education
          if (edu && edu.censusYear === 2021) { skipped++; continue }
        }
        const existing: Record<string, unknown> = ex.found ? (ex.data as Record<string, unknown>) : {}
        const layersObj = (existing.layers ?? {}) as Record<string, unknown>
        layersObj.education = layer
        existing.schemaVersion = 'municipal-ine-layers-v1'
        existing.ineCode = code
        existing.municipalityName = (existing.municipalityName as string) || code
        existing.generatedAt = new Date().toISOString()
        existing.layers = layersObj
        existing.quality = (existing.quality as object) ?? { territoryMatch: 'exact', sourceChecksums: {}, validationStatus: 'partial' }
        await putWithRetry(r2, key, JSON.stringify(existing), { runid: runId, inecode: code, schema: 'municipal-ine-layers-v1', layer: 'education' })
        written++
        if (written % 500 === 0) console.log(`  Escritos: ${written}/${entries.length}`)
      } catch (err) { errors.push(`${code}: ${err}`) }
    }
  }))
  console.log(`  Escritos: ${written}/${entries.length} · saltados: ${skipped} · errores: ${errors.length}`)
  if (errors.length) console.error('  Primeros:', errors.slice(0, 5).join(' | '))

  console.log('--- Read-back ---')
  const { GetObjectCommand: GOC } = await import('@aws-sdk/client-s3')
  for (const code of FIXTURES.slice(0, 5)) {
    try {
      const resp = await r2.client.send(new GOC({ Bucket: r2.bucket, Key: `${R2_PREFIX}/${code}.json` }))
      const data = JSON.parse(await resp.Body!.transformToString())
      console.log(`  ${code}: education=${!!data.layers?.education} preserva migrationBalance=${!!data.layers?.migrationBalance} preserva migration=${!!(data.migration)} schema=${data.schemaVersion}`)
    } catch { console.log(`  ${code}: NO ENCONTRADO`) }
  }
  console.log(`\n=== CARGA COMPLETADA ===\nRunId: ${runId}\nEscritos: ${written}\nAño censal: ${CENSUS_YEAR}`)
}

main().catch((e) => { console.error('Error fatal:', e); process.exit(1) })
