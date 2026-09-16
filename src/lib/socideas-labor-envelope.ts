// Mercado de trabajo SOCideas (Fase 2B): paro registrado SEPE + afiliación TGSS.
//
// Módulo PURO (sin I/O, sin R2, sin Supabase, sin secretos): declara el diseño
// del envelope v2 para los dos indicadores, parsea los ficheros oficiales
// reales y valida coherencia. La carga masiva vive en scripts/dry-run-labor-*
// y en el futuro `sync-labor-mensual` (conector batch MENSUAL, nunca sync diario).
//
// Fuentes confirmadas en vivo (2026-09-16):
// - SEPE CSV anual: https://sede.sepe.gob.es/es/portaltrabaja/resources/sede/datos_abiertos/datos/Paro_por_municipios_{YYYY}_csv.csv
//   Separador `;`, codificación Windows-1252, 20 columnas (ver SEPE_COLUMNS).
//   Celdas `<5` = secreto estadístico → se OMITEN (nunca 0, nunca estimado).
// - TGSS XLSX mensual: https://www.seg-social.es/descarga/es/Muni{MM}{YYYY}
//   (verificado: Muni072026, 200 OK, 522.660 bytes). Hoja única, fila 1 título
//   "FECHA DE DATOS: …", fila 2 cabeceras, filas 3..N-2 municipios, 2 notas.
//   Columna B = "NNNNN Nombre" (INE = 5 primeros dígitos). Filas sin INE
//   (subtotales provinciales, "NO DISTRIBUIDOS") SE IGNORAN.
//   Celdas " <5" / ">=X" (rangos de secreto) → se OMITEN (nunca estimado).
//
// Regla de slugs: se REUTILIZAN `paro_registrado` y `afiliacion_total` (ya en
// catálogos R2: "Paro registrado" / "Afiliados a la Seguridad Social"). Crear
// `unemployment_registered` duplicaría el catálogo y rompería la deduplicación
// v2; la tabla LABOR_SLUG_ALIAS documenta la equivalencia ES↔EN.
//
// Regla temporal: periodo MENSUAL ("2026-07") frente a bloques anuales. La UI
// debe advertir "Julio 2026 · dato mensual" y NUNCA igualar años entre bloques.

/** Slugs canónicos reutilizados (NO crear slugs nuevos para estos conceptos). */
export const LABOR_INDICATOR_SLUGS = {
  paro: 'paro_registrado',
  afiliacion: 'afiliacion_total',
} as const

export const LABOR_INDICATOR_NAMES = {
  paro_registrado: 'Paro registrado',
  afiliacion_total: 'Afiliados a la Seguridad Social',
} as const

/** Equivalencias documentales ES↔EN (solo alias, el slug canónico es el ES). */
export const LABOR_SLUG_ALIAS: Record<string, string> = {
  unemployment_registered: 'paro_registrado',
  social_security_affiliation: 'afiliacion_total',
}

export const LABOR_SOURCE_SLUGS = { sepe: 'sepe', tgss: 'tgss' } as const

export const LABOR_SOURCE_NAMES = {
  sepe: 'Paro registrado y contratos por municipio',
  tgss: 'Afiliación a la Seguridad Social por municipio (último día del mes)',
} as const

export const LABOR_ORGANISMS = { sepe: 'SEPE', tgss: 'TGSS' } as const

/** Convención tableId ya cargada en R2 (se reutiliza tal cual).
 * Evidencia 2026-09-16 (3 municipios reales): 28079/07010/41091 usan
 * 'sepe_2026_07' y 'tgss_2026_07' en sus filas de total. Escritor original:
 * scripts/load-economia-batch1.ts (f2e81b2, 2026-09-04). Los tableId
 * 'sepe_paro'/'tgss_afiliacion' de sepe-paro.ts/tgss-afiliacion.ts son una
 * entrada de diseño anterior nunca publicada: NO usar para filas nuevas,
 * para no crear dos tableId bajo el mismo indicador en un envelope (v2 §3B).
 * Las filas de detalle (sexo/tramos/sectores/regímenes) de esta fase usan
 * exactamente estos mismos tableId que los totales ya publicados. */
export function sepeTableId(year: number, month: number): string {
  return `sepe_${year}_${String(month).padStart(2, '0')}`
}
export function tgssTableId(year: number, month: number): string {
  return `tgss_${year}_${String(month).padStart(2, '0')}`
}

/** URLs de descarga verificadas en vivo. */
export function sepeCsvUrl(year: number): string {
  return `https://sede.sepe.gob.es/es/portaltrabaja/resources/sede/datos_abiertos/datos/Paro_por_municipios_${year}_csv.csv`
}
export function tgssMuniUrl(year: number, month: number): string {
  return `https://www.seg-social.es/descarga/es/Muni${String(month).padStart(2, '0')}${year}`
}

/** Catálogo datos.gob.es del CSV SEPE (actualización 2026-06-19). */
export const SEPE_CATALOG_URL =
  'https://datos.gob.es/es/catalogo/ea0041513-paro-registrado-por-municipios-desglosado-por-sexo-tramos-de-edad-y-sector-de-actividad-economica'

/** Columnas observadas del CSV SEPE 2026 (índices 0-based tras split por `;`). */
export const SEPE_COLUMNS = [
  'codigo_mes', // 0: YYYYMM (202601..202607 en el fichero 2026)
  'mes', // 1: "Julio de 2026"
  'codigo_ca', // 2
  'comunidad_autonoma', // 3
  'codigo_provincia', // 4
  'provincia', // 5
  'codigo_municipio', // 6: INE 5 dígitos
  'municipio', // 7
  'paro_total', // 8
  'paro_hombre_menor25', // 9
  'paro_hombre_25_45', // 10
  'paro_hombre_mayor45', // 11
  'paro_mujer_menor25', // 12
  'paro_mujer_25_45', // 13
  'paro_mujer_mayor45', // 14
  'paro_agricultura', // 15
  'paro_industria', // 16
  'paro_construccion', // 17
  'paro_servicios', // 18
  'paro_sin_empleo_anterior', // 19
] as const

/** Columnas observadas del XLSX TGSS MuniMMYYYY (letras de columna). */
export const TGSS_COLUMNS = {
  provincia: 'A',
  municipio: 'B', // "NNNNN Nombre"
  unidad: 'C', // etiqueta "TRAB." (se ignora)
  reg_general: 'D', // Reg. General (sin S.E. Agrario ni Hogar)
  reg_agrario: 'E', // R. G.- S.E.Agrario
  reg_hogar: 'F', // R. G.- S.E.Hogar
  reg_mar: 'G', // R. E. MAR
  reg_autonomos: 'H', // R. E. T. Autónomos
  reg_carbon: 'I', // R. E. M. Carbón
  total: 'J',
} as const

export const LABOR_SECTORS = [
  'agricultura',
  'industria',
  'construccion',
  'servicios',
  'sin_empleo_anterior',
] as const
export type LaborSector = (typeof LABOR_SECTORS)[number]

export const LABOR_REGIMENES = [
  'general',
  'agrario',
  'hogar',
  'mar',
  'autonomos',
  'carbon',
] as const
export type LaborRegimen = (typeof LABOR_REGIMENES)[number]

export const LABOR_TRAMOS_EDAD = ['<25', '25-45', '>=45'] as const

/** Fila de entrada compatible con `toV2Envelope` (src/lib/socideas-r2.ts). */
export interface LaborV2Input {
  indicator: { slug: string; nombre: string; unidad: string | null }
  source: { slug: string; organismo: string; nombre: string }
  anio_referencia: number
  valor_numerico: number | null
  unidad: string | null
  dimensiones: Record<string, string>
  source_url: string | null
  source_table_id: string | null
  source_series_id?: string | null
  estado_validacion: 'validado'
}

function baseDim(periodo: string): Record<string, string> {
  return { ambito: 'municipio', periodo, estado: 'consolidado' }
}

function laborInput(
  slug: keyof typeof LABOR_INDICATOR_NAMES,
  sourceSlug: 'sepe' | 'tgss',
  anio: number,
  valor: number,
  dimensiones: Record<string, string>,
  sourceUrl: string,
  tableId: string,
): LaborV2Input {
  return {
    indicator: { slug, nombre: LABOR_INDICATOR_NAMES[slug], unidad: 'personas' },
    source: {
      slug: sourceSlug,
      organismo: LABOR_ORGANISMS[sourceSlug],
      nombre: LABOR_SOURCE_NAMES[sourceSlug],
    },
    anio_referencia: anio,
    valor_numerico: valor,
    unidad: 'personas',
    dimensiones,
    source_url: sourceUrl,
    source_table_id: tableId,
    source_series_id: null,
    estado_validacion: 'validado',
  }
}

/** Celda SEPE: entero ≥0; `<5`/vacío → null (secreto → se omite la tupla). */
export function parseSepeCell(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null
  const s = raw.trim()
  if (s === '' || s === '<5') return null
  if (!/^\d+$/.test(s)) return null
  return Number(s)
}

/** Celda TGSS: número exacto; " <5" / ">=X" / texto → null (rango → se omite). */
export function parseTgssCell(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw
  if (typeof raw !== 'string') return null
  const s = raw.trim().replace(/\./g, '')
  if (!/^\d+$/.test(s)) return null
  return Number(s)
}

/** INE de 5 dígitos en "NNNNN Nombre" (TGSS col B) o campo SEPE dedicado. */
export function extractIne5Labor(texto: string): string | null {
  const m = texto.match(/^(\d{5})\b/)
  return m ? m[1] : null
}

export interface SepeMonthRow {
  codigoIne: string
  municipio: string
  anio: number
  mes: number // 1-12
  periodo: string // "2026-07"
  etiquetaMes: string // "Julio de 2026"
  total: number | null
  hombres: (number | null)[] // 3 tramos
  mujeres: (number | null)[] // 3 tramos
  sectores: Record<LaborSector, number | null>
}

/** Parsea el texto del CSV SEPE (ya decodificado como latin1/Windows-1252). */
export function parseSepeCsv(text: string): SepeMonthRow[] {
  const out: SepeMonthRow[] = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line || line.startsWith(';;;')) continue
    const cols = line.split(';')
    if (cols.length < 20) continue
    if (!/^\d{6}$/.test((cols[0] ?? '').trim())) continue // cabecera/título
    if (!/^\d{5}$/.test((cols[6] ?? '').trim())) continue
    const codigoMes = cols[0].trim()
    const anio = Number(codigoMes.slice(0, 4))
    const mes = Number(codigoMes.slice(4, 6))
    if (!(mes >= 1 && mes <= 12)) continue
    out.push({
      codigoIne: cols[6].trim(),
      municipio: (cols[7] ?? '').trim(),
      anio,
      mes,
      periodo: `${anio}-${String(mes).padStart(2, '0')}`,
      etiquetaMes: (cols[1] ?? '').trim(),
      total: parseSepeCell(cols[8]),
      hombres: [parseSepeCell(cols[9]), parseSepeCell(cols[10]), parseSepeCell(cols[11])],
      mujeres: [parseSepeCell(cols[12]), parseSepeCell(cols[13]), parseSepeCell(cols[14])],
      sectores: {
        agricultura: parseSepeCell(cols[15]),
        industria: parseSepeCell(cols[16]),
        construccion: parseSepeCell(cols[17]),
        servicios: parseSepeCell(cols[18]),
        sin_empleo_anterior: parseSepeCell(cols[19]),
      },
    })
  }
  return out
}

export interface TgssMuniRow {
  codigoIne: string
  municipio: string
  total: number | null
  regimenes: Record<LaborRegimen, number | null>
}

/** Mapea una fila del XLSX TGSS (celdas D..J ya extraídas) a valores. */
export function mapTgssRow(
  municipioCell: string,
  cells: { general: unknown; agrario: unknown; hogar: unknown; mar: unknown; autonomos: unknown; carbon: unknown; total: unknown },
): TgssMuniRow | null {
  const ine = extractIne5Labor((municipioCell ?? '').trim())
  if (!ine) return null // subtotal provincial / NO DISTRIBUIDOS → se ignora
  return {
    codigoIne: ine,
    municipio: municipioCell.trim().slice(6).trim(),
    total: parseTgssCell(cells.total),
    regimenes: {
      general: parseTgssCell(cells.general),
      agrario: parseTgssCell(cells.agrario),
      hogar: parseTgssCell(cells.hogar),
      mar: parseTgssCell(cells.mar),
      autonomos: parseTgssCell(cells.autonomos),
      carbon: parseTgssCell(cells.carbon),
    },
  }
}

export interface LaborWarning {
  codigoIne: string
  periodo: string
  regla: string
  detalle: string
}

function sumAll(vals: (number | null)[]): number | null {
  if (vals.some((v) => v === null)) return null
  return (vals as number[]).reduce((a, b) => a + b, 0)
}

/**
 * Construye las tuplas v2 de detalle SEPE para UNA fila mensual.
 * Emite: total (si exacto) + total por sexo (si los 3 tramos son exactos) +
 * 6 celdas sexo×tramo (las exactas) + 5 celdas de sector (las exactas).
 * Las celdas suprimidas NO generan tupla (ausencia = ND en UI).
 * Las incoherencias de suma generan warnings, nunca correcciones.
 */
export function buildSepeTuples(
  row: SepeMonthRow,
  sourceUrl: string,
  warnings: LaborWarning[],
): LaborV2Input[] {
  const out: LaborV2Input[] = []
  const tableId = sepeTableId(row.anio, row.mes)
  const push = (valor: number | null, dim: Record<string, string>): void => {
    if (valor === null) return
    out.push(laborInput('paro_registrado', 'sepe', row.anio, valor, dim, sourceUrl, tableId))
  }
  push(row.total, baseDim(row.periodo))
  const totalH = sumAll(row.hombres)
  const totalM = sumAll(row.mujeres)
  push(totalH, { ...baseDim(row.periodo), sexo: 'hombres' })
  push(totalM, { ...baseDim(row.periodo), sexo: 'mujeres' })
  const sexos = [
    { clave: 'hombres', vals: row.hombres },
    { clave: 'mujeres', vals: row.mujeres },
  ] as const
  for (const s of sexos) {
    s.vals.forEach((v, i) => {
      push(v, { ...baseDim(row.periodo), sexo: s.clave, tramo_edad: LABOR_TRAMOS_EDAD[i] })
    })
  }
  for (const sector of LABOR_SECTORS) {
    push(row.sectores[sector], { ...baseDim(row.periodo), sector })
  }
  // Validaciones de coherencia (H+M=Total; sectores=Total). Solo avisan.
  if (row.total !== null && totalH !== null && totalM !== null && totalH + totalM !== row.total) {
    warnings.push({
      codigoIne: row.codigoIne,
      periodo: row.periodo,
      regla: 'sepe_sexo_suma_total',
      detalle: `H(${totalH})+M(${totalM})=${totalH + totalM} ≠ total ${row.total}`,
    })
  }
  const secSum = sumAll(LABOR_SECTORS.map((s) => row.sectores[s]))
  if (row.total !== null && secSum !== null && secSum !== row.total) {
    warnings.push({
      codigoIne: row.codigoIne,
      periodo: row.periodo,
      regla: 'sepe_sector_suma_total',
      detalle: `sectores=${secSum} ≠ total ${row.total}`,
    })
  }
  return out
}

/**
 * Construye las tuplas v2 de detalle TGSS para UNA fila municipal.
 * Emite: total (si exacto) + 6 regímenes (los exactos). Rangos ">=X"/" <5"
 * NO generan tupla. Suma de regímenes vs total: solo warning.
 */
export function buildTgssTuples(
  row: TgssMuniRow,
  anio: number,
  mes: number,
  periodo: string,
  sourceUrl: string,
  warnings: LaborWarning[],
): LaborV2Input[] {
  const out: LaborV2Input[] = []
  const tableId = tgssTableId(anio, mes)
  const push = (valor: number | null, dim: Record<string, string>): void => {
    if (valor === null) return
    out.push(laborInput('afiliacion_total', 'tgss', anio, valor, dim, sourceUrl, tableId))
  }
  push(row.total, baseDim(periodo))
  for (const reg of LABOR_REGIMENES) {
    push(row.regimenes[reg], { ...baseDim(periodo), regimen: reg })
  }
  const regSum = sumAll(LABOR_REGIMENES.map((r) => row.regimenes[r]))
  if (row.total !== null && regSum !== null && regSum !== row.total) {
    warnings.push({
      codigoIne: row.codigoIne,
      periodo,
      regla: 'tgss_regimen_suma_total',
      detalle: `regímenes=${regSum} ≠ total ${row.total}`,
    })
  }
  return out
}

/** Ejemplo de tupla v2 de 9 posiciones (orden FIJO) para documentación. */
export const LABOR_TUPLE_EXAMPLE: [number, number, number | null, string | null, number, number, string | null, string | null, string] = [
  0, // indIdx → indicators[i] = { slug: "paro_registrado", … }
  2026, // anio
  20480, // valor
  'personas', // unidad
  3, // dimIdx → { ambito: "municipio", periodo: "2026-07", estado: "consolidado", sexo: "hombres", tramo_edad: "25-45" }
  0, // urlIdx → CSV SEPE 2026
  'sepe_2026_07', // tableId
  null, // serieId
  'validado', // estado (único estado que se persiste)
]

/**
 * Plan del conector batch MENSUAL (esbozo tipado, sin I/O).
 * Periodicidad mensual: una ejecución al publicarse el mes (SEPE ~día 2-4,
 * TGSS último día del mes). Reanudable por checkpoint de INE + timeouts
 * 30/60 s + caché de catálogo en memoria (patrón sync-all-municipios.ts).
 */
export interface LaborMonthlyPlan {
  periodicidad: 'mensual'
  sepeCsvUrl: string
  tgssMuniUrl: string
  tableIds: { sepe: string; tgss: string }
  periodo: string
  timeoutDescargaMs: number
  timeoutMunicipioMs: number
  pausaEntreLotesMs: number
  loteTamano: number
}

export function describeMonthlyPlan(anio: number, mes: number): LaborMonthlyPlan {
  const periodo = `${anio}-${String(mes).padStart(2, '0')}`
  return {
    periodicidad: 'mensual',
    sepeCsvUrl: sepeCsvUrl(anio),
    tgssMuniUrl: tgssMuniUrl(anio, mes),
    tableIds: { sepe: sepeTableId(anio, mes), tgss: tgssTableId(anio, mes) },
    periodo,
    timeoutDescargaMs: 60000,
    timeoutMunicipioMs: 30000,
    pausaEntreLotesMs: 2000,
    loteTamano: 500,
  }
}
