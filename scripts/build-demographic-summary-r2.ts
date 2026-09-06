// FASE A — Construye el resumen demográfico municipal INE (sin escribir R2).
// Descarga los 3 CSV oficiales por streaming, valida todo en local y deja:
//   tmp/demo3e-summaries.json  (8130 objetos, ignorado por Git)
//   tmp/demo3e-prewrite.json   (manifest de preescritura, ignorado por Git)
// Aborta (exit 1, sin escribir nada) ante cualquier validación fallida.
// Uso: npx tsx scripts/build-demographic-summary-r2.ts
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
  type NormalizedObservation,
} from '../src/lib/ine-demographic-dimensions'

config({ path: '.env.local' })

const normLo = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, '')
const TABLE_BUDGET_MS = 560000
const SCHEMA = 'ine-demographic-summary-v1'
const GENERATED_AT = new Date().toISOString()

async function streamTable(
  tableId: number,
  dimColHint: string[],
  sexTotal: string,
  ageTotal: string | null,
  collect: (n: NormalizedObservation) => void,
): Promise<{ bytes: number; sha256: string; header: string[]; years: string[]; lines: number }> {
  const url = csvUrl(tableId)
  const res = await fetch(url, { headers: { Accept: '*/*', 'User-Agent': 'URBIdeas/1.0' }, redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`)
  if ((res.headers.get('content-type') ?? '').includes('text/html')) throw new Error('HTML en lugar de CSV')
  const reader = res.body?.getReader()
  if (!reader) throw new Error('Sin cuerpo')
  const dec = new TextDecoder('utf-8')
  const hash = createHash('sha256')
  let buf = ''
  let header: string[] = []
  let idx = { muni: -1, sexo: -1, edad: -1, dim: -1, per: -1, val: -1 }
  let lines = 0
  let bytes = 0
  const years = new Set<string>()
  const t0 = Date.now()
  for (;;) {
    if (Date.now() - t0 > TABLE_BUDGET_MS) throw new Error(`Presupuesto agotado en tabla ${tableId}`)
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
      lines += 1
      if (header.length === 0) {
        const sep = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ','
        const h = line.split(sep).map((x) => x.trim().toLowerCase())
        const find = (p: (x: string) => boolean): number => h.findIndex(p)
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
          throw new Error(`Cabecera inesperada en ${tableId}`)
        }
        continue
      }
      const cols = line.split(line.includes('\t') ? '\t' : ';')
      const raw = parseDimLine(cols, idx)
      if (!raw) continue
      const n = normalizeDimRow(raw)
      years.add(n.periodo)
      // Solo slice resumen (sexo total [+edad total]); el resto no se conserva.
      if (n.sexo !== sexTotal) continue
      if (ageTotal !== null && n.edad !== ageTotal) continue
      collect(n)
    }
    if (sd) break
  }
  try { await reader.cancel().catch(() => undefined) } catch { /* noop */ }
  return { bytes, sha256: hash.digest('hex'), header, years: [...years].sort(), lines }
}

type Status = 'observed' | 'suppressed' | 'missing' | 'partial'

export interface MunicipalSummary {
  schemaVersion: typeof SCHEMA
  ineCode: string
  municipalityName: string
  source: {
    institution: 'Instituto Nacional de Estadística'
    retrievedAt: string
    tables: Record<'nationality' | 'birthCountry' | 'birthResidenceRelation', { tableId: string; sourceUrl: string; period: string }>
  }
  nationality: { period: string; total: number | null; spanish: number | null; foreign: number | null; status: Status }
  birthCountry: {
    period: string
    categories: { sourceCode: string; sourceLabel: string; value: number | null; status: 'observed' | 'suppressed' | 'missing' }[]
    status: Status
    note: string
  }
  birthResidenceRelation: {
    period: string
    total: number | null
    sameMunicipality: number | null
    sameProvinceOtherMunicipality: number | null
    sameAutonomousCommunityOtherProvince: number | null
    otherAutonomousCommunity: number | null
    bornAbroad: number | null
    status: Status
  }
  quality: {
    territoryMatch: 'exact'
    nationalityArithmetic: 'exact' | 'not-evaluable' | 'suppressed' | 'partial'
    birthResidenceArithmetic: 'exact' | 'not-evaluable' | 'suppressed' | 'partial'
  }
}

const abort = (msg: string): never => {
  console.error(`ABORTAR CARGA: ${msg}`)
  process.exit(1)
}

async function main(): Promise<void> {
  // Catálogo (solo lectura).
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
  const catalog = new Map<string, string>()
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from('municipios').select('codigo_ine, nombre').order('codigo_ine').range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as { codigo_ine: string; nombre: string }[]
    for (const r of rows) catalog.set(r.codigo_ine.trim(), r.nombre)
    if (rows.length < PAGE) break
    from += PAGE
  }
  console.log(`Catálogo: ${catalog.size} municipios (solo lectura)`)

  // Acumuladores por municipio: periodo -> categoria -> {valor, sup}.
  type Cell = { valor: number | null; sup: boolean }
  const acc = new Map<string, { nat: Map<string, Map<string, Cell>>; pai: Map<string, Map<string, Cell>>; arr: Map<string, Map<string, Cell>> }>()
  const cell = (ine: string): { nat: Map<string, Map<string, Cell>>; pai: Map<string, Map<string, Cell>>; arr: Map<string, Map<string, Cell>> } => {
    let a = acc.get(ine)
    if (!a) {
      a = { nat: new Map(), pai: new Map(), arr: new Map() }
      acc.set(ine, a)
    }
    return a
  }
  const put = (m: Map<string, Map<string, Cell>>, periodo: string, cat: string, valor: number | null, sup: boolean): void => {
    const pm = m.get(periodo) ?? new Map<string, Cell>()
    pm.set(cat, { valor, sup })
    m.set(periodo, pm)
  }
  const srcInfo: Record<DemographicDimensionId, { bytes: number; sha256: string; years: string[] }> = {} as never

  for (const cfg of DIMENSION_TABLES) {
    const target = cfg.dimension === 'nationality' ? 'nat' : cfg.dimension === 'birth_country' ? 'pai' : 'arr'
    const r = await streamTable(cfg.tableId, cfg.dimColumnHint, cfg.sexTotal, cfg.ageTotal, (n) => {
      if (!catalog.has(n.ine)) return // filas de otros niveles ya filtradas por parse; códigos fuente extra se ignoran aquí y se auditan aparte
      put(cell(n.ine)[target], n.periodo, n.categoria, n.valor, n.suprimido || n.valor === null)
    })
    srcInfo[cfg.dimension] = { bytes: r.bytes, sha256: r.sha256, years: r.years }
    console.log(`${cfg.dimension}: ${r.lines} líneas, ${r.bytes} B, sha256 ${r.sha256.slice(0, 16)}…, años ${r.years.join(',')}`)
  }

  // Preflight previo conocido: 1 suprimido/dimensión (tolerancia +1 por actualización).
  const SUP_TOLERANCE = 2
  const objects: MunicipalSummary[] = []
  const supMunis: Record<string, string[]> = { nationality: [], birth_country: [], birth_residence_relation: [] }
  let coherentNat = 0
  let coherentArr = 0
  let maxBytes = 0
  let sumBytes = 0
  for (const [ine, nombre] of catalog) {
    const a = acc.get(ine)
    if (!a) abort(`código territorial sin match: ${ine}`)
    const latest = (m: Map<string, Map<string, Cell>>): string | null => {
      const ps = [...m.keys()].sort()
      return ps.length > 0 ? ps[ps.length - 1] : null
    }
    // Nacionalidad.
    const np = latest(a.nat)
    const nsl = np ? (a.nat.get(np) as Map<string, Cell>) : new Map<string, Cell>()
    const pick = (m: Map<string, Cell>, frags: string[], anti?: string): Cell | undefined => {
      const key = [...m.keys()].find((k) => frags.every((f) => normLo(k).includes(f)) && (!anti || !normLo(k).includes(anti)))
      return key ? m.get(key) : undefined
    }
    const nT = pick(nsl, ['total'])
    const nE = pick(nsl, ['espanola'], 'extranjera')
    const nX = pick(nsl, ['extranjera'])
    const natStatus: Status =
      !np ? 'missing'
      : [nT, nE, nX].every((c) => c && !c.sup && c.valor !== null) ? 'observed'
      : [nT, nE, nX].some((c) => c && !c.sup && c.valor !== null) ? 'partial'
      : 'suppressed'
    let natArith: MunicipalSummary['quality']['nationalityArithmetic'] = 'not-evaluable'
    if (nT && nE && nX && !nT.sup && !nE.sup && !nX.sup && nT.valor !== null && nE.valor !== null && nX.valor !== null) {
      if (nT.valor === nE.valor + nX.valor) { natArith = 'exact'; coherentNat += 1 }
      else abort(`nacionalidad no cuadra en ${ine}: ${nT.valor} ≠ ${nE.valor}+${nX.valor}`)
    } else if ([nT, nE, nX].some((c) => c?.sup)) {
      natArith = 'suppressed'
      supMunis.nationality.push(ine)
    } else {
      natArith = 'partial'
    }
    // País: categorías observadas del último periodo (sin agregados inventados).
    const pp = latest(a.pai)
    const psl = pp ? (a.pai.get(pp) as Map<string, Cell>) : new Map<string, Cell>()
    const paiCats = [...psl.entries()].map(([label, c]) => ({
      sourceCode: normLo(label).replace(/ /g, '_'),
      sourceLabel: label,
      value: c.sup || c.valor === null ? null : c.valor,
      status: (c.sup || c.valor === null ? 'suppressed' : 'observed') as 'observed' | 'suppressed' | 'missing',
    }))
    const paiObs = paiCats.filter((c) => c.status === 'observed').length
    const paiStatus: Status = psl.size === 0 || !pp ? 'missing' : paiObs === paiCats.length && paiCats.length > 0 ? 'observed' : paiObs > 0 ? 'partial' : 'suppressed'
    if (paiStatus === 'suppressed' || paiCats.some((c) => c.status === 'suppressed')) supMunis.birth_country.push(ine)
    if (paiStatus === 'suppressed') supMunis.birth_country.push(ine)
    // Arraigo.
    const ap = latest(a.arr)
    const asl = ap ? (a.arr.get(ap) as Map<string, Cell>) : new Map<string, Cell>()
    const findA = (frag: string, anti?: string): Cell | undefined => {
      const key = [...asl.keys()].find((k) => normLo(k).includes(frag) && (!anti || !normLo(k).includes(anti)))
      return key ? asl.get(key) : undefined
    }
    const aT = findA('total')
    const aM = findA('mismo municipio')
    const aP = findA('distinto municipio')
    const aC = findA('distinta provincia')
    const aO = findA('distinta comunidad')
    const aB = findA('extranjero')
    const arrVals = [aT, aM, aP, aC, aO, aB]
    const arrStatus: Status =
      !ap ? 'missing'
      : arrVals.every((c) => c && !c.sup && c.valor !== null) ? 'observed'
      : arrVals.some((c) => c && !c.sup && c.valor !== null) ? 'partial'
      : 'suppressed'
    let arrArith: MunicipalSummary['quality']['birthResidenceArithmetic'] = 'not-evaluable'
    if ([aT, aM, aP, aC, aO, aB].every((c) => c && !c.sup && c.valor !== null)) {
      const vs = [aT, aM, aP, aC, aO, aB].map((c) => (c as Cell).valor as number)
      if (vs[0] === vs[1] + vs[2] + vs[3] + vs[4] + vs[5]) { arrArith = 'exact'; coherentArr += 1 }
      else abort(`arraigo no cuadra en ${ine}`)
    } else if ([aT, aM, aP, aC, aO, aB].some((c) => c?.sup)) {
      arrArith = 'suppressed'
      supMunis.birth_residence_relation.push(ine)
    } else {
      arrArith = 'partial'
    }
    const val = (c: Cell | undefined): number | null => (c && !c.sup && c.valor !== null ? c.valor : null)
    const obj: MunicipalSummary = {
      schemaVersion: SCHEMA,
      ineCode: ine,
      municipalityName: nombre,
      source: {
        institution: 'Instituto Nacional de Estadística',
        retrievedAt: GENERATED_AT,
        tables: {
          nationality: { tableId: '68535', sourceUrl: csvUrl(68535), period: np ?? '' },
          birthCountry: { tableId: '66322', sourceUrl: csvUrl(66322), period: pp ?? '' },
          birthResidenceRelation: { tableId: '68540', sourceUrl: csvUrl(68540), period: ap ?? '' },
        },
      },
      nationality: { period: np ?? '', total: val(nT), spanish: val(nE), foreign: val(nX), status: natStatus },
      birthCountry: {
        period: pp ?? '',
        categories: paiCats,
        status: paiStatus,
        note: 'Las categorías de país no deben sumarse para derivar un total exterior; los conjuntos pueden variar entre años.',
      },
      birthResidenceRelation: {
        period: ap ?? '', total: val(aT), sameMunicipality: val(aM),
        sameProvinceOtherMunicipality: val(aP), sameAutonomousCommunityOtherProvince: val(aC),
        otherAutonomousCommunity: val(aO), bornAbroad: val(aB), status: arrStatus,
      },
      quality: { territoryMatch: 'exact', nationalityArithmetic: natArith, birthResidenceArithmetic: arrArith },
    }
    const bytes = JSON.stringify(obj).length
    if (bytes > 25 * 1024) abort(`objeto mayor de 25 KB: ${ine} (${bytes} B)`)
    sumBytes += bytes
    if (bytes > maxBytes) maxBytes = bytes
    objects.push(obj)
  }

  if (objects.length !== catalog.size) abort(`objetos ${objects.length} ≠ catálogo ${catalog.size}`)
  for (const [dim, list] of Object.entries(supMunis)) {
    if (list.length > SUP_TOLERANCE) abort(`suprimidos en ${dim}: ${list.length} (tolerancia ${SUP_TOLERANCE})`)
  }
  // Reglas de integridad global.
  const badNeg = objects.some((o) =>
    [o.nationality.total, o.nationality.spanish, o.nationality.foreign,
     o.birthResidenceRelation.total, o.birthResidenceRelation.sameMunicipality,
     o.birthResidenceRelation.sameProvinceOtherMunicipality,
     o.birthResidenceRelation.sameAutonomousCommunityOtherProvince,
     o.birthResidenceRelation.otherAutonomousCommunity, o.birthResidenceRelation.bornAbroad,
     ...o.birthCountry.categories.map((c) => c.value)].some((vv) => vv !== null && (vv < 0 || !Number.isInteger(vv))),
  )
  if (badNeg) abort('negativo o decimal no justificado')
  const badSup = objects.some((o) =>
    o.nationality.status === 'suppressed' && (o.nationality.total !== null || o.nationality.spanish !== null || o.nationality.foreign !== null),
  )
  if (badSup) abort('suprimido serializado como número')
  const hasResidenciaAnterior = objects.some((o) => /residencia anterior/i.test(JSON.stringify(o)))
  if (hasResidenciaAnterior) abort('residencia anterior detectada')
  // bornAbroad SOLO existe como campo autorizado de arraigo; prohibido derivarlo
  // en birthCountry (ni bornInSpain/foreignBorn/totalForeignBorn).
  const forbiddenBirthKeys = objects.some((o) =>
    o.birthCountry.categories.some((c) => /^(bornInSpain|bornAbroad|foreignBorn|totalForeignBorn)$/.test(c.sourceCode)),
  )
  if (forbiddenBirthKeys) abort('bornAbroad derivado desde países')

  const sizes = objects.map((o) => JSON.stringify(o).length).sort((a, b) => a - b)
  const at = (p: number): number => sizes[Math.min(sizes.length - 1, Math.floor(p * sizes.length))]
  const manifest = {
    kind: 'demo3e-prewrite',
    generatedAt: GENERATED_AT,
    expected: catalog.size,
    built: objects.length,
    coherentNat,
    coherentArr,
    supMunis,
    bytesTotal: sumBytes,
    bytesMean: Math.round(sumBytes / objects.length),
    bytesP50: at(0.5),
    bytesP95: at(0.95),
    bytesMax: maxBytes,
    sources: {
      nationality: { tableId: '68535', ...srcInfo.nationality },
      birth_country: { tableId: '66322', ...srcInfo.birth_country },
      birth_residence_relation: { tableId: '68540', ...srcInfo.birth_residence_relation },
    },
    states: {
      nationality: tally(objects.map((o) => o.nationality.status)),
      birthCountry: tally(objects.map((o) => o.birthCountry.status)),
      birthResidence: tally(objects.map((o) => o.birthResidenceRelation.status)),
    },
  }
  writeFileSync('tmp/demo3e-summaries.json', JSON.stringify(objects))
  writeFileSync('tmp/demo3e-prewrite.json', JSON.stringify(manifest, null, 2))
  console.log(`OK Fase A: ${objects.length} objetos, coherentes nac=${coherentNat} arraigo=${coherentArr}, bytes total=${sumBytes} media=${Math.round(sumBytes / objects.length)} p95=${at(0.95)} max=${maxBytes}`)
  console.log('Prewrite en tmp/demo3e-prewrite.json (ignorado). R2 intacto: cero escrituras en esta fase.')

  function tally(xs: string[]): Record<string, number> {
    const m: Record<string, number> = {}
    for (const x of xs) m[x] = (m[x] ?? 0) + 1
    return m
  }
}

main().catch((e) => { console.error('ERROR', e); process.exit(1) })
