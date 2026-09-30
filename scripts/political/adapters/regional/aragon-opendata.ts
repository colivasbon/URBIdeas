// Aragón — Gobierno de Aragón, Aragón Open Data (GA_OD_Core). Elecciones a las Cortes de Aragón.
//   resource_id=380  participación por mesa   (UTF-8, ',')
//     cod_elec,nombre_elec,cod_mesa,cod_municipio,cod_distrito,votantes_e,abstencion_e,nulos_e,blancos_e,
//     candidatura_e,electores_e,validos_e,certificaciones_e,municipio,cod_comarca,comarca,cod_provincia,provincia
//   resource_id=381  votos por candidatura y mesa
//     cod_elec,nombre_elec,nombre_par,cod_mesa,cod_municipio,cod_distrito,cod_par,votos_e,votos_p_e,…
//   filtro {"cod_elec": "CA2023"} / "CA2019".
// cod_mesa = municipio(5) + distrito(2) + sección(3) + mesa (p. ej. '5012401001U'): la sección SÍ
// está codificada (verificado: prefijo = cod_municipio y dígitos 6-7 = cod_distrito en las 2.215 mesas).
// Censo = electores_e (abstencion_e = electores_e − votantes_e en todas las mesas de 2023).

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
import {
  AUDIT_DL_DIR,
  assertRowWidths,
  cleanCode,
  coverageOf,
  decodeText,
  downloadWithCache,
  isCeraStation,
  normalizeCodes,
  parseCsv,
  readFileBuffer,
  requireColumns,
  toCount,
  toSigned,
  validateRows,
  verifyExpectedHash,
} from './_shared'

export const ARAGON_SOURCE_ID = 'aragon-opendata'
export const ARAGON_PARSER_VERSION = 'aragon-1.0.0'
const AUTHORITY = 'Gobierno de Aragón — Aragón Open Data'
const LICENCE = 'CC BY 4.0'

const url = (res: number, cod: string) =>
  `https://opendata.aragon.es/GA_OD_Core/download?resource_id=${res}&formato=csv&filters=${encodeURIComponent(JSON.stringify({ cod_elec: cod }).replace(':', ': '))}`

export const ARAGON_CONVOCATORIAS = [
  {
    electionDate: '2023-05-28',
    cod: 'CA2023',
    files: {
      mesas: { res: 380, sha: '34be880e596df3be5e02ea99dfd6ff94147904f06583b6573d34aead20d13e0f', seed: path.join(AUDIT_DL_DIR, 'verify', 'AR_380_2023') },
      votos: { res: 381, sha: '9e25bd81d084a62575e04adb3c496cfe7ce7c0c92dd86f6b28da16cf866cad12', seed: path.join(AUDIT_DL_DIR, 'verify', 'AR_381_2023') },
    },
  },
  {
    electionDate: '2019-05-26',
    cod: 'CA2019',
    files: {
      mesas: { res: 380, sha: 'bc55702f7ac608d637d39c41ef61be0fbb96de56cce4e369afb18ce93cb533d4', seed: path.join(AUDIT_DL_DIR, 'verify', 'AR_380_2019') },
      votos: { res: 381, sha: 'cbd3d44f4d702d772cd93d483c768a012dc1dc094c0f32423160b79fbeda53e8', seed: path.join(AUDIT_DL_DIR, 'verify', 'AR_381_2019') },
    },
  },
] as const

const fileName = (cod: string, res: number) => `aragon_${cod}_resource${res}.csv`

const MESA_COLS = ['cod_elec', 'cod_mesa', 'cod_municipio', 'cod_distrito', 'votantes_e', 'abstencion_e', 'nulos_e', 'blancos_e', 'candidatura_e', 'electores_e', 'validos_e', 'municipio', 'cod_provincia']
const VOTO_COLS = ['cod_elec', 'nombre_par', 'cod_mesa', 'cod_municipio', 'cod_distrito', 'cod_par', 'votos_e']

/** '5012401001U' (2023) o '5012401001 U' (2019) → municipio 50124, distrito 01, sección 001, mesa U. */
export function splitAragonMesa(codMesa: string): { mun: string; district: string; section: string; table: string } | null {
  const m = cleanCode(codMesa).match(/^(\d{5})(\d{2})(\d{3}) ?([A-Z0-9]+)$/)
  return m ? { mun: m[1], district: m[2], section: m[3], table: m[4] } : null
}

export interface AragonParseResult {
  rows: PollingStationRow[]
  candidacies: Candidacy[]
}

export function parseAragon(mesasText: string, votosText: string, cod: string, electionDate: string): AragonParseResult {
  const m = parseCsv(mesasText, ',')
  const v = parseCsv(votosText, ',')
  if (m.length < 2 || v.length < 2) throw new Error('Aragón: fichero vacío o truncado')
  const mi = requireColumns(m[0], MESA_COLS, 'resource 380')
  const vi = requireColumns(v[0], VOTO_COLS, 'resource 381')
  assertRowWidths(m.slice(1), m[0].length, 'resource 380')
  assertRowWidths(v.slice(1), v[0].length, 'resource 381')

  const rows = new Map<string, PollingStationRow>()
  for (const [n, r] of m.slice(1).entries()) {
    const w = `resource 380 línea ${n + 2}`
    if (cleanCode(r[mi['cod_elec']]) !== cod) throw new Error(`${w}: cod_elec '${r[mi['cod_elec']]}' ≠ ${cod}`)
    const s = splitAragonMesa(r[mi['cod_mesa']])
    if (!s) throw new Error(`${w}: cod_mesa no válido '${r[mi['cod_mesa']]}'`)
    if (s.mun !== cleanCode(r[mi['cod_municipio']]).padStart(5, '0') || Number(s.district) !== Number(r[mi['cod_distrito']]))
      throw new Error(`${w}: cod_mesa ${r[mi['cod_mesa']]} no concuerda con cod_municipio/cod_distrito`)
    const k = `${s.mun}|${s.district}|${s.section}|${s.table}`
    if (rows.has(k)) throw new Error(`${w}: mesa duplicada ${k}`)
    const row: PollingStationRow = {
      electionType: 'autonomic',
      electionDate,
      provinceCode: s.mun.slice(0, 2),
      municipalityCode: s.mun,
      districtCode: s.district,
      sectionCode: s.section,
      table: s.table,
      census: toCount(r[mi['electores_e']], w + ' electores_e'),
      voters: toCount(r[mi['votantes_e']], w + ' votantes_e'),
      abstentions: toSigned(r[mi['abstencion_e']], w + ' abstencion_e'),
      validVotes: toCount(r[mi['validos_e']], w + ' validos_e'),
      blankVotes: toCount(r[mi['blancos_e']], w + ' blancos_e'),
      nullVotes: toCount(r[mi['nulos_e']], w + ' nulos_e'),
      candidacyVotes: toCount(r[mi['candidatura_e']], w + ' candidatura_e'),
      votes: {},
      special: null,
      municipalityName: (r[mi['municipio']] ?? '').trim() || null,
    }
    if (isCeraStation(row.municipalityCode, row.districtCode, row.municipalityName)) row.special = 'CERA'
    rows.set(k, row)
  }

  const cands = new Map<string, Candidacy>()
  for (const [n, r] of v.slice(1).entries()) {
    const w = `resource 381 línea ${n + 2}`
    if (cleanCode(r[vi['cod_elec']]) !== cod) throw new Error(`${w}: cod_elec '${r[vi['cod_elec']]}' ≠ ${cod}`)
    const s = splitAragonMesa(r[vi['cod_mesa']])
    if (!s) throw new Error(`${w}: cod_mesa no válido '${r[vi['cod_mesa']]}'`)
    const row = rows.get(`${s.mun}|${s.district}|${s.section}|${s.table}`)
    if (!row) throw new Error(`${w}: votos de una mesa ausente del recurso 380 (${r[vi['cod_mesa']]})`)
    const id = cleanCode(r[vi['cod_par']])
    const votes = toCount(r[vi['votos_e']], w + ' votos_e')
    if (!id || votes === null) throw new Error(`${w}: cod_par o votos_e vacíos`)
    if (id in row.votes) throw new Error(`${w}: candidatura ${id} repetida en la mesa ${r[vi['cod_mesa']]}`)
    row.votes[id] = votes
    if (!cands.has(id)) {
      const name = (r[vi['nombre_par']] ?? '').trim()
      cands.set(id, { id, acronym: name, name, type: 'unknown', sourceCode: id, aggregationCode: null, color: null })
    }
  }
  return { rows: [...rows.values()], candidacies: [...cands.values()] }
}

function convOf(f: DownloadedFile | SourceDescriptor) {
  const name = 'descriptor' in f ? f.descriptor.fileName : f.fileName
  const c = ARAGON_CONVOCATORIAS.find((x) => name === fileName(x.cod, 380) || name === fileName(x.cod, 381))
  if (!c) throw new Error(`Aragón: fichero no reconocido ${name}`)
  return c
}

function load(files: DownloadedFile[]) {
  const c = convOf(files[0])
  const m = files.find((f) => f.descriptor.fileName === fileName(c.cod, 380))
  const v = files.find((f) => f.descriptor.fileName === fileName(c.cod, 381))
  if (!m || !v) throw new Error('Aragón: faltan los recursos 380 y/o 381')
  return parseAragon(decodeText(readFileBuffer(m), 'utf-8'), decodeText(readFileBuffer(v), 'utf-8'), c.cod, c.electionDate)
}

export const aragonAdapter: OfficialElectionSourceAdapter = {
  sourceId: ARAGON_SOURCE_ID,
  supports(electionType, electionDate, territory) {
    if (territory && territory !== '02') return false
    return electionType === 'autonomic' && ARAGON_CONVOCATORIAS.some((c) => c.electionDate === electionDate)
  },
  async discover(electionType, electionDate) {
    const c = ARAGON_CONVOCATORIAS.find((x) => x.electionDate === electionDate)
    if (electionType !== 'autonomic' || !c) return []
    const base = { sourceId: ARAGON_SOURCE_ID, electionType, electionDate, territoryCode: '02', format: 'csv', licence: LICENCE, authority: AUTHORITY, definitive: true }
    return (['mesas', 'votos'] as const).map((k) => ({ ...base, url: url(c.files[k].res, c.cod), fileName: fileName(c.cod, c.files[k].res), expectedSha256: c.files[k].sha }))
  },
  async download(descriptor, ctx: AdapterContext) {
    const c = convOf(descriptor)
    const k = descriptor.fileName.endsWith('380.csv') ? 'mesas' : 'votos'
    return downloadWithCache(descriptor, ctx, { seedPaths: [c.files[k].seed] })
  },
  verifyHash: verifyExpectedHash,
  async inspectSchema(files) {
    const parts: SchemaReport['parts'] = []
    const missing: string[] = []
    for (const f of files) {
      const t = decodeText(readFileBuffer(f), 'utf-8')
      const header = t.slice(0, t.indexOf('\n')).replace(/\r$/, '').split(',')
      parts.push({ name: f.descriptor.fileName, columns: header, rows: t.split('\n').filter((l) => l.trim()).length - 1 })
      for (const c of f.descriptor.fileName.endsWith('380.csv') ? MESA_COLS : VOTO_COLS) if (!header.includes(c)) missing.push(`${f.descriptor.fileName}: ${c}`)
    }
    return { ok: missing.length === 0, parts, missing, notes: ['Sección derivada de cod_mesa (5+2+3+mesa), contrastada con cod_municipio y cod_distrito.'] }
  },
  async parsePollingStations(files) {
    return load(files).rows
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
    return coverageOf(rows, 'autonomic', rows[0]?.electionDate ?? '', '02')
  },
  getMetadata(): AdapterMetadata {
    return {
      sourceId: ARAGON_SOURCE_ID,
      authority: AUTHORITY,
      territoryCode: '02',
      level: 'polling_station',
      licence: LICENCE,
      portal: 'https://opendata.aragon.es/',
      parserVersion: ARAGON_PARSER_VERSION,
      notes: 'Cortes de Aragón 2023 y 2019 por mesa (recursos 380 + 381). Sección codificada en cod_mesa. Siglas = nombre_par (la fuente no publica siglas).',
    }
  },
}
