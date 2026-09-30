// La Rioja — Gobierno de La Rioja, Instituto de Estadística (IAS), Open Data (ias1.larioja.org/opendata).
// Elecciones al Parlamento de La Rioja, todas las convocatorias en un mismo recurso (CSV cp1252, ';'):
//   cd=374 «Resultados … por mesas electorales» (ancho)   r=Y2Q9Mzc0fGNmPTAz  (base64 'cd=374|cf=03')
//     Anio_Electoral;C.A.;Codigo_Municipio;Municipio;Distrito;Seccion;Mesa;Censo;Votos_Emitidos;
//     Votos_Nulos;Votos_en_blanco;Votos_Validos;Porc_Escrutado;<una columna por candidatura histórica>
//   cd=400 «Detalle de escrutinio por mesa» (largo)       r=Y2Q9NDAwfGNmPTAz  (base64 'cd=400|cf=03')
//     ANIO_ELECTORAL;CODIGO_MUNICIPIO;MUNICIPIO;DISTRITO;SECCION;MESA;IDENTIFICADOR_INTERANUAL;
//     SIGLAS_PARTIDO;DENOMINACION_PARTIDO;VOTOS;PORC_VOTOS
//   (La matriz previa los rotuló 403/370: los identificadores reales del parámetro r son 400 y 374.)
// Totales de mesa del fichero ancho; votos por candidatura del largo (id = IDENTIFICADOR_INTERANUAL).
// Votos a candidaturas = Σ columnas de candidatura del ancho, de modo que la validación
// Σ(largo) = candidaturas(ancho) contrasta los dos ficheros oficiales entre sí.

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
  normalizeCodes,
  parseCsv,
  readFileBuffer,
  requireColumns,
  toCount,
  validateRows,
  verifyExpectedHash,
} from './_shared'

export const RIOJA_SOURCE_ID = 'larioja-ias'
export const RIOJA_PARSER_VERSION = 'larioja-1.0.0'
const AUTHORITY = 'Gobierno de La Rioja — Instituto de Estadística de La Rioja'
const LICENCE = 'CC BY 4.0'
const DL = 'https://ias1.larioja.org/opendata/download?r='

export const RIOJA_FILES = {
  wide: { r: 'Y2Q9Mzc0fGNmPTAz', file: 'larioja_cd374_mesas_ancho.csv', sha: '512f7e41a19166c866966579b1928f15e2d2aaf84229ad43fd5133c3a331979c', seed: path.join(AUDIT_DL_DIR, 'rioja370.csv') },
  long: { r: 'Y2Q9NDAwfGNmPTAz', file: 'larioja_cd400_mesas_detalle.csv', sha: '7aab9496af2aaefc4aafcec65509c6f4f9905dcc7645a729ad0a1cb21d9d44a7', seed: path.join(AUDIT_DL_DIR, 'rioja403.csv') },
}

export const RIOJA_DATES: Record<string, string> = { '2023-05-28': '2023', '2019-05-26': '2019' }

const WIDE_COLS = ['Anio_Electoral', 'Codigo_Municipio', 'Municipio', 'Distrito', 'Seccion', 'Mesa', 'Censo', 'Votos_Emitidos', 'Votos_Nulos', 'Votos_en_blanco', 'Votos_Validos', 'Porc_Escrutado']
const LONG_COLS = ['ANIO_ELECTORAL', 'CODIGO_MUNICIPIO', 'DISTRITO', 'SECCION', 'MESA', 'IDENTIFICADOR_INTERANUAL', 'SIGLAS_PARTIDO', 'DENOMINACION_PARTIDO', 'VOTOS']

const key = (mun: string, d: string, s: string, m: string) => `26${cleanCode(mun).padStart(3, '0')}|${cleanCode(d).padStart(2, '0')}|${cleanCode(s).padStart(3, '0')}|${cleanCode(m)}`

export interface RiojaParseResult {
  rows: PollingStationRow[]
  candidacies: Candidacy[]
  notes: string[]
}

export function parseRioja(wideText: string, longText: string, electionDate: string): RiojaParseResult {
  const year = RIOJA_DATES[electionDate]
  if (!year) throw new Error(`La Rioja: convocatoria no soportada ${electionDate}`)
  const wide = parseCsv(wideText, ';')
  const long = parseCsv(longText, ';')
  if (wide.length < 2 || long.length < 2) throw new Error('La Rioja: fichero vacío o truncado')
  const wh = wide[0].map((h) => h.trim())
  const lh = long[0].map((h) => h.trim())
  const wi = requireColumns(wh, WIDE_COLS, RIOJA_FILES.wide.file)
  const li = requireColumns(lh, LONG_COLS, RIOJA_FILES.long.file)
  assertRowWidths(wide.slice(1), wh.length, RIOJA_FILES.wide.file)
  assertRowWidths(long.slice(1), lh.length, RIOJA_FILES.long.file)
  const partyFrom = wi['Porc_Escrutado'] + 1

  const rows = new Map<string, PollingStationRow>()
  for (const [n, r] of wide.slice(1).entries()) {
    if (cleanCode(r[wi['Anio_Electoral']]) !== year) continue
    const w = `${RIOJA_FILES.wide.file} línea ${n + 2}`
    const k = key(r[wi['Codigo_Municipio']], r[wi['Distrito']], r[wi['Seccion']], r[wi['Mesa']])
    if (rows.has(k)) throw new Error(`${w}: mesa duplicada ${k}`)
    let cand = 0
    for (let j = partyFrom; j < wh.length; j++) cand += toCount(r[j], `${w} ${wh[j]}`) ?? 0
    const [mun, d, s, t] = k.split('|')
    rows.set(k, {
      electionType: 'autonomic',
      electionDate,
      provinceCode: '26',
      municipalityCode: mun,
      districtCode: d,
      sectionCode: s,
      table: t,
      census: toCount(r[wi['Censo']], w + ' Censo'),
      voters: toCount(r[wi['Votos_Emitidos']], w + ' Votos_Emitidos'),
      abstentions: null,
      validVotes: toCount(r[wi['Votos_Validos']], w + ' Votos_Validos'),
      blankVotes: toCount(r[wi['Votos_en_blanco']], w + ' Votos_en_blanco'),
      nullVotes: toCount(r[wi['Votos_Nulos']], w + ' Votos_Nulos'),
      candidacyVotes: cand,
      votes: {},
      special: null,
      municipalityName: (r[wi['Municipio']] ?? '').trim() || null,
    })
  }
  if (!rows.size) throw new Error(`${RIOJA_FILES.wide.file}: sin mesas del año ${year}`)

  const cands = new Map<string, Candidacy>()
  const orphan: string[] = []
  for (const [n, r] of long.slice(1).entries()) {
    if (cleanCode(r[li['ANIO_ELECTORAL']]) !== year) continue
    const w = `${RIOJA_FILES.long.file} línea ${n + 2}`
    const k = key(r[li['CODIGO_MUNICIPIO']], r[li['DISTRITO']], r[li['SECCION']], r[li['MESA']])
    const row = rows.get(k)
    if (!row) {
      orphan.push(k)
      continue
    }
    const id = cleanCode(r[li['IDENTIFICADOR_INTERANUAL']])
    if (!id) throw new Error(`${w}: IDENTIFICADOR_INTERANUAL vacío`)
    const v = toCount(r[li['VOTOS']], w + ' VOTOS')
    if (v === null) throw new Error(`${w}: VOTOS vacío`)
    if (id in row.votes) throw new Error(`${w}: candidatura ${id} repetida en ${k}`)
    row.votes[id] = v
    if (!cands.has(id))
      cands.set(id, {
        id,
        acronym: (r[li['SIGLAS_PARTIDO']] ?? '').trim(),
        name: (r[li['DENOMINACION_PARTIDO']] ?? '').trim(),
        type: 'unknown',
        sourceCode: id,
        aggregationCode: null,
        color: null,
      })
  }
  if (orphan.length) throw new Error(`${RIOJA_FILES.long.file}: ${orphan.length} filas de votos sin mesa en el fichero ancho (p. ej. ${orphan.slice(0, 3).join(', ')})`)
  const notes: string[] = []
  const noVotes = [...rows.values()].filter((r) => !Object.keys(r.votes).length).length
  if (noVotes) notes.push(`${noVotes} mesas sin filas en el detalle por candidatura`)
  return { rows: [...rows.values()], candidacies: [...cands.values()], notes }
}

const roleOf = (f: DownloadedFile) => (f.descriptor.fileName === RIOJA_FILES.wide.file ? 'wide' : f.descriptor.fileName === RIOJA_FILES.long.file ? 'long' : null)

function load(files: DownloadedFile[]): { wide: string; long: string } {
  const w = files.find((f) => roleOf(f) === 'wide')
  const l = files.find((f) => roleOf(f) === 'long')
  if (!w || !l) throw new Error('La Rioja: faltan los ficheros cd=374 (ancho) y/o cd=400 (detalle)')
  return { wide: decodeText(readFileBuffer(w), 'windows-1252'), long: decodeText(readFileBuffer(l), 'windows-1252') }
}

export const riojaAdapter: OfficialElectionSourceAdapter = {
  sourceId: RIOJA_SOURCE_ID,
  supports(electionType, electionDate, territory) {
    if (territory && territory !== '17') return false
    return electionType === 'autonomic' && electionDate in RIOJA_DATES
  },
  async discover(electionType, electionDate) {
    if (!this.supports(electionType, electionDate)) return []
    const base = { sourceId: RIOJA_SOURCE_ID, electionType, electionDate, territoryCode: '17', format: 'csv', licence: LICENCE, authority: AUTHORITY, definitive: true }
    return (['wide', 'long'] as const).map((k) => ({ ...base, url: DL + RIOJA_FILES[k].r, fileName: RIOJA_FILES[k].file, expectedSha256: RIOJA_FILES[k].sha }))
  },
  async download(descriptor: SourceDescriptor, ctx: AdapterContext) {
    const f = Object.values(RIOJA_FILES).find((x) => x.file === descriptor.fileName)
    return downloadWithCache(descriptor, ctx, { seedPaths: f ? [f.seed] : [], preferCurl: true })
  },
  verifyHash: verifyExpectedHash,
  async inspectSchema(files) {
    const parts: SchemaReport['parts'] = []
    const missing: string[] = []
    for (const f of files) {
      const t = decodeText(readFileBuffer(f), 'windows-1252')
      const header = t.slice(0, t.indexOf('\n')).replace(/\r$/, '').split(';')
      parts.push({ name: f.descriptor.fileName, columns: header, rows: t.split('\n').filter((l) => l.trim()).length - 1 })
      for (const c of roleOf(f) === 'wide' ? WIDE_COLS : LONG_COLS) if (!header.includes(c)) missing.push(`${f.descriptor.fileName}: ${c}`)
    }
    return { ok: missing.length === 0, parts, missing, notes: ['Ambos recursos contienen todas las convocatorias desde 1983; se filtra por año.'] }
  },
  async parsePollingStations(files, ctx) {
    const { wide, long } = load(files)
    const res = parseRioja(wide, long, files[0].descriptor.electionDate)
    for (const n of res.notes) ctx.log(`${RIOJA_SOURCE_ID}: ${n}`)
    return res.rows
  },
  normalizeTerritorialCodes: normalizeCodes,
  async normalizeCandidacies(files) {
    const { wide, long } = load(files)
    return parseRioja(wide, long, files[0].descriptor.electionDate).candidacies
  },
  validateSourceRows(rows) {
    const r = validateRows(rows)
    return { ok: r.ok, rows: r.rows, errors: r.errors, warnings: r.warnings }
  },
  getCoverage(rows) {
    return coverageOf(rows, 'autonomic', rows[0]?.electionDate ?? '', '17')
  },
  getMetadata(): AdapterMetadata {
    return {
      sourceId: RIOJA_SOURCE_ID,
      authority: AUTHORITY,
      territoryCode: '17',
      level: 'polling_station',
      licence: LICENCE,
      portal: 'https://ias1.larioja.org/opendata/',
      parserVersion: RIOJA_PARSER_VERSION,
      notes: 'Parlamento de La Rioja 2023 y 2019 por mesa: totales del recurso cd=374 y votos por candidatura del cd=400 (id = IDENTIFICADOR_INTERANUAL). Sin C.E.R.A. en los ficheros.',
    }
  },
}
