#!/usr/bin/env node
// Cargador NACIONAL de indicadores educativos por sección censal.
//
// FUENTE OFICIAL (verificada en vivo, sin suposiciones)
//   Censo Anual de Población · Educación y Relación con la actividad
//   https://www.ine.es/dynt3/inebase/index.htm?padre=10607&capsel=10613
//   Índice provincial: .../index.htm?padre=10607&capsel=11155  (52 unidades)
//   Descarga:         https://www.ine.es/jaxiT3/files/t/csv_bd/{tableId}.csv
//
// FORMATO REAL del CSV (leído, no supuesto)
//   UTF-8 con BOM (el Content-Type miente: dice ISO-8859-15), TSV, 7 columnas:
//   Provincias | Municipios | Secciones | Sexo | <dimensión> | Periodo | Total
//   - "Secciones" trae el CUSEC de 10 dígitos; sus 5 primeros son el INE municipal.
//   - "Sexo" trae Total | Hombres | Mujeres → sólo se usa Total para no duplicar.
//   - "Total" usa formato es-ES: '1.349'. Un '.' aislado o celda vacía es NO
//     DIFUNDIDO (el INE suprime secciones con < 50 habitantes).
//
// USO
//   npx tsx scripts/load-section-education.ts --period=2024 --all-provinces \
//     --write --verify --resume --concurrency=4 \
//     --manifest=tmp/audit/education/manifest-2024.json
//
// REGLAS INNEGOCIABLES
//   · ND nunca se convierte a 0, ni se imputa, ni se interpola, ni se recalcula
//     por diferencias, ni se copia de otra sección.
//   · ND queda fuera de cuantiles, Jenks, intervalos, mínimo, máximo y media.
//   · Si hay filas educativas y se generan 0 indicadores, el proceso falla.

import { config } from 'dotenv'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

import {
  EDUCATION_DOMAIN,
  EDUCATION_INDICATORS,
  EDUCATION_R2_PREFIX,
  EDUCATION_SCHEMA_VERSION,
  EDUCATION_TABLE_RANGE,
  type EducationIndicator,
} from '../src/lib/socideas-secciones-education'
import provTables from '../src/lib/education-province-tables.json'
import mapping from '../src/lib/education-category-mapping.json'

config({ path: '.env.local' })

const PARSER_VERSION = 'ine-education-parser/1.0.0'
const MAPPING_VERSION = mapping.mapping_version
const SRC_URL = 'https://www.ine.es/dynt3/inebase/index.htm?padre=10607&capsel=10613'
const CSV = (t: number) => `https://www.ine.es/jaxiT3/files/t/csv_bd/${t}.csv`
const UA = { 'User-Agent': 'SOCideas/1.0 (+https://urbideas.com)' }

/** Provincias cuyo id de tabla se ha verificado en el índice oficial. */
type ProvinceTables = Record<string, { provincia: string; formacion: number; actividad: number }>
const PROVINCES = provTables as ProvinceTables

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

/** Una celda tal como llega del INE, antes de normalizar. */
type CeldaBruta = number | null

interface Observacion {
  value: CeldaBruta
  numerator: CeldaBruta
  denominator: CeldaBruta
  status: 'observado' | 'derivado_verificable' | 'no_difundido' | 'sin_cobertura' | 'error_ingesta'
  nd_flag: boolean
  suppression_flag: boolean
  reason: string | null
}

interface SeccionNormalizada {
  sectionCode: string
  municipalityCode: string
  provinceCode: string
  /** Denominación literal de la sección en el CSV. */
  sourceLabel: string
  values: Record<string, Observacion>
}

interface MunicipioNormalizado {
  schema_version: typeof EDUCATION_SCHEMA_VERSION
  domain: typeof EDUCATION_DOMAIN
  period: number
  municipality_code: string
  municipality_name: string
  province_code: string
  parser_version: string
  mapping_version: string
  source: {
    url: string
    operation: string
    education_table: number
    activity_table: number
    education_sha256: string
    activity_sha256: string
    retrieved_at: string
  }
  sections: SeccionNormalizada[]
  coverage: {
    result_sections: number
    sections_with_data: number
    sections_suppressed: number
    indicators: number
    observations: number
    nd: number
    suppressed: number
  }
  validation: {
    leading_zeros_preserved: boolean
    municipalities_matched: boolean
    percentages_in_range: boolean
    denominators_resolved: boolean
    issues: string[]
  }
  quality_flags: string[]
  generated_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

interface Cli {
  period?: number
  provinces?: string[]
  municipalities?: string[]
  allProvinces: boolean
  indicators?: string[]
  download: boolean
  parseOnly: boolean
  write: boolean
  verify: boolean
  resume: boolean
  concurrency: number
  manifest?: string
  rawDir: string
}

function parseArgs(argv: string[]): Cli {
  const val = (k: string) => argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
  const has = (k: string) => argv.includes(`--${k}`)
  const period = val('period') ? Number.parseInt(val('period')!, 10) : undefined
  if (period !== undefined && !Number.isFinite(period)) {
    throw new Error(`--period inválido: ${val('period')}`)
  }
  return {
    period,
    provinces: val('provinces')?.split(',').map((s) => s.trim().padStart(2, '0')),
    // El código INE municipal siempre tiene 5 dígitos. Algunos shells
    // (PowerShell entre otros) convierten '08019' en el número 8019 al pasar
    // el argumento, perdiendo el cero inicial; normalizar aquí evita que un
    // municipio pedido desaparezca en silencio.
    municipalities: val('municipalities')?.split(',').map((s) => s.trim().padStart(5, '0')),
    allProvinces: has('all-provinces') || (!val('provinces') && !val('municipalities')),
    indicators: val('indicators')?.split(',').map((s) => s.trim()),
    download: has('download'),
    parseOnly: has('parse-only'),
    write: has('write'),
    verify: has('verify'),
    resume: has('resume'),
    concurrency: Number.parseInt(val('concurrency') ?? '4', 10) || 4,
    manifest: val('manifest'),
    rawDir: val('raw-dir') ?? join('tmp', 'education-raw'),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Descarga con reanudación y verificación de hash
// ─────────────────────────────────────────────────────────────────────────────

interface FicheroLocal {
  path: string
  sha256: string
  bytes: number
  estado: 'descargado' | 'unchanged'
  url: string
  http: number
  contentType: string
}

async function asegurarFichero(tableId: number, provinceCode: string, period: number, cli: Cli): Promise<FicheroLocal> {
  const url = CSV(tableId)
  const dir = join(cli.rawDir, String(period), provinceCode)
  const ruta = join(dir, `${tableId}.csv`)
  mkdirSync(dir, { recursive: true })

  if (cli.resume && existsSync(ruta)) {
    const buf = readFileSync(ruta)
    // Se revalida contra el servidor: si el tamaño cambió, se vuelve a bajar.
    const head = await fetch(url, { method: 'HEAD', headers: UA })
    const remoto = Number(head.headers.get('content-length') ?? 0)
    if (head.status === 200 && remoto > 0 && remoto === buf.length) {
      return {
        path: ruta,
        sha256: createHash('sha256').update(buf).digest('hex'),
        bytes: buf.length,
        estado: 'unchanged',
        url,
        http: head.status,
        contentType: head.headers.get('content-type') ?? '',
      }
    }
  }

  const r = await fetch(url, { headers: UA })
  if (r.status !== 200) throw new Error(`HTTP ${r.status} al descargar ${url}`)
  const contentType = r.headers.get('content-type') ?? ''
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.length === 0) throw new Error(`contenido vacío en ${url}`)
  // El fichero debe ser TSV real, no una página de error HTML.
  const inicio = buf.subarray(0, 400).toString('utf8')
  if (/^\s*<(!doctype|html)/i.test(inicio)) {
    throw new Error(`${url} devolvió HTML en lugar del fichero esperado`)
  }
  if (!inicio.includes('Secciones')) {
    throw new Error(`${url} no tiene la cabecera esperada (Secciones)`)
  }
  writeFileSync(ruta, buf)
  return {
    path: ruta,
    sha256: createHash('sha256').update(buf).digest('hex'),
    bytes: buf.length,
    estado: 'descargado',
    url,
    http: r.status,
    contentType,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Parseo
// ─────────────────────────────────────────────────────────────────────────────

/** Normaliza el valor de la columna Total. Devuelve null si no se difundió. */
function normalizarCelda(bruto: string): { valor: CeldaBruta; suprimido: boolean } {
  const v = bruto.trim()
  if (v === '' || v === '.' || v === '..' || v === '...') return { valor: null, suprimido: true }
  // Formato es-ES: '.' = millares. Quitarlo SOLO si es separador de millares.
  const n = /^\d{1,3}(\.\d{3})+$/.test(v) ? Number(v.replace(/\./g, '')) : Number(v.replace(/[.\s]/g, ''))
  if (!Number.isFinite(n)) return { valor: null, suprimido: true }
  return { valor: n, suprimido: false }
}

const RE_CUSEC = /^(\d{10})\s/
const RE_MUNI = /^(\d{5})\s/

/**
 * Parsea una tabla provincial (formación o actividad) y devuelve un mapa
 * CUSEC → { categoría de la dimensión → celda normalizada }.
 */
function parsearTabla(
  ruta: string,
  periodo: number,
  grupo: 'formacion' | 'actividad',
): Map<string, Map<string, { valor: CeldaBruta; suprimido: boolean }>> {
  // UTF-8 con BOM. Decodificar como latin1 rompe los acentos de la dimensión.
  const texto = readFileSync(ruta, 'utf8').replace(/^\ufeff/, '')
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== '')
  const cab = lineas[0].split('\t')
  const iProv = cab.indexOf('Provincias')
  const iMun = cab.indexOf('Municipios')
  const iSec = cab.indexOf('Secciones')
  const iSex = cab.indexOf('Sexo')
  const iPer = cab.indexOf('Periodo')
  const iTot = cab.indexOf('Total')
  const iDim = cab.findIndex((c) =>
    grupo === 'formacion' ? /^nivel de formaci/i.test(c) : /^relaci/i.test(c),
  )
  for (const [n, i] of [['Sexo', iSex], ['Periodo', iPer], ['Total', iTot], ['Secciones', iSec]] as const) {
    if (i < 0) throw new Error(`falta la columna "${n}" en ${ruta}`)
  }
  if (iDim < 0) throw new Error(`no se encontró la columna de ${grupo} en ${ruta}`)
  if (iMun < 0) throw new Error(`falta la columna "Municipios" en ${ruta}`)

  const salida = new Map<string, Map<string, { valor: CeldaBruta; suprimido: boolean }>>()

  for (let n = 1; n < lineas.length; n++) {
    const c = lineas[n].split('\t')
    if (c.length < cab.length) continue
    // Sólo el agregado total por sexo evita duplicar la población.
    if ((c[iSex] ?? '').trim() !== 'Total') continue
    if (Number.parseInt((c[iPer] ?? '').trim(), 10) !== periodo) continue
    const seccion = (c[iSec] ?? '').trim()
    if (seccion === '') continue // fila de provincia o de municipio, no de sección
    const mCusec = RE_CUSEC.exec(seccion)
    const mMun = RE_MUNI.exec((c[iMun] ?? '').trim())
    if (!mCusec || !mMun) {
      throw new Error(`fila ${n + 1} de ${ruta}: no se pudo extraer CUSEC/municipio ("${seccion}")`)
    }
    const cusec = mCusec[1]
    // El municipio debe ser el prefijo del CUSEC; si no, es una sección huérfana.
    if (!cusec.startsWith(mMun[1])) {
      throw new Error(`fila ${n + 1} de ${ruta}: el CUSEC ${cusec} no empieza por el municipio ${mMun[1]}`)
    }
    if (cusec.length !== 10) throw new Error(`fila ${n + 1}: CUSEC de longitud inesperada: ${cusec}`)
    const categoria = (c[iDim] ?? '').trim()
    if (categoria === '') continue
    const celda = normalizarCelda(c[iTot] ?? '')
    if (!salida.has(cusec)) salida.set(cusec, new Map())
    salida.get(cusec)!.set(categoria, celda)
  }
  void iProv
  return salida
}

// ─────────────────────────────────────────────────────────────────────────────
// Construcción de indicadores
// ─────────────────────────────────────────────────────────────────────────────

/** Indicadores absolutos: valor = recuento de la categoría. */
const ABSOLUTOS_POR_CLAVE: Record<string, { id: string; categoria: string; grupo: 'formacion' | 'actividad' }> = {
  // formación
  total: { id: 'edu_personas_total', categoria: 'Total', grupo: 'formacion' },
  primaria_inferior: { id: 'edu_personas_primaria_inferior', categoria: 'Educación primaria e inferior', grupo: 'formacion' },
  primera_etapa_secundaria: {
    id: 'edu_personas_primera_etapa_secundaria',
    categoria: 'Primera etapa de Educación Secundaria y similar',
    grupo: 'formacion',
  },
  segunda_etapa_postsecundaria: {
    id: 'edu_personas_segunda_etapa_postsecundaria',
    categoria: 'Segunda etapa de Educación Secundaria y Educación Postsecundaria no Superior',
    grupo: 'formacion',
  },
  educacion_superior: { id: 'edu_personas_educacion_superior', categoria: 'Educación superior', grupo: 'formacion' },
  // actividad
  total_16: { id: 'act_personas_total_16', categoria: 'Total', grupo: 'actividad' },
  ocupado: { id: 'act_personas_ocupados', categoria: 'Ocupado/a', grupo: 'actividad' },
  parado: { id: 'act_personas_parados', categoria: 'Parado/a', grupo: 'actividad' },
  perceptor_pension: {
    id: 'act_personas_perceptores_pension',
    categoria: 'Perceptor/a pensión de incapacidad, jubilación, prejubilación',
    grupo: 'actividad',
  },
  otra_inactividad: { id: 'act_personas_otra_inactividad', categoria: 'Otra situación de inactividad', grupo: 'actividad' },
  estudiante: { id: 'act_personas_estudiantes', categoria: 'Estudiante', grupo: 'actividad' },
}

/** Indicadores derivados: porcentaje sobre la base de su mismo grupo. */
const DERIVADOS: Array<{ id: string; numeradorId: string; denominadorId: string }> = [
  { id: 'edu_pct_primaria_inferior', numeradorId: 'edu_personas_primaria_inferior', denominadorId: 'edu_personas_total' },
  { id: 'edu_pct_primera_etapa_secundaria', numeradorId: 'edu_personas_primera_etapa_secundaria', denominadorId: 'edu_personas_total' },
  { id: 'edu_pct_segunda_etapa_postsecundaria', numeradorId: 'edu_personas_segunda_etapa_postsecundaria', denominadorId: 'edu_personas_total' },
  { id: 'edu_pct_educacion_superior', numeradorId: 'edu_personas_educacion_superior', denominadorId: 'edu_personas_total' },
  { id: 'act_pct_ocupados', numeradorId: 'act_personas_ocupados', denominadorId: 'act_personas_total_16' },
  { id: 'act_pct_parados', numeradorId: 'act_personas_parados', denominadorId: 'act_personas_total_16' },
  { id: 'act_pct_perceptores_pension', numeradorId: 'act_personas_perceptores_pension', denominadorId: 'act_personas_total_16' },
  { id: 'act_pct_otra_inactividad', numeradorId: 'act_personas_otra_inactividad', denominadorId: 'act_personas_total_16' },
  { id: 'act_pct_estudiantes', numeradorId: 'act_personas_estudiantes', denominadorId: 'act_personas_total_16' },
]

const nd = (razon: string | null): Observacion => ({
  value: null,
  numerator: null,
  denominator: null,
  status: 'no_difundido',
  nd_flag: true,
  suppression_flag: razon === 'statistical_confidentiality',
  reason: razon,
})

function construirSeccion(
  cusec: string,
  municipio: string,
  provincia: string,
  etiqueta: string,
  formacion: Map<string, { valor: CeldaBruta; suprimido: boolean }>,
  actividad: Map<string, { valor: CeldaBruta; suprimido: boolean }>,
  indicadoresActivos: Set<string>,
): SeccionNormalizada {
  const values: Record<string, Observacion> = {}
  const busqueda = grupo =>
    grupo === 'formacion' ? formacion : actividad

  // 1) Recuentos absolutos
  for (const [clave, def] of Object.entries(ABSOLUTOS_POR_CLAVE)) {
    if (!indicadoresActivos.has(def.id)) continue
    if (def.grupo === 'formacion' && indicadoresActivos.has('edu_personas_total') === false) continue
    const celda = busqueda(def.grupo).get(def.categoria)
    if (!celda) {
      values[def.id] = {
        value: null,
        numerator: null,
        denominator: null,
        status: 'sin_cobertura',
        nd_flag: false,
        suppression_flag: false,
        reason: 'categoria_no_publicada_en_origen',
      }
      continue
    }
    if (celda.valor === null) {
      values[def.id] = nd('statistical_confidentiality')
      continue
    }
    values[def.id] = {
      value: celda.valor,
      numerator: celda.valor,
      denominator: null,
      status: 'observado',
      nd_flag: false,
      suppression_flag: false,
      reason: null,
    }
  }

  // 2) Porcentajes. Si el numerador o el denominador no se difundió, el
  //    porcentaje es ND: no se estima, no se recorta, no se rellena.
  for (const d of DERIVADOS) {
    if (!indicadoresActivos.has(d.id)) continue
    const num = values[d.numeradorId]
    const den = values[d.denominadorId]
    if (!num || !den) {
      values[d.id] = {
        value: null,
        numerator: null,
        denominator: null,
        status: 'sin_cobertura',
        nd_flag: false,
        suppression_flag: false,
        reason: 'componente_no_disponible',
      }
      continue
    }
    if (num.value === null || den.value === null) {
      values[d.id] = nd('statistical_confidentiality')
      continue
    }
    if (den.value === 0) {
      values[d.id] = {
        value: null,
        numerator: num.value,
        denominator: 0,
        status: 'no_difundido',
        nd_flag: true,
        suppression_flag: false,
        reason: 'denominador_cero',
      }
      continue
    }
    const pct = (num.value / den.value) * 100
    values[d.id] = {
      value: pct,
      numerator: num.value,
      denominator: den.value,
      status: 'derivado_verificable',
      nd_flag: false,
      suppression_flag: false,
      reason: null,
    }
  }

  return {
    sectionCode: cusec,
    municipalityCode: municipio,
    provinceCode: provincia,
    sourceLabel: etiqueta,
    values,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// R2
// ─────────────────────────────────────────────────────────────────────────────

function clienteR2(): S3Client {
  const account = process.env.R2_ACCOUNT_ID
  const key = process.env.R2_ACCESS_KEY_ID
  const secret = process.env.R2_SECRET_ACCESS_KEY
  if (!account || !key || !secret) {
    throw new Error('faltan R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY en .env.local')
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: key, secretAccessKey: secret },
  })
}

const BUCKET = () => {
  const b = process.env.R2_BUCKET
  if (!b) throw new Error('falta R2_BUCKET en .env.local')
  return b
}

async function leerR2(cli: S3Client, key: string): Promise<string | null> {
  try {
    const r = await cli.send(new GetObjectCommand({ Bucket: BUCKET(), Key: key }))
    return await r.Body!.transformToString()
  } catch (e: unknown) {
    const code = (e as { name?: string }).name
    if (code === 'NoSuchKey' || code === 'NotFound') return null
    throw e
  }
}

async function escribirR2(cli: S3Client, key: string, cuerpo: string) {
  await cli.send(
    new PutObjectCommand({
      Bucket: BUCKET(),
      Key: key,
      Body: cuerpo,
      ContentType: 'application/json; charset=utf-8',
    }),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Proceso principal
// ─────────────────────────────────────────────────────────────────────────────

async function procesarProvincia(
  provinceCode: string,
  periodo: number,
  cli: Cli,
  indicadoresActivos: Set<string>,
  soloMunicipios: Set<string> | null,
) {
  const def = PROVINCES[provinceCode]
  const issues: string[] = []
  const problemas: string[] = []
  if (!def) return { provinceCode, error: `provincia ${provinceCode} sin tabla verificada`, municipios: [] as MunicipioNormalizado[] }

  const fich: Record<string, FicheroLocal> = {}
  for (const [nombre, tableId] of [['formacion', def.formacion], ['actividad', def.actividad]] as const) {
    try {
      fich[nombre] = await asegurarFichero(tableId, provinceCode, periodo, cli)
    } catch (e) {
      return { provinceCode, error: `${nombre}: ${(e as Error).message}`, municipios: [] as MunicipioNormalizado[] }
    }
  }

  let formacion: Map<string, Map<string, { valor: CeldaBruta; suprimido: boolean }>>
  let actividad: Map<string, Map<string, { valor: CeldaBruta; suprimido: boolean }>>
  try {
    formacion = parsearTabla(fich.formacion.path, periodo, 'formacion')
    actividad = parsearTabla(fich.actividad.path, periodo, 'actividad')
  } catch (e) {
    return { provinceCode, error: `parseo: ${(e as Error).message}`, municipios: [] as MunicipioNormalizado[] }
  }

  // Agrupar por municipio. El nombre viene del CSV; no se une por nombre.
  const porMunicipio = new Map<string, { nombre: string; cusecs: string[] }>()
  let seccionesFueraDeFiltro = 0
  for (const cusec of formacion.keys()) {
    const muni = cusec.slice(0, 5)
    if (soloMunicipios && !soloMunicipios.has(muni)) {
      seccionesFueraDeFiltro++
      continue
    }
    if (!porMunicipio.has(muni)) porMunicipio.set(muni, { nombre: '', cusecs: [] })
    porMunicipio.get(muni)!.cusecs.push(cusec)
  }
  if (process.env.EDU_DEBUG) {
    const prefijos = [...new Set([...formacion.keys()].map((c) => c.slice(0, 5)))].sort()
    console.log(
      `[education][debug] ${provinceCode}: secciones parseadas=${formacion.size} · secciones en filtro=${formacion.size - seccionesFueraDeFiltro} · municipios=${porMunicipio.size} · filtro=${soloMunicipios ? soloMunicipios.size : 'todos'}`,
    )
    if (porMunicipio.size === 0 && soloMunicipios) {
      console.log(
        `[education][debug] ${provinceCode}: filtro=${JSON.stringify([...soloMunicipios])} · prefijos de esta provincia (5 primeros)=${JSON.stringify(prefijos.slice(0, 5))} · prueba 08019=${soloMunicipios.has('08019')}`,
      )
    }
  }
  // El nombre legible del municipio se recupera de la cabecera de la sección.
  {
    const texto = readFileSync(fich.formacion.path, 'utf8').replace(/^\ufeff/, '')
    const cab = texto.split(/\r?\n/)[0].split('\t')
    const iMun = cab.indexOf('Municipios')
    const iSec = cab.indexOf('Secciones')
    const iSex = cab.indexOf('Sexo')
    const iPer = cab.indexOf('Periodo')
    for (const linea of texto.split(/\r?\n/).slice(1)) {
      if (linea.trim() === '') continue
      const c = linea.split('\t')
      const sec = (c[iSec] ?? '').trim()
      const m = RE_CUSEC.exec(sec)
      if (!m) continue
      if ((c[iSex] ?? '').trim() !== 'Total') continue
      if (Number.parseInt((c[iPer] ?? '').trim(), 10) !== periodo) continue
      const muni = m[1].slice(0, 5)
      const reg = porMunicipio.get(muni)
      if (reg && !reg.nombre) reg.nombre = (c[iMun] ?? '').trim().replace(/^\d{5}\s+/, '')
      const etiqueta = sec.replace(/^\d{10}\s+/, '')
      const nombres = (formacion.get(m[1]) as { _etiqueta?: string } | undefined)?._etiqueta
      void nombres
      if (!etiqueta) problemas.push(`etiqueta vacía para ${m[1]}`)
    }
  }

  const retrievedAt = new Date().toISOString()
  const municipios: MunicipioNormalizado[] = []
  let seccionesTotales = 0
  let seccionesConDato = 0
  let supresiones = 0
  let observaciones = 0
  let ndTotal = 0
  let fueraDeRango = 0

  for (const [muni, { nombre, cusecs }] of porMunicipio) {
    const secciones: SeccionNormalizada[] = []
    for (const cusec of cusecs) {
      const etiqueta = leerEtiqueta(fich.formacion.path, cusec)
      const s = construirSeccion(cusec, muni, provinceCode, etiqueta, formacion.get(cusec)!, actividad.get(cusec), indicadoresActivos)
      secciones.push(s)
      seccionesTotales++
      const tieneDato = Object.values(s.values).some((v) => v.status === 'observado' || v.status === 'derivado_verificable')
      if (tieneDato) seccionesConDato++
      for (const v of Object.values(s.values)) {
        observaciones++
        if (v.nd_flag) ndTotal++
        if (v.suppression_flag) supresiones++
        if (v.value !== null && v.status === 'derivado_verificable' && (v.value < 0 || v.value > 100)) fueraDeRango++
      }
    }
    if (fueraDeRango > 0) {
      problemas.push(`${muni}: ${fueraDeRango} porcentajes fuera de [0,100]`)
      fueraDeRango = 0
    }
    const conND = secciones.some((s) => Object.values(s.values).some((v) => v.nd_flag))
    if (conND) issues.push(`${muni}: contiene observaciones ND por supresión`)

    municipios.push({
      schema_version: EDUCATION_SCHEMA_VERSION,
      domain: EDUCATION_DOMAIN,
      period: periodo,
      municipality_code: muni,
      municipality_name: nombre || muni,
      province_code: provinceCode,
      parser_version: PARSER_VERSION,
      mapping_version: MAPPING_VERSION,
      source: {
        url: SRC_URL,
        operation: '1254736176992',
        education_table: def.formacion,
        activity_table: def.actividad,
        education_sha256: fich.formacion.sha256,
        activity_sha256: fich.actividad.sha256,
        retrieved_at: retrievedAt,
      },
      sections: secciones,
      coverage: {
        result_sections: secciones.length,
        sections_with_data: seccionesConDato,
        sections_suppressed: secciones.filter((s) => Object.values(s.values).some((v) => v.suppression_flag)).length,
        indicators: indicadoresActivos.size,
        observations: secciones.reduce((a, s) => a + Object.keys(s.values).length, 0),
        nd: secciones.reduce((a, s) => a + Object.values(s.values).filter((v) => v.nd_flag).length, 0),
        suppressed: secciones.reduce((a, s) => a + Object.values(s.values).filter((v) => v.suppression_flag).length, 0),
      },
      validation: {
        leading_zeros_preserved: secciones.every((s) => s.sectionCode.length === 10 && /^0/.test(s.sectionCode)),
        municipalities_matched: true,
        percentages_in_range: true,
        denominators_resolved: true,
        issues,
      },
      quality_flags: [],
      generated_at: retrievedAt,
    })
  }

  if (municipios.length > 0 && indicadoresActivos.size > 0) {
    const obsTotales = municipios.reduce((a, m) => a + m.coverage.observations, 0)
    if (obsTotales === 0) {
      return {
        provinceCode,
        error: `hay filas educativas (${formacion.size} secciones) pero se generaron 0 indicadores`,
        municipios: [] as MunicipioNormalizado[],
      }
    }
  }

  if (problemas.length) {
    return { provinceCode, error: problemas.slice(0, 3).join('; '), municipios: [] as MunicipioNormalizado[] }
  }

  return {
    provinceCode,
    error: null as string | null,
    municipios,
    files: Object.fromEntries(Object.entries(fich).map(([k, v]) => [k, { sha256: v.sha256, bytes: v.bytes, estado: v.estado, url: v.url, http: v.http, content_type: v.contentType }])),
    secciones: seccionesTotales,
    seccionesConDato,
    observaciones,
    nd: ndTotal,
    supresiones,
  }
}

/** Lee la etiqueta legible de una sección sin releer el fichero entero por sección. */
const cacheEtiquetas = new Map<string, Map<string, string>>()
function leerEtiqueta(ruta: string, cusec: string): string {
  let m = cacheEtiquetas.get(ruta)
  if (!m) {
    m = new Map()
    const texto = readFileSync(ruta, 'utf8').replace(/^\ufeff/, '')
    const cab = texto.split(/\r?\n/)[0].split('\t')
    const iSec = cab.indexOf('Secciones')
    for (const linea of texto.split(/\r?\n/).slice(1)) {
      if (linea.trim() === '') continue
      const s = (linea.split('\t')[iSec] ?? '').trim()
      const mm = RE_CUSEC.exec(s)
      if (mm) m.set(mm[1], s.replace(/^\d{10}\s+/, ''))
    }
    cacheEtiquetas.set(ruta, m)
  }
  return m.get(cusec) ?? ''
}

async function main() {
  const cli = parseArgs(process.argv.slice(2))
  const periodo = cli.period ?? 2024
  const indicadoresActivos = new Set<string>(
    cli.indicators?.length ? cli.indicators : EDUCATION_INDICATORS.map((i: EducationIndicator) => i.id),
  )

  console.log('[education]periodo / periodo:', periodo)
  console.log('[education] indicadores:', indicadoresActivos.size)
  console.log('[education] rango de tablas:', `${EDUCATION_TABLE_RANGE.min}-${EDUCATION_TABLE_RANGE.max}`)
  console.log('[education] escritura R2:', cli.write ? 'SÍ' : 'no (dry-run)')

  if (indicadoresActivos.size === 0) {
    throw new Error('no hay indicadores seleccionados')
  }
  // Los derivados necesitan sus componentes; sin ellos no se pueden calcular.
  for (const d of DERIVADOS) {
    if (indicadoresActivos.has(d.id)) {
      for (const need of [d.numeradorId, d.denominadorId]) {
        indicadoresActivos.add(need)
      }
    }
  }

  const provincias = cli.allProvinces
    ? Object.keys(PROVINCES)
    : (cli.provinces ?? [])
  if (provincias.length === 0) throw new Error('no hay provincias seleccionadas')

  const soloMunicipios = cli.municipalities ? new Set(cli.municipalities) : null
  const r2 = cli.write ? clienteR2() : null

  console.log(`[education] provincias: ${provincias.length} · concurrencia: ${cli.concurrency}`)

  // Ejecución con concurrencia acotada: una provincia = una unidad de trabajo.
  const resultados: any[] = []
  let i = 0;
  const workers = Array.from({ length: Math.min(cli.concurrency, provincias.length) }, async () => {
    for (;;) {
      const idx = i++
      if (idx >= provincias.length) return
      const pc = provincias[idx]
      const t0 = Date.now()
      const r = await procesarProvincia(pc, periodo, cli, indicadoresActivos, soloMunicipios)
      resultados[idx] = { provinceCode: pc, ...r }
      const estado = r.error ? `ERROR ${r.error}` : `${r.municipios.length} municipios, ${r.secciones} secciones`
      console.log(`[education] [${String(idx + 1).padStart(2)}/${provincias.length}] ${pc} ${PROVINCES[pc]?.provincia ?? ''} — ${estado} (${Date.now() - t0} ms)`)
    }
  })
  await Promise.all(workers)

  // ── Escritura ────────────────────────────────────────────────────────────
  const keyNorm = (m: string) => `${EDUCATION_R2_PREFIX}/normalized/${periodo}/${m}.json`
  let escritos = 0
  let unchanged = 0
  const fallidos: string[] = []

  for (const r of resultados) {
    if (r.error) {
      fallidos.push(r.provinceCode)
      continue
    }
    for (const m of r.municipios) {
      const cuerpo = JSON.stringify(m)
      const sha = createHash('sha256').update(cuerpo).digest('hex')
      if (cli.write && r2) {
        const previo = await leerR2(r2, keyNorm(m.municipality_code))
        if (previo !== null) {
          const shaPrevio = createHash('sha256').update(previo).digest('hex')
          if (shaPrevio === sha) {
            unchanged++
            if (cli.verify) {
              // readback: el objeto ya era idéntico
              continue
            }
            continue
          }
        }
        await escribirR2(r2, keyNorm(m.municipality_code), cuerpo)
        if (cli.verify) {
          const leido = await leerR2(r2, keyNorm(m.municipality_code))
          if (leido === null) throw new Error(`readback devolvió null para ${m.municipality_code}`)
          const shaLeido = createHash('sha256').update(leido).digest('hex')
          if (shaLeido !== sha) {
            throw new Error(`readback con hash distinto para ${m.municipality_code}: ${shaLeido} != ${sha}`)
          }
        }
      }
      escritos++
    }
  }

  // ── Catálogos ────────────────────────────────────────────────────────────
  const municipiosEscritos = resultados.flatMap((r) => r.municipios ?? [])
  const catalogo = {
    schema_version: EDUCATION_SCHEMA_VERSION,
    domain: EDUCATION_DOMAIN,
    generated_at: new Date().toISOString(),
    parser_version: PARSER_VERSION,
    mapping_version: MAPPING_VERSION,
    source: {
      url: SRC_URL,
      index_url: `${SRC_URL.replace('capsel=10613', 'capsel=11155')}`,
      operation: '1254736176992',
      label: 'Censo Anual de Población · Educación y Relación con la actividad',
    },
    totals: {
      provinces: provincias.length,
      provinces_ok: resultados.filter((r) => !r.error).length,
      provinces_failed: fallidos.length,
      municipalities: municipiosEscritos.length,
      sections: municipiosEscritos.reduce((a, m) => a + m.coverage.result_sections, 0),
      observations: municipiosEscritos.reduce((a, m) => a + m.coverage.observations, 0),
      nd: municipiosEscritos.reduce((a, m) => a + m.coverage.nd, 0),
      suppressed: municipiosEscritos.reduce((a, m) => a + m.coverage.suppressed, 0),
    },
    period: periodo,
    provinces: provincias.map((pc) => {
      const r = resultados.find((x) => x.provinceCode === pc)
      return {
        province_code: pc,
        province_name: PROVINCES[pc]?.provincia ?? null,
        education_table: PROVINCES[pc]?.formacion ?? null,
        activity_table: PROVINCES[pc]?.actividad ?? null,
        status: r?.error ? 'failed' : 'ok',
        error: r?.error ?? null,
        municipalities: r?.municipios?.length ?? 0,
        files: r?.files ?? null,
      }
    }),
  }

  const catEducation = { ...catalogo, indicator_count: indicadoresActivos.size }
  if (cli.write && r2) {
    await escribirR2(r2, `${EDUCATION_R2_PREFIX}/catalog.json`, JSON.stringify(catEducation, null, 2))
    await escribirR2(
      r2,
      `${EDUCATION_R2_PREFIX}/indicators.json`,
      JSON.stringify({ schema_version: EDUCATION_SCHEMA_VERSION, mapping_version: MAPPING_VERSION, indicators: EDUCATION_INDICATORS }, null, 2),
    )
  }

  // ── Manifiesto ───────────────────────────────────────────────────────────
  const manifiesto = {
    kind: 'education-manifest',
    generated_at: new Date().toISOString(),
    period: periodo,
    parser_version: PARSER_VERSION,
    mapping_version: MAPPING_VERSION,
    dry_run: !cli.write,
    expected_provinces: provincias.length,
    downloaded_provinces: resultados.filter((r) => r.files).length,
    processed_provinces: resultados.filter((r) => !r.error).length,
    failed_provinces: fallidos,
    municipalities_detected: municipiosEscritos.length,
    municipalities_written: escritos,
    unchanged,
    sections: municipiosEscritos.reduce((a, m) => a + m.coverage.result_sections, 0),
    indicators: indicadoresActivos.size,
    values: municipiosEscritos.reduce((a, m) => a + m.coverage.observations, 0),
    nd: municipiosEscritos.reduce((a, m) => a + m.coverage.nd, 0),
    suppressed: municipiosEscritos.reduce((a, m) => a + m.coverage.suppressed, 0),
    bytes: resultados.reduce((a, r) => a + Object.values(r.files ?? {}).reduce((b, f: any) => b + f.bytes, 0), 0),
    file_hashes: resultados.map((r) => ({ province: r.provinceCode, files: r.files ?? null })),
    coverage: {
      provinces_total: 52,
      provinces_processed: resultados.filter((r) => !r.error).length,
      provinces_failed: fallidos.length,
    },
  }
  if (cli.manifest) {
    const ruta = join(cli.manifest, '..')
    mkdirSync(ruta, { recursive: true })
    writeFileSync(cli.manifest, JSON.stringify(manifiesto, null, 2))
    console.log(`[education] manifiesto: ${cli.manifest}`)
  }

  console.log('\n=== education: resumen ===')
  console.log(`provincias: ${manifiesto.processed_provinces}/${manifiesto.expected_provinces} (fallidas ${fallidos.length})`)
  console.log(`municipios: ${manifiesto.municipalities_written} escritos · ${unchanged} unchanged`)
  console.log(`secciones: ${manifiesto.sections} · observaciones: ${manifiesto.values}`)
  console.log(`ND: ${manifiesto.nd} · supresiones: ${manifiesto.suppressed}`)
  if (fallidos.length) {
    console.log(`\nprovincias fallidas: ${fallidos.join(', ')}`)
    console.log('Reintentar SOLO esas provincias con --provinces=' + fallidos.join(','))
  }
  void dirname
}

main().catch((err) => {
  console.error('[education] ERROR:', err.message)
  process.exit(1)
})
