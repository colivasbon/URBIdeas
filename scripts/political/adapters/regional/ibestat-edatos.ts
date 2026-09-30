// Illes Balears — Institut d'Estadística de les Illes Balears (IBESTAT), eDatos/Metamac.
// Elecciones al Parlament de les Illes Balears, por MESA:
//   participación  000199A_000012 (2023) / 000199A_000011 (2019)  TERRITORIO × MEDIDAS(16)
//     ELECTORES, VOTANTES, ABSTENCION, VOTOS_NULOS, VOTOS_VALIDOS, VOTOS_VALIDOS_BLANCO, VOTOS_VALIDOS_CANDIDATURA…
//   candidaturas   000199A_000081 (2023) / 000199A_000080 (2019)  TERRITORIO × MEDIDAS(3) × CANDIDATURA
//     VOTOS_VALIDOS_CANDIDATURA; CANDIDATURA '_T' = total.
//   https://ibestat.es/edatos/apis/statistical-resources/v1.0/datasets/IBESTAT/{id}/{versión}.json
// TERRITORIO de mesa: '20230528_07001_D01_S001_MA' → municipio 07001, distrito 01, sección 001, mesa A
// ('_MU' = mesa única). Observación '' con ESTADO_OBSERVACION 'M' = candidatura que no concurre en la isla.
// Cierra el hueco de la matriz previa (sólo había localizado la participación de Consells Insulars).

import type {
  AdapterContext,
  AdapterMetadata,
  DownloadedFile,
  OfficialElectionSourceAdapter,
  PollingStationRow,
  SchemaReport,
  SourceDescriptor,
} from '../../adapter'
import type { Candidacy } from '../../../../src/lib/socideas-secciones-political'
import { coverageOf, decodeText, downloadWithCache, normalizeCodes, readFileBuffer, toCount, validateRows, verifyExpectedHash } from './_shared'

export const IBESTAT_SOURCE_ID = 'ibestat-edatos'
export const IBESTAT_PARSER_VERSION = 'ibestat-1.0.0'
const API = 'https://ibestat.es/edatos/apis/statistical-resources/v1.0/datasets/IBESTAT'
const AUTHORITY = "Institut d'Estadística de les Illes Balears (IBESTAT)"
const LICENCE = 'CC BY 4.0 (catálogo datos.gob.es) / aviso legal IBESTAT'

export const IBESTAT_CONVOCATORIAS = [
  { electionDate: '2023-05-28', participation: { id: '000199A_000012', version: '1.0' }, candidacies: { id: '000199A_000081', version: '2.0' } },
  { electionDate: '2019-05-26', participation: { id: '000199A_000011', version: '1.0' }, candidacies: { id: '000199A_000080', version: '2.0' } },
] as const

const fileName = (d: { id: string; version: string }) => `IBESTAT_${d.id}_${d.version}.json`

// ─────────────────────────────────────────────────────────────────────────────
// Lector genérico de cubos eDatos (Metamac JSON)
// ─────────────────────────────────────────────────────────────────────────────

export interface EdatosCube {
  dims: string[]
  codes: Record<string, string[]>
  names: Record<string, Map<string, string>>
  get(coord: Record<string, string>): { value: string; status: string } | undefined
}

export function readEdatosCube(json: unknown, where: string): EdatosCube {
  const j = json as {
    metadata?: { dimensions?: { dimension?: Array<{ id: string; dimensionValues?: { value?: Array<{ id: string; name?: { text?: Array<{ lang: string; value: string }> } }> } }> } }
    data?: {
      dimensions?: { dimension?: Array<{ dimensionId: string; representations: { representation: Array<{ code: string; index: number }> } }> }
      observations?: string
      attributes?: { attribute?: Array<{ id: string; value: string }> }
    }
  }
  const dd = j.data?.dimensions?.dimension
  const obsText = j.data?.observations
  if (!dd || typeof obsText !== 'string') throw new Error(`${where}: JSON sin data.dimensions / data.observations (truncado o formato distinto)`)
  const dims = dd.map((d) => d.dimensionId)
  const sizes = dd.map((d) => d.representations.representation.length)
  const obs = obsText.split(' | ')
  const total = sizes.reduce((a, b) => a * b, 1)
  if (obs.length !== total) throw new Error(`${where}: ${obs.length} observaciones para ${total} celdas (fichero truncado)`)
  const status = j.data?.attributes?.attribute?.find((a) => a.id === 'ESTADO_OBSERVACION')?.value.split(' | ')
  const strides = sizes.map((_, i) => sizes.slice(i + 1).reduce((a, b) => a * b, 1))
  const index = dd.map((d) => new Map(d.representations.representation.map((r) => [r.code, r.index])))
  const codes: Record<string, string[]> = {}
  dd.forEach((d) => (codes[d.dimensionId] = [...d.representations.representation].sort((a, b) => a.index - b.index).map((r) => r.code)))
  const names: Record<string, Map<string, string>> = {}
  for (const d of j.metadata?.dimensions?.dimension ?? [])
    names[d.id] = new Map((d.dimensionValues?.value ?? []).map((v) => [v.id, v.name?.text?.find((t) => t.lang === 'es')?.value ?? v.id]))
  return {
    dims,
    codes,
    names,
    get(coord) {
      let idx = 0
      for (let i = 0; i < dims.length; i++) {
        const p = index[i].get(coord[dims[i]])
        if (p === undefined) return undefined
        idx += p * strides[i]
      }
      return { value: obs[idx], status: status?.[idx] ?? '' }
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser
// ─────────────────────────────────────────────────────────────────────────────

const MESA_RE = /^(\d{8})_(\d{5})_D(\d{2})_S(\d{3})_M([A-Z0-9]+)$/
const PART_MEASURES = ['ELECTORES', 'VOTANTES', 'ABSTENCION', 'VOTOS_NULOS', 'VOTOS_VALIDOS', 'VOTOS_VALIDOS_BLANCO', 'VOTOS_VALIDOS_CANDIDATURA']

export interface IbestatParseResult {
  rows: PollingStationRow[]
  candidacies: Candidacy[]
  notes: string[]
}

export function parseIbestat(participationJson: unknown, candidacyJson: unknown, electionDate: string): IbestatParseResult {
  const p = readEdatosCube(participationJson, 'IBESTAT participación')
  const c = readEdatosCube(candidacyJson, 'IBESTAT candidaturas')
  for (const need of ['TERRITORIO', 'MEDIDAS']) if (!p.dims.includes(need)) throw new Error(`IBESTAT participación: dimensión ausente ${need}`)
  for (const need of ['TERRITORIO', 'MEDIDAS', 'CANDIDATURA']) if (!c.dims.includes(need)) throw new Error(`IBESTAT candidaturas: dimensión ausente ${need}`)
  const missing = PART_MEASURES.filter((m) => !p.codes.MEDIDAS.includes(m))
  if (missing.length) throw new Error(`IBESTAT participación: medidas ausentes ${missing.join(', ')}`)
  if (!c.codes.MEDIDAS.includes('VOTOS_VALIDOS_CANDIDATURA')) throw new Error('IBESTAT candidaturas: medida ausente VOTOS_VALIDOS_CANDIDATURA')
  const ymd = electionDate.replace(/-/g, '')
  const partyCodes = c.codes.CANDIDATURA.filter((x) => x !== '_T')
  const rows: PollingStationRow[] = []
  const notes: string[] = []
  let ndCells = 0
  let noCandData = 0
  const pv = (terr: string, m: string) => {
    const o = p.get({ TERRITORIO: terr, MEDIDAS: m })
    return o && o.value !== '' ? toCount(o.value, `IBESTAT ${terr} ${m}`) : null
  }
  for (const terr of p.codes.TERRITORIO) {
    const mm = terr.match(MESA_RE)
    if (!mm) continue
    if (mm[1] !== ymd) throw new Error(`IBESTAT: mesa ${terr} de otra fecha electoral`)
    const votes: Record<string, number> = {}
    if (!c.codes.TERRITORIO.includes(terr)) noCandData++
    else
      for (const party of partyCodes) {
        const o = c.get({ TERRITORIO: terr, MEDIDAS: 'VOTOS_VALIDOS_CANDIDATURA', CANDIDATURA: party })
        if (!o || o.value === '') {
          if (o && o.status !== 'M') ndCells++
          continue
        }
        const v = toCount(o.value, `IBESTAT ${terr} ${party}`)
        if (v !== null) votes[party] = v
      }
    rows.push({
      electionType: 'autonomic',
      electionDate,
      provinceCode: mm[2].slice(0, 2),
      municipalityCode: mm[2],
      districtCode: mm[3],
      sectionCode: mm[4],
      table: mm[5],
      census: pv(terr, 'ELECTORES'),
      voters: pv(terr, 'VOTANTES'),
      abstentions: pv(terr, 'ABSTENCION'),
      validVotes: pv(terr, 'VOTOS_VALIDOS'),
      blankVotes: pv(terr, 'VOTOS_VALIDOS_BLANCO'),
      nullVotes: pv(terr, 'VOTOS_NULOS'),
      candidacyVotes: pv(terr, 'VOTOS_VALIDOS_CANDIDATURA'),
      votes,
      special: null,
      municipalityName: null,
    })
  }
  if (!rows.length) throw new Error('IBESTAT: sin territorios de nivel mesa')
  if (noCandData) notes.push(`${noCandData} mesas sin territorio en el cubo de candidaturas`)
  if (ndCells) notes.push(`${ndCells} celdas de candidatura vacías sin estado 'M' (ND)`)
  const candidacies: Candidacy[] = partyCodes.map((code) => {
    const name = c.names.CANDIDATURA?.get(code) ?? code
    const acr = name.match(/\(([^()]+)\)\s*$/)?.[1] ?? code
    return { id: code, acronym: acr, name, type: 'unknown' as const, sourceCode: code, aggregationCode: null, color: null }
  })
  return { rows, candidacies, notes }
}

// ─────────────────────────────────────────────────────────────────────────────
// Adaptador
// ─────────────────────────────────────────────────────────────────────────────

function convOf(f: DownloadedFile | SourceDescriptor) {
  const name = 'descriptor' in f ? f.descriptor.fileName : f.fileName
  const c = IBESTAT_CONVOCATORIAS.find((x) => fileName(x.participation) === name || fileName(x.candidacies) === name)
  if (!c) throw new Error(`IBESTAT: fichero no reconocido ${name}`)
  return c
}

function load(files: DownloadedFile[]): IbestatParseResult {
  const c = convOf(files[0])
  const pf = files.find((f) => f.descriptor.fileName === fileName(c.participation))
  const cf = files.find((f) => f.descriptor.fileName === fileName(c.candidacies))
  if (!pf || !cf) throw new Error('IBESTAT: faltan los cubos de participación y/o candidaturas')
  const read = (f: DownloadedFile) => JSON.parse(decodeText(readFileBuffer(f), 'utf-8'))
  return parseIbestat(read(pf), read(cf), c.electionDate)
}

export const ibestatAdapter: OfficialElectionSourceAdapter = {
  sourceId: IBESTAT_SOURCE_ID,
  supports(electionType, electionDate, territory) {
    if (territory && territory !== '04') return false
    return electionType === 'autonomic' && IBESTAT_CONVOCATORIAS.some((c) => c.electionDate === electionDate)
  },
  async discover(electionType, electionDate) {
    const c = IBESTAT_CONVOCATORIAS.find((x) => x.electionDate === electionDate)
    if (electionType !== 'autonomic' || !c) return []
    return [c.participation, c.candidacies].map((d) => ({
      sourceId: IBESTAT_SOURCE_ID,
      electionType: 'autonomic' as const,
      electionDate,
      territoryCode: '04',
      url: `${API}/${d.id}/${d.version}.json`,
      fileName: fileName(d),
      expectedSha256: null,
      format: 'json (eDatos/Metamac)',
      licence: LICENCE,
      authority: AUTHORITY,
      definitive: true,
    }))
  },
  async download(descriptor, ctx: AdapterContext) {
    const seed = `tmp/audit/political/regional/probe/ib_${descriptor.fileName.replace(/^IBESTAT_/, '')}`
    return downloadWithCache(descriptor, ctx, { seedPaths: [seed], unstableContainerHash: true, timeoutMs: 400_000 })
  },
  verifyHash: verifyExpectedHash,
  async inspectSchema(files) {
    const parts: SchemaReport['parts'] = []
    const missing: string[] = []
    for (const f of files) {
      try {
        const cube = readEdatosCube(JSON.parse(decodeText(readFileBuffer(f), 'utf-8')), f.descriptor.fileName)
        parts.push({ name: f.descriptor.fileName, columns: cube.dims.map((d) => `${d}(${cube.codes[d].length})`), rows: cube.codes.TERRITORIO?.filter((t) => MESA_RE.test(t)).length ?? 0 })
      } catch (e) {
        missing.push((e as Error).message)
      }
    }
    return { ok: missing.length === 0, parts, missing, notes: ['Mesa = territorio *_S###_M?; participación y candidaturas en cubos separados con el mismo árbol territorial.'] }
  },
  async parsePollingStations(files, ctx) {
    const res = load(files)
    for (const n of res.notes) ctx.log(`${IBESTAT_SOURCE_ID}: ${n}`)
    return res.rows
  },
  normalizeTerritorialCodes: normalizeCodes,
  async normalizeCandidacies(files) {
    return load(files).candidacies
  },
  validateSourceRows(rows) {
    const r = validateRows(rows)
    return { ok: r.ok, rows: r.rows, errors: r.errors, warnings: r.warnings }
  },
  getCoverage(rows) {
    return coverageOf(rows, 'autonomic', rows[0]?.electionDate ?? '', '04')
  },
  getMetadata(): AdapterMetadata {
    return {
      sourceId: IBESTAT_SOURCE_ID,
      authority: AUTHORITY,
      territoryCode: '04',
      level: 'polling_station',
      licence: LICENCE,
      portal: 'https://ibestat.es/edatos/',
      parserVersion: IBESTAT_PARSER_VERSION,
      notes: 'Parlament de les Illes Balears 2023 y 2019 por mesa: cubo de participación + cubo de candidaturas (000199A).',
    }
  },
}
