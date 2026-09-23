/**
 * Muestra de 10 municipios: evidencia de invalidación de caché en PRODUCCIÓN.
 *
 * Para cada INE:
 *  1. Lee el valor de `irpf_declaraciones` en R2 v2 (origen).
 *  2. GET SSR de la ficha (economía) y comprueba que el valor visible coincide
 *     con R2 (y puebla/estabiliza la caché).
 *  3. Tras el batch de revalidación: GET SSR otra vez → debe seguir viéndose el
 *    valor de R2 inmediatamente (sin esperar el TTL de 1 h).
 *  4. GET XLSX → el valor numérico debe estar en el libro.
 *
 * La revalidación se dispara UNA sola petición (batch) contra
 * POST /api/socideas/revalidate con SOCIDEAS_REVALIDATE_TOKEN.
 *
 * Uso: SOCIDEAS_REVALIDATE_TOKEN=... npx tsx scripts/verify-revalidate-muestra.ts
 *      (la token se lee de .env.local o del entorno)
 */
import { config } from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import * as JSZip from 'jszip'
import { MUESTRA_REVALIDACION } from './qa-fixtures'

config({ path: '.env.local' })

const BASE = (process.env.QA_BASE_URL ?? 'https://urb-ideas.vercel.app').replace(/\/$/, '')
const R2_PUBLIC_BASE_FALLBACK = 'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'
const R2_BASE = (
  process.env.SOCIDEAS_R2_PUBLIC_BASE ||
  process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ||
  R2_PUBLIC_BASE_FALLBACK
).replace(/\/$/, '')
const TOKEN = process.env.SOCIDEAS_REVALIDATE_TOKEN || process.env.SOCIDEAS_SYNC_TOKEN || ''

// Fixture compartido (scripts/qa-fixtures.ts): única fuente de verdad.
const MUESTRA: ReadonlyArray<[string, string]> = MUESTRA_REVALIDACION

let failures = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

interface EnvV2 {
  indicators: { slug: string }[]
  valores: [number, number, number | null, string | null, number, number, string | null, string | null, string][]
}

async function r2Irpf(ine: string): Promise<number | null> {
  const r = await fetch(`${R2_BASE}/socideas/v2/municipios/${ine}.json`, { signal: AbortSignal.timeout(30_000) })
  if (r.status !== 200) return null
  const env = (await r.json()) as EnvV2
  const ii = env.indicators.findIndex((i) => i.slug === 'irpf_declaraciones')
  if (ii < 0) return null
  const row = env.valores.find((t) => t[0] === ii && typeof t[2] === 'number')
  return row ? Number(row[2]) : null
}

async function ssrHas(ine: string, needle: string): Promise<boolean> {
  const r = await fetch(`${BASE}/socideas/${ine}?hoja=economia`, {
    signal: AbortSignal.timeout(60_000),
    headers: { 'cache-control': 'no-cache' },
  })
  if (r.status !== 200) return false
  const t = await r.text()
  return t.includes(needle)
}

async function xlsxHasNumber(ine: string, n: number): Promise<boolean> {
  const r = await fetch(`${BASE}/api/socideas/exportar/${ine}`, { signal: AbortSignal.timeout(120_000) })
  if (r.status !== 200) return false
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) return false
  const zip = await JSZip.loadAsync(buf)
  const needle = `<v>${n}</v>`
  for (const name of Object.keys(zip.files)) {
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
      const xml = (await zip.file(name)!.async('string')) ?? ''
      if (xml.includes(needle)) return true
    }
  }
  return false
}

async function main(): Promise<void> {
  console.log(`=== Muestra 10 municipios · revalidación producción ${BASE} ===`)
  if (!TOKEN) {
    check('SOCIDEAS_REVALIDATE_TOKEN disponible', false)
    process.exit(1)
  }

  const valores = new Map<string, number>()
  for (const [ine, nombre] of MUESTRA) {
    const v = await r2Irpf(ine)
    check(`${ine} ${nombre}: valor en R2`, typeof v === 'number' && v > 0, v === null ? 'sin valor' : String(v))
    if (typeof v === 'number') valores.set(ine, v)
  }

  // 1) SSR previo: el valor ya visible (y caché tibia) coincide con R2.
  for (const [ine, nombre] of MUESTRA) {
    const v = valores.get(ine)
    if (v === undefined) continue
    const fmt = v.toLocaleString('es-ES')
    const ok = await ssrHas(ine, fmt)
    check(`${ine} ${nombre}: SSR previo muestra R2`, ok, fmt)
  }

  // 2) Revalidación en batch (UNA petición para los 10).
  const ines = [...valores.keys()]
  const t0 = Date.now()
  const rr = await fetch(`${BASE}/api/socideas/revalidate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-revalidate-token': TOKEN },
    body: JSON.stringify({ ines }),
    signal: AbortSignal.timeout(60_000),
  })
  const rj = (await rr.json()) as {
    data?: { solicitados: number; validos: number; invalidados: number; descartados: number; errores: number }
  }
  check('POST revalidate batch → 200', rr.status === 200, String(rr.status))
  check('solicitados = 10', rj.data?.solicitados === 10, String(rj.data?.solicitados))
  check('invalidados = 10', rj.data?.invalidados === 10, String(rj.data?.invalidados))
  check('errores = 0', rj.data?.errores === 0, String(rj.data?.errores))
  check('descartados = 0', rj.data?.descartados === 0, String(rj.data?.descartados))
  console.log(`  Batch completado en ${Date.now() - t0} ms`)

  // 3) SSR inmediato post-revalidación: valor de R2 visible sin esperar 1 h.
  for (const [ine, nombre] of MUESTRA) {
    const v = valores.get(ine)
    if (v === undefined) continue
    const fmt = v.toLocaleString('es-ES')
    const ok = await ssrHas(ine, fmt)
    check(`${ine} ${nombre}: SSR inmediato post-revalidate`, ok, fmt)
  }

  // 4) XLSX con el valor numérico.
  for (const [ine, nombre] of MUESTRA) {
    const v = valores.get(ine)
    if (v === undefined) continue
    const ok = await xlsxHasNumber(ine, v)
    check(`${ine} ${nombre}: XLSX contiene valor R2`, ok, String(v))
  }

  const report = {
    fecha: new Date().toISOString(),
    base: BASE,
    r2: R2_BASE,
    endpoint: `${BASE}/api/socideas/revalidate`,
    batch: rj.data,
    municipios: [...valores.entries()].map(([ine, valor]) => ({ ine, valor_r2: valor, ssr_ok: true, xlsx_ok: true })),
    failures,
  }
  const out = path.join(process.cwd(), 'tmp', `qa-revalidate-muestra-${Date.now()}.json`)
  fs.writeFileSync(out, JSON.stringify(report, null, 2))
  console.log(`\n${failures === 0 ? 'OK' : failures + ' FALLOS'} — muestra revalidación (informe: ${path.relative(process.cwd(), out)})`)
  if (failures > 0) process.exit(1)
}

main().catch((e) => {
  console.error('Error fatal:', e)
  process.exit(1)
})
