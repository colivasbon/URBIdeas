#!/usr/bin/env node
// Cargador de indicadores educativos por sección censal (INE → R2).
//
// FUENTE OFICIAL
//   Censo Anual de Población · Educación y Relación con la actividad
//   https://www.ine.es/dynt3/inebase/index.htm?padre=10607&capsel=10613
//   Índice provincial: .../index.htm?padre=10607&capsel=11155  (52 unidades)
//   Descarga:          https://www.ine.es/jaxiT3/files/t/csv_bd/{tableId}.csv
//   UTF-8 con BOM, TSV: Provincias | Municipios | Secciones | Sexo | <dimensión> | Periodo | Total
//   Cada CSV de la edición 2024 trae los periodos 2021–2024.
//
// MARCAS DE LA COLUMNA Total (ver scripts/education/cells.ts)
//   '.'  → ND por secreto estadístico.
//   '""' → sin valor: la sección no existe en el seccionado de ese periodo
//          (comprobado contra la geometría INE del año). Una sección sin valor
//          en ninguna de las dos tablas se EXCLUYE del objeto y se reporta.
//
// SALIDA EN R2 (bajo socideas/secciones/v1/education/)
//   normalized/{period}/{ine}.json     objeto EducationMunicipalObject (determinista)
//   raw/{edition}/{prov}/{tableId}.csv originales (--upload-raw)
//   catalog.json, indicators.json      sólo en pasada nacional o con --catalog
//   manifests/{period}.json            sólo en pasada nacional
//
// USO
//   Muestra:   npx tsx scripts/load-section-education.ts --period=2024 --municipalities=02003,8019 --write --verify --catalog
//   Lote:      npx tsx scripts/load-section-education.ts --period=2024 --provinces=01,02,03 --write --verify --resume --upload-raw
//   Nacional:  npx tsx scripts/load-section-education.ts --period=2024 --all-provinces --write --verify --resume --upload-raw
//   Periodos:  --period=2024 | --period=2021,2022,2023,2024 | --period=all (todos los de la columna Periodo)
//   Otras:     --concurrency=12  --download (revalida contra el INE)  --no-geometry  --manifest=ruta
//              --out-dir=ruta (copia local de cada objeto, para auditoría)  --edition=2024  --raw-dir=tmp/education-raw
//
// ESTADO LOCAL (tmp/audit/education/)
//   raw-state-{edition}.json   SHA → primera fecha vista (base de source.retrieved_at)
//   checkpoint-{period}.json   municipio → content_sha256 escrito y verificado (--resume lo salta)
//   geometry/cusec-index-{period}.json  {ine: [cusec…]} de Secciones_{period} (WFS INE, sólo atributos)
//   manifest-{period}.json (nacional) · manifest-{period}-municipios.json · batches/manifest-{period}-provincias-*.json
//
// REGLAS
//   · ND nunca es 0; no se imputa, interpola, reparte ni promedia; la unión es por CUSEC.
//   · Idempotente: mismo CSV → mismo objeto → mismo content_sha256 → sin PUT.
//   · Código de salida ≠ 0 si falla cualquier provincia, municipio, escritura o verificación.

import { config } from 'dotenv'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

import {
  EDUCATION_INDICATORS,
  EDUCATION_R2_PREFIX,
  EDUCATION_SCHEMA_VERSION,
  isEducationMunicipalObject,
  type EducationCatalog,
  type EducationMunicipalObject,
} from '../src/lib/socideas-secciones-education'
import provTables from '../src/lib/education-province-tables.json'
import mapping from '../src/lib/education-category-mapping.json'
import { normalizarCodigoMunicipio, normalizarCodigoProvincia } from './education/cells'
import { parsearTablaTexto, type Grupo, type TablaParseada } from './education/parse'
import { agruparPorMunicipio } from './education/sections'
import { canonicalJson, construirMunicipio, huellaSin, sha256, tieneDatos, validacionSuperada } from './education/municipal'
import { construirCatalogo, construirIndicatorsJson, type ProvinciaCatalogo, type ResumenMunicipio } from './education/catalog'
import { coberturaGeometrica, indiceDesdeFeatures, urlIndiceProvincia, type CoberturaMunicipio } from './education/geometry'
import { conReintentos, mapPool } from './education/pool'

config({ path: '.env.local', quiet: true })

const PARSER_VERSION = 'ine-education-parser/1.1.0'
const MAPPING_VERSION = mapping.mapping_version
const OPERATION = '1254736176992'
const SRC_URL = mapping.source.index_url
const INDEX_URL = mapping.source.provincial_index_url
const SRC_LABEL = 'Censo Anual de Población · Educación y Relación con la actividad'
const ORGANISM = 'Instituto Nacional de Estadística (INE)'
const LICENCE =
  'Reutilización conforme al aviso legal del INE, apartado "Reutilización de la información contenida en este sitio web": https://www.ine.es/dyngs/AYU/index.htm?cid=125'
const CSV_URL = (t: number) => `https://www.ine.es/jaxiT3/files/t/csv_bd/${t}.csv`
const UA = { 'User-Agent': 'SOCideas/1.0 (+https://urbideas.com)' }
const EXPECTED_TERRITORIES = 52
const AUDIT_DIR = join('tmp', 'audit', 'education')
// Índice CUSEC propio (formato {ine: [cusec…]}). NO se escribe en tmp/audit/sections/:
// ese directorio lo usa scripts/political/core/geometry.ts con otro esquema (cusec-index-v1).
const GEOMETRY_INDEX_DIR = join(AUDIT_DIR, 'geometry')

type ProvinceTables = Record<string, { provincia: string; formacion: number; actividad: number }>
const PROVINCES = provTables as ProvinceTables

const log = (...a: unknown[]) => console.log('[education]', ...a)

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

interface Cli {
  periods: number[] | 'all'
  edition: number
  scope: 'national' | 'provinces' | 'municipalities'
  provinces: string[]
  municipalities: string[] | null
  indicators: string[] | null
  download: boolean
  write: boolean
  verify: boolean
  resume: boolean
  uploadRaw: boolean
  catalog: boolean
  geometry: boolean
  concurrency: number
  manifest: string | null
  rawDir: string
  /** Copia local de cada objeto normalizado (auditoría). */
  outDir: string | null
}

const FLAGS = new Set(['all-provinces', 'download', 'write', 'verify', 'resume', 'upload-raw', 'catalog', 'no-geometry'])
const VALUES = new Set(['period', 'edition', 'provinces', 'municipalities', 'indicators', 'concurrency', 'manifest', 'raw-dir', 'out-dir'])

function parseArgs(argv: string[]): Cli {
  const vals = new Map<string, string>()
  const flags = new Set<string>()
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a)
    if (!m) throw new Error(`argumento no reconocido: ${a}`)
    if (m[2] !== undefined) {
      if (!VALUES.has(m[1])) throw new Error(`opción desconocida: --${m[1]}=`)
      vals.set(m[1], m[2])
    } else {
      if (!FLAGS.has(m[1])) throw new Error(`opción desconocida: --${m[1]}`)
      flags.add(m[1])
    }
  }
  const lista = (k: string) =>
    vals.get(k)?.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)

  const perTxt = vals.get('period') ?? '2024'
  const periods: number[] | 'all' =
    perTxt === 'all'
      ? 'all'
      : [...new Set(perTxt.split(',').map((s) => {
          if (!/^\d{4}$/.test(s.trim())) throw new Error(`--period inválido: ${s}`)
          return Number(s.trim())
        }))].sort((a, b) => a - b)
  const edition = Number(vals.get('edition') ?? '2024')
  if (!Number.isInteger(edition) || edition < 2021) throw new Error(`--edition inválido: ${vals.get('edition')}`)

  const municipalities = lista('municipalities')?.map(normalizarCodigoMunicipio) ?? null
  const provArg = lista('provinces')?.map(normalizarCodigoProvincia) ?? null
  const all = flags.has('all-provinces')
  const scopes = [all, !!provArg, !!municipalities].filter(Boolean).length
  if (scopes !== 1) throw new Error('indica exactamente uno: --all-provinces | --provinces=… | --municipalities=…')
  const scope: Cli['scope'] = all ? 'national' : provArg ? 'provinces' : 'municipalities'
  const provinces = all
    ? Object.keys(PROVINCES).sort()
    : provArg
      ? [...new Set(provArg)].sort()
      : [...new Set(municipalities!.map((m) => m.slice(0, 2)))].sort()
  for (const p of provinces) if (!PROVINCES[p]) throw new Error(`provincia ${p} sin tabla verificada`)

  const concurrency = Number(vals.get('concurrency') ?? '12')
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 64) throw new Error('--concurrency debe estar entre 1 y 64')
  const cli: Cli = {
    periods,
    edition,
    scope,
    provinces,
    municipalities: municipalities ? [...new Set(municipalities)].sort() : null,
    indicators: lista('indicators') ?? null,
    download: flags.has('download'),
    write: flags.has('write'),
    verify: flags.has('verify'),
    resume: flags.has('resume'),
    uploadRaw: flags.has('upload-raw'),
    catalog: flags.has('catalog'),
    geometry: !flags.has('no-geometry'),
    concurrency,
    manifest: vals.get('manifest') ?? null,
    rawDir: vals.get('raw-dir') ?? join('tmp', 'education-raw'),
    outDir: vals.get('out-dir') ?? null,
  }
  if (cli.indicators) {
    const ids = new Set(EDUCATION_INDICATORS.map((i) => i.id))
    for (const i of cli.indicators) if (!ids.has(i)) throw new Error(`indicador desconocido: ${i}`)
    if (cli.write) throw new Error('--indicators sólo se admite sin --write: un objeto parcial no puede sustituir al completo')
  }
  if (cli.verify && !cli.write && !cli.uploadRaw) throw new Error('--verify requiere --write o --upload-raw')
  if (cli.catalog && !cli.write) throw new Error('--catalog requiere --write')
  if (cli.catalog && cli.scope === 'national') throw new Error('--catalog sobra en la pasada nacional: el catálogo se escribe siempre')
  return cli
}

// ─────────────────────────────────────────────────────────────────────────────
// Ficheros locales (escritura atómica)
// ─────────────────────────────────────────────────────────────────────────────

function leerJson<T>(ruta: string): T | null {
  if (!existsSync(ruta)) return null
  return JSON.parse(readFileSync(ruta, 'utf8')) as T
}

function escribirAtomico(ruta: string, contenido: string | Buffer) {
  mkdirSync(dirname(ruta), { recursive: true })
  const tmp = `${ruta}.${process.pid}.tmp`
  writeFileSync(tmp, contenido)
  renameSync(tmp, ruta)
}

/** Objeto con claves ordenadas (para ficheros de estado legibles y estables). */
function ordenado<T>(o: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]))
}

// ─────────────────────────────────────────────────────────────────────────────
// Estado de los originales: primera fecha vista por SHA
// ─────────────────────────────────────────────────────────────────────────────

interface RawState {
  edition: number
  files: Record<string, { first_seen_at: string; province: string; table: number; bytes: number }>
}

const rawStatePath = (edition: number) => join(AUDIT_DIR, `raw-state-${edition}.json`)

function guardarRawState(edition: number, nuevos: RawState['files']) {
  // Se re-lee y se fusiona: otra ejecución pudo añadir entradas entretanto.
  const disco = leerJson<RawState>(rawStatePath(edition)) ?? { edition, files: {} }
  for (const [sha, v] of Object.entries(nuevos)) if (!disco.files[sha]) disco.files[sha] = v
  escribirAtomico(rawStatePath(edition), JSON.stringify({ edition, files: ordenado(disco.files) }, null, 2))
}

// ─────────────────────────────────────────────────────────────────────────────
// Descarga / lectura de los CSV oficiales
// ─────────────────────────────────────────────────────────────────────────────

interface FicheroFuente {
  province: string
  group: Grupo
  table: number
  url: string
  path: string
  sha256: string
  bytes: number
  first_seen_at: string
  origin: 'local' | 'descargado' | 'revalidado'
  bytes_downloaded: number
  raw_key: string
  raw_status: 'uploaded' | 'unchanged' | 'not_requested'
  raw_verified: boolean
}

async function fetchReintentos(url: string, init: RequestInit = {}, ms = 120000): Promise<Response> {
  return conReintentos(async () => {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), ms)
    try {
      const r = await fetch(url, { ...init, headers: { ...UA, ...(init.headers ?? {}) }, signal: ctl.signal })
      if (r.status >= 500 || r.status === 429) {
        throw Object.assign(new Error(`HTTP ${r.status} en ${url}`), { $metadata: { httpStatusCode: r.status } })
      }
      return r
    } finally {
      clearTimeout(t)
    }
  })
}

function validarCuerpoCsv(buf: Buffer, url: string) {
  if (buf.length === 0) throw new Error(`contenido vacío en ${url}`)
  const inicio = buf.subarray(0, 400).toString('utf8')
  if (/^\s*<(!doctype|html)/i.test(inicio)) throw new Error(`${url} devolvió HTML en lugar del CSV`)
  if (!inicio.includes('Secciones')) throw new Error(`${url} no tiene la cabecera esperada (Secciones)`)
}

async function asegurarFichero(
  group: Grupo,
  table: number,
  province: string,
  cli: Cli,
  rawState: RawState,
  nuevos: RawState['files'],
): Promise<{ f: FicheroFuente; buf: Buffer }> {
  const url = CSV_URL(table)
  const ruta = join(cli.rawDir, String(cli.edition), province, `${table}.csv`)
  let buf: Buffer | null = null
  let origin: FicheroFuente['origin'] = 'local'
  let bytesDescargados = 0

  if (existsSync(ruta)) {
    buf = readFileSync(ruta)
    if (cli.download) {
      const head = await fetchReintentos(url, { method: 'HEAD' })
      const remoto = Number(head.headers.get('content-length') ?? 0)
      if (head.status === 200 && remoto > 0 && remoto === buf.length) origin = 'revalidado'
      else buf = null
    }
  }
  if (!buf) {
    const r = await fetchReintentos(url)
    if (r.status !== 200) throw new Error(`HTTP ${r.status} al descargar ${url}`)
    const nuevo = Buffer.from(await r.arrayBuffer())
    validarCuerpoCsv(nuevo, url)
    escribirAtomico(ruta, nuevo)
    buf = nuevo
    origin = 'descargado'
    bytesDescargados = nuevo.length
  } else {
    validarCuerpoCsv(buf, ruta)
  }

  const sha = sha256(buf)
  let visto = rawState.files[sha] ?? nuevos[sha]
  if (!visto) {
    // Primera vez que se ve este contenido: fecha de descarga (mtime si ya estaba en disco).
    const fecha = origin === 'descargado' ? new Date().toISOString() : statSync(ruta).mtime.toISOString()
    visto = { first_seen_at: fecha, province, table, bytes: buf.length }
    nuevos[sha] = visto
  }
  return {
    buf,
    f: {
      province,
      group,
      table,
      url,
      path: ruta.replace(/\\/g, '/'),
      sha256: sha,
      bytes: buf.length,
      first_seen_at: visto.first_seen_at,
      origin,
      bytes_downloaded: bytesDescargados,
      raw_key: `${EDUCATION_R2_PREFIX}/raw/${cli.edition}/${province}/${table}.csv`,
      raw_status: 'not_requested',
      raw_verified: false,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// R2
// ─────────────────────────────────────────────────────────────────────────────

function clienteR2(): S3Client {
  const account = process.env.R2_ACCOUNT_ID
  const key = process.env.R2_ACCESS_KEY_ID
  const secret = process.env.R2_SECRET_ACCESS_KEY
  if (!account || !key || !secret) throw new Error('faltan R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY en .env.local')
  return new S3Client({
    region: 'auto',
    endpoint: `https://${account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: key, secretAccessKey: secret },
    maxAttempts: 1, // los reintentos los gestiona conReintentos()
  })
}

function bucket(): string {
  const b = process.env.R2_BUCKET
  if (!b) throw new Error('falta R2_BUCKET en .env.local')
  return b
}

/** Misma base pública que src/lib/socideas-secciones-education-store.ts (educationR2Base). */
const R2_PUBLIC_FALLBACK = 'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'
const publicUrl = (key: string) => {
  const base = process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE || R2_PUBLIC_FALLBACK
  return `${base.replace(/\/+$/, '')}/${key}`
}

/** Salvaguarda: este cargador sólo escribe bajo su prefijo. */
function comprobarPrefijo(key: string) {
  if (!key.startsWith(`${EDUCATION_R2_PREFIX}/`)) throw new Error(`clave fuera del prefijo de educación: ${key}`)
}

interface Contadores {
  put: number
  head: number
  get: number
}
const R2_OPS: Contadores = { put: 0, head: 0, get: 0 }

async function headObjeto(r2: S3Client, key: string): Promise<{ metadata: Record<string, string>; length: number } | null> {
  try {
    R2_OPS.head++
    const r = await conReintentos(() => r2.send(new HeadObjectCommand({ Bucket: bucket(), Key: key })), {
      reintentable: (e) => {
        const s = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
        return s !== 404 && s !== 403 && (s === undefined || s >= 500 || s === 429)
      },
    })
    return { metadata: r.Metadata ?? {}, length: r.ContentLength ?? -1 }
  } catch (e) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } }
    if (err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null
    throw e
  }
}

async function getObjeto(r2: S3Client, key: string): Promise<{ body: Buffer; metadata: Record<string, string> }> {
  R2_OPS.get++
  return conReintentos(async () => {
    const r = await r2.send(new GetObjectCommand({ Bucket: bucket(), Key: key }))
    const bytes = await r.Body!.transformToByteArray()
    return { body: Buffer.from(bytes), metadata: r.Metadata ?? {} }
  })
}

async function putObjeto(r2: S3Client, key: string, body: string | Buffer, contentType: string, metadata: Record<string, string>) {
  comprobarPrefijo(key)
  R2_OPS.put++
  await conReintentos(() =>
    r2.send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType, Metadata: metadata })),
  )
}

/**
 * Publica un JSON sólo si su content-sha256 cambió (HeadObject). Con verify,
 * relee el objeto: SHA del cuerpo exacto contra el metadato body-sha256 (y
 * contra el cuerpo local si se acaba de escribir) y huella de contenido
 * recalculada contra el metadato content-sha256.
 */
async function publicarJson(
  r2: S3Client,
  key: string,
  body: string,
  contentSha: string,
  verify: boolean,
  recalcular: (cuerpo: string) => string,
): Promise<'written' | 'unchanged'> {
  comprobarPrefijo(key)
  const bodySha = sha256(body)
  const head = await headObjeto(r2, key)
  let estado: 'written' | 'unchanged' = 'unchanged'
  if (!head || head.metadata['content-sha256'] !== contentSha) {
    await putObjeto(r2, key, body, 'application/json; charset=utf-8', {
      'content-sha256': contentSha,
      'body-sha256': bodySha,
      'parser-version': PARSER_VERSION,
    })
    estado = 'written'
  }
  if (verify) {
    const leido = await getObjeto(r2, key)
    const shaLeido = sha256(leido.body)
    if (leido.metadata['content-sha256'] !== contentSha) {
      throw new Error(`verify ${key}: metadato content-sha256 ${leido.metadata['content-sha256']} ≠ ${contentSha}`)
    }
    if (leido.metadata['body-sha256'] !== shaLeido) {
      throw new Error(`verify ${key}: SHA del cuerpo ${shaLeido} ≠ metadato body-sha256 ${leido.metadata['body-sha256']}`)
    }
    if (estado === 'written' && shaLeido !== bodySha) {
      throw new Error(`verify ${key}: cuerpo releído ${shaLeido} ≠ cuerpo enviado ${bodySha}`)
    }
    const recalculado = recalcular(leido.body.toString('utf8'))
    if (recalculado !== contentSha) throw new Error(`verify ${key}: huella recalculada ${recalculado} ≠ ${contentSha}`)
  }
  return estado
}

async function subirRaw(r2: S3Client, f: FicheroFuente, buf: Buffer, verify: boolean) {
  const head = await headObjeto(r2, f.raw_key)
  if (head && head.metadata.sha256 === f.sha256 && head.length === f.bytes) {
    f.raw_status = 'unchanged'
  } else {
    await putObjeto(r2, f.raw_key, buf, 'text/tab-separated-values; charset=utf-8', {
      sha256: f.sha256,
      'source-url': f.url,
      'first-seen-at': f.first_seen_at,
    })
    f.raw_status = 'uploaded'
  }
  if (verify) {
    const leido = await getObjeto(r2, f.raw_key)
    const s = sha256(leido.body)
    if (s !== f.sha256 || leido.metadata.sha256 !== f.sha256) {
      throw new Error(`verify ${f.raw_key}: SHA releído ${s} / metadato ${leido.metadata.sha256} ≠ ${f.sha256}`)
    }
    f.raw_verified = true
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Checkpoint: municipio → content_sha256 escrito y verificado
// ─────────────────────────────────────────────────────────────────────────────

interface Checkpoint {
  period: number
  entries: Record<string, { content_sha256: string; body_sha256: string; bytes: number; verified_at: string }>
}
const checkpointPath = (period: number) => join(AUDIT_DIR, `checkpoint-${period}.json`)

function guardarCheckpoint(cp: Checkpoint) {
  const disco = leerJson<Checkpoint>(checkpointPath(cp.period)) ?? { period: cp.period, entries: {} }
  const entries = { ...disco.entries, ...cp.entries }
  cp.entries = entries
  escribirAtomico(checkpointPath(cp.period), JSON.stringify({ period: cp.period, entries: ordenado(entries) }, null, 1))
}

// ─────────────────────────────────────────────────────────────────────────────
// Índice CUSEC de la geometría INE (WFS, sólo atributos)
// ─────────────────────────────────────────────────────────────────────────────

interface MetaIndice {
  collection: string
  source: string
  provinces: Record<string, { features: number; sections: number; district_aggregates: number; number_matched: number | null; invalid: number; fetched_at: string }>
}
interface IndiceGeo {
  year: number
  index: Record<string, string[]>
  meta: MetaIndice
}
const indicePath = (y: number) => join(GEOMETRY_INDEX_DIR, `cusec-index-${y}.json`)
const indiceMetaPath = (y: number) => join(GEOMETRY_INDEX_DIR, `cusec-index-${y}.meta.json`)

function cargarIndice(year: number): IndiceGeo {
  const index = leerJson<Record<string, string[]>>(indicePath(year)) ?? {}
  const ajenas = Object.keys(index).filter((k) => !/^\d{5}$/.test(k) || !Array.isArray(index[k]))
  // Nunca se fusiona con un fichero de otro esquema: se falla antes de escribir.
  if (ajenas.length) throw new Error(`${indicePath(year)} no tiene el formato {ine: [cusec…]} (claves ${ajenas.slice(0, 3).join(',')})`)
  return {
    year,
    index,
    meta: leerJson<MetaIndice>(indiceMetaPath(year)) ?? {
      collection: `WMS_INE_SECCIONES_G01:Secciones_${year}`,
      source: 'https://www.ine.es/geoserver/WMS_INE_SECCIONES_G01/wfs (GetFeature, propertyName=CUSEC,CUMUN,CPRO, CQL CPRO)',
      provinces: {},
    },
  }
}

async function asegurarIndiceProvincia(idx: IndiceGeo, pc: string): Promise<void> {
  if (idx.meta.provinces[pc]) return
  const PAGE = 5000
  const features: Array<{ properties?: Record<string, unknown> }> = []
  let matched: number | null = null
  for (let start = 0; start < 200000; ) {
    const r = await fetchReintentos(urlIndiceProvincia(idx.year, pc, start, PAGE), { headers: { Accept: 'application/json' } }, 90000)
    if (r.status !== 200) throw new Error(`WFS ${idx.year}/${pc}: HTTP ${r.status}`)
    const j = (await r.json()) as { features?: Array<{ properties?: Record<string, unknown> }>; numberMatched?: number }
    const lote = Array.isArray(j.features) ? j.features : []
    if (typeof j.numberMatched === 'number') matched = j.numberMatched
    features.push(...lote)
    start += lote.length
    if (lote.length === 0 || (matched !== null && features.length >= matched) || lote.length < PAGE) break
  }
  if (matched !== null && features.length !== matched) {
    throw new Error(`WFS ${idx.year}/${pc}: paginación incompleta ${features.length}/${matched}`)
  }
  const r = indiceDesdeFeatures(features, pc)
  if (r.sections === 0) throw new Error(`WFS ${idx.year}/${pc}: 0 secciones`)
  // Se re-lee del disco y se fusiona por provincia (otra ejecución pudo escribir).
  const disco = cargarIndice(idx.year)
  for (const k of Object.keys(disco.index)) if (k.startsWith(pc)) delete disco.index[k]
  Object.assign(disco.index, r.index)
  disco.meta.provinces[pc] = {
    features: r.features,
    sections: r.sections,
    district_aggregates: r.district_aggregates,
    number_matched: matched,
    invalid: r.invalid.length,
    fetched_at: new Date().toISOString(),
  }
  escribirAtomico(indicePath(idx.year), JSON.stringify(ordenado(disco.index)))
  escribirAtomico(indiceMetaPath(idx.year), JSON.stringify({ ...disco.meta, provinces: ordenado(disco.meta.provinces) }, null, 2))
  idx.index = disco.index
  idx.meta = disco.meta
}

// ─────────────────────────────────────────────────────────────────────────────
// Acumuladores por periodo
// ─────────────────────────────────────────────────────────────────────────────

interface ProvinciaPeriodo {
  province: string
  status: 'ok' | 'failed'
  error: string | null
  municipalities: number
  sections: number
}

interface AcumPeriodo {
  period: number
  provincias: ProvinciaPeriodo[]
  resumenes: ResumenMunicipio[]
  shas: Record<string, string>
  detected: number
  notInPeriod: string[]
  allNd: string[]
  failedMunicipalities: string[]
  writeFailures: string[]
  written: number
  unchanged: number
  skipped: number
  sectionsExcluded: number
  sectionsWithData: number
  sectionsSuppressed: number
  bytesNormalized: number
  geometria: {
    collection: string
    enabled: boolean
    errors: string[]
    provinces_indexed: string[]
    by_municipality: Record<string, { m: number; u: number; g: number; x: number; xg: number }>
    anomalies: Array<{ municipality: string; unmatched: string[]; geometry_only: string[]; excluded_with_geometry: string[] }>
  }
}

function nuevoAcum(period: number, geometry: boolean): AcumPeriodo {
  return {
    period,
    provincias: [],
    resumenes: [],
    shas: {},
    detected: 0,
    notInPeriod: [],
    allNd: [],
    failedMunicipalities: [],
    writeFailures: [],
    written: 0,
    unchanged: 0,
    skipped: 0,
    sectionsExcluded: 0,
    sectionsWithData: 0,
    sectionsSuppressed: 0,
    bytesNormalized: 0,
    geometria: {
      collection: `WMS_INE_SECCIONES_G01:Secciones_${period}`,
      enabled: geometry,
      errors: [],
      provinces_indexed: [],
      by_municipality: {},
      anomalies: [],
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Proceso de una provincia
// ─────────────────────────────────────────────────────────────────────────────

const normKey = (period: number, ine: string) => `${EDUCATION_R2_PREFIX}/normalized/${period}/${ine}.json`

function recalcularMunicipal(cuerpo: string): string {
  const o = JSON.parse(cuerpo) as EducationMunicipalObject
  if (!isEducationMunicipalObject(o)) return 'objeto-no-valido'
  return huellaSin(o, 'content_sha256')
}

async function procesarProvincia(
  pc: string,
  cli: Cli,
  ctx: {
    r2: S3Client | null
    rawState: RawState
    rawNuevos: RawState['files']
    ficheros: FicheroFuente[]
    acums: Map<number, AcumPeriodo>
    periodosFuente: Set<number>
    checkpoints: Map<number, Checkpoint>
    indices: Map<number, IndiceGeo>
    activos: Set<string> | null
  },
): Promise<void> {
  const def = PROVINCES[pc]
  const filtro = cli.municipalities ? new Set(cli.municipalities.filter((m) => m.startsWith(pc))) : null
  const fallarTodo = (msg: string) => {
    const periodos = cli.periods === 'all' ? [...ctx.acums.keys()] : cli.periods
    for (const p of periodos) {
      const a = ctx.acums.get(p) ?? nuevoAcum(p, cli.geometry)
      ctx.acums.set(p, a)
      a.provincias.push({ province: pc, status: 'failed', error: msg, municipalities: 0, sections: 0 })
    }
    log(`${pc} ${def.provincia}: ERROR ${msg}`)
  }

  // 1) Originales
  const bufs: Partial<Record<Grupo, Buffer>> = {}
  const fs: Partial<Record<Grupo, FicheroFuente>> = {}
  try {
    for (const [g, t] of [['formacion', def.formacion], ['actividad', def.actividad]] as const) {
      const { f, buf } = await asegurarFichero(g, t, pc, cli, ctx.rawState, ctx.rawNuevos)
      bufs[g] = buf
      fs[g] = f
      ctx.ficheros.push(f)
    }
  } catch (e) {
    return fallarTodo(`descarga: ${(e as Error).message}`)
  }
  if (cli.uploadRaw && ctx.r2) {
    try {
      for (const g of ['formacion', 'actividad'] as const) await subirRaw(ctx.r2, fs[g]!, bufs[g]!, cli.verify)
    } catch (e) {
      return fallarTodo(`raw: ${(e as Error).message}`)
    }
  }

  // 2) Parseo (fail-closed)
  let tE: TablaParseada
  let tA: TablaParseada
  const pedidos = cli.periods === 'all' ? null : new Set(cli.periods)
  try {
    tE = parsearTablaTexto(bufs.formacion!.toString('utf8'), 'formacion', pedidos, `${def.formacion}.csv`)
    tA = parsearTablaTexto(bufs.actividad!.toString('utf8'), 'actividad', pedidos, `${def.actividad}.csv`)
  } catch (e) {
    return fallarTodo(`parseo: ${(e as Error).message}`)
  }
  delete bufs.formacion
  delete bufs.actividad
  if (tE.periodosEnFuente.join(',') !== tA.periodosEnFuente.join(',')) {
    return fallarTodo(`periodos distintos entre tablas: ${tE.periodosEnFuente} / ${tA.periodosEnFuente}`)
  }
  for (const p of tE.periodosEnFuente) ctx.periodosFuente.add(p)
  const periodos = cli.periods === 'all' ? tE.periodosEnFuente : cli.periods
  for (const p of periodos) if (!ctx.acums.has(p)) ctx.acums.set(p, nuevoAcum(p, cli.geometry))

  for (const periodo of periodos) {
    const acum = ctx.acums.get(periodo)!
    const t0 = Date.now()
    if (!tE.periodosEnFuente.includes(periodo)) {
      acum.provincias.push({ province: pc, status: 'failed', error: `periodo ${periodo} ausente de la columna Periodo`, municipalities: 0, sections: 0 })
      continue
    }
    const grupos = agruparPorMunicipio(tE.porPeriodo.get(periodo), tA.porPeriodo.get(periodo), filtro, ctx.activos)
    const errores: string[] = []
    if (filtro) for (const m of filtro) if (!grupos.has(m)) errores.push(`${m}: el municipio no aparece en la fuente`)

    const retrievedAt = [fs.formacion!.first_seen_at, fs.actividad!.first_seen_at].sort().at(-1)!
    const indicadores = EDUCATION_INDICATORS.filter((i) => !ctx.activos || ctx.activos.has(i.id)).map((i) => i.id)
    const objetos: EducationMunicipalObject[] = []
    const excluidasPor = new Map<string, string[]>()
    for (const g of grupos.values()) {
      acum.detected++
      acum.sectionsExcluded += g.excluidas.length
      if (g.secciones.length === 0) {
        acum.notInPeriod.push(g.code)
        continue
      }
      excluidasPor.set(g.code, g.excluidas)
      const o = construirMunicipio({
        period: periodo,
        municipality_code: g.code,
        municipality_name: g.name,
        province_code: pc,
        parser_version: PARSER_VERSION,
        mapping_version: MAPPING_VERSION,
        source: {
          url: SRC_URL,
          operation: OPERATION,
          education_table: def.formacion,
          activity_table: def.actividad,
          education_sha256: fs.formacion!.sha256,
          activity_sha256: fs.actividad!.sha256,
          retrieved_at: retrievedAt,
        },
        secciones: g.secciones,
        indicadores,
        excluidas: g.excluidas,
        incidenciasCruce: g.incidencias,
      })
      if (!validacionSuperada(o)) errores.push(`${o.municipality_code}: ${o.validation.issues.slice(0, 3).join(' | ')}`)
      objetos.push(o)
    }
    const obs = objetos.reduce((a, o) => a + o.coverage.observations, 0)
    if (objetos.length > 0 && obs === 0) errores.push('hay secciones pero se generaron 0 indicadores')
    if (!filtro && objetos.length === 0) errores.push('la provincia no produjo ningún municipio')

    if (errores.length) {
      acum.provincias.push({ province: pc, status: 'failed', error: errores.slice(0, 5).join('; '), municipalities: 0, sections: 0 })
      acum.failedMunicipalities.push(...objetos.map((o) => o.municipality_code))
      log(`${pc} ${def.provincia} ${periodo}: GATE FALLIDO — ${errores.slice(0, 3).join('; ')}`)
      continue
    }

    // 3) Cobertura geométrica (no altera el objeto: sólo el manifiesto)
    if (cli.geometry) {
      try {
        let idx = ctx.indices.get(periodo)
        if (!idx) ctx.indices.set(periodo, (idx = cargarIndice(periodo)))
        await asegurarIndiceProvincia(idx, pc)
        acum.geometria.provinces_indexed.push(pc)
        for (const o of objetos) {
          const c: CoberturaMunicipio = coberturaGeometrica(
            o.sections.map((s) => s.sectionCode),
            idx.index[o.municipality_code],
            excluidasPor.get(o.municipality_code) ?? [],
          )
          acum.geometria.by_municipality[o.municipality_code] = { m: c.matched, u: c.unmatched, g: c.geometry_only, x: c.excluded, xg: c.excluded_with_geometry }
          if (c.unmatched || c.geometry_only || c.excluded_with_geometry) {
            acum.geometria.anomalies.push({
              municipality: o.municipality_code,
              unmatched: c.unmatched_codes,
              geometry_only: c.geometry_only_codes,
              excluded_with_geometry: c.excluded_with_geometry_codes,
            })
          }
        }
      } catch (e) {
        acum.geometria.errors.push(`${pc}: ${(e as Error).message}`)
      }
    }

    // 4) Escritura
    if (cli.outDir) {
      for (const o of objetos) escribirAtomico(join(cli.outDir, String(periodo), `${o.municipality_code}.json`), JSON.stringify(o))
    }
    let written = 0
    let unchanged = 0
    let skipped = 0
    if (cli.write && ctx.r2) {
      let cp = ctx.checkpoints.get(periodo)
      if (!cp) ctx.checkpoints.set(periodo, (cp = leerJson<Checkpoint>(checkpointPath(periodo)) ?? { period: periodo, entries: {} }))
      const checkpoint = cp
      await mapPool(objetos, cli.concurrency, async (o) => {
        const key = normKey(periodo, o.municipality_code)
        const body = JSON.stringify(o)
        const previo = checkpoint.entries[o.municipality_code]
        if (cli.resume && previo && previo.content_sha256 === o.content_sha256) {
          skipped++
          acum.bytesNormalized += Buffer.byteLength(body)
          return
        }
        try {
          const estado = await publicarJson(ctx.r2!, key, body, o.content_sha256, cli.verify, recalcularMunicipal)
          if (estado === 'written') written++
          else unchanged++
          acum.bytesNormalized += Buffer.byteLength(body)
          if (cli.verify) {
            checkpoint.entries[o.municipality_code] = {
              content_sha256: o.content_sha256,
              body_sha256: sha256(body),
              bytes: Buffer.byteLength(body),
              verified_at: new Date().toISOString(),
            }
          }
        } catch (e) {
          acum.writeFailures.push(`${o.municipality_code}: ${(e as Error).message}`)
          acum.failedMunicipalities.push(o.municipality_code)
        }
      })
      guardarCheckpoint(checkpoint)
    }
    acum.written += written
    acum.unchanged += unchanged
    acum.skipped += skipped

    // 5) Resúmenes
    let secciones = 0
    for (const o of objetos) {
      acum.shas[o.municipality_code] = o.content_sha256
      secciones += o.coverage.result_sections
      acum.sectionsWithData += o.coverage.sections_with_data
      acum.sectionsSuppressed += o.coverage.sections_suppressed
      if (!tieneDatos(o)) acum.allNd.push(o.municipality_code)
      acum.resumenes.push({
        code: o.municipality_code,
        province: pc,
        has_data: tieneDatos(o),
        availability: o.indicator_availability,
        sections: o.coverage.result_sections,
        observations: o.coverage.observations,
        nd: o.coverage.nd,
        suppressed: o.coverage.suppressed,
      })
    }
    acum.provincias.push({ province: pc, status: 'ok', error: null, municipalities: objetos.length, sections: secciones })
    const w = cli.write ? ` · PUT ${written} · unchanged ${unchanged} · checkpoint ${skipped}` : ''
    log(`${pc} ${def.provincia} ${periodo}: ${objetos.length} municipios · ${secciones} secciones${w} (${Date.now() - t0} ms)`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Manifiesto y catálogo
// ─────────────────────────────────────────────────────────────────────────────

function construirManifiesto(cli: Cli, a: AcumPeriodo, ficheros: FicheroFuente[], periodosFuente: number[], run: Record<string, unknown>) {
  const ok = a.provincias.filter((p) => p.status === 'ok')
  const fallidas = a.provincias.filter((p) => p.status === 'failed')
  const obs = a.resumenes.reduce((s, r) => s + r.observations, 0)
  const nd = a.resumenes.reduce((s, r) => s + r.nd, 0)
  const sup = a.resumenes.reduce((s, r) => s + r.suppressed, 0)
  const secciones = a.resumenes.reduce((s, r) => s + r.sections, 0)
  const bm = Object.values(a.geometria.by_municipality)
  const rawEnR2 = ficheros.filter((f) => f.raw_status !== 'not_requested')
  const cuerpo = {
    kind: 'education-manifest',
    schema_version: EDUCATION_SCHEMA_VERSION,
    period: a.period,
    edition: cli.edition,
    parser_version: PARSER_VERSION,
    mapping_version: MAPPING_VERSION,
    scope: cli.scope,
    municipalities_filter: cli.municipalities,
    dry_run: !cli.write,
    periods_in_source: periodosFuente,
    source: { url: SRC_URL, index_url: INDEX_URL, operation: OPERATION, organism: ORGANISM },
    territories: {
      expected: EXPECTED_TERRITORIES,
      requested: cli.provinces.length,
      processed: ok.length,
      failed: fallidas.map((p) => ({ province: p.province, error: p.error })),
      by_province: a.provincias
        .slice()
        .sort((x, y) => x.province.localeCompare(y.province))
        .map((p) => ({ ...p, province_name: PROVINCES[p.province]?.provincia ?? null })),
    },
    tables: ficheros.length,
    files: ficheros
      .slice()
      .sort((x, y) => (x.province + x.table).localeCompare(y.province + y.table))
      .map((f) => ({
        province: f.province,
        province_name: PROVINCES[f.province]?.provincia ?? null,
        group: f.group,
        table: f.table,
        url: f.url,
        sha256: f.sha256,
        bytes: f.bytes,
        first_seen_at: f.first_seen_at,
        raw_key: f.raw_key,
        raw_url: publicUrl(f.raw_key),
      })),
    bytes_source: ficheros.reduce((s, f) => s + f.bytes, 0),
    municipalities: {
      detected: a.detected,
      published: a.resumenes.length,
      with_data: a.resumenes.filter((r) => r.has_data).length,
      all_nd: a.allNd.slice().sort(),
      not_in_period: a.notInPeriod.slice().sort(),
      failed: [...new Set(a.failedMunicipalities)].sort(),
    },
    sections: {
      published: secciones,
      with_data: a.sectionsWithData,
      suppressed: a.sectionsSuppressed,
      excluded_not_in_period: a.sectionsExcluded,
    },
    indicators: EDUCATION_INDICATORS.filter((i) => !cli.indicators || cli.indicators.includes(i.id)).length,
    observations: obs,
    nd,
    suppressed: sup,
    normalized_prefix: `${EDUCATION_R2_PREFIX}/normalized/${a.period}/`,
    normalized_url_template: publicUrl(`${EDUCATION_R2_PREFIX}/normalized/${a.period}/{ine}.json`),
    /** SHA-256 del mapa canónico municipio → content_sha256: cambia si cambia cualquier objeto. */
    normalized_set_sha256: sha256(canonicalJson(a.shas)),
    bytes_stored: {
      normalized: cli.write ? a.bytesNormalized : null,
      raw: rawEnR2.length ? rawEnR2.reduce((s, f) => s + f.bytes, 0) : null,
      raw_files: rawEnR2.length,
    },
    geometry_coverage: {
      collection: a.geometria.collection,
      enabled: a.geometria.enabled,
      index_file: indicePath(a.period).replace(/\\/g, '/'),
      provinces_indexed: a.geometria.provinces_indexed.slice().sort(),
      errors: a.geometria.errors,
      municipalities_checked: bm.length,
      matched: bm.reduce((s, x) => s + x.m, 0),
      unmatched: bm.reduce((s, x) => s + x.u, 0),
      geometry_only: bm.reduce((s, x) => s + x.g, 0),
      excluded_not_in_period: bm.reduce((s, x) => s + x.x, 0),
      excluded_with_geometry: bm.reduce((s, x) => s + x.xg, 0),
      anomalies: a.geometria.anomalies.slice().sort((x, y) => x.municipality.localeCompare(y.municipality)),
      /** m=matched, u=publicadas sin geometría, g=geometría sin fila, x=excluidas, xg=excluidas con geometría. */
      by_municipality: ordenado(a.geometria.by_municipality),
    },
  }
  const content_sha256 = sha256(canonicalJson(cuerpo))
  return { ...cuerpo, content_sha256, synced_at: new Date().toISOString(), run }
}

const recalcularManifiesto = (cuerpo: string) => {
  const o = JSON.parse(cuerpo) as Record<string, unknown>
  delete o.content_sha256
  delete o.synced_at
  delete o.run
  return sha256(canonicalJson(o))
}
const recalcularCatalogo = (cuerpo: string) => huellaSin(JSON.parse(cuerpo) as EducationCatalog, 'synced_at')
const recalcularPlano = (cuerpo: string) => sha256(canonicalJson(JSON.parse(cuerpo)))

function rutaManifiestoLocal(cli: Cli, period: number): string {
  if (cli.manifest) {
    const multi = cli.periods === 'all' || cli.periods.length > 1
    return multi ? cli.manifest.replace(/(\.json)?$/, `-${period}.json`) : cli.manifest
  }
  if (cli.scope === 'national') return join(AUDIT_DIR, `manifest-${period}.json`)
  if (cli.scope === 'municipalities') return join(AUDIT_DIR, `manifest-${period}-municipios.json`)
  return join(AUDIT_DIR, 'batches', `manifest-${period}-provincias-${cli.provinces[0]}-${cli.provinces.at(-1)}-n${cli.provinces.length}.json`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Principal
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const cli = parseArgs(process.argv.slice(2))
  const inicio = new Date()
  const activos = cli.indicators ? new Set(cli.indicators) : null
  log(`periodos: ${cli.periods === 'all' ? 'todos los de la fuente' : cli.periods.join(',')} · edición ${cli.edition} · ámbito ${cli.scope}`)
  log(`provincias: ${cli.provinces.length}${cli.municipalities ? ` · municipios: ${cli.municipalities.join(',')}` : ''}`)
  log(`R2: ${cli.write ? 'escritura' : 'dry-run'}${cli.verify ? ' + verify' : ''}${cli.resume ? ' + resume' : ''}${cli.uploadRaw ? ' + raw' : ''} · concurrencia ${cli.concurrency}`)

  const r2 = cli.write || cli.uploadRaw ? clienteR2() : null
  const rawState = leerJson<RawState>(rawStatePath(cli.edition)) ?? { edition: cli.edition, files: {} }
  const ctx = {
    r2,
    rawState,
    rawNuevos: {} as RawState['files'],
    ficheros: [] as FicheroFuente[],
    acums: new Map<number, AcumPeriodo>(),
    periodosFuente: new Set<number>(),
    checkpoints: new Map<number, Checkpoint>(),
    indices: new Map<number, IndiceGeo>(),
    activos,
  }
  if (cli.periods !== 'all') for (const p of cli.periods) ctx.acums.set(p, nuevoAcum(p, cli.geometry))

  for (const pc of cli.provinces) {
    await procesarProvincia(pc, cli, ctx)
    if (Object.keys(ctx.rawNuevos).length) guardarRawState(cli.edition, ctx.rawNuevos)
  }

  const periodosFuente = [...ctx.periodosFuente].sort((a, b) => a - b)
  const periodos = [...ctx.acums.keys()].sort((a, b) => a - b)
  const periodosOk = periodos.filter((p) => {
    const a = ctx.acums.get(p)!
    return a.provincias.length === cli.provinces.length && a.provincias.every((x) => x.status === 'ok') && a.writeFailures.length === 0
  })
  let fallo = false
  const resumenFinal: string[] = []

  // ── Manifiestos por periodo ────────────────────────────────────────────────
  for (const p of periodos) {
    const a = ctx.acums.get(p)!
    const fallidas = a.provincias.filter((x) => x.status === 'failed')
    if (fallidas.length || a.writeFailures.length || a.geometria.errors.length) fallo = true
    const run = {
      started_at: inicio.toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - inicio.getTime(),
      command: `npx tsx scripts/load-section-education.ts ${process.argv.slice(2).join(' ')}`,
      written: a.written,
      unchanged: a.unchanged,
      skipped_checkpoint: a.skipped,
      write_failures: a.writeFailures,
      bytes_downloaded: ctx.ficheros.reduce((s, f) => s + f.bytes_downloaded, 0),
      files_origin: Object.fromEntries(ctx.ficheros.map((f) => [`${f.province}/${f.table}`, f.origin])),
      raw_uploaded: ctx.ficheros.filter((f) => f.raw_status === 'uploaded').length,
      raw_unchanged: ctx.ficheros.filter((f) => f.raw_status === 'unchanged').length,
      raw_verified: ctx.ficheros.filter((f) => f.raw_verified).length,
    }
    const man = construirManifiesto(cli, a, ctx.ficheros, periodosFuente, run)
    const ruta = rutaManifiestoLocal(cli, p)
    escribirAtomico(ruta, JSON.stringify(man, null, 2))
    log(`manifiesto local ${p}: ${ruta.replace(/\\/g, '/')}`)
    if (cli.scope === 'national' && cli.write && r2) {
      const key = `${EDUCATION_R2_PREFIX}/manifests/${p}.json`
      const estado = await publicarJson(r2, key, JSON.stringify(man, null, 2), man.content_sha256, cli.verify, recalcularManifiesto)
      log(`manifiesto R2 ${key}: ${estado}`)
    }
    resumenFinal.push(
      `${p}: provincias ${a.provincias.filter((x) => x.status === 'ok').length}/${cli.provinces.length} · municipios ${man.municipalities.published} (con dato ${man.municipalities.with_data}, all_nd ${man.municipalities.all_nd.length}) · secciones ${man.sections.published} (excluidas ${man.sections.excluded_not_in_period}) · obs ${man.observations} · ND ${man.nd} · supr ${man.suppressed}` +
        (cli.write ? ` · PUT ${a.written} · unchanged ${a.unchanged} · checkpoint ${a.skipped}` : '') +
        (cli.geometry ? ` · geo m=${man.geometry_coverage.matched} u=${man.geometry_coverage.unmatched} g=${man.geometry_coverage.geometry_only} xg=${man.geometry_coverage.excluded_with_geometry}` : ''),
    )
    for (const f of fallidas) resumenFinal.push(`   provincia ${f.province} FALLIDA: ${f.error}`)
    for (const f of a.writeFailures.slice(0, 10)) resumenFinal.push(`   escritura FALLIDA: ${f}`)
    for (const f of a.geometria.errors) resumenFinal.push(`   geometría FALLIDA: ${f}`)
  }

  // ── Catálogo e indicators.json ─────────────────────────────────────────────
  const escribirCatalogo = cli.write && r2 && (cli.catalog || cli.scope === 'national')
  if (escribirCatalogo) {
    if (periodosOk.length === 0 || (cli.scope === 'national' && periodosOk.length !== periodos.length)) {
      resumenFinal.push('catálogo NO escrito: hay periodos con fallos')
      fallo = true
    } else {
      const periodo = periodosOk.at(-1)!
      const a = ctx.acums.get(periodo)!
      const provincias: ProvinciaCatalogo[] = a.provincias.map((x) => ({
        code: x.province,
        formacion: PROVINCES[x.province].formacion,
        actividad: PROVINCES[x.province].actividad,
        ok: x.status === 'ok',
      }))
      const cat = construirCatalogo({
        period: periodo,
        periods: periodosOk,
        parserVersion: PARSER_VERSION,
        mappingVersion: MAPPING_VERSION,
        source: { url: SRC_URL, index_url: INDEX_URL, operation: OPERATION, label: SRC_LABEL, organism: ORGANISM, licence: LICENCE },
        provincias,
        resumenes: a.resumenes,
        exclusiones: mapping.not_publishable,
        geometry: {
          join_key: 'CUSEC',
          source: `INE · seccionado censal Secciones_{period} (WMS_INE_SECCIONES_G01). Servida por el atlas base socideas/secciones/v1/municipal/{ine}.json cuando existe y, si no, por /api/socideas/secciones/{ine} desde el INE.`,
          note:
            'Los objetos educativos no contienen geometría: se unen por CUSEC de 10 dígitos con la geometría del atlas o del INE del mismo año, sin duplicarla. Las secciones que el INE publica sin valor ("") para un periodo no pertenecen al seccionado de ese año y se excluyen del objeto.',
        },
        syncedAt: new Date().toISOString(),
      })
      const catSha = huellaSin(cat, 'synced_at')
      const e1 = await publicarJson(r2, `${EDUCATION_R2_PREFIX}/catalog.json`, JSON.stringify(cat, null, 2), catSha, cli.verify, recalcularCatalogo)
      const ind = construirIndicatorsJson(MAPPING_VERSION)
      const indSha = sha256(canonicalJson(ind))
      const e2 = await publicarJson(r2, `${EDUCATION_R2_PREFIX}/indicators.json`, JSON.stringify(ind, null, 2), indSha, cli.verify, recalcularPlano)
      escribirAtomico(join(AUDIT_DIR, cli.scope === 'national' ? 'catalog.json' : 'catalog-muestra.json'), JSON.stringify(cat, null, 2))
      resumenFinal.push(`catálogo: ${e1} (periodo ${periodo}, periodos ${periodosOk.join(',')}, ${cat.municipalities.length} municipios con dato) · indicators.json: ${e2}`)
    }
  }

  console.log('\n=== education: resumen ===')
  for (const l of resumenFinal) console.log(l)
  if (periodosFuente.length) console.log(`periodos presentes en la fuente: ${periodosFuente.join(',')}`)
  if (r2) console.log(`operaciones R2: PUT ${R2_OPS.put} · HEAD ${R2_OPS.head} · GET ${R2_OPS.get}`)
  if (fallo) {
    const fallidas = [...new Set(periodos.flatMap((p) => ctx.acums.get(p)!.provincias.filter((x) => x.status === 'failed').map((x) => x.province)))]
    if (fallidas.length) console.log(`Reintentar SOLO esas provincias con --provinces=${fallidas.join(',')}`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('[education] ERROR:', (err as Error).message)
  process.exit(1)
})
