/**
 * QA de cobertura y metodología sobre la muestra de 14 municipios (misión
 * post-AEAT): R2, SSR y XLSX contra una base (producción por defecto).
 *
 * Muestra:
 *  - 10 con dato AEAT (cuando existe): Albacete, Madrid, Sevilla, Barcelona,
 *    Santiago de Compostela (INE 15078; ¡no confundir con 27044 = A Pastoriza,
 *    Lugo!), Valladolid, Oviedo, Cartagena, Palma, Ávila.
 *  - Forales: Pamplona, Bilbao → sin valor imputado + razón foral visible.
 *  - Ceuta, Melilla → sin unión por código AEAT↔INE-5 + motivo visible.
 *  - Todos: rentas AEAT bloqueadas explicadas, nunca como 0; hoja 08 con
 *    glosario de estados (partial/missing_by_design/blocked_source) y AEAT/ADRH
 *    separados.
 *
 * Uso:
 *   npx tsx scripts/qa-cobertura-muestra.ts
 *   npx tsx scripts/qa-cobertura-muestra.ts --base http://127.0.0.1:3111
 *   npx tsx scripts/qa-cobertura-muestra.ts --skip-xlsx
 */
import * as fs from 'fs'
import * as path from 'path'
import * as JSZip from 'jszip'

const R2_PUBLIC_BASE_FALLBACK = 'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'
const R2_BASE = (
  process.env.SOCIDEAS_R2_PUBLIC_BASE ||
  process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ||
  R2_PUBLIC_BASE_FALLBACK
).replace(/\/$/, '')

const args = process.argv.slice(2)
const argOf = (k: string): string | null => {
  const i = args.indexOf(k)
  return i >= 0 ? args[i + 1] ?? null : null
}
const BASE = (argOf('--base') ?? process.env.QA_BASE_URL ?? 'https://urb-ideas.vercel.app').replace(/\/$/, '')
const SKIP_XLSX = args.includes('--skip-xlsx')

type Muestra = { ine: string; nombre: string; kind: 'con_dato' | 'foral' | 'sin_puente' }
const MUESTRA: Muestra[] = [
  { ine: '02003', nombre: 'Albacete', kind: 'con_dato' },
  { ine: '28079', nombre: 'Madrid', kind: 'con_dato' },
  { ine: '41091', nombre: 'Sevilla', kind: 'con_dato' },
  { ine: '08019', nombre: 'Barcelona', kind: 'con_dato' },
  { ine: '15078', nombre: 'Santiago de Compostela', kind: 'con_dato' },
  { ine: '47186', nombre: 'Valladolid', kind: 'con_dato' },
  { ine: '33044', nombre: 'Oviedo', kind: 'con_dato' },
  { ine: '30016', nombre: 'Cartagena', kind: 'con_dato' },
  { ine: '07040', nombre: 'Palma', kind: 'con_dato' },
  { ine: '05019', nombre: 'Ávila', kind: 'con_dato' },
  { ine: '31201', nombre: 'Pamplona', kind: 'foral' },
  { ine: '48013', nombre: 'Bilbao', kind: 'foral' },
  { ine: '51001', nombre: 'Ceuta', kind: 'sin_puente' },
  { ine: '52001', nombre: 'Melilla', kind: 'sin_puente' },
]

const FORAL_TEXT = 'La AEAT estatal no publica esta serie para País Vasco y Navarra; el dato no se estima ni se sustituye.'
const PUENTE_TEXT = 'no coincide con INE-5'
const BLOCKED_TEXT = 'descarga nacional estructurada verificable'

let failures = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

interface EnvelopeV2 {
  version: number
  codigo_ine: string
  indicators: { slug: string; nombre: string; unidad: string | null }[]
  sources: { slug: string; organismo: string; nombre: string }[]
  valores: [number, number, number | null, string | null, number, number, string | null, string | null, string][]
}

async function fetchR2(ine: string): Promise<{ env: EnvelopeV2 | null; bytes: number }> {
  try {
    const r = await fetch(`${R2_BASE}/socideas/v2/municipios/${ine}.json`, {
      signal: AbortSignal.timeout(30_000),
      headers: { Accept: 'application/json' },
    })
    if (r.status !== 200) return { env: null, bytes: 0 }
    const text = await r.text()
    const env = JSON.parse(text) as EnvelopeV2
    if (env.codigo_ine !== ine) return { env: null, bytes: text.length }
    return { env, bytes: Buffer.byteLength(text, 'utf-8') }
  } catch {
    return { env: null, bytes: 0 }
  }
}

function rowsOf(env: EnvelopeV2, slug: string): EnvelopeV2['valores'] {
  const ii = env.indicators.findIndex((i) => i.slug === slug)
  if (ii < 0) return []
  return env.valores.filter((t) => t[0] === ii)
}

async function fetchHtml(url: string): Promise<{ status: number; text: string }> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { 'cache-control': 'no-cache' } })
    return { status: r.status, text: await r.text() }
  } catch (e) {
    return { status: 0, text: (e as Error).message }
  }
}

async function xlsxStrings(ine: string): Promise<{ ok: boolean; detail: string; sheetXmls: string[]; shared: string; wb: string }> {
  try {
    const r = await fetch(`${BASE}/api/socideas/exportar/${ine}`, { signal: AbortSignal.timeout(120_000) })
    if (r.status !== 200) return { ok: false, detail: `HTTP ${r.status}`, sheetXmls: [], shared: '', wb: '' }
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf[0] !== 0x50 || buf[1] !== 0x4b) return { ok: false, detail: `no ZIP (${buf.length} B)`, sheetXmls: [], shared: '', wb: '' }
    const zip = await JSZip.loadAsync(buf)
    const wb = (await zip.file('xl/workbook.xml')?.async('string')) ?? ''
    const shared = (await zip.file('xl/sharedStrings.xml')?.async('string')) ?? ''
    const sheetXmls: string[] = []
    for (const name of Object.keys(zip.files)) {
      if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
        sheetXmls.push((await zip.file(name)!.async('string')) ?? '')
      }
    }
    return { ok: true, detail: `${buf.length} B`, sheetXmls, shared, wb }
  } catch (e) {
    return { ok: false, detail: (e as Error).message, sheetXmls: [], shared: '', wb: '' }
  }
}

async function main(): Promise<void> {
  console.log(`=== QA cobertura muestra (14) · base=${BASE} · r2=${R2_BASE} ===`)
  const report: Record<string, unknown>[] = []

  for (const m of MUESTRA) {
    console.log(`\n--- ${m.ine} ${m.nombre} (${m.kind}) ---`)
    const { env, bytes } = await fetchR2(m.ine)
    check('R2 v2 legible', !!env && env.version === 2, bytes ? `${bytes} B` : 'sin respuesta')
    if (!env) {
      report.push({ ine: m.ine, ok: false, motivo: 'sin envelope' })
      continue
    }
    check('R2 < 150 KB', bytes > 0 && bytes <= 150 * 1024, `${bytes} B`)

    const irpfRows = rowsOf(env, 'irpf_declaraciones')
    const irpfNum = irpfRows.find((t) => typeof t[2] === 'number') ?? null
    const bruta = rowsOf(env, 'irpf_renta_bruta_media').filter((t) => typeof t[2] === 'number')
    const disp = rowsOf(env, 'irpf_renta_disponible_media').filter((t) => typeof t[2] === 'number')

    if (m.kind === 'con_dato') {
      check('irpf_declaraciones presente (o S.E. null)', irpfRows.length > 0, irpfNum ? `valor=${irpfNum[2]} año=${irpfNum[1]}` : irpfRows.length ? 'null (S.E.)' : 'sin fila')
      if (irpfNum) {
        check('año 2023', irpfNum[1] === 2023, String(irpfNum[1]))
        check('tableId EDM2023', irpfNum[6] === 'EDM2023', String(irpfNum[6]))
        check('valor > 0 (no cero falso)', (irpfNum[2] as number) > 0, String(irpfNum[2]))
      }
    } else if (m.kind === 'foral') {
      check('foral: SIN valor irpf imputado', irpfNum === null, irpfNum ? `VALOR IMPUTADO ${irpfNum[2]}` : 'sin valor')
    } else {
      check('sin_puente: SIN valor irpf unido', irpfNum === null, irpfNum ? `VALOR ${irpfNum[2]}` : 'sin valor')
    }
    check('rentas AEAT bloqueadas: nunca con valor numérico', bruta.length === 0 && disp.length === 0, `bruta=${bruta.length} disp=${disp.length}`)

    const srcAeat = env.sources.find((s) => s.slug === 'aeat_edm')
    if (m.kind === 'con_dato' && irpfRows.length) {
      check('fuente aeat_edm en envelope', !!srcAeat, srcAeat?.organismo ?? 'ausente')
      if (srcAeat) check('organismo AEAT correcto', srcAeat.organismo === 'Agencia Estatal de Administración Tributaria', srcAeat.organismo)
    }

    // ── SSR ──
    const ssr = await fetchHtml(`${BASE}/socideas/${m.ine}?hoja=economia`)
    check('SSR economia HTTP 200', ssr.status === 200, String(ssr.status))
    if (ssr.status === 200) {
      if (m.kind === 'con_dato' && irpfNum) {
        const fmt = (irpfNum[2] as number).toLocaleString('es-ES')
        check('SSR muestra el valor irpf de R2', ssr.text.includes(fmt), fmt)
      }
      if (m.kind === 'foral') {
        check('SSR explica ausencia foral (texto contractual)', ssr.text.includes(FORAL_TEXT))
      }
      if (m.kind === 'sin_puente') {
        check('SSR explica motivo código AEAT↔INE-5', ssr.text.includes(PUENTE_TEXT))
      }
      check('SSR explica rentas bloqueadas (blocked_source)', ssr.text.includes(BLOCKED_TEXT))
      check('SSR sin cero falso en bloqueo (nunca "0 €" por blocked)', !/irpf_renta_bruta_media[^]{0,200}>0 €</.test(ssr.text))
    }

    // ── XLSX ──
    if (!SKIP_XLSX) {
      const x = await xlsxStrings(m.ine)
      check('XLSX válido', x.ok, x.detail)
      if (x.ok) {
        check('XLSX hoja 08_CRITERIOS_Y_FUENTES', x.wb.includes('08_CRITERIOS_Y_FUENTES'))
        check('XLSX glosario "Estados de cobertura"', x.shared.includes('Estados de cobertura'))
        check('XLSX explica missing_by_design', x.shared.includes('missing_by_design'))
        check('XLSX explica blocked_source', x.shared.includes('blocked_source'))
        check('XLSX explica partial', x.shared.includes('partial'))
        check('XLSX AEAT como institución', x.shared.includes('Agencia Estatal de Administración Tributaria'))
        check('XLSX ADRH separado (Denominación propia)', x.shared.includes('Atlas de Distribución de Renta de los Hogares'))
        check('XLSX foral explicado', x.shared.includes('País Vasco y Navarra'))
        if (m.kind === 'con_dato' && irpfNum) {
          const needle = `<v>${irpfNum[2]}</v>`
          check('XLSX contiene el valor irpf numérico', x.sheetXmls.some((s) => s.includes(needle)), String(irpfNum[2]))
        }
      }
    }

    report.push({
      ine: m.ine,
      nombre: m.nombre,
      kind: m.kind,
      r2_bytes: bytes,
      irpf: irpfNum ? { valor: irpfNum[2], anio: irpfNum[1], table: irpfNum[6] } : null,
      ssr_status: ssr.status,
    })
  }

  const out = path.join(process.cwd(), 'tmp', `qa-cobertura-muestra-${Date.now()}.json`)
  fs.writeFileSync(out, JSON.stringify({ fecha: new Date().toISOString(), base: BASE, r2: R2_BASE, failures, report }, null, 2))
  console.log(`\n${failures === 0 ? 'OK' : failures + ' FALLOS'} — qa cobertura muestra (informe: ${path.relative(process.cwd(), out)})`)
  if (failures > 0) process.exit(1)
}

main().catch((e) => {
  console.error('Error fatal:', e)
  process.exit(1)
})
