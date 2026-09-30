// Región de Murcia — CARM, Portal de Datos Abiertos (datosabiertos.carm.es/odata/Presidencia).
// Elecciones a la Asamblea Regional 2019-05-26, ficheros con la estructura APLIEXTR de Interior en XLSX
// (una columna por campo de registro, cabecera en fila 1):
//   ELEC_09051905.xlsx  datos comunes de mesas   … C.Provincia C.Municipio D.Municipal Sección Mesa Censo INE
//                       Censo Escrutinio … V.blanco V.nulos V.a candidaturas … D.Oficiales
//   ELEC_10051905.xlsx  candidaturas de mesas    … Sección Mesa C.Candidatura Votos
//   ELEC_03051905.xlsx  candidaturas             Código Siglas Denominación Ag. Provincial Ag. Comunidad Ag. Estatal
//   ELEC_05051905.xlsx  datos comunes de municipios (referencia de conciliación)
// Como en Interior, la mesa no trae votantes ni válidos: válidos = blancos + candidaturas y
// votantes = válidos + nulos (identidades LOREG). Censo = 'Censo Escrutinio'.
// Fila C.Provincia 99 / C.Municipio 999 / D.Municipal 09 = C.E.R.A. (total autonómico).
// 2023: no publicado (directorio OData con sólo ficheros *1905 y CKAN sin convocatoria 2023).

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
import XLSX from 'xlsx'
import {
  AUDIT_DL_DIR,
  cleanCode,
  coverageOf,
  downloadWithCache,
  normalizeCodes,
  readFileBuffer,
  requireColumns,
  toCount,
  validateRows,
  verifyExpectedHash,
} from './_shared'

export const CARM_SOURCE_ID = 'carm-datosabiertos'
export const CARM_PARSER_VERSION = 'carm-1.0.0'
const BASE = 'https://datosabiertos.carm.es/odata/Presidencia/'
const AUTHORITY = 'Comunidad Autónoma de la Región de Murcia — Portal de Datos Abiertos'
const LICENCE = 'Aviso legal datosabiertos.regiondemurcia.es (reutilización con cita de la fuente)'

export const CARM_FILES = {
  mesas: { file: 'ELEC_09051905.xlsx', sha: '6ded8e87d7efd3767aa250ad475957d19fa7566eef5b1afc0a94454f9d7a1c8f', seed: path.join(AUDIT_DL_DIR, 'murcia09051905.xlsx') },
  votos: { file: 'ELEC_10051905.xlsx', sha: 'd65d9567aa2e0767adeef2f30b03f1ebf091f63da49f1d9536b469ffd9469460', seed: path.join(AUDIT_DL_DIR, 'murcia10051905.xlsx') },
  candidaturas: { file: 'ELEC_03051905.xlsx', sha: null, seed: path.join('tmp', 'audit', 'political', 'regional', 'probe', 'carm', 'ELEC_03051905.xlsx') },
  municipios: { file: 'ELEC_05051905.xlsx', sha: null, seed: path.join('tmp', 'audit', 'political', 'regional', 'probe', 'carm', 'ELEC_05051905.xlsx') },
} as const

const MESA_COLS = ['Elección', 'C.Provincia', 'C.Municipio', 'D.Municipal', 'Sección', 'Mesa', 'Censo Escrutinio', 'V.blanco', 'V.nulos', 'V.a candidaturas']
const VOTO_COLS = ['Elección', 'C.Provincia', 'C.Municipio', 'D.Municipal', 'Sección', 'Mesa', 'C.Candidatura', 'Votos']
const CAND_COLS = ['Código', 'Siglas', 'Denominación', 'Ag. Comunidad']

export function readXlsxRows(buf: Buffer, where: string): string[][] {
  const wb = XLSX.read(buf, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error(`${where}: libro sin hojas`)
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' }).map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c))))
}

const mesaKey = (p: string, m: string, d: string, s: string, t: string) => `${p}|${m}|${d}|${s}|${t}`

export interface CarmParseResult {
  rows: PollingStationRow[]
  candidacies: Candidacy[]
}

export function parseCarm(mesas: string[][], votos: string[][], cands: string[][], electionDate = '2019-05-26'): CarmParseResult {
  if (mesas.length < 2 || votos.length < 2) throw new Error('CARM: fichero vacío o truncado')
  const mi = requireColumns(mesas[0], MESA_COLS, CARM_FILES.mesas.file)
  const vi = requireColumns(votos[0], VOTO_COLS, CARM_FILES.votos.file)
  const ci = requireColumns(cands[0], CAND_COLS, CARM_FILES.candidaturas.file)
  const rows = new Map<string, PollingStationRow>()
  for (const [n, r] of mesas.slice(1).entries()) {
    if (r.every((c) => c === '')) continue
    const w = `${CARM_FILES.mesas.file} fila ${n + 2}`
    if (cleanCode(r[mi['Elección']]) !== '05') throw new Error(`${w}: Elección '${r[mi['Elección']]}' ≠ 05 (autonómicas)`)
    const prov = cleanCode(r[mi['C.Provincia']])
    const mun3 = cleanCode(r[mi['C.Municipio']])
    const d = cleanCode(r[mi['D.Municipal']])
    const s = cleanCode(r[mi['Sección']])
    const t = cleanCode(r[mi['Mesa']])
    const cera = prov === '99' || mun3 === '999'
    if (!cera && (prov !== '30' || !/^\d{3}$/.test(mun3) || !/^\d{3}$/.test(s))) throw new Error(`${w}: códigos no válidos ${prov}/${mun3}/${d}/${s}/${t}`)
    const blank = toCount(r[mi['V.blanco']], w + ' V.blanco')
    const nul = toCount(r[mi['V.nulos']], w + ' V.nulos')
    const cand = toCount(r[mi['V.a candidaturas']], w + ' V.a candidaturas')
    const valid = blank !== null && cand !== null ? blank + cand : null
    const k = mesaKey(prov, mun3, d, s, t)
    if (rows.has(k)) throw new Error(`${w}: mesa duplicada ${k}`)
    rows.set(k, {
      electionType: 'autonomic',
      electionDate,
      provinceCode: prov,
      municipalityCode: prov + mun3,
      districtCode: d,
      sectionCode: s,
      table: t,
      census: toCount(r[mi['Censo Escrutinio']], w + ' Censo Escrutinio'),
      voters: valid !== null && nul !== null ? valid + nul : null,
      abstentions: null,
      validVotes: valid,
      blankVotes: blank,
      nullVotes: nul,
      candidacyVotes: cand,
      votes: {},
      special: cera ? 'CERA' : null,
      municipalityName: null,
    })
  }
  for (const [n, r] of votos.slice(1).entries()) {
    if (r.every((c) => c === '')) continue
    const w = `${CARM_FILES.votos.file} fila ${n + 2}`
    const k = mesaKey(cleanCode(r[vi['C.Provincia']]), cleanCode(r[vi['C.Municipio']]), cleanCode(r[vi['D.Municipal']]), cleanCode(r[vi['Sección']]), cleanCode(r[vi['Mesa']]))
    const row = rows.get(k)
    if (!row) throw new Error(`${w}: candidatura de una mesa ausente del fichero 09 (${k})`)
    const id = cleanCode(r[vi['C.Candidatura']])
    const v = toCount(r[vi['Votos']], w + ' Votos')
    if (!id || v === null) throw new Error(`${w}: C.Candidatura o Votos vacíos`)
    if (id in row.votes) throw new Error(`${w}: candidatura ${id} repetida en ${k}`)
    row.votes[id] = v
  }
  const candidacies: Candidacy[] = cands
    .slice(1)
    .filter((r) => r.some((c) => c !== ''))
    .map((r) => {
      const id = cleanCode(r[ci['Código']])
      return {
        id,
        acronym: (r[ci['Siglas']] ?? '').trim(),
        name: (r[ci['Denominación']] ?? '').trim(),
        type: 'unknown' as const,
        sourceCode: id,
        aggregationCode: cleanCode(r[ci['Ag. Comunidad']]) || null,
        color: null,
      }
    })
  return { rows: [...rows.values()], candidacies }
}

export function parseCarmMunicipios(rows: string[][]): Map<string, MunicipalTotals> {
  const ix = requireColumns(rows[0], ['C.Provincia', 'C.Municipio', 'Censo Escrutinio', 'V.blanco', 'V.nulos', 'V.a candidaturas'], CARM_FILES.municipios.file)
  const out = new Map<string, MunicipalTotals>()
  for (const r of rows.slice(1)) {
    const prov = cleanCode(r[ix['C.Provincia']])
    const mun = cleanCode(r[ix['C.Municipio']])
    if (prov !== '30' || !/^\d{3}$/.test(mun)) continue
    const w = CARM_FILES.municipios.file
    const blank = toCount(r[ix['V.blanco']], w)
    const nul = toCount(r[ix['V.nulos']], w)
    const cand = toCount(r[ix['V.a candidaturas']], w)
    const valid = blank !== null && cand !== null ? blank + cand : null
    out.set(prov + mun, {
      census: toCount(r[ix['Censo Escrutinio']], w),
      voters: valid !== null && nul !== null ? valid + nul : null,
      validVotes: valid,
      blankVotes: blank,
      nullVotes: nul,
      candidacyVotes: cand,
      votes: {},
    })
  }
  return out
}

const role = (f: DownloadedFile) => (Object.entries(CARM_FILES).find(([, v]) => v.file === f.descriptor.fileName)?.[0] ?? null) as keyof typeof CARM_FILES | null

function load(files: DownloadedFile[]): CarmParseResult {
  const get = (k: keyof typeof CARM_FILES) => {
    const f = files.find((x) => role(x) === k)
    if (!f) throw new Error(`CARM: falta ${CARM_FILES[k].file}`)
    return readXlsxRows(readFileBuffer(f), CARM_FILES[k].file)
  }
  return parseCarm(get('mesas'), get('votos'), get('candidaturas'))
}

export const carmAdapter: OfficialElectionSourceAdapter = {
  sourceId: CARM_SOURCE_ID,
  supports(electionType, electionDate, territory) {
    if (territory && territory !== '14') return false
    return electionType === 'autonomic' && electionDate === '2019-05-26'
  },
  async discover(electionType, electionDate) {
    if (!this.supports(electionType, electionDate)) return []
    return Object.values(CARM_FILES).map((f) => ({
      sourceId: CARM_SOURCE_ID,
      electionType: 'autonomic' as const,
      electionDate,
      territoryCode: '14',
      url: BASE + f.file,
      fileName: f.file,
      expectedSha256: f.sha,
      format: 'xlsx (registros APLIEXTR)',
      licence: LICENCE,
      authority: AUTHORITY,
      definitive: true,
    }))
  },
  async download(descriptor: SourceDescriptor, ctx: AdapterContext) {
    const f = Object.values(CARM_FILES).find((x) => x.file === descriptor.fileName)
    return downloadWithCache(descriptor, ctx, { seedPaths: f ? [f.seed] : [], unstableContainerHash: !descriptor.expectedSha256 })
  },
  verifyHash: verifyExpectedHash,
  async inspectSchema(files) {
    const parts: SchemaReport['parts'] = []
    const missing: string[] = []
    for (const f of files) {
      const rows = readXlsxRows(readFileBuffer(f), f.descriptor.fileName)
      parts.push({ name: f.descriptor.fileName, columns: rows[0] ?? [], rows: rows.length - 1 })
      const req = role(f) === 'mesas' ? MESA_COLS : role(f) === 'votos' ? VOTO_COLS : role(f) === 'candidaturas' ? CAND_COLS : []
      for (const c of req) if (!(rows[0] ?? []).includes(c)) missing.push(`${f.descriptor.fileName}: ${c}`)
    }
    return { ok: missing.length === 0, parts, missing, notes: ['Votantes y válidos derivados por identidad (estructura APLIEXTR sin esos campos).'] }
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
    return coverageOf(rows, 'autonomic', rows[0]?.electionDate ?? '', '14')
  },
  getMetadata(): AdapterMetadata {
    return {
      sourceId: CARM_SOURCE_ID,
      authority: AUTHORITY,
      territoryCode: '14',
      level: 'polling_station',
      licence: LICENCE,
      portal: 'https://datosabiertos.carm.es/odata/Presidencia/',
      parserVersion: CARM_PARSER_VERSION,
      notes: 'Asamblea Regional 2019 por mesa (ficheros 09/10/03 APLIEXTR en XLSX). 2023 no publicado en el portal.',
    }
  },
  async municipalReference(files) {
    const f = files.find((x) => role(x) === 'municipios')
    return f ? parseCarmMunicipios(readXlsxRows(readFileBuffer(f), f.descriptor.fileName)) : new Map()
  },
}
