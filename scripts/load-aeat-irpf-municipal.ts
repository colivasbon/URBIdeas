/**
 * Carga AEAT · Estadística de declarantes del IRPF por municipios (EDM) 2023
 * en el envelope R2 v2 (`socideas/v2/municipios/{INE-5}.json`), slug
 * `irpf_declaraciones` (fuente `aeat_edm`, tableId `EDM2023`).
 *
 * FUENTE (verificada en vivo 2026-09-22): ANEXO oficial con 17 XLSX, uno por CCAA:
 *   https://sede.agenciatributaria.gob.es/AEAT/Contenidos_Comunes/La_Agencia_Tributaria/
 *   Estadisticas/Publicaciones/sites/irpfmunicipios_ccaa/2023/docs/irpf_municipios_ccaa/
 *   2023/irpf_municipios_ccaa-2023_{CCAA}.xlsx
 *   → 200, ~3 MB c/u. SHA-256 registrado en tmp/aeat-edm-2023-manifest.json.
 *
 * CONTRATO DE PARSER (hoja "1.1", fijo en las 17):
 *   - Cabecera municipal: fila con col7 === "Código Municipio".
 *   - Col "Número total declaraciones" detectada en esa cabecera (varía por CCAA).
 *   - Fila municipal: col6 termina en "-NNNNN" (p. ej. "Abengibre-02001") y
 *     col7 === ese mismo NNNNN. Las filas de CCAA/provincia NO cumplen eso
 *     (col6/col7 son importes), así que quedan excluidas por construcción.
 *   - Formato numérico: separador de miles con coma ("33,717" = 33717).
 *   - Secreto estadístico: "S.E." → value null (NUNCA 0). Ausente → missing.
 *
 * COBERTURA FORAL: Navarra y País Vasco NO aparecen entre los 17 ficheros
 *   (régimen foral). Esos municipios quedan MISSING con explicación; JAMÁS se
 *   imputa un dato AEAT a un territorio foral.
 *
 * INTEGRIDAD: merge directo en el envelope v2 — solo se añade/sustituye la fila
 *   `irpf_declaraciones`; NO se toca ningún otro slug (demografía, ADRH, DIRCE,
 *   SEPE, TGSS, elecciones…). Verificado por read-back.
 *
 * Uso:
 *   npx tsx scripts/load-aeat-irpf-municipal.ts --dry-run
 *   npx tsx scripts/load-aeat-irpf-municipal.ts --confirm-r2-write
 */

import { config } from 'dotenv'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { getMunicipioJsonRaw, putMunicipioJson } from '../src/lib/socideas-r2'
import type { R2MunicipioEnvelopeV2 } from '../src/lib/socideas-r2'

config({ path: '.env.local' })

const ANIO = 2023
const TABLE_ID = 'EDM2023'
const IND_SLUG = 'irpf_declaraciones'
const SRC_SLUG = 'aeat_edm'
const ORGANISMO = 'Agencia Estatal de Administración Tributaria'
const FUENTE_NOMBRE = 'Estadística de declarantes del IRPF por municipios (EDM)'
const UNIT = 'declaraciones'
const BASE = 'https://sede.agenciatributaria.gob.es/AEAT/Contenidos_Comunes/La_Agencia_Tributaria/Estadisticas/Publicaciones/sites/irpfmunicipios_ccaa/2023/docs/irpf_municipios_ccaa/2023'

const CCAA = [
  'Andalucia', 'Aragon', 'Baleares', 'Canarias', 'Cantabria', 'Castilla-LaMancha',
  'CastillayLeon', 'Catalunia', 'ComunidaddeMadrid', 'ComunidadValenciana', 'Extremadura',
  'Galicia', 'Murcia', 'PrincipadodeAsturias', 'LaRioja', 'Ceuta', 'Melilla',
] as const

const fileUrl = (ccaa: string): string => `${BASE}/irpf_municipios_ccaa-2023_${ccaa}.xlsx`
const CACHE = path.join(process.cwd(), 'tmp', 'aeat-irpf')

type Cell = { v: number | null; seco: boolean }

async function download(ccaa: string): Promise<{ buf: Buffer; url: string; sha256: string }> {
  const url = fileUrl(ccaa)
  const cachePath = path.join(CACHE, `${ccaa}.xlsx`)
  if (fs.existsSync(cachePath)) {
    const buf = fs.readFileSync(cachePath)
    return { buf, url, sha256: crypto.createHash('sha256').update(buf).digest('hex') }
  }
  let lastErr: unknown
  for (let a = 1; a <= 4; a++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(300_000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length < 10_000) throw new Error(`fichero sospechoso (${buf.length} B)`)
      fs.mkdirSync(CACHE, { recursive: true })
      fs.writeFileSync(cachePath, buf)
      return { buf, url, sha256: crypto.createHash('sha256').update(buf).digest('hex') }
    } catch (e) { lastErr = e; await new Promise((x) => setTimeout(x, 8000 * a)) }
  }
  throw new Error(`${ccaa}: ${lastErr}`)
}

function parseValue(raw: unknown): Cell {
  const s = String(raw ?? '').trim()
  if (s === '') return { v: null, seco: false }
  if (/^S\.?E\.?$/i.test(s) || s === '.' || s === '..') return { v: null, seco: true }
  const clean = s.replace(/,/g, '')
  if (!/^-?\d+$/.test(clean)) return { v: null, seco: true }
  return { v: parseInt(clean, 10), seco: false }
}

const norm = (x: unknown): string => String(x ?? '').replace(/\s+/g, ' ').trim()

/** Parsea la hoja "1.1": devuelve ine → {declaraciones}. */
export function parseDeclaraciones(buf: Buffer, ccaa: string): Map<string, Cell> {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false })
  const ws = wb.Sheets['1.1']
  if (!ws) throw new Error(`${ccaa}: sin hoja "1.1"`)
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: false, blankrows: false })
  const out = new Map<string, Cell>()
  let declCol = -1
  for (const row of aoa) {
    const c = row ?? []
    if (norm(c[7]) === 'Código Municipio') {
      declCol = c.findIndex((v) => norm(v) === 'Número total declaraciones')
      if (declCol < 0) throw new Error(`${ccaa}: cabecera sin "Número total declaraciones"`)
      continue
    }
    if (declCol < 0) continue
    const c7 = norm(c[7])
    if (!/^\d{5}$/.test(c7)) continue // filas de CCAA/provincia llevan coma («48,149») o vacío
    const c6 = norm(c[6])
    if (c6 !== '' && /^[\d.,\s]+$/.test(c6)) continue // col6 numérico = agregado, no municipio
    const m = /-(\d{5})\s*$/.exec(c6)
    const ine = m ? m[1] : c7 // Ceuta/Melilla: col6 sin sufijo → se usa col7
    if (m && m[1] !== c7) continue // incoherencia nombre/código → excluida
    out.set(ine, parseValue(c[declCol]))
  }
  if (out.size === 0) throw new Error(`${ccaa}: 0 filas municipales parseadas`)
  return out
}

function asV2(raw: Awaited<ReturnType<typeof getMunicipioJsonRaw>>, ine: string): R2MunicipioEnvelopeV2 | null {
  if (!raw || (raw as { version?: number }).version !== 2) return null
  const env = raw as unknown as R2MunicipioEnvelopeV2
  return env.codigo_ine === ine && Array.isArray(env.valores) ? env : null
}

/** Merge directo: solo añade/sustituye la fila irpf_declaraciones. */
function mergeRow(env: R2MunicipioEnvelopeV2, cell: Cell | undefined): void {
  let ii = env.indicators.findIndex((i) => i.slug === IND_SLUG)
  if (ii < 0) {
    env.indicators.push({ slug: IND_SLUG, nombre: 'Número de declaraciones de IRPF', unidad: UNIT })
    ii = env.indicators.length - 1
  }
  let si = env.sources.findIndex((s) => s.slug === SRC_SLUG)
  if (si < 0) {
    env.sources.push({ slug: SRC_SLUG, organismo: ORGANISMO, nombre: FUENTE_NOMBRE })
    si = env.sources.length - 1
  }
  void si // la fuente se resuelve por tableId en expand; se asegura solo la presencia
  const url = `${BASE}/irpf_municipios_ccaa-2023_${'…'}.xlsx`
  void url
  let ui = env.source_urls.findIndex((u) => u.startsWith('https://sede.agenciatributaria.gob.es/') && u.includes('irpf_municipios_ccaa'))
  if (ui < 0) {
    env.source_urls.push(fileUrl('Andalucia'))
    ui = env.source_urls.length - 1
  }
  const dim = { ambito: 'municipio' }
  const key = JSON.stringify(dim)
  let di = env.dimensiones.findIndex((d) => JSON.stringify(d) === key)
  if (di < 0) { env.dimensiones.push(dim); di = env.dimensiones.length - 1 }

  // Idempotente: elimina filas previas de este indicador.
  env.valores = env.valores.filter((t) => env.indicators[t[0]]?.slug !== IND_SLUG)

  if (cell === undefined) return // missing: sin cobertura (foral / umbral)
  const estado = cell.v === null ? (cell.seco ? 'suprimido' : 'ausente') : 'validado'
  env.valores.push([ii, ANIO, cell.v, UNIT, di, ui, TABLE_ID, null, estado])
}

const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const confirmWrite = args.includes('--confirm-r2-write')
const sampleN = (() => { const i = args.indexOf('--sample'); return i >= 0 ? parseInt(args[i + 1] ?? '100', 10) : 0 })()

const FIXTURES: Array<[string, string, 'esperado' | 'foral']> = [
  ['28079', 'Madrid', 'esperado'], ['02003', 'Albacete', 'esperado'],
  ['02001', 'Abengibre (pequeño)', 'esperado'], ['35016', 'Las Palmas (Canarias)', 'esperado'],
  ['51001', 'Ceuta', 'esperado'], ['52001', 'Melilla', 'esperado'],
  ['31201', 'Pamplona (Navarra)', 'foral'], ['48013', 'Bilbao (País Vasco)', 'foral'],
]

async function main() {
  console.log('=== AEAT EDM 2023 → envelope R2 v2 · slug irpf_declaraciones ===')
  console.log(`Modo: ${isDryRun ? 'DRY-RUN' : confirmWrite ? 'ESCRITURA R2' : 'REVISIÓN (sin flag)'}`)
  if (!isDryRun && !confirmWrite) { console.error('Falta --dry-run o --confirm-r2-write'); process.exit(1) }

  // 1. Descarga de las 17 fuentes + manifest
  const merged = new Map<string, Cell>()
  const manifest: Array<Record<string, unknown>> = []
  for (const ccaa of CCAA) {
    const { buf, url, sha256 } = await download(ccaa)
    const parsed = parseDeclaraciones(buf, ccaa)
    manifest.push({ ccaa, url, sha256, bytes: buf.length, municipios: parsed.size, fecha: new Date().toISOString() })
    for (const [ine, cell] of parsed) if (!merged.has(ine)) merged.set(ine, cell)
    console.log(`  ${ccaa.padEnd(22)} ${String(buf.length).padStart(9)} B · sha256 ${sha256.slice(0, 12)}… · ${parsed.size} mun`)
  }
  const mDir = path.join(process.cwd(), 'tmp'); fs.mkdirSync(mDir, { recursive: true })
  const runId = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const manPath = path.join(mDir, `aeat-edm-2023-manifest-${runId}.json`)
  fs.writeFileSync(manPath, JSON.stringify({ runId, anio: ANIO, tableId: TABLE_ID, ficheros: manifest, total: manifest.length }, null, 2))
  console.log(`  Manifest: ${path.relative(process.cwd(), manPath)} (${manifest.length} ficheros)`)
  console.log(`  Municipios con declaraciones: ${merged.size}`)

  // 2. Fixtures (cobertura foral incluida)
  console.log('  --- Fixtures ---')
  let foralOK = 0
  for (const [ine, label, kind] of FIXTURES) {
    const c = merged.get(ine)
    if (kind === 'foral') {
      const ok = c === undefined
      if (ok) foralOK++
      console.log(`    ${ine} ${label}: ${c ? 'CON DATO AEAT (⚠ inesperado)' : 'missing foral ✓ (sin imputación)'} `)
    } else {
      console.log(`    ${ine} ${label}: ${c ? (c.v === null ? 'S.E. (secreto)' : c.v) : 'sin fila (missing)'}`)
    }
  }
  console.log(`  Cobertura foral correcta: ${foralOK}/${FIXTURES.filter((f) => f[2] === 'foral').length}`)

  const allIne = [...merged.keys()].sort()
  const sample = sampleN > 0 ? allIne.slice(0, sampleN) : []

  // 3. Dry-run: leer envelopes y simular merge (sin escribir)
  console.log(`  --- Lectura envelopes (${sample.length > 0 ? sample.length + ' muestra' : 'nación'}) ---`)
  let envelopesOK = 0, envelopesSkip = 0, preservedOK = 0, bytesMax = 0
  const target = sample.length > 0 ? sample : allIne
  for (const ine of target) {
    try {
      const raw = await getMunicipioJsonRaw(ine)
      const env = asV2(raw, ine)
      if (!env) { envelopesSkip++; continue }
      const before = env.valores.length
      const slugsBefore = new Set(env.indicators.map((i) => i.slug))
      mergeRow(env, merged.get(ine))
      // preservación: todos los slugs previos siguen presentes
      const slugsAfter = new Set(env.indicators.map((i) => i.slug))
      const lost = [...slugsBefore].filter((s) => !slugsAfter.has(s))
      if (lost.length === 0) preservedOK++
      else console.error(`    ${ine}: PERDIÓ slugs → ${lost.join(',')}`)
      const size = Buffer.byteLength(JSON.stringify(env), 'utf-8')
      if (size > bytesMax) bytesMax = size
      if (size > 150 * 1024) console.error(`    ${ine}: SUPERA 150 KB (${size})`)
      if (env.valores.length < before) console.error(`    ${ine}: se eliminaron filas (${before}→${env.valores.length})`)
      envelopesOK++
    } catch (e) { envelopesSkip++; console.error(`    ${ine}: ${(e as Error).message}`) }
  }
  console.log(`  Envelopes leíbles: ${envelopesOK} · sin envelope v2: ${envelopesSkip} · slugs preservados: ${preservedOK}/${envelopesOK} · bytes máx: ${bytesMax}`)

  if (isDryRun) {
    fs.writeFileSync(path.join(mDir, `aeat-edm-2023-dryrun-${runId}.json`), JSON.stringify({ runId, cobertura: merged.size, envelopesOK, preservedOK, bytesMax, foralOK }, null, 2))
    console.log('=== DRY-RUN COMPLETADO — sin escritura ===')
    return
  }

  // 4. Carga nacional (concurrency) sobre TODOS los municipios
  console.log('--- Escritura R2 v2 (merge por bloque) ---')
  const CONC = 25
  let written = 0, skipped = 0, missingSet = 0
  const errors: string[] = []
  const list = allIne
  let idx = 0
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < list.length) {
      const ine = list[idx++]
      try {
        const raw = await getMunicipioJsonRaw(ine)
        const env = asV2(raw, ine)
        if (!env) { skipped++; continue }
        mergeRow(env, merged.get(ine))
        if (!merged.has(ine)) missingSet++
        const size = Buffer.byteLength(JSON.stringify(env), 'utf-8')
        if (size > 150 * 1024) { errors.push(`${ine}: ${size} B > 150 KB`); continue }
        await putMunicipioJson(ine, env)
        written++
        if (written % 500 === 0) console.log(`  Escritos: ${written}/${list.length}`)
      } catch (e) { errors.push(`${ine}: ${e}`) }
    }
  }))
  console.log(`  Escritos: ${written} · sin envelope v2: ${skipped} · marcados missing: ${missingSet} · errores: ${errors.length}`)
  if (errors.length) console.error('  Primeros:', errors.slice(0, 5).join(' | '))

  // 5. Read-back (cache-buster por relectura S3 directa)
  console.log('--- Read-back ---')
  for (const [ine, label] of [['28079', 'Madrid'], ['02003', 'Albacete'], ['02001', 'Abengibre'], ['31201', 'Pamplona-foral'], ['48013', 'Bilbao-foral']] as Array<[string, string]>) {
    try {
      const raw = await getMunicipioJsonRaw(ine)
      const env = asV2(raw, ine)
      if (!env) { console.log(`  ${ine} ${label}: sin envelope`); continue }
      const rows = env.valores.filter((t) => env.indicators[t[0]]?.slug === IND_SLUG)
      const slugs = env.indicators.length
      const row = rows[0]
      console.log(`  ${ine} ${label}: irpf_declaraciones=${rows.length ? `${row?.[2]} (${row?.[8]})` : 'ausente'} · indicadores=${slugs} · version=${(env as { version?: number }).version}`)
    } catch { console.log(`  ${ine}: ERROR`) }
  }

  console.log(`\n=== CARGA COMPLETADA ===\nRunId: ${runId}\nEscritos: ${written}\nAño: ${ANIO}\nManifest: ${path.relative(process.cwd(), manPath)}`)
}

main().catch((e) => { console.error('Error fatal:', e); process.exit(1) })
