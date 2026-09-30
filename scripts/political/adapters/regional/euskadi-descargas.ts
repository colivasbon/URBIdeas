// País Vasco — Gobierno Vasco, Departamento de Seguridad, «Descargas de ficheros de resultados de elecciones».
// https://www.euskadi.eus/informacion/descargas-de-ficheros-de-resultados-de-elecciones/web01-a2haukon/es/
// Cada ZIP trae Mes* (MESA), Mun*, Cir* y Ele* en CSV cp1252 con ';'. Los códigos van con tabulador
// inicial entre comillas ("\t051"). Cod Municipio = 3 dígitos INE; la provincia sale de TH.
//
// Convocatorias soportadas:
//   autonomic 2024-04-21  csv/Cas-csv.zip  MesPv24_c.csv  — fila 1 rótulo con siglas en grupos de 3
//                                             (V. Candidaturas, %V. Candidaturas, %V. Válidos), fila 2 cabecera.
//   autonomic 2020-07-12  csv/P20_c.zip    P20_c/MesP20_c.csv — cabecera única, 1 columna de votos por candidatura.
//   congress  2023-07-23  csv/G23_c.zip    CSV CAS/MesGC23_c.csv — como P24.
// No soportadas aquí: M23 (municipales 2023: sólo XLSX con 322 columnas agregadas por rótulo; usar
// Interior) y J23 (Juntas Generales: tipo de elección fuera del contrato).
//
// Celdas: votos de candidatura vacíos = no concurre en ese Territorio Histórico → se omite.
// 'Blancos' vacío con Válidos = Votos Candidaturas → 0 derivado por identidad (se informa).
// euskadi.eus rechaza el TLS de Node fetch: la descarga usa curl.exe.

import path from 'node:path'
import JSZip from 'jszip'

import type {
  AdapterContext,
  AdapterMetadata,
  DownloadedFile,
  OfficialElectionSourceAdapter,
  PollingStationRow,
  SchemaReport,
  SourceDescriptor,
} from '../../adapter'
import type { Candidacy, ElectionType, MunicipalTotals } from '../../../../src/lib/socideas-secciones-political'
import {
  AUDIT_DL_DIR,
  cleanCode,
  coverageOf,
  decodeText,
  deriveBlank,
  downloadWithCache,
  isCeraStation,
  normalizeCodes,
  parseCsv,
  readFileBuffer,
  toCount,
  toSigned,
  validateRows,
  verifyExpectedHash,
} from './_shared'

export const EUSKADI_SOURCE_ID = 'euskadi-descargas'
export const EUSKADI_PARSER_VERSION = 'euskadi-1.0.0'
const BASE = 'https://www.euskadi.eus/contenidos/informacion/w_em_descargas/es_def/adjuntos/csv/'
const AUTHORITY = 'Gobierno Vasco — Departamento de Seguridad, Dirección de Procesos Electorales'
const LICENCE = 'No declarada explícitamente; portal institucional público (euskadi.eus)'

interface Conv {
  key: string
  electionType: ElectionType
  electionDate: string
  file: string
  expectedSha256: string
  mesPattern: RegExp
  munPattern: RegExp
  seed?: string
}

export const EUSKADI_CONVOCATORIAS: Conv[] = [
  {
    key: 'P24',
    electionType: 'autonomic',
    electionDate: '2024-04-21',
    file: 'Cas-csv.zip',
    expectedSha256: '0f7c564bb7296af1c0209d93168bf72c4ebd139c3fb7d67915d61d261ad05dc1',
    mesPattern: /(^|\/)Mes[^/]*\.csv$/i,
    munPattern: /(^|\/)Mun[^/]*\.csv$/i,
    seed: path.join(AUDIT_DL_DIR, 'raw_eus_P24c.bin'),
  },
  {
    key: 'P20',
    electionType: 'autonomic',
    electionDate: '2020-07-12',
    file: 'P20_c.zip',
    expectedSha256: 'e06973b081a979200f997dbf105cf7c923ff04071714a2d82b227af1a6f4cec0',
    mesPattern: /(^|\/)Mes[^/]*\.csv$/i,
    munPattern: /(^|\/)Mun[^/]*\.csv$/i,
  },
  {
    key: 'G23',
    electionType: 'congress',
    electionDate: '2023-07-23',
    file: 'G23_c.zip',
    expectedSha256: '11fb85cd078b37f12622c4ad6f5aa9288ea0f57325f9eab68a32aa8b63e4834f',
    mesPattern: /(^|\/)Mes[^/]*\.csv$/i,
    munPattern: /(^|\/)Mun[^/]*\.csv$/i,
    seed: path.join(AUDIT_DL_DIR, 'verify', 'PV_G23'),
  },
]

function convOf(f: DownloadedFile | SourceDescriptor): Conv {
  const name = 'descriptor' in f ? f.descriptor.fileName : f.fileName
  const c = EUSKADI_CONVOCATORIAS.find((x) => x.file === name)
  if (!c) throw new Error(`Euskadi: fichero no reconocido ${name}`)
  return c
}

export function thToProvince(th: string): string | null {
  const s = th.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (/alava|araba/.test(s)) return '01'
  if (/bizkaia|vizcaya/.test(s)) return '48'
  if (/gipuzkoa|guipuzcoa/.test(s)) return '20'
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser puro
// ─────────────────────────────────────────────────────────────────────────────

const ALIASES = {
  th: ['TH'],
  name: ['Municipio', 'Ámbito'],
  mun: ['Cod Municipio', 'Cód Municipio', 'Cód. Municipio'],
  district: ['Distrito'],
  section: ['Sección'],
  table: ['Mesa'],
  census: ['Censo'],
  voters: ['Votos', 'Votantes', 'Votos (V.)'],
  nulls: ['Nulos'],
  valid: ['Válidos'],
  blank: ['Blancos'],
  cand: ['Votos Candidaturas', 'Votos Candidatura'],
  abst: ['Abstención'],
} as const

type Field = keyof typeof ALIASES

export interface EuskadiLayout {
  headerRow: number
  ix: Record<Field, number>
  /** índice de columna → sigla de la candidatura */
  parties: Array<{ col: number; acronym: string }>
  mode: 'banner_triples' | 'single_columns'
}

export function detectEuskadiLayout(rows: string[][], where: string): EuskadiLayout {
  const headerRow = rows.findIndex((r) => (r[0] ?? '').trim() === 'TH')
  if (headerRow < 0) throw new Error(`${where}: no se encuentra la fila de cabecera (TH)`)
  const header = rows[headerRow].map((h) => h.trim())
  const ix = {} as Record<Field, number>
  const missing: string[] = []
  for (const f of Object.keys(ALIASES) as Field[]) {
    const i = header.findIndex((h) => (ALIASES[f] as readonly string[]).includes(h))
    if (i < 0) missing.push(ALIASES[f].join('|'))
    else ix[f] = i
  }
  if (missing.length) throw new Error(`${where}: columnas ausentes: ${missing.join(', ')}`)
  const first = ix.abst + 1
  const parties: EuskadiLayout['parties'] = []
  const banner = headerRow > 0 ? rows[headerRow - 1].map((h) => h.trim()) : []
  const tripleMode = header.slice(first).some((h) => /^V\. Candidatura/.test(h))
  if (tripleMode) {
    for (let j = first; j < header.length; j++) {
      if (!/^V\. Candidatura/.test(header[j])) continue
      const acr = banner[j] ?? ''
      if (!acr) throw new Error(`${where}: columna ${j + 1} 'V. Candidatura' sin sigla en la fila de rótulo`)
      parties.push({ col: j, acronym: acr })
    }
  } else {
    for (let j = first; j < header.length; j++) if (header[j]) parties.push({ col: j, acronym: header[j] })
  }
  const acrs = parties.map((p) => p.acronym)
  if (new Set(acrs).size !== acrs.length) throw new Error(`${where}: siglas repetidas en la cabecera: ${acrs.filter((a, i) => acrs.indexOf(a) !== i).join(', ')}`)
  if (!parties.length) throw new Error(`${where}: sin columnas de candidatura`)
  return { headerRow, ix, parties, mode: tripleMode ? 'banner_triples' : 'single_columns' }
}

export interface EuskadiParseResult {
  rows: PollingStationRow[]
  candidacies: Candidacy[]
  notes: string[]
}

export function parseEuskadiMesCsv(text: string, electionType: ElectionType, electionDate: string, where = 'Mes.csv'): EuskadiParseResult {
  const all = parseCsv(text, ';')
  const layout = detectEuskadiLayout(all, where)
  const width = all[layout.headerRow].length
  const data = all.slice(layout.headerRow + 1)
  const rows: PollingStationRow[] = []
  let derivedBlank = 0
  for (const [n, r] of data.entries()) {
    const w = `${where} línea ${layout.headerRow + n + 2}`
    if (r.length !== width) throw new Error(`${w}: ${r.length} campos (cabecera ${width}); fichero truncado o mal formado`)
    const th = (r[layout.ix.th] ?? '').trim()
    const prov = thToProvince(th)
    if (!prov) throw new Error(`${w}: Territorio Histórico no reconocido '${th}'`)
    const mun3 = cleanCode(r[layout.ix.mun])
    if (!/^\d{3}$/.test(mun3)) throw new Error(`${w}: Cod Municipio no válido '${r[layout.ix.mun]}'`)
    const votes: Record<string, number> = {}
    for (const p of layout.parties) {
      const v = toCount(r[p.col], `${w} ${p.acronym}`)
      if (v !== null) votes[p.acronym] = v
    }
    const valid = toCount(r[layout.ix.valid], w + ' Válidos')
    const cand = toCount(r[layout.ix.cand], w + ' Votos Candidaturas')
    const blank = deriveBlank(valid, cand, toCount(r[layout.ix.blank], w + ' Blancos'))
    if (blank.derived) derivedBlank++
    const row: PollingStationRow = {
      electionType,
      electionDate,
      provinceCode: prov,
      municipalityCode: prov + mun3,
      districtCode: cleanCode(r[layout.ix.district]),
      sectionCode: cleanCode(r[layout.ix.section]),
      table: cleanCode(r[layout.ix.table]),
      census: toCount(r[layout.ix.census], w + ' Censo'),
      voters: toCount(r[layout.ix.voters], w + ' Votos'),
      abstentions: toSigned(r[layout.ix.abst], w + ' Abstención'),
      validVotes: valid,
      blankVotes: blank.value,
      nullVotes: toCount(r[layout.ix.nulls], w + ' Nulos'),
      candidacyVotes: cand,
      votes,
      special: null,
      municipalityName: (r[layout.ix.name] ?? '').trim() || null,
    }
    if (isCeraStation(row.municipalityCode, row.districtCode, row.municipalityName)) row.special = 'CERA'
    rows.push(row)
  }
  const notes: string[] = [`formato ${layout.mode}, ${layout.parties.length} candidaturas`]
  if (derivedBlank) notes.push(`'Blancos' vacío derivado como válidos − votos a candidaturas en ${derivedBlank} mesas`)
  const candidacies: Candidacy[] = layout.parties.map((p) => ({
    id: p.acronym,
    acronym: p.acronym,
    name: p.acronym,
    type: 'unknown',
    sourceCode: p.acronym,
    aggregationCode: null,
    color: null,
  }))
  return { rows, candidacies, notes }
}

/** Mun*.csv → totales municipales de la misma fuente (conciliación). */
export function parseEuskadiMunCsv(text: string, where = 'Mun.csv'): Map<string, MunicipalTotals> {
  const all = parseCsv(text, ';')
  const headerRow = all.findIndex((r) => (r[0] ?? '').trim() === 'TH')
  if (headerRow < 0) throw new Error(`${where}: sin cabecera TH`)
  const header = all[headerRow].map((h) => h.trim())
  const find = (f: Field) => header.findIndex((h) => (ALIASES[f] as readonly string[]).includes(h))
  const ix = { th: find('th'), mun: find('mun'), census: find('census'), voters: find('voters'), nulls: find('nulls'), valid: find('valid'), blank: find('blank'), cand: find('cand') }
  for (const [k, v] of Object.entries(ix)) if (v < 0) throw new Error(`${where}: columna ausente ${k}`)
  const out = new Map<string, MunicipalTotals>()
  for (const r of all.slice(headerRow + 1)) {
    const prov = thToProvince(r[ix.th] ?? '')
    const mun3 = cleanCode(r[ix.mun])
    if (!prov || !/^\d{3}$/.test(mun3)) continue
    const valid = toCount(r[ix.valid], where)
    const cand = toCount(r[ix.cand], where)
    out.set(prov + mun3, {
      census: toCount(r[ix.census], where),
      voters: toCount(r[ix.voters], where),
      validVotes: valid,
      blankVotes: deriveBlank(valid, cand, toCount(r[ix.blank], where)).value,
      nullVotes: toCount(r[ix.nulls], where),
      candidacyVotes: cand,
      votes: {},
    })
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Adaptador
// ─────────────────────────────────────────────────────────────────────────────

async function innerText(f: DownloadedFile, pattern: RegExp): Promise<[string, string]> {
  const z = await JSZip.loadAsync(readFileBuffer(f))
  const name = Object.keys(z.files).find((n) => !z.files[n].dir && pattern.test(n))
  if (!name) throw new Error(`${f.descriptor.fileName}: falta el fichero interno ${pattern} (contiene ${Object.keys(z.files).join(', ')})`)
  return [name, decodeText(await z.files[name].async('nodebuffer'), 'windows-1252')]
}

export const euskadiAdapter: OfficialElectionSourceAdapter = {
  sourceId: EUSKADI_SOURCE_ID,
  supports(electionType, electionDate, territory) {
    if (territory && territory !== '16') return false
    return EUSKADI_CONVOCATORIAS.some((c) => c.electionType === electionType && c.electionDate === electionDate)
  },
  async discover(electionType, electionDate) {
    return EUSKADI_CONVOCATORIAS.filter((c) => c.electionType === electionType && c.electionDate === electionDate).map((c) => ({
      sourceId: EUSKADI_SOURCE_ID,
      electionType: c.electionType,
      electionDate: c.electionDate,
      territoryCode: '16',
      url: BASE + c.file,
      fileName: c.file,
      expectedSha256: c.expectedSha256,
      format: 'zip(csv cp1252 ;)',
      licence: LICENCE,
      authority: AUTHORITY,
      definitive: true,
    }))
  },
  async download(descriptor, ctx: AdapterContext) {
    const c = convOf(descriptor)
    return downloadWithCache(descriptor, ctx, { seedPaths: c.seed ? [c.seed] : [], preferCurl: true })
  },
  verifyHash: verifyExpectedHash,
  async inspectSchema(files) {
    const parts: SchemaReport['parts'] = []
    const missing: string[] = []
    const notes: string[] = []
    for (const f of files) {
      const c = convOf(f)
      try {
        const [n, t] = await innerText(f, c.mesPattern)
        const all = parseCsv(t, ';')
        const l = detectEuskadiLayout(all, n)
        parts.push({ name: n, columns: all[l.headerRow], rows: all.length - l.headerRow - 1 })
        notes.push(`${n}: ${l.mode}, candidaturas ${l.parties.map((p) => p.acronym).join(', ')}`)
      } catch (e) {
        missing.push((e as Error).message)
      }
    }
    return { ok: missing.length === 0, parts, missing, notes }
  },
  async parsePollingStations(files, ctx) {
    const out: PollingStationRow[] = []
    for (const f of files) {
      const c = convOf(f)
      const [n, t] = await innerText(f, c.mesPattern)
      const res = parseEuskadiMesCsv(t, c.electionType, c.electionDate, n)
      for (const note of res.notes) ctx.log(`${EUSKADI_SOURCE_ID}: ${n}: ${note}`)
      out.push(...res.rows)
    }
    return out
  },
  normalizeTerritorialCodes: normalizeCodes,
  async normalizeCandidacies(files) {
    const out: Candidacy[] = []
    for (const f of files) {
      const c = convOf(f)
      const [n, t] = await innerText(f, c.mesPattern)
      out.push(...parseEuskadiMesCsv(t, c.electionType, c.electionDate, n).candidacies)
    }
    return out
  },
  validateSourceRows(rows) {
    const r = validateRows(rows)
    return { ok: r.ok, rows: r.rows, errors: r.errors, warnings: r.warnings }
  },
  getCoverage(rows) {
    return coverageOf(rows, rows[0]?.electionType ?? 'autonomic', rows[0]?.electionDate ?? '', '16')
  },
  getMetadata(): AdapterMetadata {
    return {
      sourceId: EUSKADI_SOURCE_ID,
      authority: AUTHORITY,
      territoryCode: '16',
      level: 'polling_station',
      licence: LICENCE,
      portal: 'https://www.euskadi.eus/informacion/descargas-de-ficheros-de-resultados-de-elecciones/web01-a2haukon/es/',
      parserVersion: EUSKADI_PARSER_VERSION,
      notes: 'Parlamento Vasco 2024 y 2020 y Congreso 2023 por mesa. Siglas como id (la fuente no publica código). Descarga con curl.exe.',
    }
  },
  async municipalReference(files) {
    const out = new Map<string, MunicipalTotals>()
    for (const f of files) {
      const c = convOf(f)
      const [n, t] = await innerText(f, c.munPattern)
      for (const [k, v] of parseEuskadiMunCsv(t, n)) out.set(k, v)
    }
    return out
  },
}
