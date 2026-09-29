// Indicadores educativos por sección censal — CONTRATO COMPARTIDO.
//
// Fuente: Censo anual de población (operación INE 1254736176992), bloque
// Educación y relación con la actividad. Datos por sección censal.
//
// Estructura: objeto independiente por municipio+período, referenciando
// la geometría del atlas base pero con observaciones propias.

import type { SeccionIndicador, SeccionValorStatus } from './socideas-secciones'

export const EDUCATION_DOMAIN = 'education'
export const EDUCATION_R2_PREFIX = 'socideas/secciones/v1/education'
export const EDUCATION_SCHEMA_VERSION = 'education-v1'

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo de indicadores educativos
// ─────────────────────────────────────────────────────────────────────────────

export interface EducationIndicator extends SeccionIndicador {
  domain: 'educacion'
  /** Base censal exacta: población de X o más años. */
  populationBase: string
  /** Fórmula de cálculo si es derivado. */
  calculationMethod?: string
}

/** Indicadores educativos iniciales del Censo 2021+. */
export const EDUCATION_INDICATORS: readonly EducationIndicator[] = [
  {
    id: 'edu_sin_estudios_pct',
    etiqueta: 'Población sin estudios (%)',
    tema: 'educacion',
    domain: 'educacion',
    operation: '1254736176992',
    operationLabel: 'Censo anual de población',
    sourceTable: 'educacion_nivel_estudios',
    sourceLabel: 'Sin estudios',
    tableFamily: 'censo_educacion',
    url: 'https://www.ine.es/dynt3/inebase/es/index.htm?padre=10608',
    unidad: '%',
    universo: 'Población de 15 años o más',
    denominador: 'Población de 15 años o más',
    definicion: 'Porcentaje de población de 15 años o más sin ningún nivel de estudios completados.',
    publicadoPorSeccion: true,
    etiquetaNoDifundido: 'Dato no difundido',
    populationBase: '15+',
  },
  {
    id: 'edu_primaria_pct',
    etiqueta: 'Educación primaria incompleta (%)',
    tema: 'educacion',
    domain: 'educacion',
    operation: '1254736176992',
    operationLabel: 'Censo anual de población',
    sourceTable: 'educacion_nivel_estudios',
    sourceLabel: 'Educación primaria',
    tableFamily: 'censo_educacion',
    url: 'https://www.ine.es/dynt3/inebase/es/index.htm?padre=10608',
    unidad: '%',
    universo: 'Población de 15 años o más',
    denominador: 'Población de 15 años o más',
    definicion: 'Porcentaje de población de 15 años o más con educación primaria incompleta.',
    publicadoPorSeccion: true,
    etiquetaNoDifundido: 'Dato no difundido',
    populationBase: '15+',
  },
  {
    id: 'edu_primer_ciclo_eso_pct',
    etiqueta: 'Primera etapa de secundaria (%)',
    tema: 'educacion',
    domain: 'educacion',
    operation: '1254736176992',
    operationLabel: 'Censo anual de población',
    sourceTable: 'educacion_nivel_estudios',
    sourceLabel: 'Primera etapa de secundaria',
    tableFamily: 'censo_educacion',
    url: 'https://www.ine.es/dynt3/inebase/es/index.htm?padre=10608',
    unidad: '%',
    universo: 'Población de 15 años o más',
    denominador: 'Población de 15 años o más',
    definicion: 'Porcentaje de población de 15 años o más con primera etapa de educación secundaria.',
    publicadoPorSeccion: true,
    etiquetaNoDifundido: 'Dato no difundido',
    populationBase: '15+',
  },
  {
    id: 'edu_segundo_ciclo_eso_pct',
    etiqueta: 'Segunda etapa de secundaria (%)',
    tema: 'educacion',
    domain: 'educacion',
    operation: '1254736176992',
    operationLabel: 'Censo anual de población',
    sourceTable: 'educacion_nivel_estudios',
    sourceLabel: 'Segunda etapa de secundaria',
    tableFamily: 'censo_educacion',
    url: 'https://www.ine.es/dynt3/inebase/es/index.htm?padre=10608',
    unidad: '%',
    universo: 'Población de 15 años o más',
    denominador: 'Población de 15 años o más',
    definicion: 'Porcentaje de población de 15 años o más con segunda etapa de educación secundaria o equivalente.',
    publicadoPorSeccion: true,
    etiquetaNoDifundido: 'Dato no difundido',
    populationBase: '15+',
  },
  {
    id: 'edu_fp_grado_medio_pct',
    etiqueta: 'Formación profesional grado medio (%)',
    tema: 'educacion',
    domain: 'educacion',
    operation: '1254736176992',
    operationLabel: 'Censo anual de población',
    sourceTable: 'educacion_nivel_estudios',
    sourceLabel: 'Formación profesional grado medio',
    tableFamily: 'censo_educacion',
    url: 'https://www.ine.es/dynt3/inebase/es/index.htm?padre=10608',
    unidad: '%',
    universo: 'Población de 15 años o más',
    denominador: 'Población de 15 años o más',
    definicion: 'Porcentaje de población de 15 años o más con formación profesional de grado medio.',
    publicadoPorSeccion: true,
    etiquetaNoDifundido: 'Dato no difundido',
    populationBase: '15+',
  },
  {
    id: 'edu_fp_grado_superior_pct',
    etiqueta: 'Formación profesional grado superior (%)',
    tema: 'educacion',
    domain: 'educacion',
    operation: '1254736176992',
    operationLabel: 'Censo anual de población',
    sourceTable: 'educacion_nivel_estudios',
    sourceLabel: 'Formación profesional grado superior',
    tableFamily: 'censo_educacion',
    url: 'https://www.ine.es/dynt3/inebase/es/index.htm?padre=10608',
    unidad: '%',
    universo: 'Población de 15 años o más',
    denominador: 'Población de 15 años o más',
    definicion: 'Porcentaje de población de 15 años o más con formación profesional de grado superior.',
    publicadoPorSeccion: true,
    etiquetaNoDifundido: 'Dato no difundido',
    populationBase: '15+',
  },
  {
    id: 'edu_universitaria_pct',
    etiqueta: 'Educación superior y universitaria (%)',
    tema: 'educacion',
    domain: 'educacion',
    operation: '1254736176992',
    operationLabel: 'Censo anual de población',
    sourceTable: 'educacion_nivel_estudios',
    sourceLabel: 'Educación superior',
    tableFamily: 'censo_educacion',
    url: 'https://www.ine.es/dynt3/inebase/es/index.htm?padre=10608',
    unidad: '%',
    universo: 'Población de 15 años o más',
    denominador: 'Población de 15 años o más',
    definicion: 'Porcentaje de población de 15 años o más con educación superior (diplomatura, licenciatura, máster o equivalente).',
    publicadoPorSeccion: true,
    etiquetaNoDifundido: 'Dato no difundido',
    populationBase: '15+',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Objetos por municipio
// ─────────────────────────────────────────────────────────────────────────────

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
