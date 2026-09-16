// Carga REAL nacional del bloque densidad (Batch 1) en R2 – con autorización expresa.
// Uso:
//   npx tsx scripts/load-densidad-batch1.ts --parse-only
//   npx tsx scripts/load-densidad-batch1.ts --parse-only --limit 2000 --offset 0
//   npx tsx scripts/load-densidad-batch1.ts --parse-only --codes=01001,28079
//   npx tsx scripts/load-densidad-batch1.ts --write --limit 500 --offset 0
//   npx tsx scripts/load-densidad-batch1.ts --mock --write   → exit 1 (escritura con mock imposible)
//
// Reglas:
// - MERGE por municipio: lee el JSON existente, sustituye SOLO slugs de densidad
//   (area_km2, density_per_km2), preserva demografía y economía.
// - Sin JSON previo: crea documento mínimo v2 y lo reporta aparte.
// - Superficie: IGN IGN_INFOGEO_MUNICIPIOS.xlsx (reutiliza copia verificada de
//   tmp/density-sample/ o tmp/density-100/ si existe; si no, descarga real).
//   Cobertura IGN 8.132; sin superficie → missing honesto ("sin superficie
//   oficial"), nunca se estima ni se escribe 0.
// - Población: reutilizada del envelope vivo (population_total, ámbito municipio,
//   último año); no recarga padrón.
// - Densidad = población / superficie, INDICADOR DERIVADO (cálculo SOCideas).
//   Años por componente + aviso si no contemporáneos (nunca mezclar en silencio).
// - Reutiliza tmp/density/ (no re-descarga lo verificado).
// - --parse-only: NO toca R2 ni Supabase (solo lectura pública R2 + IGN).
//   Mide bytes por municipio (base viva + delta simulado), verifica presupuesto
//   150 KB y cuenta densidad real vs missing. Manifest reanudable
//   tmp/density/dryrun-manifest.json (+ dryrun-summary.json y samples/).
// - --write: PUT + read-back con cache-buster + manifest reanudable
//   tmp/density/r2-load-manifest.json. Registra data_sync_runs
//   tipo=densidad_batch1. Requiere .env.local (service_role + R2).
// - NUNCA imprime secretos (solo presencia/longitud).
//
// DEPENDENCIA EXTERNA (fichero compartido fuera del alcance de este script):
//   El lector v2 (`expandV2Envelope` en src/lib/socideas-r2.ts) resuelve la
//   fuente por `tableId`. Para que la fila de superficie se atribuya a
//   `ign_infogeo` en vez de caer al fallback `sources[0]`, el orquestador debe
//   fusionar UNA línea en `sourceSlugForTable` (src/lib/socideas-r2.ts).
//   LÍNEA EXACTA PROPUESTA (a insertar junto al resto de correspondencias):
//     if (tableId === 'NGMEP') return 'ign_infogeo'
//   Sin esa línea, la fila de superficie quedaría mal atribuida (fallback INE).
//   Este script NO modifica src/lib/socideas-r2.ts; el dry-run demuestra el
//   diseño con esa correspondencia aplicada en local.

import { createHash } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { existsSync, readFileSync, statSync } from 'fs'
import { dirname, join } from 'path'
import * as XLSX from 'xlsx'
import {
  expandV2Envelope,
  putMunicipioJson,
  readMunicipioJson,
  toV2Envelope,
} from '../src/lib/socideas-r2'
import type { R2MunicipioEnvelopeV2 } from '../src/lib/socideas-r2'
import {
  ANIO_SUPERFICIE,
  AREA_SLUG,
  AREA_UNIT,
  DENSITY_SLUG,
  DENSITY_UNIT,
  IGN_INFOGEO_SOURCE,
  IGN_SURFACE_URLS,
  NGMEP_TABLE_ID,
  calcDensity,
} from '../src/lib/socideas-density'

const TMP = join(process.cwd(), 'tmp/density')
const SAMPLE_TMP = join(process.cwd(), 'tmp/density-sample/IGN_INFOGEO_MUNICIPIOS_2026-09-16.xlsx')
const SAMPLE100_TMP = join(process.cwd(), 'tmp/density-100')
const IGN_XLSX = join(TMP, 'IGN_INFOGEO_MUNICIPIOS_2026-09-16.xlsx')
const SURFACE_ROWS_PATH = join(TMP, 'surface_rows.json')
const MANIFEST_PATH = join(TMP, 'r2-load-manifest.json')
const DRYRUN_MANIFEST_PATH = join(TMP, 'dryrun-manifest.json')
const DRYRUN_SUMMARY_PATH = join(TMP, 'dryrun-summary.json')
const DRYRUN_SAMPLES_DIR = join(TMP, 'samples')
const CATALOG_PATH = join(process.cwd(), 'scripts/data/municipios-ine.json')
const MAX_ADDED_BYTES = 150 * 1024
const MUNI_DIM = JSON.stringify({ ambito: 'municipio' })
const R2_BASE_DEFAULT = 'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'

const DENSITY_SLUGS = new Set<string>([AREA_SLUG, DENSITY_SLUG])

// Carga .env.local sin dependencias (nunca imprime valores)
function loadEnvLocal() {
  try {
    const txt = readFileSync(join(process.cwd(), '.env.local'), 'utf8')
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
    }
  } catch { /* sin .env.local: fallará al necesitar credenciales */ }
}
loadEnvLocal()
const envOk = (k: string) => (process.env[k] ? `OK(${process.env[k]!.length}c)` : 'FALTA')
console.log(`[env] SUPABASE_URL=${envOk('NEXT_PUBLIC_SUPABASE_URL')} SERVICE_ROLE=${envOk('SUPABASE_SERVICE_ROLE_KEY')} R2_BASE=${envOk('NEXT_PUBLIC_SOCIDEAS_R2_BASE')} R2_BUCKET=${envOk('R2_BUCKET')}`)

async function dl(url: string, dest: string): Promise<{ status: number; bytes: number; sha256: string }> {
  if (existsSync(dest) && statSync(dest).size > 0) {
    const buf = await readFile(dest)
    const h = createHash('sha256').update(buf).digest('hex')
    console.log(`[reuse] ${dest} ${buf.length}B sha256:${h}`)
    return { status: 200, bytes: buf.length, sha256: h }
  }
  const res = await fetch(url, { headers: { 'User-Agent': 'URBIdeas/1.0' } })
  if (!res.ok) throw new Error(`Descarga fallida ${url} → HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const h = createHash('sha256').update(buf).digest('hex')
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, buf)
  console.log(`[dl] ${url} → ${res.status} ${buf.length}B sha256:${h}`)
  return { status: res.status, bytes: buf.length, sha256: h }
}

interface SurfaceEntry { nombre: string; superficieKm2: number }

function parseIgnSurfaces(path: string): Map<string, SurfaceEntry> {
  const wb = XLSX.readFile(path)
  const sheet = wb.Sheets['IGN_INFOGEO_MUNICIPIOS']
  if (!sheet) throw new Error(`Hoja IGN_INFOGEO_MUNICIPIOS ausente en ${path}`)
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]
  const header = rows[0] as string[]
  if (header[0] !== 'Identificador' || header[3] !== 'Superficie (km2)') {
    throw new Error(`Cabecera IGN inesperada en ${path}: ${JSON.stringify(header.slice(0, 7))}`)
  }
  const out = new Map<string, SurfaceEntry>()
  for (const r of rows.slice(1)) {
    if (!Array.isArray(r) || !/^\d{5}$/.test(String(r[0] ?? ''))) continue
    const sup = Number(r[3])
    if (Number.isFinite(sup) && sup > 0) out.set(String(r[0]), { nombre: String(r[1] ?? ''), superficieKm2: sup })
  }
  return out
}

interface R2V2Loose {
  version: number
  codigo_ine: string
  generado_en: string
  indicators: { slug: string; nombre: string; unidad: string | null }[]
  sources: { slug: string; organismo: string; nombre: string }[]
  source_urls: string[]
  dimensiones: Record<string, string>[]
  valores: [number, number, number | null, string | null, number, number, string | null, string | null, string][]
}

function latestMunicipalPop(env: R2V2Loose): { anio: number; valor: number; urlIdx: number; tableId: string | null; serieId: string | null } | null {
  const popIdx = env.indicators.findIndex((i) => i.slug === 'population_total')
  if (popIdx < 0) return null
  let pop: { anio: number; valor: number; urlIdx: number; tableId: string | null; serieId: string | null } | null = null
  for (const t of env.valores) {
    if (t[0] !== popIdx || t[2] === null) continue
    if (JSON.stringify(env.dimensiones[t[4]]) !== MUNI_DIM) continue
    if (!pop || t[1] > pop.anio) pop = { anio: t[1], valor: t[2] as number, urlIdx: t[5], tableId: t[6], serieId: t[7] }
  }
  return pop
}

/** Delta simulado sobre el envelope vivo (append; primera carga: sin slugs previos). */
function simulateDelta(env: R2V2Loose, sup: SurfaceEntry | null): { deltaBytes: number; bytesAntes: number; bytesDespues: number; densidad: number | null; filas: number } {
  const pop = latestMunicipalPop(env)
  const calc = calcDensity({
    poblacion: pop?.valor ?? null,
    anioPoblacion: pop?.anio ?? null,
    superficieKm2: sup?.superficieKm2 ?? null,
    anioSuperficie: ANIO_SUPERFICIE,
  })
  const indicators = [...env.indicators,
    { slug: AREA_SLUG, nombre: 'Superficie municipal', unidad: AREA_UNIT },
    { slug: DENSITY_SLUG, nombre: 'Densidad de población', unidad: DENSITY_UNIT }]
  const sources = [...env.sources, { ...IGN_INFOGEO_SOURCE }]
  const sourceUrls = [...env.source_urls]
  for (const u of IGN_SURFACE_URLS) if (!sourceUrls.includes(u)) sourceUrls.push(u)
  const dimMuni = env.dimensiones.findIndex((d) => JSON.stringify(d) === MUNI_DIM)
  const urlIgn = sourceUrls.indexOf(IGN_SURFACE_URLS[0])
  const areaIdx = indicators.length - 2
  const densIdx = indicators.length - 1
  const delta: R2V2Loose['valores'] = []
  if (sup) delta.push([areaIdx, ANIO_SUPERFICIE, sup.superficieKm2, AREA_UNIT, dimMuni, urlIgn, NGMEP_TABLE_ID, null, 'validado'])
  if (pop && calc.valor !== null) delta.push([densIdx, pop.anio, calc.valor, DENSITY_UNIT, dimMuni, pop.urlIdx, pop.tableId, null, 'validado'])
  const bytesAntes = JSON.stringify(env).length
  const merged: R2V2Loose = { ...env, indicators, sources, source_urls: sourceUrls, valores: [...env.valores, ...delta] }
  const bytesDespues = JSON.stringify(merged).length
  return { deltaBytes: bytesDespues - bytesAntes, bytesAntes, bytesDespues, densidad: calc.valor, filas: delta.length }
}

async function fetchR2Json(url: string, intentos = 4): Promise<{ status: number; json: () => Promise<unknown>; text: () => Promise<string> }> {
  let espera = 1000
  for (let i = 1; ; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'URBIdeas/1.0', Accept: 'application/json' } })
    if (res.status !== 429 || i >= intentos) return res as unknown as { status: number; json: () => Promise<unknown>; text: () => Promise<string> }
    const retryAfter = Number(res.headers.get('retry-after'))
    await res.text().catch(() => '')
    await new Promise((r) => setTimeout(r, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : espera))
    espera *= 2
  }
}

async function mapPool<T>(items: T[], n: number, fn: (item: T, idx: number) => Promise<void>): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      await fn(items[i], i)
    }
  })
  await Promise.all(workers)
}

type DryEstado = 'ok' | 'sin_superficie' | 'sin_poblacion' | 'sin_envelope' | 'error' | 'presupuesto'
interface DryItem { bytesAntes: number; bytesDespues: number; deltaBytes: number; estado: DryEstado; densidad: number | null; superficie: number | null; anio_pob: number | null; aviso_anios: boolean; detalle?: string }

async function runDryRunNacional(
  surfaces: Map<string, SurfaceEntry>,
  opts: { limit: number; offset: number; onlyCodes: string[] | null; force: boolean },
): Promise<void> {
  const base = (process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE || R2_BASE_DEFAULT).replace(/\/$/, '')
  const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8')) as { codigo_ine: string }[]
  const nacional = [...new Set(catalog.map((e) => e.codigo_ine).filter((c) => /^\d{5}$/.test(c)))].sort()
  console.log(`[catalogo] municipios-ine.json: ${nacional.length} códigos únicos`)
  const slice = opts.onlyCodes ?? nacional.slice(opts.offset, opts.limit > 0 ? opts.offset + opts.limit : undefined)
  if (opts.onlyCodes) {
    for (const c of opts.onlyCodes) {
      if (!nacional.includes(c)) {
        console.error(`ERROR: ${c} no existe en el catálogo local`)
        process.exit(1)
      }
    }
  }
  console.log(`[dry-run] tramo: ${slice.length} municipios (offset=${opts.offset} limit=${opts.limit}${opts.onlyCodes ? ' codes' : ''})`)

  let manifest: { started: string; items: Record<string, DryItem> }
  try {
    manifest = JSON.parse((await readFile(DRYRUN_MANIFEST_PATH)).toString('utf8'))
  } catch {
    manifest = { started: new Date().toISOString(), items: {} }
  }
  // Reintento de errores transitorios (p. ej. HTTP 429): los estados finales
  // (ok, sin_superficie, sin_poblacion, sin_envelope, presupuesto) no se repiten.
  const pendientes = opts.force ? slice : slice.filter((ine) => !manifest.items[ine] || manifest.items[ine].estado === 'error')
  console.log(`[dry-run] pendientes de medir: ${pendientes.length}/${slice.length} (reanudable en ${DRYRUN_MANIFEST_PATH})`)

  const t0 = Date.now()
  let medidos = 0
  const muestrasOk: { ine: string; body: unknown }[] = []
  const muestrasMissing: { ine: string; body: unknown }[] = []
  await mapPool(pendientes, 4, async (ine) => {
    try {
      const res = await fetchR2Json(`${base}/socideas/v2/municipios/${ine}.json`)
      if (res.status === 404) {
        await res.text().catch(() => '')
        manifest.items[ine] = { bytesAntes: 0, bytesDespues: 0, deltaBytes: 0, estado: 'sin_envelope', densidad: null, superficie: surfaces.get(ine)?.superficieKm2 ?? null, anio_pob: null, aviso_anios: false, detalle: 'HTTP 404 sin envelope R2' }
        return
      }
      if (res.status !== 200) throw new Error(`R2 HTTP ${res.status}`)
      const env = (await res.json()) as R2V2Loose
      if (!(env.version === 2 && Array.isArray(env.valores))) throw new Error('Envelope v2 inválido')
      const sup = surfaces.get(ine) ?? null
      const pop = latestMunicipalPop(env)
      if (!sup) {
        manifest.items[ine] = { bytesAntes: JSON.stringify(env).length, bytesDespues: JSON.stringify(env).length, deltaBytes: 0, estado: 'sin_superficie', densidad: null, superficie: null, anio_pob: pop?.anio ?? null, aviso_anios: false, detalle: 'Sin superficie oficial IGN; no se estima' }
        if (muestrasMissing.length < 5) muestrasMissing.push({ ine, body: { codigo_ine: ine, superficie_km2: null, poblacion: pop, densidad_hab_km2: null, motivo: 'sin superficie oficial' } })
        return
      }
      if (!pop) {
        const sim = simulateDelta(env, sup)
        manifest.items[ine] = { bytesAntes: sim.bytesAntes, bytesDespues: sim.bytesDespues, deltaBytes: sim.deltaBytes, estado: 'sin_poblacion', densidad: null, superficie: sup.superficieKm2, anio_pob: null, aviso_anios: false, detalle: 'Sin population_total municipal en R2; solo área' }
        return
      }
      const sim = simulateDelta(env, sup)
      if (sim.deltaBytes > MAX_ADDED_BYTES) {
        manifest.items[ine] = { bytesAntes: sim.bytesAntes, bytesDespues: sim.bytesDespues, deltaBytes: sim.deltaBytes, estado: 'presupuesto', densidad: sim.densidad, superficie: sup.superficieKm2, anio_pob: pop.anio, aviso_anios: pop.anio !== ANIO_SUPERFICIE, detalle: `Presupuesto superado +${sim.deltaBytes}B` }
        return
      }
      if (sim.filas !== 2 || sim.densidad === null) {
        manifest.items[ine] = { bytesAntes: sim.bytesAntes, bytesDespues: sim.bytesDespues, deltaBytes: sim.deltaBytes, estado: 'error', densidad: sim.densidad, superficie: sup.superficieKm2, anio_pob: pop.anio, aviso_anios: false, detalle: `Delta inesperado: ${sim.filas} filas` }
        return
      }
      manifest.items[ine] = { bytesAntes: sim.bytesAntes, bytesDespues: sim.bytesDespues, deltaBytes: sim.deltaBytes, estado: 'ok', densidad: sim.densidad, superficie: sup.superficieKm2, anio_pob: pop.anio, aviso_anios: pop.anio !== ANIO_SUPERFICIE }
      if (muestrasOk.length < 10) {
        muestrasOk.push({ ine, body: { codigo_ine: ine, nombre_ign: sup.nombre, poblacion: { valor: pop.valor, anio: pop.anio }, superficie_km2: sup.superficieKm2, anio_superficie: ANIO_SUPERFICIE, densidad_hab_km2: sim.densidad, aviso_anios: pop.anio !== ANIO_SUPERFICIE, bytes: { envelope_original: sim.bytesAntes, delta: sim.deltaBytes, envelope_simulado: sim.bytesDespues } } })
      }
    } catch (e) {
      manifest.items[ine] = { bytesAntes: 0, bytesDespues: 0, deltaBytes: 0, estado: 'error', densidad: null, superficie: surfaces.get(ine)?.superficieKm2 ?? null, anio_pob: null, aviso_anios: false, detalle: String((e as Error).message).slice(0, 300) }
    } finally {
      medidos++
      if (medidos % 500 === 0) {
        await writeFile(DRYRUN_MANIFEST_PATH, JSON.stringify(manifest))
        console.log(`[progreso] ${medidos}/${pendientes.length}`)
      }
    }
  })
  await writeFile(DRYRUN_MANIFEST_PATH, JSON.stringify(manifest))

  // Resumen acumulado nacional (todas las particiones medidas hasta ahora)
  const items = Object.entries(manifest.items)
  const counts: Record<DryEstado, number> = { ok: 0, sin_superficie: 0, sin_poblacion: 0, sin_envelope: 0, error: 0, presupuesto: 0 }
  let dMin = Infinity
  let dMax = 0
  let dSum = 0
  let dN = 0
  for (const [, it] of items) {
    counts[it.estado]++
    if (it.estado === 'ok' || it.estado === 'sin_poblacion') {
      dMin = Math.min(dMin, it.deltaBytes)
      dMax = Math.max(dMax, it.deltaBytes)
      dSum += it.deltaBytes
      dN++
    }
  }
  const summary = {
    dry_run: 'densidad-nacional',
    fecha_utc: new Date().toISOString(),
    catalogo: `scripts/data/municipios-ine.json (${nacional.length})`,
    fuente_superficie: { fichero: IGN_XLSX, anio_superficie: ANIO_SUPERFICIE, municipios_con_superficie: surfaces.size, urls: [...IGN_SURFACE_URLS], licencia: 'CC BY 4.0 ign.es' },
    cobertura: { medidos: items.length, con_densidad: counts.ok, sin_superficie: counts.sin_superficie, sin_poblacion: counts.sin_poblacion, sin_envelope: counts.sin_envelope, errores: counts.error, superaciones_150kb: counts.presupuesto },
    kb: dN > 0 ? { min: +(dMin / 1024).toFixed(2), media: +((dSum / dN) / 1024).toFixed(2), max: +(dMax / 1024).toFixed(2) } : null,
    presupuesto_kb_bloque: 150,
    notas: [
      'Sin escrituras R2/Supabase, sin migraciones, sin cambios en el envelope real.',
      'Delta simulado por append (primera carga: el envelope vivo aún no trae slugs area_km2/density_per_km2).',
      'La atribución NGMEP→ign_infogeo está simulada en local (1 línea propuesta en sourceSlugForTable, fuera de alcance).',
    ],
  }
  await writeFile(DRYRUN_SUMMARY_PATH, JSON.stringify(summary, null, 2))
  await mkdir(DRYRUN_SAMPLES_DIR, { recursive: true })
  for (const m of [...muestrasOk, ...muestrasMissing]) await writeFile(join(DRYRUN_SAMPLES_DIR, `${m.ine}.json`), JSON.stringify(m.body, null, 2))
  const mins = ((Date.now() - t0) / 60000).toFixed(1)
  console.log(`[fin dry-run] tramo_medidos=${medidos} acumulado=${items.length} ok=${counts.ok} sin_superficie=${counts.sin_superficie} sin_poblacion=${counts.sin_poblacion} sin_envelope=${counts.sin_envelope} errores=${counts.error} superaciones=${counts.presupuesto} kb_min/med/max=${summary.kb ? `${summary.kb.min}/${summary.kb.media}/${summary.kb.max}` : '—'} mins=${mins}`)
  if (counts.presupuesto > 0 || counts.error > 0) {
    console.error(`FAIL: ${counts.presupuesto} superaciones de presupuesto, ${counts.error} errores`)
    process.exit(1)
  }
}

export async function main() {
  const args = process.argv.slice(2)
  const isMock = args.includes('--mock')
  const doWrite = args.includes('--write')
  if (isMock && doWrite) {
    console.error('ERROR: --mock no puede combinarse con --write. Exit 1')
    process.exit(1)
  }
  const parseOnly = args.includes('--parse-only')
  const flagVal = (name: string): number => {
    const eq = args.find((a) => a.startsWith(`${name}=`))
    if (eq) return parseInt(eq.split('=')[1], 10) || 0
    const i = args.indexOf(name)
    if (i >= 0 && args[i + 1] !== undefined) return parseInt(args[i + 1], 10) || 0
    return 0
  }
  const limit = flagVal('--limit')
  const offset = flagVal('--offset')
  const force = args.includes('--force')
  const codesArg = args.find((a) => a.startsWith('--codes='))?.split('=')[1] ?? ''
  const onlyCodes = codesArg ? codesArg.split(',').map((s) => s.trim()).filter((s) => /^\d{5}$/.test(s)) : null
  if (codesArg && (!onlyCodes || onlyCodes.length === 0)) throw new Error('--codes requiere lista de INE de 5 dígitos separados por coma')

  // FASE 1: superficie IGN a surface_rows.json (sin credenciales)
  await mkdir(TMP, { recursive: true })
  let surfaces: Map<string, SurfaceEntry>
  const needParse = !existsSync(SURFACE_ROWS_PATH) || parseOnly || onlyCodes !== null
  if (!existsSync(IGN_XLSX)) {
    const reuse = [SAMPLE_TMP, join(SAMPLE100_TMP, 'IGN_INFOGEO_MUNICIPIOS_2026-09-16.xlsx')].find((p) => existsSync(p))
    if (reuse) {
      await mkdir(dirname(IGN_XLSX), { recursive: true })
      await writeFile(IGN_XLSX, await readFile(reuse))
      console.log(`[reuse] copia verificada ${reuse} → ${IGN_XLSX}`)
    } else {
      await dl(IGN_SURFACE_URLS[0], IGN_XLSX)
    }
  } else {
    const buf = await readFile(IGN_XLSX)
    console.log(`[reuse] ${IGN_XLSX} ${buf.length}B sha256:${createHash('sha256').update(buf).digest('hex')}`)
  }
  if (needParse) {
    console.log('[fase1] Parseando superficie IGN...')
    surfaces = parseIgnSurfaces(IGN_XLSX)
    await writeFile(SURFACE_ROWS_PATH, JSON.stringify({ anio_superficie: ANIO_SUPERFICIE, superficies: [...surfaces.entries()] }))
    console.log(`[fase1] municipios con superficie: ${surfaces.size}. Guardado en ${SURFACE_ROWS_PATH}`)
  } else {
    const saved = JSON.parse((await readFile(SURFACE_ROWS_PATH)).toString('utf8')) as { superficies: [string, SurfaceEntry][] }
    surfaces = new Map(saved.superficies)
    console.log(`[fase1] superficies reutilizadas de ${SURFACE_ROWS_PATH}: ${surfaces.size}`)
  }

  if (parseOnly) {
    await runDryRunNacional(surfaces, { limit, offset, onlyCodes, force })
    return
  }

  if (!doWrite) {
    console.log('[dry-run] Superficie OK. Sin --write no se toca R2 ni Supabase. Usa --parse-only para el dry-run nacional o --write para cargar.')
    return
  }

  // FASE 2: carga con MERGE (requiere credenciales R2; Supabase opcional).
  // Sin service-role se opera en modo local: municipios desde el catálogo
  // scripts/data/municipios-ine.json, catálogos mínimos hardcodeados (valores
  // idénticos a los sembrados en Supabase) y auditoría diferida a
  // manifest.pendingAudit para bulk insert posterior con el mismo runid.
  const { createClient } = await import('@supabase/supabase-js')
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!process.env.R2_BUCKET) throw new Error('Faltan credenciales R2 en .env.local')
  const supabase = SUPA_URL && SERVICE_KEY
    ? createClient(SUPA_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null
  if (!supabase) console.log('[supabase] Sin service-role: modo local (catálogos hardcodeados + auditoría diferida).')
  // PostgREST limita a 1.000 filas por petición aunque se pida más: paginar con range
  const municipios: string[] = []
  if (supabase) {
    for (let from = 0; ; from += 1000) {
      const { data: page, error: pageErr } = await supabase
        .from('municipios')
        .select('codigo_ine')
        .order('codigo_ine')
        .range(from, from + 999)
      if (pageErr) throw pageErr
      const rows = ((page ?? []) as { codigo_ine: string }[]).map((m) => m.codigo_ine)
      municipios.push(...rows)
      if (rows.length < 1000) break
    }
  } else {
    const cat = JSON.parse(readFileSync(join('scripts', 'data', 'municipios-ine.json'), 'utf8')) as { codigo_ine: string }[]
    for (const m of cat) if (/^\d{5}$/.test(m.codigo_ine)) municipios.push(m.codigo_ine)
    municipios.sort()
  }
  console.log(`[municipios] total=${municipios.length}`)
  const LOCAL_SOURCES = [
    { id: '', slug: 'ign_infogeo', organismo: 'Instituto Geográfico Nacional', nombre: 'Información Geográfica Destacada · Municipios (NGMEP)' },
  ]
  const LOCAL_INDS = [
    { id: '', slug: 'area_km2', nombre: 'Superficie del término municipal', unidad: 'km²' },
    { id: '', slug: 'density_per_km2', nombre: 'Densidad de población', unidad: 'hab/km²' },
  ]
  // En modo local, los catálogos de lecturas previas (filasPrevias) se resuelven
  // contra el PROPIO envelope vivo (sus arrays indicators/sources son la misma
  // información), no contra mapas mínimos: así ningún slug antiguo (p. ej.
  // ine_tempus3 en la fila de densidad, que hereda la fuente de la población)
  // se descarta por falta de correspondencia. Los 3 slugs nuevos van por delante.
  const envCatInd = new Map<string, { id: string; slug: string; nombre: string; unidad: string | null }>()
  const envCatSrc = new Map<string, { id: string; slug: string; organismo: string; nombre: string }>()
  try {
    const probeIne = municipios[0]
    if (probeIne) {
      const probe = (await readMunicipioJson(probeIne).catch(() => null)) as unknown as {
        indicators?: { slug: string; nombre: string; unidad: string | null }[]
        sources?: { slug: string; organismo: string; nombre: string }[]
      } | null
      for (const x of probe?.indicators ?? []) envCatInd.set(x.slug, { id: '', slug: x.slug, nombre: x.nombre, unidad: x.unidad })
      for (const x of probe?.sources ?? []) envCatSrc.set(x.slug, { id: '', slug: x.slug, organismo: x.organismo, nombre: x.nombre })
    }
  } catch { /* sin catálogo vivo: solo-local */ }
  for (const x of LOCAL_INDS) envCatInd.set(x.slug, x)
  for (const x of LOCAL_SOURCES) envCatSrc.set(x.slug, x)
  const { data: sources } = supabase
    ? await supabase.from('statistical_sources').select('id, slug, organismo, nombre')
    : { data: [...envCatSrc.values()] }
  const srcMeta = new Map(((sources ?? []) as { id: string; slug: string; organismo: string; nombre: string }[]).map((s) => [s.slug, s]))
  const { data: inds } = supabase
    ? await supabase.from('indicator_definitions').select('id, slug, nombre, unidad').eq('activo', true)
    : { data: LOCAL_INDS }
  const indMeta = new Map(((inds ?? []) as { id: string; slug: string; nombre: string; unidad: string | null }[]).map((i) => [i.slug, i]))

  let manifest: { started: string; items: Record<string, { key: string; bytesAntes: number; bytesDespues: number; readback: string; estado: string; created_minimal?: boolean }>; pendingAudit: unknown[] }
  try {
    manifest = JSON.parse((await readFile(MANIFEST_PATH)).toString('utf8'))
    manifest.pendingAudit = manifest.pendingAudit ?? []
  } catch {
    manifest = { started: new Date().toISOString(), items: {}, pendingAudit: [] }
  }
  const t0 = Date.now()
  let escritos = 0
  let bytesOut = 0
  let errores = 0
  let readbackErr = 0
  const counts = { actualizado: 0, sin_cobertura: 0, pendiente: 0, error: 0 }
  const slice = onlyCodes
    ? onlyCodes.filter((c) => {
      if (!municipios.includes(c)) {
        console.error(`ERROR: ${c} no existe en municipios`)
        process.exit(1)
      }
      return true
    })
    : municipios.slice(offset, limit > 0 ? offset + limit : undefined)
  for (const [idx, ine] of slice.entries()) {
    if (!force && manifest.items[ine]?.readback === 'ok' && manifest.items[ine]?.estado !== 'error') continue
    try {
      const previo = await readMunicipioJson(ine).catch(() => null)
      const bytesAntes = previo ? JSON.stringify(previo).length : 0
      // Siembra por municipio: el propio envelope aporta sus catálogos, así que
      // ningún slug antiguo se pierde aunque la sonda inicial fallara.
      if (previo && previo.version === 2) {
        for (const x of previo.indicators ?? []) if (!envCatInd.has(x.slug)) envCatInd.set(x.slug, { id: '', slug: x.slug, nombre: x.nombre, unidad: x.unidad ?? null })
        for (const x of previo.sources ?? []) if (!envCatSrc.has(x.slug)) envCatSrc.set(x.slug, { id: '', slug: x.slug, organismo: x.organismo, nombre: x.nombre })
        for (const x of LOCAL_INDS) envCatInd.set(x.slug, x)
        for (const x of LOCAL_SOURCES) envCatSrc.set(x.slug, x)
        for (const [k, v] of envCatInd) indMeta.set(k, v)
        for (const [k, v] of envCatSrc) srcMeta.set(k, v)
      }
      const filasPrevias: { slug: string; anio: number; valor: number; unidad: string; dim: Record<string, string>; sslug: string; surl: string; tid: string; sid: string | null; nombre: string; uind: string | null; org: string; nfuente: string }[] = []
      let createdMinimal = false
      if (previo && previo.version === 2) {
        for (const f of expandV2Envelope(previo as unknown as R2MunicipioEnvelopeV2) as unknown as {
          indicator: { slug: string; nombre: string; unidad: string | null }; source: { slug: string; organismo: string; nombre: string };
          anio_referencia: number; valor_numerico: number | null; unidad: string | null; dimensiones: Record<string, string>;
          source_url: string | null; source_table_id: string | null; source_series_id?: string | null
        }[]) {
          if (DENSITY_SLUGS.has(f.indicator.slug)) continue
          if (f.valor_numerico === null || f.anio_referencia == null) continue
          filasPrevias.push({ slug: f.indicator.slug, anio: f.anio_referencia, valor: Number(f.valor_numerico), unidad: f.unidad ?? '', dim: f.dimensiones ?? {}, sslug: f.source.slug || 'ine_tempus3', surl: f.source_url ?? '', tid: f.source_table_id ?? '', sid: f.source_series_id ?? null, nombre: f.indicator.nombre, uind: f.indicator.unidad, org: f.source.organismo, nfuente: f.source.nombre })
        }
      } else if (!previo) {
        createdMinimal = true
      }
      // Población reutilizada del envelope vivo (último año, ámbito municipio)
      let pop: { anio: number; valor: number; surl: string; tid: string; sslug: string } | null = null
      for (const k of filasPrevias) {
        if (k.slug !== 'population_total' || JSON.stringify(k.dim) !== MUNI_DIM) continue
        if (!pop || k.anio > pop.anio) pop = { anio: k.anio, valor: k.valor, surl: k.surl, tid: k.tid, sslug: k.sslug }
      }
      const sup = surfaces.get(ine) ?? null
      const calc = calcDensity({
        poblacion: pop?.valor ?? null,
        anioPoblacion: pop?.anio ?? null,
        superficieKm2: sup?.superficieKm2 ?? null,
        anioSuperficie: ANIO_SUPERFICIE,
      })
      const sinCob: string[] = []
      if (!sup) sinCob.push('Sin superficie oficial IGN; no se estima')
      if (!pop) sinCob.push('Sin population_total municipal en R2')
      const nuevas: { slug: string; anio: number; valor: number; unidad: string; dim: Record<string, string>; src: string; url: string; table: string; serie: string | null }[] = []
      if (sup) nuevas.push({ slug: AREA_SLUG, anio: ANIO_SUPERFICIE, valor: sup.superficieKm2, unidad: AREA_UNIT, dim: { ambito: 'municipio' }, src: IGN_INFOGEO_SOURCE.slug, url: IGN_SURFACE_URLS[0], table: NGMEP_TABLE_ID, serie: null })
      if (pop && calc.valor !== null) nuevas.push({ slug: DENSITY_SLUG, anio: pop.anio, valor: calc.valor, unidad: DENSITY_UNIT, dim: { ambito: 'municipio' }, src: pop.sslug, url: pop.surl, table: pop.tid, serie: null })
      const todas: { indicator: { slug: string; nombre: string; unidad: string | null }; source: { slug: string; organismo: string; nombre: string }; anio_referencia: number; valor_numerico: number; unidad: string; dimensiones: Record<string, string>; source_url: string; source_table_id: string; source_series_id?: string | null; estado_validacion: 'validado' }[] = []
      for (const k of filasPrevias) {
        const meta = srcMeta.get(k.sslug) ?? { slug: k.sslug, organismo: k.org, nombre: k.nfuente }
        todas.push({ indicator: { slug: k.slug, nombre: k.nombre, unidad: k.uind ?? k.unidad }, source: { slug: meta.slug, organismo: meta.organismo, nombre: meta.nombre }, anio_referencia: k.anio, valor_numerico: k.valor, unidad: k.unidad, dimensiones: k.dim, source_url: k.surl, source_table_id: k.tid, source_series_id: k.sid ?? null, estado_validacion: 'validado' })
      }
      for (const r of nuevas) {
        const meta = indMeta.get(r.slug)
        const src = srcMeta.get(r.src)
        if (!meta || !src) continue
        todas.push({ indicator: { slug: r.slug, nombre: meta.nombre, unidad: meta.unidad ?? r.unidad }, source: { slug: src.slug, organismo: src.organismo, nombre: src.nombre }, anio_referencia: r.anio, valor_numerico: r.valor, unidad: r.unidad, dimensiones: r.dim, source_url: r.url, source_table_id: r.table, source_series_id: r.serie ?? null, estado_validacion: 'validado' })
      }
      const envelope = toV2Envelope(ine, new Date().toISOString(), todas)
      const bytesDespues = JSON.stringify(envelope).length
      if (bytesDespues - bytesAntes > MAX_ADDED_BYTES) throw new Error(`Presupuesto superado +${bytesDespues - bytesAntes}B`)
      const key = await putMunicipioJson(ine, envelope)
      // Read-back con cache-buster (el CDN público puede cachear 86400s)
      const base = (process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE || process.env.SOCIDEAS_R2_PUBLIC_BASE || 'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev').replace(/\/$/, '')
      const rb = await fetch(`${base}/socideas/v2/municipios/${ine}.json?v=${Date.now()}`, { headers: { Accept: 'application/json' } })
      if (!rb.ok) throw new Error(`Read-back HTTP ${rb.status}`)
      const rbJson = (await rb.json()) as { codigo_ine?: string; valores?: unknown[] }
      if (rbJson.codigo_ine !== ine || !Array.isArray(rbJson.valores)) throw new Error('Read-back inválido')
      manifest.items[ine] = { key, bytesAntes, bytesDespues, readback: 'ok', estado: nuevas.length > 0 ? 'ok' : 'pendiente', ...(createdMinimal ? { created_minimal: true } : {}) }
      escritos++
      bytesOut += bytesDespues
      if (nuevas.some((r) => r.slug === DENSITY_SLUG)) counts.actualizado++
      else if (nuevas.length > 0) counts.pendiente++
      else counts.sin_cobertura++
      const auditRow = { source_id: null, tipo_sincronizacion: 'densidad_batch1', municipio_codigo_ine: ine, estado: nuevas.some((r) => r.slug === DENSITY_SLUG) ? 'ok' : nuevas.length > 0 ? 'partial' : 'partial', registros_leidos: nuevas.length, registros_actualizados: nuevas.length, fin: new Date().toISOString(), estado_dato: 'consolidado', bloque: 'demografia', periodo: pop ? String(pop.anio) : String(ANIO_SUPERFICIE), fuente: 'ine_tempus3,ign_infogeo', metadata: { superficie_km2: sup?.superficieKm2 ?? null, anio_superficie: ANIO_SUPERFICIE, aviso_anios: pop ? pop.anio !== ANIO_SUPERFICIE : false, sin_cobertura: sinCob } }
      if (supabase) await supabase.from('data_sync_runs').insert(auditRow)
      else manifest.pendingAudit.push(auditRow)
      if ((idx + 1) % 100 === 0) {
        await writeFile(MANIFEST_PATH, JSON.stringify(manifest))
        console.log(`[progreso] ${idx + 1}/${slice.length} escritos=${escritos} errores=${errores}`)
      }
    } catch (e) {
      errores++
      counts.error++
      if (String((e as Error).message).startsWith('Read-back')) readbackErr++
      manifest.items[ine] = { key: '', bytesAntes: 0, bytesDespues: 0, readback: 'error', estado: 'error' }
      const errRow = { source_id: null, tipo_sincronizacion: 'densidad_batch1', municipio_codigo_ine: ine, estado: 'error', fin: new Date().toISOString(), error_message: String((e as Error).message).slice(0, 2000), estado_dato: 'consolidado', bloque: 'demografia', periodo: String(ANIO_SUPERFICIE), fuente: 'ine_tempus3,ign_infogeo' }
      if (supabase) await supabase.from('data_sync_runs').insert(errRow)
      else manifest.pendingAudit.push(errRow)
    }
  }
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest))
  const mins = ((Date.now() - t0) / 60000).toFixed(1)
  console.log(`[fin] escritos=${escritos} bytes=${bytesOut} readbackErr=${readbackErr} errores=${errores} mins=${mins}`)
  console.log(`[conteos] actualizado=${counts.actualizado} pendiente=${counts.pendiente} sin_cobertura=${counts.sin_cobertura} error=${counts.error}`)
  if (readbackErr > 0) {
    console.error(`FAIL: ${readbackErr} errores de read-back`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('ERROR:', e instanceof Error ? e.message : e)
  process.exit(1)
})
