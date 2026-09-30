// Comunitat Valenciana — Generalitat Valenciana, Dades obertes (CKAN dadesobertes.gva.es).
//
// Convocatorias:
//   municipal  2023-05-28  ODS 'resultados-elecciones-locales_2023.ods' (3 hojas)
//       Datos_Comunes_Mesas       PROVINCIA COMARCA CÓDIGO MUNICIPIO DISTRITO SECCIÓN MESA VOTANTES
//                                 ABSTENCIONES NULOS VALIDOS BLANCOS CANDIDATURAS CENSO   (1 fila por mesa)
//       Votos_Candidaturas_Mesas  … MESA CANDIDATURA SIGLAS VOTOS                        (1 fila por mesa × candidatura, con ceros)
//       Candidaturas              SIGLAS CANDIDATURA CANDIDATURA_AGRUPACIÓN SIGLAS_AGRUPACIÓN
//     La fila 1 de cada hoja es un rótulo ('ELECCIONES MUNICIPALES 2023'); la 2 es la cabecera.
//     No hay código de candidatura: el id es SIGLAS + ' | ' + CANDIDATURA (las siglas se repiten
//     entre municipios con denominaciones distintas: 'ACORD PER GUANYAR' agrupa >200 listas locales).
//     Municipios < 250 hab. (listas abiertas, art. 184 LOREG): VOTOS es la suma de votos a
//     candidatos y no cuadra con CANDIDATURAS; se conserva tal cual y se informa.
//   autonomic  2023-05-28  CSV 'resultados-elecciones-autonomicas-1-2023.csv' (Les Corts, cp1252, ',')
//       1 fila por mesa × candidatura con CENS VOTANTS V_NULS V_BLANC repetidos y V_CAND = votos
//       de la candidatura; CODI_CANDIDATURA es el código estable.
//   municipal  2019-05-26  CSV 'resultados-elecciones-locales-1-2019.csv' (UTF-8, ';')
//       1 fila por mesa × candidatura con CANDIDATURAS CENSO VOTANTES VALIDOS BLANCOS
//       ABSTENCIONES NULOS repetidos y CANDIDATO_COD (código de candidatura de Interior).

import path from 'node:path'
import XLSX from 'xlsx'

import type {
  AdapterContext,
  AdapterMetadata,
  DownloadedFile,
  OfficialElectionSourceAdapter,
  PollingStationRow,
  SchemaReport,
  SourceDescriptor,
} from '../../adapter'
import type { Candidacy, ElectionType } from '../../../../src/lib/socideas-secciones-political'
import {
  AUDIT_DL_DIR,
  assertRowWidths,
  cleanCode,
  coverageOf,
  decodeText,
  downloadWithCache,
  findFile,
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

export const GVA_SOURCE_ID = 'gva-dadesobertes'
export const GVA_PARSER_VERSION = 'gva-1.0.0'
const AUTHORITY = 'Generalitat Valenciana — Dades obertes (a partir de datos del Ministerio del Interior)'
const LICENCE = 'CC BY 4.0 (Creative Commons Attribution, dadesobertes.gva.es)'

type Role = 'local2023_ods' | 'autonomic2023_csv' | 'local2019_csv'

const DESCRIPTORS: Array<SourceDescriptor & { role: Role; seeds: string[] }> = [
  {
    role: 'local2023_ods',
    sourceId: GVA_SOURCE_ID,
    electionType: 'municipal',
    electionDate: '2023-05-28',
    territoryCode: '10',
    url: 'https://dadesobertes.gva.es/dataset/99285778-0da9-48bb-be19-cde1630b8a45/resource/c05778c0-9ca4-4274-a5bb-fa48c514184d/download/resultados-elecciones-locales_2023.ods',
    fileName: 'resultados-elecciones-locales_2023.ods',
    expectedSha256: '85c75cffe6a02f125a80fe667961cb72272575831ba2f98f4e91c6adb3b0325d',
    format: 'ods',
    licence: LICENCE,
    authority: AUTHORITY,
    definitive: true,
    seeds: [path.join(AUDIT_DL_DIR, 'cv_ods.ods'), path.join('tmp', 'audit', 'gva', 'gva2023.ods')],
  },
  {
    role: 'autonomic2023_csv',
    sourceId: GVA_SOURCE_ID,
    electionType: 'autonomic',
    electionDate: '2023-05-28',
    territoryCode: '10',
    url: 'https://dadesobertes.gva.es/dataset/dfbe99da-62d8-4be9-86bd-4ac965abfe03/resource/60f818a5-9ae2-483a-ad31-f61b8d016513/download/resultados-elecciones-autonomicas-1-2023.csv',
    fileName: 'resultados-elecciones-autonomicas-1-2023.csv',
    expectedSha256: null,
    format: 'csv',
    licence: LICENCE,
    authority: 'Generalitat Valenciana — Dades obertes',
    definitive: true,
    seeds: [],
  },
  {
    role: 'local2019_csv',
    sourceId: GVA_SOURCE_ID,
    electionType: 'municipal',
    electionDate: '2019-05-26',
    territoryCode: '10',
    url: 'https://dadesobertes.gva.es/dataset/808af71e-a732-43b4-96fa-d1a763ce07ed/resource/5a90c175-2f1f-470d-a455-d3cc052bda45/download/resultados-elecciones-locales-1-2019.csv',
    fileName: 'resultados-elecciones-locales-1-2019.csv',
    expectedSha256: null,
    format: 'csv',
    licence: LICENCE,
    authority: AUTHORITY,
    definitive: true,
    seeds: [],
  },
]

const PROVINCES: Record<string, string> = { '03': 'Alicante/Alacant', '12': 'Castellón/Castelló', '46': 'Valencia/València' }

function roleOf(f: DownloadedFile): Role | undefined {
  return DESCRIPTORS.find((d) => d.fileName === f.descriptor.fileName)?.role
}

// ─────────────────────────────────────────────────────────────────────────────
// Municipales 2023 (ODS)
// ─────────────────────────────────────────────────────────────────────────────

export interface GvaOdsSheets {
  comunes: unknown[][]
  votos: unknown[][]
  candidaturas: unknown[][]
}

export const GVA_ODS_SHEETS = {
  comunes: 'Datos_Comunes_Mesas',
  votos: 'Votos_Candidaturas_Mesas',
  candidaturas: 'Candidaturas',
} as const

export function readGvaOds(buf: Buffer): GvaOdsSheets {
  const wb = XLSX.read(buf, { type: 'buffer' })
  const get = (name: string): unknown[][] => {
    const ws = wb.Sheets[name]
    if (!ws) throw new Error(`ODS GVA: falta la hoja '${name}' (hojas: ${wb.SheetNames.join(', ')})`)
    return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null })
  }
  return { comunes: get(GVA_ODS_SHEETS.comunes), votos: get(GVA_ODS_SHEETS.votos), candidaturas: get(GVA_ODS_SHEETS.candidaturas) }
}

/** La cabecera es la primera fila cuyo primer valor es el nombre de la primera columna esperada. */
function splitHeader(rows: unknown[][], firstCol: string, where: string): { header: string[]; data: unknown[][] } {
  const i = rows.findIndex((r) => String(r?.[0] ?? '').trim() === firstCol)
  if (i < 0) throw new Error(`${where}: no se encuentra la cabecera (primera columna '${firstCol}')`)
  const header = rows[i].map((c) => String(c ?? '').trim())
  const data = rows.slice(i + 1).filter((r) => r.some((c) => c !== null && c !== ''))
  return { header, data }
}

const COMUNES_COLS = ['PROVINCIA', 'CÓDIGO', 'MUNICIPIO', 'DISTRITO', 'SECCIÓN', 'MESA', 'VOTANTES', 'ABSTENCIONES', 'NULOS', 'VALIDOS', 'BLANCOS', 'CANDIDATURAS', 'CENSO']
const VOTOS_COLS = ['CÓDIGO', 'DISTRITO', 'SECCIÓN', 'MESA', 'CANDIDATURA', 'SIGLAS', 'VOTOS']
const CAND_COLS = ['SIGLAS', 'CANDIDATURA', 'CANDIDATURA_AGRUPACIÓN', 'SIGLAS_AGRUPACIÓN']

export function gvaCandidacyId(siglas: unknown, candidatura: unknown): string {
  return `${String(siglas ?? '').trim()} | ${String(candidatura ?? '').trim()}`
}

export function mesaKey(mun5: string, d: unknown, s: unknown, t: unknown): string {
  return `${mun5}|${cleanCode(d).padStart(2, '0')}|${cleanCode(s).padStart(3, '0')}|${cleanCode(t)}`
}

function munCode(v: unknown, where: string): string {
  const s = cleanCode(v)
  if (!/^\d{4,5}$/.test(s)) throw new Error(`${where}: código de municipio no válido ${JSON.stringify(v)}`)
  return s.padStart(5, '0')
}

export interface GvaParseResult {
  rows: PollingStationRow[]
  candidacies: Candidacy[]
  notes: string[]
}

export function parseGvaLocal2023(sheets: GvaOdsSheets): GvaParseResult {
  const c = splitHeader(sheets.comunes, 'PROVINCIA', GVA_ODS_SHEETS.comunes)
  const v = splitHeader(sheets.votos, 'PROVINCIA', GVA_ODS_SHEETS.votos)
  const k = splitHeader(sheets.candidaturas, 'SIGLAS', GVA_ODS_SHEETS.candidaturas)
  const ci = requireColumns(c.header, COMUNES_COLS, GVA_ODS_SHEETS.comunes)
  const vi = requireColumns(v.header, VOTOS_COLS, GVA_ODS_SHEETS.votos)
  const ki = requireColumns(k.header, CAND_COLS, GVA_ODS_SHEETS.candidaturas)

  const rows = new Map<string, PollingStationRow>()
  for (const [n, r] of c.data.entries()) {
    const where = `${GVA_ODS_SHEETS.comunes} fila ${n + 3}`
    const mun = munCode(r[ci['CÓDIGO']], where)
    const row: PollingStationRow = {
      electionType: 'municipal',
      electionDate: '2023-05-28',
      provinceCode: mun.slice(0, 2),
      municipalityCode: mun,
      districtCode: cleanCode(r[ci['DISTRITO']]),
      sectionCode: cleanCode(r[ci['SECCIÓN']]),
      table: cleanCode(r[ci['MESA']]),
      census: toCount(r[ci['CENSO']], where + ' CENSO'),
      voters: toCount(r[ci['VOTANTES']], where + ' VOTANTES'),
      abstentions: toSigned(r[ci['ABSTENCIONES']], where + ' ABSTENCIONES'),
      validVotes: toCount(r[ci['VALIDOS']], where + ' VALIDOS'),
      blankVotes: toCount(r[ci['BLANCOS']], where + ' BLANCOS'),
      nullVotes: toCount(r[ci['NULOS']], where + ' NULOS'),
      candidacyVotes: toCount(r[ci['CANDIDATURAS']], where + ' CANDIDATURAS'),
      votes: {},
      special: null,
      municipalityName: String(r[ci['MUNICIPIO']] ?? '').trim() || null,
    }
    if (!row.table || !row.districtCode || !row.sectionCode) throw new Error(`${where}: distrito/sección/mesa vacíos`)
    const id = mesaKey(mun, row.districtCode, row.sectionCode, row.table)
    if (rows.has(id)) throw new Error(`${where}: mesa duplicada ${id}`)
    rows.set(id, row)
  }

  const agrupacion = new Map<string, { name: string; aggAcr: string; aggName: string }>()
  for (const [n, r] of k.data.entries()) {
    const id = gvaCandidacyId(r[ki['SIGLAS']], r[ki['CANDIDATURA']])
    if (agrupacion.has(id)) throw new Error(`${GVA_ODS_SHEETS.candidaturas} fila ${n + 3}: candidatura duplicada ${id}`)
    agrupacion.set(id, {
      name: String(r[ki['CANDIDATURA']] ?? '').trim(),
      aggAcr: String(r[ki['SIGLAS_AGRUPACIÓN']] ?? '').trim(),
      aggName: String(r[ki['CANDIDATURA_AGRUPACIÓN']] ?? '').trim(),
    })
  }

  const cands = new Map<string, Candidacy>()
  const notInCatalog = new Set<string>()
  for (const [n, r] of v.data.entries()) {
    const where = `${GVA_ODS_SHEETS.votos} fila ${n + 3}`
    const mun = munCode(r[vi['CÓDIGO']], where)
    const key = mesaKey(mun, r[vi['DISTRITO']], r[vi['SECCIÓN']], r[vi['MESA']])
    const row = rows.get(key)
    if (!row) throw new Error(`${where}: votos de una mesa sin datos comunes (${key})`)
    const id = gvaCandidacyId(r[vi['SIGLAS']], r[vi['CANDIDATURA']])
    const votes = toCount(r[vi['VOTOS']], where + ' VOTOS')
    if (votes === null) throw new Error(`${where}: VOTOS vacío para ${id}`)
    if (id in row.votes) throw new Error(`${where}: candidatura repetida en la mesa ${key}: ${id}`)
    row.votes[id] = votes
    if (!cands.has(id)) {
      const a = agrupacion.get(id)
      if (!a) notInCatalog.add(id)
      cands.set(id, {
        id,
        acronym: String(r[vi['SIGLAS']] ?? '').trim(),
        name: String(r[vi['CANDIDATURA']] ?? '').trim(),
        type: 'unknown',
        sourceCode: id,
        aggregationCode: a?.aggAcr || null,
        color: null,
      })
    }
  }
  const notes: string[] = []
  if (notInCatalog.size) notes.push(`candidaturas con votos ausentes de la hoja Candidaturas (sin agrupación): ${[...notInCatalog].join('; ')}`)
  const empty = [...rows.values()].filter((r) => Object.keys(r.votes).length === 0)
  if (empty.length) notes.push(`mesas sin filas de votos por candidatura: ${empty.length}`)
  return { rows: [...rows.values()], candidacies: [...cands.values()], notes }
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV largos (Les Corts 2023, locales 2019): 1 fila por mesa × candidatura
// ─────────────────────────────────────────────────────────────────────────────

interface LongSpec {
  electionType: ElectionType
  electionDate: string
  sep: string
  cols: {
    mun: string
    munName: string
    district: string
    section: string
    table: string
    census: string
    voters: string
    nulls: string
    blank: string
    valid?: string
    candidacyTotal?: string
    abstentions?: string
    candCode: string
    candAcronym: string
    candName: string
    votes: string
  }
}

export const GVA_AUTONOMIC_2023_SPEC: LongSpec = {
  electionType: 'autonomic',
  electionDate: '2023-05-28',
  sep: ',',
  cols: {
    mun: 'Codimuni',
    munName: 'Desc_municipi',
    district: 'Districte',
    section: 'Secció',
    table: 'Mesa',
    census: 'CENS',
    voters: 'VOTANTS',
    nulls: 'V_NULS',
    blank: 'V_BLANC',
    candCode: 'CODI_CANDIDATURA',
    candAcronym: 'SIGLES_CANDIDATURA',
    candName: 'DESC_CANDIDATURA',
    votes: 'V_CAND',
  },
}

export const GVA_LOCAL_2019_SPEC: LongSpec = {
  electionType: 'municipal',
  electionDate: '2019-05-26',
  sep: ';',
  cols: {
    mun: 'COD_MUNICIPIO',
    munName: 'MUNICIPIO',
    district: 'DISTRITO',
    section: 'SECCION',
    table: 'MESA',
    census: 'CENSO',
    voters: 'VOTANTES',
    nulls: 'NULOS',
    blank: 'BLANCOS',
    valid: 'VALIDOS',
    candidacyTotal: 'CANDIDATURAS',
    abstentions: 'ABSTENCIONES',
    candCode: 'CANDIDATO_COD',
    candAcronym: 'CANDIDATO_SIGLAS',
    candName: 'CANDIDATO_DESC',
    votes: 'VOTOS',
  },
}

export function parseGvaLongCsv(text: string, spec: LongSpec, where: string): GvaParseResult {
  const all = parseCsv(text, spec.sep)
  if (all.length < 2) throw new Error(`${where}: fichero vacío o truncado`)
  const header = all[0].map((h) => h.trim())
  const req = Object.values(spec.cols).filter((x): x is string => !!x)
  const ix = requireColumns(header, req, where)
  const data = all.slice(1)
  assertRowWidths(data, header.length, where)
  const col = (r: string[], name: keyof LongSpec['cols']) => r[ix[spec.cols[name] as string]]

  const rows = new Map<string, PollingStationRow>()
  const cands = new Map<string, Candidacy>()
  const conflicts: string[] = []
  for (const [n, r] of data.entries()) {
    const w = `${where} línea ${n + 2}`
    const mun = munCode(col(r, 'mun'), w)
    const base: PollingStationRow = normalizeCodes({
      electionType: spec.electionType,
      electionDate: spec.electionDate,
      provinceCode: mun.slice(0, 2),
      municipalityCode: mun,
      districtCode: cleanCode(col(r, 'district')),
      sectionCode: cleanCode(col(r, 'section')),
      table: cleanCode(col(r, 'table')),
      census: toCount(col(r, 'census'), w),
      voters: toCount(col(r, 'voters'), w),
      abstentions: spec.cols.abstentions ? toSigned(col(r, 'abstentions'), w) : null,
      validVotes: spec.cols.valid ? toCount(col(r, 'valid'), w) : null,
      blankVotes: toCount(col(r, 'blank'), w),
      nullVotes: toCount(col(r, 'nulls'), w),
      candidacyVotes: spec.cols.candidacyTotal ? toCount(col(r, 'candidacyTotal'), w) : null,
      votes: {},
      special: null,
      municipalityName: (col(r, 'munName') ?? '').trim() || null,
    })
    if (isCeraStation(base.municipalityCode, base.districtCode, base.municipalityName)) base.special = 'CERA'
    const key = `${base.municipalityCode}|${base.districtCode}|${base.sectionCode}|${base.table}`
    let row = rows.get(key)
    if (!row) {
      row = base
      rows.set(key, row)
    } else {
      for (const f of ['census', 'voters', 'abstentions', 'validVotes', 'blankVotes', 'nullVotes', 'candidacyVotes'] as const) {
        if (row[f] !== base[f]) conflicts.push(`${key} ${f}: ${row[f]} vs ${base[f]} (${w})`)
      }
    }
    const code = cleanCode(col(r, 'candCode'))
    if (!code) throw new Error(`${w}: código de candidatura vacío`)
    const votes = toCount(col(r, 'votes'), w)
    if (votes === null) throw new Error(`${w}: votos vacíos para la candidatura ${code}`)
    if (code in row.votes) throw new Error(`${w}: candidatura ${code} repetida en la mesa ${key}`)
    row.votes[code] = votes
    if (!cands.has(code)) {
      cands.set(code, {
        id: code,
        acronym: (col(r, 'candAcronym') ?? '').trim(),
        name: (col(r, 'candName') ?? '').trim(),
        type: 'unknown',
        sourceCode: code,
        aggregationCode: null,
        color: null,
      })
    }
  }
  if (conflicts.length) throw new Error(`${where}: datos de mesa distintos entre filas de la misma mesa: ${conflicts.slice(0, 5).join('; ')}`)
  // Válidos y votos a candidaturas por identidad cuando la fuente no los trae:
  //   votos a candidaturas = Σ votos por candidatura (la fuente lista TODAS las candidaturas, con ceros)
  //   válidos = votos a candidaturas + blancos
  const notes: string[] = []
  let derived = 0
  for (const row of rows.values()) {
    if (row.candidacyVotes === null) {
      row.candidacyVotes = Object.values(row.votes).reduce((a, b) => a + b, 0)
      derived++
    }
    if (row.validVotes === null && row.blankVotes !== null) row.validVotes = row.candidacyVotes + row.blankVotes
  }
  if (derived) notes.push(`votos a candidaturas y válidos derivados por identidad (Σ candidaturas; + blancos) en ${derived} mesas: la fuente no publica esas columnas`)
  return { rows: [...rows.values()], candidacies: [...cands.values()], notes }
}

// ─────────────────────────────────────────────────────────────────────────────
// Adaptador
// ─────────────────────────────────────────────────────────────────────────────

/** Municipios con una sola mesa 'U' cuyo voto a candidaturas no es aditivo (listas abiertas). */
export function gvaOpenListMunicipalities(rows: PollingStationRow[]): Set<string> {
  const norm = rows.map(normalizeCodes)
  const perMun = new Map<string, number>()
  for (const r of norm) perMun.set(r.municipalityCode, (perMun.get(r.municipalityCode) ?? 0) + 1)
  const out = new Set<string>()
  for (const r of norm) {
    if (r.electionType !== 'municipal' || r.candidacyVotes === null || perMun.get(r.municipalityCode) !== 1) continue
    const s = Object.values(r.votes).reduce((a, b) => a + b, 0)
    if (s !== r.candidacyVotes) out.add(r.municipalityCode)
  }
  return out
}

const parsedCache = new Map<string, GvaParseResult>()

async function parseFile(f: DownloadedFile): Promise<GvaParseResult> {
  const hit = parsedCache.get(f.sha256)
  if (hit) return hit
  const role = roleOf(f)
  let res: GvaParseResult
  if (role === 'local2023_ods') res = parseGvaLocal2023(readGvaOds(readFileBuffer(f)))
  else if (role === 'autonomic2023_csv') res = parseGvaLongCsv(decodeText(readFileBuffer(f), 'windows-1252'), GVA_AUTONOMIC_2023_SPEC, f.descriptor.fileName)
  else if (role === 'local2019_csv') res = parseGvaLongCsv(decodeText(readFileBuffer(f), 'utf-8'), GVA_LOCAL_2019_SPEC, f.descriptor.fileName)
  else throw new Error(`GVA: fichero no reconocido ${f.descriptor.fileName}`)
  parsedCache.set(f.sha256, res)
  return res
}

export const gvaAdapter: OfficialElectionSourceAdapter = {
  sourceId: GVA_SOURCE_ID,
  supports(electionType, electionDate, territory) {
    if (territory && territory !== '10') return false
    return DESCRIPTORS.some((d) => d.electionType === electionType && d.electionDate === electionDate)
  },
  async discover(electionType, electionDate) {
    return DESCRIPTORS.filter((d) => d.electionType === electionType && d.electionDate === electionDate).map(({ role: _r, seeds: _s, ...d }) => d)
  },
  async download(descriptor, ctx: AdapterContext) {
    const d = DESCRIPTORS.find((x) => x.fileName === descriptor.fileName)
    return downloadWithCache(descriptor, ctx, { seedPaths: d?.seeds ?? [] })
  },
  verifyHash: verifyExpectedHash,
  async inspectSchema(files) {
    const parts: SchemaReport['parts'] = []
    const missing: string[] = []
    const notes: string[] = []
    for (const f of files) {
      const role = roleOf(f)
      try {
        if (role === 'local2023_ods') {
          const s = readGvaOds(readFileBuffer(f))
          const c = splitHeader(s.comunes, 'PROVINCIA', GVA_ODS_SHEETS.comunes)
          const v = splitHeader(s.votos, 'PROVINCIA', GVA_ODS_SHEETS.votos)
          const k = splitHeader(s.candidaturas, 'SIGLAS', GVA_ODS_SHEETS.candidaturas)
          parts.push({ name: GVA_ODS_SHEETS.comunes, columns: c.header, rows: c.data.length })
          parts.push({ name: GVA_ODS_SHEETS.votos, columns: v.header, rows: v.data.length })
          parts.push({ name: GVA_ODS_SHEETS.candidaturas, columns: k.header, rows: k.data.length })
          for (const [h, req] of [[c.header, COMUNES_COLS], [v.header, VOTOS_COLS], [k.header, CAND_COLS]] as const)
            for (const col of req) if (!h.includes(col)) missing.push(col)
        } else {
          const spec = role === 'autonomic2023_csv' ? GVA_AUTONOMIC_2023_SPEC : GVA_LOCAL_2019_SPEC
          const text = decodeText(readFileBuffer(f), role === 'autonomic2023_csv' ? 'windows-1252' : 'utf-8')
          const header = text.slice(0, text.indexOf('\n')).replace(/\r$/, '').split(spec.sep).map((h) => h.trim())
          const lines = text.split('\n').filter((l) => l.trim()).length - 1
          parts.push({ name: f.descriptor.fileName, columns: header, rows: lines })
          for (const col of Object.values(spec.cols)) if (col && !header.includes(col)) missing.push(col)
        }
      } catch (e) {
        missing.push(`${f.descriptor.fileName}: ${(e as Error).message}`)
      }
    }
    if (files.some((f) => roleOf(f) === 'local2023_ods'))
      notes.push('ODS municipal 2023: sin código de candidatura; id = SIGLAS | CANDIDATURA. Hoja de votos con ceros explícitos.')
    return { ok: missing.length === 0, parts, missing, notes }
  },
  async parsePollingStations(files, ctx) {
    const out: PollingStationRow[] = []
    for (const f of files) {
      const res = await parseFile(f)
      for (const n of res.notes) ctx.log(`${GVA_SOURCE_ID}: ${n}`)
      out.push(...res.rows)
    }
    return out
  },
  normalizeTerritorialCodes: normalizeCodes,
  async normalizeCandidacies(files) {
    const out = new Map<string, Candidacy>()
    for (const f of files) for (const c of (await parseFile(f)).candidacies) if (!out.has(c.id)) out.set(c.id, c)
    return [...out.values()]
  },
  validateSourceRows(rows) {
    const rep = validateRows(rows, { openListMunicipalities: gvaOpenListMunicipalities(rows) })
    return { ok: rep.ok, rows: rep.rows, errors: rep.errors, warnings: rep.warnings }
  },
  getCoverage(rows) {
    const r = rows[0]
    return coverageOf(rows, r?.electionType ?? 'municipal', r?.electionDate ?? '', '10')
  },
  getMetadata(): AdapterMetadata {
    return {
      sourceId: GVA_SOURCE_ID,
      authority: AUTHORITY,
      territoryCode: '10',
      level: 'polling_station',
      licence: LICENCE,
      portal: 'https://dadesobertes.gva.es/dataset/pre-result-elec-local-2023',
      parserVersion: GVA_PARSER_VERSION,
      notes:
        'Municipales 2023 (ODS 3 hojas), Les Corts 2023 (CSV) y municipales 2019 (CSV), por mesa. Provincias: ' +
        Object.entries(PROVINCES)
          .map(([k, v]) => `${k} ${v}`)
          .join(', ') +
        '. Municipios < 250 hab.: voto a candidaturas en listas abiertas (no aditivo).',
    }
  },
}

export function _gvaFindRole(files: DownloadedFile[], role: Role): DownloadedFile {
  return findFile(files, (f) => roleOf(f) === role, role)
}
