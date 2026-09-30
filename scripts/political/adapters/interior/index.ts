// Adaptador nacional: Ministerio del Interior, Infoelectoral, paquetes
// APLIEXTR por MESA ({tt}{aaaa}{mm}_MESA.zip).
//
// HECHOS VERIFICADOS (2026-09-29, ficheros reales; ver
// tmp/audit/political/interior/schema-report-*.json):
//   - GET con User-Agent de navegador: HTTP 200 application/zip (HEAD se cuelga).
//   - Ficheros .DAT de ancho fijo, ANSI (Windows-1252). Separador LF en casi
//     todos (la especificación dice CR+LF): se aceptan ambos.
//   - 09 = datos globales de mesa; 10 = votos por candidatura y mesa (con
//     ceros explícitos); clave de mesa = columnas 9-23 (vuelta, CCAA,
//     provincia, municipio, distrito, sección(4), mesa).
//   - Sección (19-22): "tres dígitos seguidos de un espacio, letra mayúscula u
//     otro dígito". En los 7 paquetes objetivo el 4.º carácter es SIEMPRE un
//     espacio en las mesas territoriales; sólo el CERA lleva "0000"
//     (recuentos en schema-report). Si apareciera una letra, la sección NO se
//     trunca: se conserva de 4 caracteres, falla la validación de formato y
//     el municipio queda bloqueado (fail-closed).
//   - CERA: municipio 999, distrito = distrito electoral o 09, sección 0000,
//     mesa U. Interior lo publica por provincia (y totales CCAA 99 / nacional
//     99): nunca por municipio. Se marca special='CERA' y queda fuera de la
//     capa seccional; se documenta en el manifiesto.
//   - Municipales: 09/10 sólo traen municipios > 250 hab.; los < 250 van en
//     11/12 SIN mesa y con listas abiertas (voto a candidatos): quedan
//     documentados como municipality_only, no se publican en la capa seccional.
//   - El 09 NO publica "votantes": votantes = blancos + nulos + candidaturas;
//     válidos = blancos + candidaturas (así lo hace Interior en sus totales; la
//     comprobación votantes = válidos + nulos es, con esta fuente, una identidad).
//     Censo = censo de escrutinio (col. 31-37), el mismo que usa la ficha
//     municipal (Datos Abiertos "Electores"). Los avances de participación no
//     se usan (en 251 mesas de 2023 el 2.º avance supera a los votantes).
//   - Senado (03): el 10 trae votos a SENADORES (código prov+distrito+orden),
//     cada elector marca hasta 3; la suma del 10 no es "votos a candidaturas"
//     (59.591 de 60.396 mesas en 03202307). Los denominadores del contrato no
//     aplican: no soportado.

import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, appendFileSync } from 'node:fs'
import { dirname } from 'node:path'
import JSZip from 'jszip'
import type {
  AdapterContext,
  AdapterCoverage,
  AdapterMetadata,
  DownloadedFile,
  OfficialElectionSourceAdapter,
  PollingStationRow,
  RowValidationReport,
  SchemaReport,
  SourceDescriptor,
} from '../../adapter'
import {
  INTERIOR_APLIEXTR_BASE,
  INTERIOR_PROCESS_CODE,
  interiorApliextrFileName,
  type Candidacy,
  type ElectionType,
  type MunicipalTotals,
} from '../../../../src/lib/socideas-secciones-political'
import { assignColors } from '../../core/colors'
import { decodeAnsi, int, parseLine, splitRecords, type RecordSpec, type RawRecord } from '../../core/fixed-width'
import { validatePollingRows, type DetailedValidation } from '../../core/validate'
import { CERA_MUNICIPALITY, SPEC_03, SPEC_05, SPEC_06, SPEC_09, SPEC_10, SPEC_11 } from './spec'

export const INTERIOR_SOURCE_ID = 'interior-apliextr-mesa'
export const INTERIOR_PARSER_VERSION = 'interior-apliextr-mesa@1.0.0'
export const INTERIOR_AUTHORITY = 'Ministerio del Interior — Infoelectoral'
export const INTERIOR_PORTAL = 'https://infoelectoral.interior.gob.es/es/elecciones-celebradas/area-de-descargas/'
export const INTERIOR_LICENCE =
  'Reutilización permitida con cita de la fuente: condiciones generales de reutilización (Ley 37/2007) a las que remite el aviso legal de Infoelectoral, https://infoelectoral.interior.gob.es/es/aviso-legal/'
export const SENATE_NOT_SUPPORTED =
  'Senado: el fichero 10 publica votos a senadores (lista abierta, hasta 3 marcas por elector); no hay votos por candidatura compatibles con los denominadores del contrato.'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'

/** Convocatorias verificadas: fecha real, fichero y SHA-256 descargado el 2026-09-29. */
export const INTERIOR_KNOWN: Array<{ type: ElectionType; date: string; file: string; sha256: string; bytes: number }> = [
  { type: 'municipal', date: '2023-05-28', file: '04202305_MESA.zip', sha256: '20dac696cd2efaa63c9346384ddb682f3da4fda92c6af67447159a60f1ab0de3', bytes: 8503878 },
  { type: 'municipal', date: '2019-05-26', file: '04201905_MESA.zip', sha256: 'b8b1c649e3841ba735383152fd3a38259a336698d1eb79f7a653cae54c02e204', bytes: 8573678 },
  { type: 'congress', date: '2023-07-23', file: '02202307_MESA.zip', sha256: 'e78fc231326a03cf67bbec87b7100ea0c8c46859daa1b2a631c06daaaf1717f8', bytes: 4578794 },
  { type: 'congress', date: '2019-11-10', file: '02201911_MESA.zip', sha256: 'e7b621f295d7bf79b794941d4f11e7bcf7bd971ecbd6eb21dd4269d59926e441', bytes: 5752461 },
  { type: 'congress', date: '2019-04-28', file: '02201904_MESA.zip', sha256: '92f2ff6c1c9a6504d6d3647fa365c64a3502d36e15440364aa94f478e7d40764', bytes: 4740645 },
  { type: 'european', date: '2024-06-09', file: '07202406_MESA.zip', sha256: 'ed30e4cf11772afb0785f2992f44fa191b8671f933865335b7093ac9ccb6659b', bytes: 9577205 },
  { type: 'european', date: '2019-05-26', file: '07201905_MESA.zip', sha256: '8199711babd4b61ee4940469351ab4a263b0cf84a84ccfbe04ab1970a4c1a474', bytes: 10829270 },
]

const SUPPORTED_TYPES: ReadonlySet<ElectionType> = new Set(['municipal', 'congress', 'european'])

export interface InteriorScope {
  /** Provincias (2 dígitos) a leer; null = todas. */
  provinces?: Set<string> | null
  /** Municipios (5 dígitos) a leer; null = todos. */
  municipalities?: Set<string> | null
}

export interface MunicipalReferenceEntry {
  municipalityCode: string
  name: string
  communityCode: string
  pollingStations: number
  totals: MunicipalTotals
  definitive: boolean
}

export interface MunicipalityOnlyEntry {
  municipalityCode: string
  name: string
  pollingStations: number
  reason: string
}

export interface SpecialTableSummary {
  kind: 'CERA'
  communityCode: string
  provinceCode: string
  districtCode: string
  pollingStations: number
  census: number | null
  voters: number | null
  validVotes: number | null
}

export interface InteriorDiagnostics {
  lines09: number
  lines10: number
  rowsInScope09: number
  rowsInScope10: number
  ceraRows: number
  sectionFourthChar: Record<string, number>
  officialFlags: Record<string, number>
  orphans10: string[]
  duplicates09: string[]
  duplicatePairs10: string[]
  nonDefinitiveMunicipalities: string[]
}

function processCode(type: ElectionType): string {
  const tt = INTERIOR_PROCESS_CODE[type]
  if (!tt) throw new Error(`Tipo sin código de proceso Interior: ${type}`)
  return tt
}

/** Nombre del .DAT dentro del paquete: nn + tt + aa + mm. */
export function datName(nn: string, type: ElectionType, date: string): string {
  return `${nn}${processCode(type)}${date.slice(2, 4)}${date.slice(5, 7)}.DAT`
}

function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(path)
      .on('data', (c) => h.update(c))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject)
  })
}

interface SidecarMeta {
  url: string
  sha256: string
  bytes: number
  httpStatus: number
  contentType: string
  retrievedAt: string
}

async function fetchToFile(url: string, dest: string, log: (m: string) => void): Promise<{ status: number; contentType: string }> {
  const part = `${dest}.part`
  mkdirSync(dirname(dest), { recursive: true })
  let lastErr: unknown
  for (let attempt = 1; attempt <= 4; attempt++) {
    const have = existsSync(part) ? statSync(part).size : 0
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 300000)
    try {
      const headers: Record<string, string> = { 'User-Agent': BROWSER_UA, Accept: '*/*' }
      if (have > 0) headers.Range = `bytes=${have}-`
      const r = await fetch(url, { headers, signal: ctl.signal })
      if (r.status !== 200 && r.status !== 206) throw new Error(`HTTP ${r.status}`)
      const buf = Buffer.from(await r.arrayBuffer())
      if (r.status === 206 && have > 0) appendFileSync(part, buf)
      else writeFileSync(part, buf)
      renameSync(part, dest)
      return { status: r.status === 206 ? 200 : r.status, contentType: r.headers.get('content-type') ?? '' }
    } catch (e) {
      lastErr = e
      log(`  descarga ${url} intento ${attempt}: ${e instanceof Error ? e.message : String(e)}`)
      await new Promise((res) => setTimeout(res, 1000 * attempt))
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(`No se pudo descargar ${url}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`)
}

export class InteriorApliextrMesaAdapter implements OfficialElectionSourceAdapter {
  readonly sourceId = INTERIOR_SOURCE_ID
  private scope: InteriorScope
  private zipCache = new Map<string, JSZip>()
  private textCache = new Map<string, string>()
  private known05: Set<string> | null = null
  diagnostics: InteriorDiagnostics | null = null
  ceraSummary: SpecialTableSummary[] = []
  lastValidation: DetailedValidation | null = null

  constructor(opts: { scope?: InteriorScope } = {}) {
    this.scope = opts.scope ?? {}
  }

  setScope(scope: InteriorScope): void {
    this.scope = scope
  }

  supports(electionType: ElectionType, electionDate: string, territory?: string | null): boolean {
    if (territory) return false
    if (!SUPPORTED_TYPES.has(electionType)) return false
    return /^\d{4}-\d{2}-\d{2}$/.test(electionDate)
  }

  async discover(electionType: ElectionType, electionDate: string, _ctx: AdapterContext): Promise<SourceDescriptor[]> {
    if (!this.supports(electionType, electionDate)) {
      throw new Error(electionType === 'senate' ? SENATE_NOT_SUPPORTED : `Interior APLIEXTR no soporta ${electionType} ${electionDate}`)
    }
    const fileName = interiorApliextrFileName(electionType, electionDate)
    if (!fileName) throw new Error(`Fecha inválida: ${electionDate}`)
    const known = INTERIOR_KNOWN.find((k) => k.type === electionType && k.date === electionDate)
    return [
      {
        sourceId: this.sourceId,
        electionType,
        electionDate,
        territoryCode: null,
        url: `${INTERIOR_APLIEXTR_BASE}/${fileName}`,
        fileName,
        expectedSha256: known?.sha256 ?? null,
        format: 'zip (.DAT ancho fijo, Windows-1252)',
        licence: INTERIOR_LICENCE,
        authority: INTERIOR_AUTHORITY,
        definitive: true,
      },
    ]
  }

  private cachePath(ctx: AdapterContext, d: SourceDescriptor): string {
    return `${ctx.rawDir}/${d.fileName.replace('_MESA.zip', '')}/${d.fileName}`
  }

  async download(descriptor: SourceDescriptor, ctx: AdapterContext): Promise<DownloadedFile> {
    const path = this.cachePath(ctx, descriptor)
    const metaPath = `${path}.meta.json`
    const readMeta = (): SidecarMeta | null => (existsSync(metaPath) ? (JSON.parse(readFileSync(metaPath, 'utf8')) as SidecarMeta) : null)
    if (existsSync(path) && !ctx.resume) {
      const sha = await sha256File(path)
      const meta = readMeta()
      const bytes = statSync(path).size
      if (!meta || meta.sha256 !== sha) {
        writeFileSync(
          metaPath,
          JSON.stringify({ url: descriptor.url, sha256: sha, bytes, httpStatus: meta?.httpStatus ?? 200, contentType: meta?.contentType ?? 'application/zip', retrievedAt: meta?.retrievedAt ?? statSync(path).mtime.toISOString() }, null, 1),
        )
      }
      const m = readMeta() as SidecarMeta
      ctx.log(`[interior] caché ${path} (${bytes} B, sha256 ${sha.slice(0, 12)}…)`)
      return { descriptor, path, sha256: sha, bytes, httpStatus: m.httpStatus, contentType: m.contentType, state: 'unchanged', retrievedAt: m.retrievedAt }
    }
    const prevSha = existsSync(path) ? await sha256File(path) : null
    const tmp = `${path}.new`
    ctx.log(`[interior] GET ${descriptor.url}`)
    const res = await fetchToFile(descriptor.url, tmp, ctx.log)
    const buf = readFileSync(tmp)
    if (buf[0] !== 0x50 || buf[1] !== 0x4b) {
      unlinkSync(tmp)
      throw new Error(`${descriptor.url}: la respuesta no es un ZIP (content-type ${res.contentType})`)
    }
    const sha = createHash('sha256').update(buf).digest('hex')
    const state: DownloadedFile['state'] = prevSha === sha ? 'unchanged' : 'downloaded'
    renameSync(tmp, path)
    const meta: SidecarMeta = {
      url: descriptor.url,
      sha256: sha,
      bytes: buf.length,
      httpStatus: res.status,
      contentType: res.contentType,
      retrievedAt: state === 'unchanged' ? (readMeta()?.retrievedAt ?? new Date().toISOString()) : new Date().toISOString(),
    }
    writeFileSync(metaPath, JSON.stringify(meta, null, 1))
    this.zipCache.delete(path)
    return { descriptor, path, sha256: sha, bytes: buf.length, httpStatus: res.status, contentType: res.contentType, state, retrievedAt: meta.retrievedAt }
  }

  verifyHash(file: DownloadedFile): boolean {
    const actual = createHash('sha256').update(readFileSync(file.path)).digest('hex')
    if (actual !== file.sha256) return false
    if (file.descriptor.expectedSha256 && file.descriptor.expectedSha256 !== actual) return false
    return true
  }

  // ── Lectura del ZIP ────────────────────────────────────────────────────────

  private async zip(file: DownloadedFile): Promise<JSZip> {
    let z = this.zipCache.get(file.path)
    if (!z) {
      z = await JSZip.loadAsync(readFileSync(file.path))
      this.zipCache.set(file.path, z)
    }
    return z
  }

  /** Texto decodificado de un .DAT del paquete, o null si no está. */
  async datText(file: DownloadedFile, nn: string): Promise<string | null> {
    const d = file.descriptor
    const name = datName(nn, d.electionType, d.electionDate)
    const ck = `${file.path}#${name}`
    const hit = this.textCache.get(ck)
    if (hit !== undefined) return hit
    const z = await this.zip(file)
    const entry = Object.values(z.files).find((f) => f.name.toUpperCase() === name.toUpperCase())
    if (!entry) return null
    const text = decodeAnsi(await entry.async('uint8array'))
    this.textCache.set(ck, text)
    return text
  }

  private async records(file: DownloadedFile, nn: string, spec: RecordSpec, keep?: (line: string) => boolean): Promise<RawRecord[]> {
    const text = await this.datText(file, nn)
    if (text === null) throw new Error(`Falta ${datName(nn, file.descriptor.electionType, file.descriptor.electionDate)} en ${file.descriptor.fileName}`)
    const name = datName(nn, file.descriptor.electionType, file.descriptor.electionDate)
    const lines = splitRecords(text)
    const out: RawRecord[] = []
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i] as string
      if (keep && l.length === spec.length && !keep(l)) continue
      out.push(parseLine(l, spec, i + 1, name))
    }
    return out
  }

  private inScopeRaw(prov: string, mun3: string): boolean {
    const p = this.scope.provinces
    const m = this.scope.municipalities
    if (p && p.size && !p.has(prov)) return false
    if (m && m.size && !m.has(`${prov}${mun3}`)) return false
    return true
  }

  private requiredParts(type: ElectionType): string[] {
    return type === 'municipal' ? ['03', '05', '06', '09', '10', '11'] : ['03', '05', '06', '09', '10']
  }

  async inspectSchema(files: DownloadedFile[]): Promise<SchemaReport> {
    const file = files[0]
    if (!file) return { ok: false, parts: [], missing: ['paquete'], notes: [] }
    const z = await this.zip(file)
    const d = file.descriptor
    const parts: SchemaReport['parts'] = []
    const missing: string[] = []
    const notes: string[] = [`Entradas del ZIP: ${Object.keys(z.files).sort().join(', ')}`]
    const specs: Record<string, RecordSpec> = { '03': SPEC_03, '05': SPEC_05, '06': SPEC_06, '09': SPEC_09, '10': SPEC_10, '11': SPEC_11 }
    for (const nn of this.requiredParts(d.electionType)) {
      const spec = specs[nn] as RecordSpec
      const text = await this.datText(file, nn)
      if (text === null) {
        missing.push(datName(nn, d.electionType, d.electionDate))
        continue
      }
      const lines = splitRecords(text)
      const lens: Record<number, number> = {}
      for (const l of lines) lens[l.length] = (lens[l.length] ?? 0) + 1
      const crlf = text.includes('\r\n')
      const bad = Object.entries(lens).filter(([k]) => Number(k) !== spec.length)
      if (bad.length) missing.push(`${datName(nn, d.electionType, d.electionDate)}: líneas de longitud ${bad.map(([k, v]) => `${k}×${v}`).join(', ')} ≠ ${spec.length}`)
      parts.push({ name: datName(nn, d.electionType, d.electionDate), columns: spec.fields.map((f) => `${f.name}[${f.start}-${f.end}]`), rows: lines.length })
      notes.push(`${datName(nn, d.electionType, d.electionDate)}: ${lines.length} registros de ${spec.length} caracteres, separador ${crlf ? 'CR+LF' : 'LF'}`)
    }
    const t09 = await this.datText(file, '09')
    if (t09) {
      const fourth: Record<string, number> = {}
      const fourthCera: Record<string, number> = {}
      let cera = 0
      const official: Record<string, number> = {}
      for (const l of splitRecords(t09)) {
        if (l.length !== SPEC_09.length) continue
        const c4 = JSON.stringify(l.slice(21, 22))
        if (l.slice(13, 16) === CERA_MUNICIPALITY) {
          cera++
          fourthCera[c4] = (fourthCera[c4] ?? 0) + 1
        } else fourth[c4] = (fourth[c4] ?? 0) + 1
        official[l.slice(100, 101)] = (official[l.slice(100, 101)] ?? 0) + 1
      }
      notes.push(`09: 4.º carácter de sección en mesas territoriales ${JSON.stringify(fourth)}; en CERA ${JSON.stringify(fourthCera)}`)
      notes.push(`09: mesas CERA (municipio 999) ${cera}; datos oficiales ${JSON.stringify(official)}`)
    }
    return { ok: missing.length === 0, parts, missing, notes }
  }

  // ── Mesas ──────────────────────────────────────────────────────────────────

  async parsePollingStations(files: DownloadedFile[], _ctx: AdapterContext): Promise<PollingStationRow[]> {
    const file = files[0]
    if (!file) throw new Error('Sin fichero')
    const d = file.descriptor
    const ref = await this.municipalReferenceDetailed(files)
    this.known05 = new Set(ref.keys())
    const keep = (l: string) => this.inScopeRaw(l.slice(11, 13), l.slice(13, 16)) || l.slice(13, 16) === CERA_MUNICIPALITY
    const t09 = await this.datText(file, '09')
    const t10 = await this.datText(file, '10')
    const r09 = await this.records(file, '09', SPEC_09, keep)
    const r10 = await this.records(file, '10', SPEC_10, keep)
    const diag: InteriorDiagnostics = {
      lines09: t09 ? splitRecords(t09).length : 0,
      lines10: t10 ? splitRecords(t10).length : 0,
      rowsInScope09: 0,
      rowsInScope10: r10.length,
      ceraRows: 0,
      sectionFourthChar: {},
      officialFlags: {},
      orphans10: [],
      duplicates09: [],
      duplicatePairs10: [],
      nonDefinitiveMunicipalities: [],
    }
    const cera = new Map<string, SpecialTableSummary>()
    const tipo = processCode(d.electionType)
    const byKey = new Map<string, PollingStationRow>()
    const nonDef = new Set<string>()
    for (const r of r09) {
      if (r.tipo !== tipo) throw new Error(`09: tipo de elección ${r.tipo} ≠ ${tipo}`)
      const key = `${r.vuelta}${r.ccaa}${r.provincia}${r.municipio}${r.distrito}${r.seccion}${r.mesa}`
      const isCera = r.municipio === CERA_MUNICIPALITY
      const blank = int(r.blancos as string)
      const nul = int(r.nulos as string)
      const cand = int(r.candidaturas as string)
      const row: PollingStationRow = {
        electionType: d.electionType,
        electionDate: d.electionDate,
        provinceCode: r.provincia as string,
        municipalityCode: r.municipio as string,
        districtCode: r.distrito as string,
        sectionCode: r.seccion as string,
        table: r.mesa as string,
        census: int(r.censoEscrutinio as string),
        voters: blank + nul + cand,
        abstentions: null,
        validVotes: blank + cand,
        blankVotes: blank,
        nullVotes: nul,
        candidacyVotes: cand,
        votes: {},
        special: isCera ? 'CERA' : null,
        municipalityName: isCera ? null : (ref.get(`${r.provincia}${r.municipio}`)?.name ?? null),
      }
      if (byKey.has(key)) {
        diag.duplicates09.push(key)
        // Se conserva la mesa duplicada como fila aparte: la validación la detecta y bloquea el municipio.
        byKey.set(`${key}#dup${diag.duplicates09.length}`, row)
      } else byKey.set(key, row)
      if (isCera) {
        diag.ceraRows++
        const ck = `${r.ccaa}-${r.provincia}-${r.distrito}`
        const prev = cera.get(ck)
        cera.set(ck, {
          kind: 'CERA',
          communityCode: r.ccaa as string,
          provinceCode: r.provincia as string,
          districtCode: r.distrito as string,
          pollingStations: (prev?.pollingStations ?? 0) + 1,
          census: (prev?.census ?? 0) + (row.census as number),
          voters: (prev?.voters ?? 0) + (row.voters as number),
          validVotes: (prev?.validVotes ?? 0) + (row.validVotes as number),
        })
      } else {
        diag.rowsInScope09++
        const c4 = JSON.stringify((r.seccion as string).slice(3, 4))
        diag.sectionFourthChar[c4] = (diag.sectionFourthChar[c4] ?? 0) + 1
      }
      diag.officialFlags[r.oficial as string] = (diag.officialFlags[r.oficial as string] ?? 0) + 1
      if (r.oficial !== 'S' && !isCera) nonDef.add(`${r.provincia}${r.municipio}`)
    }
    for (const r of r10) {
      if (r.tipo !== tipo) throw new Error(`10: tipo de elección ${r.tipo} ≠ ${tipo}`)
      const key = `${r.vuelta}${r.ccaa}${r.provincia}${r.municipio}${r.distrito}${r.seccion}${r.mesa}`
      const row = byKey.get(key)
      if (!row) {
        diag.orphans10.push(`${key}/${r.candidatura}`)
        continue
      }
      const c = r.candidatura as string
      if (c in row.votes) {
        diag.duplicatePairs10.push(`${key}/${c}`)
        continue
      }
      row.votes[c] = int(r.votos as string)
    }
    diag.nonDefinitiveMunicipalities = [...nonDef].sort()
    this.diagnostics = diag
    this.ceraSummary = [...cera.values()].sort((a, b) =>
      `${a.communityCode}${a.provinceCode}${a.districtCode}` < `${b.communityCode}${b.provinceCode}${b.districtCode}` ? -1 : 1,
    )
    return [...byKey.values()]
  }

  normalizeTerritorialCodes(row: PollingStationRow): PollingStationRow {
    const prov = row.provinceCode.padStart(2, '0')
    const munRaw = row.municipalityCode
    const mun5 = munRaw.length === 5 ? munRaw : `${prov}${munRaw.padStart(3, '0')}`
    const dist = row.districtCode.padStart(2, '0')
    const raw = row.sectionCode
    let sec: string
    if (row.special) sec = raw
    else if (raw.length === 4 && raw[3] === ' ') sec = raw.slice(0, 3)
    else if (raw.length === 3) sec = raw
    else sec = raw.trimEnd() // p. ej. "001A": NO se trunca; falla la validación 2/5/2/3.
    return { ...row, provinceCode: prov, municipalityCode: mun5, districtCode: dist, sectionCode: sec }
  }

  async normalizeCandidacies(files: DownloadedFile[]): Promise<Candidacy[]> {
    const file = files[0]
    if (!file) return []
    const recs = await this.records(file, '03', SPEC_03)
    const nz = (v: string) => (v === '000000' ? null : v)
    const out: Candidacy[] = recs.map((r) => {
      const name = (r.denominacion as string).trim()
      const upper = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
      const type: Candidacy['type'] = /\bCOALICION\b/.test(upper)
        ? 'coalition'
        : /AGRUPACION (DE )?ELECTORES|AGRUPACION ELECTORAL/.test(upper)
          ? 'local'
          : 'unknown'
      return {
        id: r.codigo as string,
        acronym: (r.siglas as string).trim(),
        name,
        type,
        sourceCode: r.codigo as string,
        aggregationCode: nz(r.accNacional as string),
        aggregationCodes: {
          provincial: nz(r.accProvincial as string),
          autonomic: nz(r.accAutonomica as string),
          national: nz(r.accNacional as string),
        },
        color: null,
      }
    })
    const ids = new Set<string>()
    for (const c of out) {
      if (ids.has(c.id)) throw new Error(`03: código de candidatura duplicado ${c.id}`)
      ids.add(c.id)
    }
    return assignColors(out)
  }

  validateSourceRows(rows: PollingStationRow[]): RowValidationReport {
    const v = validatePollingRows(rows, { knownMunicipalities: this.known05 })
    const diag = this.diagnostics
    if (diag) {
      if (diag.orphans10.length) {
        v.errors.unshift(`10: ${diag.orphans10.length} registros sin mesa en el 09 (p. ej. ${diag.orphans10.slice(0, 3).join(', ')})`)
        v.ok = false
      }
      for (const k of diag.duplicatePairs10) {
        // clave: vuelta(1) ccaa(2) prov(2) mun(3) …
        const ine = k.slice(3, 8)
        const x = v.byMunicipality.get(ine) ?? { errors: [], warnings: [] }
        x.errors.push(`10: candidatura repetida en la misma mesa ${k}`)
        v.byMunicipality.set(ine, x)
        v.errors.push(`${ine}: 10: candidatura repetida en la misma mesa ${k}`)
        v.ok = false
      }
    }
    this.lastValidation = v
    return v
  }

  getCoverage(rows: PollingStationRow[]): AdapterCoverage {
    const terr = rows.filter((r) => !r.special)
    const first = rows[0]
    return {
      electionType: (first?.electionType ?? 'municipal') as ElectionType,
      electionDate: first?.electionDate ?? '',
      territoryCode: null,
      provinces: new Set(terr.map((r) => r.provinceCode)).size,
      municipalities: new Set(terr.map((r) => r.municipalityCode)).size,
      pollingStations: terr.length,
      sections: new Set(terr.map((r) => `${r.municipalityCode}${r.districtCode}${r.sectionCode}`)).size,
    }
  }

  getMetadata(): AdapterMetadata {
    return {
      sourceId: this.sourceId,
      authority: INTERIOR_AUTHORITY,
      territoryCode: null,
      level: 'polling_station',
      licence: INTERIOR_LICENCE,
      portal: INTERIOR_PORTAL,
      parserVersion: INTERIOR_PARSER_VERSION,
      notes:
        'APLIEXTR por mesa (ficheros 09/10/03, conciliación 05/06). Congreso, municipales (> 250 hab.) y europeas. CERA por provincia fuera de la capa seccional. Senado no soportado.',
    }
  }

  // ── Referencias municipales ────────────────────────────────────────────────

  async municipalReferenceDetailed(files: DownloadedFile[]): Promise<Map<string, MunicipalReferenceEntry>> {
    const file = files[0]
    if (!file) return new Map()
    const r05 = await this.records(file, '05', SPEC_05)
    const r06 = await this.records(file, '06', SPEC_06)
    const out = new Map<string, MunicipalReferenceEntry>()
    for (const r of r05) {
      if (r.distrito !== '99') continue
      const ine = `${r.provincia}${r.municipio}`
      const bl = int(r.blancos as string)
      const nu = int(r.nulos as string)
      const ca = int(r.candidaturas as string)
      if (out.has(ine)) throw new Error(`05: total municipal duplicado ${ine}`)
      out.set(ine, {
        municipalityCode: ine,
        name: (r.nombre as string).trim(),
        communityCode: r.ccaa as string,
        pollingStations: int(r.mesas as string),
        definitive: r.oficial === 'S',
        totals: {
          census: int(r.censoEscrutinio as string),
          voters: bl + nu + ca,
          validVotes: bl + ca,
          blankVotes: bl,
          nullVotes: nu,
          candidacyVotes: ca,
          votes: {},
        },
      })
    }
    for (const r of r06) {
      if (r.distrito !== '99') continue
      const e = out.get(`${r.provincia}${r.municipio}`)
      if (!e) throw new Error(`06: municipio ${r.provincia}${r.municipio} sin registro 05`)
      const c = r.candidatura as string
      e.totals.votes[c] = (e.totals.votes[c] ?? 0) + int(r.votos as string)
    }
    return out
  }

  async municipalReference(files: DownloadedFile[]): Promise<Map<string, MunicipalTotals>> {
    const d = await this.municipalReferenceDetailed(files)
    return new Map([...d.entries()].map(([k, v]) => [k, v.totals]))
  }

  /** Municipios < 250 hab. (sólo municipales): fichero 11, sin mesa. */
  async municipalityOnly(files: DownloadedFile[]): Promise<MunicipalityOnlyEntry[]> {
    const file = files[0]
    if (!file || file.descriptor.electionType !== 'municipal') return []
    const recs = await this.records(file, '11', SPEC_11)
    return recs.map((r) => ({
      municipalityCode: `${r.provincia}${r.municipio}`,
      name: (r.nombre as string).trim(),
      pollingStations: int(r.mesas as string),
      reason:
        'municipality_only: municipio < 250 hab. en municipales; Interior sólo publica totales municipales (fichero 11/12, listas abiertas con voto a candidatos) y no hay datos por mesa.',
    }))
  }

  /** Resumen de mesas CERA (CCAA/provincia/distrito electoral) de la última lectura.
   *  Las filas con provincia 99 son totales autonómicos/nacional del CERA. */
  specialTables(): SpecialTableSummary[] {
    return this.ceraSummary
  }
}

export function createInteriorAdapter(opts: { scope?: InteriorScope } = {}): InteriorApliextrMesaAdapter {
  return new InteriorApliextrMesaAdapter(opts)
}
