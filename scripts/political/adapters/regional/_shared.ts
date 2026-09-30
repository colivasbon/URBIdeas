// Utilidades comunes de los adaptadores AUTONÓMICOS (sin lógica por comunidad).
//
// No sustituye al núcleo de `scripts/political/core/` (lo construye el loader):
// sólo agrupa lo que todos los adaptadores regionales repiten — descarga con
// caché reanudable, SHA-256, lectura de CSV/encodings, normalización de
// códigos y validación aritmética de mesas — para que cada adaptador se limite
// a entender su fichero oficial.
//
// Reglas: ND nunca es 0 (celda vacía → null), no se imputa, no se reparte, no
// se une por nombre. Las incoherencias de la fuente se REPORTAN (warnings), no
// se corrigen.

import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'

import type {
  AdapterContext,
  AdapterCoverage,
  DownloadedFile,
  PollingStationRow,
  RowValidationReport,
  SourceDescriptor,
} from '../../adapter'
import type { ElectionType } from '../../../../src/lib/socideas-secciones-political'

const execFileP = promisify(execFile)

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

/** Raíz de las copias de trabajo ya verificadas por la matriz (no se modifican). */
export const AUDIT_DL_DIR = path.join('tmp', 'audit', 'political', 'dl')

export function sha256(buf: Buffer | Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex')
}

// ─────────────────────────────────────────────────────────────────────────────
// Descarga con caché
// ─────────────────────────────────────────────────────────────────────────────

interface CacheMeta {
  url: string
  sha256: string
  bytes: number
  httpStatus: number
  contentType: string
  retrievedAt: string
  /** 'network' | 'seed:<ruta>' */
  origin: string
}

export interface DownloadOptions {
  /** Copias locales ya verificadas (matriz) que evitan red si el SHA coincide. */
  seedPaths?: string[]
  /** Usar curl.exe (euskadi.eus rechaza el TLS de Node fetch). */
  preferCurl?: boolean
  timeoutMs?: number
  /** Aceptar un contenido distinto al SHA esperado (fuentes que regeneran el ZIP). */
  unstableContainerHash?: boolean
}

async function fetchBuffer(url: string, timeoutMs: number): Promise<{ buf: Buffer; status: number; contentType: string }> {
  const r = await fetch(url, {
    headers: { 'user-agent': BROWSER_UA, accept: '*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  })
  const buf = Buffer.from(await r.arrayBuffer())
  return { buf, status: r.status, contentType: r.headers.get('content-type') ?? '' }
}

async function curlBuffer(url: string, target: string, timeoutMs: number): Promise<{ buf: Buffer; status: number; contentType: string }> {
  const tmp = target + '.part'
  const { stdout } = await execFileP(
    'curl.exe',
    ['-sS', '-L', '-A', BROWSER_UA, '-o', tmp, '-w', '%{http_code}|%{content_type}', '--max-time', String(Math.ceil(timeoutMs / 1000)), url],
    { maxBuffer: 1024 * 1024 },
  )
  const [status, contentType] = stdout.trim().split('|')
  const buf = fs.readFileSync(tmp)
  fs.rmSync(tmp, { force: true })
  return { buf, status: Number(status), contentType: contentType ?? '' }
}

/**
 * Descarga reanudable: `ctx.rawDir/fileName` + `fileName.meta.json`.
 * - Si existe y `resume` es false → 'unchanged' sin red.
 * - Si no existe y hay una semilla local cuyo SHA coincide con el esperado → se copia sin red.
 * - Si `resume` → se revalida contra el servidor.
 */
export async function downloadWithCache(
  descriptor: SourceDescriptor,
  ctx: AdapterContext,
  opts: DownloadOptions = {},
): Promise<DownloadedFile> {
  fs.mkdirSync(ctx.rawDir, { recursive: true })
  const target = path.join(ctx.rawDir, descriptor.fileName)
  const metaPath = target + '.meta.json'
  const timeoutMs = opts.timeoutMs ?? 180_000

  const fromMeta = (meta: CacheMeta, state: DownloadedFile['state']): DownloadedFile => ({
    descriptor,
    path: target,
    sha256: meta.sha256,
    bytes: meta.bytes,
    httpStatus: meta.httpStatus,
    contentType: meta.contentType,
    state,
    retrievedAt: meta.retrievedAt,
  })

  if (fs.existsSync(target) && fs.existsSync(metaPath) && !ctx.resume) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as CacheMeta
    const buf = fs.readFileSync(target)
    const actual = sha256(buf)
    if (actual !== meta.sha256) throw new Error(`${descriptor.fileName}: la caché local no coincide con su meta (${actual} ≠ ${meta.sha256})`)
    ctx.log(`${descriptor.sourceId}: ${descriptor.fileName} en caché (${meta.bytes} B, ${actual.slice(0, 12)})`)
    return fromMeta(meta, 'unchanged')
  }

  if (!fs.existsSync(target) && !ctx.resume && (descriptor.expectedSha256 || opts.unstableContainerHash)) {
    for (const seed of opts.seedPaths ?? []) {
      if (!fs.existsSync(seed)) continue
      const buf = fs.readFileSync(seed)
      const seedHash = sha256(buf)
      // Contenedor inestable (ZIP regenerado en cada petición): la identidad la
      // verifica el adaptador sobre los ficheros internos en verifyHash().
      if (descriptor.expectedSha256 && seedHash !== descriptor.expectedSha256) continue
      fs.writeFileSync(target, buf)
      const meta: CacheMeta = {
        url: descriptor.url,
        sha256: seedHash,
        bytes: buf.length,
        httpStatus: 200,
        contentType: '',
        retrievedAt: fs.statSync(seed).mtime.toISOString(),
        origin: 'seed:' + seed.replace(/\\/g, '/'),
      }
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
      ctx.log(`${descriptor.sourceId}: ${descriptor.fileName} copiado de la semilla verificada ${seed}`)
      return fromMeta(meta, 'downloaded')
    }
  }

  const got = opts.preferCurl ? await curlBuffer(descriptor.url, target, timeoutMs) : await fetchBuffer(descriptor.url, timeoutMs)
  if (got.status !== 200) throw new Error(`${descriptor.fileName}: HTTP ${got.status} en ${descriptor.url}`)
  if (got.buf.length === 0) throw new Error(`${descriptor.fileName}: respuesta vacía`)
  const hash = sha256(got.buf)
  const previous = fs.existsSync(target) ? sha256(fs.readFileSync(target)) : null
  fs.writeFileSync(target, got.buf)
  const meta: CacheMeta = {
    url: descriptor.url,
    sha256: hash,
    bytes: got.buf.length,
    httpStatus: got.status,
    contentType: got.contentType,
    retrievedAt: new Date().toISOString(),
    origin: 'network',
  }
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
  ctx.log(`${descriptor.sourceId}: ${descriptor.fileName} descargado (${got.buf.length} B, ${hash.slice(0, 12)})`)
  return fromMeta(meta, previous === hash ? 'unchanged' : 'downloaded')
}

export function verifyExpectedHash(file: DownloadedFile): boolean {
  const expected = file.descriptor.expectedSha256
  return !expected || expected === file.sha256
}

// ─────────────────────────────────────────────────────────────────────────────
// Texto y CSV
// ─────────────────────────────────────────────────────────────────────────────

// CP850 (DOS Latin-1) 0x80–0xFF. Lo usa la Xunta en los CSV del Parlamento.
const CP850 =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ '

export type TextEncoding = 'utf-8' | 'windows-1252' | 'cp850'

export function decodeText(buf: Buffer | Uint8Array, encoding: TextEncoding): string {
  let text: string
  if (encoding === 'cp850') {
    let out = ''
    for (const b of buf) out += b < 0x80 ? String.fromCharCode(b) : CP850[b - 0x80]
    text = out
  } else {
    text = new TextDecoder(encoding).decode(buf)
  }
  return text.replace(/^﻿/, '')
}

/** CSV con comillas dobles (RFC 4180) y separador configurable. Devuelve filas de celdas. */
export function parseCsv(text: string, sep: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
      continue
    }
    if (c === '"' && cell === '') quoted = true
    else if (c === sep) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (quoted) throw new Error('CSV truncado: comilla sin cerrar al final del fichero')
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

/** Índices de columnas obligatorias; lanza con la lista de ausentes. */
export function requireColumns(header: string[], required: string[], where: string): Record<string, number> {
  const norm = header.map((h) => h.trim())
  const idx: Record<string, number> = {}
  const missing: string[] = []
  for (const r of required) {
    const i = norm.indexOf(r)
    if (i < 0) missing.push(r)
    else idx[r] = i
  }
  if (missing.length) throw new Error(`${where}: columnas ausentes: ${missing.join(', ')}`)
  return idx
}

/** Comprueba que todas las filas de datos tengan el ancho de la cabecera (fichero truncado). */
export function assertRowWidths(rows: string[][], width: number, where: string, firstDataLine = 2): void {
  rows.forEach((r, i) => {
    if (r.length !== width) {
      throw new Error(`${where}: fila ${i + firstDataLine} con ${r.length} campos (cabecera ${width}); fichero truncado o mal formado`)
    }
  })
}

/**
 * Entero de recuento. Celda vacía → null (ND, nunca 0). Admite número o texto
 * con dígitos (y tabulador inicial de Euskadi). Cualquier otra cosa lanza.
 */
export function toCount(v: unknown, where: string): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') {
    if (!Number.isInteger(v) || v < 0) throw new Error(`${where}: recuento no entero o negativo: ${v}`)
    return v
  }
  const s = String(v).replace(/^[\s\t]+|[\s\t]+$/g, '')
  if (s === '') return null
  if (!/^\d+$/.test(s)) throw new Error(`${where}: recuento no numérico: ${JSON.stringify(v)}`)
  return Number(s)
}

/** Entero con signo (abstención publicada = censo − votantes, puede ser negativa). Vacío → null. */
export function toSigned(v: unknown, where: string): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) throw new Error(`${where}: valor no entero: ${v}`)
    return v
  }
  const s = String(v).trim()
  if (s === '') return null
  if (!/^-?\d+$/.test(s)) throw new Error(`${where}: valor no numérico: ${JSON.stringify(v)}`)
  return Number(s)
}

export function cleanCode(v: unknown): string {
  return String(v ?? '').replace(/^[\s\t"]+|[\s\t"]+$/g, '')
}

// ─────────────────────────────────────────────────────────────────────────────
// Códigos territoriales
// ─────────────────────────────────────────────────────────────────────────────

/** Deja provincia(2), municipio(5 = prov+mun), distrito(2), sección(3). Idempotente. */
export function normalizeCodes(row: PollingStationRow): PollingStationRow {
  const prov = cleanCode(row.provinceCode).padStart(2, '0')
  let mun = cleanCode(row.municipalityCode)
  if (mun.length <= 3) mun = prov + mun.padStart(3, '0')
  else mun = mun.padStart(5, '0')
  const dist = cleanCode(row.districtCode).padStart(2, '0')
  const sec = cleanCode(row.sectionCode).padStart(3, '0')
  return { ...row, provinceCode: prov, municipalityCode: mun, districtCode: dist, sectionCode: sec, table: cleanCode(row.table) }
}

/**
 * Mesas del C.E.R.A. (residentes ausentes): municipio 990/999 de la provincia con
 * distrito 99/09 o denominación explícita. Se excluyen de la capa seccional.
 */
export function isCeraStation(mun5: string, district: string, name?: string | null): boolean {
  const m3 = mun5.slice(-3)
  if (m3 !== '990' && m3 !== '998' && m3 !== '999') return false
  return /^(99|09)$/.test(district.padStart(2, '0')) || /ausentes|absents|C\.?E\.?R\.?A/i.test(name ?? '')
}

export function stationKey(r: PollingStationRow): string {
  return `${r.municipalityCode}|${r.districtCode}|${r.sectionCode}|${r.table}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Validación y cobertura
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationOptions {
  /** Fuente sin votantes/válidos/nulos (p. ej. ISTAC por sección). */
  candidacyOnly?: boolean
  /** Fuente sin votos por candidatura (IBESTAT participación). */
  participationOnly?: boolean
  /** Municipios cuyo voto a candidaturas no es aditivo (listas abiertas, < 250 hab.). */
  openListMunicipalities?: Set<string>
  maxListed?: number
}

export interface ValidationCounters {
  votersNeValidPlusNull: string[]
  validNeCandPlusBlank: string[]
  sumVotesNeCandidacyVotes: string[]
  sumVotesNeCandidacyVotesOpenList: string[]
  votersGtCensus: string[]
  abstentionNeCensusMinusVoters: string[]
}

export function validateRows(rows: PollingStationRow[], opts: ValidationOptions = {}): RowValidationReport & { counters: ValidationCounters } {
  const errors: string[] = []
  const warnings: string[] = []
  const max = opts.maxListed ?? 25
  const c: ValidationCounters = {
    votersNeValidPlusNull: [],
    validNeCandPlusBlank: [],
    sumVotesNeCandidacyVotes: [],
    sumVotesNeCandidacyVotesOpenList: [],
    votersGtCensus: [],
    abstentionNeCensusMinusVoters: [],
  }
  const seen = new Set<string>()
  for (const raw of rows) {
    const r = normalizeCodes(raw)
    const k = stationKey(r)
    if (r.special) {
      // Mesas C.E.R.A. / especiales: fuera de la capa seccional; sólo se exige que sean recuentos.
      for (const v of [r.census, r.voters, r.validVotes, r.blankVotes, r.nullVotes, r.candidacyVotes, ...Object.values(r.votes)])
        if (v !== null && (!Number.isInteger(v) || v < 0)) errors.push(`${k} (${r.special}): recuento no válido (${v})`)
      continue
    }
    if (!/^\d{2}$/.test(r.provinceCode)) errors.push(`${k}: provincia no válida '${r.provinceCode}'`)
    if (!/^\d{5}$/.test(r.municipalityCode) || !r.municipalityCode.startsWith(r.provinceCode))
      errors.push(`${k}: municipio no válido '${r.municipalityCode}'`)
    if (!/^\d{2}$/.test(r.districtCode)) errors.push(`${k}: distrito no válido '${r.districtCode}'`)
    if (!/^\d{3}$/.test(r.sectionCode)) errors.push(`${k}: sección no válida '${r.sectionCode}'`)
    if (!r.table) errors.push(`${k}: mesa vacía`)
    if (seen.has(k)) errors.push(`${k}: mesa duplicada`)
    seen.add(k)
    for (const [f, v] of Object.entries({
      census: r.census,
      voters: r.voters,
      validVotes: r.validVotes,
      blankVotes: r.blankVotes,
      nullVotes: r.nullVotes,
      candidacyVotes: r.candidacyVotes,
    })) {
      if (v !== null && (!Number.isInteger(v) || v < 0)) errors.push(`${k}: ${f} no es un recuento válido (${v})`)
    }
    for (const [id, v] of Object.entries(r.votes)) {
      if (!Number.isInteger(v) || v < 0) errors.push(`${k}: votos de '${id}' no válidos (${v})`)
    }
    if (r.special) continue
    if (r.voters !== null && r.validVotes !== null && r.nullVotes !== null && r.voters !== r.validVotes + r.nullVotes)
      c.votersNeValidPlusNull.push(`${k} (${r.voters} ≠ ${r.validVotes}+${r.nullVotes})`)
    if (r.validVotes !== null && r.candidacyVotes !== null && r.blankVotes !== null && r.validVotes !== r.candidacyVotes + r.blankVotes)
      c.validNeCandPlusBlank.push(`${k} (${r.validVotes} ≠ ${r.candidacyVotes}+${r.blankVotes})`)
    if (!opts.participationOnly && r.candidacyVotes !== null && Object.keys(r.votes).length) {
      const s = Object.values(r.votes).reduce((a, b) => a + b, 0)
      if (s !== r.candidacyVotes) {
        const target = opts.openListMunicipalities?.has(r.municipalityCode) ? c.sumVotesNeCandidacyVotesOpenList : c.sumVotesNeCandidacyVotes
        target.push(`${k} (Σ ${s} ≠ ${r.candidacyVotes})`)
      }
    }
    if (r.census !== null && r.voters !== null && r.voters > r.census) c.votersGtCensus.push(`${k} (${r.voters} > ${r.census})`)
    if (r.census !== null && r.voters !== null && r.abstentions !== null && r.abstentions !== r.census - r.voters)
      c.abstentionNeCensusMinusVoters.push(`${k} (${r.abstentions} ≠ ${r.census}−${r.voters})`)
  }
  const label: Record<keyof ValidationCounters, string> = {
    votersNeValidPlusNull: 'votantes ≠ válidos + nulos',
    validNeCandPlusBlank: 'válidos ≠ candidaturas + blancos',
    sumVotesNeCandidacyVotes: 'Σ votos por candidatura ≠ votos a candidaturas',
    sumVotesNeCandidacyVotesOpenList: 'Σ votos por candidatura ≠ votos a candidaturas (municipios de listas abiertas < 250 hab., esperado)',
    votersGtCensus: 'votantes > censo',
    abstentionNeCensusMinusVoters: 'abstención ≠ censo − votantes',
  }
  for (const key of Object.keys(c) as Array<keyof ValidationCounters>) {
    const list = c[key]
    if (list.length) warnings.push(`${label[key]}: ${list.length} mesas — ${list.slice(0, max).join('; ')}${list.length > max ? '; …' : ''}`)
  }
  return { ok: errors.length === 0, rows: rows.length, errors: errors.slice(0, 200), warnings, counters: c }
}

export function coverageOf(rows: PollingStationRow[], electionType: ElectionType, electionDate: string, territoryCode: string | null): AdapterCoverage {
  const n = rows.map(normalizeCodes).filter((r) => !r.special)
  return {
    electionType,
    electionDate,
    territoryCode,
    provinces: new Set(n.map((r) => r.provinceCode)).size,
    municipalities: new Set(n.map((r) => r.municipalityCode)).size,
    pollingStations: n.length,
    sections: new Set(n.map((r) => `${r.municipalityCode}${r.districtCode}${r.sectionCode}`)).size,
  }
}

export function findFile(files: DownloadedFile[], pred: (f: DownloadedFile) => boolean, what: string): DownloadedFile {
  const f = files.find(pred)
  if (!f) throw new Error(`falta el fichero oficial: ${what}`)
  return f
}

export function readFileBuffer(f: DownloadedFile): Buffer {
  return fs.readFileSync(f.path)
}

/** Blancos derivados por identidad (válidos − votos a candidaturas) cuando la celda viene vacía. */
export function deriveBlank(valid: number | null, cand: number | null, blank: number | null): { value: number | null; derived: boolean } {
  if (blank !== null) return { value: blank, derived: false }
  if (valid !== null && cand !== null && valid - cand >= 0) return { value: valid - cand, derived: true }
  return { value: null, derived: false }
}
