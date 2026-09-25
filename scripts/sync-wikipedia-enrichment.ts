// Sincroniza el enriquecimiento Wikipedia/Wikidata de los municipios a R2.
//
// Clave cacheada: `socideas/wikipedia/{codigo_ine}.json`
// (contrato: src/lib/wikipedia-enrichment.ts · lector: readWikipediaEnrichment).
//
// USO
//   npx tsx scripts/sync-wikipedia-enrichment.ts --probe
//       Sonda reproduciible sobre una muestra (incluye 45090 Manzaneque).
//       Escribe tmp/audit/wikipedia-probe.txt. NO escribe en R2.
//   npx tsx scripts/sync-wikipedia-enrichment.ts --only=45090,45172
//   npx tsx scripts/sync-wikipedia-enrichment.ts --limit=100
//   npx tsx scripts/sync-wikipedia-enrichment.ts --write [--only=…|--limit=…]
//       Escritura real en R2 con backup en tmp/backup/… y read-back sha256.
//   (sin flags) : dry-run completo sobre los 8.132 municipios, sin R2.
//
// Cortesía con Wikimedia: lotes de 50 municipios y 1 s de pausa entre lotes
// (peticiones secuenciales dentro de cada lote, con User-Agent identificativo).
//
// Nunca imprime credenciales. tmp/ está en .gitignore.

import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { config } from 'dotenv'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'
import {
  getWikipediaMunicipalityData,
  wikipediaEnrichmentKey,
  type WikipediaEnrichment,
} from '../src/lib/wikipedia-enrichment'

config({ path: '.env.local' })

const AUDIT_DIR = path.join('tmp', 'audit')
const BACKUP_ROOT = path.join('tmp', 'backup', 'wikipedia-enrichment')
const PROBE_REPORT = path.join(AUDIT_DIR, 'wikipedia-probe.txt')
const BATCH_SIZE = 50
const BATCH_PAUSE_MS = 1000

/** Muestra de sonda: normal, con desambiguación, bilingüe, isla, concejo,
 *  ciudad autónoma, homónimo (persona) y redirect de título. 45090 obligatorio. */
const PROBE_INES = [
  '45090', // Manzaneque (Toledo) — caso de referencia
  '45172', // Torrico (Toledo) — municipio pequeño sin ruido
  '19130', // Guadalajara — artículo plano = desambiguación
  '27012', // Cervantes (Lugo) — homónimo: el artículo plano es el escritor
  '28079', // Madrid — capital grande, muchos bienes
  '07024', // Formentera — isla, provincia «Illes Balears»
  '33071', // Taramundi — concejo asturiano
  '01003', // Aramaio — el artículo se titula «Aramayona»
  '03014', // Alacant/Alicante — nombre bilingüe con «/»
  '46100', // Cotes (Valencia)
  '51001', // Ceuta — ciudad autónoma, P300 no numérico (ES-CE)
]

interface MunicipioRow {
  codigo_ine: string
  nombre: string
  provincia: string
}

interface Args {
  probe: boolean
  write: boolean
  only: string[] | null
  limit: number | null
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const onlyArg = argv.find((a) => a.startsWith('--only='))
  const limitArg = argv.find((a) => a.startsWith('--limit='))
  const limitValue = limitArg === undefined ? null : Number(limitArg.slice('--limit='.length))
  return {
    probe: argv.includes('--probe'),
    write: argv.includes('--write'),
    only:
      onlyArg === undefined
        ? null
        : onlyArg
            .slice('--only='.length)
            .split(',')
            .map((c) => c.trim())
            .filter((c) => c !== ''),
    limit: limitValue !== null && Number.isFinite(limitValue) && limitValue > 0 ? limitValue : null,
  }
}

function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex')
}

function short(hash: string): string {
  return `${hash.slice(0, 12)}…`
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function pad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value.padEnd(width)
}

function padStart(value: string, width: number): string {
  return value.length >= width ? value : value.padStart(width)
}

// ============================================================================
// Catálogo municipal (Supabase, solo lectura)
// ============================================================================

async function loadMunicipios(): Promise<MunicipioRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local')
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const rows: MunicipioRow[] = []
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('municipios')
      .select('codigo_ine, nombre, provincia:provincias(nombre)')
      .order('codigo_ine')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`municipios: ${error.message}`)
    const batch = (data ?? []) as unknown as {
      codigo_ine: string
      nombre: string
      provincia: { nombre: string } | null
    }[]
    for (const row of batch) {
      rows.push({
        codigo_ine: String(row.codigo_ine ?? '').trim(),
        nombre: String(row.nombre ?? '').trim(),
        provincia: String(row.provincia?.nombre ?? '').trim(),
      })
    }
    if (batch.length < PAGE) break
    from += PAGE
  }
  return rows
}

function selectTargets(all: MunicipioRow[], args: Args): MunicipioRow[] {
  if (args.probe) {
    const byIne = new Map(all.map((m) => [m.codigo_ine, m]))
    const missing = PROBE_INES.filter((ine) => !byIne.has(ine))
    if (missing.length > 0) throw new Error(`--probe: códigos ausentes en Supabase: ${missing.join(', ')}`)
    return PROBE_INES.map((ine) => byIne.get(ine) as MunicipioRow)
  }
  let rows = all
  if (args.only !== null) {
    const byIne = new Map(all.map((m) => [m.codigo_ine, m]))
    const missing = args.only.filter((ine) => !byIne.has(ine))
    if (missing.length > 0) console.log(`Aviso: códigos ausentes en Supabase, omitidos: ${missing.join(', ')}`)
    rows = args.only.map((ine) => byIne.get(ine)).filter((m): m is MunicipioRow => m !== undefined)
  }
  if (args.limit !== null) rows = rows.slice(0, args.limit)
  return rows
}

// ============================================================================
// R2 (mismo patrón que scripts/publish-population-structure-r2.ts)
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

async function getObjectBytes(r2: R2, key: string): Promise<Buffer | null> {
  try {
    const res = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }))
    const bytes = await res.Body?.transformToByteArray()
    return bytes === undefined ? null : Buffer.from(bytes)
  } catch (err) {
    if (isNotFound(err)) return null
    throw err
  }
}

async function putObject(r2: R2, key: string, body: Buffer): Promise<void> {
  await r2.client.send(
    new PutObjectCommand({
      Bucket: r2.bucket,
      Key: key,
      Body: body,
      ContentType: 'application/json',
      CacheControl: 'public, max-age=300, must-revalidate',
      Metadata: { kind: 'wikipedia-enrichment', sha256: sha256(body) },
    }),
  )
}

interface WriteEvidence {
  ine: string
  key: string
  bytes: number
  sha256: string
  readBackSha256: string
  readBackBytes: number
  backupPath: string | null
}

/** Backup → PUT → read-back sha256. Lanza si algo no cuadra. */
async function writeWithEvidence(
  r2: R2,
  ine: string,
  body: Buffer,
  backupDir: string,
): Promise<WriteEvidence> {
  const key = wikipediaEnrichmentKey(ine)
  const previous = await getObjectBytes(r2, key)
  let backupPath: string | null = null
  if (previous !== null) {
    backupPath = path.join(backupDir, `${ine}.json`)
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(backupPath, previous)
  } else {
    backupPath = path.join(backupDir, `${ine}.json.no-existia`)
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(backupPath, '')
  }

  await putObject(r2, key, body)
  const readBack = await getObjectBytes(r2, key)
  if (readBack === null) throw new Error(`${key}: ausente tras el PUT`)
  const readBackSha = sha256(readBack)
  const localSha = sha256(body)
  if (readBackSha !== localSha) throw new Error(`${key}: read-back sha ${short(readBackSha)} ≠ local ${short(localSha)}`)

  return {
    ine,
    key,
    bytes: body.length,
    sha256: localSha,
    readBackSha256: readBackSha,
    readBackBytes: readBack.length,
    backupPath,
  }
}

// ============================================================================
// Presentación
// ============================================================================

function imageLicenseOf(data: WikipediaEnrichment): string {
  const fromThumb = data.wikipedia?.thumbnail?.license
  if (fromThumb !== undefined && fromThumb !== '') return fromThumb
  const fromWikidata = data.wikidata?.mainImageLicense
  if (fromWikidata !== undefined && fromWikidata !== '') return fromWikidata
  if (data.wikipedia?.thumbnail !== undefined || data.wikidata?.mainImage !== undefined) return 'libre (sin nombre)'
  return 'omitida'
}

function summaryLine(data: WikipediaEnrichment, nombre: string): string {
  return [
    pad(data.ineCode, 5),
    pad(nombre, 22),
    pad(data.status, 9),
    pad(data.wikipedia?.title ?? '—', 34),
    pad(data.wikidata?.qid ?? '—', 11),
    padStart(String(data.heritageSites.length), 6),
    imageLicenseOf(data),
  ].join('  ')
}

const TABLE_HEADER = [
  pad('INE', 5),
  pad('MUNICIPIO', 22),
  pad('ESTADO', 9),
  pad('ARTÍCULO WIKIPEDIA', 34),
  pad('QID', 11),
  padStart('BIENES', 6),
  'IMAGEN (LICENCIA)',
].join('  ')

// ============================================================================
// Principal
// ============================================================================

interface ManifestItem {
  ine: string
  municipio: string
  provincia: string
  status: WikipediaEnrichment['status']
  wikipediaTitle: string | null
  wikidataQid: string | null
  heritageCount: number
  imageLicense: string
  key: string
  bytes: number
  sha256: string | null
}

async function main(): Promise<void> {
  const args = parseArgs()
  const started = Date.now()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  mkdirSync(AUDIT_DIR, { recursive: true })

  const all = await loadMunicipios()
  const targets = selectTargets(all, args)
  if (targets.length === 0) {
    console.error('ABORTADO: sin municipios objetivo.')
    process.exitCode = 1
    return
  }

  const mode = args.probe ? 'PROBE' : args.write ? 'WRITE' : 'DRY-RUN'
  console.log(
    `SOCideas · enriquecimiento Wikipedia · modo ${mode} · ${targets.length} municipio(s) · ` +
      `lotes de ${BATCH_SIZE} con ${BATCH_PAUSE_MS} ms de pausa · prefijo sociideas/wikipedia/`,
  )

  const r2 = args.write ? r2Client() : null
  if (args.write && r2 === null) {
    console.error('FALLO: --write necesita R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET en .env.local')
    process.exitCode = 1
    return
  }

  const results: { row: MunicipioRow; data: WikipediaEnrichment }[] = []
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE)
    for (const row of batch) {
      const t0 = Date.now()
      const data = await getWikipediaMunicipalityData(row.nombre, row.provincia, row.codigo_ine)
      results.push({ row, data })
      console.log(`${summaryLine(data, row.nombre)}  (${Date.now() - t0} ms)`)
    }
    if (i + BATCH_SIZE < targets.length) await pause(BATCH_PAUSE_MS)
  }

  // ---- manifiesto (siempre en tmp/audit, nunca en R2) ----
  const manifestItems: ManifestItem[] = results.map(({ row, data }) => {
    const body = Buffer.from(JSON.stringify(data), 'utf8')
    return {
      ine: data.ineCode,
      municipio: row.nombre,
      provincia: row.provincia,
      status: data.status,
      wikipediaTitle: data.wikipedia?.title ?? null,
      wikidataQid: data.wikidata?.qid ?? null,
      heritageCount: data.heritageSites.length,
      imageLicense: imageLicenseOf(data),
      key: wikipediaEnrichmentKey(data.ineCode),
      bytes: body.length,
      sha256: sha256(body),
    }
  })

  const counts = results.reduce<Record<string, number>>((acc, { data }) => {
    acc[data.status] = (acc[data.status] ?? 0) + 1
    return acc
  }, {})

  // ---- escritura real (solo con --write) ----
  const evidence: WriteEvidence[] = []
  const failures: string[] = []
  if (args.write && r2 !== null) {
    const backupDir = path.join(BACKUP_ROOT, stamp)
    for (const { row, data } of results) {
      const body = Buffer.from(JSON.stringify(data), 'utf8')
      try {
        const ev = await writeWithEvidence(r2, row.codigo_ine, body, backupDir)
        evidence.push(ev)
        console.log(
          `PUT ${ev.key} · ${ev.bytes} B · sha ${short(ev.sha256)} · read-back OK (${ev.readBackBytes} B, sha coincide)`,
        )
      } catch (err) {
        failures.push(`${row.codigo_ine}: ${err instanceof Error ? err.message : 'error desconocido'}`)
      }
    }
  }

  // ---- informe de sonda ----
  if (args.probe) {
    const lines: string[] = []
    lines.push(`SOCideas · sonda Wikipedia/Wikidata · ${new Date().toISOString()} · ${targets.length} municipios`)
    lines.push('')
    lines.push(TABLE_HEADER)
    lines.push('-'.repeat(Math.max(TABLE_HEADER.length, 100)))
    for (const { row, data } of results) lines.push(summaryLine(data, row.nombre))
    lines.push('')
    lines.push(`Estados: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' · ')}`)
    lines.push('')
    lines.push('Detalle:')
    for (const { row, data } of results) {
      lines.push(`- ${row.codigo_ine} ${row.nombre} (${row.provincia}) → ${data.status}`)
      if (data.wikipedia !== null) {
        lines.push(
          `    artículo: ${data.wikipedia.title} · página ${data.wikipedia.pageId} · ` +
            `${data.wikipedia.summary.length} caracteres · rev ${data.wikipedia.lastRevision ?? '—'}`,
        )
        lines.push(`    imagen: ${data.wikipedia.thumbnail?.url ?? 'ninguna'} · licencia ${data.wikipedia.thumbnail?.license ?? '—'}`)
      }
      if (data.wikidata !== null) {
        lines.push(
          `    wikidata: ${data.wikidata.qid} · web ${data.wikidata.officialWebsite ?? '—'} · ` +
            `coords ${data.wikidata.coordinates ? `${data.wikidata.coordinates.lat.toFixed(4)}, ${data.wikidata.coordinates.lon.toFixed(4)}` : '—'} · ` +
            `fundación ${data.wikidata.founded ?? '—'} · P300 ${data.wikidata.ineCode ?? '—'}`,
        )
      }
      if (data.heritageSites.length > 0) {
        lines.push(
          `    bienes (${data.heritageSites.length}): ` +
            data.heritageSites
              .slice(0, 8)
              .map((s) => `${s.title} [${s.heritageType}]${s.imageLicense ? ` img:${s.imageLicense}` : ''}`)
              .join(' | '),
        )
      }
    }
    lines.push('')
    lines.push(`Duración: ${Date.now() - started} ms`)
    writeFileSync(PROBE_REPORT, `${lines.join('\n')}\n`, 'utf8')
    console.log(`Informe de sonda: ${PROBE_REPORT}`)
  }

  const manifestPath = path.join(AUDIT_DIR, `wikipedia-sync-manifest-${stamp}.json`)
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        schema: 'socideas-wikipedia-enrichment-manifest@1',
        generatedAt: new Date().toISOString(),
        mode,
        prefix: 'socideas/wikipedia',
        counts,
        total: manifestItems.length,
        evidence,
        failures,
        items: manifestItems,
      },
      null,
      2,
    ),
    'utf8',
  )

  console.log('')
  console.log(`Estados: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' · ')}`)
  console.log(`Manifiesto: ${manifestPath}`)
  if (args.write) {
    console.log(`Escritos con read-back OK: ${evidence.length}/${results.length} · backups en ${path.join(BACKUP_ROOT, stamp)}`)
  } else {
    console.log('DRY-RUN: no se ha escrito nada en R2.')
  }
  if (failures.length > 0) {
    for (const f of failures) console.error(`FALLO ${f}`)
    process.exitCode = 1
  }
  console.log(`Duración total: ${Date.now() - started} ms`)
}

main().catch((error: unknown) => {
  console.error(`ERROR ${error instanceof Error ? error.message : 'desconocido'}`)
  process.exitCode = 1
})
