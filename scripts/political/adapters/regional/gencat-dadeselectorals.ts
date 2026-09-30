// Cataluña — Generalitat de Catalunya, Departament d'Interior, «Dades electorals».
// API oficial de la SPA resultats.dadeselectorals.gencat.cat:
//   /webelec/api/proces/{codi}/nivellTerritorial/{ME|MU}/exportacio → ZIP con 3 CSV (UTF-8 BOM, ';')
//     {codi}-Columnes-{niv}.csv   ancho: 1 fila por mesa, 1 columna '<SIGLES> Vots' por candidatura
//     {codi}-Vots-{niv}.csv       largo: mesa × candidatura con 'Nom Candidatura'
//     {codi}-Participació-{niv}.csv
//
// Convocatorias soportadas (votos por candidatura COMPLETOS por mesa):
//   A20241 autonomic 2024-05-12 (Parlament) · A20211 autonomic 2021-02-14 · G20231 congress 2023-07-23
// NO soportada: M20231 municipal 2023-05-28 — en su exportación ME, 2.153 de las 2.178 columnas de
//   candidatura están vacías en todas las mesas y Vots-ME sólo trae 438 filas: sólo la participación es
//   completa. Para municipales usar el adaptador nacional de Interior (interior-apliextr-mesa).
//
// Celdas: una celda de candidatura vacía = la candidatura no concurre en esa circunscripción
// (provincia) → se omite; '0' = cero votos. Mesas 'xx998 Residents Absents' = C.E.R.A.
// Votantes = último avance 'Participació 20:00' / '8:00:00 PM' (cierre); se comprueba abstención = censo − votantes.
// El ZIP se regenera en cada petición (hash inestable): la identidad es el SHA de Columnes-ME.csv.

import fs from 'node:fs'
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
  assertRowWidths,
  cleanCode,
  coverageOf,
  downloadWithCache,
  isCeraStation,
  normalizeCodes,
  parseCsv,
  readFileBuffer,
  requireColumns,
  sha256,
  toCount,
  toSigned,
  validateRows,
} from './_shared'

export const GENCAT_SOURCE_ID = 'gencat-dadeselectorals'
export const GENCAT_PARSER_VERSION = 'gencat-1.0.0'
const API = 'https://resultats.dadeselectorals.gencat.cat/webelec/api'
const AUTHORITY = "Generalitat de Catalunya — Departament d'Interior (Dades electorals)"
const LICENCE = 'Datos abiertos de la Generalitat de Catalunya (reutilización permitida con cita de la fuente)'

interface Proces {
  codi: string
  electionType: ElectionType
  electionDate: string
  /** SHA-256 del Columnes-ME.csv interno verificado (identidad estable). */
  innerSha: Record<string, string>
  seed?: string
}

export const GENCAT_PROCESSES: Proces[] = [
  {
    codi: 'A20241',
    electionType: 'autonomic',
    electionDate: '2024-05-12',
    innerSha: {
      'A20241-Columnes-ME.csv': '048c57356451cad9eff29db886b83eb3cbd1a824f1fbc172c3de8e18b694db10',
      'A20241-Vots-ME.csv': '61955d00391821eceff53e9ab0f09a571e70de659083d2248cebb8a490b2ce1f',
    },
    seed: path.join(AUDIT_DL_DIR, 'gencat_A20241_ME.zip'),
  },
  { codi: 'A20211', electionType: 'autonomic', electionDate: '2021-02-14', innerSha: {} },
  {
    codi: 'G20231',
    electionType: 'congress',
    electionDate: '2023-07-23',
    innerSha: {
      'G20231-Columnes-ME.csv': '5ffa6d7da7ee7a5eb1a602e90fc089f68fe9c914cc15d0b515d12f48982f4356',
      'G20231-Vots-ME.csv': '66f15cd07c2ec69b5d377ec23f10f326a63f16cb80264e6c53c475935e26ceda',
    },
    seed: path.join(AUDIT_DL_DIR, 'gencat_G20231_ME.zip'),
  },
]

function descriptorsFor(p: Proces): SourceDescriptor[] {
  const base = {
    sourceId: GENCAT_SOURCE_ID,
    electionType: p.electionType,
    electionDate: p.electionDate,
    territoryCode: '09',
    expectedSha256: null,
    format: 'zip(csv)',
    licence: LICENCE,
    authority: AUTHORITY,
    definitive: true,
  }
  return [
    { ...base, url: `${API}/proces/${p.codi}/nivellTerritorial/ME/exportacio`, fileName: `gencat_${p.codi}_ME.zip` },
    { ...base, url: `${API}/proces/${p.codi}/nivellTerritorial/MU/exportacio`, fileName: `gencat_${p.codi}_MU.zip` },
  ]
}

function procesOf(f: DownloadedFile | SourceDescriptor): Proces {
  const name = 'descriptor' in f ? f.descriptor.fileName : f.fileName
  const codi = name.match(/^gencat_([A-Z]\d{5})_/)?.[1]
  const p = GENCAT_PROCESSES.find((x) => x.codi === codi)
  if (!p) throw new Error(`Gencat: fichero no reconocido ${name}`)
  return p
}

const level = (f: DownloadedFile) => (f.descriptor.fileName.endsWith('_MU.zip') ? 'MU' : 'ME')

// ─────────────────────────────────────────────────────────────────────────────
// Parser puro (texto CSV → filas)
// ─────────────────────────────────────────────────────────────────────────────

export const GENCAT_ME_COLS = [
  'Codi Municipi',
  'Nom Municipi',
  'Districte',
  'Secció',
  'Mesa',
  'Cens',
  'Abstenció',
  'Vots nuls',
  'Vots en blanc',
  'Vots a candidatures',
  'Vots vàlids',
]

/** Votantes = último avance ('Participació 20:00' o 'Participació 8:00:00 PM' según el proceso). */
export function finalParticipationColumn(header: string[], where: string): number {
  const idx = header.map((h, i) => [h, i] as const).filter(([h]) => /^Participació \d/.test(h)).map(([, i]) => i)
  if (!idx.length) throw new Error(`${where}: columnas ausentes: Participació (cierre)`)
  return idx[idx.length - 1]
}

function nfc(s: string): string {
  return s.normalize('NFC').trim()
}

export function readGencatZip(buf: Buffer): Promise<Map<string, string>> {
  return JSZip.loadAsync(buf).then(async (z) => {
    const out = new Map<string, string>()
    for (const [n, e] of Object.entries(z.files)) if (!e.dir) out.set(nfc(n), (await e.async('string')).replace(/^﻿/, ''))
    return out
  })
}

export interface GencatParseResult {
  rows: PollingStationRow[]
  candidacyColumns: string[]
  notes: string[]
}

/** Columnes-ME.csv → filas de mesa. */
export function parseGencatColumnesMe(text: string, electionType: ElectionType, electionDate: string, where = 'Columnes-ME.csv'): GencatParseResult {
  const all = parseCsv(text.replace(/^﻿/, ''), ';')
  if (all.length < 2) throw new Error(`${where}: fichero vacío o truncado`)
  const header = all[0].map(nfc)
  const ix = requireColumns(header, GENCAT_ME_COLS, where)
  ix['Participació final'] = finalParticipationColumn(header, where)
  const data = all.slice(1)
  assertRowWidths(data, header.length, where)
  const first = ix['Vots vàlids'] + 1
  const candCols = header.slice(first)
  const bad = candCols.filter((c) => !/ Vots$/.test(c))
  if (bad.length) throw new Error(`${where}: columnas de candidatura sin sufijo ' Vots': ${bad.join(', ')}`)
  const sigles = candCols.map((c) => c.replace(/ Vots$/, ''))
  if (new Set(sigles).size !== sigles.length) throw new Error(`${where}: siglas de candidatura repetidas en la cabecera (exportación municipal no soportada)`)

  const rows: PollingStationRow[] = []
  for (const [n, r] of data.entries()) {
    const w = `${where} línea ${n + 2}`
    const mun = cleanCode(r[ix['Codi Municipi']])
    if (!/^\d{5}$/.test(mun)) throw new Error(`${w}: Codi Municipi no válido '${mun}'`)
    const votes: Record<string, number> = {}
    for (let j = 0; j < sigles.length; j++) {
      const v = toCount(r[first + j], `${w} ${candCols[j]}`)
      if (v !== null) votes[sigles[j]] = v
    }
    const row: PollingStationRow = {
      electionType,
      electionDate,
      provinceCode: mun.slice(0, 2),
      municipalityCode: mun,
      districtCode: cleanCode(r[ix['Districte']]),
      sectionCode: cleanCode(r[ix['Secció']]),
      table: cleanCode(r[ix['Mesa']]),
      census: toCount(r[ix['Cens']], w + ' Cens'),
      voters: toCount(r[ix['Participació final']], `${w} ${header[ix['Participació final']]}`),
      abstentions: toSigned(r[ix['Abstenció']], w + ' Abstenció'),
      validVotes: toCount(r[ix['Vots vàlids']], w + ' Vots vàlids'),
      blankVotes: toCount(r[ix['Vots en blanc']], w + ' Vots en blanc'),
      nullVotes: toCount(r[ix['Vots nuls']], w + ' Vots nuls'),
      candidacyVotes: toCount(r[ix['Vots a candidatures']], w + ' Vots a candidatures'),
      votes,
      special: null,
      municipalityName: (r[ix['Nom Municipi']] ?? '').trim() || null,
    }
    if (isCeraStation(mun, row.districtCode, row.municipalityName)) row.special = 'CERA'
    rows.push(row)
  }
  // Presencia de candidatura por provincia: todas las mesas o ninguna.
  const notes: string[] = []
  const byProv = new Map<string, Map<string, [number, number]>>()
  for (const r of rows) {
    if (r.special) continue
    const m = byProv.get(r.provinceCode) ?? new Map<string, [number, number]>()
    for (const s of sigles) {
      const e = m.get(s) ?? [0, 0]
      if (s in r.votes) e[1]++
      else e[0]++
      m.set(s, e)
    }
    byProv.set(r.provinceCode, m)
  }
  for (const [p, m] of byProv) for (const [s, [empty, filled]] of m) if (empty && filled) notes.push(`provincia ${p}: ${s} con ${empty} mesas vacías y ${filled} con dato (ND en las vacías)`)
  return { rows, candidacyColumns: sigles, notes }
}

/** Vots-ME.csv (largo) → siglas → nombre oficial. */
export function gencatCandidacyNames(text: string, where = 'Vots-ME.csv'): Map<string, string> {
  const all = parseCsv(text.replace(/^﻿/, ''), ';')
  const header = all[0].map(nfc)
  const ix = requireColumns(header, ['Sigles Candidatura', 'Nom Candidatura'], where)
  const out = new Map<string, string>()
  for (const r of all.slice(1)) {
    const s = (r[ix['Sigles Candidatura']] ?? '').trim()
    const n = (r[ix['Nom Candidatura']] ?? '').trim()
    if (s && !out.has(s)) out.set(s, n)
  }
  return out
}

/** Columnes-MU.csv → totales municipales oficiales. */
export function parseGencatColumnesMu(text: string, where = 'Columnes-MU.csv'): Map<string, MunicipalTotals> {
  const all = parseCsv(text.replace(/^﻿/, ''), ';')
  const header = all[0].map(nfc)
  const ix = requireColumns(header, ['Codi Municipi', 'Cens', 'Vots nuls', 'Vots en blanc', 'Vots a candidatures', 'Vots vàlids'], where)
  ix['Participació final'] = finalParticipationColumn(header, where)
  const first = ix['Vots vàlids'] + 1
  const sigles = header.slice(first).map((c) => c.replace(/ Vots$/, ''))
  const out = new Map<string, MunicipalTotals>()
  for (const [n, r] of all.slice(1).entries()) {
    const w = `${where} línea ${n + 2}`
    const votes: Record<string, number> = {}
    sigles.forEach((s, j) => {
      const v = toCount(r[first + j], w)
      if (v !== null) votes[s] = v
    })
    out.set(cleanCode(r[ix['Codi Municipi']]), {
      census: toCount(r[ix['Cens']], w),
      voters: toCount(r[ix['Participació final']], w),
      validVotes: toCount(r[ix['Vots vàlids']], w),
      blankVotes: toCount(r[ix['Vots en blanc']], w),
      nullVotes: toCount(r[ix['Vots nuls']], w),
      candidacyVotes: toCount(r[ix['Vots a candidatures']], w),
      votes,
    })
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Adaptador
// ─────────────────────────────────────────────────────────────────────────────

function innerMetaPath(f: DownloadedFile) {
  return f.path + '.inner.json'
}

async function zipTexts(f: DownloadedFile): Promise<Map<string, string>> {
  return readGencatZip(readFileBuffer(f))
}

function pick(texts: Map<string, string>, suffix: string, what: string): [string, string] {
  const e = [...texts].find(([n]) => n.endsWith(suffix))
  if (!e) throw new Error(`ZIP Gencat sin ${what} (${suffix}); contiene: ${[...texts.keys()].join(', ')}`)
  return e
}

export const gencatAdapter: OfficialElectionSourceAdapter = {
  sourceId: GENCAT_SOURCE_ID,
  supports(electionType, electionDate, territory) {
    if (territory && territory !== '09') return false
    return GENCAT_PROCESSES.some((p) => p.electionType === electionType && p.electionDate === electionDate)
  },
  async discover(electionType, electionDate) {
    return GENCAT_PROCESSES.filter((p) => p.electionType === electionType && p.electionDate === electionDate).flatMap(descriptorsFor)
  },
  async download(descriptor, ctx: AdapterContext) {
    const p = procesOf(descriptor)
    const isMe = descriptor.fileName.endsWith('_ME.zip')
    const file = await downloadWithCache(descriptor, ctx, {
      seedPaths: isMe && p.seed ? [p.seed] : [],
      unstableContainerHash: true,
      timeoutMs: 300_000,
    })
    // Identidad estable: SHA de cada CSV interno.
    const z = await JSZip.loadAsync(readFileBuffer(file))
    const inner: Record<string, { bytes: number; sha256: string }> = {}
    for (const [n, e] of Object.entries(z.files)) {
      if (e.dir) continue
      const b = await e.async('nodebuffer')
      inner[nfc(n)] = { bytes: b.length, sha256: sha256(b) }
    }
    fs.writeFileSync(innerMetaPath(file), JSON.stringify(inner, null, 2))
    return file
  },
  verifyHash(file) {
    const p = procesOf(file)
    if (!fs.existsSync(innerMetaPath(file))) return false
    const inner = JSON.parse(fs.readFileSync(innerMetaPath(file), 'utf8')) as Record<string, { sha256: string }>
    return Object.entries(p.innerSha).every(([n, sha]) => !inner[n] || inner[n].sha256 === sha)
  },
  async inspectSchema(files) {
    const parts: SchemaReport['parts'] = []
    const missing: string[] = []
    const notes: string[] = ['ZIP regenerado en cada petición: identidad = SHA de los CSV internos (.inner.json).']
    for (const f of files) {
      const texts = await zipTexts(f)
      for (const [n, t] of texts) {
        const header = parseCsv(t.slice(0, t.indexOf('\n') + 1), ';')[0]?.map(nfc) ?? []
        parts.push({ name: n, columns: header, rows: t.split('\n').filter((l) => l.trim()).length - 1 })
        if (n.endsWith('Columnes-ME.csv')) for (const c of GENCAT_ME_COLS) if (!header.includes(c)) missing.push(`${n}: ${c}`)
      }
      if (level(f) === 'ME' && ![...texts.keys()].some((n) => n.endsWith('Columnes-ME.csv'))) missing.push(`${f.descriptor.fileName}: Columnes-ME.csv`)
    }
    return { ok: missing.length === 0, parts, missing, notes }
  },
  async parsePollingStations(files, ctx) {
    const out: PollingStationRow[] = []
    for (const f of files.filter((x) => level(x) === 'ME')) {
      const p = procesOf(f)
      const [name, text] = pick(await zipTexts(f), 'Columnes-ME.csv', 'Columnes-ME')
      const res = parseGencatColumnesMe(text, p.electionType, p.electionDate, name)
      for (const n of res.notes) ctx.log(`${GENCAT_SOURCE_ID}: ${n}`)
      out.push(...res.rows)
    }
    return out
  },
  normalizeTerritorialCodes: normalizeCodes,
  async normalizeCandidacies(files) {
    const out: Candidacy[] = []
    for (const f of files.filter((x) => level(x) === 'ME')) {
      const texts = await zipTexts(f)
      const [cn, ct] = pick(texts, 'Columnes-ME.csv', 'Columnes-ME')
      const header = parseCsv(ct.slice(0, ct.indexOf('\n') + 1), ';')[0].map(nfc)
      const sigles = header.slice(header.indexOf('Vots vàlids') + 1).map((c) => c.replace(/ Vots$/, ''))
      const votsEntry = [...texts].find(([n]) => n.endsWith('Vots-ME.csv'))
      const names = votsEntry ? gencatCandidacyNames(votsEntry[1], votsEntry[0]) : new Map<string, string>()
      for (const s of sigles) {
        if (!s) throw new Error(`${cn}: sigla vacía en la cabecera`)
        out.push({ id: s, acronym: s, name: names.get(s) ?? s, type: 'unknown', sourceCode: s, aggregationCode: null, color: null })
      }
    }
    return out
  },
  validateSourceRows(rows) {
    const r = validateRows(rows)
    return { ok: r.ok, rows: r.rows, errors: r.errors, warnings: r.warnings }
  },
  getCoverage(rows) {
    return coverageOf(rows, rows[0]?.electionType ?? 'autonomic', rows[0]?.electionDate ?? '', '09')
  },
  getMetadata(): AdapterMetadata {
    return {
      sourceId: GENCAT_SOURCE_ID,
      authority: AUTHORITY,
      territoryCode: '09',
      level: 'polling_station',
      licence: LICENCE,
      portal: 'https://resultats.dadeselectorals.gencat.cat/',
      parserVersion: GENCAT_PARSER_VERSION,
      notes:
        'Parlament 2024 y 2021 y Congreso 2023 por mesa (Columnes-ME). M20231 excluida: su exportación ME no trae votos por candidatura. C.E.R.A. = municipio xx998.',
    }
  },
  async municipalReference(files) {
    const out = new Map<string, MunicipalTotals>()
    for (const f of files.filter((x) => level(x) === 'MU')) {
      const [n, t] = pick(await zipTexts(f), 'Columnes-MU.csv', 'Columnes-MU')
      for (const [k, v] of parseGencatColumnesMu(t, n)) out.set(k, v)
    }
    return out
  },
}
