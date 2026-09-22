/**
 * Carga los SALDOS migratorios municipales (INE 69767) en la capa lateral INE
 * que ya usan los FLUJOS 69711/69743/69746 (socideas/ine-layers/v1/municipal/{INE-5}.json).
 *
 * Complementa — NO sustituye — a los flujos. Nunca se suman saldos con flujos:
 *   - Flujos (69711/69743/69746): entradas/salidas.
 *   - Saldos (69767): saldo neto total / interior / exterior.
 *
 * Contrato verificado en vivo (2026-09-21):
 *   - Operación 455; tabla 69767. SERIES_TABLA/69767?tip=M&nult=1 → 73.665 series.
 *   - MetaData: FK_Variable 349 = territorio (Codigo 5 dígitos = municipio),
 *               18 = sexo, 876 = tipo de saldo, 3 = medida (Dato base).
 *
 * Seguridad:
 *   - Merge por capa: lee el objeto existente y SOLO añade `layers.migrationBalance`
 *     (preserva demografía, flujos, educación, agrario, quality…).
 *   - Ausencia/secreto → value null (NUNCA 0).
 *   - Tamaño por objeto medido; gate de 150 KB por envelope.
 *
 * Uso:
 *   npx tsx scripts/load-migration-balances-69767.ts --dry-run [--sample 10]
 *   npx tsx scripts/load-migration-balances-69767.ts --confirm-r2-write
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { config } from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

config({ path: '.env.local' })

// ─── Configuración ───────────────────────────────────────────

const INE_API_BASE = 'https://servicios.ine.es/wstempus/js/ES'
const TABLE_ID = '69767'
const OP_NAME = 'INE · Estadística de Migraciones y Cambios de Residencia · Tabla 69767'
const R2_PREFIX = 'socideas/ine-layers/v1/municipal'
const MAX_OBJECT_BYTES = 150 * 1024
const RETRY_ATTEMPTS = 3
const RETRY_BASE_MS = 500

const VAR_SEXO = 18
const VAR_SALDO = 876

// ─── Tipos ───────────────────────────────────────────────────

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

interface SexBlock {
  total: IneValue
  interior: IneValue
  exterior: IneValue
}

interface MigrationBalanceLayer {
  period: string
  tableId: string
  source: string
  total: IneValue
  interior: IneValue
  exterior: IneValue
  bySex?: { male: SexBlock; female: SexBlock }
  status: 'observed' | 'partial' | 'missing'
}

interface IneSeriesMeta {
  Id: number
  COD: string
  Nombre: string
  MetaData: Array<{ Id: number; FK_Variable: number; Nombre: string; Codigo: string }>
}

interface IneRecord {
  COD: string
  Nombre: string
  Data: Array<{ Fecha: string; Anyo: number; Valor: number | null; Secreto?: boolean }>
}

interface SeriesKey {
  ine5: string
  name: string
  sexo: 'total' | 'male' | 'female'
  saldo: 'total' | 'interior' | 'exterior'
}

// ─── Descarga ────────────────────────────────────────────────

async function fetchSeriesMeta(): Promise<Map<string, SeriesKey>> {
  const url = `${INE_API_BASE}/SERIES_TABLA/${TABLE_ID}?tip=M&nult=1`
  console.log(`  Descargando metadatos de series (${url})…`)
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(200_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} SERIES_TABLA/${TABLE_ID}`)
  const series = (await res.json()) as IneSeriesMeta[]
  const map = new Map<string, SeriesKey>()
  let municipales = 0
  let noMunicipales = 0
  for (const s of series) {
    // El municipio se detecta por CUALQUIER MetaData con Codigo de 5 dígitos
    // (variable 19 "Municipios"). La variable 349 es "Total Nacional"/provincia.
    const muni = s.MetaData?.find((m) => /^\d{5}$/.test(m.Codigo))
    if (!muni) {
      noMunicipales++
      continue
    }
    const code = muni.Codigo
    const sexoRaw = s.MetaData?.find((m) => m.FK_Variable === VAR_SEXO)?.Nombre ?? ''
    const saldoRaw = s.MetaData?.find((m) => m.FK_Variable === VAR_SALDO)?.Nombre ?? ''
    const sexo: SeriesKey['sexo'] =
      /hombre/i.test(sexoRaw) ? 'male' : /mujer/i.test(sexoRaw) ? 'female' : 'total'
    const saldo: SeriesKey['saldo'] =
      /interior/i.test(saldoRaw) ? 'interior' : /exterior/i.test(saldoRaw) ? 'exterior' : 'total'
    map.set(s.COD, { ine5: code, name: muni.Nombre, sexo, saldo })
    municipales++
  }
  console.log(`  Series: ${series.length} total · ${municipales} municipales · ${noMunicipales} no municipales (prov/nac)`)
  return map
}

async function fetchData(): Promise<{ records: IneRecord[]; sha256: string; bytes: number }> {
  const url = `${INE_API_BASE}/DATOS_TABLA/${TABLE_ID}?nult=1&tip=A`
  console.log(`  Descargando datos (${url})…`)
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(200_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} DATOS_TABLA/${TABLE_ID}`)
  // SHA-256 sobre el ARTEFACTO REAL (cuerpo crudo de DATOS_TABLA), no sobre
  // un resumen derivado. bytes = tamaño del cuerpo descargado.
  const raw = await res.text()
  const sha256 = crypto.createHash('sha256').update(raw, 'utf8').digest('hex')
  const bytes = Buffer.byteLength(raw, 'utf8')
  const data = JSON.parse(raw) as IneRecord[]
  console.log(`  Registros: ${data.length} · bytes: ${bytes} · sha256(datos): ${sha256.slice(0, 16)}…`)
  return { records: data, sha256, bytes }
}

// ─── Construcción ────────────────────────────────────────────

function mkValue(v: number | null, seco: boolean | undefined, period: string): IneValue {
  if (seco === true || v === null || !Number.isFinite(v)) {
    return { value: null, unit: 'personas', status: 'suppressed', source: OP_NAME, tableId: TABLE_ID, period, derived: false }
  }
  return { value: v, unit: 'personas', status: 'observed', source: OP_NAME, tableId: TABLE_ID, period, derived: false }
}

function mkMissing(period: string): IneValue {
  return { value: null, unit: 'personas', status: 'missing', source: OP_NAME, tableId: TABLE_ID, period, derived: false }
}

function buildLayer(
  byMuni: Map<string, Map<string, { v: number | null; seco: boolean | undefined }>>,
  ine5: string,
  period: string,
): MigrationBalanceLayer | null {
  const cells = byMuni.get(ine5)
  if (!cells || cells.size === 0) return null
  const get = (sexo: string, saldo: string) => cells.get(`${sexo}|${saldo}`)
  const T = get('total', 'total')
  const I = get('total', 'interior')
  const E = get('total', 'exterior')

  const total = T ? mkValue(T.v, T.seco, period) : mkMissing(period)
  const interior = I ? mkValue(I.v, I.seco, period) : mkMissing(period)
  const exterior = E ? mkValue(E.v, E.seco, period) : mkMissing(period)

  // Identidad (solo si las tres se publican): total = interior + exterior.
  let status: MigrationBalanceLayer['status'] = 'observed'
  if (total.value !== null && interior.value !== null && exterior.value !== null) {
    if (total.value !== interior.value + exterior.value) status = 'partial'
  } else if (total.value === null) {
    status = 'missing'
  } else {
    status = 'partial'
  }

  const maleT = get('male', 'total'), maleI = get('male', 'interior'), maleE = get('male', 'exterior')
  const femT = get('female', 'total'), femI = get('female', 'interior'), femE = get('female', 'exterior')
  const bySex = (maleT || maleI || maleE || femT || femI || femE)
    ? {
        male: {
          total: maleT ? mkValue(maleT.v, maleT.seco, period) : mkMissing(period),
          interior: maleI ? mkValue(maleI.v, maleI.seco, period) : mkMissing(period),
          exterior: maleE ? mkValue(maleE.v, maleE.seco, period) : mkMissing(period),
        },
        female: {
          total: femT ? mkValue(femT.v, femT.seco, period) : mkMissing(period),
          interior: femI ? mkValue(femI.v, femI.seco, period) : mkMissing(period),
          exterior: femE ? mkValue(femE.v, femE.seco, period) : mkMissing(period),
        },
      }
    : undefined

  return { period, tableId: TABLE_ID, source: OP_NAME, total, interior, exterior, bySex, status }
}

// ─── R2 ──────────────────────────────────────────────────────

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
    if (err?.name === 'NoSuchKey' || err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404) {
      return { found: false }
    }
    // Error transitorio (red/5xx): NO tratar como "no existe" para no clobber.
    throw e
  }
}

// ─── Main ────────────────────────────────────────────────────

const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const confirmWrite = args.includes('--confirm-r2-write')
const sampleIdx = args.indexOf('--sample')
const sampleN = sampleIdx >= 0 ? parseInt(args[sampleIdx + 1] ?? '10', 10) : 0
const onlyNew = args.includes('--only-new')

const FIXTURES = ['28079', '02003', '28174', '15030', '41091'] // Madrid, Albacete, Somosierra, Santiago, Sevilla

async function main() {
  console.log('=== Carga de SALDOS migratorios 69767 → capa lateral INE (merge por bloque) ===')
  console.log(`Modo: ${isDryRun ? 'DRY-RUN (sin escritura)' : confirmWrite ? 'ESCRITURA R2' : 'REVISIÓN (sin flag)'}`)

  if (!isDryRun && !confirmWrite) {
    console.error('Falta --dry-run o --confirm-r2-write')
    process.exit(1)
  }

  const catalog = await fetchSeriesMeta()
  const { records, sha256: dataSha256, bytes: dataBytes } = await fetchData()

  // Agrupar por municipio y celda (sexo|saldo); se queda con el año más reciente de cada serie.
  const byMuni = new Map<string, Map<string, { v: number | null; seco: boolean | undefined }>>()
  let maxAnyo = 0
  let matched = 0
  let unmatched = 0
  for (const rec of records) {
    const key = catalog.get(rec.COD)
    if (!key) { unmatched++; continue }
    matched++
    const datum = (rec.Data ?? []).slice().sort((a, b) => (b.Anyo ?? 0) - (a.Anyo ?? 0))[0]
    if (!datum) continue
    if ((datum.Anyo ?? 0) > maxAnyo) maxAnyo = datum.Anyo
    if (!byMuni.has(key.ine5)) byMuni.set(key.ine5, new Map())
    byMuni.get(key.ine5)!.set(`${key.sexo}|${key.saldo}`, { v: datum.Valor ?? null, seco: datum.Secreto })
  }
  const period = String(maxAnyo)
  console.log(`  Registros emparejados: ${matched} · sin catálogo: ${unmatched} · municipios: ${byMuni.size} · último año: ${period}`)

  // Construir capas
  const layers = new Map<string, MigrationBalanceLayer>()
  for (const ine5 of byMuni.keys()) {
    const layer = buildLayer(byMuni, ine5, period)
    if (layer) layers.set(ine5, layer)
  }
  console.log(`  Capas construidas: ${layers.size}`)

  // Validaciones de identidad (sobre la muestra que se va a examinar)
  // Validaciones de identidad GLOBALES sobre los 8.132 municipios (no solo muestra)
  let sumChecked = 0, sumOk = 0, sumBad = 0
  let sexChecked = 0, sexOk = 0, sexBad = 0
  const badExamples: string[] = []
  for (const [c, L] of layers) {
    if (L.total.value !== null && L.interior.value !== null && L.exterior.value !== null) {
      sumChecked++
      if (L.total.value === L.interior.value + L.exterior.value) sumOk++
      else { sumBad++; if (badExamples.length < 5) badExamples.push(c) }
    }
    const m = L.bySex?.male.total.value, f = L.bySex?.female.total.value
    if (L.total.value !== null && m != null && f != null) {
      sexChecked++
      if (L.total.value === m + f) sexOk++
      else sexBad++
    }
  }
  console.log(`  Identidad total = interior + exterior ... ${sumOk}/${sumChecked} OK (${sumBad} fallos)` + (badExamples.length ? ` · ej: ${badExamples.join(',')}` : ''))
  console.log(`  Identidad total = Hombres + Mujeres ..... ${sexOk}/${sexChecked} OK (${sexBad} fallos)`)

  const checkCodes = FIXTURES.filter((c) => layers.has(c))
  let idFail = 0
  console.log('  --- Fixtures ---')
  for (const code of checkCodes) {
    const L = layers.get(code)!
    const okSum = L.total.value !== null && L.interior.value !== null && L.exterior.value !== null
      ? L.total.value === L.interior.value + L.exterior.value : null
    const m = L.bySex?.male.total.value, f = L.bySex?.female.total.value
    const okSex = L.total.value !== null && m != null && f != null ? L.total.value === m + f : null
    if (okSum === false || okSex === false) idFail++
    console.log(`    ${code}: total=${L.total.value} int=${L.interior.value} ext=${L.exterior.value} | total=ext+int? ${okSum} | total=H+M? ${okSex}`)
  }

  // Muestreo
  const allCodes = [...layers.keys()]
  const sample = sampleN > 0 ? allCodes.slice(0, sampleN) : checkCodes
  console.log(`  Muestra a examinar: ${sample.length} municipios`)

  // Tamaños
  const sizes = [...layers.entries()].map(([c, L]) => ({ c, bytes: Buffer.byteLength(JSON.stringify(L), 'utf-8') }))
  sizes.sort((a, b) => a.bytes - b.bytes)
  const p95 = sizes[Math.floor(sizes.length * 0.95)]?.bytes ?? 0
  const max = sizes[sizes.length - 1]?.bytes ?? 0
  console.log(`  Tamaño capa p50=${sizes[Math.floor(sizes.length / 2)]?.bytes ?? 0} p95=${p95} max=${max}`)

  // Manifest
  const runId = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const manifest = {
    schemaVersion: 'migration-balances-69767-v1',
    runId, tableId: TABLE_ID, operation: 455, period,
    municipalities: layers.size, matchedRecords: matched, idFailures: idFail,
    p95Bytes: p95, maxBytes: max,
    inputs: {
      seriesUrl: `${INE_API_BASE}/SERIES_TABLA/${TABLE_ID}?tip=M&nult=1`,
      dataUrl: `${INE_API_BASE}/DATOS_TABLA/${TABLE_ID}?nult=1&tip=A`,
      // SHA-256 del cuerpo crudo de DATOS_TABLA (el artefacto de datos real).
      sha256: dataSha256,
      sha256Target: 'cuerpo_crudo_DATOS_TABLA',
      bytes: dataBytes,
      // Historia: la v1 del manifest hasheaba JSON.stringify(records.length)
      // (el recuento, NO los datos) — hash sin valor de integridad. Sustituido
      // el 2026-09-22 en fase 3 cambio 6B; no se conserva el valor antiguo
      // porque no representaba ningún artefacto descargable.
      sha256PrevioNota:
        'v1: sha256 de JSON.stringify(records.length) (recuento, no datos); invalido como huella del artefacto',
    },
    createdAt: new Date().toISOString(),
  }
  const manifestDir = path.join(process.cwd(), 'tmp')
  if (!fs.existsSync(manifestDir)) fs.mkdirSync(manifestDir, { recursive: true })
  fs.writeFileSync(path.join(manifestDir, `migration-balances-69767-${runId}.json`), JSON.stringify(manifest, null, 2))
  console.log(`  Manifest: tmp/migration-balances-69767-${runId}.json`)

  if (max > MAX_OBJECT_BYTES) {
    console.error(`ABORTA: capa supera ${MAX_OBJECT_BYTES} B (max=${max})`)
    process.exit(1)
  }

  if (isDryRun) {
    console.log('=== DRY-RUN COMPLETADO — sin escritura en R2 ===')
    return
  }

  // Escritura con merge por capa
  const r2 = r2Client()
  if (!r2) { console.error('ERROR: R2 no configurado'); process.exit(1) }

  console.log('--- Escritura R2 (merge por bloque) ---')
  const names = new Map<string, string>()
  for (const k of catalog.values()) names.set(k.ine5, k.name)
  let written = 0
  let skipped = 0
  const errors: string[] = []
  const force = args.includes('--force')
  const CONCURRENCY = 25
  const entries = [...layers.entries()]
  let idx = 0
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, entries.length) }, async () => {
      while (idx < entries.length) {
        const [code, layer] = entries[idx++]
        const key = `${R2_PREFIX}/${code}.json`
        try {
          const ex = await getExisting(r2, key)
          if (onlyNew && !force && ex.found) {
            const lb = (ex.data as { layers?: { migrationBalance?: { period?: string } } })?.layers?.migrationBalance
            if (lb && lb.period === period) { skipped++; continue }
          }
          const existing: Record<string, unknown> = ex.found ? (ex.data as Record<string, unknown>) : {}
          const layersObj = (existing.layers ?? {}) as Record<string, unknown>
          layersObj.migrationBalance = layer
          // Envelope municipal-ine-layers-v1 COMPLETO (obligatorio para el lector).
          existing.schemaVersion = 'municipal-ine-layers-v1'
          existing.ineCode = code
          existing.municipalityName = (existing.municipalityName as string) || names.get(code) || code
          existing.generatedAt = new Date().toISOString()
          existing.layers = layersObj
          existing.quality =
            (existing.quality as object) ??
            { territoryMatch: 'exact', sourceChecksums: {}, validationStatus: 'partial' }

          await putWithRetry(r2, key, JSON.stringify(existing), {
            runid: runId, inecode: code, schema: 'municipal-ine-layers-v1', layer: 'migrationBalance',
          })
          written++
          if (written % 500 === 0) console.log(`  Escritos: ${written}/${entries.length}`)
        } catch (err) {
          errors.push(`${code}: ${err}`)
        }
      }
    }),
  )
  console.log(`  Objetos escritos: ${written}/${entries.length} · saltados: ${skipped} · errores: ${errors.length}`)
  if (errors.length > 0) console.error('  Primeros errores:', errors.slice(0, 5).join(' | '))

  // Read-back (cache-buster)
  console.log('--- Read-back ---')
  const { GetObjectCommand: GOC } = await import('@aws-sdk/client-s3')
  for (const code of checkCodes.slice(0, 5)) {
    try {
      const resp = await r2.client.send(new GOC({ Bucket: r2.bucket, Key: `${R2_PREFIX}/${code}.json` }))
      const body = await resp.Body!.transformToString()
      const data = JSON.parse(body)
      const hasBal = !!data.layers?.migrationBalance
      const keepMig = !!(data.migration || data.layers?.migration)
      const valid = data.schemaVersion === 'municipal-ine-layers-v1' && !!data.quality
      console.log(`  ${code}: ${Buffer.byteLength(body)} B | migrationBalance=${hasBal} | preserva migration=${keepMig} | envelope-valid=${valid}`)
    } catch { console.log(`  ${code}: NO ENCONTRADO`) }
  }

  console.log(`\n=== CARGA COMPLETADA ===\nRunId: ${runId}\nEscritos: ${written}\nPeriodo: ${period}`)
}

main().catch((err) => { console.error('Error fatal:', err); process.exit(1) })
