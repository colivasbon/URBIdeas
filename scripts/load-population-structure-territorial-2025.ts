// Cargador dry-run de la estructura de población territorial (SOCideas v2).
//
// QUÉ HACE
//   Lee en streaming la tabla INE 68521 (nacionalidad "Total"; nacional,
//   comunidades y ciudades autónomas y provincias), con la misma desagregación
//   quinquenal que la municipal 68535, construye un
//   `TerritorialPopulationStructure` por territorio, reutiliza el contrato
//   municipal (`computeTerritorialIndicators`, `reconcileTerritorialStructure`)
//   y escribe:
//     - tmp/audit/estructura-2025/territorio/nacional/ES.json
//     - tmp/audit/estructura-2025/territorio/ccaa/<Código INE 2 dígitos>.json
//     - tmp/audit/estructura-2025/territorio/provincia/<Código INE 2 dígitos>.json
//     - tmp/audit/estructura-2025/refs.json  (benchmarkRefs de cada municipio)
//     - tmp/audit/manifest-population-structure-v2-2.json
//     - tmp/audit/reconciliacion-benchmark-2025.{md,json}
//   Es un DRY-RUN: no escribe nada en R2, Supabase, Vercel ni Cloudflare.
//
// USO
//   npx tsx scripts/load-population-structure-territorial-2025.ts [--muestra] [--periodo=2025]
//   `--muestra` añade el informe detallado de Toledo (45), Castilla-La Mancha
//   (08) y España. El dataset territorial completo se construye y escribe
//   siempre (los controles secundarios necesitan todas las provincias y CCAA).
//
// FUENTES
//   68521 (quinquenios, nacional/CCAA/provincia, nacionalidad Total).
//   68535 se usa solo como control: SHA-256, recuento de filas y verificación
//   de que sus 21 etiquetas de banda son idénticas a las de 68521.

import { createHash } from 'node:crypto'
import { createReadStream, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { pipeline } from 'node:stream/promises'
import {
  POPULATION_BENCHMARK_REFS_SCHEMA,
  POPULATION_STRUCTURE_DATASET_SCHEMA,
  canonicalBandLabel,
  computeTerritorialIndicators,
  parseValueEs,
  reconcileTerritorialStructure,
  structureBandKey,
  territorialValueStatus,
  validatePopulationBenchmarkRefs,
  validatePopulationStructureDataset,
  type PopulationBenchmarkRefs,
  type PopulationBenchmarkRefsIndex,
  type PopulationSourceManifestEntry,
  type PopulationStructureBand,
  type PopulationStructureDataset,
  type StructureValue,
  type StructureValueStatus,
  type TerritorialLevel,
  type TerritorialPopulationStructure,
  type TerritorialValidationStatus,
} from '../src/lib/socideas-population-structure'

const INGESTA_DIR = 'tmp/ingesta'
const OUT_DIR = 'tmp/audit/estructura-2025'
const TERR_DIR = `${OUT_DIR}/territorio`
const AUDIT_DIR = 'tmp/audit'
const CSV_68521 = `${INGESTA_DIR}/68521.csv`
const CSV_68535 = `${INGESTA_DIR}/68535.csv`
const HEADER_68521 =
  'Total Nacional\tComunidades y Ciudades Autónomas\tProvincias\tSexo\tEdad\tPaís de nacionalidad\tPeriodo\tTotal'
const HEADER_68535 = 'Total Nacional\tProvincias\tMunicipios\tSexo\tEdad\tNacionalidad\tPeriodo\tTotal'
const SOURCE_URL_68521 = 'https://www.ine.es/jaxiT3/Tabla.htm?t=68521'
const SOURCE_URL_68535 = 'https://www.ine.es/jaxiT3/Tabla.htm?t=68535'
const NATIONAL_NAME = 'España'
/** Claves de los 21 grupos quinquenales: 0, 5, ..., 95, 100. */
const BAND_KEYS: readonly number[] = Array.from({ length: 21 }, (_, i) => i * 5)
/** Territorios del informe de muestra. */
const DEFAULT_FOCO = ['45', '08', 'ES']

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

/** Estado más grave de una serie (missing > suppressed > observed). */
function worstStatus(statuses: readonly StructureValueStatus[]): StructureValueStatus {
  if (statuses.includes('missing')) return 'missing'
  if (statuses.includes('suppressed')) return 'suppressed'
  return 'observed'
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

function sizeStats(sizes: readonly number[]): { medio: number; p95: number; maximo: number; total: number } {
  const sorted = [...sizes].sort((a, b) => a - b)
  const total = sorted.reduce((a, b) => a + b, 0)
  return {
    medio: sorted.length === 0 ? 0 : Math.round(total / sorted.length),
    p95: percentileNearestRank(sorted, 0.95),
    maximo: sorted.length === 0 ? 0 : sorted[sorted.length - 1],
    total,
  }
}

const MISSING_VALUE: StructureValue = { value: null, status: 'missing' }

// ============================================================================
// Lectura de la tabla 68521
// ============================================================================

interface BandAccum {
  total?: StructureValue
  male?: StructureValue
  female?: StructureValue
}

interface TerrAccum {
  level: TerritorialLevel
  code: string
  name: string
  /** Código de la CCAA contenedora (solo provincias; se deriva de la fuente). */
  ccaaCode: string | null
  bands: Map<number, BandAccum>
  totals: Partial<Record<SexKey, StructureValue>>
}

interface ScanResult {
  /** período -> clave de territorio -> acumulador. */
  byPeriod: Map<string, Map<string, TerrAccum>>
  /** provincia (2 dígitos) -> CCAA (2 dígitos), derivado de las filas de provincia. */
  provToCcaa: Map<string, string>
  /** Etiquetas de Edad vistas en 68521 (nacionalidad "Total"). */
  ageLabels: Set<string>
  rows: number
}

function terrKey(level: TerritorialLevel, code: string): string {
  return level === 'nacional' ? 'N' : `${level === 'ccaa' ? 'C' : 'P'}${code}`
}

/** Primera pasada: acumula la tabla 68521 para nacionalidad "Total". */
async function scan68521(errores: string[]): Promise<ScanResult> {
  const byPeriod = new Map<string, Map<string, TerrAccum>>()
  const provToCcaa = new Map<string, string>()
  const ageLabels = new Set<string>()
  const ccaaNames = new Map<string, string>()
  let rows = 0
  const lines = readLines(CSV_68521)
  const first = await lines.next()
  if (first.done) throw new Error(`Fichero vacío: ${CSV_68521}`)
  assertHeader(CSV_68521, first.value, HEADER_68521)
  for await (const line of lines) {
    rows += 1
    const c = line.split('\t')
    if (c.length < 8) continue
    if (c[5] !== 'Total') continue
    const periodo = c[6] ?? ''
    if (!/^\d{4}$/.test(periodo)) {
      errores.push(`68521: período no anual en fila ${rows + 1}: ${JSON.stringify(periodo)}`)
      continue
    }
    const raw0 = (c[0] ?? '').trim()
    const raw1 = (c[1] ?? '').trim()
    const raw2 = (c[2] ?? '').trim()
    let level: TerritorialLevel
    let code: string
    let name: string
    let ccaaCode: string | null = null
    if (raw2 !== '') {
      const match = /^(\d{2})\s+(.+)$/.exec(raw2)
      if (match === null) {
        errores.push(`68521: provincia no reconocible: ${JSON.stringify(raw2)}`)
        continue
      }
      level = 'provincia'
      code = match[1]
      name = match[2].trim()
      const parent = /^(\d{2})\s+/.exec(raw1)
      if (parent === null) {
        errores.push(`68521: provincia ${code} sin CCAA contenedora: ${JSON.stringify(raw1)}`)
        continue
      }
      ccaaCode = parent[1]
      const known = provToCcaa.get(code)
      if (known !== undefined && known !== ccaaCode) {
        errores.push(`68521: provincia ${code} mapeada a dos CCAA (${known} y ${ccaaCode})`)
        continue
      }
      provToCcaa.set(code, ccaaCode)
    } else if (raw1 !== '') {
      const match = /^(\d{2})\s+(.+)$/.exec(raw1)
      if (match === null) {
        errores.push(`68521: CCAA no reconocible: ${JSON.stringify(raw1)}`)
        continue
      }
      level = 'ccaa'
      code = match[1]
      name = match[2].trim()
      ccaaNames.set(code, name)
    } else if (raw0 === 'Total Nacional') {
      level = 'nacional'
      code = 'ES'
      name = NATIONAL_NAME
    } else {
      errores.push(`68521: fila sin jerarquía territorial reconocible (col0=${JSON.stringify(raw0)})`)
      continue
    }
    const sexo = sexKey(c[3] ?? '')
    if (sexo === null) {
      errores.push(`68521: sexo no reconocido: ${JSON.stringify(c[3])}`)
      continue
    }
    const value = parseValueEs(c[7])
    const periodMap = byPeriod.get(periodo) ?? new Map<string, TerrAccum>()
    byPeriod.set(periodo, periodMap)
    const key = terrKey(level, code)
    let entry = periodMap.get(key)
    if (entry === undefined) {
      entry = { level, code, name, ccaaCode, bands: new Map(), totals: {} }
      periodMap.set(key, entry)
    }
    const edad = (c[4] ?? '').trim()
    if (edad !== '') ageLabels.add(edad)
    if (edad === 'Todas las edades') {
      entry.totals[sexo] = value
      continue
    }
    const bandKey = structureBandKey(edad)
    if (!Number.isFinite(bandKey)) {
      errores.push(`68521: edad no reconocible: ${JSON.stringify(edad)}`)
      continue
    }
    const bucket = entry.bands.get(bandKey) ?? {}
    bucket[sexo] = value
    entry.bands.set(bandKey, bucket)
  }
  return { byPeriod, provToCcaa, ageLabels, rows }
}

/** Segunda pasada (solo control): filas y etiquetas de Edad de 68535. */
async function scan68535Meta(): Promise<{ rows: number; ageLabels: Set<string> }> {
  const ageLabels = new Set<string>()
  let rows = 0
  const lines = readLines(CSV_68535)
  const first = await lines.next()
  if (first.done) throw new Error(`Fichero vacío: ${CSV_68535}`)
  assertHeader(CSV_68535, first.value, HEADER_68535)
  for await (const line of lines) {
    rows += 1
    const c = line.split('\t')
    if (c.length < 8) continue
    const edad = (c[4] ?? '').trim()
    if (edad !== '') ageLabels.add(edad)
  }
  return { rows, ageLabels }
}

// ============================================================================
// Construcción de objetos territoriales
// ============================================================================

/** ¿El acumulador tiene las 21 bandas y los totales en los 3 sexos? */
function isComplete(acc: TerrAccum): boolean {
  if (acc.totals.total === undefined || acc.totals.male === undefined || acc.totals.female === undefined) {
    return false
  }
  for (const key of BAND_KEYS) {
    const band = acc.bands.get(key)
    if (band === undefined || band.total === undefined || band.male === undefined || band.female === undefined) {
      return false
    }
  }
  return true
}

function buildBand(key: number, band: BandAccum | undefined): PopulationStructureBand {
  const total = band?.total ?? MISSING_VALUE
  const male = band?.male ?? MISSING_VALUE
  const female = band?.female ?? MISSING_VALUE
  return {
    band: canonicalBandLabel(key),
    total: total.value,
    male: male.value,
    female: female.value,
    status: worstStatus([total.status, male.status, female.status]),
  }
}

interface BuildContext {
  period: string
  retrievedAt: string
  checksum: string
}

function buildTerritorial(acc: TerrAccum, ctx: BuildContext): TerritorialPopulationStructure {
  const ageBands = BAND_KEYS.map((key) => buildBand(key, acc.bands.get(key)))
  const base: TerritorialPopulationStructure = {
    territoryCode: acc.code,
    territoryName: acc.name,
    territoryLevel: acc.level,
    period: ctx.period,
    total: acc.totals.total?.value ?? null,
    male: acc.totals.male?.value ?? null,
    female: acc.totals.female?.value ?? null,
    ageBands,
    derivedIndicators: [],
    source: {
      table: '68521',
      url: SOURCE_URL_68521,
      checksum: ctx.checksum,
      retrievedAt: ctx.retrievedAt,
    },
    quality: {
      valueStatus: 'missing',
      totalBySexReconciled: false,
      totalByAgeReconciled: false,
      validationStatus: 'failed',
    },
  }
  base.derivedIndicators = computeTerritorialIndicators(base)
  const checks = reconcileTerritorialStructure(base)
  const byId = new Map(checks.map((check) => [check.id, check]))
  base.quality.totalBySexReconciled = byId.get('totales-sexo')?.ok ?? false
  base.quality.totalByAgeReconciled = byId.get('bandas-total')?.ok ?? false
  base.quality.valueStatus = territorialValueStatus(base)
  const hardMismatch = checks.some(
    (check) => check.izquierda !== null && check.derecha !== null && !check.ok,
  )
  const unverifiable = checks.some((check) => check.izquierda === null || check.derecha === null)
  const nonObserved = base.ageBands.some((band) => band.status !== 'observed')
  base.quality.validationStatus = hardMismatch ? 'failed' : unverifiable || nonObserved ? 'partial' : 'passed'
  return base
}

/** ¿Las 21 bandas cubren exactamente 0, 5, ..., 100 en orden? */
function hasCompleteBands(t: TerritorialPopulationStructure): boolean {
  const keys = t.ageBands.map((band) => structureBandKey(band.band))
  return keys.length === BAND_KEYS.length && keys.every((key, i) => key === BAND_KEYS[i])
}

function reconciled(t: TerritorialPopulationStructure): boolean {
  return t.quality.totalBySexReconciled && t.quality.totalByAgeReconciled
}

// ============================================================================
// Controles secundarios y referencias de benchmark
// ============================================================================

interface SecondaryCcaaControl {
  control: 'suma_provincias_vs_ccaa'
  ccaaCode: string
  ccaaName: string
  oficial: number | null
  sumaProvincias: number | null
  diferencia: number | null
  mismaCifra: boolean
  provincias: { code: string; name: string; total: number | null }[]
}

interface SecondaryNationalControl {
  control: 'suma_ccaa_vs_nacional'
  oficial: number | null
  sumaCcaa: number | null
  diferencia: number | null
  mismaCifra: boolean
}

function sumNullable(values: readonly (number | null)[]): number | null {
  let sum = 0
  for (const value of values) {
    if (value === null) return null
    sum += value
  }
  return sum
}

function buildSecondaryControls(
  provinces: readonly TerritorialPopulationStructure[],
  ccaa: readonly TerritorialPopulationStructure[],
  national: TerritorialPopulationStructure,
  provToCcaa: ReadonlyMap<string, string>,
): { porCcaa: SecondaryCcaaControl[]; nacional: SecondaryNationalControl } {
  const porCcaa = ccaa.map((comunidad) => {
    const suyas = provinces.filter(
      (p) => provToCcaa.get(p.territoryCode) === comunidad.territoryCode,
    )
    const sumaProvincias = sumNullable(suyas.map((p) => p.total))
    const diferencia =
      comunidad.total === null || sumaProvincias === null ? null : comunidad.total - sumaProvincias
    return {
      control: 'suma_provincias_vs_ccaa' as const,
      ccaaCode: comunidad.territoryCode,
      ccaaName: comunidad.territoryName,
      oficial: comunidad.total,
      sumaProvincias,
      diferencia,
      mismaCifra: comunidad.total !== null && sumaProvincias !== null && comunidad.total === sumaProvincias,
      provincias: suyas.map((p) => ({ code: p.territoryCode, name: p.territoryName, total: p.total })),
    }
  })
  const sumaCcaa = sumNullable(ccaa.map((c) => c.total))
  return {
    porCcaa,
    nacional: {
      control: 'suma_ccaa_vs_nacional',
      oficial: national.total,
      sumaCcaa,
      diferencia: national.total === null || sumaCcaa === null ? null : national.total - sumaCcaa,
      mismaCifra: national.total !== null && sumaCcaa !== null && national.total === sumaCcaa,
    },
  }
}

// ============================================================================
// Salida
// ============================================================================

function writeJson(path: string, value: unknown): number {
  const json = JSON.stringify(value, null, 2)
  writeFileSync(path, json, 'utf8')
  return Buffer.byteLength(json, 'utf8')
}

interface FocusReport {
  level: TerritorialLevel
  code: string
  name: string
  total: number | null
  male: number | null
  female: number | null
  sumSex: number | null
  sumBands: number | null
  totalBySexReconciled: boolean
  totalByAgeReconciled: boolean
  validationStatus: TerritorialValidationStatus
  indicadoresCalculados: number
}

function focusReport(t: TerritorialPopulationStructure): FocusReport {
  const checks = reconcileTerritorialStructure(t)
  const sumSex = t.male === null || t.female === null ? null : t.male + t.female
  const check = (id: string): number | null => {
    const found = checks.find((c) => c.id === id)
    return found === undefined ? null : found.derecha
  }
  return {
    level: t.territoryLevel,
    code: t.territoryCode,
    name: t.territoryName,
    total: t.total,
    male: t.male,
    female: t.female,
    sumSex,
    sumBands: check('bandas-total'),
    totalBySexReconciled: t.quality.totalBySexReconciled,
    totalByAgeReconciled: t.quality.totalByAgeReconciled,
    validationStatus: t.quality.validationStatus,
    indicadoresCalculados: t.derivedIndicators.filter((i) => i.value !== null).length,
  }
}

function fmt(value: number | null): string {
  return value === null ? 'ND' : value.toLocaleString('es-ES')
}

// ============================================================================
// Principal
// ============================================================================

async function main(): Promise<void> {
  const muestra = hasFlag('muestra')
  const periodo = argValue('periodo') ?? '2025'
  if (!/^\d{4}$/.test(periodo)) {
    throw new Error(`Período inválido: ${JSON.stringify(periodo)} (se espera un año de 4 dígitos)`)
  }
  const warnings: string[] = []
  const errores: string[] = []
  const startedAt = Date.now()

  console.log(`Estructura territorial INE · tabla 68521 · período ${periodo} · modo dry-run`)

  // 1. Checksums y metadatos de las fuentes.
  const t0 = Date.now()
  const sha68521 = await sha256File(CSV_68521)
  const sha68535 = await sha256File(CSV_68535)
  const bytes68521 = statSync(CSV_68521).size
  const bytes68535 = statSync(CSV_68535).size
  const checksumMs = Date.now() - t0

  // 2. Escaneo de la fuente territorial.
  const scanT0 = Date.now()
  const scan = await scan68521(errores)
  const scanMs = Date.now() - scanT0

  // 3. Control con 68535 (filas + etiquetas de banda).
  const metaT0 = Date.now()
  const meta35 = await scan68535Meta()
  const metaMs = Date.now() - metaT0

  // 4. Identidad de las 21 etiquetas de banda entre 68535 y 68521.
  const labels21 = [...scan.ageLabels].filter((label) => label !== 'Todas las edades').sort()
  const labels35 = [...meta35.ageLabels].filter((label) => label !== 'Todas las edades').sort()
  const canonical21 = BAND_KEYS.map((key) => canonicalBandLabel(key)).sort()
  const bandLabelsIdentical =
    labels21.length === 21 && labels35.length === 21 && labels21.join(' | ') === labels35.join(' | ')
  if (!bandLabelsIdentical) {
    errores.push(
      `Las 21 etiquetas de banda no son idénticas entre 68535 y 68521 (68521=${labels21.length}, 68535=${labels35.length})`,
    )
  }
  const canonicalAssumption = labels21.join(' | ') === canonical21.join(' | ')

  // 5. Elección del período más reciente completo.
  const periods = [...scan.byPeriod.keys()].sort()
  const completePeriods = periods.filter((p) => {
    const map = scan.byPeriod.get(p)
    return map !== undefined && map.size > 0 && [...map.values()].every(isComplete)
  })
  const chosen = completePeriods[completePeriods.length - 1]
  if (chosen === undefined) {
    throw new Error(`Ningún período completo en 68521 (períodos vistos: ${periods.join(', ') || 'ninguno'})`)
  }
  if (chosen !== periodo) {
    throw new Error(
      `El período más reciente completo es ${chosen}, no ${periodo}. Revisar la fuente antes de continuar (fail-closed).`,
    )
  }
  const chosenMap = scan.byPeriod.get(chosen)
  if (chosenMap === undefined) throw new Error(`Sin datos para el período ${chosen}`)

  // 6. Construcción de objetos territoriales.
  const retrievedAt = new Date().toISOString()
  const ctx: BuildContext = { period: chosen, retrievedAt, checksum: sha68521 }
  const provinces: TerritorialPopulationStructure[] = []
  const autonomousCommunities: TerritorialPopulationStructure[] = []
  let national: TerritorialPopulationStructure | null = null
  for (const acc of chosenMap.values()) {
    const built = buildTerritorial(acc, ctx)
    if (built.territoryLevel === 'nacional') national = built
    else if (built.territoryLevel === 'ccaa') autonomousCommunities.push(built)
    else provinces.push(built)
  }
  if (national === null) throw new Error('No se encontró la fila nacional en 68521')
  provinces.sort((a, b) => a.territoryCode.localeCompare(b.territoryCode))
  autonomousCommunities.sort((a, b) => a.territoryCode.localeCompare(b.territoryCode))

  // 7. Integridad de la jerarquía derivada de la fuente.
  const ccaaCodes = new Set(autonomousCommunities.map((c) => c.territoryCode))
  for (const p of provinces) {
    const parent = scan.provToCcaa.get(p.territoryCode)
    if (parent === undefined) {
      errores.push(`Provincia ${p.territoryCode} (${p.territoryName}) sin CCAA en la fuente`)
    } else if (!ccaaCodes.has(parent)) {
      errores.push(`Provincia ${p.territoryCode} apunta a CCAA ${parent} inexistente`)
    }
  }

  // 8. Dataset y validación fail-closed.
  const provincesWithCompleteBands = provinces.filter(hasCompleteBands).length
  const ccaaWithCompleteBands = autonomousCommunities.filter(hasCompleteBands).length
  const provincesReconciled = provinces.filter(reconciled).length
  const ccaaReconciled = autonomousCommunities.filter(reconciled).length
  const secondary = buildSecondaryControls(
    provinces,
    autonomousCommunities,
    national,
    scan.provToCcaa,
  )
  const secondaryOk =
    secondary.nacional.mismaCifra && secondary.porCcaa.every((c) => c.mismaCifra)
  const anyFailed =
    national.quality.validationStatus === 'failed' ||
    provinces.some((p) => p.quality.validationStatus === 'failed') ||
    autonomousCommunities.some((c) => c.quality.validationStatus === 'failed')
  const anyPartial =
    national.quality.validationStatus === 'partial' ||
    provinces.some((p) => p.quality.validationStatus === 'partial') ||
    autonomousCommunities.some((c) => c.quality.validationStatus === 'partial')
  const datasetValidationStatus: TerritorialValidationStatus = anyFailed
    ? 'failed'
    : anyPartial || !secondaryOk
      ? 'partial'
      : 'passed'

  const manifestEntries: PopulationSourceManifestEntry[] = [
    {
      table: '68521',
      label: 'Estructura de población por sexo, edad y nacionalidad (nacional/CCAA/provincia)',
      url: SOURCE_URL_68521,
      path: CSV_68521,
      sha256: sha68521,
      bytes: bytes68521,
      rows: scan.rows,
    },
    {
      table: '68535',
      label: 'Estructura de población municipal por sexo, edad y nacionalidad (control)',
      url: SOURCE_URL_68535,
      path: CSV_68535,
      sha256: sha68535,
      bytes: bytes68535,
      rows: meta35.rows,
    },
  ]

  const dataset: PopulationStructureDataset = {
    schemaVersion: POPULATION_STRUCTURE_DATASET_SCHEMA,
    period: chosen,
    retrievedAt,
    sourceManifest: manifestEntries,
    provinces,
    autonomousCommunities,
    national,
    quality: {
      provincesCount: provinces.length,
      autonomousCommunitiesCount: autonomousCommunities.length,
      provincesWithCompleteBands,
      autonomousCommunitiesWithCompleteBands: ccaaWithCompleteBands,
      nationalCompleteBands: hasCompleteBands(national),
      provincesReconciled,
      autonomousCommunitiesReconciled: ccaaReconciled,
      nationalReconciled: reconciled(national),
      bandLabelsConsistentWith68535: bandLabelsIdentical,
      validationStatus: datasetValidationStatus,
    },
  }
  const datasetValidation = validatePopulationStructureDataset(dataset)
  if (!datasetValidation.ok) {
    throw new Error(`Dataset territorial inválido (fail-closed):\n  - ${datasetValidation.errors.join('\n  - ')}`)
  }

  // 9. Escritura de los objetos territoriales.
  mkdirSync(`${TERR_DIR}/nacional`, { recursive: true })
  mkdirSync(`${TERR_DIR}/ccaa`, { recursive: true })
  mkdirSync(`${TERR_DIR}/provincia`, { recursive: true })
  const sizes = { nacional: [] as number[], ccaa: [] as number[], provincia: [] as number[] }
  sizes.nacional.push(writeJson(`${TERR_DIR}/nacional/${national.territoryCode}.json`, national))
  for (const c of autonomousCommunities) {
    sizes.ccaa.push(writeJson(`${TERR_DIR}/ccaa/${c.territoryCode}.json`, c))
  }
  for (const p of provinces) {
    sizes.provincia.push(writeJson(`${TERR_DIR}/provincia/${p.territoryCode}.json`, p))
  }

  // 10. Referencias de benchmark de los municipios ya presentes en disco.
  const refs: Record<string, PopulationBenchmarkRefs> = {}
  const municipalities = readdirSync(OUT_DIR)
    .filter((name) => /^\d{5}\.json$/.test(name))
    .map((name) => name.slice(0, 5))
    .sort()
  for (const ine of municipalities) {
    const provincia = ine.slice(0, 2)
    const ccaa = scan.provToCcaa.get(provincia)
    if (ccaa === undefined) {
      errores.push(`Municipio ${ine}: provincia ${provincia} sin CCAA en 68521`)
      continue
    }
    const candidate: PopulationBenchmarkRefs = { provincia, ccaa, nacional: 'ES' }
    const refsValidation = validatePopulationBenchmarkRefs(candidate)
    if (!refsValidation.ok) {
      errores.push(`Municipio ${ine}: benchmarkRefs inválido -> ${refsValidation.errors.join(' | ')}`)
      continue
    }
    refs[ine] = refsValidation.data
  }
  const refsIndex: PopulationBenchmarkRefsIndex = {
    schemaVersion: POPULATION_BENCHMARK_REFS_SCHEMA,
    period: chosen,
    generatedAt: new Date().toISOString(),
    refs,
  }
  writeJson(`${OUT_DIR}/refs.json`, refsIndex)

  // 11. Reconciliación primaria por territorio + controles secundarios.
  const territoryRows = [national, ...autonomousCommunities, ...provinces].map((t) => {
    const checks = reconcileTerritorialStructure(t)
    const byId = new Map(checks.map((check) => [check.id, check]))
    const sex = byId.get('totales-sexo')
    const bands = byId.get('bandas-total')
    return {
      level: t.territoryLevel,
      code: t.territoryCode,
      name: t.territoryName,
      total: t.total,
      male: t.male,
      female: t.female,
      totalBySex: { izquierda: sex?.izquierda ?? null, derecha: sex?.derecha ?? null, ok: sex?.ok ?? false },
      totalByAge: { izquierda: bands?.izquierda ?? null, derecha: bands?.derecha ?? null, ok: bands?.ok ?? false },
      validationStatus: t.quality.validationStatus,
    }
  })
  const primaryFailures = territoryRows.filter(
    (r) =>
      r.totalBySex.izquierda !== null &&
      r.totalBySex.derecha !== null &&
      !r.totalBySex.ok,
  ).length +
    territoryRows.filter(
      (r) =>
        r.totalByAge.izquierda !== null &&
        r.totalByAge.derecha !== null &&
        !r.totalByAge.ok,
    ).length

  const focusCodes = (argValue('foco') ?? DEFAULT_FOCO.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
  const focusTerritories = focusCodes
    .map((code) => {
      if (code === 'ES') return national
      return [...autonomousCommunities, ...provinces].find((t) => t.territoryCode === code)
    })
    .filter((t): t is TerritorialPopulationStructure => t !== undefined)
  const focus = focusTerritories.map(focusReport)

  const reconciliationJson = {
    schema: 'socideas-population-benchmark-reconciliation@1',
    generatedAt: new Date().toISOString(),
    period: chosen,
    source: {
      table: '68521',
      url: SOURCE_URL_68521,
      sha256: sha68521,
      nationalityFilter: 'Total',
      note: 'Controles secundarios (suma de provincias vs CCAA oficial y suma de CCAA vs España oficial) se registran SIN sustituir la cifra oficial.',
    },
    bandLabelIdentity: {
      identical: bandLabelsIdentical,
      canonicalAssumption,
      labels68521: labels21,
      labels68535: labels35,
    },
    primaryControls: {
      territoriesChecked: territoryRows.length,
      failures: primaryFailures,
      byTerritory: territoryRows,
    },
    secondaryControls: secondary,
    discrepancies: [
      ...territoryRows
        .filter(
          (r) =>
            (r.totalBySex.izquierda !== null && r.totalBySex.derecha !== null && !r.totalBySex.ok) ||
            (r.totalByAge.izquierda !== null && r.totalByAge.derecha !== null && !r.totalByAge.ok),
        )
        .map((r) => ({ tipo: 'primario', nivel: r.level, codigo: r.code, nombre: r.name })),
      ...secondary.porCcaa
        .filter((c) => !c.mismaCifra)
        .map((c) => ({
          tipo: 'secundario',
          control: c.control,
          codigo: c.ccaaCode,
          nombre: c.ccaaName,
          oficial: c.oficial,
          suma: c.sumaProvincias,
          diferencia: c.diferencia,
        })),
      ...(secondary.nacional.mismaCifra
        ? []
        : [
            {
              tipo: 'secundario',
              control: secondary.nacional.control,
              codigo: 'ES',
              nombre: NATIONAL_NAME,
              oficial: secondary.nacional.oficial,
              suma: secondary.nacional.sumaCcaa,
              diferencia: secondary.nacional.diferencia,
            },
          ]),
    ],
    focus,
  }
  writeJson(`${AUDIT_DIR}/reconciliacion-benchmark-2025.json`, reconciliationJson)

  const md = renderReconciliationMarkdown(reconciliationJson)
  writeFileSync(`${AUDIT_DIR}/reconciliacion-benchmark-2025.md`, md, 'utf8')

  // 12. Manifiesto.
  const objectStats = {
    nacional: sizeStats(sizes.nacional),
    ccaa: sizeStats(sizes.ccaa),
    provincia: sizeStats(sizes.provincia),
    total: sizeStats([...sizes.nacional, ...sizes.ccaa, ...sizes.provincia]),
  }
  const manifest = {
    schema: 'socideas-population-structure-territorial-manifest@1',
    generatedAt: new Date().toISOString(),
    period: chosen,
    modos: { muestra },
    fuentes: Object.fromEntries(manifestEntries.map((e) => [e.table, e])),
    conteos: {
      territorios: {
        nacional: 1,
        ccaa: autonomousCommunities.length,
        provincia: provinces.length,
        total: 1 + autonomousCommunities.length + provinces.length,
      },
      municipiosConRefs: Object.keys(refs).length,
      municipiosEnDisco: municipalities.length,
      combinacionesProvinciaCcaa: scan.provToCcaa.size,
      bandasPorTerritorio: 21,
    },
    objetos: objectStats,
    coberturas: {
      nacional: { count: 1, bandasCompletas: dataset.quality.nationalCompleteBands ? 1 : 0 },
      ccaa: { count: autonomousCommunities.length, bandasCompletas: ccaaWithCompleteBands },
      provincia: { count: provinces.length, bandasCompletas: provincesWithCompleteBands },
    },
    reconciliaciones: {
      primarias: {
        territoriosComprobados: territoryRows.length,
        fallosDuros: primaryFailures,
        reconciliados: {
          nacional: dataset.quality.nationalReconciled,
          ccaa: ccaaReconciled,
          provincia: provincesReconciled,
        },
      },
      secundarias: {
        sumaProvinciasVsCcaa: {
          ok: secondary.porCcaa.every((c) => c.mismaCifra),
          ccaaComprobadas: secondary.porCcaa.length,
          diferenciaMaxima: secondary.porCcaa.reduce(
            (max, c) => (c.diferencia === null ? max : Math.max(max, Math.abs(c.diferencia))),
            0,
          ),
        },
        sumaCcaaVsNacional: secondary.nacional,
      },
      etiquetasBandaIdenticas68535: bandLabelsIdentical,
      validationStatus: datasetValidationStatus,
    },
    tiempos: {
      checksumsMs: checksumMs,
      escaneo68521Ms: scanMs,
      metadatos68535Ms: metaMs,
      totalMs: Date.now() - startedAt,
    },
    errores,
    warnings,
  }
  writeJson(`${AUDIT_DIR}/manifest-population-structure-v2-2.json`, manifest)

  // 13. Informe por consola.
  console.log('')
  console.log(
    `Fuentes: 68521 ${fmt(bytes68521)} B · ${scan.rows} filas · sha ${sha68521.slice(0, 16)}… · ` +
      `68535 ${fmt(bytes68535)} B · ${meta35.rows} filas · sha ${sha68535.slice(0, 16)}…`,
  )
  console.log(
    `Territorios ${chosen}: ${provinces.length} provincias · ${autonomousCommunities.length} CCAA · 1 nacional · ` +
      `bandas completas ${provincesWithCompleteBands}/${provinces.length} prov · ${ccaaWithCompleteBands}/${autonomousCommunities.length} CCAA`,
  )
  console.log(
    `Reconciliación primaria: ${territoryRows.length} territorios · fallos duros ${primaryFailures} · ` +
      `total=H+M ${territoryRows.filter((r) => r.totalBySex.ok).length}/${territoryRows.length} · ` +
      `suma bandas=total ${territoryRows.filter((r) => r.totalByAge.ok).length}/${territoryRows.length}`,
  )
  console.log(
    `Controles secundarios: suma provincias = CCAA oficial ${secondary.porCcaa.filter((c) => c.mismaCifra).length}/${secondary.porCcaa.length} · ` +
      `suma CCAA = España oficial ${secondary.nacional.mismaCifra ? 'sí' : 'NO'} (oficial ${fmt(secondary.nacional.oficial)} vs suma ${fmt(secondary.nacional.sumaCcaa)})`,
  )
  console.log(
    `Etiquetas de banda 68535 vs 68521: 21 idénticas = ${bandLabelsIdentical ? 'sí' : 'NO'} (coinciden con el canónico = ${canonicalAssumption ? 'sí' : 'no'})`,
  )
  console.log(`refs.json: ${Object.keys(refs).length} municipios con benchmarkRefs`)
  console.log(
    `Tiempos: checksums ${formatMs(checksumMs)} · escaneo 68521 ${formatMs(scanMs)} · control 68535 ${formatMs(metaMs)} · total ${formatMs(Date.now() - startedAt)}`,
  )

  if (muestra) {
    console.log('')
    console.log('--- Informe de muestra (Toledo 45, Castilla-La Mancha 08, España) ---')
    for (const f of focus) {
      console.log(
        `[${f.level} ${f.code}] ${f.name}: total ${fmt(f.total)} = H ${fmt(f.male)} + M ${fmt(f.female)} = ${fmt(f.sumSex)} (${f.totalBySexReconciled ? 'OK' : 'NO'}) · ` +
          `suma 21 bandas ${fmt(f.sumBands)} (${f.totalByAgeReconciled ? 'OK' : 'NO'}) · validación ${f.validationStatus} · indicadores no nulos ${f.indicadoresCalculados}`,
      )
    }
    const clm = secondary.porCcaa.find((c) => c.ccaaCode === '08')
    if (clm !== undefined) {
      console.log(
        `[secundario] Castilla-La Mancha oficial ${fmt(clm.oficial)} vs suma provincias ${fmt(clm.sumaProvincias)} · diferencia ${fmt(clm.diferencia)} (${clm.mismaCifra ? 'OK' : 'NO'})`,
      )
    }
    console.log(
      `[secundario] España oficial ${fmt(secondary.nacional.oficial)} vs suma CCAA ${fmt(secondary.nacional.sumaCcaa)} · diferencia ${fmt(secondary.nacional.diferencia)} (${secondary.nacional.mismaCifra ? 'OK' : 'NO'})`,
    )
  }

  console.log('')
  console.log(`Escrito: ${TERR_DIR}/{nacional,ccaa,provincia}/*.json · ${OUT_DIR}/refs.json`)
  console.log(`Manifiesto: ${AUDIT_DIR}/manifest-population-structure-v2-2.json`)
  console.log(`Reconciliación: ${AUDIT_DIR}/reconciliacion-benchmark-2025.{md,json}`)
  if (warnings.length > 0) {
    console.log(`Warnings (${warnings.length}):`)
    for (const warning of warnings.slice(0, 20)) console.log(`  - ${warning}`)
  }
  if (errores.length > 0) {
    console.error(`Errores (${errores.length}):`)
    for (const error of errores) console.error(`  - ${error}`)
    process.exitCode = 1
  } else {
    console.log('Sin errores.')
  }
}

interface ReconciliationJsonShape {
  generatedAt: string
  period: string
  source: { sha256: string }
  bandLabelIdentity: { identical: boolean; canonicalAssumption: boolean; labels68521: string[] }
  primaryControls: {
    territoriesChecked: number
    failures: number
    byTerritory: {
      level: TerritorialLevel
      code: string
      name: string
      total: number | null
      male: number | null
      female: number | null
      totalBySex: { izquierda: number | null; derecha: number | null; ok: boolean }
      totalByAge: { izquierda: number | null; derecha: number | null; ok: boolean }
      validationStatus: TerritorialValidationStatus
    }[]
  }
  secondaryControls: {
    porCcaa: SecondaryCcaaControl[]
    nacional: SecondaryNationalControl
  }
  discrepancies: unknown[]
  focus: FocusReport[]
}

function renderReconciliationMarkdown(r: ReconciliationJsonShape): string {
  const lines: string[] = []
  lines.push('# Reconciliación benchmark territorial 2025 — 68521 (nacional / CCAA / provincia)')
  lines.push('')
  lines.push(`Generado: ${r.generatedAt}`)
  lines.push('')
  lines.push(`- Fuente: INE 68521, nacionalidad \`Total\`, período ${r.period}, sha256 \`${r.source.sha256}\`.`)
  lines.push('- Control primario por territorio: `total = H + M` y `suma de 21 bandas = total` (tolerancia 0).')
  lines.push(
    '- Controles secundarios (SIN sustituir la cifra oficial): suma de provincias vs CCAA oficial y suma de CCAA vs España oficial; se registran ambas cifras y la diferencia.',
  )
  lines.push('- Niveles territoriales y familias de banda idénticos a la municipal 68535.')
  lines.push('')
  lines.push('## Controles primarios por territorio')
  lines.push('')
  lines.push('| Nivel | Código | Territorio | Total | H | M | total=H+M | suma bandas=total | validación |')
  lines.push('|---|---|---|---|---|---|---|---|---|')
  for (const t of r.primaryControls.byTerritory) {
    lines.push(
      `| ${t.level} | ${t.code} | ${t.name} | ${fmt(t.total)} | ${fmt(t.male)} | ${fmt(t.female)} | ` +
        `${t.totalBySex.ok ? 'OK' : 'NO'} (${fmt(t.totalBySex.izquierda)} vs ${fmt(t.totalBySex.derecha)}) | ` +
        `${t.totalByAge.ok ? 'OK' : 'NO'} (${fmt(t.totalByAge.izquierda)} vs ${fmt(t.totalByAge.derecha)}) | ${t.validationStatus} |`,
    )
  }
  lines.push('')
  lines.push(`Territorios comprobados: ${r.primaryControls.territoriesChecked} · fallos duros: ${r.primaryControls.failures}.`)
  lines.push('')
  lines.push('## Controles secundarios (no sustituyen al oficial)')
  lines.push('')
  lines.push('### Suma de provincias vs CCAA oficial')
  lines.push('')
  lines.push('| CCAA | Oficial | Suma provincias | Diferencia | ¿Igual? | Provincias |')
  lines.push('|---|---|---|---|---|---|')
  for (const c of r.secondaryControls.porCcaa) {
    lines.push(
      `| ${c.ccaaCode} ${c.ccaaName} | ${fmt(c.oficial)} | ${fmt(c.sumaProvincias)} | ${fmt(c.diferencia)} | ${c.mismaCifra ? 'sí' : 'NO'} | ${c.provincias.length} |`,
    )
  }
  lines.push('')
  lines.push('### Suma de CCAA vs España oficial')
  lines.push('')
  const n = r.secondaryControls.nacional
  lines.push(`- Oficial (España): ${fmt(n.oficial)}`)
  lines.push(`- Suma de las ${r.secondaryControls.porCcaa.length} CCAA: ${fmt(n.sumaCcaa)}`)
  lines.push(`- Diferencia: ${fmt(n.diferencia)} · ¿Igual? ${n.mismaCifra ? 'sí' : 'NO'}`)
  lines.push('')
  lines.push('## Foco (Toledo 45, Castilla-La Mancha 08, España)')
  lines.push('')
  lines.push('| Nivel | Código | Territorio | Total | H | M | total=H+M | suma bandas | validación |')
  lines.push('|---|---|---|---|---|---|---|---|---|')
  for (const f of r.focus) {
    lines.push(
      `| ${f.level} | ${f.code} | ${f.name} | ${fmt(f.total)} | ${fmt(f.male)} | ${fmt(f.female)} | ` +
        `${f.totalBySexReconciled ? 'OK' : 'NO'} (${fmt(f.sumSex)}) | ${f.totalByAgeReconciled ? 'OK' : 'NO'} (${fmt(f.sumBands)}) | ${f.validationStatus} |`,
    )
  }
  lines.push('')
  lines.push('## Identidad de etiquetas de banda 68535 vs 68521')
  lines.push('')
  lines.push(`- 21 etiquetas idénticas: ${r.bandLabelIdentity.identical ? 'sí' : 'NO'}`)
  lines.push(`- Coinciden con el canónico del contrato municipal: ${r.bandLabelIdentity.canonicalAssumption ? 'sí' : 'no'}`)
  lines.push('')
  lines.push(r.bandLabelIdentity.labels68521.map((l) => `- ${l}`).join('\n'))
  lines.push('')
  lines.push('## Discrepancias registradas')
  lines.push('')
  if (r.discrepancies.length === 0) {
    lines.push('Ninguna: todos los controles primarios y secundarios cuadran con tolerancia 0.')
  } else {
    lines.push('```json')
    lines.push(JSON.stringify(r.discrepancies, null, 2))
    lines.push('```')
  }
  lines.push('')
  return lines.join('\n')
}

main().catch((error: unknown) => {
  console.error('ERROR', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
