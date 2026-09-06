// Preflight nacional FASE 3D: cobertura real de dimensiones demográficas INE.
// SOLO LECTURA: CSV públicos por streaming + catálogo interno (lectura).
// CERO escrituras: no R2, no Supabase, no migraciones, no UI, no XLSX.
// Tablas: 68535 nacionalidad, 66322 país de nacimiento, 68540 arraigo.
// Informe: consola + tmp/dry-run-3d.json (ignorado por git). Nada en el repo.
// Uso: npx tsx scripts/preflight-demographic-national.ts [--table=nationality|birth_country|birth_residence_relation] [--out=tmp/dry-run-3d.json]
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import {
  DIMENSION_TABLES,
  csvUrl,
  normalizeDimRow,
  parseDimLine,
  type DemographicDimensionId,
} from '../src/lib/ine-demographic-dimensions'

config({ path: '.env.local' })

const normLo = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, '')
const TABLE_BUDGET_MS = 560000

interface CatalogMuni { ine: string; nombre: string; provincia: string; ccaa: string }

async function loadCatalog(): Promise<Map<string, CatalogMuni>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (solo lectura)')
  const supabase = createClient(url, key)
  const map = new Map<string, CatalogMuni>()
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('municipios')
      .select('codigo_ine, nombre, provincia:provincias(nombre, comunidad_autonoma:comunidades_autonomas(nombre))')
      .order('codigo_ine')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`Catálogo: ${error.message}`)
    const rows = (data ?? []) as unknown as {
      codigo_ine: string; nombre: string
      provincia: { nombre: string; comunidad_autonoma: { nombre: string } }
    }[]
    for (const r of rows) {
      map.set(r.codigo_ine.trim(), {
        ine: r.codigo_ine.trim(), nombre: r.nombre,
        provincia: r.provincia.nombre, ccaa: r.provincia.comunidad_autonoma.nombre,
      })
    }
    if (rows.length < PAGE) break
    from += PAGE
  }
  return map
}

interface Agg {
  periods: Set<string>
  catsByPeriod: Map<string, Set<string>>
  // resumen (sexo total [+edad total]): periodo -> cat -> {valor,status}
  resumen: Map<string, Map<string, { valor: number | null; sup: boolean }>>
  supCount: number
  nullCount: number
  genuineZero: number
  rowCount: number
}

interface TableResult {
  dimension: DemographicDimensionId
  tableId: number
  humanUrl: string
  date: string
  bytes: number
  sha256: string
  header: string[]
  years: string[]
  totalLines: number
  muniRows: number
  classTally: Record<string, number>
  catalogN: number
  match: number
  sourceExtra: number
  sinDato: string[]
  suprimidos: number
  incompletas: number
  coherentes: number
  coherentTotal: number
  ceroExtranjero: number
  supMunis: string[]
  incompletasMunis: string[]
  incoherentes: string[]
  distinctCats: string[]
  perMuniSizes: number[]
  detalleSample: { ine: string; rows: { s: string; e: string | null; c: string; p: string; v: number | null; sup: boolean }[] }[]
  resumenJson: string
  complete: boolean
  notes: string[]
}

async function runTable(
  dimId: DemographicDimensionId,
  catalog: Map<string, CatalogMuni>,
  onlyTable: string | null,
  sampleSet: Set<string>,
): Promise<TableResult | null> {
  const cfg = DIMENSION_TABLES.find((d) => d.dimension === dimId) as (typeof DIMENSION_TABLES)[number]
  if (onlyTable && onlyTable !== dimId) return null
  const url = csvUrl(cfg.tableId)
  const date = new Date().toISOString()
  const res = await fetch(url, { headers: { Accept: '*/*', 'User-Agent': 'URBIdeas/1.0' }, redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`)
  const ctype = res.headers.get('content-type') ?? ''
  if (ctype.includes('text/html')) throw new Error('HTML en lugar de CSV')
  const reader = res.body?.getReader()
  if (!reader) throw new Error('Sin cuerpo')
  const dec = new TextDecoder('utf-8')
  const hash = createHash('sha256')
  let buf = ''
  let header: string[] = []
  let idx = { muni: -1, sexo: -1, edad: -1, dim: -1, per: -1, val: -1 }
  let totalLines = 0
  let bytes = 0
  const years = new Set<string>()
  const classTally: Record<string, number> = {}
  const sourceCodes = new Set<string>()
  const agg = new Map<string, Agg>()
  const sampleRows = new Map<string, { s: string; e: string | null; c: string; p: string; v: number | null; sup: boolean }[]>()
  const globalCatsByPeriod = new Map<string, Set<string>>()
  const get = (ine: string): Agg => {
    let a = agg.get(ine)
    if (!a) {
      a = { periods: new Set(), catsByPeriod: new Map(), resumen: new Map(), supCount: 0, nullCount: 0, genuineZero: 0, rowCount: 0 }
      agg.set(ine, a)
    }
    return a
  }
  const t0 = Date.now()
  let lastBeat = t0
  let timedOut = false
  for (;;) {
    if (Date.now() - t0 > TABLE_BUDGET_MS) { timedOut = true; break }
    const { value, done: sd } = await reader.read()
    if (value) { bytes += value.length; hash.update(value) }
    buf += dec.decode(value, { stream: true })
    let nl: number
    for (;;) {
      nl = buf.indexOf('\n')
      if (nl < 0) break
      const line = buf.slice(0, nl).replace(/\r$/, '')
      buf = buf.slice(nl + 1)
      if (line.trim() === '') continue
      totalLines += 1
      if (header.length === 0) {
        const sep = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ','
        const h = line.split(sep).map((x) => x.trim().toLowerCase())
        const find = (p: (x: string) => boolean): number => h.findIndex(p)
        header = line.split(sep)
        idx = {
          muni: find((x) => x.includes('municip')),
          sexo: find((x) => x === 'sexo'),
          edad: find((x) => x.includes('edad')),
          dim: find((x) => cfg.dimColumnHint.some((k) => x.includes(k))),
          per: find((x) => x.includes('periodo') || x.includes('período') || x === 'año' || x === 'anyo'),
          val: find((x) => x === 'total' || x.includes('valor')),
        }
        if (idx.muni < 0 || idx.sexo < 0 || idx.dim < 0 || idx.per < 0 || idx.val < 0) {
          throw new Error(`Cabecera inesperada en ${cfg.tableId}`)
        }
        continue
      }
      const cols = line.split(line.includes('\t') ? '\t' : ';')
      const raw = parseDimLine(cols, idx)
      if (!raw) {
        // Fila de total nacional / CCAA / provincia (sin código municipal).
        classTally['ambito-superior'] = (classTally['ambito-superior'] ?? 0) + 1
        continue
      }
      sourceCodes.add(raw.ine)
      const n = normalizeDimRow(raw)
      const a = get(n.ine)
      if (sampleSet.has(n.ine)) {
        const arr = sampleRows.get(n.ine) ?? []
        arr.push({ s: n.sexo, e: n.edad, c: n.categoria, p: n.periodo, v: n.valor, sup: n.suprimido })
        sampleRows.set(n.ine, arr)
      }
      a.rowCount += 1
      years.add(n.periodo)
      classTally[`sexo:${n.sexo || '?'}`] = (classTally[`sexo:${n.sexo || '?'}`] ?? 0) + 1
      if (n.edad !== null) classTally[`edad:${n.edad}`] = (classTally[`edad:${n.edad}`] ?? 0) + 1
      classTally[`cat:${n.categoria}`] = (classTally[`cat:${n.categoria}`] ?? 0) + 1
      a.periods.add(n.periodo)
      const cp = a.catsByPeriod.get(n.periodo) ?? new Set<string>()
      cp.add(n.categoria)
      a.catsByPeriod.set(n.periodo, cp)
      const gp = globalCatsByPeriod.get(n.periodo) ?? new Set<string>()
      if (n.sexo === cfg.sexTotal && (cfg.ageTotal === null || n.edad === cfg.ageTotal)) gp.add(n.categoria)
      globalCatsByPeriod.set(n.periodo, gp)
      // Slice resumen (sexo total [+edad total]): se registran observados Y
      // suprimidos (estos últimos con flag, nunca como 0).
      const inSlice = n.sexo === cfg.sexTotal && (cfg.ageTotal === null || n.edad === cfg.ageTotal)
      if (n.suprimido || n.valor === null) {
        a.supCount += 1
        if (n.valor === null && !n.suprimido) a.nullCount += 1
        if (inSlice) {
          const rm = a.resumen.get(n.periodo) ?? new Map<string, { valor: number | null; sup: boolean }>()
          if (!rm.has(n.categoria)) rm.set(n.categoria, { valor: null, sup: true })
          a.resumen.set(n.periodo, rm)
        }
        continue
      }
      if (n.valor === 0) a.genuineZero += 1
      if (inSlice) {
        const rm = a.resumen.get(n.periodo) ?? new Map<string, { valor: number | null; sup: boolean }>()
        rm.set(n.categoria, { valor: n.valor, sup: false })
        a.resumen.set(n.periodo, rm)
      }
    }
    if (Date.now() - lastBeat > 60000) {
      lastBeat = Date.now()
      console.log(`  … t=${cfg.tableId}: ${totalLines} líneas, ${agg.size} munis (${Math.round((Date.now() - t0) / 1000)}s)`)
    }
    if (sd) break
  }
  try { await reader.cancel().catch(() => undefined) } catch { /* noop */ }

  // Métricas por municipio.
  const matched = [...agg.keys()].filter((ine) => catalog.has(ine))
  const sourceExtra = [...agg.keys()].filter((ine) => !catalog.has(ine))
  const sinDato = [...catalog.keys()].filter((ine) => !agg.has(ine))
  let suprimidos = 0
  let incompletas = 0
  let coherentes = 0
  let coherentTotal = 0
  let ceroExtranjero = 0
  const supMunis: string[] = []
  const incompletasMunis: string[] = []
  const incoherentes: string[] = []
  const distinctCats = new Set<string>()
  const perMuniSizes: number[] = []
  const resumenParts: string[] = []
  const latestOverall = [...years].sort().pop() ?? ''
  console.log(`Último periodo en fuente: ${latestOverall}`)
  for (const ine of matched) {
    const a = agg.get(ine) as Agg
    if (a.supCount > 0) { suprimidos += 1; supMunis.push(ine) }
    for (const c of a.catsByPeriod.values()) for (const cat of c) distinctCats.add(cat)
    // Último periodo con slice resumen no vacío.
    const periods = [...a.resumen.keys()].sort()
    const lp = periods.length > 0 ? periods[periods.length - 1] : null
    const slice = lp ? (a.resumen.get(lp) as Map<string, { valor: number | null; sup: boolean }>) : new Map()
    const need = cfg.requiredCategories
    const hasAll = need.every((c) => {
      const key = [...slice.keys()].find((k) => normLo(k).includes(normLo(c)) || normLo(c).includes(normLo(k)))
      const v = key ? slice.get(key) : undefined
      return v !== undefined && !v.sup && v.valor !== null
    })
    if (lp === null || slice.size === 0) {
      incompletas += 1
      incompletasMunis.push(ine)
    } else if (!hasAll) {
      incompletas += 1
      incompletasMunis.push(ine)
    } else {
      // Coherencia según dimensión (las tres categorías ya están presentes y
      // observadas por el chequeo hasAll; aquí solo se verifica la igualdad).
      if (dimId === 'nationality') {
        const val = (frag: string): number | null => {
          const key = [...slice.keys()].find((k) => normLo(k).includes(frag))
          return key ? (slice.get(key)?.valor ?? null) : null
        }
        const t = val('total')
        const e = [...slice.keys()].find((k) => /espanola/.test(normLo(k)) && !/extranjera/.test(normLo(k)))
        const x = [...slice.keys()].find((k) => /extranjera/.test(normLo(k)))
        coherentTotal += 1
        const ev = e ? slice.get(e)?.valor ?? null : null
        const xv = x ? slice.get(x)?.valor ?? null : null
        if (t !== null && ev !== null && xv !== null && t === ev + xv) coherentes += 1
        else incoherentes.push(ine)
        if (xv === 0) ceroExtranjero += 1
      } else if (dimId === 'birth_residence_relation') {
        const parts = ['mismo municipio', 'distinto municipio', 'distinta provincia', 'distinta comunidad', 'extranjero']
        const vals = parts.map((p) => {
          const key = [...slice.keys()].find((k) => normLo(k).includes(normLo(p)))
          return key ? (slice.get(key)?.valor ?? null) : null
        })
        const t = [...slice.keys()].find((k) => normLo(k) === 'total')
        const tv = t ? (slice.get(t)?.valor ?? null) : null
        coherentTotal += 1
        if (tv !== null && vals.every((vv) => vv !== null) && tv === (vals as number[]).reduce((s, vv) => s + (vv as number), 0)) coherentes += 1
        else incoherentes.push(ine)
      } else {
        // birth_country: coherencia Total=España+Extranjero solo si existen agregados.
        const hasEsp = [...slice.keys()].some((k) => /^espa.a$/.test(normLo(k).trim()))
        const hasExt = [...slice.keys()].some((k) => /^extranjero$/.test(normLo(k).trim()))
        coherentTotal += hasEsp && hasExt ? 1 : 0
        if (hasEsp && hasExt) {
          const t = slice.get([...slice.keys()].find((k) => normLo(k) === 'total') as string)?.valor ?? null
          const e = slice.get([...slice.keys()].find((k) => /^espa.a$/.test(normLo(k).trim())) as string)?.valor ?? null
          const x = slice.get([...slice.keys()].find((k) => /^extranjero$/.test(normLo(k).trim())) as string)?.valor ?? null
          if (t !== null && e !== null && x !== null && t === (e as number) + (x as number)) coherentes += 1
          else incoherentes.push(ine)
        }
      }
    }
    // Tamaño resumen serializado real (Nivel 1: último periodo + categorías
    // requeridas; si una requerida falta → partial/suppressed/missing).
    const matchReq = (req: string): string | undefined =>
      [...slice.keys()].find((k) => normLo(k).includes(normLo(req)) || normLo(req).includes(normLo(k)))
    const trimmed = new Map<string, { valor: number | null; sup: boolean }>()
    for (const req of cfg.requiredCategories) {
      const key = matchReq(req)
      if (key) trimmed.set(key, slice.get(key) as { valor: number | null; sup: boolean })
    }
    const nObs = [...trimmed.values()].filter((vv) => !vv.sup && vv.valor !== null).length
    const status = trimmed.size === 0 || lp === null ? 'missing' : nObs === trimmed.size ? 'observed' : nObs > 0 ? 'partial' : 'suppressed'
    const obj = { ine, periodo: lp, status, slice: [...trimmed.entries()].map(([k, vv]) => [k, vv.valor, vv.sup]) }
    const bytes = JSON.stringify(obj).length
    perMuniSizes.push(bytes)
    resumenParts.push(JSON.stringify(obj))
  }
  perMuniSizes.sort((a, b) => a - b)
  const nacionalJson = `[${resumenParts.join(',')}]`
  const result: TableResult = {
    dimension: dimId, tableId: cfg.tableId, humanUrl: cfg.humanUrl, date,
    bytes, sha256: hash.digest('hex'), header, years: [...years].sort(),
    totalLines, muniRows: [...agg.values()].reduce((s, a) => s + a.rowCount, 0),
    classTally, catalogN: catalog.size, match: matched.length, sourceExtra: sourceExtra.length,
    sinDato, suprimidos, incompletas, coherentes, coherentTotal, ceroExtranjero,
    supMunis, incompletasMunis, incoherentes,
    distinctCats: [...distinctCats].sort(),
    catsByPeriod: [...globalCatsByPeriod.entries()].map(([p, s]) => [p, [...s].sort()] as [string, string[]]),
    perMuniSizes,
    detalleSample: [...sampleRows.entries()].map(([ine, rows]) => ({ ine, rows })),
    resumenJson: nacionalJson,
    complete: !timedOut,
    notes: timedOut ? ['presupuesto de tiempo agotado: cobertura parcial del fichero'] : [],
  }
  return result
}

async function main(): Promise<void> {
  const arg = process.argv.find((a) => a.startsWith('--table='))
  const onlyTable = arg ? arg.split('=')[1] : null
  const outArg = process.argv.find((a) => a.startsWith('--out='))
  const out = outArg ? outArg.split('=')[1] : 'tmp/dry-run-3d.json'
  console.log('Catálogo interno (solo lectura)…')
  const catalog = await loadCatalog()
  console.log(`Municipios catálogo: ${catalog.size}`)
  const catalogOrder = [...catalog.keys()]
  const sampleSet = new Set<string>(['02003', '07010', '02069', '28143'])
  catalogOrder.filter((_, i) => i % 1000 === 0).forEach((ine) => sampleSet.add(ine))
  const results: TableResult[] = []
  for (const dim of ['nationality', 'birth_country', 'birth_residence_relation'] as const) {
    const r = await runTable(dim, catalog, onlyTable, sampleSet)
    if (r) results.push(r)
  }
  writeFileSync(out, JSON.stringify({ date: new Date().toISOString(), catalogN: catalog.size, results }, null, 2))
  console.log(`\nManifiesto en ${out} (ignorado por git).`)
  for (const r of results) {
    console.log(`\n### ${r.dimension} (t=${r.tableId}) complete=${r.complete} match=${r.match}/${r.catalogN} coherentes=${r.coherentes}/${r.coherentTotal}`)
  }
}

main().catch((e) => { console.error('ERROR', e); process.exit(1) })
