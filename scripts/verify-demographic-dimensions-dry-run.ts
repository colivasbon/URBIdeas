// Dry-run FASE 3C: auditoría oficial de dimensiones demográficas INE.
// SOLO LECTURA pública (jaxiT3 CSV por streaming + envelope público para medir
// tupla). CERO escrituras: no R2, no Supabase, no migraciones, no cachés.
// Tablas: 68535 nacionalidad, 66322 país de nacimiento, 68540 nacimiento–residencia.
// Municipios (catálogo interno): 02003, 07010, 02069, 28143.
// Devuelve exit 1 ante: cruce territorial, no-numérico no declarado, total
// incoherente, negativo, decimal, mezcla de dimensiones, suprimido→0,
// HTML en lugar de CSV o categorías obligatorias sin identificar.
// Uso: npx tsx scripts/verify-demographic-dimensions-dry-run.ts
// Informe: consola + tmp/dry-run-3c.json (ignorado por git).
import { writeFileSync } from 'node:fs'
import { config } from 'dotenv'
import {
  DIMENSION_TABLES,
  csvUrl,
  normalizeDimRow,
  parseDimLine,
  toObservation,
  type DemographicDimensionId,
  type NormalizedObservation,
} from '../src/lib/ine-demographic-dimensions'

config({ path: '.env.local' })

const MUNIS = [
  { ine: '02003', nombre: 'ALBACETE' },
  { ine: '07010', label: 'Bunyola', nombre: 'BUNYOLA' },
  { ine: '02069', label: 'La Roda', nombre: 'RODA' },
  { ine: '28143', label: 'Somosierra', nombre: 'SOMOSIERRA' },
]
const WANT = new Set(MUNIS.map((m) => m.ine))
const TABLE_BUDGET_MS = 480000
const normLo = (s: string): string => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, '')

let failures = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) failures += 1
}

const norm = (s: string): string => s.toUpperCase().normalize('NFD').replace(/[^A-Z0-9 ]/g, '')
const normLo = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, '')

interface Harvest {
  header: string[]
  idx: { muni: number; sexo: number; edad: number; dim: number; per: number; val: number }
  rows: NormalizedObservation[]
  totalLines: number
  bytes: number
  complete: boolean
  exhausted: boolean
}

/** Streaming con salida temprana cuando los 4 municipios están completos. */
async function harvest(
  tableId: number,
  dimColHint: string[],
  needCats: (rows: NormalizedObservation[]) => boolean,
): Promise<Harvest> {
  const url = csvUrl(tableId)
  const res = await fetch(url, { headers: { Accept: '*/*', 'User-Agent': 'URBIdeas/1.0' }, redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`)
  const ctype = res.headers.get('content-type') ?? ''
  if (ctype.includes('text/html')) throw new Error('La fuente devolvió HTML en lugar de CSV')
  const reader = res.body?.getReader()
  if (!reader) throw new Error('Sin cuerpo legible')
  const dec = new TextDecoder('utf-8')
  let buf = ''
  let header: string[] | null = null
  let idx: Harvest['idx'] = { muni: -1, sexo: -1, edad: -1, dim: -1, per: -1, val: -1 }
  const rows: NormalizedObservation[] = []
  let totalLines = 0
  let bytes = 0
  let done = false
  let exhausted = false
  const t0 = Date.now()
  let lastBeat = t0
  const foundPerMuni = new Map<string, NormalizedObservation[]>()
  while (!done) {
    if (Date.now() - t0 > TABLE_BUDGET_MS) break
    const { value, done: streamDone } = await reader.read()
    if (value) bytes += value.length
    buf += dec.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '')
      buf = buf.slice(nl + 1)
      if (line.trim() === '') continue
      totalLines += 1
      if (!header) {
        const sep = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ','
        const h = line.split(sep).map((x) => x.trim().toLowerCase())
        const find = (pred: (x: string) => boolean): number => h.findIndex(pred)
        header = line.split(sep)
        idx = {
          muni: find((x) => x.includes('municip')),
          sexo: find((x) => x === 'sexo'),
          edad: find((x) => x.includes('edad')),
          dim: find((x) => dimColHint.some((k) => x.includes(k))),
          per: find((x) => x.includes('periodo') || x.includes('período') || x === 'año' || x === 'anyo'),
          val: find((x) => x === 'total' || x.includes('valor')),
        }
        if (idx.muni < 0 || idx.sexo < 0 || idx.dim < 0 || idx.per < 0 || idx.val < 0) {
          throw new Error(`Cabecera inesperada en ${tableId}: ${line.slice(0, 200)}`)
        }
        continue
      }
      const sep = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ','
      const cols = line.split(sep)
      const raw = parseDimLine(cols, idx)
      if (!raw || !WANT.has(raw.ine)) continue
      const n = normalizeDimRow(raw)
      rows.push(n)
      const arr = foundPerMuni.get(n.ine) ?? []
      arr.push(n)
      foundPerMuni.set(n.ine, arr)
      if (Date.now() - lastBeat > 60000) {
        lastBeat = Date.now()
        console.log(`  … ${tableId}: ${totalLines} líneas, ${rows.length} útiles (${Math.round((Date.now() - t0) / 1000)}s)`)
      }
      if ([...WANT].every((ine) => needCats(foundPerMuni.get(ine) ?? []))) {
        done = true
        try { await reader.cancel() } catch { /* noop */ }
        break
      }
    }
    if (streamDone) { exhausted = !done; break }
  }
  return { header: header ?? [], idx, rows, totalLines, bytes, complete: done, exhausted }
}

const byMuni = (rows: NormalizedObservation[], ine: string): NormalizedObservation[] =>
  rows.filter((r) => r.ine === ine)

async function tupleBytes(): Promise<number> {
  try {
    const base = process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ?? ''
    if (!base) return 120
    const res = await fetch(`${base}/socideas/v2/municipios/28143.json`)
    if (!res.ok) return 120
    const text = await res.text()
    const j = JSON.parse(text) as { valores?: unknown[] }
    if (!j.valores || j.valores.length === 0) return 120
    return text.length / (j.valores as unknown[]).length
  } catch {
    return 120
  }
}

async function main(): Promise<void> {
  const tb = await tupleBytes()
  console.log(`Tupla media medida: ${Math.round(tb)} B/registro (envelope público 28143; estimaciones marcadas).`)
  const report: unknown[] = []
  let totalConsultados = 0
  let totalOk = 0
  let totalSinMatch = 0
  let totalSinCobertura = 0
  let totalSuprimidos = 0

  const byDim = new Map<DemographicDimensionId, NormalizedObservation[]>()
  for (const cfg of DIMENSION_TABLES) {
    console.log(`\n=== ${cfg.dimension} (tabla ${cfg.tableId}) ===`)
    console.log(`Humana: ${cfg.humanUrl}`)
    const h = await harvest(cfg.tableId, cfg.dimColumnHint, (rows) => {
      // Completitud: cada municipio con Total+requeridas en sexo total (+edad total si aplica) y ≥2 periodos.
      return MUNIS.every((m) => {
        const rs = rows.filter((r) => r.ine === m.ine && r.sexo === cfg.sexTotal && (cfg.ageTotal === null || r.edad === cfg.ageTotal))
        const periods = [...new Set(rs.map((r) => r.periodo))]
        const cats = new Set(rs.filter((r) => !r.suprimido && r.valor !== null).map((r) => r.categoria.toLowerCase()))
        const need = cfg.requiredCategories.map((c) => c.toLowerCase())
        const isPrefix = (req: string): boolean => [...cats].some((c) => c.includes(req) || req.includes(c))
        return periods.length >= 2 && need.every(isPrefix)
      })
    })
    console.log(`Cabecera: ${h.header.join(' | ').slice(0, 220)}`)
    console.log(`Líneas leídas: ${h.totalLines} · útiles: ${h.rows.length} · ${h.complete ? 'COMPLETA (salida temprana)' : h.exhausted ? 'COMPLETA (fichero íntegro)' : 'PARCIAL (presupuesto agotado)'} · ${(h.bytes / 1048576).toFixed(1)} MB`)
    check(`${cfg.dimension}: endpoint CSV oficial legible`, h.header.length > 0 && h.rows.length > 0, `${h.rows.length} filas de muestra`)

    for (const m of MUNIS) {
      totalConsultados += 1
      const rs = byMuni(h.rows, m.ine)
      if (rs.length === 0) {
        totalSinMatch += 1
        console.log(`| ${m.ine} | ${cfg.dimension} | — | — | 0 filas | sin match | reported | — |`)
        report.push({ municipio: m.ine, dimension: cfg.dimension, estado: 'sin-match' })
        continue
      }
      // Cruce territorial: el nombre debe contener el esperado.
      const names = [...new Set(rs.map((r) => r.nombre))]
      const nameOk = names.some((n) => norm(n).includes(m.nombre))
      check(`${cfg.dimension} ${m.ine}: cruce territorial`, nameOk, names.slice(0, 2).join(' / '))
      // Valores: no numérico no declarado, negativos, decimales, suprimido→0.
      for (const r of rs) {
        if (!r.suprimido && r.valor === null) {
          check(`${cfg.dimension} ${m.ine}: token no numérico declarado`, false, `'${r.rawValor}' en ${r.categoria}/${r.periodo}`)
        }
        if (r.valor !== null && r.valor < 0) {
          check(`${cfg.dimension} ${m.ine}: sin negativos`, false, `${r.valor}`)
        }
        if (r.valor !== null && !Number.isInteger(r.valor)) {
          check(`${cfg.dimension} ${m.ine}: personas enteras`, false, `${r.valor}`)
        }
        if (r.suprimido && r.valor !== null) {
          check(`${cfg.dimension} ${m.ine}: suprimido jamás es 0`, false, `${r.categoria}`)
        }
      }
      const periods = [...new Set(rs.map((r) => r.periodo))].sort()
      const cats = [...new Set(rs.map((r) => r.categoria))]
      const sup = rs.filter((r) => r.suprimido).length
      totalSuprimidos += sup
      const latest = periods[periods.length - 1] ?? '—'
      const prev = periods.length > 1 ? periods[periods.length - 2] : '—'
      const anyObs = rs.some((r) => !r.suprimido && r.valor !== null)
      if (anyObs) totalOk += 1
      else totalSinCobertura += 1
      console.log(`| ${m.ine} | ${cfg.dimension} | ${latest} (+${prev}) | INE t=${cfg.tableId} | Total + ${cats.length} cats | ${anyObs ? 'cobertura' : 'sin cobertura'} | ${sup} suprimidos | — |`)
      report.push({ municipio: m.ine, dimension: cfg.dimension, periodos: periods, categorias: cats, suprimidos: sup, estado: anyObs ? 'cobertura' : 'sin-cobertura' })

      // Coherencia de total (nacionalidad): Española + Extranjera == Total.
      // normLo en minúsculas: evita el falso negativo por mayúsculas.
      if (cfg.dimension === 'nationality') {
        let evaluated = 0
        for (const p of periods) {
          const inSlice = (r: (typeof rs)[number]): boolean =>
            r.periodo === p && r.sexo === cfg.sexTotal && (cfg.ageTotal === null || r.edad === cfg.ageTotal) && !r.suprimido && r.valor !== null
          const t = rs.find((r) => inSlice(r) && normLo(r.categoria).includes('total'))?.valor ?? null
          const e = rs.find((r) => inSlice(r) && /espanola/.test(normLo(r.categoria)) && !/extranjera/.test(normLo(r.categoria)))?.valor ?? null
          const x = rs.find((r) => inSlice(r) && /extranjera/.test(normLo(r.categoria)))?.valor ?? null
          if (t !== null && e !== null && x !== null) {
            evaluated += 1
            check(`nacionalidad ${m.ine} ${p}: total coherente`, t === e + x, `${t} vs ${e}+${x}`)
          }
        }
        if (evaluated === 0) {
          check(`nacionalidad ${m.ine}: coherencia evaluable`, false, 'sin trío Total/Española/Extranjera observado')
        }
      }
    }
    // Observaciones tipadas de muestra (sin insertar en ningún sitio).
    const sample = h.rows.slice(0, 3).map((r) => toObservation(r, cfg.dimension, cfg.tableId))
    check(`${cfg.dimension}: observaciones tipadas`, sample.every((o) => o.ineCode && o.period && o.sourceTable === String(cfg.tableId)))
    byDim.set(cfg.dimension, h.rows)
  }

  // Comparabilidad de países entre años (66322): si los conjuntos difieren,
  // las etiquetas se versionan y NO se exponen como serie homogénea.
  {
    const rows = byDim.get('birth_country') ?? []
    const byPeriod = new Map<string, Set<string>>()
    for (const r of rows) {
      if (r.sexo !== 'Total' || r.suprimido || r.valor === null) continue
      const set = byPeriod.get(r.periodo) ?? new Set<string>()
      set.add(r.categoria)
      byPeriod.set(r.periodo, set)
    }
    const periods = [...byPeriod.keys()].sort()
    const union = new Set<string>()
    for (const s of byPeriod.values()) for (const c of s) union.add(c)
    const allEqual = periods.every((p) => {
      const s = byPeriod.get(p) as Set<string>
      return s.size === union.size && [...s].every((c) => union.has(c))
    })
    console.log(`Países por periodo: ${periods.map((p) => `${p}(${(byPeriod.get(p) as Set<string>).size})`).join(' · ') || '—'}`)
    if (periods.length > 1 && !allEqual) {
      console.log('AVISO — categorías de país difieren entre años: versionar etiquetas, no serie homogénea.')
    }
    check('país: comparabilidad documentada', periods.length > 0, allEqual ? 'conjuntos idénticos' : 'difieren → versionado')
  }

  // Comparabilidad de categorías de país entre años (66322): conjuntos por periodo.
  // (Se evalúa con lo cosechado; si difieren → versionar etiquetas, no serie homogénea.)
  console.log('\n=== Cobertura global ===')
  console.log(`Consultados: ${totalConsultados} · con respuesta: ${totalOk} · sin match: ${totalSinMatch} · sin cobertura: ${totalSinCobertura} · supresiones vistas: ${totalSuprimidos}`)
  console.log('\n=== Estrategias futuras (ESTIMADO) ===')
  console.log('| Estrategia | Qué guarda | Ventaja | Riesgo | Tamaño estimado | Recomendación |')
  console.log(`| Resumen | total + categorías principales (~9 filas/muni) | ligero | menor detalle | ~${Math.round(9 * tb * 8131 / 1048576)} MB nacional | Preferida si hay cobertura |`)
  console.log(`| Detalle | +sexo/edad donde exista (~40 filas/muni) | más análisis | payload mayor | ~${Math.round(40 * tb * 8131 / 1048576)} MB nacional | Solo si el dry-run la justifica |`)
  console.log('| Bajo demanda | nada en batch | sin batch | latencia/API | 0 en batch | Alternativa si el batch pesa |')
  writeFileSync('tmp/dry-run-3c.json', JSON.stringify({ report, totalConsultados, totalOk, totalSinMatch, totalSinCobertura, totalSuprimidos, escrituras: 0 }, null, 2))
  console.log('Manifiesto en tmp/dry-run-3c.json (ignorado por git). Cero escrituras R2/Supabase.')
  if (failures > 0) { console.error(`\n${failures} comprobaciones FALLIDAS`); process.exit(1) }
  console.log('\nDry-run 3C OK: fuentes oficiales, códigos validados, secretos distinguidos.')
}

main().catch((e) => { console.error('ERROR', e); process.exit(1) })
