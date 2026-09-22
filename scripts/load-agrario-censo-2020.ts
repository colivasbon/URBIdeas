/**
 * Carga "Sector agrario · Censo Agrario 2020" (INE PC-Axis) en la capa lateral
 * INE → layers.agriculture (bloque de Economía, año estructural 2020).
 *
 * Tablas (verificadas en vivo 2026-09-21, CSV nacional con INE-5 en Municipios):
 *   52071 → landUse             (usos agrarios: SAU/arable/leñosos/pastos/huertos)
 *   52076 → livestock           (ganadería por especie: explotaciones/cabezas)
 *   52081 → farmHolders         (responsables: personas y edad media)
 *   52082 → agriculturalTraining(formación agraria del jefe/a)
 *
 * CLAVE TERRITORIAL: código INE de 5 dígitos como prefijo de la columna
 * "Municipios" (índice 4). NUNCA join por nombre.
 *
 * FORMATO NUMÉRICO (¡diferente por tabla!):
 *   52071 → en-US  (coma = miles, punto = decimal)  ej. 23,913,682.29
 *   52076/52081/52082 → es-ES (punto = miles, coma = decimal) ej. 4.500.806,63
 *
 * UNIDADES: ha (hectáreas) ≠ explotaciones ≠ cabezas ≠ UGT ≠ personas ≠ años.
 * El secret estadístico (".", "..", vacío) → value null (NUNCA 0).
 * Categoría/medida sin hueco en el tipo → NO se carga (documentada), sin bloquear
 * el resto de tablas.
 *
 * Uso:
 *   npx tsx scripts/load-agrario-censo-2020.ts --dry-run
 *   npx tsx scripts/load-agrario-censo-2020.ts --confirm-r2-write [--force]
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { config } from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

config({ path: '.env.local' })

const CENSUS_YEAR = 2020
const PERIOD = '2020'
const SOURCE_BASE = 'INE · Censo Agrario 2020 (PC-Axis)'
const R2_PREFIX = 'socideas/ine-layers/v1/municipal'
const MAX_OBJECT_BYTES = 150 * 1024
const RETRY_ATTEMPTS = 3
const RETRY_BASE_MS = 500
const CONCURRENCY = 25

type Status = 'observed' | 'suppressed' | 'missing' | 'partial'

interface IneValue {
  value: number | null
  unit: string
  status: Status
  source: string
  tableId: string
  period: string
  derived: false
}

interface LandUse {
  arableHoldings?: IneValue
  arableSurfaceHa?: IneValue
  woodyCropsHoldings?: IneValue
  woodyCropsSurfaceHa?: IneValue
  permanentPastureHoldings?: IneValue
  permanentPastureSurfaceHa?: IneValue
  kitchenGardens?: IneValue
  utilizedAgriculturalAreaHa?: IneValue
}
interface Livestock {
  bovineHoldings?: IneValue; bovineHeads?: IneValue
  sheepGoatHoldings?: IneValue; sheepGoatHeads?: IneValue
  pigHoldings?: IneValue; pigHeads?: IneValue
  poultryHoldings?: IneValue; poultryHeads?: IneValue
}
interface FarmHolders { total?: IneValue; male?: IneValue; female?: IneValue; meanAge?: IneValue }
interface Training { experienceOnly?: IneValue; courses?: IneValue; agriculturalVocational?: IneValue; universityAgricultural?: IneValue }

interface AgricultureLayer {
  censusYear: 2020
  landUse?: LandUse
  livestock?: Livestock
  farmHolders?: FarmHolders
  agriculturalTraining?: Training
  status: 'observed' | 'partial' | 'missing'
}

function csvUrl(id: string): string {
  return `https://www.ine.es/jaxi/files/tpx/es/csv_bd/${id}.csv`
}

async function downloadCsv(id: string): Promise<{ text: string; bytes: number; sha256: string }> {
  const cachePath = path.join(process.cwd(), 'tmp', `ine-${id}-censoagrario2020.csv`)
  if (fs.existsSync(cachePath)) {
    const buf = fs.readFileSync(cachePath)
    return { text: buf.toString('utf8').replace(/^﻿/, ''), bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') }
  }
  let lastErr: unknown
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(csvUrl(id), { signal: AbortSignal.timeout(600_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${id}`)
      const buf = Buffer.from(await res.arrayBuffer())
      fs.mkdirSync(path.dirname(cachePath), { recursive: true })
      fs.writeFileSync(cachePath, buf)
      return { text: buf.toString('utf8').replace(/^﻿/, ''), bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') }
    } catch (e) {
      lastErr = e
      await new Promise((r) => setTimeout(r, 8000 * attempt))
    }
  }
  throw lastErr
}

/** Parsea número según el formato declarado de la tabla. Secreto/ND → null. */
function parseNum(raw: string, fmt: 'en-US' | 'es-ES'): { v: number | null; seco: boolean } {
  const s = (raw ?? '').trim()
  if (s === '' || /^\.+$/.test(s) || s.toUpperCase() === 'ND') return { v: null, seco: true }
  let clean: string
  if (fmt === 'en-US') clean = s.replace(/,/g, '') // coma = miles
  else clean = s.replace(/\./g, '').replace(/,/g, '.') // punto = miles, coma = decimal
  if (!/^-?\d+(\.\d+)?$/.test(clean)) return { v: null, seco: true }
  return { v: parseFloat(clean), seco: false }
}

function mkValue(raw: string, fmt: 'en-US' | 'es-ES', unit: string, tableId: string): IneValue {
  const { v, seco } = parseNum(raw, fmt)
  return {
    value: seco || v === null ? null : v,
    unit,
    status: seco || v === null ? 'suppressed' : 'observed',
    source: `${SOURCE_BASE} · Tabla ${tableId}`,
    tableId,
    period: PERIOD,
    derived: false,
  }
}

/** Cabecera fija de las 4 tablas: 5 columnas geográficas + tipo Municipios. */
function geoHeader(header: string[]): { iMun: number } {
  const iMun = header.indexOf('Municipios')
  if (iMun < 0) throw new Error(`Cabecera sin 'Municipios': ${header.join(' | ')}`)
  return { iMun }
}

interface Row { ine: string; cols: string[] }

function readRows(text: string): { rows: Row[]; discarded: number } {
  const lines = text.split(/\r?\n/)
  const header = (lines[0] ?? '').split('\t').map((h) => h.trim())
  const { iMun } = geoHeader(header)
  const rows: Row[] = []
  let discarded = 0
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const cols = line.split('\t')
    const m = /^(\d{5})\s+\S/.exec(cols[iMun] ?? '')
    if (!m) { discarded++; continue }
    rows.push({ ine: m[1], cols })
  }
  return { rows, discarded }
}

const FIXTURES = ['28079', '02003', '28174', '15030', '41091']

// ── Parsers por tabla ────────────────────────────────────────

function parse52071(rows: Row[]): Map<string, LandUse> {
  const out = new Map<string, LandUse>()
  for (const { ine, cols } of rows) {
    // geo 0..4 | cols[5..7] jerarquía SAU | cols[8] característica | cols[9] valor
    if (cols.length < 10) continue
    const nivel = (cols[7] || cols[6] || cols[5] || '').trim()
    const carac = (cols[8] || '').trim()
    const val = cols[9]
    if (!nivel || !carac) continue
    const esHa = /superficie/i.test(carac)
    const unit = esHa ? 'hectáreas' : 'explotaciones'
    let lu = out.get(ine); if (!lu) { lu = {}; out.set(ine, lu) }
    const v = mkValue(val, 'en-US', unit, '52071')
    if (/tierra arable/i.test(nivel)) {
      if (esHa) lu.arableSurfaceHa = v; else lu.arableHoldings = v
    } else if (/cultivos le.osos/i.test(nivel)) {
      if (esHa) lu.woodyCropsSurfaceHa = v; else lu.woodyCropsHoldings = v
    } else if (/pastos permanentes/i.test(nivel)) {
      if (esHa) lu.permanentPastureSurfaceHa = v; else lu.permanentPastureHoldings = v
    } else if (/huertos/i.test(nivel)) {
      if (!esHa) lu.kitchenGardens = v // sólo explotaciones (tipo IneValue único)
    } else if (nivel === 'SAU' && esHa) {
      lu.utilizedAgriculturalAreaHa = v // SAU total en ha
    }
  }
  return out
}

const ESPECIES: Array<[RegExp, keyof Livestock]> = [
  [/^1 Bovinos$/i, 'bovine'],
  [/^2_3 Ovino y caprino$/i, 'sheepGoat'],
  [/^4 Porcinos$/i, 'pig'],
  [/^5 Aves/i, 'poultry'],
]

function parse52076(rows: Row[]): Map<string, Livestock> {
  const out = new Map<string, Livestock>()
  for (const { ine, cols } of rows) {
    if (cols.length < 8) continue
    const especie = (cols[5] || '').trim()
    const medida = (cols[6] || '').trim()
    const val = cols[7]
    const esp = ESPECIES.find(([re]) => re.test(especie))?.[1]
    if (!esp) continue
    // UGT no tiene campo en el tipo → se omite (documentado), sin bloquear.
    if (/^UGT$/i.test(medida)) continue
    const esExp = /^explotaciones$/i.test(medida)
    const esCab = /^cabezas$/i.test(medida)
    if (!esExp && !esCab) continue
    const unit = esExp ? 'explotaciones' : 'cabezas'
    const v = mkValue(val, 'es-ES', unit, '52076')
    let ls = out.get(ine); if (!ls) { ls = {}; out.set(ine, ls) }
    if (esExp) (ls as Record<string, IneValue | undefined>)[`${esp}Holdings`] = v
    else (ls as Record<string, IneValue | undefined>)[`${esp}Heads`] = v
  }
  return out
}

function parse52081(rows: Row[]): Map<string, FarmHolders> {
  const out = new Map<string, FarmHolders>()
  for (const { ine, cols } of rows) {
    if (cols.length < 8) continue
    const sexo = (cols[5] || '').trim()
    const medida = (cols[6] || '').trim()
    const val = cols[7]
    const esEdad = /edad media/i.test(medida)
    const unit = esEdad ? 'años' : 'personas'
    const v = mkValue(val, 'es-ES', unit, '52081')
    let fh = out.get(ine); if (!fh) { fh = {}; out.set(ine, fh) }
    if (esEdad) { if (/ambos sexos/i.test(sexo)) fh.meanAge = v }
    else if (/ambos sexos/i.test(sexo)) fh.total = v
    else if (/^hombres$/i.test(sexo)) fh.male = v
    else if (/^mujeres$/i.test(sexo)) fh.female = v
  }
  return out
}

const FORMACION: Array<[RegExp, keyof Training]> = [
  [/experiencia agraria exclusivamente/i, 'experienceOnly'],
  [/cursos de formaci.n agraria/i, 'courses'],
  [/formaci.n profesional agraria/i, 'agriculturalVocational'],
  [/universitarios y\/o superiores agrarios/i, 'universityAgricultural'],
]

function parse52082(rows: Row[]): Map<string, Training> {
  const out = new Map<string, Training>()
  for (const { ine, cols } of rows) {
    if (cols.length < 7) continue
    const cat = (cols[5] || '').trim()
    const val = cols[6]
    const key = FORMACION.find(([re]) => re.test(cat))?.[1]
    if (!key) continue // "Total formaciones" → sin campo, documentado
    const tr = out.get(ine) ?? {}
    ;(tr as Record<string, IneValue | undefined>)[key] = mkValue(val, 'es-ES', 'personas', '52082')
    out.set(ine, tr)
  }
  return out
}

function buildLayer(ine: string, lu?: LandUse, li?: Livestock, fh?: FarmHolders, tr?: Training): AgricultureLayer | null {
  if (!lu && !li && !fh && !tr) return null
  const hasAny = (o?: object) => o && Object.values(o).some((x) => (x as IneValue | undefined)?.value !== null)
  const status: AgricultureLayer['status'] =
    hasAny(lu) || hasAny(li) || hasAny(fh) || hasAny(tr) ? 'observed' : 'missing'
  const layer: AgricultureLayer = { censusYear: 2020, status }
  if (lu) layer.landUse = lu
  if (li) layer.livestock = li
  if (fh) layer.farmHolders = fh
  if (tr) layer.agriculturalTraining = tr
  return layer
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
async function putWithRetry(r2: { client: S3Client; bucket: string }, key: string, body: string, md: Record<string, string>): Promise<void> {
  for (let a = 0; a < RETRY_ATTEMPTS; a++) {
    try {
      await r2.client.send(new PutObjectCommand({ Bucket: r2.bucket, Key: key, Body: body, ContentType: 'application/json', CacheControl: 'public, max-age=3600', Metadata: md }))
      return
    } catch (e) { if (a === RETRY_ATTEMPTS - 1) throw e; await new Promise((r) => setTimeout(r, RETRY_BASE_MS * (a + 1))) }
  }
}
async function getExisting(r2: { client: S3Client; bucket: string }, key: string): Promise<{ found: boolean; data?: Record<string, unknown> }> {
  try {
    const resp = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }))
    return { found: true, data: JSON.parse(await resp.Body!.transformToString()) as Record<string, unknown> }
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

async function main() {
  console.log('=== Sector agrario · Censo Agrario 2020 (PC-Axis) → layers.agriculture ===')
  console.log(`Modo: ${isDryRun ? 'DRY-RUN' : confirmWrite ? 'ESCRITURA R2' : 'REVISIÓN (sin flag)'}`)
  if (!isDryRun && !confirmWrite) { console.error('Falta --dry-run o --confirm-r2-write'); process.exit(1) }

  const ids = ['52071', '52076', '52081', '52082']
  const inputs: Record<string, { text: string; sha256: string; bytes: number; rows: Row[] }> = {}
  for (const id of ids) {
    const { text, sha256, bytes } = await downloadCsv(id)
    const { rows, discarded } = readRows(text)
    inputs[id] = { text, sha256, bytes, rows }
    console.log(`  ${id}: ${bytes} B · sha256 ${sha256.slice(0, 12)}… · filas municipales ${rows.length} · descartadas ${discarded}`)
  }

  const lu = parse52071(inputs['52071'].rows)
  const li = parse52076(inputs['52076'].rows)
  const fh = parse52081(inputs['52081'].rows)
  const tr = parse52082(inputs['52082'].rows)
  console.log(`  Capas parseadas: landUse=${lu.size} livestock=${li.size} farmHolders=${fh.size} training=${tr.size}`)

  const allIne = new Set([...lu.keys(), ...li.keys(), ...fh.keys(), ...tr.keys()])
  console.log(`  Municipios con al menos una capa: ${allIne.size}`)

  const layers = new Map<string, AgricultureLayer>()
  for (const ine of allIne) {
    const layer = buildLayer(ine, lu.get(ine), li.get(ine), fh.get(ine), tr.get(ine))
    if (layer) layers.set(ine, layer)
  }
  console.log(`  layers.agriculture construidas: ${layers.size}`)

  // Identidades: SAU (arable+leñosos+pastos+huertos) ≤ SAU total en ha (si todo publicado)
  let saudChecked = 0, saudOk = 0, saudBad = 0
  for (const L of layers.values()) {
    const l = L.landUse
    if (!l) continue
    // Identidad SOLO en hectáreas: las superficies de cultivo sumadas no pueden
    // superar la SAU total. kitchenGardens NO participa (unidad explotaciones).
    const parts = [l.arableSurfaceHa, l.woodyCropsSurfaceHa, l.permanentPastureSurfaceHa].filter((x): x is IneValue => !!x)
    if (parts.length === 3 && parts.every((p) => p.value !== null)) {
      const sum = parts.reduce((a, p) => a + (p.value as number), 0)
      const sau = l.utilizedAgriculturalAreaHa?.value
      if (sau !== null && sau !== undefined) {
        saudChecked++
        if (sum <= sau + 1) { saudOk++ } else { saudBad++ }
      }
    }
  }
  console.log(`  Identidad Σ(desglose SAU) ≤ SAU total: ${saudOk}/${saudChecked} OK (${saudBad} excesos)`)

  // ND nunca como cero
  let ndBug = 0
  for (const L of layers.values()) {
    for (const grp of [L.landUse, L.livestock, L.farmHolders, L.agriculturalTraining]) {
      if (!grp) continue
      for (const v of Object.values(grp) as Array<IneValue | undefined>) {
        if (v && v.status === 'suppressed' && v.value !== null) ndBug++
      }
    }
  }
  console.log(`  ND/secreto como número (debe ser 0): ${ndBug}`)

  console.log('  --- Fixtures ---')
  for (const c of FIXTURES) {
    const L = layers.get(c)
    if (!L) { console.log(`    ${c}: SIN DATOS`); continue }
    console.log(`    ${c}: SAUha=${L.landUse?.utilizedAgriculturalAreaHa?.value} arableha=${L.landUse?.arableSurfaceHa?.value} bovExp=${L.livestock?.bovineHoldings?.value} jefes=${L.farmHolders?.total?.value} exp=${L.agriculturalTraining?.experienceOnly?.value} | year=${L.censusYear}`)
  }

  const sizes = [...layers.values()].map((L) => Buffer.byteLength(JSON.stringify(L), 'utf-8')).sort((a, b) => a - b)
  const p95 = sizes[Math.floor(sizes.length * 0.95)] ?? 0
  const max = sizes[sizes.length - 1] ?? 0
  console.log(`  Tamaño capa p95=${p95} max=${max}`)

  const runId = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const manifest = {
    schemaVersion: 'agriculture-censo-2020-v1', runId, censusYear: CENSUS_YEAR,
    tables: ids.map((id) => ({ id, url: csvUrl(id), sha256: inputs[id].sha256, bytes: inputs[id].bytes, rows: inputs[id].rows.length })),
    municipalities: layers.size, saudIdentity: `${saudOk}/${saudChecked}`, ndBug, p95Bytes: p95, maxBytes: max,
    excludedMeasures: ['52076 UGT (sin campo en IneLivestock)', '52082 Total formaciones (sin campo en IneAgriculturalTraining)'],
    createdAt: new Date().toISOString(),
  }
  const manifestDir = path.join(process.cwd(), 'tmp')
  if (!fs.existsSync(manifestDir)) fs.mkdirSync(manifestDir, { recursive: true })
  fs.writeFileSync(path.join(manifestDir, `agriculture-censo-2020-${runId}.json`), JSON.stringify(manifest, null, 2))
  console.log(`  Manifest: tmp/agriculture-censo-2020-${runId}.json`)

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
          const ag = (ex.data as { layers?: { agriculture?: { censusYear?: number } } } | undefined)?.layers?.agriculture
          if (ag && ag.censusYear === 2020) { skipped++; continue }
        }
        const existing: Record<string, unknown> = ex.found ? (ex.data as Record<string, unknown>) : {}
        const layersObj = (existing.layers ?? {}) as Record<string, unknown>
        layersObj.agriculture = layer
        existing.schemaVersion = 'municipal-ine-layers-v1'
        existing.ineCode = code
        existing.municipalityName = (existing.municipalityName as string) || code
        existing.generatedAt = new Date().toISOString()
        existing.layers = layersObj
        existing.quality = (existing.quality as object) ?? { territoryMatch: 'exact', sourceChecksums: {}, validationStatus: 'partial' }
        await putWithRetry(r2, key, JSON.stringify(existing), { runid: runId, inecode: code, schema: 'municipal-ine-layers-v1', layer: 'agriculture' })
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
      const d = JSON.parse(await resp.Body!.transformToString())
      console.log(`  ${code}: agriculture=${!!d.layers?.agriculture} education=${!!d.layers?.education} migrationBalance=${!!d.layers?.migrationBalance} migration=${!!(d.migration)} schema=${d.schemaVersion}`)
    } catch { console.log(`  ${code}: NO ENCONTRADO`) }
  }
  console.log(`\n=== CARGA COMPLETADA ===\nRunId: ${runId}\nEscritos: ${written}\nCenso: ${CENSUS_YEAR}`)
}

main().catch((e) => { console.error('Error fatal:', e); process.exit(1) })
