// Indicadores educativos por sección censal — CONTRATO COMPARTIDO.
//
// Fuente: Censo Anual de Población, bloque "Educación y Relación con la
// actividad" (operación INE 1254736176992), resultados por secciones censales.
// Descarga oficial por provincia, formato TSV en UTF-8 con BOM:
//   https://www.ine.es/jaxiT3/files/t/csv_bd/{tableId}.csv
// Cabecera real del CSV:
//   Provincias | Municipios | Secciones | Sexo | <dimensión> | Periodo | Total
// La clave territorial es el CUSEC de 10 dígitos de la columna "Secciones";
// sus 5 primeros dígitos son el código INE municipal.
//
// NOTA sobre `sourceTable`: el INE publica una tabla DISTINTA por provincia, de
// modo que no existe un único id. El id exacto por provincia vive en
// `education-province-tables.json` (generado leyendo el índice provincial
// oficial, no fijado a mano). Aquí se declara el rango y la variable oficial.
//
// El INE suprime las secciones censales con menos de 50 habitantes. Esas celdas
// llegan vacías o con '.', y se normalizan a null/no_difundido. NUNCA a cero.
//
// El INE NO separa Bachillerato, FP de grado medio, FP de grado superior,
// Máster ni Doctorado: los agrupa. Por eso no se publican como indicadores
// independientes. El detalle está en `education-category-mapping.json`
// (campo `not_publishable`).

import type { SeccionIndicador, SeccionValorStatus } from './socideas-secciones'

export const EDUCATION_DOMAIN = 'education'
export const EDUCATION_R2_PREFIX = 'socideas/secciones/v1/education'
export const EDUCATION_SCHEMA_VERSION = 'education-v1'

/** Rango de ids jaxiT3 de las tablas educativas y de actividad por provincia. */
export const EDUCATION_TABLE_RANGE = { min: 66637, max: 66844 }

/** Etiqueta de la columna que el INE usa para los recuentos absolutos. */
export const EDUCATION_SOURCE_MEASURE = 'Total'

/** Categorías literales tal como las publica el INE. No reescribir. */
export const EDUCATION_CATEGORIES = {
  formacion: [
    'Total',
    'Educación primaria e inferior',
    'Primera etapa de Educación Secundaria y similar',
    'Segunda etapa de Educación Secundaria y Educación Postsecundaria no Superior',
    'Educación superior',
  ],
  actividad: [
    'Total',
    'Ocupado/a',
    'Parado/a',
    'Perceptor/a pensión de incapacidad, jubilación, prejubilación',
    'Otra situación de inactividad',
    'Estudiante',
  ],
} as const

const SRC_URL = 'https://www.ine.es/dynt3/inebase/index.htm?padre=10607&capsel=10613'
const SRC_LABEL = 'Censo Anual de Población · Educación y Relación con la actividad'

/** Base de la definición compartida de un indicador del bloque. */
const base = (
  id: string,
  etiqueta: string,
  sourceLabel: string,
  unidad: string,
  universo: string,
  denominador: string | null,
  definicion: string,
  minimumAge: number | null,
) =>
  ({
    id,
    etiqueta,
    tema: 'educacion',
    domain: 'educacion',
    operation: '1254736176992',
    operationLabel: SRC_LABEL,
    sourceTable: `jaxiT3:${EDUCATION_TABLE_RANGE.min}-${EDUCATION_TABLE_RANGE.max} (formación) / misma por provincia`,
    sourceLabel,
    tableFamily: 'censo_educacion',
    url: SRC_URL,
    unidad,
    universo,
    denominador,
    definicion,
    publicadoPorSeccion: true,
    etiquetaNoDifundido: 'ND — dato no difundido por secreto estadístico',
    minimumAge,
  }) as const

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo de indicadores educativos
//
// Sólo se publica lo que la fuente permite calcular. Cada indicador tiene una
// fila equivalente en `education-category-mapping.json`.
// ─────────────────────────────────────────────────────────────────────────────

export interface EducationIndicator extends SeccionIndicador {
  domain: 'educacion'
  /** Bloque oficial del INE del que procede la variable. */
  group: 'formacion' | 'actividad'
  /** Base censal exacta: 'total' (formación) o '16+' (actividad). */
  populationBase: string
  /** Clave interna de la categoría oficial; la consume el parser. */
  sourceCategoryKey: string
  /** Edad mínima de la base, si la fuente la define. */
  minimumAge: number | null
  /** Fórmula de cálculo si es derivado. */
  calculationMethod?: string
}

/** Definición de un indicador educativo, con los campos comunes ya puestos. */
function ind(
  id: string,
  etiqueta: string,
  sourceLabel: string,
  group: 'formacion' | 'actividad',
  sourceCategoryKey: string,
  unidad: string,
  universo: string,
  denominador: string | null,
  definicion: string,
  minimumAge: number | null,
  calculationMethod?: string,
): EducationIndicator {
  return {
    id,
    etiqueta,
    tema: 'educacion',
    domain: 'educacion',
    group,
    populationBase: group === 'formacion' ? 'total' : '16+',
    sourceCategoryKey,
    minimumAge,
    operation: '1254736176992',
    operationLabel: SRC_LABEL,
    sourceTable: `jaxiT3:tabla por provincia (rango ${EDUCATION_TABLE_RANGE.min}-${EDUCATION_TABLE_RANGE.max})`,
    sourceLabel,
    tableFamily: 'censo_educacion',
    url: SRC_URL,
    unidad,
    universo,
    denominador,
    definicion,
    publicadoPorSeccion: true,
    etiquetaNoDifundido: 'ND — dato no difundido por secreto estadístico',
    ...(calculationMethod ? { calculationMethod } : {}),
  }
}

const POB_TOTAL = 'Población residente por sección censal'
const POB_16 = 'Población de 16 años o más por sección censal'
const DEN_TOTAL = 'Población total de la sección censal'
const DEN_16 = 'Población de 16 años o más de la sección'

/** Sólo se publica lo que la fuente permite calcular. Equivalente 1:1 con
 *  `education-category-mapping.json` → `indicators`. */
export const EDUCATION_INDICATORS: readonly EducationIndicator[] = [
  // ── Formación: recuentos absolutos ──────────────────────────────────────────
  ind('edu_personas_total', 'Población total de la sección', 'Total', 'formacion', 'total',
    'personas', POB_TOTAL, null,
    'Población residente total de la sección censal según el Censo Anual de Población.', null),
  ind('edu_personas_primaria_inferior', 'Educación primaria e inferior', 'Educación primaria e inferior',
    'formacion', 'primaria_inferior', 'personas', POB_TOTAL, null,
    'Personas con educación primaria e inferior como máximo nivel de formación alcanzado.', null),
  ind('edu_personas_primera_etapa_secundaria', 'Primera etapa de Educación Secundaria y similar',
    'Primera etapa de Educación Secundaria y similar', 'formacion', 'primera_etapa_secundaria',
    'personas', POB_TOTAL, null,
    'Personas cuya formación máxima es la primera etapa de la educación secundaria.', null),
  ind('edu_personas_segunda_etapa_postsecundaria',
    'Segunda etapa de Educación Secundaria y Educación Postsecundaria no Superior',
    'Segunda etapa de Educación Secundaria y Educación Postsecundaria no Superior',
    'formacion', 'segunda_etapa_postsecundaria', 'personas', POB_TOTAL, null,
    'Personas cuya formación máxima es la segunda etapa de la secundaria o la educación postsecundaria no superior. El INE agrupa aquí Bachillerato, FP de grado medio y FP de grado superior, y no los publica por separado.', null),
  ind('edu_personas_educacion_superior', 'Educación superior', 'Educación superior',
    'formacion', 'educacion_superior', 'personas', POB_TOTAL, null,
    'Personas cuya formación máxima es la educación superior. El INE no desagrega Máster ni Doctorado.', null),

  // ── Formación: porcentajes ─────────────────────────────────────────────────
  ind('edu_pct_primaria_inferior', '% Educación primaria e inferior', 'Educación primaria e inferior',
    'formacion', 'primaria_inferior', '%', POB_TOTAL, DEN_TOTAL,
    'Porcentaje de población residente con educación primaria e inferior como máximo nivel de formación.', null,
    '100 * edu_personas_primaria_inferior / edu_personas_total'),
  ind('edu_pct_primera_etapa_secundaria', '% Primera etapa de Educación Secundaria y similar',
    'Primera etapa de Educación Secundaria y similar', 'formacion', 'primera_etapa_secundaria',
    '%', POB_TOTAL, DEN_TOTAL,
    'Porcentaje de población residente cuya formación máxima es la primera etapa de la secundaria.', null,
    '100 * edu_personas_primera_etapa_secundaria / edu_personas_total'),
  ind('edu_pct_segunda_etapa_postsecundaria',
    '% Segunda etapa de Educación Secundaria y Postsecundaria no Superior',
    'Segunda etapa de Educación Secundaria y Educación Postsecundaria no Superior',
    'formacion', 'segunda_etapa_postsecundaria', '%', POB_TOTAL, DEN_TOTAL,
    'Porcentaje de población residente cuya formación máxima es la segunda etapa de la secundaria o la postsecundaria no superior.', null,
    '100 * edu_personas_segunda_etapa_postsecundaria / edu_personas_total'),
  ind('edu_pct_educacion_superior', '% Educación superior', 'Educación superior',
    'formacion', 'educacion_superior', '%', POB_TOTAL, DEN_TOTAL,
    'Porcentaje de población residente con educación superior como máximo nivel de formación. Indicador principal de la coropleta.', null,
    '100 * edu_personas_educacion_superior / edu_personas_total'),

  // ── Actividad: base 16+ ────────────────────────────────────────────────────
  ind('act_personas_total_16', 'Población de 16 años o más de la sección', 'Total',
    'actividad', 'total_16', 'personas', POB_16, null,
    'Población de 16 años o más de la sección censal según la Relación con la actividad.', 16),
  ind('act_personas_ocupados', 'Ocupado/a', 'Ocupado/a', 'actividad', 'ocupado',
    'personas', POB_16, null,
    'Personas de 16 años o más con la situación de actividad "Ocupado/a".', 16),
  ind('act_personas_parados', 'Parado/a', 'Parado/a', 'actividad', 'parado',
    'personas', POB_16, null,
    'Personas de 16 años o más con la situación de actividad "Parado/a".', 16),
  ind('act_personas_perceptores_pension', 'Perceptor/a pensión de incapacidad, jubilación, prejubilación',
    'Perceptor/a pensión de incapacidad, jubilación, prejubilación', 'actividad', 'perceptor_pension',
    'personas', POB_16, null,
    'Personas de 16 años o más perceptoras de pensión de incapacidad, jubilación o prejubilación. No equivale a la población pensionista.', 16),
  ind('act_personas_otra_inactividad', 'Otra situación de inactividad', 'Otra situación de inactividad',
    'actividad', 'otra_inactividad', 'personas', POB_16, null,
    'Personas de 16 años o más en otra situación de inactividad.', 16),
  ind('act_personas_estudiantes', 'Estudiante', 'Estudiante', 'actividad', 'estudiante',
    'personas', POB_16, null,
    'Personas de 16 años o más con la situación "Estudiante". Es la situación, no el nivel de estudios en curso.', 16),

  // ── Actividad: porcentajes ─────────────────────────────────────────────────
  ind('act_pct_ocupados', '% Ocupado/a', 'Ocupado/a', 'actividad', 'ocupado',
    '%', POB_16, DEN_16, 'Porcentaje de población de 16 años o más ocupada.', 16,
    '100 * act_personas_ocupados / act_personas_total_16'),
  ind('act_pct_parados', '% Parado/a', 'Parado/a', 'actividad', 'parado',
    '%', POB_16, DEN_16, 'Porcentaje de población de 16 años o más parada.', 16,
    '100 * act_personas_parados / act_personas_total_16'),
  ind('act_pct_perceptores_pension', '% Perceptor/a pensión',
    'Perceptor/a pensión de incapacidad, jubilación, prejubilación', 'actividad', 'perceptor_pension',
    '%', POB_16, DEN_16,
    'Porcentaje de población de 16 años o más perceptora de pensión de incapacidad, jubilación o prejubilación.', 16,
    '100 * act_personas_perceptores_pension / act_personas_total_16'),
  ind('act_pct_otra_inactividad', '% Otra situación de inactividad', 'Otra situación de inactividad',
    'actividad', 'otra_inactividad', '%', POB_16, DEN_16,
    'Porcentaje de población de 16 años o más en otra situación de inactividad.', 16,
    '100 * act_personas_otra_inactividad / act_personas_total_16'),
  ind('act_pct_estudiantes', '% Estudiante', 'Estudiante', 'actividad', 'estudiante',
    '%', POB_16, DEN_16,
    'Porcentaje de población de 16 años o más con la situación "Estudiante".', 16,
    '100 * act_personas_estudiantes / act_personas_total_16'),
]
// ─────────────────────────────────────────────────────────────────────────────
// Objeto publicado en R2 — CONTRATO REAL
//
// Es exactamente lo que escribe `scripts/load-section-education.ts` en
//   socideas/secciones/v1/education/normalized/{period}/{codigoINE}.json
// y lo que leen la API y el atlas. Claves en snake_case, como el resto de
// objetos de ingesta. No lleva geometría: la geometría es la del atlas base
// (`socideas/secciones/v1/municipal/{codigoINE}.json`) y se une por CUSEC.
// ─────────────────────────────────────────────────────────────────────────────

/** Estado de una celda educativa. Subconjunto de `SeccionValorStatus`. */
export type EducationObservationStatus =
  | 'observado'
  | 'derivado_verificable'
  | 'no_difundido'
  | 'sin_cobertura'
  | 'error_ingesta'

/** Una observación sección × indicador. `value` es null salvo observado/derivado. */
export interface EducationObservation {
  value: number | null
  /** Recuento del numerador. En los absolutos coincide con `value`. */
  numerator: number | null
  /** Recuento del denominador (sólo porcentajes). */
  denominator: number | null
  status: EducationObservationStatus
  /** true si la celda no se difundió (vacío o '.' en el CSV del INE). */
  nd_flag: boolean
  /** true si el motivo es el secreto estadístico (sección < 50 habitantes). */
  suppression_flag: boolean
  /** 'statistical_confidentiality' | 'denominador_cero' | 'componente_no_disponible' | … */
  reason: string | null
}

export interface EducationSection {
  /** CUSEC oficial de 10 dígitos. */
  sectionCode: string
  /** INE municipal de 5 dígitos (= prefijo del CUSEC). */
  municipalityCode: string
  provinceCode: string
  /** Denominación literal de la sección en el CSV. */
  sourceLabel: string
  /** indicatorId → observación. */
  values: Record<string, EducationObservation>
}

/** Disponibilidad real de un indicador en un municipio o en el catálogo. */
export interface EducationIndicatorAvailability {
  /** Secciones con valor observado o derivado. */
  observed_sections: number
  /** Secciones ND (secreto estadístico o denominador cero). */
  nd_sections: number
  /** Secciones con `sin_cobertura`. */
  no_coverage_sections: number
}

export interface EducationMunicipalObject {
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
    /** Fecha de descarga del CSV original (estable entre ejecuciones con el mismo SHA). */
    retrieved_at: string
  }
  sections: EducationSection[]
  coverage: {
    result_sections: number
    sections_with_data: number
    sections_suppressed: number
    indicators: number
    observations: number
    nd: number
    suppressed: number
  }
  /** indicatorId → disponibilidad en ESTE municipio. Base del badge. */
  indicator_availability: Record<string, EducationIndicatorAvailability>
  validation: {
    leading_zeros_preserved: boolean
    municipalities_matched: boolean
    percentages_in_range: boolean
    denominators_resolved: boolean
    issues: string[]
  }
  quality_flags: string[]
  /** SHA-256 del contenido sin campos volátiles. Base de la idempotencia. */
  content_sha256: string
}

/** Catálogo publicado en `socideas/secciones/v1/education/catalog.json`. */
export interface EducationCatalog {
  schema_version: typeof EDUCATION_SCHEMA_VERSION
  domain: typeof EDUCATION_DOMAIN
  parser_version: string
  mapping_version: string
  /** Periodo por defecto (el más reciente publicado). */
  period: number
  /** Todos los periodos realmente publicados. */
  periods: number[]
  source: {
    url: string
    index_url: string
    operation: string
    label: string
    organism: string
    licence: string
  }
  indicators: Array<{
    id: string
    label: string
    group: 'formacion' | 'actividad'
    unit: string
    population_base: string
    definition: string
    denominator: string | null
    calculation_method: string | null
    /** Tabla jaxiT3 por provincia: provinceCode → tableId. */
    tables: Record<string, number>
    availability: EducationIndicatorAvailability & { municipalities_with_data: number }
  }>
  exclusions: Array<{ id: string; reason: string }>
  totals: {
    provinces: number
    provinces_ok: number
    provinces_failed: number
    municipalities: number
    sections: number
    observations: number
    nd: number
    suppressed: number
  }
  /** Códigos INE (5 dígitos) con objeto publicado para `period`. */
  municipalities: string[]
  geometry: {
    join_key: 'CUSEC'
    source: string
    note: string
  }
  synced_at: string
}

export function isEducationMunicipalObject(obj: unknown): obj is EducationMunicipalObject {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Partial<EducationMunicipalObject>
  return (
    o.schema_version === EDUCATION_SCHEMA_VERSION &&
    o.domain === EDUCATION_DOMAIN &&
    typeof o.municipality_code === 'string' &&
    /^\d{5}$/.test(o.municipality_code) &&
    typeof o.period === 'number' &&
    Array.isArray(o.sections)
  )
}

/** Indicadores con al menos una sección observada en el municipio. Un indicador
 *  con todas las celdas ND o sin cobertura NO cuenta para el badge. */
export function educationIndicatorsWithData(obj: EducationMunicipalObject): string[] {
  const out: string[] = []
  const disp = obj.indicator_availability ?? {}
  for (const ind of EDUCATION_INDICATORS) {
    const a = disp[ind.id]
    if (a) {
      if (a.observed_sections > 0) out.push(ind.id)
      continue
    }
    // Objetos sin `indicator_availability`: se calcula sobre las secciones.
    if (obj.sections.some((s) => {
      const v = s.values[ind.id]
      return !!v && v.value !== null && (v.status === 'observado' || v.status === 'derivado_verificable')
    })) out.push(ind.id)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Objetos por municipio — FORMA ANTIGUA (fixtures). Pendiente de eliminar junto
// con SeccionesEducationExtension y socideas-test-data-local.
// ─────────────────────────────────────────────────────────────────────────────

/** @deprecated Usar `EducationMunicipalObject`. */
export interface EducationSectionValue {
  sectionCode: string
  indicatorId: string
  /** Numerador si está disponible. */
  numerator: number | null
  /** Denominador si está disponible. */
  denominator: number | null
  /** Valor calculado o publicado. */
  value: number | null
  /** Estado del dato. */
  status: SeccionValorStatus
  /** Razón o nota adicional. */
  note?: string | null
}

export interface EducationMunicipalDataset {
  schemaVersion: typeof EDUCATION_SCHEMA_VERSION
  domain: typeof EDUCATION_DOMAIN
  municipalityCode: string
  municipalityName: string
  period: number
  /** Año de la geometría de referencia. */
  geometryYear: number
  geometryCollection: string
  geometrySource: string
  /** Cantidad de secciones censales del municipio. */
  totalSections: number
  /** Secciones con al menos un indicador. */
  coveredSections: number
  indicators: EducationIndicator[]
  values: EducationSectionValue[]
  /** Validación de integridad. */
  validation: {
    sectionKeysValid: number
    sectionKeysInvalid: number
    valuesObserved: number
    valuesUndisclosed: number
    valuesMissing: number
  }
  source: {
    url: string
    operation: string
    table: string
    retrievedAt: string
  }
  generatedAt: string
}

export function isValidEducationDataset(obj: unknown): obj is EducationMunicipalDataset {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Partial<EducationMunicipalDataset>
  return (
    o.schemaVersion === EDUCATION_SCHEMA_VERSION &&
    o.domain === EDUCATION_DOMAIN &&
    typeof o.municipalityCode === 'string' &&
    typeof o.period === 'number' &&
    Array.isArray(o.values)
  )
}
