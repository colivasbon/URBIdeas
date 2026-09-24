// Cargador dry-run de la estructura de población municipal (SOCideas v2).
//
// QUÉ HACE
//   Lee las tablas INE en streaming (NUNCA `readFileSync().toString()`: el
//   fichero municipal nacional son 684 MB), construye un
//   `PopulationStructureAnnual` por municipio, ejecuta las reconciliaciones y
//   la validación estricta, y escribe:
//     - tmp/audit/estructura-2025/<INE>.json (un objeto validado por municipio)
//     - tmp/audit/estructura-2025/resumen-ingesta.json (trazabilidad de la corrida)
//   Es un DRY-RUN: no escribe nada en R2, Supabase, Vercel ni Cloudflare.
//
// USO
//   npx tsx scripts/load-population-structure-2025.ts [--ines=45090,16211,...] [--todos] [--periodo=2025]
//   Sin `--ines` ni `--todos` usa la muestra:
//   45090,16211,28079,48020,15078,51001,52001,01041.
//
// FUENTES
//   68535 (quinquenios, municipal nacional), 68534 (edad simple, municipios
//   insulares 07/35/38) y 68065 (total municipal por sexo, cruce de control).

import { createHash } from 'node:crypto'
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { pipeline } from 'node:stream/promises'
import {
  POPULATION_STRUCTURE_SCHEMA,
  deriveBandsFromAgeDetail,
  parseValueEs,
  reconcileStructure,
  structureBandKey,
  validatePopulationStructure,
  type PopulationStructureAgeDetail,
  type PopulationStructureAnnual,
  type PopulationStructureBand,
  type StructureCrossCheck68065,
  type StructureReconciliation,
  type StructureValue,
  type StructureValueStatus,
} from '../src/lib/socideas-population-structure'

const INGESTA_DIR = 'tmp/ingesta'
const OUT_DIR = 'tmp/audit/estructura-2025'
const CSV_68535 = `${INGESTA_DIR}/68535.csv`
const CSV_68534 = `${INGESTA_DIR}/68534.csv`
const CSV_68065 = `${INGESTA_DIR}/68065.csv`
const HEADER_68535 = 'Total Nacional\tProvincias\tMunicipios\tSexo\tEdad\tNacionalidad\tPeriodo\tTotal'
const HEADER_68534 = 'Islas\tMunicipios\tSexo\tEdad\tPeriodo\tTotal'
const HEADER_68065 = 'Total Nacional\tMunicipios\tSexo\tPeriodo\tTotal'
const SOURCE_URL_68535 = 'https://www.ine.es/jaxiT3/Tabla.htm?t=68535'
const SOURCE_URL_68534 = 'https://www.ine.es/jaxiT3/Tabla.htm?t=68534'
const SOURCE_URL_68065 = 'https://www.ine.es/jaxiT3/Tabla.htm?t=68065'
const DEFAULT_SAMPLE = ['45090', '16211', '28079', '48020', '15078', '51001', '52001', '01041']
// Provincias insulares: Baleares (07), Las Palmas (35) y Santa Cruz de
// Tenerife (38). Canarias tiene DOS provincias, y la tabla 68534 las cubre
// todas (comprobado: 67 + 34 + 54 = 155 municipios; ceñirse a 07/35 dejaría
// 54 municipios tinerfeños sin edad simple).
const INSULAR_PROVINCES: ReadonlySet<string> = new Set(['07', '35', '38'])
/** Claves de los 21 grupos quinquenales: 0, 5, ..., 95, 100. */
const BAND_KEYS: readonly number[] = Array.from({ length: 21 }, (_, i) => i * 5)

type SexKey = 'total' | 'male' | 'female'

function argValue(name: string): string | null {
  const prefix = `--${name}=`
  const hit = process.argv.find((a) => a.startsWith(prefix))
  return hit === undefined ? null : hit.slice(prefix.length)
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function sexKey(sexo: string): SexKey | null {
  if (sexo === 'Total') return 'total'
  if (sexo === 'Hombres') return 'male'
  if (sexo === 'Mujeres') return 'female'
  return null
}

/** Líneas de un CSV en streaming, UTF-8 (los ficheros INE llevan BOM). */
async function* readLines(path: string): AsyncGenerator<string> {
  const rl = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity })
  for await (const line of rl) yield line
}

/** Verifica la cabecera exacta (sin BOM); si no coincide, aborta con detalle. */
function assertHeader(path: string, firstLine: string, expected: string): void {
  const clean = firstLine.replace(/^\uFEFF/, '')
  if (clean !== expected) {
    throw new Error(
      `Cabecera inesperada en ${path}\n  esperada: ${JSON.stringify(expected)}\n  recibida: ${JSON.stringify(clean)}`,
    )
  }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

/** Etiqueta canónica del grupo a partir de su clave (0, 5, ..., 100). */
function bandLabel(key: number): string {
  return key === 100 ? '100 y más años' : `${key} a ${key + 4} años`
}

/** "0 años" / "1 año" / "100 y más años" → 0..100; `null` si no reconocible. */
function parseAgeLabel(label: string): number | null {
  const text = label.trim()
  if (/^100\s+y\s+m[aá]s/.test(text)) return 100
  const match = /^(\d{1,3})\s+a[nñ]os?$/.exec(text)
  if (match === null) return null
  const age = Number(match[1])
  return Number.isInteger(age) && age >= 0 && age <= 100 ? age : null
}

/** Estado más grave de una serie (missing > suppressed > observed). */
function worstStatus(statuses: readonly StructureValueStatus[]): StructureValueStatus {
  if (statuses.includes('missing')) return 'missing'
  if (statuses.includes('suppressed')) return 'suppressed'
  return 'observed'
}

const MISSING_VALUE: StructureValue = { value: null, status: 'missing' }

// ============================================================================
// Lectura de las fuentes
// ============================================================================

interface MunAccum {
  name: string
  bands: Map<number, Partial<Record<SexKey, StructureValue>>>
  totals: Partial<Record<SexKey, StructureValue>>
}

interface DetailAccum {
  name: string
  ages: Map<number, Partial<Record<SexKey, StructureValue>>>
  ageLabels: Map<number, string>
  totals: Partial<Record<SexKey, StructureValue>>
}

interface FileScan<A> {
  acc: Map<string, A>
  lineas: number
  ms: number
}

/** Primera pasada por 68535: quinquenios + totales por sexo del período pedido. */
async function scan68535(
  targets: ReadonlySet<string> | null,
  periodo: string,
  warnings: string[],
): Promise<FileScan<MunAccum>> {
  const acc = new Map<string, MunAccum>()
  const t0 = Date.now()
  let lineas = 0
  let edadesDesconocidas = 0
  let sexosDesconocidos = 0
  const lines = readLines(CSV_68535)
  const first = await lines.next()
  if (first.done) throw new Error(`Fichero vacío: ${CSV_68535}`)
  assertHeader(CSV_68535, first.value, HEADER_68535)
  lineas = 1
  for await (const line of lines) {
    lineas += 1
    const c = line.split('\t')
    if (c.length < 8) continue
    if (c[5] !== 'Total') continue
    if (c[6] !== periodo) continue
    const muniRaw = (c[2] ?? '').trim()
    if (muniRaw === '') continue
    const match = /^(\d{5})\s+(.+)$/.exec(muniRaw)
    if (match === null) continue
    const ine = match[1]
    if (targets !== null && !targets.has(ine)) continue
    const sexo = sexKey(c[3] ?? '')
    if (sexo === null) {
      sexosDesconocidos += 1
      continue
    }
    const value = parseValueEs(c[7])
    let entry = acc.get(ine)
    if (entry === undefined) {
      entry = { name: match[2].trim(), bands: new Map(), totals: {} }
      acc.set(ine, entry)
    }
    const edad = (c[4] ?? '').trim()
    if (edad === 'Todas las edades') {
      entry.totals[sexo] = value
      continue
    }
    const key = structureBandKey(edad)
    if (!Number.isFinite(key)) {
      edadesDesconocidas += 1
      continue
    }
    const bucket = entry.bands.get(key) ?? {}
    bucket[sexo] = value
    entry.bands.set(key, bucket)
  }
  if (sexosDesconocidos > 0) warnings.push(`68535: ${sexosDesconocidos} filas con Sexo no reconocido (ignoradas)`)
  if (edadesDesconocidas > 0) warnings.push(`68535: ${edadesDesconocidas} filas con Edad no reconocida (ignoradas)`)
  return { acc, lineas, ms: Date.now() - t0 }
}

/** Segunda pasada por 68534: edad simple de municipios insulares (07/35/38). */
async function scan68534(
  targets: ReadonlySet<string> | null,
  periodo: string,
  warnings: string[],
): Promise<FileScan<DetailAccum>> {
  const acc = new Map<string, DetailAccum>()
  const t0 = Date.now()
  let lineas = 0
  let edadesDesconocidas = 0
  const lines = readLines(CSV_68534)
  const first = await lines.next()
  if (first.done) throw new Error(`Fichero vacío: ${CSV_68534}`)
  assertHeader(CSV_68534, first.value, HEADER_68534)
  lineas = 1
  for await (const line of lines) {
    lineas += 1
    const c = line.split('\t')
    if (c.length < 6) continue
    if (c[4] !== periodo) continue
    const muniRaw = (c[1] ?? '').trim()
    if (muniRaw === '') continue
    const match = /^(\d{5})\s+(.+)$/.exec(muniRaw)
    if (match === null) continue
    const ine = match[1]
    if (targets !== null && !targets.has(ine)) continue
    const sexo = sexKey(c[2] ?? '')
    if (sexo === null) continue
    const value = parseValueEs(c[5])
    let entry = acc.get(ine)
    if (entry === undefined) {
      entry = { name: match[2].trim(), ages: new Map(), ageLabels: new Map(), totals: {} }
      acc.set(ine, entry)
    }
    const edadRaw = (c[3] ?? '').trim()
    if (edadRaw === 'Todas las edades') {
      entry.totals[sexo] = value
      continue
    }
    const age = parseAgeLabel(edadRaw)
    if (age === null) {
      edadesDesconocidas += 1
      continue
    }
    const bucket = entry.ages.get(age) ?? {}
    bucket[sexo] = value
    entry.ages.set(age, bucket)
    if (!entry.ageLabels.has(age)) entry.ageLabels.set(age, edadRaw)
  }
  if (edadesDesconocidas > 0) warnings.push(`68534: ${edadesDesconocidas} filas con Edad no reconocida (ignoradas)`)
  return { acc, lineas, ms: Date.now() - t0 }
}

/** Cruce con 68065: total municipal por sexo del período pedido. */
async function scan68065(
  targets: ReadonlySet<string> | null,
  periodo: string,
): Promise<FileScan<Partial<Record<SexKey, StructureValue>>>> {
  const acc = new Map<string, Partial<Record<SexKey, StructureValue>>>()
  const t0 = Date.now()
  let lineas = 0
  const lines = readLines(CSV_68065)
  const first = await lines.next()
  if (first.done) throw new Error(`Fichero vacío: ${CSV_68065}`)
  assertHeader(CSV_68065, first.value, HEADER_68065)
  lineas = 1
  for await (const line of lines) {
    lineas += 1
    const c = line.split('\t')
    if (c.length < 5) continue
    if (c[3] !== periodo) continue
    const muniRaw = (c[1] ?? '').trim()
    if (muniRaw === '') continue
    const match = /^(\d{5})\s+(.+)$/.exec(muniRaw)
    if (match === null) continue
    const ine = match[1]
    if (targets !== null && !targets.has(ine)) continue
    const sexo = sexKey(c[2] ?? '')
    if (sexo === null) continue
    const bucket = acc.get(ine) ?? {}
    bucket[sexo] = parseValueEs(c[4])
    acc.set(ine, bucket)
  }
  return { acc, lineas, ms: Date.now() - t0 }
}

// ============================================================================
// Construcción del objeto
// ============================================================================

function buildBand(
  key: number,
  values: Partial<Record<SexKey, StructureValue>> | undefined,
): PopulationStructureBand {
  const total = values?.total ?? MISSING_VALUE
  const male = values?.male ?? MISSING_VALUE
  const female = values?.female ?? MISSING_VALUE
  return {
    band: bandLabel(key),
    total: total.value,
    male: male.value,
    female: female.value,
    status: worstStatus([total.status, male.status, female.status]),
  }
}

function buildTotals(
  values: Partial<Record<SexKey, StructureValue>> | undefined,
): { total: number | null; male: number | null; female: number | null } {
  return {
    total: values?.total?.value ?? null,
    male: values?.male?.value ?? null,
    female: values?.female?.value ?? null,
  }
}

/** Detalle por edad simple (101 edades) a partir de la 68534. */
function buildDetail(accum: DetailAccum, warnings: string[], ine: string): PopulationStructureAgeDetail[] {
  const detail: PopulationStructureAgeDetail[] = []
  for (let age = 0; age <= 100; age += 1) {
    const values = accum.ages.get(age)
    const total = values?.total ?? MISSING_VALUE
    const male = values?.male ?? MISSING_VALUE
    const female = values?.female ?? MISSING_VALUE
    const expectedLabel = age === 100 ? '100 y más años' : age === 1 ? '1 año' : `${age} años`
    const sourceLabel = accum.ageLabels.get(age)
    if (sourceLabel !== undefined && sourceLabel !== expectedLabel) {
      warnings.push(`${ine}: etiqueta de edad ${age} distinta de la canónica en 68534: ${JSON.stringify(sourceLabel)}`)
    }
    detail.push({
      age,
      label: expectedLabel,
      total: total.value,
      male: male.value,
      female: female.value,
      status: worstStatus([total.status, male.status, female.status]),
    })
  }
  return detail
}

/** ¿Las bandas cubren exactamente 0, 5, ..., 100 en orden? */
function bandSetCompleta(bands: readonly PopulationStructureBand[]): boolean {
  const keys = bands.map((band) => structureBandKey(band.band))
  return keys.length === BAND_KEYS.length && keys.every((key, i) => key === BAND_KEYS[i])
}

/** Cruce con 68065: compara total y sexos (null en 68065 = no encontrado). */
function crossCheck68065From(
  values: Partial<Record<SexKey, StructureValue>> | undefined,
  totals: { total: number | null; male: number | null; female: number | null },
): StructureCrossCheck68065 | null {
  if (values === undefined) return null
  const cross: StructureCrossCheck68065 = {
    total: values.total?.value ?? null,
    male: values.male?.value ?? null,
    female: values.female?.value ?? null,
    matches: false,
  }
  cross.matches = cross.total === totals.total && cross.male === totals.male && cross.female === totals.female
  return cross
}

interface Cruce68535 {
  bandasComparadas: number
  bandasDivergentes: number
  totalCoincide: boolean | null
}

function cruceCon68535(
  bands: readonly PopulationStructureBand[],
  totals: { total: number | null },
  acc35: MunAccum,
): Cruce68535 {
  let comparadas = 0
  let divergentes = 0
  for (const band of bands) {
    const ref = acc35.bands.get(structureBandKey(band.band))
    const refValue = ref?.total?.status === 'observed' ? ref.total.value : null
    if (band.total === null || refValue === null) continue
    comparadas += 1
    if (band.total !== refValue) divergentes += 1
  }
  const refTotal = buildTotals(acc35.totals).total
  const totalCoincide =
    refTotal === null || totals.total === null ? null : refTotal === totals.total
  return { bandasComparadas: comparadas, bandasDivergentes: divergentes, totalCoincide }
}

interface BuiltMunicipality {
  data: PopulationStructureAnnual
  checks: StructureReconciliation[]
  cruce68535: Cruce68535 | null
}

interface BuildParams {
  ine: string
  name: string
  periodo: string
  retrievedAt: string
  sourceTable: '68535' | '68534'
  sourceUrl: string
  bands: PopulationStructureBand[]
  detail: PopulationStructureAgeDetail[] | null
  totals: { total: number | null; male: number | null; female: number | null }
  checksum: string
  cross: StructureCrossCheck68065 | null
  acc35: MunAccum | null
}

function buildMunicipality(params: BuildParams): BuiltMunicipality {
  const data: PopulationStructureAnnual = {
    schemaVersion: POPULATION_STRUCTURE_SCHEMA,
    sourceTable: params.sourceTable,
    sourceUrl: params.sourceUrl,
    scope: params.sourceTable === '68534' ? 'municipal_insular' : 'municipal_national',
    period: params.periodo,
    retrievedAt: params.retrievedAt,
    ineCode: params.ine,
    municipalityName: params.name,
    ageBands5y: params.bands,
    ageDetail: params.detail,
    totals: params.totals,
    quality: {
      territoryMatch: 'exact',
      totalBySexReconciled: false,
      totalByAgeReconciled: false,
      groupingReconciled: false,
      sourceChecksum: params.checksum,
      validationStatus: 'failed',
      crossCheck68065: params.cross,
    },
  }
  const checks = reconcileStructure(data)
  const byId = new Map(checks.map((check) => [check.id, check]))
  const bandChecks = checks.filter((check) => check.id.startsWith('banda-'))
  data.quality.totalBySexReconciled = byId.get('totales-sexo')?.ok ?? false
  data.quality.totalByAgeReconciled = byId.get('bandas-total')?.ok ?? false
  data.quality.groupingReconciled =
    bandSetCompleta(data.ageBands5y) && (data.ageDetail === null || bandChecks.every((check) => check.ok))
  const hardMismatch = checks.some(
    (check) => check.izquierda !== null && check.derecha !== null && !check.ok,
  )
  const unverifiable = checks.some((check) => check.izquierda === null || check.derecha === null)
  const hasNonObserved =
    data.ageBands5y.some((band) => band.status !== 'observed') ||
    (data.ageDetail?.some((entry) => entry.status !== 'observed') ?? false)
  data.quality.validationStatus = hardMismatch ? 'failed' : unverifiable || hasNonObserved ? 'partial' : 'passed'
  const cruce68535 =
    params.acc35 === null ? null : cruceCon68535(data.ageBands5y, data.totals, params.acc35)
  return { data, checks, cruce68535 }
}

// ============================================================================
// Resumen, escritura y salida
// ============================================================================

interface CheckSummary {
  total: number
  ok: number
  noVerificables: number
  fallos: number
  fallosIds: string[]
}

function summarizeChecks(checks: readonly StructureReconciliation[]): CheckSummary {
  let ok = 0
  let noVerificables = 0
  let fallos = 0
  const fallosIds: string[] = []
  for (const check of checks) {
    if (check.ok) {
      ok += 1
      continue
    }
    if (check.izquierda === null || check.derecha === null) {
      noVerificables += 1
      continue
    }
    fallos += 1
    fallosIds.push(check.id)
  }
  return { total: checks.length, ok, noVerificables, fallos, fallosIds }
}

/** Percentil por rango más cercano (nearest-rank) sobre una lista ordenada. */
function percentileNearestRank(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0
  const rank = Math.ceil(p * sorted.length)
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1))
  return sorted[index]
}

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`
}

async function main(): Promise<void> {
  const periodo = argValue('periodo') ?? '2025'
  if (!/^\d{4}$/.test(periodo)) {
    throw new Error(`Período inválido: ${JSON.stringify(periodo)} (se espera un año de 4 dígitos)`)
  }
  const todos = hasFlag('todos')
  const inesArg = argValue('ines')
  const modo: 'muestra' | 'ines' | 'todos' = todos ? 'todos' : inesArg !== null ? 'ines' : 'muestra'
  // En PowerShell un token suelto con cero inicial (01041) se evalúa como
  // número y pierde el cero ("1041"). Se re-rellena de forma determinista
  // (los INE son códigos de 5 dígitos) y se deja constancia en warnings.
  const normalizados: string[] = []
  const crudos = todos
    ? []
    : inesArg !== null
      ? inesArg.split(',').map((s) => s.trim()).filter((s) => s !== '')
      : [...DEFAULT_SAMPLE]
  const solicitados = crudos.map((token) => {
    if (/^\d{4}$/.test(token)) {
      const padded = `0${token}`
      normalizados.push(`${token} -> ${padded}`)
      return padded
    }
    return token
  })
  if (!todos) {
    if (solicitados.length === 0) throw new Error('La lista --ines está vacía')
    for (const ine of solicitados) {
      if (!/^\d{5}$/.test(ine)) throw new Error(`INE inválido (se esperan 5 dígitos): ${JSON.stringify(ine)}`)
    }
    const duplicados = [...new Set(solicitados.filter((ine, i) => solicitados.indexOf(ine) !== i))]
    if (duplicados.length > 0) throw new Error(`INES duplicados en --ines: ${duplicados.join(', ')}`)
  }

  const errores: string[] = []
  const warnings: string[] = []
  for (const normalizado of normalizados) {
    warnings.push(`INE de 4 dígitos normalizado con cero inicial: ${normalizado}`)
  }
  const startedAt = Date.now()
  console.log(`Estructura de población INE · período ${periodo} · modo ${modo}${todos ? '' : ` (${solicitados.length} INEs)`}`)

  const checksumMs = new Map<string, number>()
  const timedSha = async (path: string): Promise<string> => {
    const t0 = Date.now()
    const sha = await sha256File(path)
    checksumMs.set(path, Date.now() - t0)
    return sha
  }
  const sha68535 = await timedSha(CSV_68535)
  const sha68065 = await timedSha(CSV_68065)

  const scan35 = await scan68535(todos ? null : new Set(solicitados), periodo, warnings)
  const ineList = todos ? [...scan35.acc.keys()].sort() : solicitados
  const insulares = ineList.filter((ine) => INSULAR_PROVINCES.has(ine.slice(0, 2)) && scan35.acc.has(ine))
  let scan34: FileScan<DetailAccum> | null = null
  let sha68534: string | null = null
  if (insulares.length > 0) {
    scan34 = await scan68534(todos ? null : new Set(insulares), periodo, warnings)
    sha68534 = await timedSha(CSV_68534)
  }
  const scan65 = await scan68065(todos ? null : new Set(solicitados), periodo)

  mkdirSync(OUT_DIR, { recursive: true })
  const retrievedAt = new Date().toISOString()
  const sizes: number[] = []
  const porMunicipio = new Map<string, BuiltMunicipality>()
  const reconciliaciones = new Map<
    string,
    { validationStatus: string; checks: CheckSummary; cruce68535: Cruce68535 | null; cruce68065: string }
  >()
  let escritos = 0

  for (const ine of ineList) {
    const acc35 = scan35.acc.get(ine)
    if (acc35 === undefined) {
      errores.push(`${ine}: sin filas en 68535 para ${periodo}`)
      continue
    }
    const esInsular = INSULAR_PROVINCES.has(ine.slice(0, 2))
    let bands = BAND_KEYS.map((key) => buildBand(key, acc35.bands.get(key)))
    let detail: PopulationStructureAgeDetail[] | null = null
    let sourceTable: '68535' | '68534' = '68535'
    let sourceUrl = SOURCE_URL_68535
    let checksum = sha68535
    let name = acc35.name
    let totals = buildTotals(acc35.totals)
    if (esInsular) {
      if (scan34 === null || sha68534 === null) {
        errores.push(`${ine}: municipio insular pero 68534 no está disponible`)
        continue
      }
      const acc34 = scan34.acc.get(ine)
      if (acc34 === undefined) {
        errores.push(`${ine}: sin filas en 68534 para ${periodo}`)
        continue
      }
      detail = buildDetail(acc34, warnings, ine)
      bands = deriveBandsFromAgeDetail(detail)
      sourceTable = '68534'
      sourceUrl = SOURCE_URL_68534
      checksum = sha68534
      name = acc34.name
      totals = buildTotals(acc34.totals)
    }
    const cross = crossCheck68065From(scan65.acc.get(ine), totals)
    const built = buildMunicipality({
      ine,
      name,
      periodo,
      retrievedAt,
      sourceTable,
      sourceUrl,
      bands,
      detail,
      totals,
      checksum,
      cross,
      acc35: esInsular ? acc35 : null,
    })
    const validation = validatePopulationStructure(built.data)
    if (!validation.ok) {
      errores.push(`${ine}: validación estricta fallida -> ${validation.errors.join(' | ')}`)
      continue
    }
    const json = JSON.stringify(validation.data, null, 2)
    writeFileSync(`${OUT_DIR}/${ine}.json`, json, 'utf8')
    sizes.push(Buffer.byteLength(json, 'utf8'))
    escritos += 1
    porMunicipio.set(ine, built)
    reconciliaciones.set(ine, {
      validationStatus: validation.data.quality.validationStatus,
      checks: summarizeChecks(built.checks),
      cruce68535: built.cruce68535,
      cruce68065: cross === null ? 'no_encontrado' : cross.matches ? 'match' : 'mismatch',
    })
  }

  sizes.sort((a, b) => a - b)
  const resumen = {
    schema: 'socideas-population-structure-ingest@1',
    generadoEn: new Date().toISOString(),
    periodo,
    modo,
    inesSolicitados: todos ? null : solicitados,
    municipiosEscritos: escritos,
    msTotal: Date.now() - startedAt,
    ficheros: {
      '68535': {
        ruta: CSV_68535,
        url: SOURCE_URL_68535,
        filasLeidas: scan35.lineas - 1,
        msIngesta: scan35.ms,
        msChecksum: checksumMs.get(CSV_68535) ?? null,
        sha256: sha68535,
      },
      '68534':
        scan34 === null || sha68534 === null
          ? null
          : {
              ruta: CSV_68534,
              url: SOURCE_URL_68534,
              filasLeidas: scan34.lineas - 1,
              msIngesta: scan34.ms,
              msChecksum: checksumMs.get(CSV_68534) ?? null,
              sha256: sha68534,
            },
      '68065': {
        ruta: CSV_68065,
        url: SOURCE_URL_68065,
        filasLeidas: scan65.lineas - 1,
        msIngesta: scan65.ms,
        msChecksum: checksumMs.get(CSV_68065) ?? null,
        sha256: sha68065,
      },
    },
    objetos: {
      escritos,
      bytesMedio: sizes.length === 0 ? 0 : Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length),
      bytesP95: percentileNearestRank(sizes, 0.95),
      bytesMaximo: sizes.length === 0 ? 0 : sizes[sizes.length - 1],
    },
    reconciliaciones: Object.fromEntries(reconciliaciones),
    errores,
    warnings,
  }
  writeFileSync(`${OUT_DIR}/resumen-ingesta.json`, JSON.stringify(resumen, null, 2), 'utf8')

  for (const ine of ineList) {
    const built = porMunicipio.get(ine)
    if (built === undefined) continue
    const summary = reconciliaciones.get(ine)
    if (summary === undefined) continue
    const data = built.data
    const primera = data.ageBands5y[0]
    const fmt = (v: number | null): string => (v === null ? 'ND' : String(v))
    console.log(`[${ine}] ${data.municipalityName} · ${data.sourceTable}/${data.scope}`)
    console.log(
      `  0-4: T=${fmt(primera.total)} H=${fmt(primera.male)} M=${fmt(primera.female)} · total: T=${fmt(data.totals.total)} H=${fmt(data.totals.male)} M=${fmt(data.totals.female)}`,
    )
    const c = summary.checks
    const cruce35 = summary.cruce68535
    const cruce35Txt =
      cruce35 === null
        ? ''
        : ` · cruce 68535: ${cruce35.bandasComparadas - cruce35.bandasDivergentes}/${cruce35.bandasComparadas} bandas coinciden, total ${cruce35.totalCoincide === null ? 'sin verificar' : cruce35.totalCoincide ? 'coincide' : 'DIVERGE'}`
    console.log(
      `  reconciliación: ${c.ok}/${c.total} ok · sin verificar ${c.noVerificables} · fallos duros ${c.fallos}${c.fallosIds.length > 0 ? ` (${c.fallosIds.join(', ')})` : ''} · 68065 ${summary.cruce68065 === 'match' ? 'coincide' : summary.cruce68065 === 'mismatch' ? 'DIVERGE' : 'no encontrado'} · validación ${summary.validationStatus}${cruce35Txt}`,
    )
  }

  console.log('')
  console.log(
    `Ficheros: 68535 ${scan35.lineas - 1} filas (${formatMs(scan35.ms)}) · 68065 ${scan65.lineas - 1} filas (${formatMs(scan65.ms)}) · ` +
      (scan34 === null ? '68534 no usada' : `68534 ${scan34.lineas - 1} filas (${formatMs(scan34.ms)})`),
  )
  console.log(
    `Escritos: ${escritos} JSON en ${OUT_DIR} · objetos: medio ${resumen.objetos.bytesMedio} B · p95 ${resumen.objetos.bytesP95} B · máx ${resumen.objetos.bytesMaximo} B`,
  )
  console.log(`Resumen: ${OUT_DIR}/resumen-ingesta.json · sha256 68535 ${sha68535.slice(0, 16)}… · 68065 ${sha68065.slice(0, 16)}…${sha68534 === null ? '' : ` · 68534 ${sha68534.slice(0, 16)}…`}`)
  if (warnings.length > 0) {
    console.log(`Warnings (${warnings.length}):`)
    for (const warning of warnings.slice(0, 20)) console.log(`  - ${warning}`)
    if (warnings.length > 20) console.log(`  ... y ${warnings.length - 20} más`)
  }
  if (errores.length > 0) {
    console.error(`Errores (${errores.length}):`)
    for (const error of errores) console.error(`  - ${error}`)
    process.exitCode = 1
  } else {
    console.log('Sin errores.')
  }
}

main().catch((error: unknown) => {
  console.error('ERROR', error instanceof Error ? error.message : error)
  process.exitCode = 1
})



