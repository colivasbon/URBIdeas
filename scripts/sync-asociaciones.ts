// Sincronización del registro autonómico de asociaciones (SOCideas · hoja «07 Asociaciones»).
//
// Uso:
//   npx tsx scripts/sync-asociaciones.ts                # DRY-RUN (no escribe nada)
//   npx tsx scripts/sync-asociaciones.ts --write        # escritura real
//   npx tsx scripts/sync-asociaciones.ts --only=CLM,CV  # limitar CCAA
//
// Fuentes directas (CSV/JSON descargables, sondeadas antes de usarse):
//   CLM  · CKAN datosabiertos.castillalamancha.es  (CSV 32.693 filas, UTF-8)
//   CV   · CKAN dadesobertes.gva.es                (CSV 93.242 filas, ';', UTF-8)
//   GAL  · abertos.xunta.gal (Liferay, CSV directo) (40.855 filas, ';', UTF-8)
//   RIO  · ias1.larioja.org/opendata/download       (CSV 3,2 MB, ';', ISO-8859-1)
//   NAV  · administracionelectronica.navarra.es/REGASOC_WebAPI (POST JSON, 10.274 filas)
//
// Sin descarga estructurada (NO se raspa nada): se inserta UNA fila de
// metadatos por CCAA con estado='sin_datos_abiertos' + enlace al registro.
// Sin fuente identificada: estado='no_disponible'.
// Si una URL directa deja de responder, NO se inventan datos: fila de metadatos
// con estado='sin_datos_abiertos' y raw_data.sonda con el resultado del probe.
import { config } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

config({ path: '.env.local' })

const pExecFile = promisify(execFile)

const AVISO_BASE =
  'Datos procedentes del registro autonómico. Pueden no reflejar bajas, nuevas inscripciones o cambios de estado posteriores a la fecha de descarga. Verificar en el registro autonómico antes de cualquier uso oficial.'

const NOMBRE_SIN_DATOS =
  '(Registro autonómico de asociaciones — sin datos abiertos estructurados)'
const NOMBRE_NO_DISPONIBLE = '(Sin fuente de datos abiertos identificada)'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const hoy = (): string => new Date().toISOString().slice(0, 10)

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type EstadoCcaa = 'con_datos' | 'sin_datos_abiertos' | 'no_disponible'

interface Sonda {
  ok: boolean
  status: number | null
  url: string
  detalle: string
}

interface AsocRow {
  nombre: string
  codigo_ine: string | null
  municipio: string | null
  provincia: string | null
  ccaa_code: string
  tipo: string | null
  nif: string | null
  fecha_inscripcion: string | null
  estado: string | null
  fuente_url: string
  fuente_fecha: string
  aviso_verificacion: string
  raw_data: Record<string, unknown> | null
}

interface FuenteCcaa {
  code: string
  key: string
  nombre: string
  estado: EstadoCcaa
  fuenteUrl: string
  /** Descarga directa. Solo para estado 'con_datos'. */
  descarga?: (indice: IndiceMunicipios, fecha: string) => Promise<ParFilas>
}

// ---------------------------------------------------------------------------
// Utilidades HTTP
// ---------------------------------------------------------------------------

async function conReintentos<T>(fn: () => Promise<T>, intentos = 3): Promise<T> {
  let ultimo: unknown
  for (let i = 0; i < intentos; i++) {
    try {
      return await fn()
    } catch (e) {
      ultimo = e
      await new Promise((r) => setTimeout(r, 600 + i * 900))
    }
  }
  throw ultimo
}

/** Fallback con curl.exe: algunos portales presentan cadenas de certificados
 *  que el almacén CA de Node.js rechaza (p. ej. abertos.xunta.gal →
 *  UNABLE_TO_VERIFY_LEAF_SIGNATURE, opendata.euskadi.eus →
 *  SELF_SIGNED_CERT_IN_CHAIN) y curl sí los valida con el almacén de Windows.
 *  Solo se usa si fetch() ha fallado tras los reintentos. */
async function curlGet(
  url: string,
  timeoutMs: number,
): Promise<{ status: number; url: string; body: ArrayBuffer; detalle: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'asoc-'))
  const archivo = path.join(dir, 'body.bin')
  try {
    const { stdout } = await pExecFile(
      'curl.exe',
      [
        '-sS', '-L',
        '--max-time', String(Math.max(Math.ceil(timeoutMs / 1000), 5)),
        '-A', UA,
        '-o', archivo,
        '-w', '%{http_code}\t%{url_effective}',
        url,
      ],
      { maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs + 5000 },
    )
    const [codigo, urlFinal] = stdout.trim().split('\t')
    const buf = await readFile(archivo)
    const body = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    return {
      status: Number(codigo) || 0,
      url: urlFinal || url,
      body,
      detalle: `curl ${codigo}`,
    }
  } finally {
    await unlink(archivo).catch(() => undefined)
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function httpGet(
  url: string,
  timeoutMs = 60000,
): Promise<{ status: number; url: string; body: ArrayBuffer; detalle: string }> {
  try {
    return await conReintentos(async () => {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': UA, accept: '*/*' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`)
      const body = await res.arrayBuffer()
      return { status: res.status, url: res.url, body, detalle: `fetch ${res.status}` }
    })
  } catch (e) {
    // TLS/RED: se reintenta una vez con curl (almacén CA de Windows).
    console.log(`    fetch falló (${e instanceof Error ? e.message : String(e)}) → curl`)
    const c = await curlGet(url, timeoutMs)
    if (c.status < 200 || c.status >= 300) throw new Error(`HTTP ${c.status} en ${url}`)
    return c
  }
}

// ---------------------------------------------------------------------------
// Caché local de descargas (tmp/asoc-cache, gitignored)
// ---------------------------------------------------------------------------
// Motivo: varias fuentes autonómicas cambian de URL o pasan a 403/404 entre
// ejecuciones. Si la fuente remota falla, se usa la ÚLTIMA COPIA OFICIAL
// descargada por este mismo script, y el resultado queda documentado en
// `origen`/`raw_data` (nunca se inventan datos).
const CACHE_DIR = path.join('tmp', 'asoc-cache')

async function guardarCache(clave: string, body: ArrayBuffer): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true })
    await writeFile(path.join(CACHE_DIR, clave), Buffer.from(body))
  } catch {
    // La caché es best-effort: su fallo no invalida la descarga.
  }
}

async function leerCache(clave: string): Promise<{ body: ArrayBuffer; fecha: string } | null> {
  try {
    const archivo = path.join(CACHE_DIR, clave)
    const st = await stat(archivo)
    const buf = await readFile(archivo)
    return {
      body: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
      fecha: new Date(st.mtimeMs).toISOString().slice(0, 19).replace('T', ' '),
    }
  } catch {
    return null
  }
}

/** Descarga remota con reserva en caché local. */
async function descargar(
  url: string,
  claveCache: string,
  timeoutMs: number,
): Promise<{ status: number; url: string; body: ArrayBuffer; detalle: string; origen: 'remota' | 'copia_local' }> {
  try {
    const r = await httpGet(url, timeoutMs)
    await guardarCache(claveCache, r.body)
    return { ...r, origen: 'remota' }
  } catch (e) {
    const detalleError = e instanceof Error ? e.message : String(e)
    const c = await leerCache(claveCache)
    if (!c) throw e
    console.log(`    remoto no disponible (${detalleError}) → copia local del ${c.fecha}`)
    return {
      status: 0,
      url,
      body: c.body,
      detalle: `remoto no disponible (${detalleError}) · copia local descargada el ${c.fecha}`,
      origen: 'copia_local',
    }
  }
}

async function sondaDe(url: string, timeoutMs = 20000): Promise<Sonda> {
  try {
    return await conReintentos(async () => {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': UA, accept: '*/*' },
      })
      return {
        ok: res.ok,
        status: res.status,
        url: res.url,
        detalle: `GET ${res.status} → ${res.url}`,
      }
    }, 2)
  } catch {
    try {
      const c = await curlGet(url, timeoutMs)
      return {
        ok: c.status >= 200 && c.status < 400,
        status: c.status,
        url: c.url,
        detalle: `GET ${c.status} → ${c.url} (curl)`,
      }
    } catch (e) {
      return {
        ok: false,
        status: null,
        url,
        detalle: `ERROR ${e instanceof Error ? e.message : String(e)} en ${url}`,
      }
    }
  }
}

function decodeTexto(buf: ArrayBuffer): { text: string; encoding: string } {
  const b = Buffer.from(buf)
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(b), encoding: 'utf-8' }
  } catch {
    try {
      return { text: new TextDecoder('windows-1252').decode(b), encoding: 'windows-1252' }
    } catch {
      return { text: b.toString('latin1'), encoding: 'latin1' }
    }
  }
}

// ---------------------------------------------------------------------------
// CSV / normalización / fechas
// ---------------------------------------------------------------------------

function detectarDelimitador(texto: string): string {
  const primera = texto.split(/\r?\n/, 1)[0] ?? ''
  const cuenta = (d: string): number => primera.split(d).length - 1
  const opciones = [';', ',', '\t', '|']
  let mejor = ';'
  let max = -1
  for (const d of opciones) {
    const c = cuenta(d)
    if (c > max) {
      max = c
      mejor = d
    }
  }
  return max > 0 ? mejor : ','
}

function parseCsv(texto: string, delimitador: string): string[][] {
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let entreComillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"'
          i++
        } else {
          entreComillas = false
        }
      } else {
        campo += c
      }
      continue
    }
    if (c === '"') {
      entreComillas = true
    } else if (c === delimitador) {
      fila.push(campo)
      campo = ''
    } else if (c === '\n') {
      fila.push(campo)
      filas.push(fila)
      fila = []
      campo = ''
    } else if (c !== '\r') {
      campo += c
    }
  }
  if (campo.length > 0 || fila.length > 0) {
    fila.push(campo)
    filas.push(fila)
  }
  return filas.filter((f) => f.some((v) => v.trim() !== ''))
}

function normalizar(v: string | null | undefined): string {
  if (!v) return ''
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[º°]/g, 'o')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function limpiar(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null
  const t = v.trim().replace(/\s+/g, ' ')
  return t === '' ? null : t
}

const MESES: Record<string, string> = {
  ENE: '01', FEB: '02', MAR: '03', ABR: '04', MAY: '05', JUN: '06',
  JUL: '07', AGO: '08', SEP: '09', OCT: '10', NOV: '11', DIC: '12',
  JAN: '01', APR: '04', AUG: '08', DEC: '12',
}

/** dd/mm/yyyy · dd-mm-yyyy · dd-MON-yy · ISO → yyyy-mm-dd | null */
function aFechaIso(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim()
  if (!v) return null
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dm = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (dm) {
    const dia = dm[1].padStart(2, '0')
    const mes = dm[2].padStart(2, '0')
    let anio = dm[3]
    if (anio.length === 2) anio = Number(anio) < 50 ? `20${anio}` : `19${anio}`
    if (Number(mes) < 1 || Number(mes) > 12 || Number(dia) < 1 || Number(dia) > 31) return null
    return `${anio}-${mes}-${dia}`
  }
  const dmon = v.match(/^(\d{1,2})[-/]([A-Za-zÁÉÍÓÚáéíóú]{3})[-/](\d{2,4})/)
  if (dmon) {
    const mes = MESES[dmon[2].toUpperCase()]
    if (!mes) return null
    const dia = dmon[1].padStart(2, '0')
    let anio = dmon[3]
    if (anio.length === 2) anio = Number(anio) < 50 ? `20${anio}` : `19${anio}`
    return `${anio}-${mes}-${dia}`
  }
  return null
}

function normalizarNif(raw: string | null | undefined): string | null {
  const v = limpiar(raw)
  if (!v) return null
  const limpio = v.replace(/[\s.\-]/g, '').toUpperCase()
  return limpio.length >= 5 ? limpio : null
}

// ---------------------------------------------------------------------------
// Índice de municipios (municipios × provincias × CCAA)
// ---------------------------------------------------------------------------

interface IndiceMunicipios {
  /** `${NOMBRE_MUNICIPIO}|${PROVINCIA_O_CCAA}` → códigos INE (sin duplicados). */
  porTerritorio: Map<string, Set<string>>
  porNombre: Map<string, { ine: string; provincia: string }[]>
  provinciasPorCodigo: Map<string, string>
  /** Todos los códigos INE del catálogo: valida los códigos que traen las fuentes. */
  codigosIne: Set<string>
}

async function cargarIndice(sb: SupabaseClient): Promise<IndiceMunicipios> {
  const porTerritorio = new Map<string, Set<string>>()
  const porNombre = new Map<string, { ine: string; provincia: string }[]>()
  const provinciasPorCodigo = new Map<string, string>()
  const codigosIne = new Set<string>()
  const anadir = (k: string, ine: string): void => {
    const previo = porTerritorio.get(k)
    if (previo) previo.add(ine)
    else porTerritorio.set(k, new Set([ine]))
  }

  // Provincias (código INE → nombre): la usa la CV, que solo trae código.
  let desde = 0
  for (;;) {
    const { data, error } = await sb
      .from('provincias')
      .select('codigo_ine, nombre')
      .range(desde, desde + 499)
    if (error) throw new Error(`provincias: ${error.message}`)
    for (const p of data ?? []) provinciasPorCodigo.set(String(p.codigo_ine).padStart(2, '0'), String(p.nombre))
    if (!data || data.length < 500) break
    desde += 500
  }

  // Municipios paginados (8.132 filas; PostgREST limita a 1.000 por consulta).
  desde = 0
  for (;;) {
    const { data, error } = await sb
      .from('municipios')
      .select('codigo_ine, nombre, provincia:provincias(nombre, ccaa:comunidades_autonomas(nombre))')
      .range(desde, desde + 999)
    if (error) throw new Error(`municipios: ${error.message}`)
    for (const m of data ?? []) {
      const ine = String(m.codigo_ine).trim()
      const nombre = String(m.nombre)
      codigosIne.add(ine)
      const prov = Array.isArray(m.provincia) ? m.provincia[0] : m.provincia
      const provincia = (prov as { nombre?: string } | null)?.nombre ?? ''
      const ccaa = ((prov as { ccaa?: { nombre?: string } | null } | null)?.ccaa)?.nombre ?? ''
      // Se indexa por nombre de municipio + provincia Y también + CCAA: las
      // fuentes traen a veces la CCAA («Comunidad Foral de Navarra») y a veces
      // la provincia («Navarra»); ambas deben resolver al mismo INE.
      if (provincia) anadir(`${normalizar(nombre)}|${normalizar(provincia)}`, ine)
      if (ccaa) anadir(`${normalizar(nombre)}|${normalizar(ccaa)}`, ine)
      const nk = normalizar(nombre)
      porNombre.set(nk, [...(porNombre.get(nk) ?? []), { ine, provincia }])
    }
    if (!data || data.length < 1000) break
    desde += 1000
  }
  return { porTerritorio, porNombre, provinciasPorCodigo, codigosIne }
}

/**
 * Resuelve el código INE a partir del nombre de municipio (+ provincia).
 * Regla conservadora: solo si la combinación normalizada es unívoca;
 * si hay ambigüedad se devuelve null (nunca se adivina).
 */
function resolverIne(
  indice: IndiceMunicipios,
  municipio: string | null,
  provincia: string | null,
): string | null {
  const mun = limpiar(municipio)
  if (!mun) return null
  const provinciaN = provincia ? normalizar(provincia) : ''
  const candidatosNombre = [mun, ...mun.split(/[\/·,]/).map((s) => s.trim())].filter(Boolean)
  if (provinciaN) {
    // Con territorio conocido (provincia o CCAA) la búsqueda es SIEMPRE dentro
    // de él: nunca se cae a una coincidencia homónima de otra comunidad
    // (p. ej. una localidad navarra homónima de un municipio guipuzcoano).
    for (const cand of candidatosNombre) {
      const exactos = indice.porTerritorio.get(`${normalizar(cand)}|${provinciaN}`)
      if (exactos && exactos.size === 1) return [...exactos][0]
      if (exactos && exactos.size > 1) return null // ambiguo en el territorio
    }
    return null
  }
  // Sin provincia: solo si el nombre es único en toda España.
  for (const cand of candidatosNombre) {
    const genericos = indice.porNombre.get(normalizar(cand))
    if (genericos && genericos.length === 1) return genericos[0].ine
    if (genericos && genericos.length > 1) return null
  }
  return null
}

// ---------------------------------------------------------------------------
// Descargas por CCAA
// ---------------------------------------------------------------------------

interface ParFilas {
  rows: AsocRow[]
  leidas: number
  errores: string[]
  sonda: Sonda
  fuenteUrl: string
  /** 'remota' = descargada ahora; 'copia_local' = última copia oficial en caché. */
  origen?: 'remota' | 'copia_local'
}

const CLM_LANDING_API =
  'https://datosabiertos.castillalamancha.es/api/3/action/package_show?id=registro-de-asociaciones-de-castilla-la-mancha'
const CLM_CSV_FALLBACK =
  'https://datosabiertos.castillalamancha.es/sites/datosabiertos.castillalamancha.es/files/ASOCIACIONES%20CLM%20%28Septiembre%202026%29.csv'

async function descubrirClmCsv(): Promise<string> {
  try {
    const { body } = await httpGet(CLM_LANDING_API, 30000)
    const json: unknown = JSON.parse(Buffer.from(body).toString('utf8'))
    const resultado = (json as { result?: unknown }).result
    const paquete = Array.isArray(resultado) ? resultado[0] : resultado
    const recursos = (paquete as { resources?: { url?: string; format?: string; name?: string }[] } | null)?.resources ?? []
    const csv = recursos
      .filter((r) => (r.format ?? '').toLowerCase() === 'csv')
      .sort((a, b) => (b.name ?? '').localeCompare(a.name ?? ''))[0]
    if (csv?.url) return csv.url
  } catch {
    // Se usa la URL de respaldo documentada más abajo.
  }
  return CLM_CSV_FALLBACK
}

async function fetchClm(indice: IndiceMunicipios, fecha: string): Promise<ParFilas> {
  const recurso = await descubrirClmCsv()
  const dl = await descargar(recurso, 'CLM.csv', 120000)
  const { body } = dl
  const httpStatus = dl.status
  const httpUrl = dl.url
  const origen = dl.origen
  const { text, encoding } = decodeTexto(body)
  const filas = parseCsv(text, detectarDelimitador(text))
  const cab = filas[0] ?? []
  const col = (n: string): number => cab.findIndex((h) => normalizar(h) === normalizar(n))
  const iProv = col('PROVINCIA')
  const iTipo = col('TIPO')
  const iFecha = col('FECHA INSCRIPCION')
  const iNif = col('CIF')
  const iNombre = col('DENOMINACION')
  const iMun = col('LOCALIDAD')
  const faltan = [iProv, iTipo, iFecha, iNif, iNombre, iMun].filter((i) => i < 0)
  if (faltan.length) {
    return {
      rows: [],
      leidas: 0,
      errores: [`CLM: cabecera inesperada (${cab.join(' | ').slice(0, 200)})`],
      sonda: { ok: false, status: httpStatus || null, url: recurso, detalle: 'cabecera inesperada' },
      fuenteUrl: recurso,
      origen,
    }
  }
  const rows: AsocRow[] = []
  const errores: string[] = []
  for (const f of filas.slice(1)) {
    const nombre = limpiar(f[iNombre])
    if (!nombre) {
      errores.push('CLM: fila sin DENOMINACION')
      continue
    }
    const provincia = limpiar(f[iProv])
    const municipio = limpiar(f[iMun])
    rows.push({
      nombre,
      codigo_ine: resolverIne(indice, municipio, provincia),
      municipio,
      provincia,
      ccaa_code: '08',
      tipo: limpiar(f[iTipo]),
      nif: normalizarNif(f[iNif]),
      fecha_inscripcion: aFechaIso(f[iFecha]),
      estado: null,
      fuente_url: recurso,
      fuente_fecha: fecha,
      aviso_verificacion: AVISO_BASE,
      raw_data: null,
    })
  }
  return {
    rows,
    leidas: Math.max(filas.length - 1, 0),
    errores: errores.slice(0, 20),
    sonda: {
      ok: true,
      status: httpStatus || null,
      url: httpUrl,
      detalle:
        origen === 'remota'
          ? `GET ${httpStatus} → ${httpUrl} · ${encoding}`
          : `${dl.detalle} · ${encoding}`,
    },
    fuenteUrl: recurso,
    origen,
  }
}

const GVA_CKAN_API = 'https://dadesobertes.gva.es/api/3/action/package_show?id=soc-asociaciones'
const GVA_CSV_FALLBACK =
  'https://dadesobertes.gva.es/dataset/dbe0d2b9-b7c8-4329-91ea-17806a0a8d3e/resource/dff5096e-7289-4492-bc76-c1baa4eea727/download/asociaciones-de-la-comunitat-valenciana.csv'

async function descubrirGvaCsv(): Promise<string> {
  try {
    const { body } = await httpGet(GVA_CKAN_API, 30000)
    const json: unknown = JSON.parse(Buffer.from(body).toString('utf8'))
    const resultado = (json as { result?: unknown }).result
    const paquete = Array.isArray(resultado) ? resultado[0] : resultado
    const recursos = (paquete as { resources?: { url?: string; format?: string }[] } | null)?.resources ?? []
    const csv = recursos.find((r) => (r.format ?? '').toLowerCase() === 'csv')
    if (csv?.url) return csv.url
  } catch {
    // Respaldo documentado.
  }
  return GVA_CSV_FALLBACK
}

async function fetchGva(indice: IndiceMunicipios, fecha: string): Promise<ParFilas> {
  const recurso = await descubrirGvaCsv()
  const dl = await descargar(recurso, 'CV.csv', 180000)
  const { body } = dl
  const httpStatus = dl.status
  const httpUrl = dl.url
  const origen = dl.origen
  const { text, encoding } = decodeTexto(body)
  const filas = parseCsv(text, detectarDelimitador(text))
  const cab = filas[0] ?? []
  const col = (n: string): number => cab.findIndex((h) => normalizar(h) === normalizar(n))
  const iNombre = col('DESC_DENOMINACION')
  const iTipo = col('DESC_ACTIVIDAD')
  const iEstado = col('SITUACION')
  const iFecha = col('FECHA INSCRIPCION')
  const iMun = col('MUNICIPIO')
  const iCodMun = col('COD_MUNICIPIO')
  const iCodProv = col('COD_PROVINCIA')
  if ([iNombre, iTipo, iEstado, iFecha, iMun, iCodMun, iCodProv].some((i) => i < 0)) {
    return {
      rows: [],
      leidas: 0,
      errores: [`CV: cabecera inesperada (${cab.join(' | ').slice(0, 200)})`],
      sonda: { ok: false, status: httpStatus || null, url: recurso, detalle: 'cabecera inesperada' },
      fuenteUrl: recurso,
      origen,
    }
  }
  const rows: AsocRow[] = []
  const errores: string[] = []
  for (const f of filas.slice(1)) {
    const nombre = limpiar(f[iNombre])
    if (!nombre) {
      errores.push('CV: fila sin DESC_DENOMINACION')
      continue
    }
    const codProv = limpiar(f[iCodProv])
    const codMun = limpiar(f[iCodMun])
    const provincia = codProv ? (indice.provinciasPorCodigo.get(codProv.padStart(2, '0')) ?? null) : null
    // El código INE que trae la fuente solo se acepta si existe en el catálogo
    // municipal; si no, se resuelve por nombre (y si tampoco, NULL).
    let ine: string | null = null
    if (codProv && codMun && /^\d+$/.test(codMun)) {
      const cand = `${codProv.padStart(2, '0')}${codMun.padStart(3, '0')}`
      if (/^\d{5}$/.test(cand) && indice.codigosIne.has(cand)) ine = cand
    }
    rows.push({
      nombre,
      codigo_ine: ine ?? resolverIne(indice, f[iMun], provincia),
      municipio: limpiar(f[iMun]),
      provincia,
      ccaa_code: '10',
      tipo: limpiar(f[iTipo]),
      nif: null,
      fecha_inscripcion: aFechaIso(f[iFecha]),
      estado: limpiar(f[iEstado]),
      fuente_url: recurso,
      fuente_fecha: fecha,
      aviso_verificacion: AVISO_BASE,
      raw_data: null,
    })
  }
  return {
    rows,
    leidas: Math.max(filas.length - 1, 0),
    errores: errores.slice(0, 20),
    sonda: {
      ok: true,
      status: httpStatus || null,
      url: httpUrl,
      detalle:
        origen === 'remota'
          ? `GET ${httpStatus} → ${httpUrl} · ${encoding}`
          : `${dl.detalle} · ${encoding}`,
    },
    fuenteUrl: recurso,
    origen,
  }
}

const GAL_LANDING =
  'https://abertos.xunta.gal/catalogo/administracion-publica/-/dataset/0050/rexistro-asociacions'
const GAL_CSV_FALLBACK =
  'https://abertos.xunta.gal/catalogo/administracion-publica/-/dataset/0050/rexistro-asociacions/001/descarga-directa-ficheiro.csv'

async function descubrirGalCsv(): Promise<string> {
  try {
    const { body } = await httpGet(GAL_LANDING, 30000)
    const html = Buffer.from(body).toString('utf8')
    const m = html.match(/href="([^"]*descarga-directa-ficheiro\.csv)"/i)
    if (m) return m[1].startsWith('http') ? m[1] : `https://abertos.xunta.gal${m[1]}`
  } catch {
    // Respaldo documentado.
  }
  return GAL_CSV_FALLBACK
}

async function fetchGal(indice: IndiceMunicipios, fecha: string): Promise<ParFilas> {
  const recurso = await descubrirGalCsv()
  const dl = await descargar(recurso, 'GAL.csv', 180000)
  const { body } = dl
  const httpStatus = dl.status
  const httpUrl = dl.url
  const origen = dl.origen
  const { text, encoding } = decodeTexto(body)
  const filas = parseCsv(text, detectarDelimitador(text))
  const cab = filas[0] ?? []
  if (cab.length < 13) {
    return {
      rows: [],
      leidas: 0,
      errores: [`GAL: cabecera inesperada (${cab.join(' | ').slice(0, 200)})`],
      sonda: { ok: false, status: httpStatus || null, url: recurso, detalle: 'cabecera inesperada' },
      fuenteUrl: recurso,
      origen,
    }
  }
  // Cabecera con dos columnas homónimas «CÓDIGO » (índice 5 = municipio INE,
  // índice 7 = provincia): se usa la posición, no el nombre.
  const rows: AsocRow[] = []
  const errores: string[] = []
  for (const f of filas.slice(1)) {
    const nombre = limpiar(f[2])
    if (!nombre) {
      errores.push('GAL: fila sin NOME')
      continue
    }
    const codIneRaw = limpiar(f[5])
    const ine =
      codIneRaw && /^\d{5}$/.test(codIneRaw) && indice.codigosIne.has(codIneRaw) ? codIneRaw : null
    const provincia = limpiar(f[8])
    rows.push({
      nombre,
      codigo_ine: ine ?? resolverIne(indice, f[6], provincia),
      municipio: limpiar(f[6]),
      provincia,
      ccaa_code: '12',
      tipo: limpiar(f[12]),
      nif: normalizarNif(f[3]),
      fecha_inscripcion: aFechaIso(f[10]),
      estado: null,
      fuente_url: recurso,
      fuente_fecha: fecha,
      aviso_verificacion: AVISO_BASE,
      raw_data: null,
    })
  }
  return {
    rows,
    leidas: Math.max(filas.length - 1, 0),
    errores: errores.slice(0, 20),
    sonda: {
      ok: true,
      status: httpStatus || null,
      url: httpUrl,
      detalle:
        origen === 'remota'
          ? `GET ${httpStatus} → ${httpUrl} · ${encoding}`
          : `${dl.detalle} · ${encoding}`,
    },
    fuenteUrl: recurso,
    origen,
  }
}

// La Rioja expone 4 formatos del mismo dataset (cf=01 xls, 02 xml, 03 csv, 04 json).
// Se usa el CSV (r=Y2Q9ODUzfGNmPTAz = base64('cd=853|cf=03')).
const RIO_CSV =
  'https://ias1.larioja.org/opendata/download?r=Y2Q9ODUzfGNmPTAz'

async function fetchRio(indice: IndiceMunicipios, fecha: string): Promise<ParFilas> {
  const dl = await descargar(RIO_CSV, 'RIO.csv', 180000)
  const { body } = dl
  const httpStatus = dl.status
  const httpUrl = dl.url
  const origen = dl.origen
  const { text, encoding } = decodeTexto(body)
  const filas = parseCsv(text, detectarDelimitador(text))
  const cab = filas[0] ?? []
  const col = (n: string): number => cab.findIndex((h) => normalizar(h) === normalizar(n))
  const iNombre = col('NOMBRE')
  const iTipo = col('TIPO')
  const iNif = col('CIF')
  const iMun = col('MUNICIPIO')
  const iFecha = col('FECHA_REGISTRO')
  const iDisolucion = col('FECHA_DISOLUCION')
  if ([iNombre, iTipo, iNif, iMun, iFecha].some((i) => i < 0)) {
    return {
      rows: [],
      leidas: 0,
      errores: [`RIO: cabecera inesperada (${cab.join(' | ').slice(0, 200)})`],
      sonda: { ok: false, status: httpStatus || null, url: RIO_CSV, detalle: 'cabecera inesperada' },
      fuenteUrl: RIO_CSV,
      origen,
    }
  }
  const rows: AsocRow[] = []
  const errores: string[] = []
  for (const f of filas.slice(1)) {
    const nombre = limpiar(f[iNombre])
    if (!nombre) {
      errores.push('RIO: fila sin NOMBRE')
      continue
    }
    const disuelta = iDisolucion >= 0 ? limpiar(f[iDisolucion]) : null
    rows.push({
      nombre,
      codigo_ine: resolverIne(indice, f[iMun], 'La Rioja'),
      municipio: limpiar(f[iMun]),
      provincia: 'La Rioja',
      ccaa_code: '17',
      tipo: limpiar(f[iTipo]),
      nif: normalizarNif(f[iNif]),
      fecha_inscripcion: aFechaIso(f[iFecha]),
      estado: disuelta ? 'Disuelta' : null,
      fuente_url: RIO_CSV,
      fuente_fecha: fecha,
      aviso_verificacion: AVISO_BASE,
      raw_data: null,
    })
  }
  return {
    rows,
    leidas: Math.max(filas.length - 1, 0),
    errores: errores.slice(0, 20),
    sonda: {
      ok: true,
      status: httpStatus || null,
      url: httpUrl,
      detalle:
        origen === 'remota'
          ? `GET ${httpStatus} → ${httpUrl} · ${encoding}`
          : `${dl.detalle} · ${encoding}`,
    },
    fuenteUrl: RIO_CSV,
    origen,
  }
}

const NAV_API = 'https://administracionelectronica.navarra.es/REGASOC_WebAPI/api/Registro'
const NAV_PAGINA = 5000
const NAV_MAX_PAGINAS = 50

async function fetchNav(indice: IndiceMunicipios, fecha: string): Promise<ParFilas> {
  const rows: AsocRow[] = []
  const errores: string[] = []
  let leidas = 0
  let ultimaClave: string | null = null
  let sonda: Sonda = { ok: false, status: null, url: NAV_API, detalle: 'no consultado' }

  for (let pagina = 0; pagina < NAV_MAX_PAGINAS; pagina++) {
    const start = pagina * NAV_PAGINA
    const res = await conReintentos(() =>
      fetch(NAV_API, {
        method: 'POST',
        redirect: 'follow',
        signal: AbortSignal.timeout(60000),
        headers: { 'user-agent': UA, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ TIPO_ASOCIACION: 1, start, length: NAV_PAGINA }),
      }),
    )
    sonda = {
      ok: res.ok,
      status: res.status,
      url: NAV_API,
      detalle: `POST ${res.status} (página ${pagina}, start=${start})`,
    }
    if (!res.ok) {
      errores.push(`NAV: HTTP ${res.status} en página ${pagina}`)
      break
    }
    const json: unknown = await res.json()
    if (!Array.isArray(json)) {
      errores.push(`NAV: respuesta no es una lista (${typeof json})`)
      break
    }
    const lote = json as Record<string, unknown>[]
    if (lote.length === 0) break
    // El servidor devuelve SIEMPRE el listado completo (ignora start/length):
    // se detecta para no recorrer 50 páginas idénticas.
    const clave = `${lote[0]?.CO_REGISTRO ?? ''}|${lote[0]?.RAZON_SOCIAL ?? ''}`
    if (pagina > 0 && clave === ultimaClave) break
    ultimaClave = clave

    for (const r of lote) {
      const nombre = limpiar(typeof r.RAZON_SOCIAL === 'string' ? r.RAZON_SOCIAL : null)
      if (!nombre) {
        errores.push('NAV: fila sin RAZON_SOCIAL')
        continue
      }
      const municipio = limpiar(typeof r.LOCALIDAD === 'string' ? r.LOCALIDAD : null)
      rows.push({
        nombre,
        codigo_ine: resolverIne(indice, municipio, 'Comunidad Foral de Navarra'),
        municipio,
        provincia: 'Navarra',
        ccaa_code: '15',
        tipo: limpiar(typeof r.CLASE === 'string' ? r.CLASE : null),
        nif: normalizarNif(typeof r.NIF_CIF_NIE_DNI === 'string' ? r.NIF_CIF_NIE_DNI : null),
        fecha_inscripcion: aFechaIso(typeof r.FECHA_INSCRIPCION === 'string' ? r.FECHA_INSCRIPCION : null),
        estado: null,
        fuente_url: NAV_API,
        fuente_fecha: fecha,
        aviso_verificacion: AVISO_BASE,
        raw_data: null,
      })
    }
    leidas += lote.length
    if (lote.length < NAV_PAGINA) break // el servidor ignora start/length y devuelve todo
  }

  return {
    rows,
    leidas,
    errores: errores.slice(0, 20),
    sonda,
    fuenteUrl: NAV_API,
    origen: 'remota',
  }
}

// ---------------------------------------------------------------------------
// Registro de CCAA: 5 con descarga, 9 sin datos abiertos, 5 sin fuente
// ---------------------------------------------------------------------------

/** Buscadores/registros oficiales verificados con sonda HTTP 200 (2026-09-25).
 *  Donde no existe buscador online verificable se usa la raíz oficial del
 *  registro (sede / portal), indicándolo en `notaUrl`. */
const FUENTES: FuenteCcaa[] = [
  { code: '08', key: 'CLM', nombre: 'Castilla-La Mancha', estado: 'con_datos', fuenteUrl: CLM_CSV_FALLBACK, descarga: fetchClm },
  { code: '10', key: 'CV', nombre: 'Comunitat Valenciana', estado: 'con_datos', fuenteUrl: GVA_CSV_FALLBACK, descarga: fetchGva },
  { code: '12', key: 'GAL', nombre: 'Galicia', estado: 'con_datos', fuenteUrl: GAL_CSV_FALLBACK, descarga: fetchGal },
  { code: '17', key: 'RIO', nombre: 'La Rioja', estado: 'con_datos', fuenteUrl: RIO_CSV, descarga: fetchRio },
  { code: '15', key: 'NAV', nombre: 'Comunidad Foral de Navarra', estado: 'con_datos', fuenteUrl: NAV_API, descarga: fetchNav },

  // — Sin descarga estructurada (no se raspa): metadatos + buscador regional —
  {
    code: '01', key: 'AND', nombre: 'Andalucía', estado: 'sin_datos_abiertos',
    // Buscador oficial del Registro de Asociaciones de Andalucía (HTTP 200).
    fuenteUrl: 'https://www.juntadeandalucia.es/organismos/turismojusticiadesregulacionyadministracionlocal/areas/asociaciones/registro.html',
  },
  {
    code: '02', key: 'ARA', nombre: 'Aragón', estado: 'sin_datos_abiertos',
    // Página oficial de asociaciones con acceso a la consulta del registro (HTTP 200).
    fuenteUrl: 'https://www.aragon.es/-/asociaciones',
  },
  { code: '04', key: 'BAL', nombre: 'Islas Baleares', estado: 'sin_datos_abiertos', fuenteUrl: 'https://www.caib.es/' },
  { code: '05', key: 'CAN', nombre: 'Canarias', estado: 'sin_datos_abiertos', fuenteUrl: 'https://www.gobiernodecanarias.org/principal/' },
  { code: '06', key: 'CNT', nombre: 'Cantabria', estado: 'sin_datos_abiertos', fuenteUrl: 'https://sede.cantabria.es/sede/' },
  { code: '09', key: 'CAT', nombre: 'Cataluña', estado: 'sin_datos_abiertos', fuenteUrl: 'https://web.gencat.cat/ca/inici' },
  { code: '13', key: 'MAD', nombre: 'Comunidad de Madrid', estado: 'sin_datos_abiertos', fuenteUrl: 'https://sede.comunidad.madrid/' },
  { code: '14', key: 'MUR', nombre: 'Región de Murcia', estado: 'sin_datos_abiertos', fuenteUrl: 'https://www.carm.es/' },
  {
    code: '16', key: 'PVA', nombre: 'País Vasco', estado: 'sin_datos_abiertos',
    // Raíz Open Data Euskadi (HTTP 200); el catálogo publica un dataset de
    // asociaciones, pero la misión no raspa CCAA sin descarga directa definida.
    fuenteUrl: 'https://opendata.euskadi.eus/',
  },

  // — Sin fuente de datos abiertos identificada —
  { code: '03', key: 'AST', nombre: 'Asturias', estado: 'no_disponible', fuenteUrl: 'https://www.asturias.es/' },
  { code: '07', key: 'CYL', nombre: 'Castilla y León', estado: 'no_disponible', fuenteUrl: 'https://datosabiertos.jcyl.es/web/es/datos-abiertos-castilla-leon.html' },
  { code: '11', key: 'EXT', nombre: 'Extremadura', estado: 'no_disponible', fuenteUrl: 'https://www.juntaex.es/' },
  { code: '18', key: 'CEU', nombre: 'Ceuta', estado: 'no_disponible', fuenteUrl: 'https://sede.ceuta.es/' },
  { code: '19', key: 'MEL', nombre: 'Melilla', estado: 'no_disponible', fuenteUrl: 'https://sede.melilla.es/' },
]

function filaMetadatos(f: FuenteCcaa, fecha: string, sonda: Sonda, extra: Record<string, unknown>): AsocRow {
  const aviso =
    f.estado === 'no_disponible'
      ? `${AVISO_BASE} Sin fuente de datos abiertos identificada para esta CCAA. Registro oficial: ${f.fuenteUrl}`
      : `${AVISO_BASE} Buscador/registro oficial: ${f.fuenteUrl}`
  return {
    nombre: f.estado === 'no_disponible' ? NOMBRE_NO_DISPONIBLE : NOMBRE_SIN_DATOS,
    codigo_ine: null,
    municipio: null,
    provincia: null,
    ccaa_code: f.code,
    tipo: null,
    nif: null,
    fecha_inscripcion: null,
    estado: f.estado,
    fuente_url: f.fuenteUrl,
    fuente_fecha: fecha,
    aviso_verificacion: aviso,
    raw_data: {
      ccaa: f.nombre,
      sonda: sonda.detalle.slice(0, 600),
      status: sonda.status,
      url_final: sonda.url.slice(0, 600),
      ...extra,
    },
  }
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

const LOTE = 500

async function insertarFilas(sb: SupabaseClient, ccaa: FuenteCcaa, rows: AsocRow[]): Promise<{ escritas: number; errores: string[] }> {
  const errores: string[] = []
  let escritas = 0

  // Refresco por CCAA: se borra solo cuando hay filas nuevas que sustituyen
  // (evita duplicados entre ejecuciones y filas obsoletas del registro).
  const { error: delError } = await sb.from('asociaciones').delete().eq('ccaa_code', ccaa.code)
  if (delError) errores.push(`borrado previo ${ccaa.key}: ${delError.message}`)

  for (let i = 0; i < rows.length; i += LOTE) {
    const lote = rows.slice(i, i + LOTE)
    const conNif = lote.filter((r) => r.nif !== null)
    const sinNif = lote.filter((r) => r.nif === null)

    // Deduplicar por (nif, ccaa) DENTRO del lote: ON CONFLICT no puede
    // afectar dos veces a la misma fila.
    const vistos = new Set<string>()
    const conNifUnicos = conNif.filter((r) => {
      const k = `${r.nif}·${r.ccaa_code}`
      if (vistos.has(k)) return false
      vistos.add(k)
      return true
    })

    if (conNifUnicos.length) {
      const { error } = await sb.from('asociaciones').upsert(conNifUnicos, { onConflict: 'nif,ccaa_code' })
      if (error) errores.push(`upsert lote ${i / LOTE + 1} (${ccaa.key}): ${error.message}`)
      else escritas += conNifUnicos.length
    }
    if (sinNif.length) {
      const { error } = await sb.from('asociaciones').insert(sinNif)
      if (error) errores.push(`insert lote ${i / LOTE + 1} (${ccaa.key}): ${error.message}`)
      else escritas += sinNif.length
    }
  }
  return { escritas, errores }
}

async function registrarRun(
  sb: SupabaseClient,
  f: FuenteCcaa,
  resultado: {
    estado: 'ok' | 'partial' | 'error'
    leidas: number
    escritas: number
    errores: number
    detalle: string[]
    sonda: Sonda
    modo: string
    /** 'remota' | 'copia_local': procedencia real de los datos insertados. */
    origen?: string
  },
): Promise<void> {
  const { error } = await sb.from('data_sync_runs').insert({
    source_id: null,
    tipo_sincronizacion: 'asociaciones_ccaa',
    municipio_codigo_ine: null,
    fin: new Date().toISOString(),
    estado: resultado.estado,
    registros_leidos: resultado.leidas,
    registros_actualizados: resultado.escritas,
    registros_con_error: resultado.errores,
    error_message: resultado.detalle.length ? resultado.detalle.slice(0, 20).join(' | ').slice(0, 1900) : null,
    estado_dato: 'consolidado',
    bloque: 'asociaciones',
    periodo: hoy(),
    fuente: `registro_asociaciones_${f.key.toLowerCase()}`,
    metadata: {
      ccaa_code: f.code,
      ccaa: f.nombre,
      total: resultado.leidas,
      errores: resultado.errores,
      escritas: resultado.escritas,
      fuente_url: f.fuenteUrl,
      fuente_fecha: hoy(),
      sonda: resultado.sonda.detalle,
      modo: resultado.modo,
      origen: resultado.origen ?? 'remota',
    },
  })
  if (error) console.error(`  [auditoría] data_sync_runs no insertada (${f.key}): ${error.message}`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function muestra(rows: AsocRow[], n = 3): string[] {
  return rows.slice(0, n).map(
    (r) =>
      `      · ${r.nombre.slice(0, 60)} | tipo=${r.tipo ?? '—'} | nif=${r.nif ?? '—'} | alta=${r.fecha_inscripcion ?? '—'} | ine=${r.codigo_ine ?? '—'} | ${r.municipio ?? '—'}/${r.provincia ?? '—'}`,
  )
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const escribir = args.includes('--write')
  const onlyArg = args.find((a) => a.startsWith('--only='))
  const solo = onlyArg
    ? new Set(
        onlyArg
          .slice('--only='.length)
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
      )
    : null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
    process.exit(1)
  }
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } })
  const fecha = hoy()

  const seleccion = FUENTES.filter(
    (f) => !solo || solo.has(f.key) || solo.has(f.code) || solo.has(f.nombre.toUpperCase()),
  )
  if (seleccion.length === 0) {
    console.error(`--only no coincide con ninguna CCAA. Claves: ${FUENTES.map((f) => f.key).join(',')}`)
    process.exit(1)
  }

  console.log(`=== SOCideas · sync-asociaciones · ${escribir ? 'WRITE' : 'DRY-RUN'} · ${fecha} ===`)
  console.log(`CCAA seleccionadas: ${seleccion.map((f) => `${f.key}(${f.code})`).join(' ')}`)

  let indice: IndiceMunicipios | null = null
  if (seleccion.some((f) => f.estado === 'con_datos')) {
    console.log('Cargando índice de municipios/provincias…')
    try {
      indice = await cargarIndice(sb)
      console.log(
        `  municipios: ${indice.porNombre.size} nombres · provincias: ${indice.provinciasPorCodigo.size}`,
      )
    } catch (e) {
      console.error(`  ERROR índice: ${e instanceof Error ? e.message : e}`)
      process.exit(1)
    }
  }

  const resumen: {
    key: string
    code: string
    estado: EstadoCcaa
    sonda: string
    leidas: number
    conIne: number
    escritas: number
    errores: number
    nota: string
    /** Procedencia de los datos de esta CCAA (remota o copia local). */
    origen?: string
  }[] = []

  for (const f of seleccion) {
    console.log(`\n--- ${f.key} (${f.code}) · ${f.nombre} · ${f.estado} ---`)
    const indiceUsar = indice as IndiceMunicipios | null

    if (f.estado === 'con_datos' && f.descarga && indiceUsar) {
      let par: ParFilas | null = null
      try {
        par = await f.descarga(indiceUsar, fecha)
      } catch (e) {
        const detalle = `ERROR de descarga: ${e instanceof Error ? e.message : String(e)}`
        console.error(`  ${detalle}`)
        const sonda = await sondaDe(f.fuenteUrl)
        const fila = filaMetadatos(f, fecha, sonda, { motivo: detalle })
        resumen.push({
          key: f.key, code: f.code, estado: 'sin_datos_abiertos',
          sonda: `${sonda.detalle} · ${detalle}`, leidas: 0, conIne: 0, escritas: 0, errores: 1, nota: 'sin datos (descarga fallida)',
        })
        if (escribir) {
          const r = await insertarFilas(sb, f, [fila])
          await registrarRun(sb, f, {
            estado: 'error', leidas: 0, escritas: r.escritas, errores: r.errores.length + 1,
            detalle: [...r.errores, detalle], sonda, modo: 'write',
          })
        }
        continue
      }

      const { rows, leidas, errores, sonda, fuenteUrl, origen } = par
      const origenDatos = origen ?? 'remota'
      const conIne = rows.filter((r) => r.codigo_ine !== null).length
      const sinIne = rows.length - conIne
      const tipos = new Set(rows.map((r) => r.tipo).filter(Boolean))
      console.log(`  sonda: ${sonda.detalle}`)
      console.log(`  recurso: ${fuenteUrl}`)
      console.log(`  origen de los datos: ${origenDatos}`)
      console.log(`  filas leídas: ${leidas} · válidas: ${rows.length} · con INE: ${conIne} · sin INE: ${sinIne} · tipos: ${tipos.size}`)
      if (errores.length) console.log(`  errores de parseo (${errores.length}): ${errores.slice(0, 5).join(' · ')}`)
      muestra(rows).forEach((l) => console.log(l))

      if (!sonda.ok || rows.length === 0) {
        console.log('  ⚠ sin filas válidas: NO se escribe nada de esta CCAA (se registra metadato)')
        const fila = filaMetadatos(f, fecha, sonda, {
          motivo: !sonda.ok ? 'sonda fallida' : 'descarga sin filas válidas',
          filas_parseadas: rows.length,
          errores: errores.slice(0, 5),
        })
        resumen.push({
          key: f.key, code: f.code, estado: 'sin_datos_abiertos',
          sonda: sonda.detalle, leidas, conIne, escritas: 0, errores: errores.length || 1,
          nota: !sonda.ok ? 'sonda fallida' : 'sin filas válidas',
        })
        if (escribir) {
          const r = await insertarFilas(sb, f, [fila])
          await registrarRun(sb, f, {
            estado: 'error', leidas, escritas: r.escritas, errores: r.errores.length + 1,
            detalle: [...r.errores, ...errores], sonda, modo: 'write',
          })
        }
        continue
      }

      resumen.push({
        key: f.key, code: f.code, estado: 'con_datos', sonda: sonda.detalle,
        leidas, conIne, escritas: 0, errores: errores.length,
        nota: escribir ? (origenDatos === 'remota' ? '' : 'copia local (fuente remota caída)') : 'dry-run (sin escribir)',
        origen: origenDatos,
      })

      if (escribir) {
        const r = await insertarFilas(sb, f, rows)
        resumen[resumen.length - 1].escritas = r.escritas
        resumen[resumen.length - 1].errores = errores.length + r.errores.length
        console.log(`  escritas: ${r.escritas} · errores: ${r.errores.length}`)
        if (r.errores.length) console.log(`    ${r.errores.slice(0, 5).join(' | ')}`)
        const totalErrores = errores.length + r.errores.length
        await registrarRun(sb, f, {
          estado: totalErrores === 0 ? 'ok' : r.escritas > 0 ? 'partial' : 'error',
          leidas, escritas: r.escritas, errores: totalErrores,
          detalle: [...errores, ...r.errores], sonda, modo: 'write', origen: origenDatos,
        })
      }
      continue
    }

    // Metadatos: sin descarga estructurada o sin fuente identificada.
    const sonda = await sondaDe(f.fuenteUrl)
    console.log(`  sonda: ${sonda.detalle}`)
    console.log(`  registro: ${f.fuenteUrl}`)
    const fila = filaMetadatos(f, fecha, sonda, {})
    resumen.push({
      key: f.key, code: f.code, estado: f.estado, sonda: sonda.detalle,
      leidas: 1, conIne: 0, escritas: 0, errores: 0, nota: 'fila de metadatos',
    })
    if (escribir) {
      const r = await insertarFilas(sb, f, [fila])
      resumen[resumen.length - 1].escritas = r.escritas
      console.log(`  escritas: ${r.escritas} · errores: ${r.errores.length}`)
      await registrarRun(sb, f, {
        estado: r.errores.length === 0 ? 'ok' : 'error',
        leidas: 1, escritas: r.escritas, errores: r.errores.length,
        detalle: r.errores, sonda, modo: 'write',
      })
    }
  }

  console.log('\n=== RESUMEN ===')
  console.log('CCAA  código  estado             leídas  con_ine  escritas  errores  sonda/estado')
  let totalLeidas = 0
  let totalEscritas = 0
  let totalErrores = 0
  for (const r of resumen) {
    totalLeidas += r.leidas
    totalEscritas += r.escritas
    totalErrores += r.errores
    console.log(
      `${r.key.padEnd(5)} ${r.code}   ${r.estado.padEnd(18)} ${String(r.leidas).padStart(6)}  ${String(r.conIne).padStart(7)}  ${String(r.escritas).padStart(8)}  ${String(r.errores).padStart(7)}  ${r.sonda.slice(0, 60)}`,
    )
  }
  console.log(`TOTAL          ${'—'.padEnd(18)} ${String(totalLeidas).padStart(6)}  ${'—'.padStart(7)}  ${String(totalEscritas).padStart(8)}  ${String(totalErrores).padStart(7)}`)
  if (!escribir) console.log('\nDRY-RUN: no se ha escrito nada en Supabase. Repite con --write para insertar.')
}

void main()
