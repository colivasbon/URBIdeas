// Comunidad Foral de Navarra — Gobierno de Navarra, Open Data (CKAN datosabiertos.navarra.es).
// Dataset «Resultados de las elecciones al Parlamento de Navarra agrupados por mesas electorales» (CC BY 4.0).
//   escrutinio_parlamento_mesas_{2023|2019}.csv  UTF-8, ','
//   Codcir,Codmun,Municipio,Mesa,Censo,Certif_Alta,Certif_Correc,Censo_Total,Votos_Electores,
//   Votos_Interventores,Votos_Totales,Votos_Nulos,Votos_Blancos,<una columna por candidatura>
//   (2019: mismos campos con espacios: 'Censo Total', 'Votos Totales'…)
//   Mesa = 'distrito-sección-mesa' ('1-001-U'; 2019 '1-001 -U').
//   Codmun 990 'Residentes ausentes-Navarra', Mesa '99-00n-U' = C.E.R.A.
// Censo = Censo_Total (censo + certificaciones de alta y corrección). Votantes = Votos_Totales.
// La fuente no publica válidos ni votos a candidaturas: se derivan por identidad
// (votos a candidaturas = Σ columnas de candidatura; válidos = candidaturas + blancos) y se
// comprueba votantes = válidos + nulos.
// Referencia municipal: escrutinio_parlamento_{año}.csv (dataset «… agrupados por municipios»).

import type {
  AdapterContext,
  AdapterMetadata,
  DownloadedFile,
  OfficialElectionSourceAdapter,
  PollingStationRow,
  SchemaReport,
  SourceDescriptor,
} from '../../adapter'
import type { Candidacy, MunicipalTotals } from '../../../../src/lib/socideas-secciones-political'
import path from 'node:path'
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
  validateRows,
  verifyExpectedHash,
} from './_shared'

export const NAVARRA_SOURCE_ID = 'navarra-datosabiertos'
export const NAVARRA_PARSER_VERSION = 'navarra-1.0.0'
const AUTHORITY = 'Gobierno de Navarra — Open Data Navarra'
const LICENCE = 'CC BY 4.0'
const DS_MESAS = 'https://datosabiertos.navarra.es/dataset/be88dde7-330c-4b86-aa5c-480514608cbd/resource/'
const DS_MUN = 'https://datosabiertos.navarra.es/dataset/fa95fdf0-4aa1-4194-84b3-2779c9bc8e5e/resource/'

interface Conv {
  electionDate: string
  mesas: { url: string; file: string; sha: string | null; seed?: string }
  municipios: { url: string; file: string }
}

export const NAVARRA_CONVOCATORIAS: Conv[] = [
  {
    electionDate: '2023-05-28',
    mesas: {
      url: DS_MESAS + '56b7ce53-4881-475a-8c79-82da43cb01ed/download/escrutinio_parlamento_mesas_2023.csv',
      file: 'escrutinio_parlamento_mesas_2023.csv',
      sha: 'e2ac72bdb83f0fb9b026bf5bf44f9060f1be27921d3e5e6a641f524e33dd6fa2',
      seed: path.join(AUDIT_DL_DIR, 'raw_nav_2023.bin'),
    },
    municipios: { url: DS_MUN + 'f555f0ff-a6f1-420b-bd25-caf979f26d86/download/escrutinio_parlamento_2023.csv', file: 'escrutinio_parlamento_2023.csv' },
  },
  {
    electionDate: '2019-05-26',
    mesas: {
      url: DS_MESAS + '2b4845fd-1c75-4aaf-b87c-5b4a2fc0b126/download/escrutinio_parlamento_mesas_2019.csv',
      file: 'escrutinio_parlamento_mesas_2019.csv',
      sha: '0d53310ab13ac959a6f33c73a8f8898707f306b3ddb4e02f54cae59728b4c107',
      seed: path.join(AUDIT_DL_DIR, 'raw_nav_2019.bin'),
    },
    municipios: { url: DS_MUN + '9fc75e6f-9b57-450c-82ac-a04143f25ebc/download/escrutinio_parlamento_2019.csv', file: 'escrutinio_parlamento_2019.csv' },
  },
]

/** 'Censo Total' y 'Censo_Total' son la misma columna. */
function canon(h: string): string {
  return h.trim().replace(/\s+/g, '_')
}

const FIXED = ['Codcir', 'Codmun', 'Municipio', 'Mesa', 'Censo', 'Certif_Alta', 'Certif_Correc', 'Censo_Total', 'Votos_Electores', 'Votos_Interventores', 'Votos_Totales', 'Votos_Nulos', 'Votos_Blancos']

export function splitNavarraMesa(v: string): { district: string; section: string; table: string } | null {
  const m = v.replace(/\s+/g, '').match(/^(\d{1,2})-(\d{1,3})-([A-Z0-9]+)$/)
  return m ? { district: m[1], section: m[2], table: m[3] } : null
}

export interface NavarraParseResult {
  rows: PollingStationRow[]
  candidacies: Candidacy[]
  /** Filas 'Total' agregadas descartadas (no son mesas). */
  totalRows: number
}

export function parseNavarraMesasCsv(text: string, electionDate: string, where = 'escrutinio_parlamento_mesas.csv'): NavarraParseResult {
  const all = parseCsv(text, ',')
  if (all.length < 2) throw new Error(`${where}: fichero vacío o truncado`)
  const header = all[0].map(canon)
  const ix = requireColumns(header, FIXED, where)
  const first = ix['Votos_Blancos'] + 1
  const parties = all[0].slice(first).map((h) => h.trim())
  if (!parties.length) throw new Error(`${where}: sin columnas de candidatura`)
  if (new Set(parties).size !== parties.length) throw new Error(`${where}: candidaturas repetidas en la cabecera`)
  const data = all.slice(1)
  assertRowWidths(data, header.length, where)
  const rows: PollingStationRow[] = []
  let totalRows = 0
  for (const [n, r] of data.entries()) {
    const w = `${where} línea ${n + 2}`
    const prov = cleanCode(r[ix['Codcir']])
    // 2019 cierra con una fila 'Total' de Navarra: agregado, no es una mesa.
    if (prov === 'Total' && !cleanCode(r[ix['Codmun']]) && !cleanCode(r[ix['Mesa']])) {
      totalRows++
      continue
    }
    if (prov !== '31') throw new Error(`${w}: Codcir '${prov}' no es Navarra (31)`)
    const mun3 = cleanCode(r[ix['Codmun']])
    if (!/^\d{1,3}$/.test(mun3)) throw new Error(`${w}: Codmun no válido '${mun3}'`)
    const mesa = splitNavarraMesa(r[ix['Mesa']] ?? '')
    if (!mesa) throw new Error(`${w}: Mesa no sigue 'distrito-sección-mesa': '${r[ix['Mesa']]}'`)
    const votes: Record<string, number> = {}
    parties.forEach((p, j) => {
      const v = toCount(r[first + j], `${w} ${p}`)
      if (v !== null) votes[p] = v
    })
    const blank = toCount(r[ix['Votos_Blancos']], w + ' Votos_Blancos')
    const cand = Object.values(votes).reduce((a, b) => a + b, 0)
    const municipalityCode = '31' + mun3.padStart(3, '0')
    const row: PollingStationRow = {
      electionType: 'autonomic',
      electionDate,
      provinceCode: '31',
      municipalityCode,
      districtCode: mesa.district,
      sectionCode: mesa.section,
      table: mesa.table,
      census: toCount(r[ix['Censo_Total']], w + ' Censo_Total'),
      voters: toCount(r[ix['Votos_Totales']], w + ' Votos_Totales'),
      abstentions: null,
      validVotes: blank === null ? null : cand + blank,
      blankVotes: blank,
      nullVotes: toCount(r[ix['Votos_Nulos']], w + ' Votos_Nulos'),
      candidacyVotes: cand,
      votes,
      special: null,
      municipalityName: (r[ix['Municipio']] ?? '').trim() || null,
    }
    if (isCeraStation(municipalityCode, mesa.district, row.municipalityName)) row.special = 'CERA'
    rows.push(row)
  }
  const candidacies: Candidacy[] = parties.map((p) => ({ id: p, acronym: p.replace(/_/g, ' '), name: p, type: 'unknown', sourceCode: p, aggregationCode: null, color: null }))
  return { rows, candidacies, totalRows }
}

/** escrutinio_parlamento_{año}.csv (por municipio) → totales oficiales. */
export function parseNavarraMunicipiosCsv(text: string, where = 'escrutinio_parlamento.csv'): Map<string, MunicipalTotals> {
  const all = parseCsv(text, ',')
  const header = all[0].map(canon)
  const ix = requireColumns(header, ['Codcir', 'Codmun', 'Censo_Total', 'Votos_Totales', 'Votos_Nulos', 'Votos_Blancos'], where)
  const known = ['Codcir', 'Codmun', 'Municipio', 'Censo', 'Certif_Alta', 'Certif_Correc', 'Censo_Total', 'Votos_Electores', 'Votos_Interventores', 'Votos_Totales', 'Votos_Nulos', 'Votos_Blancos', 'Abstención', 'Votos_Validos', 'Votos_Candidaturas']
  const first = Math.max(...known.map((k) => header.indexOf(k))) + 1
  const iValid = header.indexOf('Votos_Validos')
  const iCand = header.indexOf('Votos_Candidaturas')
  const out = new Map<string, MunicipalTotals>()
  for (const r of all.slice(1)) {
    const codmun = cleanCode(r[ix['Codmun']])
    if (cleanCode(r[ix['Codcir']]) !== '31' || !/^\d{1,3}$/.test(codmun)) continue
    let sum = 0
    for (let j = first; j < header.length; j++) sum += toCount(r[j], where) ?? 0
    const blank = toCount(r[ix['Votos_Blancos']], where)
    const cand = iCand >= 0 ? toCount(r[iCand], where) : sum
    out.set('31' + codmun.padStart(3, '0'), {
      census: toCount(r[ix['Censo_Total']], where),
      voters: toCount(r[ix['Votos_Totales']], where),
      validVotes: iValid >= 0 ? toCount(r[iValid], where) : blank === null || cand === null ? null : cand + blank,
      blankVotes: blank,
      nullVotes: toCount(r[ix['Votos_Nulos']], where),
      candidacyVotes: cand,
      votes: {},
    })
  }
  return out
}

function convOf(f: DownloadedFile | SourceDescriptor): Conv {
  const name = 'descriptor' in f ? f.descriptor.fileName : f.fileName
  const c = NAVARRA_CONVOCATORIAS.find((x) => x.mesas.file === name || x.municipios.file === name)
  if (!c) throw new Error(`Navarra: fichero no reconocido ${name}`)
  return c
}
const isMesas = (f: DownloadedFile) => /_mesas_/.test(f.descriptor.fileName)

export const navarraAdapter: OfficialElectionSourceAdapter = {
  sourceId: NAVARRA_SOURCE_ID,
  supports(electionType, electionDate, territory) {
    if (territory && territory !== '15') return false
    return electionType === 'autonomic' && NAVARRA_CONVOCATORIAS.some((c) => c.electionDate === electionDate)
  },
  async discover(electionType, electionDate) {
    const c = NAVARRA_CONVOCATORIAS.find((x) => x.electionDate === electionDate)
    if (electionType !== 'autonomic' || !c) return []
    const base = { sourceId: NAVARRA_SOURCE_ID, electionType, electionDate, territoryCode: '15', format: 'csv', licence: LICENCE, authority: AUTHORITY, definitive: true }
    return [
      { ...base, url: c.mesas.url, fileName: c.mesas.file, expectedSha256: c.mesas.sha },
      { ...base, url: c.municipios.url, fileName: c.municipios.file, expectedSha256: null },
    ]
  },
  async download(descriptor, ctx: AdapterContext) {
    const c = convOf(descriptor)
    return downloadWithCache(descriptor, ctx, { seedPaths: c.mesas.file === descriptor.fileName && c.mesas.seed ? [c.mesas.seed] : [] })
  },
  verifyHash: verifyExpectedHash,
  async inspectSchema(files) {
    const parts: SchemaReport['parts'] = []
    const missing: string[] = []
    for (const f of files) {
      const all = parseCsv(decodeText(readFileBuffer(f), 'utf-8'), ',')
      parts.push({ name: f.descriptor.fileName, columns: all[0], rows: all.length - 1 })
      const h = all[0].map(canon)
      for (const c of isMesas(f) ? FIXED : ['Codcir', 'Codmun', 'Censo_Total', 'Votos_Totales', 'Votos_Nulos', 'Votos_Blancos']) if (!h.includes(c)) missing.push(`${f.descriptor.fileName}: ${c}`)
    }
    return { ok: missing.length === 0, parts, missing, notes: ['Válidos y votos a candidaturas derivados por identidad (la fuente no los publica).'] }
  },
  async parsePollingStations(files) {
    return files.filter(isMesas).flatMap((f) => parseNavarraMesasCsv(decodeText(readFileBuffer(f), 'utf-8'), convOf(f).electionDate, f.descriptor.fileName).rows)
  },
  normalizeTerritorialCodes: normalizeCodes,
  async normalizeCandidacies(files) {
    return files.filter(isMesas).flatMap((f) => parseNavarraMesasCsv(decodeText(readFileBuffer(f), 'utf-8'), convOf(f).electionDate, f.descriptor.fileName).candidacies)
  },
  validateSourceRows(rows) {
    const r = validateRows(rows)
    return { ok: r.ok, rows: r.rows, errors: r.errors, warnings: r.warnings }
  },
  getCoverage(rows) {
    return coverageOf(rows, 'autonomic', rows[0]?.electionDate ?? '', '15')
  },
  getMetadata(): AdapterMetadata {
    return {
      sourceId: NAVARRA_SOURCE_ID,
      authority: AUTHORITY,
      territoryCode: '15',
      level: 'polling_station',
      licence: LICENCE,
      portal: 'https://datosabiertos.navarra.es/dataset/resultados-de-las-elecciones-al-parlamento-de-navarra-agrupados-por-mesas-electorales',
      parserVersion: NAVARRA_PARSER_VERSION,
      notes: 'Parlamento de Navarra 2023 y 2019 por mesa. Distrito/sección/mesa codificados en Mesa. Válidos derivados (candidaturas + blancos).',
    }
  },
  async municipalReference(files) {
    const out = new Map<string, MunicipalTotals>()
    for (const f of files.filter((x) => !isMesas(x))) for (const [k, v] of parseNavarraMunicipiosCsv(decodeText(readFileBuffer(f), 'utf-8'), f.descriptor.fileName)) out.set(k, v)
    return out
  },
}
