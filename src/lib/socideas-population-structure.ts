// Estructura de población municipal SOCideas v2 (`socideas-population-structure@1`).
//
// QUÉ ES
//   Modelo puro (sin I/O, sin dependencias) de la estructura de población por
//   sexo y edad de un municipio en un período anual. Lo construye el cargador
//   `scripts/load-population-structure-2025.ts` a partir de las tablas INE:
//     - 68535: población por sexo, edad (grupos quinquenales) y nacionalidad,
//       municipal nacional (todas las provincias).
//     - 68534: población por sexo y edad (año a año), solo municipios
//       insulares (Baleares y Canarias; provincias 07, 35 y 38).
//     - 68065: total municipal por sexo (cruce de control de totales).
//
// REGLAS NORMATIVAS
//   1. Ausencia distinta de 0. En la fuente, "." y ".." son supresión
//      estadística y "-"/vacío son ausencia de dato; aquí NUNCA se convierten
//      en 0: viajan como `value: null` con estado (`suppressed` / `missing`).
//   2. Un 0 explícito de la fuente es un dato observado (`observed`, valor 0).
//   3. Nada se estima: si un total exigiría sumar parcialmente componentes
//      ausentes, queda `null` (fail closed). Sin repartos ni imputaciones.
//   4. Reconciliaciones exactas: comparaciones de enteros con tolerancia 0. No
//      hay redondeos que justificar porque la fuente publica enteros.
//   5. Validación estricta y fail closed: un objeto que no cumple el contrato
//      no se publica (`validatePopulationStructure`).
//
// Solo servidor (lo consume el generador del libro). Sin I/O, sin secretos.

/** Versión del esquema. Cambiarla exige actualizar validador y cargador. */
export const POPULATION_STRUCTURE_SCHEMA = 'socideas-population-structure@1'

/** Estado de un valor de la fuente. */
export type StructureValueStatus = 'observed' | 'suppressed' | 'missing'

export interface StructureValue {
  value: number | null
  status: StructureValueStatus
}

/** Grupo quinquenal de edad ("0 a 4 años" ... "100 y más años"). */
export interface PopulationStructureBand {
  band: string // "0 a 4 años" ... "100 y más años"
  total: number | null
  male: number | null
  female: number | null
  status: StructureValueStatus
}

/** Edad simple 0..100 (100 = "100 y más años"). Solo municipios insulares. */
export interface PopulationStructureAgeDetail {
  age: number // 0..100 (100 = "100 y más años")
  label: string // "0 años", "1 año", ..., "100 y más años"
  total: number | null
  male: number | null
  female: number | null
  status: StructureValueStatus
}

/** Cruce de control con la tabla 68065 (total municipal por sexo). */
export interface StructureCrossCheck68065 {
  total: number | null
  male: number | null
  female: number | null
  /** true si los tres pares son idénticos (o nulos en ambos lados). */
  matches: boolean
}

export interface PopulationStructureAnnual {
  schemaVersion: typeof POPULATION_STRUCTURE_SCHEMA
  sourceTable: '68535' | '68534'
  sourceUrl: string
  scope: 'municipal_national' | 'municipal_insular'
  period: string // "2025"
  retrievedAt: string // ISO
  ineCode: string
  municipalityName: string
  ageBands5y: PopulationStructureBand[]
  ageDetail: PopulationStructureAgeDetail[] | null
  totals: { total: number | null; male: number | null; female: number | null }
  quality: {
    territoryMatch: 'exact' | 'missing'
    totalBySexReconciled: boolean
    totalByAgeReconciled: boolean
    groupingReconciled: boolean
    sourceChecksum: string
    validationStatus: 'passed' | 'partial' | 'failed'
    /** Cruce con 68065; `null` si el municipio no aparece en esa tabla. */
    crossCheck68065: StructureCrossCheck68065 | null
  }
}

/** Indicador derivado de la estructura. `components` documenta el cálculo. */
export interface StructureIndicator {
  key: string
  label: string
  value: number | null
  unit: string
  formula: string
  method: string
  components?: Record<string, number | null>
}

/** Resultado de una reconciliación: izquierda debe igualar a derecha. */
export interface StructureReconciliation {
  id: string
  descripcion: string
  izquierda: number | null
  derecha: number | null
  ok: boolean
}

// ============================================================================
// Lectura de valores de la fuente
// ============================================================================

/** Tokens de supresión estadística de la fuente (nunca un 0). */
const SUPPRESSED_TOKENS: ReadonlySet<string> = new Set(['.', '..'])
/** Tokens de ausencia de dato (nunca un 0). */
const MISSING_TOKENS: ReadonlySet<string> = new Set(['-', ''])

/**
 * "1.234" pasa a 1234; "." / ".." / "-" / "" pasan a `null` con estado
 * (`suppressed` para ".", ".."; `missing` para "-", vacío o no numérico).
 * Un 0 explícito es un valor observado (0, no ausencia).
 */
export function parseValueEs(raw: string | null | undefined): StructureValue {
  if (raw === null || raw === undefined) return { value: null, status: 'missing' }
  const trimmed = raw.trim()
  if (SUPPRESSED_TOKENS.has(trimmed)) return { value: null, status: 'suppressed' }
  if (MISSING_TOKENS.has(trimmed)) return { value: null, status: 'missing' }
  const normalized = trimmed.replace(/\s+/g, '')
  // La fuente publica enteros con separador de miles "." (1.234); sin decimales.
  const thousands = /^\d{1,3}(\.\d{3})+$/
  const plain = /^\d+$/
  if (!thousands.test(normalized) && !plain.test(normalized)) {
    return { value: null, status: 'missing' }
  }
  const value = Number(normalized.replace(/\./g, ''))
  if (!Number.isFinite(value)) return { value: null, status: 'missing' }
  return { value, status: 'observed' }
}

/** Estado más grave de una lista: missing > suppressed > observed. */
function worstStatus(statuses: readonly StructureValueStatus[]): StructureValueStatus {
  if (statuses.includes('missing')) return 'missing'
  if (statuses.includes('suppressed')) return 'suppressed'
  return 'observed'
}

/** Suma exacta o `null`: exige todos los componentes observados (nunca parcial). */
function sumObserved<T>(parts: readonly T[], pick: (part: T) => StructureValue): number | null {
  let sum = 0
  for (const part of parts) {
    const v = pick(part)
    if (v.status !== 'observed' || v.value === null) return null
    sum += v.value
  }
  return sum
}

/**
 * Normaliza la etiqueta de un grupo de edad a su límite inferior (0..100).
 * Acepta las formas de INE ("De 0 a 4 años", "100 y más años") y las ya
 * normalizadas ("0 a 4 años", "0 a 4"). Devuelve `NaN` si no es reconocible.
 */
export function structureBandKey(band: string): number {
  const text = band.trim().replace(/^de\s+/i, '')
  if (/^100\s+y\s+m[aá]s(\s+a[nñ]os)?$/i.test(text)) return 100
  const match = /^(\d{1,3})\s*(?:a\s*(\d{1,3}))?(\s+a[nñ]os)?$/i.exec(text)
  if (match === null) return Number.NaN
  const lower = Number(match[1])
  const upper = match[2] === undefined ? lower : Number(match[2])
  if (!Number.isInteger(lower) || !Number.isInteger(upper)) return Number.NaN
  if (lower < 0 || upper > 99 || upper < lower) return Number.NaN
  return lower
}

/** Los 21 grupos quinquenales del contrato (0-4 ... 95-99, 100+). */
const QUINQUENIAL_BANDS: readonly { band: string; from: number; to: number }[] = [
  { band: '0 a 4 años', from: 0, to: 4 },
  { band: '5 a 9 años', from: 5, to: 9 },
  { band: '10 a 14 años', from: 10, to: 14 },
  { band: '15 a 19 años', from: 15, to: 19 },
  { band: '20 a 24 años', from: 20, to: 24 },
  { band: '25 a 29 años', from: 25, to: 29 },
  { band: '30 a 34 años', from: 30, to: 34 },
  { band: '35 a 39 años', from: 35, to: 39 },
  { band: '40 a 44 años', from: 40, to: 44 },
  { band: '45 a 49 años', from: 45, to: 49 },
  { band: '50 a 54 años', from: 50, to: 54 },
  { band: '55 a 59 años', from: 55, to: 59 },
  { band: '60 a 64 años', from: 60, to: 64 },
  { band: '65 a 69 años', from: 65, to: 69 },
  { band: '70 a 74 años', from: 70, to: 74 },
  { band: '75 a 79 años', from: 75, to: 79 },
  { band: '80 a 84 años', from: 80, to: 84 },
  { band: '85 a 89 años', from: 85, to: 89 },
  { band: '90 a 94 años', from: 90, to: 94 },
  { band: '95 a 99 años', from: 95, to: 99 },
  { band: '100 y más años', from: 100, to: 100 },
]

/** Claves ordenadas 0, 5, ..., 95, 100. */
const QUINQUENIAL_KEYS: readonly number[] = QUINQUENIAL_BANDS.map((b) => b.from)

/**
 * Agrupa edades simples 0..100 en quinquenios deterministas (0-4 ... 95-99,
 * 100+). Suma solo valores observados; si falta cualquier edad de un grupo, ese
 * total queda `null` (no se suma parcialmente). Edades duplicadas: gana la
 * última (el validador del objeto prohíbe duplicados).
 */
export function deriveBandsFromAgeDetail(detail: PopulationStructureAgeDetail[]): PopulationStructureBand[] {
  const byAge = new Map<number, PopulationStructureAgeDetail>()
  for (const entry of detail) byAge.set(entry.age, entry)
  return QUINQUENIAL_BANDS.map(({ band, from, to }) => {
    const parts: PopulationStructureAgeDetail[] = []
    let incomplete = false
    for (let age = from; age <= to; age += 1) {
      const part = byAge.get(age)
      if (part === undefined) incomplete = true
      else parts.push(part)
    }
    if (incomplete) {
      return { band, total: null, male: null, female: null, status: 'missing' as const }
    }
    return {
      band,
      total: sumObserved(parts, (p) => ({ value: p.total, status: p.status })),
      male: sumObserved(parts, (p) => ({ value: p.male, status: p.status })),
      female: sumObserved(parts, (p) => ({ value: p.female, status: p.status })),
      status: worstStatus(parts.map((p) => p.status)),
    }
  })
}

// ============================================================================
// Reconciliaciones (tolerancia 0)
// ============================================================================

/** Igualdad exacta; `null` en cualquier lado significa "no verificable". */
function equalsExact(left: number | null, right: number | null): boolean {
  return left !== null && right !== null && left === right
}

/** Suma de una serie de bandas; `null` si falta cualquier valor. */
function sumBandSeries(values: readonly (number | null)[]): number | null {
  let sum = 0
  for (const value of values) {
    if (value === null) return null
    sum += value
  }
  return sum
}

/**
 * Reconciliaciones sin tolerancias arbitrarias (enteros exactos):
 *   - `totales-sexo`: total = hombres + mujeres.
 *   - `bandas-total`: suma de los 21 grupos = total.
 *   - `banda-<clave>|total|hombres|mujeres`: cada grupo = suma exacta de las
 *     edades simples (solo si hay `ageDetail`; para los objetos insulares las
 *     bandas se derivan del propio detalle, y el cruce real 68535/68534 lo
 *     reporta el cargador aparte).
 * `ok` es `false` también cuando un lado es `null`: no verificable no es
 * "cuadra"; la diferencia se explica en el resumen de ingesta.
 */
export function reconcileStructure(s: PopulationStructureAnnual): StructureReconciliation[] {
  const checks: StructureReconciliation[] = []
  const sumSex =
    s.totals.male === null || s.totals.female === null ? null : s.totals.male + s.totals.female
  checks.push({
    id: 'totales-sexo',
    descripcion: 'Población total = hombres + mujeres (fila "Todas las edades")',
    izquierda: s.totals.total,
    derecha: sumSex,
    ok: equalsExact(s.totals.total, sumSex),
  })
  const sumBands = sumBandSeries(s.ageBands5y.map((b) => b.total))
  checks.push({
    id: 'bandas-total',
    descripcion: 'Suma de los 21 grupos quinquenales = población total',
    izquierda: s.totals.total,
    derecha: sumBands,
    ok: equalsExact(s.totals.total, sumBands),
  })
  if (s.ageDetail !== null) {
    const derived = deriveBandsFromAgeDetail(s.ageDetail)
    for (const band of s.ageBands5y) {
      const key = structureBandKey(band.band)
      const ref = derived.find((d) => structureBandKey(d.band) === key)
      const refTotal = ref === undefined ? null : ref.total
      const refMale = ref === undefined ? null : ref.male
      const refFemale = ref === undefined ? null : ref.female
      checks.push(
        {
          id: `banda-${key}-total`,
          descripcion: `Grupo "${band.band}": total quinquenal = suma de edades simples`,
          izquierda: band.total,
          derecha: refTotal,
          ok: equalsExact(band.total, refTotal),
        },
        {
          id: `banda-${key}-hombres`,
          descripcion: `Grupo "${band.band}": hombres quinquenal = suma de edades simples`,
          izquierda: band.male,
          derecha: refMale,
          ok: equalsExact(band.male, refMale),
        },
        {
          id: `banda-${key}-mujeres`,
          descripcion: `Grupo "${band.band}": mujeres quinquenal = suma de edades simples`,
          izquierda: band.female,
          derecha: refFemale,
          ok: equalsExact(band.female, refFemale),
        },
      )
    }
  }
  return checks
}

// ============================================================================
// Indicadores derivados
// ============================================================================

/** Redondeo de presentación a 2 decimales (no altera el cálculo). */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Cociente × 100; `null` si falta un lado o el denominador es 0. */
function percentRatio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null
  return round2((numerator / denominator) * 100)
}

/** Total observado de una banda por su clave 0..100. */
function bandValueByKey(s: PopulationStructureAnnual, key: number): number | null {
  const band = s.ageBands5y.find((b) => structureBandKey(b.band) === key)
  if (band === undefined || band.status !== 'observed' || band.total === null) return null
  return band.total
}

/** Suma de grupos quinquenales en [from, to]; `null` si falta alguno. */
function sumBandRange(s: PopulationStructureAnnual, from: number, to: number): number | null {
  const keys = QUINQUENIAL_KEYS.filter((k) => k >= from && k <= to)
  if (keys.length === 0) return null
  let sum = 0
  for (const key of keys) {
    const value = bandValueByKey(s, key)
    if (value === null) return null
    sum += value
  }
  return sum
}

/** Suma de edades simples en [from, to]; `null` sin detalle o si falta alguna. */
function sumAgeRange(s: PopulationStructureAnnual, from: number, to: number): number | null {
  if (s.ageDetail === null) return null
  const byAge = new Map(s.ageDetail.map((d) => [d.age, d]))
  let sum = 0
  for (let age = from; age <= to; age += 1) {
    const entry = byAge.get(age)
    if (entry === undefined || entry.status !== 'observed' || entry.total === null) return null
    sum += entry.total
  }
  return sum
}

/** Suma ponderada de la edad media (punto medio de cada grupo; 100+ = 100,5). */
function weightedAgeSum(s: PopulationStructureAnnual): { weighted: number | null; population: number | null } {
  let weighted = 0
  let population = 0
  for (const key of QUINQUENIAL_KEYS) {
    const value = bandValueByKey(s, key)
    if (value === null) return { weighted: null, population: null }
    const midpoint = key === 100 ? 100.5 : key + 2
    weighted += value * midpoint
    population += value
  }
  return { weighted, population }
}

/**
 * Indicadores derivados de la estructura. Todos declaran `formula` legible y
 * `method`; si falta cualquier componente el `value` queda `null` (fail closed).
 * `menores16`, `16a64` y las dependencias exigen edad simple (tabla 68534, solo
 * municipios insulares): los quinquenios de 68535 no permiten aislar 15/16/64.
 */
export function computeStructureIndicators(s: PopulationStructureAnnual): StructureIndicator[] {
  const menores15 = sumBandRange(s, 0, 10)
  const mayores65 = sumBandRange(s, 65, 100)
  const mayores80 = sumBandRange(s, 80, 100)
  const menores16 = sumAgeRange(s, 0, 15)
  const poblacion16a64 = sumAgeRange(s, 16, 64)
  const weighted = weightedAgeSum(s)
  const edadMedia =
    weighted.weighted === null || weighted.population === null || weighted.population === 0
      ? null
      : round2(weighted.weighted / weighted.population)
  const methodBandas = 'Suma de grupos quinquenales del objeto (tabla 68535, o 68534 en insulares).'
  const methodEdadSimple = 'Suma de edades simples (tabla 68534, solo municipios insulares); sin detalle por año no es calculable.'
  return [
    {
      key: 'menores16',
      label: 'Menores de 16 años',
      value: menores16,
      unit: 'personas',
      formula: 'Suma de edades simples 0-15',
      method: methodEdadSimple,
      components: { edades0a15: menores16 },
    },
    {
      key: 'poblacion16a64',
      label: 'Población de 16 a 64 años',
      value: poblacion16a64,
      unit: 'personas',
      formula: 'Suma de edades simples 16-64',
      method: methodEdadSimple,
      components: { edades16a64: poblacion16a64 },
    },
    {
      key: 'mayores65',
      label: 'Población de 65 años o más',
      value: mayores65,
      unit: 'personas',
      formula: 'Suma de grupos 65-69 a 100+',
      method: methodBandas,
      components: { grupos65mas: mayores65 },
    },
    {
      key: 'mayores80',
      label: 'Población de 80 años o más',
      value: mayores80,
      unit: 'personas',
      formula: 'Suma de grupos 80-84 a 100+',
      method: methodBandas,
      components: { grupos80mas: mayores80 },
    },
    {
      key: 'indice_envejecimiento',
      label: 'Índice de envejecimiento',
      value: percentRatio(mayores65, menores15),
      unit: '%',
      formula: '(65+ / 0-14) x 100',
      method: 'Cociente estándar INE entre mayores de 64 y menores de 15. ' + methodBandas,
      components: { mayores65, menores15 },
    },
    {
      key: 'indice_sobreenvejecimiento',
      label: 'Índice de sobreenvejecimiento',
      value: percentRatio(mayores80, mayores65),
      unit: '%',
      formula: '(80+ / 65+) x 100',
      method: 'Mide el peso de los octogenarios dentro del grupo mayor. ' + methodBandas,
      components: { mayores80, mayores65 },
    },
    {
      key: 'dependencia_juvenil',
      label: 'Tasa de dependencia juvenil',
      value: percentRatio(menores15, poblacion16a64),
      unit: '%',
      formula: '(0-14 / 16-64) x 100',
      method: methodEdadSimple,
      components: { menores15, poblacion16a64 },
    },
    {
      key: 'dependencia_mayores',
      label: 'Tasa de dependencia de mayores',
      value: percentRatio(mayores65, poblacion16a64),
      unit: '%',
      formula: '(65+ / 16-64) x 100',
      method: methodEdadSimple,
      components: { mayores65, poblacion16a64 },
    },
    {
      key: 'dependencia_total',
      label: 'Tasa de dependencia total',
      value:
        menores15 === null || mayores65 === null
          ? null
          : percentRatio(menores15 + mayores65, poblacion16a64),
      unit: '%',
      formula: '((0-14 + 65+) / 16-64) x 100',
      method: methodEdadSimple,
      components: { menores15, mayores65, poblacion16a64 },
    },
    {
      key: 'razon_masculinidad',
      label: 'Razón de masculinidad',
      value: percentRatio(s.totals.male, s.totals.female),
      unit: 'hombres por 100 mujeres',
      formula: '(hombres / mujeres) x 100',
      method: 'Calculada sobre la fila "Todas las edades".',
      components: { hombres: s.totals.male, mujeres: s.totals.female },
    },
    {
      key: 'edad_media',
      label: 'Edad media',
      value: edadMedia,
      unit: 'años',
      formula: 'Suma(población del grupo x punto medio) / suma(población)',
      method:
        'Punto medio de cada grupo quinquenal (0-4 = 2,5 ... 95-99 = 97,5); el grupo 100+ se aproxima a 100,5 (convención documentada). ' +
        methodBandas,
      components: { sumaPonderada: weighted.weighted, poblacion: weighted.population },
    },
  ]
}

// ============================================================================
// Validación estricta (fail closed)
// ============================================================================

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function isNullableNumber(x: unknown): x is number | null {
  return x === null || (typeof x === 'number' && Number.isFinite(x))
}

function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.trim().length > 0
}

const VALID_STATUS: readonly StructureValueStatus[] = ['observed', 'suppressed', 'missing']

function isStatus(x: unknown): x is StructureValueStatus {
  return typeof x === 'string' && (VALID_STATUS as readonly string[]).includes(x)
}

/**
 * Coherencia valor/estado de una serie (total/hombres/mujeres):
 * `observed` exige los tres valores; cualquier otro estado exige algún hueco.
 * Devuelve el mensaje de error o `null` si es coherente.
 */
function seriesCoherence(status: unknown, values: readonly (number | null)[]): string | null {
  if (!isStatus(status)) return `estado inválido: ${JSON.stringify(status)}`
  const allPresent = values.every((value) => value !== null)
  if (status === 'observed' && !allPresent) return "estado 'observed' con algún valor nulo"
  if (status !== 'observed' && allPresent) return `estado '${status}' con los tres valores presentes`
  return null
}

/** Valida el objeto completo. Fail closed: cualquier duda es un error. */
export function validatePopulationStructure(
  v: unknown,
): { ok: true; data: PopulationStructureAnnual } | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (!isRecord(v)) return { ok: false, errors: ['La raíz no es un objeto'] }

  if (v.schemaVersion !== POPULATION_STRUCTURE_SCHEMA) {
    errors.push(`schemaVersion inválido: ${JSON.stringify(v.schemaVersion)}`)
  }
  if (v.sourceTable !== '68535' && v.sourceTable !== '68534') {
    errors.push(`sourceTable inválido: ${JSON.stringify(v.sourceTable)}`)
  }
  if (!isNonEmptyString(v.sourceUrl) || !/^https?:\/\//.test(v.sourceUrl)) {
    errors.push('sourceUrl debe ser una URL http(s) no vacía')
  }
  if (v.scope !== 'municipal_national' && v.scope !== 'municipal_insular') {
    errors.push(`scope inválido: ${JSON.stringify(v.scope)}`)
  }
  if (typeof v.period !== 'string' || !/^\d{4}$/.test(v.period)) {
    errors.push('period debe ser un año de 4 dígitos')
  }
  if (typeof v.retrievedAt !== 'string' || Number.isNaN(Date.parse(v.retrievedAt))) {
    errors.push('retrievedAt debe ser una fecha ISO válida')
  }
  if (typeof v.ineCode !== 'string' || !/^\d{5}$/.test(v.ineCode)) {
    errors.push('ineCode debe ser un código INE de 5 dígitos')
  }
  if (!isNonEmptyString(v.municipalityName)) {
    errors.push('municipalityName no puede estar vacío')
  }

  if (!Array.isArray(v.ageBands5y)) {
    errors.push('ageBands5y debe ser un array')
  } else {
    const bands = v.ageBands5y
    if (bands.length !== QUINQUENIAL_BANDS.length) {
      errors.push(`ageBands5y debe tener ${QUINQUENIAL_BANDS.length} grupos; tiene ${bands.length}`)
    }
    const keys: number[] = []
    bands.forEach((raw, i) => {
      if (!isRecord(raw)) {
        errors.push(`ageBands5y[${i}] no es un objeto`)
        return
      }
      if (!isNonEmptyString(raw.band)) errors.push(`ageBands5y[${i}].band no es texto`)
      const key = typeof raw.band === 'string' ? structureBandKey(raw.band) : Number.NaN
      if (!Number.isFinite(key)) {
        errors.push(`ageBands5y[${i}].band no reconocible: ${JSON.stringify(raw.band)}`)
      } else {
        keys.push(key)
      }
      if (isNullableNumber(raw.total) && isNullableNumber(raw.male) && isNullableNumber(raw.female)) {
        const coherence = seriesCoherence(raw.status, [raw.total, raw.male, raw.female])
        if (coherence !== null) errors.push(`ageBands5y[${i}]: ${coherence}`)
      } else {
        errors.push(`ageBands5y[${i}] tiene valores no numéricos`)
      }
    })
    if (keys.length === bands.length && keys.join(',') !== QUINQUENIAL_KEYS.join(',')) {
      errors.push('ageBands5y no cubre exactamente las claves 0..100 (paso 5) en orden')
    }
  }

  if (v.ageDetail !== null) {
    if (!Array.isArray(v.ageDetail)) {
      errors.push('ageDetail debe ser null o un array')
    } else {
      const detail = v.ageDetail
      if (detail.length !== 101) {
        errors.push(`ageDetail debe tener 101 edades (0..100); tiene ${detail.length}`)
      }
      const ages: number[] = []
      detail.forEach((raw, i) => {
        if (!isRecord(raw)) {
          errors.push(`ageDetail[${i}] no es un objeto`)
          return
        }
        if (typeof raw.age !== 'number' || !Number.isInteger(raw.age) || raw.age < 0 || raw.age > 100) {
          errors.push(`ageDetail[${i}].age debe ser un entero 0..100`)
        } else {
          ages.push(raw.age)
        }
        if (!isNonEmptyString(raw.label)) errors.push(`ageDetail[${i}].label no es texto`)
        if (isNullableNumber(raw.total) && isNullableNumber(raw.male) && isNullableNumber(raw.female)) {
          const coherence = seriesCoherence(raw.status, [raw.total, raw.male, raw.female])
          if (coherence !== null) errors.push(`ageDetail[${i}]: ${coherence}`)
        } else {
          errors.push(`ageDetail[${i}] tiene valores no numéricos`)
        }
      })
      if (ages.length === detail.length && ages.some((age, i) => age !== i)) {
        errors.push('ageDetail debe cubrir 0..100 sin huecos ni duplicados, en orden')
      }
    }
  }

  if (!isRecord(v.totals)) {
    errors.push('totals no es un objeto')
  } else if (!isNullableNumber(v.totals.total) || !isNullableNumber(v.totals.male) || !isNullableNumber(v.totals.female)) {
    errors.push('totals.total/male/female deben ser números finitos o null')
  }

  if (!isRecord(v.quality)) {
    errors.push('quality no es un objeto')
  } else {
    const q = v.quality
    if (q.territoryMatch !== 'exact' && q.territoryMatch !== 'missing') {
      errors.push(`quality.territoryMatch inválido: ${JSON.stringify(q.territoryMatch)}`)
    }
    for (const flag of ['totalBySexReconciled', 'totalByAgeReconciled', 'groupingReconciled'] as const) {
      if (typeof q[flag] !== 'boolean') errors.push(`quality.${flag} debe ser booleano`)
    }
    if (typeof q.sourceChecksum !== 'string' || !/^[0-9a-f]{64}$/.test(q.sourceChecksum)) {
      errors.push('quality.sourceChecksum debe ser un SHA-256 en minúsculas (64 hex)')
    }
    if (q.validationStatus !== 'passed' && q.validationStatus !== 'partial' && q.validationStatus !== 'failed') {
      errors.push(`quality.validationStatus inválido: ${JSON.stringify(q.validationStatus)}`)
    }
    const crossCheck = q.crossCheck68065
    if (crossCheck !== null) {
      if (!isRecord(crossCheck)) {
        errors.push('quality.crossCheck68065 debe ser null o un objeto')
      } else if (
        !isNullableNumber(crossCheck.total) ||
        !isNullableNumber(crossCheck.male) ||
        !isNullableNumber(crossCheck.female) ||
        typeof crossCheck.matches !== 'boolean'
      ) {
        errors.push('quality.crossCheck68065 debe declarar total/male/female (número o null) y matches booleano')
      }
    }
  }

  if (v.sourceTable === '68535' && v.scope !== 'municipal_national') {
    errors.push('sourceTable 68535 exige scope municipal_national')
  }
  if (v.sourceTable === '68534' && v.scope !== 'municipal_insular') {
    errors.push('sourceTable 68534 exige scope municipal_insular')
  }
  if ((v.sourceTable === '68534') !== (v.ageDetail !== null)) {
    errors.push('ageDetail debe existir únicamente con sourceTable 68534')
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, data: v as unknown as PopulationStructureAnnual }
}

// ============================================================================
// Estructura territorial 2025 (nacional / CCAA / provincia) — AMPLIACIÓN ADITIVA
//
// QUÉ ES
//   Modelo puro (sin I/O, sin dependencias) de la estructura de población por
//   sexo y edad de los territorios supra-municipales a partir de la tabla INE
//   68521 (nacional, comunidades y ciudades autónomas y provincias), con la
//   misma desagregación quinquenal (21 grupos) y la misma nacionalidad "Total"
//   que la tabla municipal 68535. Reutiliza los tipos, `parseValueEs`,
//   `computeStructureIndicators` y `reconcileStructure` del contrato municipal
//   mediante un adaptador interno: las reglas normativas (ausencia ≠ 0,
//   tolerancia 0, nada se estima) son idénticas a las municipales.
//
//   Esta sección es ADITIVA: NO altera `socideas-population-structure@1` ni la
//   API municipal ya validada (`PopulationStructureAnnual`).
// ============================================================================

/** Versión del esquema del dataset territorial. */
export const POPULATION_STRUCTURE_DATASET_SCHEMA = 'socideas-population-structure-dataset@1'
/** Versión del esquema del Índice de referencias de benchmark. */
export const POPULATION_BENCHMARK_REFS_SCHEMA = 'socideas-population-benchmark-refs@1'

/** Nivel territorial de la tabla 68521. */
export type TerritorialLevel = 'nacional' | 'ccaa' | 'provincia'
/** Estado de validación de un objeto territorial o del dataset. */
export type TerritorialValidationStatus = 'passed' | 'partial' | 'failed'

/** Procedencia de un objeto territorial (tabla 68521). */
export interface TerritorialSource {
  table: '68521'
  url: string
  checksum: string
  retrievedAt: string
}

/** Calidad de un objeto territorial. */
export interface TerritorialQuality {
  /** Estado agregado de total/hombres/mujeres y de las 21 bandas. */
  valueStatus: StructureValueStatus
  totalBySexReconciled: boolean
  totalByAgeReconciled: boolean
  validationStatus: TerritorialValidationStatus
}

/** Estructura de población de un territorio (nacional, CCAA o provincia). */
export interface TerritorialPopulationStructure {
  /** "ES" para el nivel nacional; código INE de 2 dígitos para CCAA/provincia. */
  territoryCode: string
  territoryName: string
  territoryLevel: TerritorialLevel
  period: string // "2025"
  total: number | null
  male: number | null
  female: number | null
  /** 21 grupos quinquenales ("0 a 4 años" ... "100 y más años"). */
  ageBands: PopulationStructureBand[]
  derivedIndicators: StructureIndicator[]
  source: TerritorialSource
  quality: TerritorialQuality
}

/** Entrada del manifiesto de fuentes del dataset. */
export interface PopulationSourceManifestEntry {
  table: '68521' | '68535'
  label: string
  url: string
  path: string
  sha256: string
  bytes: number | null
  rows: number | null
}

/** Calidad agregada del dataset territorial. */
export interface PopulationStructureDatasetQuality {
  provincesCount: number
  autonomousCommunitiesCount: number
  provincesWithCompleteBands: number
  autonomousCommunitiesWithCompleteBands: number
  nationalCompleteBands: boolean
  provincesReconciled: number
  autonomousCommunitiesReconciled: number
  nationalReconciled: boolean
  bandLabelsConsistentWith68535: boolean
  validationStatus: TerritorialValidationStatus
}

/** Dataset territorial 2025 (nacional + CCAA + provincias). */
export interface PopulationStructureDataset {
  schemaVersion: typeof POPULATION_STRUCTURE_DATASET_SCHEMA
  period: string
  retrievedAt: string
  sourceManifest: PopulationSourceManifestEntry[]
  provinces: TerritorialPopulationStructure[]
  autonomousCommunities: TerritorialPopulationStructure[]
  national: TerritorialPopulationStructure
  quality: PopulationStructureDatasetQuality
}

/** Referencias de benchmark de un municipio (códigos INE). */
export interface PopulationBenchmarkRefs {
  provincia: string
  ccaa: string
  nacional: 'ES'
}

/** Índice de referencias de benchmark municipal. */
export interface PopulationBenchmarkRefsIndex {
  schemaVersion: typeof POPULATION_BENCHMARK_REFS_SCHEMA
  period: string
  generatedAt: string
  refs: Record<string, PopulationBenchmarkRefs>
}

/** Etiqueta canónica del grupo quinquenal a partir de su clave (0..100). */
export function canonicalBandLabel(key: number): string {
  return key === 100 ? '100 y más años' : `${key} a ${key + 4} años`
}

/** Estado agregado de una serie territorial (totales + 21 bandas). */
export function territorialValueStatus(t: TerritorialPopulationStructure): StructureValueStatus {
  const statuses: StructureValueStatus[] = [
    t.total === null ? 'missing' : 'observed',
    t.male === null ? 'missing' : 'observed',
    t.female === null ? 'missing' : 'observed',
    ...t.ageBands.map((band) => band.status),
  ]
  return worstStatus(statuses)
}

/**
 * Adaptador territorio → contrato municipal. Permite reutilizar
 * `reconcileStructure` y `computeStructureIndicators` sin duplicar reglas. Es
 * interno: el objeto resultante NO se publica ni se valida como municipal.
 */
function territorialToAnnual(t: TerritorialPopulationStructure): PopulationStructureAnnual {
  return {
    schemaVersion: POPULATION_STRUCTURE_SCHEMA,
    sourceTable: '68535',
    sourceUrl: t.source.url,
    scope: 'municipal_national',
    period: t.period,
    retrievedAt: t.source.retrievedAt,
    ineCode: t.territoryCode,
    municipalityName: t.territoryName,
    ageBands5y: t.ageBands,
    ageDetail: null,
    totals: { total: t.total, male: t.male, female: t.female },
    quality: {
      territoryMatch: 'exact',
      totalBySexReconciled: false,
      totalByAgeReconciled: false,
      groupingReconciled: false,
      sourceChecksum: t.source.checksum,
      validationStatus: 'failed',
      crossCheck68065: null,
    },
  }
}

/** Reconciliaciones del territorio (total=H+M, suma de bandas=total). */
export function reconcileTerritorialStructure(t: TerritorialPopulationStructure): StructureReconciliation[] {
  return reconcileStructure(territorialToAnnual(t))
}

/** Indicadores derivados del territorio (mismos que el contrato municipal). */
export function computeTerritorialIndicators(t: TerritorialPopulationStructure): StructureIndicator[] {
  return computeStructureIndicators(territorialToAnnual(t))
}

const TERRITORIAL_LEVELS: readonly TerritorialLevel[] = ['nacional', 'ccaa', 'provincia']
const VALIDATION_STATUSES: readonly TerritorialValidationStatus[] = ['passed', 'partial', 'failed']

/**
 * Valida un objeto territorial. Fail closed: cualquier duda es un error.
 * Recalcula las reconciliaciones y exige que los flags `quality` coincidan con
 * el cálculo (tolerancia 0).
 */
function validateTerritorialObject(
  v: unknown,
  expectedLevel: TerritorialLevel,
  errors: string[],
  path: string,
): void {
  const before = errors.length
  if (!isRecord(v)) {
    errors.push(`${path} no es un objeto`)
    return
  }
  if (!isNonEmptyString(v.territoryCode)) errors.push(`${path}.territoryCode no es texto`)
  if (!isNonEmptyString(v.territoryName)) errors.push(`${path}.territoryName no es texto`)
  if (typeof v.territoryLevel !== 'string' || !(TERRITORIAL_LEVELS as readonly string[]).includes(v.territoryLevel)) {
    errors.push(`${path}.territoryLevel inválido: ${JSON.stringify(v.territoryLevel)}`)
  } else if (v.territoryLevel !== expectedLevel) {
    errors.push(`${path}.territoryLevel debe ser ${expectedLevel}; es ${v.territoryLevel}`)
  }
  if (v.territoryLevel === 'nacional') {
    if (v.territoryCode !== 'ES') errors.push(`${path}.territoryCode del nacional debe ser 'ES'`)
  } else if (typeof v.territoryCode !== 'string' || !/^\d{2}$/.test(v.territoryCode)) {
    errors.push(`${path}.territoryCode debe ser un código INE de 2 dígitos`)
  }
  if (typeof v.period !== 'string' || !/^\d{4}$/.test(v.period)) errors.push(`${path}.period debe ser un año`)
  if (!isNullableNumber(v.total) || !isNullableNumber(v.male) || !isNullableNumber(v.female)) {
    errors.push(`${path}.total/male/female deben ser números finitos o null`)
  }
  if (!Array.isArray(v.ageBands)) {
    errors.push(`${path}.ageBands debe ser un array`)
  } else {
    const bands = v.ageBands
    if (bands.length !== QUINQUENIAL_BANDS.length) {
      errors.push(`${path}.ageBands debe tener ${QUINQUENIAL_BANDS.length} grupos; tiene ${bands.length}`)
    }
    const keys: number[] = []
    bands.forEach((raw, i) => {
      if (!isRecord(raw)) {
        errors.push(`${path}.ageBands[${i}] no es un objeto`)
        return
      }
      const key = typeof raw.band === 'string' ? structureBandKey(raw.band) : Number.NaN
      if (!Number.isFinite(key)) {
        errors.push(`${path}.ageBands[${i}].band no reconocible: ${JSON.stringify(raw.band)}`)
      } else {
        keys.push(key)
      }
      if (isNullableNumber(raw.total) && isNullableNumber(raw.male) && isNullableNumber(raw.female)) {
        const coherence = seriesCoherence(raw.status, [raw.total, raw.male, raw.female])
        if (coherence !== null) errors.push(`${path}.ageBands[${i}]: ${coherence}`)
      } else {
        errors.push(`${path}.ageBands[${i}] tiene valores no numéricos`)
      }
    })
    if (keys.length === bands.length && keys.join(',') !== QUINQUENIAL_KEYS.join(',')) {
      errors.push(`${path}.ageBands no cubre exactamente las claves 0..100 (paso 5) en orden`)
    }
  }
  if (!Array.isArray(v.derivedIndicators)) {
    errors.push(`${path}.derivedIndicators debe ser un array`)
  } else {
    v.derivedIndicators.forEach((raw, i) => {
      if (!isRecord(raw)) {
        errors.push(`${path}.derivedIndicators[${i}] no es un objeto`)
        return
      }
      if (!isNonEmptyString(raw.key)) errors.push(`${path}.derivedIndicators[${i}].key no es texto`)
      if (!isNonEmptyString(raw.label)) errors.push(`${path}.derivedIndicators[${i}].label no es texto`)
      if (!isNullableNumber(raw.value)) errors.push(`${path}.derivedIndicators[${i}].value debe ser número o null`)
      for (const field of ['unit', 'formula', 'method'] as const) {
        if (typeof raw[field] !== 'string') errors.push(`${path}.derivedIndicators[${i}].${field} debe ser texto`)
      }
    })
  }
  if (!isRecord(v.source)) {
    errors.push(`${path}.source no es un objeto`)
  } else if (
    v.source.table !== '68521' ||
    !isNonEmptyString(v.source.url) ||
    !/^https?:\/\//.test(v.source.url) ||
    typeof v.source.checksum !== 'string' ||
    !/^[0-9a-f]{64}$/.test(v.source.checksum) ||
    typeof v.source.retrievedAt !== 'string' ||
    Number.isNaN(Date.parse(v.source.retrievedAt))
  ) {
    errors.push(`${path}.source inválido (tabla 68521, url http(s), checksum SHA-256 y retrievedAt ISO)`)
  }
  if (!isRecord(v.quality)) {
    errors.push(`${path}.quality no es un objeto`)
  } else {
    const q = v.quality
    if (!isStatus(q.valueStatus)) errors.push(`${path}.quality.valueStatus inválido`)
    for (const flag of ['totalBySexReconciled', 'totalByAgeReconciled'] as const) {
      if (typeof q[flag] !== 'boolean') errors.push(`${path}.quality.${flag} debe ser booleano`)
    }
    if (typeof q.validationStatus !== 'string' || !(VALIDATION_STATUSES as readonly string[]).includes(q.validationStatus)) {
      errors.push(`${path}.quality.validationStatus inválido`)
    }
  }
  // Reconciliaciones recalculadas: solo si la estructura es válida hasta aquí.
  if (errors.length === before) {
    const annual = territorialToAnnual(v as unknown as TerritorialPopulationStructure)
    const checks = reconcileStructure(annual)
    const hardMismatch = checks.some(
      (check) => check.izquierda !== null && check.derecha !== null && !check.ok,
    )
    if (hardMismatch) errors.push(`${path}: reconciliación con tolerancia 0 fallida (${checks.filter((c) => !c.ok).map((c) => c.id).join(', ')})`)
    const byId = new Map(checks.map((check) => [check.id, check]))
    const quality = v.quality as Record<string, unknown>
    const sex = byId.get('totales-sexo')
    if (sex !== undefined && quality.totalBySexReconciled !== sex.ok) {
      errors.push(`${path}.quality.totalBySexReconciled (${String(quality.totalBySexReconciled)}) no coincide con el cálculo (${sex.ok})`)
    }
    const ages = byId.get('bandas-total')
    if (ages !== undefined && quality.totalByAgeReconciled !== ages.ok) {
      errors.push(`${path}.quality.totalByAgeReconciled (${String(quality.totalByAgeReconciled)}) no coincide con el cálculo (${ages.ok})`)
    }
  }
}

/** Valida el dataset territorial completo. Fail closed. */
export function validatePopulationStructureDataset(
  v: unknown,
): { ok: true; data: PopulationStructureDataset } | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (!isRecord(v)) return { ok: false, errors: ['La raíz no es un objeto'] }

  if (v.schemaVersion !== POPULATION_STRUCTURE_DATASET_SCHEMA) {
    errors.push(`schemaVersion inválido: ${JSON.stringify(v.schemaVersion)}`)
  }
  if (typeof v.period !== 'string' || !/^\d{4}$/.test(v.period)) {
    errors.push('period debe ser un año de 4 dígitos')
  }
  if (typeof v.retrievedAt !== 'string' || Number.isNaN(Date.parse(v.retrievedAt))) {
    errors.push('retrievedAt debe ser una fecha ISO válida')
  }
  if (!Array.isArray(v.sourceManifest) || v.sourceManifest.length === 0) {
    errors.push('sourceManifest debe ser un array no vacío')
  } else {
    const tables: string[] = []
    v.sourceManifest.forEach((raw, i) => {
      if (!isRecord(raw)) {
        errors.push(`sourceManifest[${i}] no es un objeto`)
        return
      }
      if (raw.table !== '68521' && raw.table !== '68535') errors.push(`sourceManifest[${i}].table inválida`)
      else tables.push(raw.table)
      if (!isNonEmptyString(raw.label)) errors.push(`sourceManifest[${i}].label no es texto`)
      if (!isNonEmptyString(raw.url) || !/^https?:\/\//.test(raw.url)) errors.push(`sourceManifest[${i}].url inválida`)
      if (!isNonEmptyString(raw.path)) errors.push(`sourceManifest[${i}].path no es texto`)
      if (typeof raw.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(raw.sha256)) {
        errors.push(`sourceManifest[${i}].sha256 debe ser SHA-256 en minúsculas`)
      }
      if (!isNullableNumber(raw.bytes)) errors.push(`sourceManifest[${i}].bytes debe ser número o null`)
      if (!isNullableNumber(raw.rows)) errors.push(`sourceManifest[${i}].rows debe ser número o null`)
    })
    if (!tables.includes('68521')) errors.push("sourceManifest debe incluir la tabla '68521'")
  }

  validateTerritorialObject(v.national, 'nacional', errors, 'national')

  const ccaaCodes: string[] = []
  if (!Array.isArray(v.autonomousCommunities)) {
    errors.push('autonomousCommunities debe ser un array')
  } else {
    v.autonomousCommunities.forEach((raw, i) => {
      const before = errors.length
      validateTerritorialObject(raw, 'ccaa', errors, `autonomousCommunities[${i}]`)
      if (errors.length === before && isRecord(raw) && typeof raw.territoryCode === 'string') {
        ccaaCodes.push(raw.territoryCode)
      }
    })
  }
  const provCodes: string[] = []
  if (!Array.isArray(v.provinces)) {
    errors.push('provinces debe ser un array')
  } else {
    v.provinces.forEach((raw, i) => {
      const before = errors.length
      validateTerritorialObject(raw, 'provincia', errors, `provinces[${i}]`)
      if (errors.length === before && isRecord(raw) && typeof raw.territoryCode === 'string') {
        provCodes.push(raw.territoryCode)
      }
    })
  }
  if (new Set(ccaaCodes).size !== ccaaCodes.length) errors.push('autonomousCommunities tiene códigos duplicados')
  if (new Set(provCodes).size !== provCodes.length) errors.push('provinces tiene códigos duplicados')

  if (!isRecord(v.quality)) {
    errors.push('quality no es un objeto')
  } else {
    const q = v.quality
    if (q.provincesCount !== provCodes.length) errors.push('quality.provincesCount no coincide con provinces')
    if (q.autonomousCommunitiesCount !== ccaaCodes.length) {
      errors.push('quality.autonomousCommunitiesCount no coincide con autonomousCommunities')
    }
    for (const [key, max] of [
      ['provincesWithCompleteBands', provCodes.length],
      ['autonomousCommunitiesWithCompleteBands', ccaaCodes.length],
    ] as const) {
      const value = q[key]
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) {
        errors.push(`quality.${key} debe ser un entero entre 0 y ${max}`)
      }
    }
    for (const flag of ['nationalCompleteBands', 'nationalReconciled', 'bandLabelsConsistentWith68535'] as const) {
      if (typeof q[flag] !== 'boolean') errors.push(`quality.${flag} debe ser booleano`)
    }
    if (typeof q.validationStatus !== 'string' || !(VALIDATION_STATUSES as readonly string[]).includes(q.validationStatus)) {
      errors.push('quality.validationStatus inválido')
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, data: v as unknown as PopulationStructureDataset }
}

/** Valida las referencias de benchmark de un municipio. Fail closed. */
export function validatePopulationBenchmarkRefs(
  v: unknown,
): { ok: true; data: PopulationBenchmarkRefs } | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (!isRecord(v)) return { ok: false, errors: ['La raíz no es un objeto'] }
  if (typeof v.provincia !== 'string' || !/^\d{2}$/.test(v.provincia)) {
    errors.push('provincia debe ser un código INE de 2 dígitos')
  }
  if (typeof v.ccaa !== 'string' || !/^\d{2}$/.test(v.ccaa)) {
    errors.push('ccaa debe ser un código INE de 2 dígitos')
  }
  if (v.nacional !== 'ES') errors.push("nacional debe ser 'ES'")
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, data: v as unknown as PopulationBenchmarkRefs }
}

// ============================================================================
// Claves de objeto R2 y validación por objeto — AMPLIACIÓN ADITIVA (runtime)
//
// QUÉ ES
//   El layout canónico de objetos de la estructura de población `v1` en R2 y
//   un validador de UN SOLO territorio. No altera ningún contrato ya validado:
//   `validateTerritorialStructure` reutiliza la validación interna del dataset
//   (`validateTerritorialObject`) sin relajar ni duplicar sus reglas.
// ============================================================================

/** Prefijo R2 de la estructura de población `v1`. */
export const POPULATION_STRUCTURE_R2_PREFIX = 'socideas/population-structure/v1'

/** Tag base de Data Cache para la estructura de población publicada. */
export const POPULATION_STRUCTURE_TAG = 'socideas-population-structure'

/** Nivel de objeto publicado en R2 (municipio + jerarquía territorial). */
export type PopulationStructureObjectLevel = 'municipio' | 'nacional' | 'ccaa' | 'provincia'

/**
 * Clave R2 canónica de un objeto de estructura:
 *   `socideas/population-structure/v1/<nivel>/<código>.json`
 * (`municipio` usa el INE de 5 dígitos; `nacional` usa `ES`; CCAA/provincia el
 * código INE de 2 dígitos).
 */
export function populationStructureObjectKey(
  level: PopulationStructureObjectLevel,
  code: string,
): string {
  return `${POPULATION_STRUCTURE_R2_PREFIX}/${level}/${code}.json`
}

/**
 * Valida un único objeto territorial (nacional/CCAA/provincia). Fail closed:
 * mismas reglas que la validación del dataset, aplicadas a un objeto suelto.
 */
export function validateTerritorialStructure(
  v: unknown,
  expectedLevel: TerritorialLevel,
): { ok: true; data: TerritorialPopulationStructure } | { ok: false; errors: string[] } {
  const errors: string[] = []
  validateTerritorialObject(v, expectedLevel, errors, 'territory')
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, data: v as unknown as TerritorialPopulationStructure }
}
