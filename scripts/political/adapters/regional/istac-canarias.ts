// Canarias — Instituto Canario de Estadística (ISTAC), eDatos/Metamac, operación C00010A
// «Sistema de Información Electoral en Canarias». Nivel máximo publicado: SECCIÓN (no mesa).
//   https://datos.canarias.es/api/estadisticas/statistical-resources/v1.0/datasets/ISTAC/{id}/{versión}.json
//   Dimensiones: TERRITORIO × MEDIDAS × CANDIDATURAS (orden de data.dimensions; la última varía más rápido).
//   observations = 'v | v | …'; '' con ESTADO_OBSERVACION = 'M' = candidatura que no concurre en esa isla.
//   TERRITORIO de sección: '20230528_35004_D01_S001' (fecha_municipio_Ddd_Ssss); '…_RA' = residentes ausentes.
//   Medida VOTOS_VALIDOS_CANDIDATURA; CANDIDATURAS '_T' = Σ candidaturas (verificado en las 1.396 secciones).
// LIMITACIÓN: sin censo, votantes, blancos ni nulos por sección → esos campos son null (ND), la
// participación y los % sobre válidos no son calculables con esta fuente; sí el ganador y el margen
// en votos. Autonómicas: sólo circunscripciones INSULARES (C00010A_000053 / _000030); la circunscripción
// autonómica regional (C00010A_000054 / _000031) es una segunda papeleta y queda fuera del contrato
// (un objeto por convocatoria y municipio).

import path from 'node:path'

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

export const ISTAC_SOURCE_ID = 'istac-canarias'
export const ISTAC_PARSER_VERSION = 'istac-1.0.0'
const API = 'https://datos.canarias.es/api/estadisticas/statistical-resources/v1.0/datasets/ISTAC'
const AUTHORITY = 'Instituto Canario de Estadística (ISTAC), a partir de datos del Ministerio del Interior'
const LICENCE = 'Aviso legal ISTAC (reutilización con cita de la fuente): https://www.gobiernodecanarias.org/istac/aviso_legal.html'
/** Marcador de mesa para filas que ya son agregados de sección. */
export const ISTAC_SECTION_TABLE = '*'

export const ISTAC_DATASETS = [
  {
    electionDate: '2023-05-28',
    id: 'C00010A_000053',
    version: '1.2',
    sha: 'a84134564b03a27c865578144c15b7e2997de7db7d8650c4eab8efc8571714ee',
    seed: path.join('tmp', 'audit', 'political', 'regional', 'probe', 'istac53.json'),
  },
  { electionDate: '2019-05-26', id: 'C00010A_000030', version: '1.2', sha: null, seed: null },
] as const

const fileName = (d: (typeof ISTAC_DATASETS)[number]) => `${d.id}_${d.version}.json`

interface SdmxDim {
  dimensionId: string
  representations: { representation: Array<{ code: string; index: number }> }
}

export interface IstacParseResult {
  rows: PollingStationRow[]
  candidacies: Candidacy[]
  notes: string[]
}

export function parseIstacDataset(json: unknown, electionDate: string, where = 'ISTAC'): IstacParseResult {
  const j = json as {
    id?: string
    metadata?: { dimensions?: { dimension?: Array<{ id: string; dimensionValues?: { value?: Array<{ id: string; name?: { text?: Array<{ lang: string; value: string }> } }> } }> } }
    data?: { dimensions?: { dimension?: SdmxDim[] }; observations?: string; attributes?: { attribute?: Array<{ id: string; value: string }> } }
  }
  const dims = j.data?.dimensions?.dimension
  const obsText = j.data?.observations
  if (!dims || typeof obsText !== 'string') throw new Error(`${where}: JSON sin data.dimensions / data.observations (truncado o formato distinto)`)
  const order = dims.map((d) => d.dimensionId)
  for (const need of ['TERRITORIO', 'MEDIDAS', 'CANDIDATURAS']) if (!order.includes(need)) throw new Error(`${where}: dimensión ausente ${need}`)
  const sizes = dims.map((d) => d.representations.representation.length)
  const obs = obsText.split(' | ')
  const expected = sizes.reduce((a, b) => a * b, 1)
  if (obs.length !== expected) throw new Error(`${where}: ${obs.length} observaciones para ${expected} celdas (fichero truncado)`)
  const status = j.data?.attributes?.attribute?.find((a) => a.id === 'ESTADO_OBSERVACION')?.value.split(' | ')
  const strides = sizes.map((_, i) => sizes.slice(i + 1).reduce((a, b) => a * b, 1))
  const dimOf = (id: string) => dims[order.indexOf(id)]
  const pos = (id: string) => order.indexOf(id)
  const measure = dimOf('MEDIDAS').representations.representation.find((r) => r.code === 'VOTOS_VALIDOS_CANDIDATURA')
  if (!measure) throw new Error(`${where}: medida ausente VOTOS_VALIDOS_CANDIDATURA`)
  const cands = dimOf('CANDIDATURAS').representations.representation
  const total = cands.find((c) => c.code === '_T')
  if (!total) throw new Error(`${where}: candidatura total '_T' ausente`)
  const names = new Map<string, string>()
  for (const d of j.metadata?.dimensions?.dimension ?? [])
    if (d.id === 'CANDIDATURAS') for (const v of d.dimensionValues?.value ?? []) names.set(v.id, v.name?.text?.find((t) => t.lang === 'es')?.value ?? v.id)

  const cell = (t: number, c: number) => {
    const idx = t * strides[pos('TERRITORIO')] + measure.index * strides[pos('MEDIDAS')] + c * strides[pos('CANDIDATURAS')]
    return { v: obs[idx], s: status?.[idx] ?? '' }
  }
  const rows: PollingStationRow[] = []
  const notes: string[] = []
  let ndCells = 0
  const secRe = /^(\d{8})_(\d{5})_D(\d{2})_S(\d{3})$/
  for (const t of dimOf('TERRITORIO').representations.representation) {
    const m = t.code.match(secRe)
    if (!m) continue
    if (m[1] !== electionDate.replace(/-/g, '')) throw new Error(`${where}: sección ${t.code} de otra fecha electoral`)
    const votes: Record<string, number> = {}
    for (const c of cands) {
      if (c.code === '_T') continue
      const { v, s } = cell(t.index, c.index)
      if (v === '') {
        if (s !== 'M') ndCells++
        continue
      }
      const n = toCount(v, `${where} ${t.code} ${c.code}`)
      if (n !== null) votes[c.code] = n
    }
    const tot = cell(t.index, total.index)
    rows.push({
      electionType: 'autonomic',
      electionDate,
      provinceCode: m[2].slice(0, 2),
      municipalityCode: m[2],
      districtCode: m[3],
      sectionCode: m[4],
      table: ISTAC_SECTION_TABLE,
      census: null,
      voters: null,
      abstentions: null,
      validVotes: null,
      blankVotes: null,
      nullVotes: null,
      candidacyVotes: tot.v === '' ? null : toCount(tot.v, `${where} ${t.code} _T`),
      votes,
      special: null,
      municipalityName: null,
    })
  }
  if (!rows.length) throw new Error(`${where}: sin territorios de nivel sección`)
  if (ndCells) notes.push(`${ndCells} celdas vacías sin estado 'M' (ND)`)
  const candidacies: Candidacy[] = cands
    .filter((c) => c.code !== '_T')
    .map((c) => {
      const name = names.get(c.code) ?? c.code
      const acr = name.match(/\(([^()]+)\)\s*$/)?.[1] ?? c.code.replace(/^P_/, '')
      return { id: c.code, acronym: acr, name, type: 'unknown' as const, sourceCode: c.code, aggregationCode: null, color: null }
    })
  const ra = dimOf('TERRITORIO').representations.representation.filter((t) => /_RA$/.test(t.code)).length
  if (ra) notes.push(`${ra} territorios '_RA' (residentes ausentes por isla) sin sección: excluidos`)
  return { rows, candidacies, notes }
}

function dsOf(f: DownloadedFile | SourceDescriptor) {
  const name = 'descriptor' in f ? f.descriptor.fileName : f.fileName
  const d = ISTAC_DATASETS.find((x) => fileName(x) === name)
  if (!d) throw new Error(`ISTAC: fichero no reconocido ${name}`)
  return d
}

const parseFile = (f: DownloadedFile) => parseIstacDataset(JSON.parse(decodeText(readFileBuffer(f), 'utf-8')), dsOf(f).electionDate, f.descriptor.fileName)

export const istacAdapter: OfficialElectionSourceAdapter = {
  sourceId: ISTAC_SOURCE_ID,
  supports(electionType, electionDate, territory) {
    if (territory && territory !== '05') return false
    return electionType === 'autonomic' && ISTAC_DATASETS.some((d) => d.electionDate === electionDate)
  },
  async discover(electionType, electionDate) {
    return ISTAC_DATASETS.filter((d) => electionType === 'autonomic' && d.electionDate === electionDate).map((d) => ({
      sourceId: ISTAC_SOURCE_ID,
      electionType: 'autonomic' as const,
      electionDate,
      territoryCode: '05',
      url: `${API}/${d.id}/${d.version}.json`,
      fileName: fileName(d),
      expectedSha256: d.sha,
      format: 'sdmx-json (eDatos)',
      licence: LICENCE,
      authority: AUTHORITY,
      definitive: true,
    }))
  },
  async download(descriptor, ctx: AdapterContext) {
    const d = dsOf(descriptor)
    return downloadWithCache(descriptor, ctx, { seedPaths: d.seed ? [d.seed] : [], timeoutMs: 400_000 })
  },
  verifyHash: verifyExpectedHash,
  async inspectSchema(files) {
    const parts: SchemaReport['parts'] = []
    const missing: string[] = []
    for (const f of files) {
      try {
        const res = parseFile(f)
        parts.push({ name: f.descriptor.fileName, columns: ['TERRITORIO', 'MEDIDAS', 'CANDIDATURAS', 'OBS_VALUE'], rows: res.rows.length })
      } catch (e) {
        missing.push((e as Error).message)
      }
    }
    return { ok: missing.length === 0, parts, missing, notes: ['Nivel SECCIÓN: sin censo, votantes, blancos ni nulos; sólo votos a candidaturas.'] }
  },
  async parsePollingStations(files, ctx) {
    const out: PollingStationRow[] = []
    for (const f of files) {
      const res = parseFile(f)
      for (const n of res.notes) ctx.log(`${ISTAC_SOURCE_ID}: ${n}`)
      out.push(...res.rows)
    }
    return out
  },
  normalizeTerritorialCodes: normalizeCodes,
  async normalizeCandidacies(files) {
    return files.flatMap((f) => parseFile(f).candidacies)
  },
  validateSourceRows(rows) {
    const r = validateRows(rows, { candidacyOnly: true })
    return { ok: r.ok, rows: r.rows, errors: r.errors, warnings: [...r.warnings, 'fuente sin censo/votantes/blancos/nulos por sección: participación, blancos, nulos y % sobre válidos = ND'] }
  },
  getCoverage(rows) {
    return coverageOf(rows, 'autonomic', rows[0]?.electionDate ?? '', '05')
  },
  getMetadata(): AdapterMetadata {
    return {
      sourceId: ISTAC_SOURCE_ID,
      authority: AUTHORITY,
      territoryCode: '05',
      level: 'section',
      licence: LICENCE,
      portal: 'https://datos.canarias.es/catalogos/estadisticas/',
      parserVersion: ISTAC_PARSER_VERSION,
      notes: `Parlamento de Canarias 2023 y 2019, circunscripciones insulares, por SECCIÓN (mesa '${ISTAC_SECTION_TABLE}'). Sólo votos a candidaturas.`,
    }
  },
}
