// Galicia — Xunta de Galicia, Portal Open Data (abertos.xunta.gal). Eleccións ao Parlamento de Galicia.
//   2024-02-18  dataset 0656 'eleccions-parlamento-galicia-resultados-2024'
//   2020-07-12  dataset 0426 'eleccions-parlamento-galicia-resultados-2020'
//   …/{nnn}/descarga-directa-ficheiro.csv  con nnn 003 A Coruña · 007 Lugo · 011 Ourense · 015 Pontevedra
//   («resultados por mesas»; los impares restantes son «por concellos»).
// CSV ';'. Codificación: 2024 cp1252; 2020 CP850 (DOS) — se detecta por la cabecera.
//   2024: Cód Cir;Cód Con;Concello;Mesa;Censo;Certif Alta;Censo Total;Votos Totais;Votos nulos;Votos brancos;
//         Abstención;Votos Válidos;Votos Candidaturas;<candidaturas>
//   2020: Cód. Cir.;Cód. Con.;Concello;Mesa;Censo;Certif. Alta;Certif. Correc.;Censo Total;Votos electores;
//         Votos interventores;Votos Totais;Votos nulos;Votos brancos;<candidaturas>
//   Mesa = 'distrito-sección-mesa' ('01-001-A'; 2020 '1-001 -A'). Cód Con 990 'Residentes ausentes' = C.E.R.A.
//   Última fila 'Total' (agregado provincial) → se descarta. 2020 usa '.' de miles en cifras grandes.
// 2020 no publica válidos ni votos a candidaturas: se derivan por identidad (Σ candidaturas; + blancos).

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
import path from 'node:path'
import {
  AUDIT_DL_DIR,
  cleanCode,
  coverageOf,
  decodeText,
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

export const XUNTA_SOURCE_ID = 'xunta-abertos'
export const XUNTA_PARSER_VERSION = 'xunta-1.0.0'
const AUTHORITY = 'Xunta de Galicia — Portal de datos abertos (Parlamento de Galicia)'
const LICENCE = 'No declarada en la distribución; portal institucional abierto (abertos.xunta.gal)'
const BASE = 'https://abertos.xunta.gal/catalogo/administracion-publica/-/dataset/'

const PROVINCES = [
  { code: '15', name: 'A Coruña', res: '003' },
  { code: '27', name: 'Lugo', res: '007' },
  { code: '32', name: 'Ourense', res: '011' },
  { code: '36', name: 'Pontevedra', res: '015' },
] as const

export const XUNTA_CONVOCATORIAS = [
  { electionDate: '2024-02-18', dataset: '0656/eleccions-parlamento-galicia-resultados-2024', year: '2024', shas: {} as Record<string, string>, seeds: {} as Record<string, string> },
  {
    electionDate: '2020-07-12',
    dataset: '0426/eleccions-parlamento-galicia-resultados-2020',
    year: '2020',
    shas: {
      '15': '39d090b70d0df408f41fef97b9c86311fe12b4cc9220064004ce6e9889206684',
      '36': '8ffb7d132fdd1d3d221389a6aa40664e77665ba4212b977fde0f1b0fd4ccd269',
    } as Record<string, string>,
    seeds: { '15': path.join(AUDIT_DL_DIR, 'gal_coruna_mesas_2020.csv'), '36': path.join(AUDIT_DL_DIR, 'gal_pontevedra_mesas_2020.csv') } as Record<string, string>,
  },
]

const fileName = (year: string, prov: string) => `xunta_parlamento_${year}_mesas_${prov}.csv`

/** Detecta cp1252 vs CP850 por la cabecera ('Cód' / 'C¢d'). */
export function decodeXunta(buf: Buffer): string {
  const w = decodeText(buf, 'windows-1252')
  const head = w.slice(0, 200)
  if (/C¢d/.test(head)) return decodeText(buf, 'cp850')
  return w
}

/** Recuento con '.' de miles ('160.101'). */
function count(v: string | undefined, where: string): number | null {
  const s = (v ?? '').trim()
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''))
  return toCount(s, where)
}

function canon(h: string): string {
  return h.normalize('NFC').replace(/\./g, '').replace(/\s+/g, ' ').trim()
}

const KNOWN = ['Cód Cir', 'Cód Con', 'Concello', 'Mesa', 'Censo', 'Certif Alta', 'Certif Correc', 'Censo Total', 'Votos electores', 'Votos interventores', 'Votos Totais', 'Votos nulos', 'Votos brancos', 'Abstención', 'Votos Válidos', 'Votos Candidaturas']
const REQUIRED = ['Cód Cir', 'Cód Con', 'Concello', 'Mesa', 'Censo Total', 'Votos Totais', 'Votos nulos', 'Votos brancos']

export function splitXuntaMesa(v: string): { district: string; section: string; table: string } | null {
  const m = v.replace(/\s+/g, '').match(/^(\d{1,2})-(\d{1,3})-([A-Z0-9]+)$/)
  return m ? { district: m[1], section: m[2], table: m[3] } : null
}

export interface XuntaParseResult {
  rows: PollingStationRow[]
  candidacies: Candidacy[]
  notes: string[]
}

export function parseXuntaMesasCsv(text: string, electionDate: string, where = 'mesas.csv'): XuntaParseResult {
  const all = parseCsv(text, ';')
  if (all.length < 2) throw new Error(`${where}: fichero vacío o truncado`)
  const header = all[0].map(canon)
  const missing = REQUIRED.filter((c) => !header.includes(c))
  if (missing.length) throw new Error(`${where}: columnas ausentes: ${missing.join(', ')}`)
  const ix = (c: string) => header.indexOf(c)
  const first = Math.max(...KNOWN.map((k) => header.indexOf(k))) + 1
  const parties = all[0].slice(first).map((h) => h.trim())
  if (!parties.length || parties.some((p) => !p)) throw new Error(`${where}: columnas de candidatura vacías o ausentes`)
  const rows: PollingStationRow[] = []
  const notes: string[] = []
  let derived = 0
  for (const [n, r] of all.slice(1).entries()) {
    const w = `${where} línea ${n + 2}`
    if (r.length !== header.length) throw new Error(`${w}: ${r.length} campos (cabecera ${header.length}); fichero truncado o mal formado`)
    const prov = cleanCode(r[ix('Cód Cir')])
    if (prov === 'Total') {
      notes.push(`fila 'Total' descartada (${w})`)
      continue
    }
    if (!/^(15|27|32|36)$/.test(prov)) throw new Error(`${w}: Cód Cir '${prov}' no es una provincia gallega`)
    const mun3 = cleanCode(r[ix('Cód Con')])
    if (!/^\d{1,3}$/.test(mun3)) throw new Error(`${w}: Cód Con no válido '${mun3}'`)
    const mesa = splitXuntaMesa(r[ix('Mesa')] ?? '')
    if (!mesa) throw new Error(`${w}: Mesa no sigue 'distrito-sección-mesa': '${r[ix('Mesa')]}'`)
    const votes: Record<string, number> = {}
    parties.forEach((p, j) => {
      const v = count(r[first + j], `${w} ${p}`)
      if (v !== null) votes[p] = v
    })
    const blank = count(r[ix('Votos brancos')], w + ' Votos brancos')
    const sum = Object.values(votes).reduce((a, b) => a + b, 0)
    const hasCand = ix('Votos Candidaturas') >= 0
    const hasValid = ix('Votos Válidos') >= 0
    if (!hasCand || !hasValid) derived++
    const cand = hasCand ? count(r[ix('Votos Candidaturas')], w + ' Votos Candidaturas') : sum
    const valid = hasValid ? count(r[ix('Votos Válidos')], w + ' Votos Válidos') : blank === null || cand === null ? null : cand + blank
    const municipalityCode = prov + mun3.padStart(3, '0')
    const row: PollingStationRow = {
      electionType: 'autonomic',
      electionDate,
      provinceCode: prov,
      municipalityCode,
      districtCode: mesa.district,
      sectionCode: mesa.section,
      table: mesa.table,
      census: count(r[ix('Censo Total')], w + ' Censo Total'),
      voters: count(r[ix('Votos Totais')], w + ' Votos Totais'),
      abstentions: ix('Abstención') >= 0 ? toSigned((r[ix('Abstención')] ?? '').replace(/\./g, ''), w + ' Abstención') : null,
      validVotes: valid,
      blankVotes: blank,
      nullVotes: count(r[ix('Votos nulos')], w + ' Votos nulos'),
      candidacyVotes: cand,
      votes,
      special: null,
      municipalityName: (r[ix('Concello')] ?? '').trim() || null,
    }
    if (isCeraStation(municipalityCode, mesa.district, row.municipalityName)) row.special = 'CERA'
    rows.push(row)
  }
  if (derived) notes.push(`válidos/votos a candidaturas derivados por identidad en ${derived} mesas (la fuente no los publica)`)
  const candidacies = parties.map((p) => ({ id: p, acronym: p, name: p, type: 'unknown' as const, sourceCode: p, aggregationCode: null, color: null }))
  return { rows, candidacies, notes }
}

function convOf(f: DownloadedFile | SourceDescriptor) {
  const name = 'descriptor' in f ? f.descriptor.fileName : f.fileName
  const c = XUNTA_CONVOCATORIAS.find((x) => PROVINCES.some((p) => fileName(x.year, p.code) === name))
  if (!c) throw new Error(`Xunta: fichero no reconocido ${name}`)
  return c
}

const parseFile = (f: DownloadedFile) => parseXuntaMesasCsv(decodeXunta(readFileBuffer(f)), convOf(f).electionDate, f.descriptor.fileName)

export const xuntaAdapter: OfficialElectionSourceAdapter = {
  sourceId: XUNTA_SOURCE_ID,
  supports(electionType, electionDate, territory) {
    if (territory && territory !== '12') return false
    return electionType === 'autonomic' && XUNTA_CONVOCATORIAS.some((c) => c.electionDate === electionDate)
  },
  async discover(electionType, electionDate) {
    const c = XUNTA_CONVOCATORIAS.find((x) => x.electionDate === electionDate)
    if (electionType !== 'autonomic' || !c) return []
    return PROVINCES.map((p) => ({
      sourceId: XUNTA_SOURCE_ID,
      electionType: 'autonomic' as const,
      electionDate,
      territoryCode: '12',
      url: `${BASE}${c.dataset}/${p.res}/descarga-directa-ficheiro.csv`,
      fileName: fileName(c.year, p.code),
      expectedSha256: c.shas[p.code] ?? null,
      format: 'csv',
      licence: LICENCE,
      authority: AUTHORITY,
      definitive: true,
    }))
  },
  async download(descriptor, ctx: AdapterContext) {
    const c = convOf(descriptor)
    const prov = descriptor.fileName.match(/_(\d{2})\.csv$/)?.[1] ?? ''
    return downloadWithCache(descriptor, ctx, { seedPaths: c.seeds[prov] ? [c.seeds[prov]] : [] })
  },
  verifyHash: verifyExpectedHash,
  async inspectSchema(files) {
    const parts: SchemaReport['parts'] = []
    const missing: string[] = []
    for (const f of files) {
      const t = decodeXunta(readFileBuffer(f))
      const header = parseCsv(t.slice(0, t.indexOf('\n') + 1), ';')[0] ?? []
      parts.push({ name: f.descriptor.fileName, columns: header, rows: t.split('\n').filter((l) => l.trim()).length - 1 })
      for (const c of REQUIRED) if (!header.map(canon).includes(c)) missing.push(`${f.descriptor.fileName}: ${c}`)
    }
    return { ok: missing.length === 0, parts, missing, notes: ['Un CSV por provincia; codificación detectada por cabecera (2020 CP850).'] }
  },
  async parsePollingStations(files, ctx) {
    const out: PollingStationRow[] = []
    for (const f of files) {
      const res = parseFile(f)
      for (const n of res.notes) ctx.log(`${XUNTA_SOURCE_ID}: ${f.descriptor.fileName}: ${n}`)
      out.push(...res.rows)
    }
    return out
  },
  normalizeTerritorialCodes: normalizeCodes,
  async normalizeCandidacies(files) {
    const out = new Map<string, Candidacy>()
    for (const f of files) for (const c of parseFile(f).candidacies) if (!out.has(c.id)) out.set(c.id, c)
    return [...out.values()]
  },
  validateSourceRows(rows) {
    const r = validateRows(rows)
    return { ok: r.ok, rows: r.rows, errors: r.errors, warnings: r.warnings }
  },
  getCoverage(rows) {
    return coverageOf(rows, 'autonomic', rows[0]?.electionDate ?? '', '12')
  },
  getMetadata(): AdapterMetadata {
    return {
      sourceId: XUNTA_SOURCE_ID,
      authority: AUTHORITY,
      territoryCode: '12',
      level: 'polling_station',
      licence: LICENCE,
      portal: 'https://abertos.xunta.gal/catalogo/administracion-publica/-/dataset/0656/eleccions-parlamento-galicia-resultados-2024',
      parserVersion: XUNTA_PARSER_VERSION,
      notes: 'Parlamento de Galicia 2024 y 2020 por mesa, un CSV por provincia. Siglas como id (la fuente no publica código).',
    }
  },
}
