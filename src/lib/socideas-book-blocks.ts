// Bloques del libro municipal SOCideas v2 (`socideas-book@2`) — SOLO SERVIDOR.
//
// QUÉ HACE
//   Construye las 11 hojas del contrato v2 a partir de los datos ya cargados
//   (perfil demográfico, perfil económico, capas INE laterales, resúmenes
//   laterales y, opcionalmente, payloads oficiales verificados que el pipeline
//   todavía no publica en R2). Ninguna consulta externa, ninguna escritura.
//
// REGLAS
//   - Ausencia ≠ 0: un valor no publicado es ND con estado estructurado.
//   - Unicidad: cada tabla declara sus indicadores y el orquestador rechaza
//     claves duplicadas (bug real del libro v1: saldos migratorios duplicados
//     y años de Gini/P80 repetidos en bloques distintos).
//   - Trazabilidad: toda tabla lleva fuente, período, ámbito, unidad y estado.
//   - Reconciliaciones: población H+M, válidos=votantes−nulos, sectores vs
//     total, categorías vs total, con tolerancias documentadas.
//   - Gráficos: máximos 2 por hoja, solo sobre datos publicables, siempre con
//     título, unidad, período y fuente.
//   - Nada de placeholders ambiguos: lo que no se publica se declara con
//     operación candidata, motivo y siguiente acción.

import type { ExportCell } from './socideas-export'
import type { IndicatorValue, PerfilDemografico, PerfilEconomico } from './socideas'
import { isPublishableValue } from './socideas-availability'
import type { IneValue, MunicipalIneLayersV1 } from './socideas-ine-layers'
import type { DemographicPresentationData } from './socideas-demographic-summary'
import type { MigrationPresentationData } from './socideas-migration-summary'
import { buildEconomiaTables } from './socideas-export'
import { buildDemographicDimensionTables } from './socideas-demographic-export'
import { buildMigrationFlowTables } from './socideas-migration-export'
import { densityYearsWarning } from './socideas-density'
import { computeStructureIndicators, type PopulationStructureAnnual } from './socideas-population-structure'
import {
  buildElectoralPresentation,
  ELECTIONS_CONVOCATORIA,
  ELECTIONS_URL_DATOS_ABIERTOS,
  type ElectoralPresentacion,
} from './socideas-elections'
import { AEAT_EDM_IRPF, INE_INSTITUTION, registrySource } from './socideas-source-registry'
import {
  ELECTORAL_SIGLAS_NORMALIZATION,
  normalizarSiglasElectoral,
  type AutonomicasCircunscripcionPayload,
  type SenadoCircunscripcionPayload,
} from './socideas-electoral-provincial'

export { ELECTORAL_SIGLAS_NORMALIZATION } from './socideas-electoral-provincial'
// v2.3: bloques de asociaciones, GAL y patrimonio enriquecido. Solo tipos
// (el ensamblado sigue siendo puro: sin red, sin Supabase, sin R2).
import type { AsociacionesMunicipio } from './socideas-asociaciones'
import type { GalMunicipio } from './socideas-gal'
import type { WikipediaEnrichment } from './wikipedia-enrichment'
import {
  type BookChartSpec,
  type BookCoverage,
  type BookFinding,
  type BookIndicator,
  type BookReconciliation,
  type BookSheetId,
  type BookSheetV2,
  type BookState,
  type BookTableV2,
  ND_TEXT,
  SOCIDEAS_BOOK_SCHEMA,
  buildFindings,
  computeBookCoverage,
  findDuplicateIndicatorKeys,
} from './socideas-book-contract'

// ============================================================================
// Payloads oficiales opcionales (verificados en QA local; aún no publicados en R2)
// ============================================================================

export interface ElectoralSerieCandidatura {
  candidatura: string
  siglas: string
  votos: number | null
  concejales: number | null
}

export interface ElectoralSerieConvocatoria {
  anio: number
  fecha: string
  censo: number | null
  votantes: number | null
  validos: number | null
  nulos: number | null
  blancos: number | null
  candidaturas: ElectoralSerieCandidatura[]
  totalConcejales: number | null
  estado?: 'completo' | 'parcial'
}

/** Serie municipal histórica (Infoelectoral, fichero abierto de municipios). */
export interface ElectoralSeriePayload {
  fuenteLabel: string
  observacion?: string
  convocatorias: ElectoralSerieConvocatoria[]
}

export interface CongresoProvinciaCandidatura {
  nombre: string
  siglas: string
  votos: number | null
  escanos: number | null
}

/** Congreso por circunscripción provincial (Infoelectoral, datos abiertos). */
export interface CongresoProvinciaPayload {
  anio: number
  fecha: string
  provincia: string
  censo: number | null
  votantes: number | null
  validos: number | null
  nulos: number | null
  blancos: number | null
  candidaturas: CongresoProvinciaCandidatura[]
  fuenteLabel: string
}

export interface LaborSeriePunto {
  periodo: string
  paroTotal: number | null
  paroAgricultura: number | null
  paroIndustria: number | null
  paroConstruccion: number | null
  paroServicios: number | null
  afiliacionTotal: number | null
  afiliacionAutonomos: number | null
}

export interface ViviendaPayload {
  periodo: string
  fuenteLabel: string
  tableId: string | null
  total: number | null
  principales: number | null
  noPrincipales: number | null
  vacias: number | null
  secundarias: number | null
  hogaresTotales: number | null
  hogaresUnipersonales: number | null
  superficieMediaM2: number | null
  antiguedadMedia: number | null
}

export interface ServicioMunicipalItem {
  servicio: string
  /** presente = en el municipio; cercano = fuera (con distancia); ausente = no existe. */
  estado: 'presente' | 'cercano' | 'ausente' | 'no_verificable'
  fuente: string
  fechaConsulta: string
  ambito: string
  distanciaKm: number | null
}

export interface ServiciosPayload {
  fuenteLabel: string
  items: ServicioMunicipalItem[]
}

export interface PatrimonioItem {
  nombre: string
  categoria: string
  proteccion: string
  identificador: string
  fuente: string
  fechaConsulta: string
}

export interface PatrimonioPayload {
  fuenteLabel: string
  items: PatrimonioItem[]
}

export interface CropPayload {
  periodo: string
  fuenteLabel: string
  cultivos: { nombre: string; superficieHa: number | null }[]
}

export interface SocideasBookInputV2 {
  municipio: string
  codigoINE: string
  provincia: string
  comunidadAutonoma: string
  fechaGeneracion: string
  perfilDemografia: PerfilDemografico | null
  perfilEconomia: PerfilEconomico | null
  ineLayers: MunicipalIneLayersV1 | null
  demoExtra: DemographicPresentationData | null
  migracion: MigrationPresentationData | null
  /** Estructura de población anual (INE 68535/68534, Fase 2 v2.1). */
  populationStructure?: PopulationStructureAnnual | null
  electoral?: ElectoralSeriePayload | null
  congresoProvincia?: CongresoProvinciaPayload | null
  /** Autonómicas por circunscripción provincial (Cortes de CLM 2023). */
  autonomicasCircunscripcion?: AutonomicasCircunscripcionPayload | null
  /** Senado por circunscripción: voto a candidatos (23-J-2023). */
  senadoCircunscripcion?: SenadoCircunscripcionPayload | null
  laborSerie?: LaborSeriePunto[] | null
  vivienda?: ViviendaPayload | null
  servicios?: ServiciosPayload | null
  patrimonio?: PatrimonioPayload | null
  cultivos?: CropPayload | null
  /** Directorio asociativo del municipio (registros autonómicos, v2.3). */
  asociaciones?: AsociacionesMunicipio | null
  /** Grupo de Acción Local (LEADER/FEADER) que cubre el municipio (v2.3). */
  gal?: GalMunicipio | null
  /** Enriquecimiento Wikipedia/Wikidata (resumen, bienes patrimoniales) (v2.3). */
  wikipedia?: WikipediaEnrichment | null
}

// ============================================================================
// Utilidades de celda
// ============================================================================

function label(text: string): ExportCell {
  return { text, numeric: null }
}

function num(value: number | null | undefined, dec = 0): ExportCell {
  if (value === null || value === undefined || !Number.isFinite(value)) return { text: ND_TEXT, numeric: null }
  return {
    text: value.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec }),
    numeric: value,
  }
}

function pct(value: number | null | undefined, dec = 1): ExportCell {
  if (value === null || value === undefined || !Number.isFinite(value)) return { text: ND_TEXT, numeric: null }
  return { text: `${num(value, dec).text} %`, numeric: value }
}

/** Celda con fórmula Excel y resultado cacheado (paridad verificada en QA). */
function formulaCell(formula: string, result: number | null, text: string): ExportCell {
  if (result === null || !Number.isFinite(result)) return { text, numeric: null }
  return { text, numeric: result, formula }
}

/** Porcentaje con fórmula Excel: `formula` debe producir el mismo valor que
 *  `pctRatio(numer, denom)` (el writer cachea el resultado y QA comprueba la
 *  paridad fórmula↔cálculo). */
function pctFromFormula(formula: string, numer: number | null, denom: number | null): ExportCell {
  const v = pctRatio(numer, denom)
  if (v === null) return { text: ND_TEXT, numeric: null }
  return { text: `${num(v, 1).text} %`, numeric: v, formula }
}

function pctRatio(numer: number | null, denom: number | null): number | null {
  if (numer === null || denom === null || denom <= 0) return null
  return Math.round((numer / denom) * 1000) / 10
}

function slugOf(v: IndicatorValue): string {
  return (v.indicator as unknown as { slug?: string } | undefined)?.slug ?? ''
}

type AvailabilityV1 = 'available' | 'not_available' | 'pending_integration'

function availabilityV1(state: BookState): { availability: AvailabilityV1; estadoTexto: string } {
  switch (state) {
    case 'available':
      return { availability: 'available', estadoTexto: 'Disponible' }
    case 'partial':
      return { availability: 'available', estadoTexto: 'Cobertura parcial documentada' }
    case 'not_applicable':
      return { availability: 'not_available', estadoTexto: 'No aplicable a este municipio' }
    case 'statistical_secrecy':
      return { availability: 'not_available', estadoTexto: 'Secreto estadístico (ND, nunca 0)' }
    case 'blocked_source':
      return { availability: 'not_available', estadoTexto: 'Fuente bloqueada: sin descarga estructurada verificada' }
    case 'pending_integration':
      return { availability: 'pending_integration', estadoTexto: 'Pendiente de integración con operación candidata' }
    case 'temporary_error':
      return { availability: 'not_available', estadoTexto: 'Error temporal de obtención' }
    case 'missing_by_design':
      return { availability: 'not_available', estadoTexto: 'Sin dato por diseño de la fuente' }
  }
}

// ============================================================================
// Biblioteca de metadatos de indicadores
// ============================================================================

const LIC_INE = 'Reutilización permitida citando la fuente (INE)'
const LIC_MIR = 'Datos abiertos de Infoelectoral (Ministerio del Interior)'
const LIC_JCCM = 'Datos abiertos de la Junta de Comunidades de Castilla-La Mancha (CC BY-SA)'
const LIC_AEAT = 'Datos abiertos AEAT (reutilización citando la fuente)'
const LIC_PEND = 'Licencia pendiente de verificación en la fuente candidata'

interface IndicatorMeta {
  nombre: string
  descripcion: string
  unidad: string
  tipo_valor: BookIndicator['tipo_valor']
  source_slug: string
  organismo: string
  operacion: string
  license: string
  capability: BookIndicator['capability']
  comparabilidad: string
  area: BookIndicator['area']
  es_derivado?: boolean
  formula?: string | null
  metodo?: string | null
}

/** Diccionario de indicadores del libro. La clave ES el slug canónico. */
export const INDICATOR_LIBRARY: Readonly<Record<string, IndicatorMeta>> = {
  population_total: {
    nombre: 'Población total', descripcion: 'Cifras oficiales de población (Padrón municipal).',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'ine_dpop', organismo: INE_INSTITUTION,
    operacion: 'Cifras oficiales de población (Padrón municipal)', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Comparable entre municipios, provincias, CCAA y España con el mismo año.',
    area: 'demografia',
  },
  population_male: {
    nombre: 'Población masculina', descripcion: 'Hombres empadronados.',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'ine_dpop', organismo: INE_INSTITUTION,
    operacion: 'Cifras oficiales de población (Padrón municipal)', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Mismo año y definición de padrón.', area: 'demografia',
  },
  population_female: {
    nombre: 'Población femenina', descripcion: 'Mujeres empadronadas.',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'ine_dpop', organismo: INE_INSTITUTION,
    operacion: 'Cifras oficiales de población (Padrón municipal)', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Mismo año y definición de padrón.', area: 'demografia',
  },
  population_density: {
    nombre: 'Densidad de población', descripcion: 'Población por km² sobre superficie IGN (NGMEP).',
    unidad: 'hab./km²', tipo_valor: 'decimal', source_slug: 'ign_ngmep', organismo: 'Instituto Geográfico Nacional',
    operacion: 'Nomenclátor Geográfico de Municipios y Entidades de Población (superficie) + Padrón (población)',
    license: LIC_INE, capability: 'nacional', comparabilidad: 'Sensible al año de superficie; se documenta.',
    area: 'demografia', es_derivado: true, formula: 'densidad = población / superficie_km2',
    metodo: 'Cálculo SOCideas sobre datos oficiales, años indicados en la nota.',
  },
  population_evolution: {
    nombre: 'Evolución de la población', descripcion: 'Serie anual del Padrón.',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'ine_dpop', organismo: INE_INSTITUTION,
    operacion: 'Cifras oficiales de población (Padrón municipal)', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Mismo año entre ámbitos; nunca se interpolan años.', area: 'demografia',
  },
  population_age_sex: {
    nombre: 'Estructura por edad y sexo', descripcion: 'Distribución quinquenal del Padrón.',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'ine_piramide', organismo: INE_INSTITUTION,
    operacion: 'Padrón Continuo (estructura por edad y sexo)', license: LIC_INE, capability: 'municipal',
    comparabilidad: 'Solo municipal en este libro.', area: 'demografia',
  },
  estructura_edad: {
    nombre: 'Estructura de población por edad y sexo', descripcion: 'Población municipal por grupos quinquenales y sexo (Censo Anual).',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'ine_censo_anual', organismo: INE_INSTITUTION,
    operacion: 'Censo Anual de Población · tabla 68535', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Mismo período censal anual; grupos quinquenales normalizados 0-4 … 100+.', area: 'demografia',
  },
  estructura_edad_detalle: {
    nombre: 'Estructura por edad simple', descripcion: 'Población municipal por año de edad (solo municipios insulares).',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'ine_censo_anual', organismo: INE_INSTITUTION,
    operacion: 'Censo Anual de Población · tabla 68534 (municipios insulares)', license: LIC_INE, capability: 'municipal',
    comparabilidad: 'Edad simple 0–100+; solo insular, verificado contra 68535.', area: 'demografia',
  },
  estructura_menores15: {
    nombre: 'Población menor de 15 años', descripcion: 'Suma de los grupos 0-4, 5-9 y 10-14.',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'ine_censo_anual', organismo: INE_INSTITUTION,
    operacion: 'Censo Anual de Población · tabla 68535', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Exacto con grupos quinquenales; no requiere edades simples.', area: 'demografia',
    es_derivado: true, formula: '0-4 + 5-9 + 10-14',
  },
  estructura_15_64: {
    nombre: 'Población de 15 a 64 años', descripcion: 'Suma de los grupos 15-19 a 60-64.',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'ine_censo_anual', organismo: INE_INSTITUTION,
    operacion: 'Censo Anual de Población · tabla 68535', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Exacto con grupos quinquenales.', area: 'demografia',
    es_derivado: true, formula: 'Σ grupos 15-19 … 60-64',
  },
  estructura_mayores65: {
    nombre: 'Población de 65 y más años', descripcion: 'Suma de los grupos 65-69 a 100+.',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'ine_censo_anual', organismo: INE_INSTITUTION,
    operacion: 'Censo Anual de Población · tabla 68535', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Exacto con grupos quinquenales.', area: 'demografia',
    es_derivado: true, formula: 'Σ grupos 65-69 … 100+',
  },
  estructura_mayores80: {
    nombre: 'Población de 80 y más años', descripcion: 'Suma de los grupos 80-84 a 100+.',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'ine_censo_anual', organismo: INE_INSTITUTION,
    operacion: 'Censo Anual de Población · tabla 68535', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Exacto con grupos quinquenales.', area: 'demografia',
    es_derivado: true, formula: 'Σ grupos 80-84 … 100+',
  },
  estructura_menores16: {
    nombre: 'Población menor de 16 años', descripcion: 'Solo calculable con edades simples (municipios insulares).',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'ine_censo_anual', organismo: INE_INSTITUTION,
    operacion: 'Censo Anual de Población · tabla 68534 (insular)', license: LIC_INE, capability: 'municipal',
    comparabilidad: 'Requiere edad simple; no se estima a partir de grupos quinquenales.', area: 'demografia',
    es_derivado: true, formula: 'Σ edades 0…15',
  },
  estructura_16_64: {
    nombre: 'Población de 16 a 64 años', descripcion: 'Solo calculable con edades simples (municipios insulares).',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'ine_censo_anual', organismo: INE_INSTITUTION,
    operacion: 'Censo Anual de Población · tabla 68534 (insular)', license: LIC_INE, capability: 'municipal',
    comparabilidad: 'Requiere edad simple; no se estima a partir de grupos quinquenales.', area: 'demografia',
    es_derivado: true, formula: 'Σ edades 16…64',
  },
  indice_sobreenvejecimiento: {
    nombre: 'Índice de sobreenvejecimiento', descripcion: 'Población de 80+ por cada 100 de 65+.',
    unidad: 'ratio', tipo_valor: 'decimal', source_slug: 'ine_censo_anual', organismo: INE_INSTITUTION,
    operacion: 'Censo Anual de Población · tabla 68535 + cálculo SOCideas', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Mismo período y estructura normalizada.', area: 'demografia',
    es_derivado: true, formula: 'pob_80_mas / pob_65_mas × 100',
  },
  dependencia_juvenil: {
    nombre: 'Dependencia juvenil', descripcion: 'Población 0-14 sobre población 15-64.',
    unidad: 'ratio', tipo_valor: 'decimal', source_slug: 'ine_censo_anual', organismo: INE_INSTITUTION,
    operacion: 'Censo Anual de Población · tabla 68535 + cálculo SOCideas', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Definición INE estándar; grupos quinquenales exactos.', area: 'demografia',
    es_derivado: true, formula: 'pob_0_14 / pob_15_64 × 100',
  },
  dependencia_mayores: {
    nombre: 'Dependencia de mayores', descripcion: 'Población 65+ sobre población 15-64.',
    unidad: 'ratio', tipo_valor: 'decimal', source_slug: 'ine_censo_anual', organismo: INE_INSTITUTION,
    operacion: 'Censo Anual de Población · tabla 68535 + cálculo SOCideas', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Definición INE estándar.', area: 'demografia',
    es_derivado: true, formula: 'pob_65_mas / pob_15_64 × 100',
  },
  relacion_masculinidad: {
    nombre: 'Relación de masculinidad', descripcion: 'Hombres por cada 100 mujeres.',
    unidad: 'ratio', tipo_valor: 'decimal', source_slug: 'ine_censo_anual', organismo: INE_INSTITUTION,
    operacion: 'Censo Anual de Población · tabla 68535 + cálculo SOCideas', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Mismo período y fuente.', area: 'demografia',
    es_derivado: true, formula: 'hombres / mujeres × 100',
  },
  edad_media: {
    nombre: 'Edad media', descripcion: 'Media de la estructura por edades (punto medio de grupo; 100+ = 100,5).',
    unidad: 'años', tipo_valor: 'decimal', source_slug: 'ine_censo_anual', organismo: INE_INSTITUTION,
    operacion: 'Censo Anual de Población · tabla 68535 + cálculo SOCideas', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Método del punto medio documentado; no es la edad media oficial del INE.', area: 'demografia',
    es_derivado: true, formula: 'Σ (punto medio del grupo × población) / población total',
    metodo: 'Punto medio de cada grupo quinquenal; el grupo 100+ se valora en 100,5 años (documentado en metodología).',
  },
  population_change_5y: {
    nombre: 'Variación de población a 5 años', descripcion: 'Cambio relativo en 5 años.',
    unidad: '%', tipo_valor: 'porcentaje', source_slug: 'ine_dpop', organismo: INE_INSTITUTION,
    operacion: 'Padrón municipal + cálculo SOCideas', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Mismo horizonte temporal.', area: 'demografia', es_derivado: true,
    formula: '(pob_t / pob_t-5 − 1) × 100',
  },
  population_change_10y: {
    nombre: 'Variación de población a 10 años', descripcion: 'Cambio relativo en 10 años.',
    unidad: '%', tipo_valor: 'porcentaje', source_slug: 'ine_dpop', organismo: INE_INSTITUTION,
    operacion: 'Padrón municipal + cálculo SOCideas', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Mismo horizonte temporal.', area: 'demografia', es_derivado: true,
    formula: '(pob_t / pob_t-10 − 1) × 100',
  },
  indice_envejecimiento: {
    nombre: 'Índice de envejecimiento', descripcion: 'Población 65+ por cada 100 menores de 15.',
    unidad: 'ratio', tipo_valor: 'decimal', source_slug: 'ine_dpop', organismo: INE_INSTITUTION,
    operacion: 'Padrón municipal + cálculo SOCideas', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Mismo año y estructura de edad.', area: 'demografia', es_derivado: true,
    formula: 'pob_65_mas / pob_0_14 × 100',
  },
  indice_dependencia: {
    nombre: 'Índice de dependencia', descripcion: 'Población dependiente sobre población en edad de trabajar.',
    unidad: 'ratio', tipo_valor: 'decimal', source_slug: 'ine_dpop', organismo: INE_INSTITUTION,
    operacion: 'Padrón municipal + cálculo SOCideas', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Mismo año y estructura de edad.', area: 'demografia', es_derivado: true,
    formula: '(pob_0_14 + pob_65_mas) / pob_15_64 × 100',
  },
  nationality_spanish: {
    nombre: 'Población española', descripcion: 'Nacionalidad española (Censo anual).',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'ine_censo_anual', organismo: INE_INSTITUTION,
    operacion: 'Censo anual de población · tabla 68535', license: LIC_INE, capability: 'municipal',
    comparabilidad: 'Mismo período censal.', area: 'demografia',
  },
  nationality_foreign: {
    nombre: 'Población extranjera', descripcion: 'Nacionalidad extranjera (Censo anual).',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'ine_censo_anual', organismo: INE_INSTITUTION,
    operacion: 'Censo anual de población · tabla 68535', license: LIC_INE, capability: 'municipal',
    comparabilidad: 'Mismo período censal.', area: 'demografia',
  },
  birth_country: {
    nombre: 'Lugar de nacimiento', descripcion: 'Población según país de nacimiento (top publicado).',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'ine_censo_anual', organismo: INE_INSTITUTION,
    operacion: 'Censo anual de población · tabla 66322', license: LIC_INE, capability: 'municipal',
    comparabilidad: 'Solo municipal; las categorías publicadas no forman una distribución completa.',
    area: 'demografia',
  },
  arraigo: {
    nombre: 'Arraigo territorial', descripcion: 'Relación entre lugar de nacimiento y de residencia.',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'ine_censo_anual', organismo: INE_INSTITUTION,
    operacion: 'Censo anual de población · tabla 68540', license: LIC_INE, capability: 'municipal',
    comparabilidad: 'Mismo período censal.', area: 'demografia',
  },
  emigration_abroad: {
    nombre: 'Emigración al extranjero', descripcion: 'Salidas anuales al extranjero.',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'ine_emcr', organismo: INE_INSTITUTION,
    operacion: 'Estadística de Migraciones y Cambios de Residencia · tabla 69711', license: LIC_INE,
    capability: 'nacional', comparabilidad: 'Flujo anual; no se suma con saldos.', area: 'demografia',
  },
  immigration_intermunicipal: {
    nombre: 'Inmigración intermunicipal', descripcion: 'Entradas anuales desde otros municipios.',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'ine_emcr', organismo: INE_INSTITUTION,
    operacion: 'Estadística de Migraciones y Cambios de Residencia · tabla 69743', license: LIC_INE,
    capability: 'nacional', comparabilidad: 'Flujo anual; no se suma con saldos.', area: 'demografia',
  },
  emigration_intermunicipal: {
    nombre: 'Emigración intermunicipal', descripcion: 'Salidas anuales a otros municipios.',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'ine_emcr', organismo: INE_INSTITUTION,
    operacion: 'Estadística de Migraciones y Cambios de Residencia · tabla 69746', license: LIC_INE,
    capability: 'nacional', comparabilidad: 'Flujo anual; no se suma con saldos.', area: 'demografia',
  },
  saldo_migratorio: {
    nombre: 'Saldo migratorio neto', descripcion: 'Diferencia neta entradas − salidas (interior y exterior).',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'ine_emcr', organismo: INE_INSTITUTION,
    operacion: 'Estadística de Migraciones y Cambios de Residencia · tabla 69767', license: LIC_INE,
    capability: 'nacional', comparabilidad: 'Producto distinto de los flujos primarios; nunca se suman.',
    area: 'demografia',
  },
  elec_censo: {
    nombre: 'Censo electoral', descripcion: 'Electores residentes (CER) en la convocatoria.',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'mir_infoelectoral', organismo: 'Ministerio del Interior',
    operacion: 'Infoelectoral · resultados municipales', license: LIC_MIR, capability: 'municipal',
    comparabilidad: 'Solo entre convocatorias del mismo tipo de elección.', area: 'politica',
  },
  elec_votantes: {
    nombre: 'Votantes', descripcion: 'Votantes en la convocatoria.',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'mir_infoelectoral', organismo: 'Ministerio del Interior',
    operacion: 'Infoelectoral · resultados municipales', license: LIC_MIR, capability: 'municipal',
    comparabilidad: 'Solo entre convocatorias del mismo tipo.', area: 'politica',
  },
  elec_participacion: {
    nombre: 'Participación electoral', descripcion: 'Votantes sobre censo.',
    unidad: '%', tipo_valor: 'porcentaje', source_slug: 'mir_infoelectoral', organismo: 'Ministerio del Interior',
    operacion: 'Infoelectoral · resultados municipales', license: LIC_MIR, capability: 'municipal',
    comparabilidad: 'Solo entre convocatorias del mismo tipo.', area: 'politica', es_derivado: true,
    formula: 'participacion = votantes / censo × 100',
  },
  elec_abstencion: {
    nombre: 'Abstención', descripcion: 'Censo menos votantes.',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'mir_infoelectoral', organismo: 'Ministerio del Interior',
    operacion: 'Infoelectoral · resultados municipales', license: LIC_MIR, capability: 'municipal',
    comparabilidad: 'Solo entre convocatorias del mismo tipo.', area: 'politica', es_derivado: true,
    formula: 'abstencion = censo − votantes',
  },
  elec_votos_validos: {
    nombre: 'Votos válidos', descripcion: 'Votos válidos de la convocatoria.',
    unidad: 'votos', tipo_valor: 'entero', source_slug: 'mir_infoelectoral', organismo: 'Ministerio del Interior',
    operacion: 'Infoelectoral · resultados municipales', license: LIC_MIR, capability: 'municipal',
    comparabilidad: 'Solo entre convocatorias del mismo tipo.', area: 'politica',
  },
  elec_votos_nulos: {
    nombre: 'Votos nulos', descripcion: 'Votos nulos de la convocatoria.',
    unidad: 'votos', tipo_valor: 'entero', source_slug: 'mir_infoelectoral', organismo: 'Ministerio del Interior',
    operacion: 'Infoelectoral · resultados municipales', license: LIC_MIR, capability: 'municipal',
    comparabilidad: 'Solo entre convocatorias del mismo tipo.', area: 'politica',
  },
  elec_votos_blanco: {
    nombre: 'Votos en blanco', descripcion: 'Votos en blanco de la convocatoria.',
    unidad: 'votos', tipo_valor: 'entero', source_slug: 'mir_infoelectoral', organismo: 'Ministerio del Interior',
    operacion: 'Infoelectoral · resultados municipales', license: LIC_MIR, capability: 'municipal',
    comparabilidad: 'Solo entre convocatorias del mismo tipo.', area: 'politica',
  },
  elec_candidaturas: {
    nombre: 'Votos por candidatura', descripcion: 'Reparto de votos entre candidaturas.',
    unidad: 'votos', tipo_valor: 'entero', source_slug: 'mir_infoelectoral', organismo: 'Ministerio del Interior',
    operacion: 'Infoelectoral · resultados municipales', license: LIC_MIR, capability: 'municipal',
    comparabilidad: 'Siglas homologadas solo vía tabla de normalización declarada.', area: 'politica',
  },
  elec_concejales: {
    nombre: 'Concejales por candidatura', descripcion: 'Concejales electos por candidatura.',
    unidad: 'concejales', tipo_valor: 'entero', source_slug: 'mir_infoelectoral', organismo: 'Ministerio del Interior',
    operacion: 'Infoelectoral · resultados municipales', license: LIC_MIR, capability: 'municipal',
    comparabilidad: 'Depende del número de concejales a elegir en el municipio.', area: 'politica',
  },
  elec_serie_municipal: {
    nombre: 'Serie municipal de participación', descripcion: 'Convocatorias municipales históricas.',
    unidad: 'varios', tipo_valor: 'entero', source_slug: 'mir_infoelectoral', organismo: 'Ministerio del Interior',
    operacion: 'Infoelectoral · fichero abierto de municipios (varias convocatorias)', license: LIC_MIR,
    capability: 'municipal', comparabilidad: 'Mismo tipo de elección; el censo cambia entre convocatorias.',
    area: 'politica',
  },
  elec_autonomicas: {
    nombre: 'Elecciones autonómicas', descripcion: 'Resultados de la circunscripción provincial/autonómica.',
    unidad: 'votos', tipo_valor: 'entero', source_slug: 'jccm_electoral', organismo: 'Junta de Comunidades de Castilla-La Mancha',
    operacion: 'Datos Abiertos CLM · Resultados a las Cortes + acuerdo de la Junta Electoral de CLM (DOCM)', license: LIC_JCCM, capability: 'autonomica',
    comparabilidad: 'La circunscripción es provincial o autonómica; nunca se atribuyen escaños al municipio.',
    area: 'politica',
  },
  elec_congreso: {
    nombre: 'Elecciones generales · Congreso', descripcion: 'Resultados de Congreso por circunscripción provincial.',
    unidad: 'votos', tipo_valor: 'entero', source_slug: 'mir_infoelectoral', organismo: 'Ministerio del Interior',
    operacion: 'Infoelectoral · datos abiertos generales (Congreso)', license: LIC_MIR, capability: 'provincial',
    comparabilidad: 'Circunscripción provincial; cámara separada del Senado.', area: 'politica',
  },
  elec_senado: {
    nombre: 'Elecciones generales · Senado', descripcion: 'Voto a candidatos al Senado por circunscripción.',
    unidad: 'votos', tipo_valor: 'entero', source_slug: 'mir_infoelectoral', organismo: 'Ministerio del Interior',
    operacion: 'Infoelectoral · datos abiertos generales (Senado)', license: LIC_MIR, capability: 'provincial',
    comparabilidad: 'Voto a candidatos: no se fuerza al esquema de candidaturas del Congreso.',
    area: 'politica',
  },
  irpf_declaraciones: {
    nombre: 'Declaraciones de IRPF', descripcion: 'Número de declaraciones presentadas (AEAT EDM).',
    unidad: 'declaraciones', tipo_valor: 'entero', source_slug: 'aeat_edm', organismo: 'Agencia Estatal de Administración Tributaria',
    operacion: 'Estadística de los declarantes del IRPF por municipios (EDM)', license: LIC_AEAT,
    capability: 'nacional_sin_forales', comparabilidad: 'Por declaración; no equivale a renta por persona/hogar.',
    area: 'economia',
  },
  renta_neta_media_persona: {
    nombre: 'Renta neta media por persona', descripcion: 'Renta neta media por persona (ADRH).',
    unidad: '€', tipo_valor: 'moneda', source_slug: 'ine_adrh', organismo: INE_INSTITUTION,
    operacion: 'Atlas de Distribución de Renta de los Hogares (ADRH)', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Serie ADRH; nunca se mezcla con AEAT.', area: 'economia',
  },
  renta_neta_media_hogar: {
    nombre: 'Renta neta media por hogar', descripcion: 'Renta neta media por hogar (ADRH).',
    unidad: '€', tipo_valor: 'moneda', source_slug: 'ine_adrh', organismo: INE_INSTITUTION,
    operacion: 'Atlas de Distribución de Renta de los Hogares (ADRH)', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Serie ADRH; nunca se mezcla con AEAT.', area: 'economia',
  },
  renta_bruta_media_hogar: {
    nombre: 'Renta bruta media por hogar', descripcion: 'Renta bruta media por hogar (ADRH).',
    unidad: '€', tipo_valor: 'moneda', source_slug: 'ine_adrh', organismo: INE_INSTITUTION,
    operacion: 'Atlas de Distribución de Renta de los Hogares (ADRH)', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Serie ADRH; nunca se mezcla con AEAT.', area: 'economia',
  },
  renta_bruta_media_persona: {
    nombre: 'Renta bruta media por persona', descripcion: 'Renta bruta media por persona (ADRH).',
    unidad: '€', tipo_valor: 'moneda', source_slug: 'ine_adrh', organismo: INE_INSTITUTION,
    operacion: 'Atlas de Distribución de Renta de los Hogares (ADRH)', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Serie ADRH; nunca se mezcla con AEAT.', area: 'economia',
  },
  gini: {
    nombre: 'Índice de Gini', descripcion: 'Desigualdad de renta (0–100).',
    unidad: 'Índice', tipo_valor: 'decimal', source_slug: 'ine_adrh', organismo: INE_INSTITUTION,
    operacion: 'ADRH · indicadores de desigualdad', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Solo municipios ≥100 residentes; comparativa territorial ADRH si el ámbito coincide.',
    area: 'economia',
  },
  p80_p20: {
    nombre: 'Ratio P80/P20', descripcion: 'Cociente entre el percentil 80 y el 20 de la renta.',
    unidad: 'ratio', tipo_valor: 'decimal', source_slug: 'ine_adrh', organismo: INE_INSTITUTION,
    operacion: 'ADRH · indicadores de desigualdad', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Solo municipios ≥100 residentes.', area: 'economia',
  },
  empresas_total: {
    nombre: 'Empresas con sede en el municipio', descripcion: 'Unidades locales con sede (DIRCE).',
    unidad: 'empresas', tipo_valor: 'entero', source_slug: 'ine_dirce', organismo: INE_INSTITUTION,
    operacion: 'Directorio Central de Empresas (DIRCE) · tabla 4721', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Empresas ≠ ocupados ≠ afiliación.', area: 'economia',
  },
  empresas_sector: {
    nombre: 'Empresas por sector', descripcion: 'Distribución sectorial de empresas (DIRCE).',
    unidad: 'empresas', tipo_valor: 'entero', source_slug: 'ine_dirce', organismo: INE_INSTITUTION,
    operacion: 'Directorio Central de Empresas (DIRCE) · tabla 4721', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Suma sectorial reconciliada contra el total con tolerancia declarada.', area: 'economia',
  },
  paro_registrado: {
    nombre: 'Paro registrado', descripcion: 'Demandantes de empleo registrados (SEPE), dato mensual.',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'sepe', organismo: 'Servicio Público de Empleo Estatal',
    operacion: 'Paro registrado por municipios, sexo, edad y sector', license: 'Datos abiertos SEPE',
    capability: 'nacional', comparabilidad: 'Coyuntura mensual; no comparable con series anuales.',
    area: 'economia',
  },
  afiliacion_total: {
    nombre: 'Afiliación a la Seguridad Social', descripcion: 'Afiliados en alta (TGSS), último día del mes.',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'tgss', organismo: 'Tesorería General de la Seguridad Social',
    operacion: 'Afiliación por municipios y régimen', license: 'Datos abiertos Seguridad Social',
    capability: 'nacional', comparabilidad: 'Coyuntura mensual; regímenes no intercambiables con afiliación total.',
    area: 'economia',
  },
  labor_serie: {
    nombre: 'Serie mensual de empleo', descripcion: 'Serie de paro y afiliación por período.',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'sepe_tgss', organismo: 'SEPE y TGSS',
    operacion: 'Series mensuales municipales (SEPE y TGSS)', license: 'Datos abiertos SEPE y Seguridad Social',
    capability: 'nacional', comparabilidad: 'Solo entre meses del mismo indicador.', area: 'economia',
  },
  presupuesto_municipal: {
    nombre: 'Presupuesto y liquidación municipal', descripcion: 'Importes presupuestarios y de liquidación.',
    unidad: '€', tipo_valor: 'moneda', source_slug: 'conprel', organismo: 'Ministerio de Hacienda',
    operacion: 'CONPREL (presupuestos y liquidaciones de entidades locales)', license: LIC_PEND,
    capability: 'nacional', comparabilidad: 'Solo con avance/ejecución del mismo ejercicio y misma fase.',
    area: 'economia',
  },
  agr_sau_total: {
    nombre: 'Superficie agraria utilizada (SAU)', descripcion: 'SAU total de las explotaciones (Censo Agrario 2020).',
    unidad: 'ha', tipo_valor: 'decimal', source_slug: 'ine_censo_agrario', organismo: INE_INSTITUTION,
    operacion: 'Censo Agrario 2020 · tabla 52071', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Censo decenal estructural; nunca serie anual.', area: 'agrario',
  },
  agr_usos: {
    nombre: 'Usos del suelo agrario', descripcion: 'Tierra arable, leñosos, pastos y huertos.',
    unidad: 'ha', tipo_valor: 'decimal', source_slug: 'ine_censo_agrario', organismo: INE_INSTITUTION,
    operacion: 'Censo Agrario 2020 · tabla 52071', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Suma de usos reconciliada con la SAU con tolerancia declarada.', area: 'agrario',
  },
  agr_explotaciones: {
    nombre: 'Explotaciones agrarias', descripcion: 'Número de explotaciones con SAU (Censo Agrario 2020).',
    unidad: 'explotaciones', tipo_valor: 'entero', source_slug: 'ine_censo_agrario', organismo: INE_INSTITUTION,
    operacion: 'Censo Agrario 2020 · tabla 52071', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Umbral de la fuente: SAU ≥ 5 ha.', area: 'agrario',
  },
  ganaderia: {
    nombre: 'Ganadería', descripcion: 'Explotaciones y cabezas por especie (Censo Agrario 2020).',
    unidad: 'explotaciones / cabezas', tipo_valor: 'entero', source_slug: 'ine_censo_agrario', organismo: INE_INSTITUTION,
    operacion: 'Censo Agrario 2020 · tabla 52076', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Explotaciones y cabezas no se suman entre sí.', area: 'agrario',
  },
  agr_responsables: {
    nombre: 'Responsables de explotación', descripcion: 'Titulares por sexo y edad media (Censo Agrario 2020).',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'ine_censo_agrario', organismo: INE_INSTITUTION,
    operacion: 'Censo Agrario 2020 · tabla 52081', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Hombres + mujeres reconciliado con total. Edad media en años.', area: 'agrario',
  },
  agr_formacion: {
    nombre: 'Formación agraria del responsable', descripcion: 'Nivel formativo del jefe de explotación (Censo Agrario 2020).',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'ine_censo_agrario', organismo: INE_INSTITUTION,
    operacion: 'Censo Agrario 2020 · tabla 52082', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Suma de categorías reconciliada con responsables con tolerancia declarada.', area: 'agrario',
  },
  agr_cultivos: {
    nombre: 'Superficie por cultivo', descripcion: 'Detalle de cultivos concretos (Censo Agrario 2020).',
    unidad: 'ha', tipo_valor: 'decimal', source_slug: 'ine_censo_agrario', organismo: INE_INSTITUTION,
    operacion: 'Censo Agrario 2020 · tablas municipales de cultivos (no incorporada al pipeline)',
    license: LIC_PEND, capability: 'nacional',
    comparabilidad: 'Suma de cultivos acotada por la superficie de tierras labradas.', area: 'agrario',
  },
  nivel_educativo: {
    nombre: 'Nivel educativo', descripcion: 'Población por nivel de estudios (Censo 2021).',
    unidad: 'personas', tipo_valor: 'entero', source_slug: 'ine_censo_2021', organismo: INE_INSTITUTION,
    operacion: 'Censo de Población y Viviendas 2021 · tabla 55249', license: LIC_INE, capability: 'nacional',
    comparabilidad: 'Censo decenal; no serie anual. Desagregación por sexo incluida.', area: 'servicios',
  },
  centros_docentes: {
    nombre: 'Centros docentes', descripcion: 'Centros educativos no universitarios en el municipio.',
    unidad: 'centros', tipo_valor: 'entero', source_slug: 'redc', organismo: 'Ministerio de Educación',
    operacion: 'Registro Estatal de Centros Docentes (búsqueda oficial; sin descarga masiva configurada)',
    license: LIC_PEND, capability: 'nacional',
    comparabilidad: 'Titularidad y enseñanzas según registro oficial.', area: 'servicios',
  },
  servicios_municipales: {
    nombre: 'Servicios municipales', descripcion: 'Dotación de servicios con evidencia y distancia.',
    unidad: 'cualitativo', tipo_valor: 'texto', source_slug: 'multifuente', organismo: 'Administraciones locales y autonómicas',
    operacion: 'Catálogos oficiales de servicios y equipamientos', license: LIC_PEND, capability: 'municipal',
    comparabilidad: 'Presente / cercano (con distancia) / ausente / no verificable.', area: 'servicios',
  },
  sanidad: {
    nombre: 'Recursos sanitarios', descripcion: 'Centros, servicios y establecimientos sanitarios (REGCESS).',
    unidad: 'centros', tipo_valor: 'entero', source_slug: 'regcess', organismo: 'Ministerio de Sanidad',
    operacion: 'Registro General de Centros, Servicios y Establecimientos Sanitarios (consulta oficial)',
    license: LIC_PEND, capability: 'nacional',
    comparabilidad: 'Titularidad y tipo de centro según registro.', area: 'servicios',
  },
  vivienda_censo: {
    nombre: 'Vivienda y hogares', descripcion: 'Uso, tamaño, tenencia y superficies (Censo 2021).',
    unidad: 'viviendas / hogares', tipo_valor: 'entero', source_slug: 'ine_censo_2021', organismo: INE_INSTITUTION,
    operacion: 'Censo de Población y Viviendas 2021 · tablas municipales de vivienda', license: LIC_INE,
    capability: 'nacional', comparabilidad: 'Censo decenal; vivienda ≠ hogar ≠ inmueble catastral.',
    area: 'vivienda',
  },
  vivienda_catastro: {
    nombre: 'Catastro inmobiliario', descripcion: 'Inmuebles, antigüedad y reformas (estadísticas catastrales).',
    unidad: 'inmuebles', tipo_valor: 'entero', source_slug: 'catastro', organismo: 'Dirección General del Catastro',
    operacion: 'Estadísticas catastrales municipales anuales', license: LIC_PEND, capability: 'nacional',
    comparabilidad: 'Inmueble catastral ≠ vivienda convencional ≠ hogar.', area: 'vivienda',
  },
  patrimonio_bienes: {
    nombre: 'Patrimonio cultural', descripcion: 'Bienes protegidos e inventariados.',
    unidad: 'bienes', tipo_valor: 'entero', source_slug: 'patrimonio_cultural', organismo: 'Ministerio de Cultura y CCAA',
    operacion: 'Registros de bienes de interés cultural e inventarios autonómicos', license: LIC_PEND,
    capability: 'autonomica', comparabilidad: 'Categorías y protecciones dependen de la comunidad autónoma.',
    area: 'patrimonio',
  },
  turismo_alojamientos: {
    nombre: 'Alojamientos turísticos', descripcion: 'Establecimientos y plazas registradas.',
    unidad: 'establecimientos', tipo_valor: 'entero', source_slug: 'turismo', organismo: 'Registros autonómicos de turismo',
    operacion: 'Registros de establecimientos turísticos por CCAA', license: LIC_PEND, capability: 'autonomica',
    comparabilidad: 'Solo intra-CCAA; categorías no homologadas entre comunidades.', area: 'patrimonio',
  },
  infra_transporte: {
    nombre: 'Transporte y accesibilidad', descripcion: 'Carreteras, ferrocarril y distancia a servicios supramunicipales.',
    unidad: 'km / minutos', tipo_valor: 'decimal', source_slug: 'ign_osm', organismo: 'IGN / organismos de transporte',
    operacion: 'Redes oficiales de transporte y cálculo geoespacial SOCideas', license: LIC_PEND,
    capability: 'nacional', comparabilidad: 'Todo cálculo geoespacial documenta CRS, fecha y método.',
    area: 'infraestructura',
  },
  infra_agua_residuos: {
    nombre: 'Agua, saneamiento y residuos', descripcion: 'Cobertura de servicios de agua y gestión de residuos.',
    unidad: 'cualitativo', tipo_valor: 'texto', source_slug: 'administraciones', organismo: 'Confederaciones y administraciones locales',
    operacion: 'Registros y planes oficiales de servicios', license: LIC_PEND, capability: 'municipal',
    comparabilidad: 'Competencia y titularidad varían por territorio.', area: 'infraestructura',
  },
  asociaciones_registro: {
    nombre: 'Tejido asociativo', descripcion: 'Entidades inscritas en registros públicos.',
    unidad: 'entidades', tipo_valor: 'entero', source_slug: 'registros_asociaciones', organismo: 'Ministerio del Interior y CCAA',
    operacion: 'Registros públicos de asociaciones (nacional y autonómicos)', license: LIC_PEND,
    capability: 'nacional', comparabilidad: 'Solo entidades sin datos personales innecesarios.', area: 'asociaciones',
  },
  gobernanza_supramunicipal: {
    nombre: 'Gobernanza supramunicipal', descripcion: 'Mancomunidades y entidades locales supramunicipales.',
    unidad: 'entidades', tipo_valor: 'entero', source_slug: 'registros_entidades_locales', organismo: 'Ministerio de Hacienda y CCAA',
    operacion: 'Registro de Entidades Locales', license: LIC_PEND, capability: 'nacional',
    comparabilidad: 'Figura jurídica según registro oficial.', area: 'asociaciones',
  },
}

// ============================================================================
// Constructor de indicadores
// ============================================================================

interface IndicatorCtx {
  periodo: string
  ambito?: string
  granularidad?: string
  tableId?: string | null
  seriesId?: string | null
  availability: BookState
  fechaExtraccion?: string | null
  dimensiones?: string[]
  estadoValidacion?: BookIndicator['estado_validacion']
}

// ============================================================================
// Frescura (Fase 5): última edición oficial verificada por operación
// ============================================================================

interface FreshnessRule {
  /** Última edición oficial verificada (año o YYYY-MM). null = no verificada. */
  latest: string | null
  /** Cómo se comporta la operación respecto al calendario. */
  kind: 'anual' | 'mensual' | 'electoral' | 'estructural'
  /** Motivo contractual visible en metodología. */
  reason: string
}

/**
 * Registro de frescura verificado en esta misión (2026-09-24):
 * - 68535/68534/68065 (Censo Anual): edición 2025 publicada (diciembre 2025).
 * - DPOP: cifras oficiales 2025 (última revisión del Padrón publicada).
 * - EMCR 69767/69711/69743/69746: edición 2024 (última estadística publicada).
 * - SEPE/TGSS: último mes cargado y verificado en la capa (2026-07).
 * - Operaciones estructurales (Censo 2021, Censo Agrario 2020): última edición
 *   disponible por diseño; no se degradan por antigüedad.
 */
export const FRESHNESS_REGISTRY: Readonly<Record<string, FreshnessRule>> = {
  ine_censo_anual: { latest: '2025', kind: 'anual', reason: 'Censo Anual de Población: edición 2025 (última publicada).' },
  ine_dpop: { latest: '2025', kind: 'anual', reason: 'Cifras oficiales de población: revisión del Padrón 2025.' },
  ine_piramide: { latest: '2025', kind: 'anual', reason: 'La estructura por edad 2025 se publica en la tabla 68535; la serie 33570 del Padrón Continuo queda como histórica.' },
  ine_emcr: { latest: '2024', kind: 'anual', reason: 'Estadística de Migraciones y Cambios de Residencia: edición 2024.' },
  ine_adrh: { latest: '2023', kind: 'anual', reason: 'ADRH: edición 2023 (última publicada).' },
  aeat_edm: { latest: '2023', kind: 'anual', reason: 'AEAT EDM: edición 2023 (última verificada).' },
  ine_dirce: { latest: '2025', kind: 'anual', reason: 'DIRCE: referencia 1 de enero de 2025.' },
  sepe: { latest: '2026-07', kind: 'mensual', reason: 'Último mes cargado y verificado en la capa (2026-07).' },
  tgss: { latest: '2026-07', kind: 'mensual', reason: 'Último mes cargado y verificado en la capa (2026-07).' },
  sepe_tgss: { latest: '2026-07', kind: 'mensual', reason: 'Series mensuales de empleo: último mes cargado (2026-07).' },
  mir_infoelectoral: { latest: '2023', kind: 'electoral', reason: 'Municipales 2023: última convocatoria celebrada.' },
  jccm_electoral: { latest: '2023', kind: 'electoral', reason: 'Cortes de Castilla-La Mancha 2023: última convocatoria celebrada (28-M-2023).' },
  ine_censo_2021: { latest: '2021', kind: 'estructural', reason: 'Censo de Población y Viviendas 2021: última operación estructural.' },
  ine_censo_agrario: { latest: '2020', kind: 'estructural', reason: 'Censo Agrario 2020: última operación estructural.' },
  ign_ngmep: { latest: '2025', kind: 'anual', reason: 'Nomenclátor geográfico: superficie vigente 2025.' },
  conprel: { latest: null, kind: 'anual', reason: 'CONPREL no publicado: fuera del alcance autorizado.' },
  redc: { latest: null, kind: 'anual', reason: 'Registro de centros docentes: sin edición estructurada cargada.' },
  regcess: { latest: null, kind: 'anual', reason: 'REGCESS: consulta oficial sin descarga masiva configurada.' },
  multifuente: { latest: null, kind: 'anual', reason: 'Servicios municipales: sin inventario oficial homogéneo cargado.' },
  patrimonio_cultural: { latest: null, kind: 'estructural', reason: 'Patrimonio: registros autonómicos sin agregado nacional verificable.' },
  turismo: { latest: null, kind: 'anual', reason: 'Turismo: registros autonómicos con categorías no homologadas.' },
  ign_osm: { latest: null, kind: 'anual', reason: 'Accesibilidad: requiere cálculo geoespacial documentado (pendiente).' },
  administraciones: { latest: null, kind: 'anual', reason: 'Agua/residuos: memorias no estructuradas.' },
  registros_asociaciones: { latest: null, kind: 'anual', reason: 'Registro asociativo: cobertura y licencia no homogéneas.' },
  registros_entidades_locales: { latest: null, kind: 'anual', reason: 'Entidades locales: fuente identificada sin carga al pipeline.' },
  catastro: { latest: null, kind: 'anual', reason: 'Catastro: estadísticas municipales sin integración verificada.' },
}

/** Año MÁS RECIENTE presente en un período (soporta rangos "2015–2023"). */
function latestYearIn(period: string | null | undefined): number | null {
  if (!period) return null
  const years = [...period.matchAll(/(\d{4})/g)]
    .map((m) => Number(m[1]))
    .filter((y) => y >= 1800 && y <= 2200)
  return years.length > 0 ? Math.max(...years) : null
}

const MESES_ES: Readonly<Record<string, string>> = {
  enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
  julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
}

/** Normaliza un período a año y, si es mensual, a YYYY-MM. */
function periodToComparable(period: string | null | undefined): { year: number | null; ym: string | null } {
  if (!period) return { year: null, ym: null }
  const ym = /(\d{4})-(\d{2})(?!\d)/.exec(period)
  if (ym) return { year: Number(ym[1]), ym: `${ym[1]}-${ym[2]}` }
  const norm = period.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const mes = Object.keys(MESES_ES).find((m) => norm.includes(m))
  const year = latestYearIn(period)
  if (mes && year !== null) return { year, ym: `${year}-${MESES_ES[mes]}` }
  return { year, ym: null }
}

/** Deriva la frescura de un indicador frente a la última edición oficial. */
function freshnessFor(
  sourceSlug: string,
  periodo: string,
  availability: BookState,
): Pick<
  BookIndicator,
  'source_period' | 'latest_available_period' | 'retrieved_at' | 'release_date' | 'freshness_status' | 'lag_years' | 'lag_months' | 'freshness_reason'
> {
  const rule = FRESHNESS_REGISTRY[sourceSlug]
  const latest = rule?.latest ?? null
  const base = {
    source_period: periodo,
    latest_available_period: latest,
    retrieved_at: null,
    release_date: null,
    lag_years: null,
    lag_months: null,
  }
  if (availability === 'pending_integration') {
    return { ...base, freshness_status: 'pendiente_integracion', freshness_reason: rule?.reason ?? 'Fuente oficial pendiente de integración.' }
  }
  if (availability === 'blocked_source' || availability === 'not_applicable' || availability === 'missing_by_design' || availability === 'statistical_secrecy') {
    return { ...base, freshness_status: 'no_disponible', freshness_reason: rule?.reason ?? 'Sin dato publicado para este municipio.' }
  }
  if (!rule || latest === null) {
    return { ...base, freshness_status: 'no_disponible', freshness_reason: rule?.reason ?? 'Sin última edición verificada.' }
  }
  const comparable = periodToComparable(periodo)
  if (comparable.year === null) {
    return {
      ...base,
      freshness_status: 'serie_parcial',
      freshness_reason: `${rule.reason} Período del libro no normalizable ("${periodo}").`,
    }
  }
  if (latest.includes('-')) {
    // Operación mensual (registro en YYYY-MM).
    if (comparable.ym === latest) {
      return { ...base, freshness_status: 'actualizado', freshness_reason: rule.reason }
    }
    const [ly, lm] = latest.split('-').map(Number)
    const lag =
      comparable.ym !== null
        ? (ly - Number(comparable.ym.slice(0, 4))) * 12 + (lm - Number(comparable.ym.slice(5, 7)))
        : null
    if (lag !== null && lag > 0 && lag <= 2) {
      return { ...base, lag_months: lag, freshness_status: 'serie_parcial', freshness_reason: `${rule.reason} Desfase de ${lag} mes(es).` }
    }
    if (lag !== null && lag <= 0) {
      return { ...base, freshness_status: 'actualizado', freshness_reason: rule.reason }
    }
    return { ...base, lag_months: lag, freshness_status: 'desactualizado', freshness_reason: `${rule.reason} Desfase de ${lag ?? '?'} mes(es) frente a la última edición.` }
  }
  const latestY = latestYearIn(latest)
  if (latestY !== null && comparable.year === latestY) {
    return {
      ...base,
      freshness_status: rule.kind === 'electoral' ? 'ultimo_oficial' : rule.kind === 'estructural' ? 'estructural' : 'actualizado',
      freshness_reason: rule.reason,
    }
  }
  const lagYears = latestY !== null ? latestY - comparable.year : null
  if (rule.kind === 'estructural') {
    return { ...base, lag_years: lagYears, freshness_status: 'estructural', freshness_reason: `${rule.reason} No comparable con ediciones anuales.` }
  }
  return {
    ...base,
    lag_years: lagYears,
    freshness_status: 'desactualizado',
    freshness_reason: `${rule.reason} El libro usa ${periodo || '—'}; hay edición ${latest} disponible.`,
  }
}

function ind(slug: string, ctx: IndicatorCtx): BookIndicator {
  const meta = INDICATOR_LIBRARY[slug]
  if (!meta) throw new Error(`Indicador sin metadatos en la biblioteca: ${slug}`)
  return {
    slug,
    nombre: meta.nombre,
    descripcion: meta.descripcion,
    area: meta.area,
    unidad: meta.unidad,
    tipo_valor: meta.tipo_valor,
    source_slug: meta.source_slug,
    organismo: meta.organismo,
    operacion: meta.operacion,
    table_id: ctx.tableId ?? null,
    series_id: ctx.seriesId ?? null,
    source_url: null,
    license: meta.license,
    periodo: ctx.periodo,
    fecha_extraccion: ctx.fechaExtraccion ?? null,
    ambito: ctx.ambito ?? 'municipio',
    granularidad: ctx.granularidad ?? 'municipal',
    dimensiones: ctx.dimensiones ?? [],
    availability: ctx.availability,
    estado_validacion:
      ctx.estadoValidacion ??
      (ctx.availability === 'available'
        ? 'consolidado'
        : ctx.availability === 'partial'
          ? 'provisional'
          : meta.source_slug === 'conprel' || meta.source_slug === 'redc'
            ? 'bloqueado'
            : 'no_publicado'),
    es_derivado: meta.es_derivado ?? false,
    formula: meta.formula ?? null,
    metodo: meta.metodo ?? null,
    comparabilidad: meta.comparabilidad,
    freshness: ctx.availability === 'available' ? 'publicado' : 'sin dato publicado',
    capability: meta.capability,
    ...freshnessFor(meta.source_slug, ctx.periodo, ctx.availability),
    // La extracción se fecha en la generación del libro (el dato ya está cargado).
    retrieved_at: ctx.fechaExtraccion ?? null,
  }
}

/** Estado estructurado a partir de los estados de valor INE. */
function stateFromIne(status: string | undefined): BookState {
  switch (status) {
    case 'observed':
      return 'available'
    case 'derived':
      return 'available'
    case 'partial':
      return 'partial'
    case 'suppressed':
      return 'statistical_secrecy'
    case 'not_available':
      return 'not_applicable'
    default:
      return 'blocked_source'
  }
}

function stateFromDim(status: string | undefined): BookState {
  switch (status) {
    case 'observed':
      return 'available'
    case 'partial':
      return 'partial'
    case 'suppressed':
      return 'statistical_secrecy'
    case 'missing':
      return 'missing_by_design'
    default:
      return 'pending_integration'
  }
}

// ============================================================================
// Tabla v2
// ============================================================================

interface TableSpec {
  id: string
  titulo: string
  hoja: BookSheetId
  columnas: string[]
  filas: ExportCell[][]
  fuente: string
  periodo: string
  cobertura: string
  estado?: string
  note?: string
  indicadores: BookIndicator[]
  tablaExcel?: string
  chart?: BookChartSpec
  checks?: BookReconciliation[]
  sourceKey?: Parameters<typeof registrySource>[0]
  /** Filas de datos plegables (outline) para bloques de detalle. */
  plegable?: boolean
}

function table(spec: TableSpec): BookTableV2 {
  const hasData = spec.filas.some((f) => f.some((c) => c.numeric !== null))
  const state = spec.indicadores[0]?.availability ?? (hasData ? 'available' : 'pending_integration')
  const v1 = availabilityV1(state)
  // Un gráfico sin ningún valor numérico en sus series nunca se emite: si el
  // modelo lo declarara, el escritor lo descartaría y el modelo mentiría.
  let chart = spec.chart
  if (chart) {
    const seriesConDatos = chart.series.some((s) =>
      spec.filas.some((f) => typeof f[s.columna - 1]?.numeric === 'number' && Number.isFinite(f[s.columna - 1]?.numeric as number)),
    )
    if (!seriesConDatos) chart = undefined
  }
  return {
    schema: SOCIDEAS_BOOK_SCHEMA,
    id: spec.id,
    titulo: spec.titulo,
    hoja: spec.hoja,
    columnas: spec.columnas,
    filas: spec.filas as BookTableV2['filas'],
    fuente: spec.fuente,
    periodo: spec.periodo,
    cobertura: spec.cobertura,
    estado: spec.estado ?? v1.estadoTexto,
    availability: v1.availability,
    comparisonMode: 'municipal_only',
    note: spec.note,
    indicadores: spec.indicadores,
    tablaExcel: spec.tablaExcel,
    chart,
    checks: spec.checks,
    plegable: spec.plegable,
    source: spec.sourceKey ? registrySource(spec.sourceKey) : undefined,
  }
}

/** Adapta una tabla v1 (fuente/periodo/cobertura ya verificados) al contrato v2. */
function adapt(
  block: {
    id: string
    titulo: string
    columnas: string[]
    filas: ExportCell[][]
    fuente: string
    periodo: string
    cobertura: string
    estado: string
    availability?: AvailabilityV1
    note?: string
    source?: { institution: string; operation: string; tableId?: string; publicUrl?: string; shortLabel: string }
  },
  hoja: BookSheetId,
  indicadores: BookIndicator[],
  extras: { tablaExcel?: string; chart?: BookChartSpec; checks?: BookReconciliation[]; filas?: ExportCell[][]; estado?: string } = {},
): BookTableV2 {
  const filas = (extras.filas ?? block.filas) as BookTableV2['filas']
  // Mismo contrato que `table()`: un gráfico sin ningún valor numérico en sus
  // series no se declara (el escritor lo descartaría y el modelo mentiría).
  let chart = extras.chart
  if (chart) {
    const conDatos = chart.series.some((s) =>
      filas.some((f) => {
        const v = f[s.columna - 1]?.numeric
        return v !== null && v !== undefined && Number.isFinite(v)
      }),
    )
    if (!conDatos) chart = undefined
  }
  return {
    schema: SOCIDEAS_BOOK_SCHEMA,
    id: block.id,
    titulo: block.titulo,
    hoja,
    columnas: block.columnas,
    filas,
    fuente: block.fuente,
    periodo: block.periodo,
    cobertura: block.cobertura,
    estado: extras.estado ?? block.estado,
    availability: block.availability ?? 'available',
    comparisonMode: 'municipal_only',
    note: block.note,
    indicadores,
    tablaExcel: extras.tablaExcel,
    chart,
    checks: extras.checks,
    source: block.source,
  }
}

function check(
  id: string,
  descripcion: string,
  izquierda: number | null,
  derecha: number | null,
  tolerancia: number,
  modo: 'igual' | 'menor_igual' = 'igual',
): BookReconciliation {
  const ok =
    izquierda === null || derecha === null
      ? true
      : modo === 'igual'
        ? Math.abs(izquierda - derecha) <= tolerancia
        : izquierda <= derecha + tolerancia
  return { id, descripcion, izquierda, derecha, tolerancia, modo, ok }
}

// ============================================================================
// 01_DEMOGRAFÍA · estructura anual de población (v2.1, INE 68535/68534)
// ============================================================================

/** Convierte la estructura anual en bloques: pirámide quinquenal con
 *  representación (hombres en negativo SOLO en columnas de gráfico), detalle
 *  por edad simple cuando la fuente lo publica (insular) e indicadores
 *  derivados con fórmula declarada. */
function buildEstructuraBlocks(structure: PopulationStructureAnnual, input: SocideasBookInputV2): BookTableV2[] {
  const period = structure.period
  const abbr = period.length >= 4 ? period.slice(0, 4) : period
  const bands = [...structure.ageBands5y].sort((a, b) => bandOrder(a.band) - bandOrder(b.band))
  if (bands.length === 0) return []
  const t = structure.totals
  const bloques: BookTableV2[] = []

  // 1. Pirámide quinquenal + columnas de representación para el gráfico.
  const primeraFilaDatos = 7 // relativo al bloque; el escritor resuelve {R1}/{R2}
  const filasPiramide: ExportCell[][] = bands.map((b) => [
    label(b.band),
    num(b.total),
    num(b.male),
    num(b.female),
    pctFromFormula(`B{R1+${bands.indexOf(b) + 1}}/$B${'{R1}'}*100`, b.total, t.total),
    b.male === null ? label(ND_TEXT) : formulaCell(`-C{R1+${bands.indexOf(b) + 1}}`, -b.male, num(b.male).text),
    b.female === null ? label(ND_TEXT) : formulaCell(`D{R1+${bands.indexOf(b) + 1}}`, b.female, num(b.female).text),
  ])
  filasPiramide.unshift([
    label('Población total'),
    formulaCell(`SUM(B{R1}:B{R2})`, t.total, num(t.total).text),
    formulaCell(`SUM(C{R1}:C{R2})`, t.male, num(t.male).text),
    formulaCell(`SUM(D{R1}:D{R2})`, t.female, num(t.female).text),
    pct(t.total !== null ? 100 : null),
    label('—'),
    label('—'),
  ])
  void primeraFilaDatos
  bloques.push(
    table({
      id: 'estructura-edad',
      titulo: `Estructura de población por edad y sexo (a 1 de enero de ${abbr})`,
      hoja: '01_DEMOGRAFÍA',
      columnas: ['Grupo de edad', 'Total', 'Hombres', 'Mujeres', '% sobre total', 'Hombres (representación)', 'Mujeres (representación)'],
      filas: filasPiramide,
      fuente: `Instituto Nacional de Estadística · Censo Anual de Población · tabla ${structure.sourceTable}`,
      periodo: `${period} (estructura a 1 de enero)`,
      cobertura: ctxMunicipio(input),
      note:
        'Los valores se muestran en magnitud absoluta. Las columnas "representación" usan signo negativo en hombres SOLO para dibujar la pirámide; el dato original nunca se almacena en negativo. Fuente y tabla visibles en la línea superior.',
      indicadores: [
        ind('estructura_edad', { periodo: period, availability: t.total !== null ? 'available' : 'statistical_secrecy', tableId: structure.sourceTable, fechaExtraccion: structure.retrievedAt, dimensiones: ['grupo_edad', 'sexo'] }),
      ],
      tablaExcel: 'tbl_demo_estructura',
      chart: {
        id: 'chart-demo-piramide',
        tipo: 'bar',
        titulo: `Pirámide de población (1 de enero de ${abbr})`,
        unidad: 'personas (hombres a la izquierda, mujeres a la derecha)',
        periodo: period,
        fuente: `INE · Censo Anual · tabla ${structure.sourceTable}`,
        categoriaColumna: 1,
        series: [
          { nombre: 'Hombres', columna: 6 },
          { nombre: 'Mujeres', columna: 7 },
        ],
      },
      checks: [
        check('estructura-sexo', 'Total = hombres + mujeres', (t.male ?? 0) + (t.female ?? 0), t.total, 0),
        check(
          'estructura-edades',
          'Suma de grupos quinquenales = total',
          structure.quality.totalByAgeReconciled ? bands.reduce((a, b) => a + (b.total ?? 0), 0) : null,
          t.total,
          0,
        ),
      ],
    }),
  )

  // 2. Detalle por edad simple (solo si la fuente municipal lo publica).
  if (structure.ageDetail && structure.ageDetail.length > 0) {
    const detail = [...structure.ageDetail].sort((a, b) => a.age - b.age)
    bloques.push(
      table({
        id: 'estructura-edad-detalle',
        titulo: `Detalle por edad simple (a 1 de enero de ${abbr})`,
        hoja: '01_DEMOGRAFÍA',
        columnas: ['Edad', 'Total', 'Hombres', 'Mujeres', '% sobre total'],
        filas: detail.map((d) => [
          label(d.label),
          num(d.total),
          num(d.male),
          num(d.female),
          pct(pctRatio(d.total, t.total)),
        ]),
        fuente: `Instituto Nacional de Estadística · Censo Anual de Población · tabla ${structure.sourceTable}`,
        periodo: `${period} (estructura a 1 de enero)`,
        cobertura: ctxMunicipio(input),
        note: 'Bloque plegable (usa el control +/− de Excel). Edad simple publicada por el INE para este municipio.',
        indicadores: [
          ind('estructura_edad_detalle', { periodo: period, availability: 'available', tableId: structure.sourceTable, dimensiones: ['edad_simple'] }),
        ],
        plegable: true,
      }),
    )
  }

  // 3. Indicadores derivados sobre LA MISMA estructura.
  const derivados = computeStructureIndicators(structure)
  if (derivados.length > 0) {
    const rows: ExportCell[][] = derivados.map((d) => [label(d.label), num(d.value, d.value !== null && !Number.isInteger(d.value) ? 1 : 0), label(d.unit), label(d.formula)])
    // Fórmula Excel auditable para la dependencia total (suma de las dos
    // dependencias de la misma tabla).
    const idxTotal = derivados.findIndex((d) => d.key === 'dependencia_total')
    const idxJuv = derivados.findIndex((d) => d.key === 'dependencia_juvenil')
    const idxMay = derivados.findIndex((d) => d.key === 'dependencia_mayores')
    if (idxTotal >= 0 && idxJuv >= 0 && idxMay >= 0) {
      const vTotal = derivados[idxTotal].value
      rows[idxTotal][1] = formulaCell(`B{R1+${idxJuv}}+B{R1+${idxMay}}`, vTotal, num(vTotal, 1).text)
    }
    const slugByKey: Record<string, string> = {
      menores15: 'estructura_menores15',
      pob15_64: 'estructura_15_64',
      may65: 'estructura_mayores65',
      may80: 'estructura_mayores80',
      envejecimiento: 'indice_envejecimiento',
      sobreenvejecimiento: 'indice_sobreenvejecimiento',
      dependencia_juvenil: 'dependencia_juvenil',
      dependencia_mayores: 'dependencia_mayores',
      dependencia_total: 'indice_dependencia',
      masculinidad: 'relacion_masculinidad',
      edad_media: 'edad_media',
      menores16: 'estructura_menores16',
      pob16_64: 'estructura_16_64',
    }
    bloques.push(
      table({
        id: 'indicadores-estructura',
        titulo: `Indicadores derivados de la estructura ${abbr}`,
        hoja: '01_DEMOGRAFÍA',
        columnas: ['Indicador', 'Valor', 'Unidad', 'Fórmula / método (cálculo SOCideas sobre INE)'],
        filas: rows,
        fuente: `Cálculo SOCideas sobre Instituto Nacional de Estadística · Censo Anual de Población · tabla ${structure.sourceTable}`,
        periodo: period,
        cobertura: ctxMunicipio(input),
        note:
          'Cada fila declara su fórmula. Indicadores INE estándar calculados sobre grupos quinquenales exactos; "menor de 16" y "16–64" solo se calculan cuando la fuente publica edad simple (insular).',
        indicadores: derivados.map((d) =>
          ind(slugByKey[d.key] ?? 'estructura_edad', {
            periodo: period,
            availability: d.value !== null ? 'available' : 'statistical_secrecy',
            tableId: structure.sourceTable,
            fechaExtraccion: structure.retrievedAt,
            dimensiones: [d.key],
          }),
        ),
        tablaExcel: 'tbl_demo_indicadores_estructura',
      }),
    )
  }

  return bloques
}

/** Orden determinista de las bandas quinquenales (0-4 … 100+). */
function bandOrder(band: string): number {
  const norm = band.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (norm.includes('100')) return 1000
  const m = /(\d{1,3})\s*(?:a|-)\s*(\d{1,3})/.exec(norm)
  if (m) return Number(m[1]) * 10
  const solo = /(\d{1,3})/.exec(norm)
  return solo ? Number(solo[1]) * 10 : 9999
}

function buildDemografiaSheet(input: SocideasBookInputV2): BookTableV2[] {
  const perfil = input.perfilDemografia
  const layers = input.ineLayers
  const bloques: BookTableV2[] = []
  const municipio = input.municipio
  const ctxAmbito = `Municipio ${municipio}`
  const fecha = input.fechaGeneracion
  const estructura = input.populationStructure ?? null

  if (perfil) {
    const total = perfil.total?.valor_numerico ?? null
    const hombres = perfil.hombres?.valor_numerico ?? null
    const mujeres = perfil.mujeres?.valor_numerico ?? null
    const anio = perfil.total?.anio_referencia ?? null
    const periodo = anio ? String(anio) : '—'
    const totalState: BookState = total !== null ? 'available' : 'pending_integration'
    bloques.push(
      table({
        id: 'poblacion-sexo',
        titulo: 'Población por sexo',
        hoja: '01_DEMOGRAFÍA',
        columnas: ['Concepto', 'Personas', '% sobre total'],
        filas: [
          [label('Población total'), num(total), label('100.0 %')],
          [
            label('Hombres'),
            num(hombres),
            hombres !== null && total !== null && total > 0
              ? pctFromFormula('B{R1+1}/$B${R1}*100', hombres, total)
              : label(ND_TEXT),
          ],
          [
            label('Mujeres'),
            num(mujeres),
            mujeres !== null && total !== null && total > 0
              ? pctFromFormula('B{R1+2}/$B${R1}*100', mujeres, total)
              : label(ND_TEXT),
          ],
        ],
        fuente: 'Instituto Nacional de Estadística · Cifras oficiales de población (Padrón municipal)',
        periodo,
        cobertura: ctxAmbito,
        note: 'Los porcentajes se calculan con fórmula Excel sobre el total de la misma tabla (paridad verificada en QA).',
        indicadores: [
          ind('population_total', { periodo, availability: totalState, tableId: perfil.total?.source_table_id ?? null, fechaExtraccion: fecha }),
          ind('population_male', { periodo, availability: hombres !== null ? 'available' : 'statistical_secrecy', tableId: perfil.hombres?.source_table_id ?? null }),
          ind('population_female', { periodo, availability: mujeres !== null ? 'available' : 'statistical_secrecy', tableId: perfil.mujeres?.source_table_id ?? null }),
        ],
        tablaExcel: 'tbl_demo_poblacion',
        checks: [check('poblacion-sexo-total', 'Hombres + mujeres = población total', (hombres ?? 0) + (mujeres ?? 0), total, 1)],
      }),
    )

    // Densidad
    const d = perfil.densidad
    if (d.valor !== null && d.valor !== undefined) {
      const aviso = d.poblacion != null && d.superficieKm2 != null && d.anioPoblacion != null && d.anioSuperficie != null
        ? densityYearsWarning(d.anioPoblacion, d.anioSuperficie)
        : null
      bloques.push(
        table({
          id: 'densidad',
          titulo: 'Densidad de población',
          hoja: '01_DEMOGRAFÍA',
          columnas: ['Concepto', 'Valor', 'Unidad'],
          filas: [
            [label('Densidad de población'), num(d.valor, 1), label('hab./km²')],
            [label('Superficie municipal (IGN · NGMEP)'), num(d.superficieKm2 ?? null, 2), label('km²')],
            [label('Población usada en el cálculo'), num(d.poblacion ?? null), label('personas')],
          ],
          fuente: 'INE (Padrón) + IGN (NGMEP) · cálculo SOCideas',
          periodo: `población ${d.anioPoblacion ?? '—'} · superficie ${d.anioSuperficie ?? '—'}`,
          cobertura: ctxAmbito,
          note: aviso ? `Densidad = población / superficie IGN. ${aviso}` : 'Densidad = población municipal / superficie oficial IGN (NGMEP).',
          indicadores: [ind('population_density', { periodo: `${d.anioPoblacion ?? ''}`.trim() || '—', availability: 'available', tableId: layers?.layers.demographicDerived?.density?.tableId ?? null })],
        }),
      )
    }

    // Evolución (comparativa homogénea)
    const serieMuni = perfil.evolucion
      .filter((v) => isPublishableValue(slugOf(v), v.valor_numerico))
      .map((v) => ({ anio: v.anio_referencia ?? 0, valor: v.valor_numerico as number }))
      .sort((a, b) => a.anio - b.anio)
    if (serieMuni.length > 0) {
      const porAmbito = (arr: IndicatorValue[], ambito: string) =>
        new Map(
          arr
            .filter((v) => isPublishableValue(slugOf(v), v.valor_numerico) && (v.dimensiones?.ambito ?? 'municipio') === ambito)
            .map((v) => [v.anio_referencia ?? 0, v.valor_numerico as number]),
        )
      const prov = porAmbito(perfil.comparativas.provincia, 'provincia')
      const ccaa = porAmbito(perfil.comparativas.ccaa, 'ccaa')
      const esp = porAmbito(perfil.comparativas.espana, 'espana')
      const anios = [...new Set([...serieMuni.map((p) => p.anio), ...prov.keys(), ...ccaa.keys(), ...esp.keys()])]
        .filter((a) => a > 0)
        .sort((a, b) => a - b)
      const columnas = ['Año']
      if (esp.size > 0) columnas.push('España')
      if (ccaa.size > 0) columnas.push('CCAA')
      if (prov.size > 0) columnas.push('Provincia')
      columnas.push('Municipio')
      const filas: ExportCell[][] = anios.map((a) => {
        const fila: ExportCell[] = [label(String(a))]
        if (esp.size > 0) fila.push(num(esp.get(a) ?? null))
        if (ccaa.size > 0) fila.push(num(ccaa.get(a) ?? null))
        if (prov.size > 0) fila.push(num(prov.get(a) ?? null))
        fila.push(num(serieMuni.find((p) => p.anio === a)?.valor ?? null))
        return fila
      })
      const colMuni = columnas.length
      bloques.push(
        table({
          id: 'evolucion',
          titulo: 'Evolución de la población',
          hoja: '01_DEMOGRAFÍA',
          columnas,
          filas,
          fuente: 'Instituto Nacional de Estadística · Cifras oficiales de población (Padrón municipal)',
          periodo: `${anios[0]}–${anios[anios.length - 1]}`,
          cobertura: `${columnas.slice(1).join(' · ')} (mismo año y misma definición)`,
          note: 'Solo se comparan ámbitos con dato publicado en el mismo año. Nunca se interpola.',
          indicadores: [ind('population_evolution', { periodo: `${anios[0]}–${anios[anios.length - 1]}`, availability: 'available', tableId: serieMuni[0] ? perfil.evolucion[0]?.source_table_id ?? null : null })],
          tablaExcel: 'tbl_demo_evolucion',
          chart: {
            id: 'chart-demo-evolucion',
            tipo: 'line',
            titulo: 'Evolución de la población',
            unidad: 'personas',
            periodo: `${anios[0]}–${anios[anios.length - 1]}`,
            fuente: 'INE · Padrón municipal',
            categoriaColumna: 1,
            series: columnas.slice(1).map((c, i) => ({ nombre: c, columna: i + 2 })),
          },
        }),
      )
      void colMuni
    }

    // Pirámide: v2.1 usa la estructura anual 2025 (INE 68535/68534) cuando está
    // disponible; el bloque histórico 33570 solo actúa como respaldo declarado.
    if (estructura && estructura.totals.total !== null) {
      bloques.push(...buildEstructuraBlocks(estructura, input))
    } else if (perfil.piramide.grupos.length > 0 && perfil.piramide.anio !== null) {
      const suma = perfil.piramide.grupos.reduce((a, g) => a + g.hombres + g.mujeres, 0)
      const sumaH = perfil.piramide.grupos.reduce((a, g) => a + g.hombres, 0)
      const sumaM = perfil.piramide.grupos.reduce((a, g) => a + g.mujeres, 0)
      const filas: ExportCell[][] = perfil.piramide.grupos.map((g) => [
        label(g.tramo),
        num(g.hombres),
        num(g.mujeres),
        pct(suma > 0 ? Math.round(((g.hombres + g.mujeres) / suma) * 1000) / 10 : null, 1),
      ])
      // Fila de total con fórmula auditable (SUMA de los tramos publicados).
      // `{R1}`/`{R2}` los resuelve el escritor con las filas reales del bloque.
      filas.push([
        label('Total (suma de tramos)'),
        formulaCell('SUM(B{R1}:B{R2-1})', sumaH, num(sumaH).text),
        formulaCell('SUM(C{R1}:C{R2-1})', sumaM, num(sumaM).text),
        pct(100),
      ])
      bloques.push(
        table({
          id: 'piramide',
          titulo: `Estructura por edad y sexo (${perfil.piramide.anio})`,
          hoja: '01_DEMOGRAFÍA',
          columnas: ['Grupo de edad', 'Hombres', 'Mujeres', '% sobre total'],
          filas,
          fuente: 'Instituto Nacional de Estadística · Padrón Continuo · tabla 33570',
          periodo: String(perfil.piramide.anio),
          cobertura: ctxAmbito,
          note: 'Distribución quinquenal publicada por el INE para el municipio.',
          indicadores: [ind('population_age_sex', { periodo: String(perfil.piramide.anio), availability: 'available', tableId: '33570' })],
          tablaExcel: 'tbl_demo_piramide',
          chart: {
            id: 'chart-demo-piramide',
            tipo: 'bar',
            titulo: `Pirámide de población (${perfil.piramide.anio})`,
            unidad: 'personas',
            periodo: String(perfil.piramide.anio),
            fuente: 'INE · Padrón Continuo',
            categoriaColumna: 1,
            series: [
              { nombre: 'Hombres', columna: 2 },
              { nombre: 'Mujeres', columna: 3 },
            ],
          },
          checks: [
            // La pirámide es de su propio año; se compara con la población del
            // MISMO año (nunca con el último padrón si difiere).
            check(
              'piramide-total',
              `Suma de la pirámide = población del padrón ${perfil.piramide.anio}`,
              suma,
              perfil.evolucion.find((v) => v.anio_referencia === perfil.piramide.anio)?.valor_numerico ??
                (anio === perfil.piramide.anio ? total : null),
              Math.max(2, Math.round((suma || 0) * 0.005)),
            ),
          ],
        }),
      )
    }

    // Derivados: envelope + capa INE, un único bloque (sin duplicar filas)
    const dd = layers?.layers.demographicDerived
    const derivadosFilas: ExportCell[][] = []
    const addDerivado = (nombre: string, valor: number | null, unidad: string): void => {
      if (valor === null || !Number.isFinite(valor)) return
      derivadosFilas.push([label(nombre), num(valor, 1), label(unidad)])
    }
    addDerivado('Variación a 5 años', perfil.derivados.cambio_5y, '%')
    addDerivado('Variación a 10 años', perfil.derivados.cambio_10y, '%')
    // Con estructura anual 2025, envejecimiento/dependencia se calculan sobre
    // ESA estructura (bloque `indicadores-estructura`): no se duplican aquí.
    const derivadosLegacy = !(estructura && estructura.totals.total !== null)
    if (derivadosLegacy) {
      addDerivado('Índice de envejecimiento', perfil.derivados.indice_envejecimiento, 'ratio')
      addDerivado('Índice de dependencia', perfil.derivados.indice_dependencia, 'ratio')
      addDerivado('Edad media', dd?.meanAge?.value ?? null, 'años')
      addDerivado('Dependencia infantil', dd?.dependencyYouth?.value ?? null, '%')
      addDerivado('Dependencia de mayores', dd?.dependencyOlder?.value ?? null, '%')
    }
    if (derivadosFilas.length > 0) {
      bloques.push(
        table({
          id: 'indicadores-demograficos',
          titulo: derivadosLegacy ? 'Indicadores demográficos derivados' : 'Variación de población',
          hoja: '01_DEMOGRAFÍA',
          columnas: ['Indicador', 'Valor', 'Unidad'],
          filas: derivadosFilas,
          fuente: 'Cálculo SOCideas sobre datos oficiales INE',
          periodo: periodo,
          cobertura: ctxAmbito,
          note: derivadosLegacy
            ? 'Cada indicador declara su fórmula en la hoja 10_METODOLOGÍA_FUENTES.'
            : 'Variaciones calculadas sobre la serie del Padrón. Envejecimiento, dependencia y edad media se calculan en el bloque de estructura 2025 (sin duplicar).',
          indicadores: [
            ind('population_change_5y', { periodo, availability: perfil.derivados.cambio_5y !== null ? 'available' : 'pending_integration' }),
            ind('population_change_10y', { periodo, availability: perfil.derivados.cambio_10y !== null ? 'available' : 'pending_integration' }),
            ...(derivadosLegacy
              ? [
                  ind('indice_envejecimiento', { periodo, availability: perfil.derivados.indice_envejecimiento !== null ? 'available' : 'pending_integration' }),
                  ind('indice_dependencia', { periodo, availability: perfil.derivados.indice_dependencia !== null ? 'available' : 'pending_integration' }),
                ]
              : []),
          ],
        }),
      )
    }
  }

  // Dimensiones laterales (nacionalidad, nacimiento, arraigo)
  for (const b of buildDemographicDimensionTables(input.demoExtra)) {
    const periodo = b.periodo
    const estado = stateFromDim(
      b.id === 'nacionalidad' ? input.demoExtra?.nationality?.status
        : b.id === 'nacimiento' ? input.demoExtra?.birthCountry?.status
          : input.demoExtra?.birthResidenceRelation?.status,
    )
    const slugs = b.id === 'nacionalidad'
      ? ['nationality_spanish', 'nationality_foreign']
      : b.id === 'nacimiento'
        ? ['birth_country']
        : ['arraigo']
    bloques.push(
      adapt(b, '01_DEMOGRAFÍA', slugs.map((s) => ind(s, { periodo, availability: estado, tableId: b.source?.tableId ?? null }))),
    )
  }

  // Flujos migratorios
  for (const b of buildMigrationFlowTables(input.migracion)) {
    const estado = stateFromDim(b.id.includes('emigracion-extranjero')
      ? input.migracion?.emigrationAbroad?.status
      : b.id.includes('inmigracion')
        ? input.migracion?.immigrationIntermunicipal?.status
        : input.migracion?.emigrationIntermunicipal?.status)
    const slug = b.id.includes('emigracion-extranjero')
      ? 'emigration_abroad'
      : b.id.includes('inmigracion')
        ? 'immigration_intermunicipal'
        : 'emigration_intermunicipal'
    bloques.push(adapt(b, '01_DEMOGRAFÍA', [ind(slug, { periodo: b.periodo, availability: estado, tableId: b.source?.tableId ?? null })]))
  }

  // Saldos migratorios: UNA tabla (el libro v1 los duplicaba)
  const mb = layers?.layers.migrationBalance
  if (mb) {
    const estado = stateFromIne(mb.status)
    const v = (x: IneValue | undefined): number | null => (x && typeof x.value === 'number' ? x.value : null)
    const filas: ExportCell[][] = [
      [label('Saldo total'), num(v(mb.total)), num(v(mb.bySex?.male?.total)), num(v(mb.bySex?.female?.total))],
      [label('Saldo interior'), num(v(mb.interior)), num(v(mb.bySex?.male?.interior)), num(v(mb.bySex?.female?.interior))],
      [label('Saldo exterior'), num(v(mb.exterior)), num(v(mb.bySex?.male?.exterior)), num(v(mb.bySex?.female?.exterior))],
    ]
    bloques.push(
      table({
        id: 'saldos-migratorios',
        titulo: 'Saldo migratorio neto (total, interior y exterior)',
        hoja: '01_DEMOGRAFÍA',
        columnas: ['Concepto', 'Total', 'Hombres', 'Mujeres'],
        filas,
        fuente: 'Instituto Nacional de Estadística · Estadística de Migraciones y Cambios de Residencia · tabla 69767',
        periodo: mb.period,
        cobertura: ctxAmbito,
        note: 'Saldo = entradas − salidas (producto distinto de los flujos 69711/69743/69746). Un único bloque por identidad estable.',
        indicadores: [ind('saldo_migratorio', { periodo: mb.period, availability: estado, tableId: mb.tableId ?? '69767', dimensiones: ['total', 'interior', 'exterior', 'sexo'] })],
        tablaExcel: 'tbl_demo_saldos',
        chart: {
          id: 'chart-demo-saldos',
          tipo: 'column',
          titulo: `Saldo migratorio neto (${mb.period})`,
          unidad: 'personas',
          periodo: mb.period,
          fuente: 'INE · tabla 69767',
          categoriaColumna: 1,
          series: [
            { nombre: 'Total', columna: 2 },
            { nombre: 'Hombres', columna: 3 },
            { nombre: 'Mujeres', columna: 4 },
          ],
        },
        checks: [
          check(
            'saldo-total-por-sexo',
            'Hombres + mujeres = saldo total',
            (v(mb.bySex?.male?.total) ?? 0) + (v(mb.bySex?.female?.total) ?? 0),
            v(mb.total),
            1,
          ),
        ],
      }),
    )
  }

  if (bloques.length === 0) {
    bloques.push(pendingTable('01_DEMOGRAFÍA', 'demografia-sin-datos', 'Demografía', 'Sin datos demográficos publicados para este municipio', [ind('population_total', { periodo: '—', availability: 'pending_integration' })]))
  }
  return bloques
}

// ============================================================================
// 02_POLÍTICA
// ============================================================================

const PENDIENTE_PAYLOAD_ELECTORAL = 'Datos existentes en fuente oficial; pendientes de carga al pipeline (sin escrituras en esta misión).'

/** Nota de cobertura CANÓNICA de un bloque electoral provincial.
 *
 *  Regla de oro de v2.3: un resultado de circunscripción NUNCA se presenta como
 *  dato del municipio. La nota es textual, obligatoria y visible en cada uno de
 *  los tres bloques (autonómico, Congreso y Senado). */
export function notaCoberturaProvincial(circunscripcion: string, municipio: string, eleccion: string): string {
  return (
    `Los resultados corresponden a la circunscripción electoral de ${circunscripcion}. ` +
    `${municipio} no dispone de desglose a nivel municipal para esta elección. ` +
    `(${eleccion})`
  )
}


function politicaParticipacion(p: ElectoralPresentacion, indicadores: BookIndicator[]): BookTableV2 {
  const censo = p.censo
  const votantes = p.votantes
  const abstencion = censo !== null && votantes !== null ? censo - votantes : null
  const validos = p.validos
  const nulos = p.nulos
  const filas: ExportCell[][] = [
    [label('Censo electoral'), num(censo), pct(censo !== null && censo > 0 ? 100 : null)],
    [label('Votantes'), num(votantes), pctFromFormula('B{R1+1}/$B${R1}*100', votantes, censo)],
    [
      label('Abstención'),
      formulaCell('B{R1}-B{R1+1}', abstencion, num(abstencion).text),
      formulaCell(
        '100-B{R1+1}/$B${R1}*100',
        abstencion !== null && censo !== null && censo > 0 ? Math.round((100 - (votantes ?? 0) / censo * 100) * 10) / 10 : null,
        `${num(abstencion !== null && censo !== null && censo > 0 ? Math.round((100 - (votantes ?? 0) / censo * 100) * 10) / 10 : null, 1).text} %`,
      ),
    ],
    [label('Votos válidos'), num(validos), pct(pctRatio(validos, votantes))],
    [label('Votos nulos'), num(nulos), pct(pctRatio(nulos, votantes))],
    [label('Votos en blanco'), num(p.blancos), pct(pctRatio(p.blancos, validos))],
  ]
  return table({
    id: 'elecciones-participacion',
    titulo: `Elecciones municipales ${p.anio} · participación`,
    hoja: '02_POLÍTICA',
    columnas: ['Concepto', 'Personas', '%'],
    filas,
    fuente: 'Ministerio del Interior · Infoelectoral · municipios de más de 250 habitantes',
    periodo: `${p.anio} (${ELECTIONS_CONVOCATORIA.fecha})`,
    cobertura: `Municipio ${p.municipio}`,
    note: 'Participación = votantes / censo. Abstención = censo − votantes. Fórmulas Excel auditables.',
    indicadores,
    tablaExcel: 'tbl_pol_participacion',
    sourceKey: 'mir_muni_mas250_2023',
    checks: [
      check('elec-validos-nulos', 'Votantes = válidos + nulos', validos !== null && nulos !== null ? validos + nulos : null, votantes, 1),
      check('elec-participacion', 'Participación declarada = votantes/censo', p.participacion, pctRatio(votantes, censo), 0.2),
    ],
  })
}

function politicaCandidaturas(
  p: ElectoralPresentacion,
  indicadores: BookIndicator[],
  votosCandidaturasPublicados: number | null,
): BookTableV2 {
  const filas: ExportCell[][] = p.candidaturas.map((c) => [
    label(c.siglas ? `${c.nombre} (${c.siglas})` : c.nombre),
    num(c.votos),
    pct(c.pctValidos),
    num(c.concejales),
  ])
  const sumaVotos = p.candidaturas.reduce((a, c) => a + (c.votos ?? 0), 0)
  const sumaConcejales = p.candidaturas.reduce((a, c) => a + (c.concejales ?? 0), 0)
  const detalleCubre =
    votosCandidaturasPublicados !== null && sumaVotos >= votosCandidaturasPublicados - 1
  const notaDetalle = detalleCubre
    ? 'Top 5 por votos + "Otras candidaturas" agregada. Se conserva el literal original de la fuente.'
    : `El reparto por candidatura lista ${sumaVotos.toLocaleString('es-ES')} de los ${
        (votosCandidaturasPublicados ?? 0).toLocaleString('es-ES')
      } votos a candidaturas publicados: la diferencia NO se imputa a ninguna candidatura (el detalle por candidatura de la fuente no cubre todos los votos).`
  return table({
    id: 'elecciones-candidaturas',
    titulo: `Elecciones municipales ${p.anio} · resultados por candidatura`,
    hoja: '02_POLÍTICA',
    columnas: ['Candidatura', 'Votos', '% sobre válidos', 'Concejales'],
    filas,
    fuente: 'Ministerio del Interior · Infoelectoral · municipios de más de 250 habitantes',
    periodo: `${p.anio} (${ELECTIONS_CONVOCATORIA.fecha})`,
    cobertura: `Municipio ${p.municipio}`,
    note: notaDetalle,
    indicadores,
    tablaExcel: 'tbl_pol_candidaturas',
    sourceKey: 'mir_muni_mas250_2023',
    checks: [
      // Agregados publicados por la fuente (no el detalle): es la igualdad
      // contable real de la convocatoria.
      check(
        'elec-validos-agregados',
        'Votos a candidaturas publicados + blancos = válidos',
        votosCandidaturasPublicados !== null && p.blancos !== null ? votosCandidaturasPublicados + p.blancos : null,
        p.validos,
        1,
      ),
      // El detalle por candidatura no puede exceder el agregado publicado.
      check(
        'elec-detalle-candidaturas',
        'Suma del detalle por candidatura ≤ votos a candidaturas publicados',
        sumaVotos,
        votosCandidaturasPublicados,
        1,
        'menor_igual',
      ),
      check('elec-concejales', 'Concejales sumados = concejales en liza', sumaConcejales, p.totalConcejales, 0),
    ],
  })
}

function buildPoliticaSheet(input: SocideasBookInputV2): BookTableV2[] {
  const bloques: BookTableV2[] = []
  const municipio = input.municipio
  const valores = input.perfilDemografia?.valores ?? []
  const p = buildElectoralPresentation(valores, municipio)
  const periodo2023 = `2023 (${ELECTIONS_CONVOCATORIA.fecha})`

  const votosCandidaturasPublicados =
    valores
      .filter(
        (v) =>
          slugOf(v) === 'elec_votos_candidaturas' &&
          v.anio_referencia === ELECTIONS_CONVOCATORIA.anio &&
          (v.dimensiones?.ambito ?? 'municipio') === 'municipio',
      )
      .map((v) => v.valor_numerico)
      .find((n): n is number => typeof n === 'number' && Number.isFinite(n)) ?? null

  if (p.status === 'observed') {
    bloques.push(
      politicaParticipacion(p, [
        ind('elec_censo', { periodo: periodo2023, availability: p.censo !== null ? 'available' : 'statistical_secrecy', tableId: ELECTIONS_CONVOCATORIA.tableId }),
        ind('elec_votantes', { periodo: periodo2023, availability: p.votantes !== null ? 'available' : 'statistical_secrecy', tableId: ELECTIONS_CONVOCATORIA.tableId }),
        ind('elec_abstencion', { periodo: periodo2023, availability: p.censo !== null && p.votantes !== null ? 'available' : 'statistical_secrecy' }),
        ind('elec_participacion', { periodo: periodo2023, availability: p.participacion !== null ? 'available' : 'statistical_secrecy' }),
        ind('elec_votos_validos', { periodo: periodo2023, availability: p.validos !== null ? 'available' : 'statistical_secrecy' }),
        ind('elec_votos_nulos', { periodo: periodo2023, availability: p.nulos !== null ? 'available' : 'statistical_secrecy' }),
        ind('elec_votos_blanco', { periodo: periodo2023, availability: p.blancos !== null ? 'available' : 'statistical_secrecy' }),
      ]),
    )
    if (p.candidaturas.length > 0) {
      bloques.push(
        politicaCandidaturas(
          p,
          [
            ind('elec_candidaturas', { periodo: periodo2023, availability: 'available', tableId: ELECTIONS_CONVOCATORIA.tableId, dimensiones: ['candidatura', 'siglas'] }),
            ind('elec_concejales', { periodo: periodo2023, availability: 'available', tableId: ELECTIONS_CONVOCATORIA.tableId, dimensiones: ['candidatura', 'siglas'] }),
          ],
          votosCandidaturasPublicados,
        ),
      )
    }
  } else {
    bloques.push(
      pendingTable(
        '02_POLÍTICA',
        'elecciones-municipales-2023',
        'Elecciones municipales 2023',
        'El municipio no aparece en el fichero de municipios de más de 250 habitantes (régimen de concejo abierto o sin agregados publicados). No se presenta como 0.',
        [ind('elec_participacion', { periodo: periodo2023, availability: 'not_applicable' })],
      ),
    )
  }

  // Serie histórica municipal (payload verificado)
  const convocatoriasValidas = (input.electoral?.convocatorias ?? []).filter((c) => Number.isFinite(c.anio))
  if (input.electoral && convocatoriasValidas.length > 0) {
    const convs = [...convocatoriasValidas].sort((a, b) => a.anio - b.anio)
    const filas: ExportCell[][] = convs.map((c) => {
      const ganadora = [...c.candidaturas].sort((a, b) => (b.votos ?? -1) - (a.votos ?? -1))[0] ?? null
      return [
        label(String(c.anio)),
        num(c.censo),
        num(c.votantes),
        pct(pctRatio(c.votantes, c.censo)),
        num(c.nulos),
        num(c.blancos),
        label(ganadora ? (ganadora.siglas ? `${ganadora.candidatura} (${ganadora.siglas})` : ganadora.candidatura) : ND_TEXT),
        num(ganadora?.votos ?? null),
        num(c.totalConcejales),
      ]
    })
    const conVotos = convs.filter((c) => (c.votantes ?? 0) > 0).length
    bloques.push(
      table({
        id: 'elecciones-serie-municipal',
        titulo: 'Elecciones municipales · serie de convocatorias',
        hoja: '02_POLÍTICA',
        columnas: ['Año', 'Censo', 'Votantes', 'Participación %', 'Nulos', 'Blancos', 'Candidatura ganadora', 'Votos ganadora', 'Concejales'],
        filas,
        fuente: `${input.electoral.fuenteLabel} · datos abiertos`,
        periodo: `${convs[0].anio}–${convs[convs.length - 1].anio} (${convs.length} convocatorias)`,
        cobertura: `Municipio ${municipio}`,
        note: 'Varios períodos con definiciones electorales comparables (mismo tipo de elección). El censo cambia entre convocatorias: no se compara censo entre años, sí participación.',
        indicadores: [
          ind('elec_serie_municipal', { periodo: `${convs[0].anio}–${convs[convs.length - 1].anio}`, availability: conVotos > 0 ? 'available' : 'partial', dimensiones: ['convocatoria'] }),
        ],
        tablaExcel: 'tbl_pol_serie',
        chart: {
          id: 'chart-pol-serie',
          tipo: 'column',
          titulo: 'Participación por convocatoria municipal',
          unidad: '%',
          periodo: `${convs[0].anio}–${convs[convs.length - 1].anio}`,
          fuente: input.electoral.fuenteLabel,
          categoriaColumna: 1,
          series: [{ nombre: 'Participación', columna: 4 }],
        },
      }),
    )
  } else {
    bloques.push(
      pendingTable(
        '02_POLÍTICA',
        'elecciones-serie-municipal',
        'Elecciones municipales · serie de convocatorias',
        `Serie histórica municipal verificable (12 convocatorias 1979–2023) disponible en el fichero abierto de Infoelectoral. ${PENDIENTE_PAYLOAD_ELECTORAL}`,
        [ind('elec_serie_municipal', { periodo: '1979–2023', availability: 'pending_integration' })],
        { candidataFuente: 'Infoelectoral · fichero de municipios (varias convocatorias)', siguienteAccion: 'Cargar la serie municipal histórica al envelope v2 y reconstruir el bloque' },
      ),
    )
  }

  // Autonómicas: circunscripción provincial, nunca escaños al municipio.
  // Manzaneque (como cualquier municipio) no tiene desglose autonómico municipal.
  if (input.autonomicasCircunscripcion) {
    const a = input.autonomicasCircunscripcion
    const notaCobertura = notaCoberturaProvincial(a.circunscripcion, municipio, `Elecciones autonómicas ${a.anio} · ${a.camara}`)
    const participacion: ExportCell[][] = [
      [label('Censo electoral'), num(a.censo), label('—')],
      [label('Votantes'), num(a.votantes), pct(pctRatio(a.votantes, a.censo))],
      [label('Participación (derivada: votantes / censo)'), label('—'), pct(pctRatio(a.votantes, a.censo))],
      [label('Votos válidos'), num(a.validos), pct(pctRatio(a.validos, a.votantes))],
      [label('Votos en blanco'), num(a.blancos), pct(pctRatio(a.blancos, a.validos))],
      [label('Votos nulos'), num(a.nulos), pct(pctRatio(a.nulos, a.votantes))],
      [label(`Escaños de ${a.circunscripcion} en las Cortes (total)`), num(a.escanosTotal), label('—')],
    ]
    bloques.push(
      table({
        id: 'elecciones-autonomicas',
        titulo: `Elecciones autonómicas ${a.anio} · ${a.camara} · circunscripción de ${a.circunscripcion}`,
        hoja: '02_POLÍTICA',
        columnas: ['Concepto', 'Personas', '%'],
        filas: participacion,
        fuente: a.fuenteLabel,
        periodo: `${a.anio} (${a.fecha})`,
        cobertura: `Circunscripción provincial: ${a.circunscripcion} (ámbito provincial, no municipal)`,
        estado: 'Consolidado (resultados definitivos publicados por la Junta Electoral)',
        note: `${notaCobertura} Participación derivada (votantes/censo), cifra provincial. Los escaños son de la circunscripción provincial, nunca del municipio.`,
        indicadores: [ind('elec_autonomicas', { periodo: `${a.anio}`, availability: 'available', ambito: 'provincia', granularidad: 'provincial', dimensiones: ['camara:autonomicas'] })],
        tablaExcel: 'tbl_pol_autonomicas',
      }),
    )
    const candAut = [...a.candidaturas].sort((b, c) => (c.votos ?? -1) - (b.votos ?? -1)).slice(0, 10)
    if (candAut.length > 0) {
      bloques.push(
        table({
          id: 'elecciones-autonomicas-candidaturas',
          titulo: `Autonómicas ${a.anio} · votos y escaños por candidatura (${a.circunscripcion})`,
          hoja: '02_POLÍTICA',
          columnas: ['Candidatura', 'Siglas normalizadas', 'Votos', '% sobre válidos', 'Escaños en las Cortes'],
          filas: candAut.map((c) => [
            label(c.nombre),
            label(normalizarSiglasElectoral(c.siglas || c.nombre)),
            num(c.votos),
            pct(pctRatio(c.votos, a.validos)),
            num(c.escanos),
          ]),
          fuente: a.fuenteLabel,
          periodo: `${a.anio} (${a.fecha})`,
          cobertura: `Circunscripción provincial: ${a.circunscripcion}`,
          estado: 'Consolidado (resultados definitivos)',
          note: `Escaños de la circunscripción provincial (${a.circunscripcion}); no del municipio. ${notaCobertura} Las siglas se homologan solo con la tabla declarada; el literal de la fuente se conserva en la candidatura.`,
          indicadores: [ind('elec_autonomicas', { periodo: `${a.anio}`, availability: 'available', ambito: 'provincia', granularidad: 'provincial', dimensiones: ['camara:autonomicas', 'candidatura'] })],
          tablaExcel: 'tbl_pol_autonomicas_cand',
        }),
      )
    }
  } else {
    bloques.push(
      pendingTable(
        '02_POLÍTICA',
        'elecciones-autonomicas',
        'Elecciones autonómicas · circunscripción',
        `El municipio pertenece a una circunscripción provincial/autonómica: solo se publicarán voto y participación del ámbito correspondiente, nunca escaños atribuidos al municipio. Fuente oficial disponible en Datos Abiertos de Castilla-La Mancha y acuerdo de la Junta Electoral de CLM (DOCM). ${PENDIENTE_PAYLOAD_ELECTORAL}`,
        [ind('elec_autonomicas', { periodo: 'última convocatoria', availability: 'pending_integration', ambito: 'provincia' })],
        { candidataFuente: 'Datos Abiertos CLM · resultados a las Cortes', siguienteAccion: 'Incorporar resultados autonómicos por circunscripción y añadir comparación provincial/autonómica homogénea' },
      ),
    )
  }

  // Congreso
  if (input.congresoProvincia) {
    const g = input.congresoProvincia
    const notaCongreso = notaCoberturaProvincial(g.provincia, municipio, `Elecciones generales (Congreso) ${g.anio}`)
    const filas: ExportCell[][] = [
      [label('Censo electoral'), num(g.censo), label('—')],
      [label('Votantes'), num(g.votantes), pct(pctRatio(g.votantes, g.censo))],
      [label('Votos válidos'), num(g.validos), pct(pctRatio(g.validos, g.votantes))],
      [label('Votos nulos'), num(g.nulos), pct(pctRatio(g.nulos, g.votantes))],
      [label('Votos en blanco'), num(g.blancos), pct(pctRatio(g.blancos, g.validos))],
    ]
    bloques.push(
      table({
        id: 'elecciones-congreso',
        titulo: `Elecciones generales (Congreso) ${g.anio} · circunscripción de ${g.provincia}`,
        hoja: '02_POLÍTICA',
        columnas: ['Concepto', 'Personas', '%'],
        filas,
        fuente: `${g.fuenteLabel} · datos abiertos`,
        periodo: `${g.anio} (${g.fecha})`,
        cobertura: `Circunscripción provincial: ${g.provincia} (ámbito provincial, no municipal)`,
        note: `${notaCongreso} Resultados de Congreso por circunscripción provincial; no se atribuyen escaños ni votos al municipio. Participación y votos son cifras provinciales, no nacionales. Cámara separada del Senado.`,
        indicadores: [ind('elec_congreso', { periodo: `${g.anio}`, availability: 'available', ambito: 'provincia', granularidad: 'provincial', dimensiones: ['camara:congreso'] })],
        tablaExcel: 'tbl_pol_congreso',
      }),
    )
    const cand = [...g.candidaturas].sort((a, b) => (b.votos ?? -1) - (a.votos ?? -1)).slice(0, 8)
    if (cand.length > 0) {
      bloques.push(
        table({
          id: 'elecciones-congreso-candidaturas',
          titulo: `Congreso ${g.anio} · votos y escaños por candidatura (${g.provincia})`,
          hoja: '02_POLÍTICA',
          columnas: ['Candidatura', 'Siglas normalizadas', 'Votos', '% sobre válidos', 'Escaños'],
          filas: cand.map((c) => [
            label(c.nombre),
            label(normalizarSiglasElectoral(c.siglas || c.nombre)),
            num(c.votos),
            pct(pctRatio(c.votos, g.validos)),
            num(c.escanos),
          ]),
          fuente: `${g.fuenteLabel} · datos abiertos`,
          periodo: `${g.anio} (${g.fecha})`,
          cobertura: `Circunscripción provincial: ${g.provincia}`,
          note: `${notaCongreso} Escaños de la circunscripción provincial; no del municipio. Cámara separada del Senado: nunca se suman votos ni escaños entre ambas. Las siglas se homologan solo con la tabla declarada; el literal de la fuente se conserva en la candidatura.`,
          indicadores: [ind('elec_congreso', { periodo: `${g.anio}`, availability: 'available', ambito: 'provincia', granularidad: 'provincial', dimensiones: ['camara:congreso', 'candidatura'] })],
          tablaExcel: 'tbl_pol_congreso_cand',
        }),
      )
    }
  } else {
    bloques.push(
      pendingTable(
        '02_POLÍTICA',
        'elecciones-congreso',
        'Elecciones generales (Congreso)',
        `Congreso se publica por circunscripción provincial (no municipal). Fuente oficial disponible en Infoelectoral (datos abiertos generales). ${PENDIENTE_PAYLOAD_ELECTORAL}`,
        [ind('elec_congreso', { periodo: 'última convocatoria', availability: 'pending_integration', ambito: 'provincia', granularidad: 'provincial' })],
        { candidataFuente: 'Infoelectoral · datos abiertos generales (Congreso)', siguienteAccion: 'Cargar Congreso por provincia y unir por la provincia del municipio' },
      ),
    )
  }

  // Senado: cámara separada, voto a candidatos. Nunca en la tabla del Congreso
  // ni sumado con ella. El sistema es de listas abiertas: cada elector marca
  // hasta 3 candidatos y se eligen los 4 más votados de la circunscripción.
  if (input.senadoCircunscripcion) {
    const s = input.senadoCircunscripcion
    const notaSenado = notaCoberturaProvincial(s.circunscripcion, municipio, `Elecciones generales (Senado) ${s.anio}`)
    const filasSenado: ExportCell[][] = [...s.candidatos]
      .sort((a, b) => (b.votos ?? -1) - (a.votos ?? -1))
      .map((c) => [
        label([c.nombre, c.apellido1, c.apellido2].filter(Boolean).join(' ')),
        label(c.partidoNombre ? `${c.partidoNombre} (${normalizarSiglasElectoral(c.partidoSiglas)})` : normalizarSiglasElectoral(c.partidoSiglas)),
        num(c.votos),
        label(c.elegido ? 'SÍ' : 'No'),
      ])
    bloques.push(
      table({
        id: 'elecciones-senado',
        titulo: `Elecciones generales (Senado) ${s.anio} · voto a candidatos (${s.circunscripcion})`,
        hoja: '02_POLÍTICA',
        columnas: ['Candidato', 'Candidatura (siglas normalizadas)', 'Votos', 'Elegido'],
        filas: filasSenado,
        fuente: s.fuenteLabel,
        periodo: `${s.anio} (${s.fecha})`,
        cobertura: `Circunscripción provincial: ${s.circunscripcion} (ámbito provincial, no municipal)`,
        estado: 'Consolidado (resultados definitivos publicados por la Junta Electoral Central)',
        note: `${notaSenado} Sistema mayoritario de listas abiertas: cada elector vota hasta 3 candidatos y resultan elegidos los más votados de la circunscripción. Los votos son de la circunscripción provincial, nunca del municipio. Tabla SEPARADA del Congreso: cámara distinta, nunca se suman votos ni escaños entre ambas. El voto es a candidatos, no a listas cerradas.`,
        indicadores: [ind('elec_senado', { periodo: `${s.anio}`, availability: 'available', ambito: 'provincia', granularidad: 'provincial', dimensiones: ['camara:senado', 'candidato'] })],
        tablaExcel: 'tbl_pol_senado',
      }),
    )
  } else {
    bloques.push(
      pendingTable(
        '02_POLÍTICA',
        'elecciones-senado',
        'Elecciones generales (Senado) · voto a candidatos',
        `El Senado se elige por voto a candidatos en circunscripción provincial: NO se fuerza al esquema de candidaturas del Congreso. Fuente oficial en Infoelectoral (datos abiertos generales). ${PENDIENTE_PAYLOAD_ELECTORAL}`,
        [ind('elec_senado', { periodo: 'última convocatoria', availability: 'pending_integration', ambito: 'provincia', granularidad: 'provincial', dimensiones: ['camara:senado'] })],
        { candidataFuente: 'Infoelectoral · datos abiertos generales (Senado)', siguienteAccion: 'Modelar voto a candidatos individuales y cargar por provincia' },
      ),
    )
  }

  // Normalización de siglas
  bloques.push(
    table({
      id: 'normalizacion-siglas',
      titulo: 'Normalización de siglas entre convocatorias',
      hoja: '02_POLÍTICA',
      columnas: ['Literal de la fuente', 'Sigla normalizada', 'Criterio'],
      filas: ELECTORAL_SIGLAS_NORMALIZATION.map((n) => [label(n.literal), label(n.normalizada), label(n.criterio)]),
      fuente: 'Regla SOCideas explícita; el literal original de la fuente se conserva siempre',
      periodo: 'Todas las convocatorias',
      cobertura: 'Todas las convocatorias y ámbitos (municipal, provincial y autonómico)',
      estado: 'Disponible',
      note: 'La homologación se aplica solo a la comparación entre convocatorias; nunca se sobrescribe el literal publicado.',
      indicadores: [],
    }),
  )

  return bloques
}

// La tabla de homologación de siglas vive ahora en `socideas-electoral-provincial.ts`
// y se re-exporta desde aquí (misma fuente única, sin duplicar lógica).

// ============================================================================
// 03_ECONOMÍA_Y_EMPLEO
// ============================================================================

function buildEconomiaSheet(input: SocideasBookInputV2): BookTableV2[] {
  const perfil = input.perfilEconomia
  if (!perfil) {
    return [pendingTable('03_ECONOMÍA_Y_EMPLEO', 'economia-sin-datos', 'Economía', 'Sin datos económicos publicados para este municipio.', [ind('renta_neta_media_persona', { periodo: '—', availability: 'pending_integration' })])]
  }
  const v1 = buildEconomiaTables(perfil)
  const bloques: BookTableV2[] = []
  const valores = perfil.valores
  const municipio = input.municipio

  const ultimo = (slug: string, ambito = 'municipio'): IndicatorValue | null =>
    [...valores]
      .filter((v) => slugOf(v) === slug && isPublishableValue(slug, v.valor_numerico) && (v.dimensiones?.ambito ?? 'municipio') === ambito)
      .sort((a, b) => (a.anio_referencia ?? 0) - (b.anio_referencia ?? 0))
      .pop() ?? null

  for (const b of v1) {
    if (b.id === 'presupuesto-empleo') continue // Fuera del libro: se declara en metodología (CONPREL no publicado)
    if (b.id === 'gini' || b.id === 'p80_p20') continue // Se fusionan en `desigualdad`
    if (b.id === 'renta-adrh') {
      const serieAnios = [...new Set(
        ['renta_neta_media_persona', 'renta_neta_media_hogar', 'renta_bruta_media_hogar', 'renta_bruta_media_persona']
          .flatMap((s) => valores.filter((x) => slugOf(x) === s && isPublishableValue(s, x.valor_numerico)).map((x) => x.anio_referencia ?? 0)),
      )].filter((a) => a > 0).sort((a, b2) => a - b2)
      const filas: ExportCell[][] = [
        ['renta_neta_media_persona', 'Renta neta por persona (€)'],
        ['renta_neta_media_hogar', 'Renta neta por hogar (€)'],
        ['renta_bruta_media_hogar', 'Renta bruta por hogar (€)'],
        ['renta_bruta_media_persona', 'Renta bruta por persona (€)'],
      ].map(([slug, nombre]) => {
        const fila: ExportCell[] = [label(nombre)]
        for (const a of serieAnios) {
          const hit = valores.find((x) => slugOf(x) === slug && x.anio_referencia === a && isPublishableValue(slug, x.valor_numerico))
          fila.push(num(hit?.valor_numerico ?? null))
        }
        return fila
      }).filter((fila) => fila.slice(1).some((c) => c.numeric !== null))
      bloques.push(
        adapt(
          b,
          '03_ECONOMÍA_Y_EMPLEO',
          [
            ind('renta_neta_media_persona', { periodo: `${serieAnios[0]}–${serieAnios[serieAnios.length - 1]}`, availability: ultimo('renta_neta_media_persona') ? 'available' : 'statistical_secrecy', tableId: ultimo('renta_neta_media_persona')?.source_table_id ?? null }),
            ind('renta_neta_media_hogar', { periodo: `${serieAnios[0]}–${serieAnios[serieAnios.length - 1]}`, availability: ultimo('renta_neta_media_hogar') ? 'available' : 'statistical_secrecy' }),
            ind('renta_bruta_media_hogar', { periodo: `${serieAnios[0]}–${serieAnios[serieAnios.length - 1]}`, availability: ultimo('renta_bruta_media_hogar') ? 'available' : 'statistical_secrecy' }),
            ind('renta_bruta_media_persona', { periodo: `${serieAnios[0]}–${serieAnios[serieAnios.length - 1]}`, availability: ultimo('renta_bruta_media_persona') ? 'available' : 'statistical_secrecy' }),
          ],
          { filas, tablaExcel: 'tbl_eco_renta' },
        ),
      )
      continue
    }
    if (b.id === 'empresas') {
      const total = ultimo('empresas_total')?.valor_numerico ?? null
      const sectores: [string, string][] = [
        ['Industria', 'empresas_industria'],
        ['Construcción', 'empresas_construccion'],
        ['Comercio, transporte y hostelería', 'empresas_comercio_hosteleria'],
        ['Servicios', 'empresas_servicios'],
      ]
      const filas: ExportCell[][] = [[label('Total de empresas'), num(total), pct(total !== null ? 100 : null)]]
      let mayorSector = 0
      let sectoresCargados = 0
      for (const [nombre, slug] of sectores) {
        const v = ultimo(slug)?.valor_numerico ?? null
        if (v !== null) {
          sectoresCargados += 1
          if (v > mayorSector) mayorSector = v
        }
        filas.push([label(nombre), num(v), pct(pctRatio(v, total))])
      }
      const bloqueEmpresas = adapt(
          b,
          '03_ECONOMÍA_Y_EMPLEO',
          [
            ind('empresas_total', { periodo: b.periodo, availability: total !== null ? 'available' : 'pending_integration', tableId: '4721' }),
            ind('empresas_sector', { periodo: b.periodo, availability: sectoresCargados > 0 ? 'partial' : 'pending_integration', tableId: '4721', dimensiones: ['sector'] }),
          ],
          {
            filas,
            tablaExcel: 'tbl_eco_empresas',
            // Los sectores DIRCE cargados PUEDEN SOLAPARSE entre sí (servicios
            // incluye comercio/hostelería en la fuente): no se suman. El control
            // verifica que ningún sector supere el total.
            checks: [check('empresas-sector-le-total', 'Ningún sector cargado supera el total (sectores solapados: no se suman)', mayorSector, total, 0, 'menor_igual')],
            chart: {
              id: 'chart-eco-empresas',
              tipo: 'bar',
              titulo: 'Empresas por sector (DIRCE)',
              unidad: 'empresas',
              periodo: b.periodo,
              fuente: 'INE · DIRCE',
              categoriaColumna: 1,
              series: [{ nombre: 'Empresas', columna: 2 }],
            },
          },
        )
      bloqueEmpresas.note =
        'Empresas con sede en el municipio (DIRCE). Los sectores publicados pueden solaparse entre sí (servicios incluye comercio y hostelería): NO se suman entre sí ni equivalen al total.'
      bloques.push(bloqueEmpresas)
      continue
    }
    if (b.id === 'paro-sepe') {
      const rows = valores.filter((x) => slugOf(x) === 'paro_registrado' && (x.dimensiones?.ambito ?? 'municipio') === 'municipio')
      const estado = rows.length > 0 ? 'available' : 'pending_integration'
      bloques.push(
        adapt(b, '03_ECONOMÍA_Y_EMPLEO', [
          ind('paro_registrado', { periodo: b.periodo, availability: estado, dimensiones: ['sexo', 'tramo_edad', 'sector'] }),
        ], {
          tablaExcel: 'tbl_eco_paro',
          chart: {
            id: 'chart-eco-paro',
            tipo: 'bar',
            titulo: 'Paro registrado por concepto (SEPE)',
            unidad: 'personas',
            periodo: b.periodo,
            fuente: 'SEPE · paro registrado por municipios',
            categoriaColumna: 1,
            series: [{ nombre: 'Personas', columna: 2 }],
          },
        }),
      )
      continue
    }
    if (b.id === 'afiliacion-tgss') {
      const rows = valores.filter((x) => slugOf(x) === 'afiliacion_total' && (x.dimensiones?.ambito ?? 'municipio') === 'municipio')
      bloques.push(
        adapt(b, '03_ECONOMÍA_Y_EMPLEO', [
          ind('afiliacion_total', { periodo: b.periodo, availability: rows.length > 0 ? 'available' : 'pending_integration', dimensiones: ['regimen'] }),
        ], {
          tablaExcel: 'tbl_eco_afiliacion',
          chart: {
            id: 'chart-eco-afiliacion',
            tipo: 'bar',
            titulo: 'Afiliación por régimen (TGSS)',
            unidad: 'personas',
            periodo: b.periodo,
            fuente: 'TGSS · afiliación por municipios',
            categoriaColumna: 1,
            series: [{ nombre: 'Personas', columna: 2 }],
          },
        }),
      )
      continue
    }
    bloques.push(adapt(b, '03_ECONOMÍA_Y_EMPLEO', []))
  }

  // Desigualdad: un único bloque (Gini y P80/P20 con la misma columna de años)
  const gini = valores
    .filter((v) => slugOf(v) === 'gini' && isPublishableValue('gini', v.valor_numerico) && (v.dimensiones?.ambito ?? 'municipio') === 'municipio')
    .map((v) => ({ anio: v.anio_referencia ?? 0, valor: v.valor_numerico as number }))
    .sort((a, b) => a.anio - b.anio)
  const p80 = valores
    .filter((v) => slugOf(v) === 'p80_p20' && isPublishableValue('p80_p20', v.valor_numerico) && (v.dimensiones?.ambito ?? 'municipio') === 'municipio')
    .map((v) => ({ anio: v.anio_referencia ?? 0, valor: v.valor_numerico as number }))
    .sort((a, b) => a.anio - b.anio)
  if (gini.length > 0 || p80.length > 0) {
    const anios = [...new Set([...gini.map((g) => g.anio), ...p80.map((g) => g.anio)])].sort((a, b) => a - b)
    const filas: ExportCell[][] = anios.map((a) => [
      label(String(a), ),
      num(gini.find((g) => g.anio === a)?.valor ?? null, 1),
      num(p80.find((g) => g.anio === a)?.valor ?? null, 1),
    ])
    bloques.push(
      table({
        id: 'desigualdad',
        titulo: 'Desigualdad de renta (Gini y P80/P20)',
        hoja: '03_ECONOMÍA_Y_EMPLEO',
        columnas: ['Año', 'Gini', 'P80/P20'],
        filas,
        fuente: 'Instituto Nacional de Estadística · ADRH · indicadores de desigualdad',
        periodo: `${anios[0]}–${anios[anios.length - 1]}`,
        cobertura: `${municipio} (solo ≥100 residentes)`,
        note: 'Un único bloque con una sola columna de años: Gini y P80/P20 comparten período. ND = no difundido por la fuente.',
        indicadores: [
          ind('gini', { periodo: `${anios[0]}–${anios[anios.length - 1]}`, availability: gini.length > 0 ? 'available' : 'statistical_secrecy' }),
          ind('p80_p20', { periodo: `${anios[0]}–${anios[anios.length - 1]}`, availability: p80.length > 0 ? 'available' : 'statistical_secrecy' }),
        ],
        tablaExcel: 'tbl_eco_desigualdad',
        chart: {
          id: 'chart-eco-desigualdad',
          tipo: 'line',
          titulo: 'Evolución de la desigualdad',
          unidad: 'Índice / ratio',
          periodo: `${anios[0]}–${anios[anios.length - 1]}`,
          fuente: 'INE · ADRH',
          categoriaColumna: 1,
          series: [
            { nombre: 'Gini', columna: 2 },
            { nombre: 'P80/P20', columna: 3 },
          ],
        },
      }),
    )
  } else {
    bloques.push(
      pendingTable('03_ECONOMÍA_Y_EMPLEO', 'desigualdad', 'Desigualdad de renta (Gini y P80/P20)', 'No difundido para este municipio (<100 residentes o secreto estadístico).', [
        ind('gini', { periodo: '—', availability: 'statistical_secrecy' }),
        ind('p80_p20', { periodo: '—', availability: 'statistical_secrecy' }),
      ]),
    )
  }

  // Serie laboral opcional (payload verificado)
  if (input.laborSerie && input.laborSerie.length > 0) {
    const serie = [...input.laborSerie].sort((a, b) => a.periodo.localeCompare(b.periodo))
    bloques.push(
      table({
        id: 'empleo-serie',
        titulo: 'Paro y afiliación · serie mensual',
        hoja: '03_ECONOMÍA_Y_EMPLEO',
        columnas: ['Período', 'Paro total', 'Paro agricultura', 'Paro industria', 'Paro construcción', 'Paro servicios', 'Afiliación total', 'Afiliación autónomos'],
        filas: serie.map((p) => [
          label(p.periodo),
          num(p.paroTotal),
          num(p.paroAgricultura),
          num(p.paroIndustria),
          num(p.paroConstruccion),
          num(p.paroServicios),
          num(p.afiliacionTotal),
          num(p.afiliacionAutonomos),
        ]),
        fuente: 'SEPE · paro registrado + TGSS · afiliación (series mensuales)',
        periodo: `${serie[0].periodo}–${serie[serie.length - 1].periodo}`,
        cobertura: ctxMunicipio(input),
        note: 'Serie mensual cargada desde fuentes oficiales. ND = secreto estadístico mensual; nunca 0.',
        indicadores: [ind('labor_serie', { periodo: `${serie[0].periodo}–${serie[serie.length - 1].periodo}`, availability: 'available', dimensiones: ['periodo'] })],
        tablaExcel: 'tbl_eco_serie_laboral',
        chart: {
          id: 'chart-eco-laboral',
          tipo: 'line',
          titulo: 'Paro registrado · serie mensual',
          unidad: 'personas',
          periodo: `${serie[0].periodo}–${serie[serie.length - 1].periodo}`,
          fuente: 'SEPE',
          categoriaColumna: 1,
          series: [{ nombre: 'Paro total', columna: 2 }],
        },
      }),
    )
  }

  return bloques
}

function ctxMunicipio(input: SocideasBookInputV2): string {
  return `Municipio ${input.municipio}`
}

// ============================================================================
// 04_AGRARIO
// ============================================================================

function buildAgrarioSheet(input: SocideasBookInputV2): BookTableV2[] {
  const layers = input.ineLayers
  const ag = layers?.layers.agriculture
  const bloques: BookTableV2[] = []
  const periodo = '2020 (estructural, no anual)'

  if (!ag) {
    bloques.push(
      pendingTable('04_AGRARIO', 'agrario-sin-datos', 'Censo Agrario 2020', 'La capa agraria municipal no está publicada para este municipio.', [
        ind('agr_sau_total', { periodo, availability: 'pending_integration', tableId: '52071' }),
      ]),
    )
  } else {
    const v = (x: IneValue | undefined): number | null => (x && typeof x.value === 'number' ? x.value : null)
    const lu = ag.landUse
    if (lu) {
      const sau = v(lu.utilizedAgriculturalAreaHa)
      const arable = v(lu.arableSurfaceHa)
      const lenosos = v(lu.woodyCropsSurfaceHa)
      const pastos = v(lu.permanentPastureSurfaceHa)
      const componentes = [arable, lenosos, pastos].filter((x): x is number => x !== null)
      const suma = componentes.length > 0 ? componentes.reduce((a, b) => a + b, 0) : null
      bloques.push(
        table({
          id: 'agrario-usos',
          titulo: 'Usos del suelo agrario — Censo Agrario 2020',
          hoja: '04_AGRARIO',
          columnas: ['Concepto', 'Superficie (ha)', 'Explotaciones'],
          filas: [
            [label('SAU total'), num(sau, 2), label('—')],
            [label('Tierra arable'), num(arable, 2), num(v(lu.arableHoldings))],
            [label('Cultivos leñosos'), num(lenosos, 2), num(v(lu.woodyCropsHoldings))],
            [label('Pastos permanentes'), num(pastos, 2), num(v(lu.permanentPastureHoldings))],
            [label('Huertos'), label('—'), num(v(lu.kitchenGardens))],
          ],
          fuente: 'Instituto Nacional de Estadística · Censo Agrario 2020 · tabla 52071',
          periodo,
          cobertura: ctxMunicipio(input),
          note: 'Suma de componentes (arable + leñosos + pastos) reconciliada con la SAU; tolerancia declarada por redondeo de la fuente.',
          indicadores: [
            ind('agr_sau_total', { periodo, availability: sau !== null ? 'available' : 'statistical_secrecy', tableId: '52071' }),
            ind('agr_usos', { periodo, availability: componentes.length > 0 ? 'available' : 'statistical_secrecy', tableId: '52071', dimensiones: ['uso'] }),
            ind('agr_explotaciones', { periodo, availability: v(lu.utilizedAgriculturalAreaHa) !== null ? 'available' : 'statistical_secrecy', tableId: '52071' }),
          ],
          tablaExcel: 'tbl_agr_usos',
          checks: [
            check('agr-usos-sau', 'Arable + leñosos + pastos ≈ SAU', suma, sau, Math.max(1, Math.round((sau ?? 0) * 0.02))),
          ],
          chart: {
            id: 'chart-agr-usos',
            tipo: 'column',
            titulo: 'Usos del suelo agrario (ha)',
            unidad: 'hectáreas',
            periodo: '2020',
            fuente: 'INE · Censo Agrario 2020',
            categoriaColumna: 1,
            series: [{ nombre: 'Superficie (ha)', columna: 2 }],
          },
        }),
      )
    }

    const ls = ag.livestock
    if (ls) {
      const especiesRaw: [string, IneValue | undefined, IneValue | undefined][] = [
        ['Bovino', ls.bovineHoldings, ls.bovineHeads],
        ['Ovino y caprino', ls.sheepGoatHoldings, ls.sheepGoatHeads],
        ['Porcino', ls.pigHoldings, ls.pigHeads],
        ['Aves de corral', ls.poultryHoldings, ls.poultryHeads],
      ]
      const especies = especiesRaw.filter(([, e, c]) => v(e) !== null || v(c) !== null)
      if (especies.length > 0) {
        bloques.push(
          table({
            id: 'agrario-ganaderia',
            titulo: 'Ganadería — Censo Agrario 2020',
            hoja: '04_AGRARIO',
            columnas: ['Especie', 'Explotaciones', 'Cabezas'],
            filas: especies.map(([n, e, c]) => [label(n), num(v(e)), num(v(c))]),
            fuente: 'Instituto Nacional de Estadística · Censo Agrario 2020 · tabla 52076',
            periodo,
            cobertura: ctxMunicipio(input),
            note: 'Explotaciones y cabezas son magnitudes distintas: nunca se suman entre sí.',
            indicadores: [ind('ganaderia', { periodo, availability: 'available', tableId: '52076', dimensiones: ['especie'] })],
            tablaExcel: 'tbl_agr_ganaderia',
          }),
        )
      }
    }

    const fh = ag.farmHolders
    if (fh) {
      const total = v(fh.total)
      const h = v(fh.male)
      const m = v(fh.female)
      bloques.push(
        table({
          id: 'agrario-responsables',
          titulo: 'Responsables de explotación — Censo Agrario 2020',
          hoja: '04_AGRARIO',
          columnas: ['Concepto', 'Personas', '% sobre total'],
          filas: [
            [label('Responsables (total)'), num(total), pct(total !== null ? 100 : null)],
            [label('Hombres'), num(h), pctFromFormula('B{R1+1}/$B${R1}*100', h, total)],
            [label('Mujeres'), num(m), pctFromFormula('B{R1+2}/$B${R1}*100', m, total)],
            [label('Edad media'), num(v(fh.meanAge), 1), label('años')],
          ],
          fuente: 'Instituto Nacional de Estadística · Censo Agrario 2020 · tabla 52081',
          periodo,
          cobertura: ctxMunicipio(input),
          note: 'Titularidad por sexo y edad media publicadas por el Censo Agrario 2020. El relevo generacional solo se declara si la fuente lo permite.',
          indicadores: [ind('agr_responsables', { periodo, availability: total !== null ? 'available' : 'statistical_secrecy', tableId: '52081', dimensiones: ['sexo'] })],
          tablaExcel: 'tbl_agr_responsables',
          checks: [check('agr-responsables-sexo', 'Hombres + mujeres = total de responsables', (h ?? 0) + (m ?? 0), total, 1)],
        }),
      )
    }

    const tr = ag.agriculturalTraining
    if (tr) {
      const catsRaw: [string, IneValue | undefined][] = [
        ['Experiencia agraria exclusivamente', tr.experienceOnly],
        ['Cursos de formación agraria', tr.courses],
        ['Formación profesional agraria', tr.agriculturalVocational],
        ['Estudios universitarios/superiores agrarios', tr.universityAgricultural],
      ]
      const cats = catsRaw.filter(([, x]) => v(x) !== null)
      if (cats.length > 0) {
        const sumaTr = cats.reduce((a, [, x]) => a + (v(x) ?? 0), 0)
        const totalResp = v(ag.farmHolders?.total)
        bloques.push(
          table({
            id: 'agrario-formacion',
            titulo: 'Formación agraria del responsable — Censo Agrario 2020',
            hoja: '04_AGRARIO',
            columnas: ['Formación', 'Personas', '% sobre responsables'],
            filas: cats.map(([n, x]) => [
              label(n),
              num(v(x)),
              pct(pctRatio(v(x), totalResp)),
            ]),
            fuente: 'Instituto Nacional de Estadística · Censo Agrario 2020 · tabla 52082',
            periodo,
            cobertura: ctxMunicipio(input),
            note: 'Suma de categorías reconciliada con responsables totales (tolerancia declarada).',
            indicadores: [ind('agr_formacion', { periodo, availability: 'available', tableId: '52082', dimensiones: ['formacion'] })],
            tablaExcel: 'tbl_agr_formacion',
            checks: [check('agr-formacion-total', 'Suma de categorías ≈ responsables totales', sumaTr, totalResp, Math.max(1, Math.round((totalResp ?? 0) * 0.05)))],
          }),
        )
      }
    }
  }

  // Cultivos concretos (payload verificado o estado estructurado)
  if (input.cultivos && input.cultivos.cultivos.length > 0) {
    const cultivos = [...input.cultivos.cultivos].sort((a, b) => (b.superficieHa ?? -1) - (a.superficieHa ?? -1))
    bloques.push(
      table({
        id: 'agrario-cultivos',
        titulo: 'Superficie por cultivo',
        hoja: '04_AGRARIO',
        columnas: ['Cultivo', 'Superficie (ha)'],
        filas: cultivos.map((c) => [label(c.nombre), num(c.superficieHa, 2)]),
        fuente: input.cultivos.fuenteLabel,
        periodo: input.cultivos.periodo,
        cobertura: ctxMunicipio(input),
        note: 'Superficies por cultivo publicadas por la fuente oficial para el municipio.',
        indicadores: [ind('agr_cultivos', { periodo: input.cultivos.periodo, availability: 'available', dimensiones: ['cultivo'] })],
        tablaExcel: 'tbl_agr_cultivos',
        chart: {
          id: 'chart-agr-cultivos',
          tipo: 'bar',
          titulo: 'Superficie por cultivo (ha)',
          unidad: 'hectáreas',
          periodo: input.cultivos.periodo,
          fuente: input.cultivos.fuenteLabel,
          categoriaColumna: 1,
          series: [{ nombre: 'Superficie (ha)', columna: 2 }],
        },
      }),
    )
  } else {
    bloques.push(
      pendingTable(
        '04_AGRARIO',
        'agrario-cultivos',
        'Superficie por cultivo',
        'El detalle municipal de cultivos concretos del Censo Agrario 2020 no está incorporado al pipeline (sí lo están usos, ganadería, responsables y formación).',
        [ind('agr_cultivos', { periodo, availability: 'pending_integration', tableId: null, dimensiones: ['cultivo'] })],
        { candidataFuente: 'INE · Censo Agrario 2020, resultados municipales por tipo de cultivo', siguienteAccion: 'Verificar tabla municipal de cultivos y cargarla en la capa agraria' },
      ),
    )
  }

  return bloques
}

// ============================================================================
// 05_SOCIAL_EDUCACIÓN_SERVICIOS
// ============================================================================

function buildServiciosSheet(input: SocideasBookInputV2): BookTableV2[] {
  const bloques: BookTableV2[] = []
  const edu = input.ineLayers?.layers.education

  if (edu?.total) {
    const d = edu.total
    const v = (x: IneValue | undefined): number | null => (x && typeof x.value === 'number' ? x.value : null)
    const dBy = edu.bySex
    const periodo = edu.period
    const filas: ExportCell[][] = [
      [label('Educación primaria e inferior'), num(v(d.primaryOrBelow)), num(v(dBy?.male.primaryOrBelow)), num(v(dBy?.female.primaryOrBelow))],
      [label('Primera etapa de secundaria y similar'), num(v(d.lowerSecondary)), num(v(dBy?.male.lowerSecondary)), num(v(dBy?.female.lowerSecondary))],
      [label('Segunda etapa de secundaria y postsecundaria'), num(v(d.upperSecondaryPostSecondary)), num(v(dBy?.male.upperSecondaryPostSecondary)), num(v(dBy?.female.upperSecondaryPostSecondary))],
      [label('Educación superior'), num(v(d.higher)), num(v(dBy?.male.higher)), num(v(dBy?.female.higher))],
      [label('No aplicable: menor de 15 años'), num(v(d.notApplicableUnder15)), num(v(dBy?.male.notApplicableUnder15)), num(v(dBy?.female.notApplicableUnder15))],
    ].filter((f) => f.some((c) => c.numeric !== null))
    if (filas.length > 0) {
      bloques.push(
        table({
          id: 'nivel-educativo',
          titulo: 'Nivel educativo — Censo 2021',
          hoja: '05_SOCIAL_EDUCACIÓN_SERVICIOS',
          columnas: ['Nivel educativo', 'Total', 'Hombres', 'Mujeres'],
          filas,
          fuente: 'Instituto Nacional de Estadística · Censo de Población y Viviendas 2021 · tabla 55249',
          periodo,
          cobertura: ctxMunicipio(input),
          note: 'Censo decenal: no se presenta como serie anual. Desagregación por sexo publicada por el INE.',
          indicadores: [ind('nivel_educativo', { periodo, availability: 'available', tableId: '55249', dimensiones: ['sexo', 'nivel'] })],
          tablaExcel: 'tbl_soc_educacion',
        }),
      )
    }
  }

  // Centros docentes: payload verificado o estado estructurado con operación candidata
  bloques.push(
    pendingTable(
      '05_SOCIAL_EDUCACIÓN_SERVICIOS',
      'centros-docentes',
      'Centros educativos, FP y enseñanzas',
      'El Registro Estatal de Centros Docentes ofrece búsqueda oficial por municipio (titularidad, enseñanzas y FP), sin descarga nacional masiva configurada.',
      [ind('centros_docentes', { periodo: 'curso actual', availability: 'pending_integration' })],
      { candidataFuente: 'Registro Estatal de Centros Docentes No Universitarios (Ministerio de Educación)', siguienteAccion: 'Automatizar consulta oficial por municipio y publicar centro, titularidad, enseñanzas y URL' },
    ),
  )

  // Servicios municipales
  if (input.servicios && input.servicios.items.length > 0) {
    bloques.push(
      table({
        id: 'servicios-municipales',
        titulo: 'Servicios municipales y equipamientos',
        hoja: '05_SOCIAL_EDUCACIÓN_SERVICIOS',
        columnas: ['Servicio', 'Estado', 'Ámbito', 'Distancia (km)', 'Fuente', 'Fecha consulta'],
        filas: input.servicios.items.map((s) => [
          label(s.servicio),
          label(s.estado === 'presente' ? 'Presente en el municipio' : s.estado === 'cercano' ? 'Fuera del municipio (cercano)' : s.estado === 'ausente' ? 'No existe en el municipio' : 'No verificable'),
          label(s.ambito),
          num(s.distanciaKm, 1),
          label(s.fuente),
          label(s.fechaConsulta),
        ]),
        fuente: input.servicios.fuenteLabel,
        periodo: 'Consulta puntual con fecha por Ítem',
        cobertura: ctxMunicipio(input),
        note: 'Cada Ítem distingue "no existe" de "no verificable" y documenta fuente y fecha. La distancia se expresa en km.',
        indicadores: [ind('servicios_municipales', { periodo: 'consulta', availability: 'available', dimensiones: ['servicio'] })],
        tablaExcel: 'tbl_soc_servicios',
      }),
    )
  } else {
    bloques.push(
      pendingTable(
        '05_SOCIAL_EDUCACIÓN_SERVICIOS',
        'servicios-municipales',
        'Servicios municipales y equipamientos',
        'Sin inventario oficial homogéneo incorporado. Se exige evidencia por Ítem (fuente, fecha, ámbito y distancia) para publicar.',
        [ind('servicios_municipales', { periodo: '—', availability: 'pending_integration' })],
        { candidataFuente: 'Catálogos oficiales de servicios y equipamientos municipales/autonómicos', siguienteAccion: 'Definir checklist verificable con fuente y fecha por Ítem; distinguir ausente de no verificable' },
      ),
    )
  }

  bloques.push(
    pendingTable(
      '05_SOCIAL_EDUCACIÓN_SERVICIOS',
      'sanidad',
      'Recursos sanitarios',
      'REGCESS permite consultar centros, servicios y establecimientos sanitarios por municipio y titularidad, sin descarga masiva configurada.',
      [ind('sanidad', { periodo: '—', availability: 'pending_integration' })],
      { candidataFuente: 'REGCESS (Ministerio de Sanidad)', siguienteAccion: 'Consulta oficial por municipio; farmacia y atención social como bloques separados' },
    ),
  )

  return bloques
}

// ============================================================================
// 06_VIVIENDA_Y_HOGARES
// ============================================================================

function buildViviendaSheet(input: SocideasBookInputV2): BookTableV2[] {
  if (input.vivienda) {
    const v = input.vivienda
    const vaciasPct = pctRatio(v.vacias, v.total)
    return [
      table({
        id: 'vivienda-uso',
        titulo: 'Vivienda y hogares',
        hoja: '06_VIVIENDA_Y_HOGARES',
        columnas: ['Indicador', 'Valor', 'Unidad', '%'],
        filas: [
          [label('Viviendas totales'), num(v.total), label('viviendas'), pct(v.total !== null ? 100 : null)],
          [label('Viviendas principales'), num(v.principales), label('viviendas'), pct(pctRatio(v.principales, v.total))],
          [label('Viviendas no principales'), num(v.noPrincipales), label('viviendas'), pct(pctRatio(v.noPrincipales, v.total))],
          [label('Viviendas vacías'), num(v.vacias), label('viviendas'), pct(vaciasPct)],
          [label('Viviendas secundarias'), num(v.secundarias), label('viviendas'), pct(pctRatio(v.secundarias, v.total))],
          [label('Hogares totales'), num(v.hogaresTotales), label('hogares'), label('—')],
          [label('Hogares unipersonales'), num(v.hogaresUnipersonales), label('hogares'), pct(pctRatio(v.hogaresUnipersonales, v.hogaresTotales))],
          [label('Superficie útil media'), num(v.superficieMediaM2, 1), label('m²'), label('—')],
          [label('Antigüedad media'), num(v.antiguedadMedia, 1), label('años'), label('—')],
        ],
        fuente: v.fuenteLabel,
        periodo: v.periodo,
        cobertura: ctxMunicipio(input),
        note: 'Vivienda convencional ≠ hogar ≠ inmueble catastral: cada magnitud conserva su definición.',
        indicadores: [
          ind('vivienda_censo', { periodo: v.periodo, availability: 'available', tableId: v.tableId ?? null, dimensiones: ['uso', 'tamano', 'tenencia'] }),
        ],
        tablaExcel: 'tbl_viv_uso',
        chart: {
          id: 'chart-viv-uso',
          tipo: 'pie',
          titulo: 'Uso de la vivienda',
          unidad: 'viviendas',
          periodo: v.periodo,
          fuente: v.fuenteLabel,
          categoriaColumna: 1,
          series: [{ nombre: 'Viviendas', columna: 2 }],
        },
        checks: [
          check('vivienda-principal-no-principal', 'Principales + no principales = total', (v.principales ?? 0) + (v.noPrincipales ?? 0), v.total, 1),
        ],
      }),
    ]
  }
  return [
    pendingTable(
      '06_VIVIENDA_Y_HOGARES',
      'vivienda-censo',
      'Vivienda y hogares · Censo 2021',
      'El Censo 2021 publica uso (principal/no principal/vacía), tamaño del hogar, tenencia y superficies a nivel municipal. No está incorporado al pipeline.',
      [ind('vivienda_censo', { periodo: '2021', availability: 'pending_integration', dimensiones: ['uso', 'tamano', 'tenencia'] })],
      { candidataFuente: 'INE · Censo de Población y Viviendas 2021 (tablas municipales de vivienda y hogares)', siguienteAccion: 'Cargar tablas municipales de vivienda/hogares y publicar el bloque con definiciones separadas' },
    ),
    pendingTable(
      '06_VIVIENDA_Y_HOGARES',
      'vivienda-catastro',
      'Catastro inmobiliario municipal',
      'La Dirección General del Catastro publica estadísticas municipales anuales (urbana, rústica, parcelas, vivienda, antigüedad, reformas e IBI) en formato reutilizable.',
      [ind('vivienda_catastro', { periodo: 'anual', availability: 'pending_integration' })],
      { candidataFuente: 'Dirección General del Catastro · estadísticas municipales', siguienteAccion: 'Verificar licencia y cargar la serie municipal; separar inmueble catastral de vivienda convencional' },
    ),
  ]
}

// ============================================================================
// 07/08/09 · Áreas con capacidad territorial (sin placeholder decorativo)
// ============================================================================

interface CapacidadFila {
  /** Slug de la biblioteca de indicadores (nunca derivado del texto visible). */
  slug: string
  indicador: string
  estado: BookState
  fuenteCandidata: string
  motivo: string
  siguiente: string
  dimensiones?: string[]
}

function buildCapacidadSheet(
  input: SocideasBookInputV2,
  hoja: BookSheetId,
  filas: CapacidadFila[],
  titulo: string,
  nota: string,
): BookTableV2[] {
  return [
    table({
      id: `${hoja.replace(/^\d+_/, '').toLowerCase()}-capacidad`,
      titulo,
      hoja,
      columnas: ['Indicador', 'Estado', 'Fuente candidata', 'Motivo del bloqueo', 'Siguiente acción'],
      filas: filas.map((f) => [
        label(f.indicador),
        label(availabilityV1(f.estado).estadoTexto),
        label(f.fuenteCandidata),
        label(f.motivo),
        label(f.siguiente),
      ]),
      fuente: 'SOCideas · registro de capacidades por área',
      periodo: '—',
      cobertura: ctxMunicipio(input),
      estado: 'Área declarada con capacidad y siguiente acción: no computa como cubierta',
      note: nota,
      indicadores: filas.map((f) =>
        ind(f.slug, {
          periodo: '—',
          availability: f.estado,
          dimensiones: f.dimensiones ?? [],
        }),
      ),
      tablaExcel: undefined,
    }),
  ]
}

function buildPatrimonioSheet(input: SocideasBookInputV2): BookTableV2[] {
  const bloques: BookTableV2[] = []

  // v2.3 · Wikipedia/Wikidata: resumen editorial + bienes patrimoniales.
  // Atribución CC BY-SA obligatoria y visible cuando hay contenido.
  const wiki = input.wikipedia
  if (wiki && wiki.status !== 'error') {
    if (wiki.wikipedia) {
      bloques.push(
        table({
          id: 'patrimonio-wikipedia',
          titulo: 'Resumen del municipio (Wikipedia)',
          hoja: '07_PATRIMONIO_TURISMO',
          columnas: ['Campo', 'Valor'],
          filas: [
            [label('Artículo'), label(wiki.wikipedia.title)],
            [label('URL'), label(wiki.wikipedia.url)],
            [label('Resumen'), label(wiki.wikipedia.summary.slice(0, 1000))],
            [label('Web oficial (Wikidata P856)'), label(wiki.wikidata?.officialWebsite ?? 'ND')],
            [
              label('Coordenadas'),
              label(
                wiki.wikidata?.coordinates
                  ? `${wiki.wikidata.coordinates.lat.toFixed(5)}, ${wiki.wikidata.coordinates.lon.toFixed(5)}`
                  : 'ND',
              ),
            ],
            [label('Fundación (P571)'), label(wiki.wikidata?.founded ?? 'ND')],
            [
              label('Atribución'),
              label(
                `Texto extraído de Wikipedia, La enciclopedia libre. Artículo: ${wiki.wikipedia.title}. ` +
                  `Licencia CC BY-SA 4.0. Consultado el ${wiki.retrievedAt.slice(0, 10)}.`,
              ),
            ],
            [
              label('Aviso'),
              label('Este contenido puede no estar actualizado. Consultar Wikipedia para la versión más reciente.'),
            ],
          ],
          fuente: 'Wikipedia, La enciclopedia libre · Wikidata',
          periodo: `Consulta ${wiki.retrievedAt.slice(0, 10)}`,
          cobertura: ctxMunicipio(input),
          estado: 'Consulta externa con atribución',
          note:
            'Reutilización con atribución obligatoria bajo licencia CC BY-SA 4.0. Solo se muestran imágenes con licencia libre verificada (CC0, CC BY o dominio público).',
          indicadores: [ind('patrimonio_bienes', { periodo: wiki.retrievedAt.slice(0, 4), availability: 'available', dimensiones: ['wikipedia'] })],
          tablaExcel: 'tbl_pat_wikipedia',
        }),
      )
    }
    if (wiki.heritageSites.length > 0) {
      bloques.push(
        table({
          id: 'patrimonio-bienes-wikidata',
          titulo: 'Bienes patrimoniales (Wikidata)',
          hoja: '07_PATRIMONIO_TURISMO',
          columnas: ['Bien', 'QID', 'Categoría patrimonial', 'Imagen', 'Enlace'],
          filas: wiki.heritageSites.map((h) => [
            label(h.title),
            label(h.qid),
            label(h.heritageType),
            label(h.image ? 'SÍ (licencia libre verificada)' : 'No publicada'),
            label(h.url),
          ]),
          fuente: 'Wikidata (consulta SPARQL por municipio)',
          periodo: `Consulta ${wiki.retrievedAt.slice(0, 10)}`,
          cobertura: ctxMunicipio(input),
          note:
            'Elementos con designación patrimonial (P1435) ubicados en el municipio (P131). Sin imagen cuando la licencia no se pudo verificar.',
          indicadores: [ind('patrimonio_bienes', { periodo: wiki.retrievedAt.slice(0, 4), availability: 'available', dimensiones: ['bic', 'wikidata'] })],
          tablaExcel: 'tbl_pat_bienes',
        }),
      )
    }
  }

  // v2.3 · Grupo de Acción Local (LEADER/FEADER): contexto rural.
  const gal = input.gal
  if (gal) {
    bloques.push(
      table({
        id: 'contexto-rural-gal',
        titulo: 'Contexto rural — Grupo de Acción Local (GAL)',
        hoja: '07_PATRIMONIO_TURISMO',
        columnas: ['Campo', 'Valor'],
        filas:
          gal.estado === 'pertenece' && gal.gal
            ? [
                [label('GAL'), label(gal.gal.nombre)],
                [label('Código'), label(gal.gal.codigo ?? 'ND')],
                [label('Ámbito territorial'), label(gal.gal.ambito ?? 'ND')],
                [label('Período de programación'), label(gal.gal.periodo ?? 'ND')],
                [label('Web oficial'), label(gal.gal.web ?? 'ND')],
                [label('Correo electrónico'), label(gal.gal.email ?? 'ND')],
                [label('Teléfono'), label(gal.gal.telefono ?? 'ND')],
                [label('Fuente'), label(gal.gal.fuenteUrl)],
                [label('Fecha de descarga'), label(gal.gal.fuenteFecha)],
                [label('Aviso de verificación'), label(gal.gal.aviso)],
              ]
            : [
                [
                  label('Estado'),
                  label(
                    gal.estado === 'sin_gal'
                      ? 'Este municipio no está incluido en el ámbito de ningún GAL con datos publicados.'
                      : 'Sin datos publicados de GAL para este municipio.',
                  ),
                ],
              ],
        fuente: gal.gal?.fuenteUrl ?? 'Red PAC España / datos.gob.es · sin fuente estructurada para este municipio',
        periodo: gal.gal?.periodo ?? '—',
        cobertura: ctxMunicipio(input),
        estado: gal.estado === 'pertenece' ? 'Disponible (verificar vigencia)' : 'Sin datos para este municipio',
        note:
          'Verificar en la web del GAL la vigencia de la información y los municipios incluidos en el ámbito territorial actual.',
        indicadores: [],
        tablaExcel: 'tbl_pat_gal',
      }),
    )
  }

  if (input.patrimonio && input.patrimonio.items.length > 0) {
    bloques.push(
      table({
        id: 'patrimonio-inventario',
        titulo: 'Patrimonio cultural inventariado',
        hoja: '07_PATRIMONIO_TURISMO',
        columnas: ['Bien', 'Categoría', 'Protección', 'Identificador', 'Fuente', 'Fecha consulta'],
        filas: input.patrimonio.items.map((p) => [
          label(p.nombre),
          label(p.categoria),
          label(p.proteccion),
          label(p.identificador),
          label(p.fuente),
          label(p.fechaConsulta),
        ]),
        fuente: input.patrimonio.fuenteLabel,
        periodo: 'consulta puntual',
        cobertura: ctxMunicipio(input),
        note: 'Cada bien conserva identificador oficial, categoría y protección. Sin datos personales.',
        indicadores: [ind('patrimonio_bienes', { periodo: 'consulta', availability: 'available', dimensiones: ['bien'] })],
        tablaExcel: 'tbl_pat_inventario',
      }),
    )
  }

  if (bloques.length > 0) return bloques

  return buildCapacidadSheet(
    input,
    '07_PATRIMONIO_TURISMO',
    [
      { slug: 'patrimonio_bienes', indicador: 'Bienes culturales protegidos', estado: 'pending_integration', fuenteCandidata: 'Registros de BIC e inventarios autonómicos (Ministerio de Cultura y CCAA)', motivo: 'No existe agregado nacional homogéneo reutilizable; cada CCAA publica su inventario con categorías propias.', siguiente: 'Adaptadores por CCAA detrás de capacidad territorial, con identificador y protección oficiales', dimensiones: ['bic'] },
      { slug: 'patrimonio_bienes', indicador: 'Museos y colecciones', estado: 'pending_integration', fuenteCandidata: 'Directorio oficial de museos (Ministerio de Cultura)', motivo: 'Directorio con consulta manual; sin descarga estructurada configurada.', siguiente: 'Verificar descarga oficial o consulta por municipio y publicar con fecha', dimensiones: ['museo'] },
      { slug: 'turismo_alojamientos', indicador: 'Alojamientos y plazas turísticas', estado: 'pending_integration', fuenteCandidata: 'Registros de establecimientos turísticos por CCAA', motivo: 'Categorías no homologadas entre comunidades; no comparable entre CCAA.', siguiente: 'Cargar por CCAA con estado de capacidad y evitar comparaciones inter-autonómicas', dimensiones: ['alojamiento'] },
      { slug: 'turismo_alojamientos', indicador: 'Rutas y recursos turísticos', estado: 'blocked_source', fuenteCandidata: 'Portales oficiales de turismo (nacional y autonómico)', motivo: 'Contenido editorial sin conjunto de datos descargable verificable.', siguiente: 'Mantener fuera del libro hasta disponer de fuente estructurada con licencia', dimensiones: ['rutas'] },
    ],
    'Patrimonio y turismo · capacidades',
    'Sin fuente nacional homogénea: se publican las capacidades por territorio en lugar de una hoja vacía. Nada de scraping masivo no autorizado.',
  )
}

function buildInfraestructuraSheet(input: SocideasBookInputV2): BookTableV2[] {
  return buildCapacidadSheet(
    input,
    '08_INFRAESTRUCTURA_RECURSOS',
    [
      { slug: 'infra_transporte', indicador: 'Transporte y accesibilidad', estado: 'pending_integration', fuenteCandidata: 'IGN · red viaria y ferroviaria oficial + cálculo geoespacial SOCideas', motivo: 'Requiere cálculo geoespacial con CRS y método documentados (no es una descarga directa).', siguiente: 'Calcular distancia/tiempo a servicios supramunicipales documentando CRS, fecha y método', dimensiones: ['transporte'] },
      { slug: 'infra_transporte', indicador: 'Conectividad digital', estado: 'pending_integration', fuenteCandidata: 'Secretaría de Estado de Telecomunicaciones (cobertura por municipio)', motivo: 'Fuente oficial identificada; pendiente de verificar formato de descarga.', siguiente: 'Verificar licencia y formato, y publicar cobertura por tecnología', dimensiones: ['conectividad'] },
      { slug: 'infra_agua_residuos', indicador: 'Agua y saneamiento', estado: 'pending_integration', fuenteCandidata: 'Confederaciones hidrográficas y administraciones locales', motivo: 'Competencia y titularidad variables por territorio; no hay agregado municipal homogéneo.', siguiente: 'Adaptador por cuenca/CCAA con estado de capacidad territorial', dimensiones: ['agua'] },
      { slug: 'infra_agua_residuos', indicador: 'Residuos y economía circular', estado: 'pending_integration', fuenteCandidata: 'Planes y memorias oficiales de residuos (CCAA y mancomunidades)', motivo: 'Datos de gestión en memorias no estructuradas.', siguiente: 'Extraer toneladas y recogida separada donde exista tabla oficial', dimensiones: ['residuos'] },
      { slug: 'infra_agua_residuos', indicador: 'Energía y recursos ambientales', estado: 'blocked_source', fuenteCandidata: 'Registros de instalaciones de generación (CCAA y operador del sistema)', motivo: 'Sin descarga municipal homogénea verificada en esta misión.', siguiente: 'Evaluar registro autonómico con licencia reutilizable', dimensiones: ['energia'] },
    ],
    'Infraestructura y recursos · capacidades',
    'Toda métrica geoespacial futura debe documentar CRS, fecha y método. Separación estricta entre dato estadístico y cálculo SOCideas.',
  )
}

function buildAsociacionesSheet(input: SocideasBookInputV2): BookTableV2[] {
  const bloques: BookTableV2[] = []
  const asoc = input.asociaciones

  if (asoc) {
    // Resumen + aviso de verificación (SIEMPRE visible, celda combinada wrap).
    bloques.push(
      table({
        id: 'asociaciones-resumen',
        titulo: '07 Asociaciones · resumen y aviso de verificación',
        hoja: '09_ASOCIACIONES_GOBERNANZA',
        columnas: ['Campo', 'Valor'],
        filas: [
          [label('Total de asociaciones'), num(asoc.total)],
          [
            label('Estado'),
            label(asoc.estado === 'con_datos' ? 'Datos publicados por el registro autonómico' : 'Sin datos publicados para este municipio'),
          ],
          [label('Fuente'), label(asoc.fuenteUrl ?? '—')],
          [label('Fecha de descarga'), label(asoc.fuenteFecha ?? '—')],
          [label('Aviso de verificación'), label(asoc.aviso)],
          ...(asoc.buscadorCcaa
            ? [[label('Buscador autonómico'), label(`${asoc.buscadorCcaa.nombre}: ${asoc.buscadorCcaa.url}`)]]
            : []),
        ],
        fuente: asoc.fuenteUrl ?? 'Registros autonómicos de asociaciones',
        periodo: asoc.fuenteFecha ?? '—',
        cobertura: ctxMunicipio(input),
        estado: asoc.estado === 'con_datos' ? 'Disponible (datos de registro, verificar antes de uso oficial)' : 'Sin datos para este municipio',
        note: asoc.aviso,
        indicadores: [],
        tablaExcel: 'tbl_asoc_resumen',
      }),
    )

    if (asoc.porTipo.length > 0) {
      bloques.push(
        table({
          id: 'asociaciones-por-tipo',
          titulo: '07 Asociaciones · distribución por tipo',
          hoja: '09_ASOCIACIONES_GOBERNANZA',
          columnas: ['Tipo', 'Total'],
          filas: asoc.porTipo.map((t) => [label(t.tipo), num(t.total)]),
          fuente: asoc.fuenteUrl ?? 'Registros autonómicos de asociaciones',
          periodo: asoc.fuenteFecha ?? '—',
          cobertura: ctxMunicipio(input),
          note: 'Recuento sobre las filas con nombre publicado; nunca se imputan tipos.',
          indicadores: [],
          tablaExcel: 'tbl_asoc_tipo',
        }),
      )
    }

    if (asoc.items.length > 0) {
      bloques.push(
        table({
          id: 'asociaciones-listado',
          titulo: '07 Asociaciones · listado',
          hoja: '09_ASOCIACIONES_GOBERNANZA',
          columnas: ['Nombre', 'Tipo', 'Estado', 'Fecha de inscripción'],
          filas: asoc.items.map((i) => [
            label(i.nombre),
            label(i.tipo ?? '—'),
            label(i.estado ?? '—'),
            label(i.fecha_inscripcion ?? '—'),
          ]),
          fuente: asoc.fuenteUrl ?? 'Registros autonómicos de asociaciones',
          periodo: asoc.fuenteFecha ?? '—',
          cobertura: ctxMunicipio(input),
          note: `${asoc.aviso} Solo se publican datos de entidades, nunca datos personales.`,
          indicadores: [],
          tablaExcel: 'tbl_asoc_listado',
        }),
      )
    }
  }

  if (bloques.length > 0) return bloques

  return buildCapacidadSheet(
    input,
    '09_ASOCIACIONES_GOBERNANZA',
    [
      { slug: 'asociaciones_registro', indicador: 'Registro asociativo', estado: 'pending_integration', fuenteCandidata: 'Registro Nacional de Asociaciones y registros autonómicos', motivo: 'Cobertura y licencia no homogéneas; riesgo de datos personales si no se filtra.', siguiente: 'Publicar solo entidades con fines y sede municipal, sin datos personales innecesarios', dimensiones: ['asociaciones'] },
      { slug: 'gobernanza_supramunicipal', indicador: 'Mancomunidades y entidades supramunicipales', estado: 'pending_integration', fuenteCandidata: 'Registro de Entidades Locales (Ministerio de Hacienda y CCAA)', motivo: 'Fuente oficial identificada; sin carga al pipeline.', siguiente: 'Incorporar entidad, figura jurídica, municipios y competencias', dimensiones: ['mancomunidad'] },
      { slug: 'gobernanza_supramunicipal', indicador: 'Sector público institucional local', estado: 'pending_integration', fuenteCandidata: 'Registros de entes dependientes y sociedades locales', motivo: 'Dispersión de fuentes por administración.', siguiente: 'Definir alcance mínimo verificable (organismos autónomos y sociedades)', dimensiones: ['sector_publico_local'] },
    ],
    'Asociaciones y gobernanza · capacidades',
    'Privacidad por diseño: nunca se publican datos personales innecesarios. Sin cobertura homogénea se registra capacidad por territorio, no una pestaña vacía universal.',
  )
}

// ============================================================================
// 10_METODOLOGÍA_FUENTES
// ============================================================================

function buildMetodologiaSheet(input: SocideasBookInputV2, indicadores: BookIndicator[], checks: BookReconciliation[]): BookTableV2[] {
  const diccionario = indicadores.map((i) => [
    label(i.area),
    label(i.slug),
    label(i.nombre),
    label(i.unidad),
    label(availabilityV1(i.availability).estadoTexto),
    label(i.periodo),
    label(i.organismo),
    label(i.operacion),
    label(i.table_id ?? '—'),
    label(i.license),
    label(i.formula ?? i.metodo ?? (i.es_derivado ? 'Derivado SOCideas declarado' : 'Publicado por la fuente')),
    label(`${i.ambito} · ${i.granularidad} · ${i.capability}`),
    label(i.comparabilidad),
  ])
  const estados = BOOK_STATE_GLOSSARY_ROWS()
  const avisos = checks.map((c) => [
    label(c.id),
    label(c.descripcion),
    c.izquierda === null ? label(ND_TEXT) : num(c.izquierda, 2),
    c.derecha === null ? label(ND_TEXT) : num(c.derecha, 2),
    label(c.ok ? 'OK' : 'REVISAR'),
    label(`tolerancia ${c.tolerancia}`),
  ])
  const fuentes = FUENTES_ROWS()

  const bloques: BookTableV2[] = [
    table({
      id: 'diccionario-indicadores',
      titulo: 'Diccionario de indicadores',
      hoja: '10_METODOLOGÍA_FUENTES',
      columnas: ['Área', 'Slug', 'Indicador', 'Unidad', 'Estado', 'Período', 'Organismo', 'Operación', 'Tabla', 'Licencia', 'Método/Fórmula', 'Ámbito/Grano/Capacidad', 'Comparabilidad'],
      filas: diccionario,
      fuente: 'SOCideas · catálogo tipado del libro',
      periodo: `fecha de corte ${input.fechaGeneracion}`,
      cobertura: 'Todas las hojas',
      note: 'Cada indicador declara unidad, período, ámbito, fuente, licencia y método. ND es presentación; la causa vive en la columna Estado.',
      indicadores: [],
      tablaExcel: 'tbl_met_diccionario',
    }),
    table({
      id: 'estados-dato',
      titulo: 'Glosario de estados de dato',
      hoja: '10_METODOLOGÍA_FUENTES',
      columnas: ['Estado', 'Etiqueta', 'Significado'],
      filas: estados,
      fuente: 'SOCideas · contrato socideas-book@2',
      periodo: '—',
      cobertura: 'Todas las hojas',
      indicadores: [],
      tablaExcel: 'tbl_met_estados',
    }),
    table({
      id: 'reconciliaciones',
      titulo: 'Reconciliaciones verificadas en la generación',
      hoja: '10_METODOLOGÍA_FUENTES',
      columnas: ['Identificador', 'Comprobación', 'Izquierda', 'Derecha', 'Resultado', 'Tolerancia'],
      filas: avisos,
      fuente: 'SOCideas · controles automáticos de build',
      periodo: input.fechaGeneracion,
      cobertura: 'Todas las hojas',
      note: 'Ninguna reconciliación se corrige en silencio: un fallo queda registrado con sus valores y tolerancia.',
      indicadores: [],
      tablaExcel: 'tbl_met_checks',
    }),
    table({
      id: 'fuentes-oficiales',
      titulo: 'Registro de fuentes oficiales y candidatas',
      hoja: '10_METODOLOGÍA_FUENTES',
      columnas: ['Área', 'Organismo', 'Operación', 'Licencia', 'Periodicidad', 'Estado de integración', 'Última actualización'],
      filas: fuentes,
      fuente: 'SOCideas · registro central de fuentes',
      periodo: '-',
      cobertura: 'Todas las hojas',
      note: 'La columna «Última actualización» es la fecha de descarga/ingesta real de la fuente en SOCideas; si es anterior al dato publicado, el dato es de ese corte.',
      indicadores: [],
      tablaExcel: 'tbl_met_fuentes',
    }),
    table({
      id: 'limitaciones',
      titulo: 'Limitaciones y advertencias de este libro',
      hoja: '10_METODOLOGÍA_FUENTES',
      columnas: ['Limitación', 'Detalle'],
      filas: LIMITACIONES_ROWS(input, checks),
      fuente: 'SOCideas · advertencias calculadas en build',
      periodo: input.fechaGeneracion,
      cobertura: 'Todas las hojas',
      indicadores: [],
    }),
  ]
  return bloques
}

function BOOK_STATE_GLOSSARY_ROWS(): ExportCell[][] {
  return [
    ['available', 'Disponible', 'Dato observado y publicado por la fuente oficial para este ámbito y período.'],
    ['partial', 'Parcial', 'Cobertura incompleta documentada en la nota del bloque.'],
    ['not_applicable', 'No aplicable', 'El indicador no procede para este municipio.'],
    ['statistical_secrecy', 'Secreto estadístico', 'Valor suprimido por la fuente (<5 casos habitual). ND, nunca 0.'],
    ['blocked_source', 'Fuente bloqueada', 'Fuente oficial sin descarga estructurada reutilizable verificada.'],
    ['pending_integration', 'Pendiente de integración', 'Fuente verificada y descargable, aún no incorporada al pipeline.'],
    ['temporary_error', 'Error temporal', 'Fallo puntual de obtención; no altera el histórico.'],
    ['missing_by_design', 'Sin dato por diseño', 'La fuente no cubre este ámbito por diseño.'],
  ].map(([a, b, c]) => [label(a), label(b), label(c)])
}

function FUENTES_ROWS(): ExportCell[][] {
  // Columna final = fecha real de última actualización/ingesta de la fuente.
  // Nunca se oculta: si el dato es de 2020, aquí pone 2020.
  return [
    ['Demografía', 'Instituto Nacional de Estadística', 'Padrón municipal (DPOP) y Padrón Continuo', LIC_INE, 'Anual', 'Integrada', '2025-01-01 (estructura 2025)'],
    ['Demografía', 'Instituto Nacional de Estadística', 'Censo anual de población (68521/68535/66322/68540)', LIC_INE, 'Anual', 'Integrada', '2025-01-01 (INE 68521/68535)'],
    ['Demografía', 'Instituto Nacional de Estadística', 'Estadística de Migraciones y Cambios de Residencia (69711/69743/69746/69767)', LIC_INE, 'Anual', 'Integrada', '2024-01-01'],
    ['Política', 'Ministerio del Interior', 'Infoelectoral · municipales (más de 250 hab.)', LIC_MIR, 'Cuatrienal', 'Integrada (2023)', '2023-05-28'],
    ['Política', 'Ministerio del Interior', 'Infoelectoral · Congreso 23-J-2023 por circunscripción (voto a candidatos)', LIC_MIR, 'Cuatrienal', 'Integrada (R2: socideas/electoral/provincial/<prov>.json)', '2023-07-23'],
    ['Política', 'Ministerio del Interior', 'Infoelectoral · Senado 23-J-2023 por circunscripción, voto a candidatos', LIC_MIR, 'Cuatrienal', 'Integrada (R2: socideas/electoral/provincial/<prov>.json)', '2023-07-23'],
    ['Política', 'Junta de Comunidades de Castilla-La Mancha', 'Cortes de CLM 28-M-2023 por circunscripción (Datos Abiertos CLM + JEC-CLM, DOCM 2023/5411)', LIC_JCCM, 'Cuatrienal', 'Integrada (R2: socideas/electoral/provincial/<prov>.json)', '2023-05-28'],
    ['Economía', 'Agencia Estatal de Administración Tributaria', 'IRPF por municipios (EDM)', LIC_AEAT, 'Anual', 'Integrada (2023)', '2023-01-01'],
    ['Economía', 'Instituto Nacional de Estadística', 'ADRH (renta y desigualdad)', LIC_INE, 'Anual', 'Integrada', '2023-01-01'],
    ['Economía', 'Instituto Nacional de Estadística', 'DIRCE municipal (4721)', LIC_INE, 'Anual', 'Integrada', '2023-01-01'],
    ['Economía', 'SEPE', 'Paro registrado por municipio, sexo, edad y sector', 'Datos abiertos SEPE', 'Mensual', 'Integrada (último mes)', '2026-07'],
    ['Economía', 'TGSS', 'Afiliación por municipio y régimen', 'Datos abiertos Seguridad Social', 'Mensual', 'Integrada (último mes)', '2026-07'],
    ['Economía', 'Ministerio de Hacienda', 'CONPREL · presupuestos y liquidaciones', LIC_PEND, 'Anual', 'No publicada (fuera de alcance)', '—'],
    ['Agrario', 'Instituto Nacional de Estadística', 'Censo Agrario 2020 (52071/52076/52081/52082)', LIC_INE, 'Decenal', 'Integrada', '2020-06-17'],
    ['Servicios', 'Instituto Nacional de Estadística', 'Censo 2021 · nivel educativo (55249)', LIC_INE, 'Decenal', 'Integrada', '2021-11-09'],
    ['Servicios', 'Ministerio de Educación', 'Registro Estatal de Centros Docentes', LIC_PEND, 'Continua', 'Pendiente', '—'],
    ['Servicios', 'Ministerio de Sanidad', 'REGCESS', LIC_PEND, 'Continua', 'Pendiente', '—'],
    ['Vivienda', 'Instituto Nacional de Estadística', 'Censo 2021 · vivienda y hogares', LIC_INE, 'Decenal', 'Pendiente', '2021-11-09'],
    ['Vivienda', 'Dirección General del Catastro', 'Estadísticas catastrales municipales', LIC_PEND, 'Anual', 'Pendiente', '—'],
    ['Patrimonio', 'Ministerio de Cultura y CCAA', 'BIC e inventarios autonómicos; registros turísticos', LIC_PEND, 'Continua', 'Pendiente (adaptadores CCAA)', '—'],
    ['Patrimonio', 'Wikipedia / Wikimedia Foundation', 'Resumen del municipio y bienes patrimoniales (vía Wikidata)', 'Reutilización con atribución obligatoria · CC BY-SA 4.0', 'Consulta puntual', 'Integrada (v2.3 · socideas/wikipedia/{INE}.json)', '2026-09-25'],
    ['Patrimonio', 'Red PAC España / datos.gob.es', 'Grupos de Acción Local (LEADER/FEADER) y cobertura municipal', 'Datos abiertos de la administración (citando la fuente)', 'Período de programación', 'Integrada (v2.3 · 283 GAL, 7.069 municipios)', '2026-09-25'],
    ['Patrimonio', 'Junta de Comunidades de Castilla-La Mancha', 'Poblaciones LEADER / GDR PEPAC 2023-2027 (CLM)', 'Datos abiertos de la administración (citando la fuente)', '2023-2027', 'Integrada (v2.3 · prioridad CLM)', '2026-09-25'],
    ['Asociaciones', 'Registros autonómicos de asociaciones', 'CLM, Comunitat Valenciana, Galicia, La Rioja y Navarra (datos abiertos)', 'Datos abiertos · aviso de verificación visible en cada hoja', 'Continua (fecha de descarga por CCAA)', 'Integrada (v2.3 · 181.800 filas)', '2026-09-25'],
    ['Asociaciones', 'Registros autonómicos sin descarga estructurada', 'Aragón, Andalucía, Baleares, Canarias, Cantabria, Cataluña, Madrid, Murcia, País Vasco', LIC_PEND, 'Continua', 'Declarado (sin_datos_abiertos; sin scraping)', '2026-09-25'],
    ['Asociaciones', 'Sin fuente de datos abiertos identificada', 'Asturias, Extremadura, Castilla y León (autenticación), Ceuta, Melilla', LIC_PEND, '—', 'Declarado (no_disponible; nunca se inventan datos)', '2026-09-25'],
    ['Infraestructura', 'IGN y administraciones', 'Redes de transporte, agua, residuos y energía', LIC_PEND, 'Variable', 'Pendiente (cálculo geoespacial documentado)', '—'],
    ['Asociaciones', 'Ministerio del Interior y CCAA', 'Registro Nacional de Asociaciones (marco general)', LIC_PEND, 'Continua', 'Pendiente (privacidad por diseño)', '—'],
  ].map(([a, b, c, d, e, f, g]) => [label(a), label(b), label(c), label(d), label(e), label(f), label(g)])
}

function LIMITACIONES_ROWS(input: SocideasBookInputV2, checks: BookReconciliation[]): ExportCell[][] {
  const rows: ExportCell[][] = []
  const fallos = checks.filter((c) => !c.ok)
  if (fallos.length > 0) {
    rows.push([label('Reconciliaciones con desviación'), label(fallos.map((f) => f.id).join(', '))])
  }
  if (!input.ineLayers) {
    rows.push([label('Capa INE lateral ausente'), label('Los bloques de saldos migratorios, educación y agrario pueden faltar para este municipio.')])
  }
  if (!input.perfilDemografia) {
    rows.push([label('Perfil demográfico ausente'), label('Sin datos demográficos publicados para este municipio en el envelope v2.')])
  }
  if (!input.electoral) {
    rows.push([label('Serie electoral histórica no cargada'), label('La serie municipal por convocatoria requiere carga previa al pipeline.')])
  }
  if (!input.autonomicasCircunscripcion) {
    rows.push([label('Autonómicas por circunscripción no cargadas'), label('Solo se publican para municipios con fixture provincial verificado; el resto queda declarado como pendiente. Los escaños son de la circunscripción, nunca del municipio.')])
  }
  if (!input.senadoCircunscripcion) {
    rows.push([label('Senado por circunscripción no cargado'), label('El voto a candidatos al Senado (23-J-2023) solo se publica para municipios con fixture provincial verificado. Cámara separada del Congreso: nunca se suman.')])
  }
  if (input.autonomicasCircunscripcion || input.senadoCircunscripcion || input.congresoProvincia) {
    rows.push([
      label('Bloques de circunscripción'),
      label(
        'Autonómico, Congreso y Senado se publican por circunscripción provincial, con nota de cobertura explícita en el XLSX y en la ficha web. Nunca se atribuyen al municipio y nunca se suman entre cámaras.',
      ),
    ])
  }
  if (!input.laborSerie || input.laborSerie.length === 0) {
    rows.push([label('Serie mensual de empleo'), label('Solo está cargado el último mes de SEPE/TGSS: la serie histórica mensual por sector exige carga incremental y no se simula.')])
  }
  if (input.populationStructure && !input.populationStructure.ageDetail) {
    rows.push([
      label('Edad simple: ámbito insular'),
      label('El INE publica edad año a año a nivel municipal solo para municipios insulares (tabla 68534, verificado). En el resto, la estructura se publica por grupos quinquenales (68535) y los indicadores que requieren edad simple (menores de 16, 16–64) no se estiman.'),
    ])
  }
  if (input.populationStructure) {
    rows.push([
      label(`Estructura de población ${input.populationStructure.period}`),
      label(`Fuente canónica: INE Censo Anual tabla ${input.populationStructure.sourceTable} (${input.populationStructure.scope}). Reconciliada contra 68065 y, donde aplica, contra 68535.`),
    ])
  }
  rows.push([label('Presupuesto municipal'), label('CONPREL no está publicado en R2: el bloque no se incluye; se declara como pendiente con operación candidata.')])
  rows.push([label('Comparativas territoriales'), label('Solo se muestran comparativas con el mismo período y definición; nunca se interpolan años.')])
  rows.push([label('Áreas pendientes'), label('Vivienda e infraestructura se declaran con capacidades y siguiente acción; no computan como cubiertas. Asociaciones, GAL y patrimonio enriquecido se publican con su aviso de verificación y su atribución.')])
  return rows
}

// ============================================================================
// 00_RESUMEN
// ============================================================================

function buildResumenSheet(
  input: SocideasBookInputV2,
  sheets: BookSheetV2[],
  coverage: BookCoverage,
  findings: BookFinding[],
): BookTableV2[] {
  const indicadoresClave: ExportCell[][] = []
  const push = (nombre: string, cell: ExportCell, unidad: string, periodo: string, estado: string): void => {
    indicadoresClave.push([label(nombre), cell, label(unidad), label(periodo), label(estado)])
  }
  const perfil = input.perfilDemografia
  const valores = perfil?.valores ?? []

  push('Población total', num(perfil?.total?.valor_numerico ?? null), 'personas', String(perfil?.total?.anio_referencia ?? '—'), perfil?.total ? 'Disponible' : 'Pendiente')
  push('Variación a 5 años', pct(perfil?.derivados.cambio_5y ?? null), '%', String(perfil?.total?.anio_referencia ?? '—'), perfil?.derivados.cambio_5y !== null ? 'Disponible' : 'No difundido')
  push('Índice de envejecimiento', num(perfil?.derivados.indice_envejecimiento ?? null, 1), 'ratio', String(perfil?.total?.anio_referencia ?? '—'), perfil?.derivados.indice_envejecimiento !== null ? 'Disponible' : 'No difundido')
  push('Densidad de población', num(perfil?.densidad.valor ?? null, 1), 'hab./km²', String(perfil?.densidad.anioSuperficie ?? '—'), perfil?.densidad.valor !== null ? 'Cálculo SOCideas' : 'Pendiente')

  const ultimoEco = (slug: string): { v: IndicatorValue | null; anio: number | null } => {
    const list = valores
      .filter((v) => slugOf(v) === slug && isPublishableValue(slug, v.valor_numerico) && (v.dimensiones?.ambito ?? 'municipio') === 'municipio')
      .sort((a, b) => (a.anio_referencia ?? 0) - (b.anio_referencia ?? 0))
    const last = list[list.length - 1] ?? null
    return { v: last, anio: last?.anio_referencia ?? null }
  }
  const rnp = ultimoEco('renta_neta_media_persona')
  push('Renta neta media por persona', num(rnp.v?.valor_numerico ?? null), '€', String(rnp.anio ?? '—'), rnp.v ? 'Disponible (ADRH)' : 'No difundido')
  const gini = ultimoEco('gini')
  push('Índice de Gini', num(gini.v?.valor_numerico ?? null, 1), 'Índice', String(gini.anio ?? '—'), gini.v ? 'Disponible (ADRH)' : 'No difundido')
  const p80 = ultimoEco('p80_p20')
  push('Ratio P80/P20', num(p80.v?.valor_numerico ?? null, 1), 'ratio', String(p80.anio ?? '—'), p80.v ? 'Disponible (ADRH)' : 'No difundido')
  const paro = ultimoEco('paro_registrado')
  push('Paro registrado (último mes)', num(paro.v?.valor_numerico ?? null), 'personas', String(paro.v?.dimensiones?.periodo ?? '—'), paro.v ? 'Disponible (SEPE)' : 'No difundido')
  const afi = ultimoEco('afiliacion_total')
  push('Afiliación (último mes)', num(afi.v?.valor_numerico ?? null), 'personas', String(afi.v?.dimensiones?.periodo ?? '—'), afi.v ? 'Disponible (TGSS)' : 'No difundido')
  const emp = ultimoEco('empresas_total')
  push('Empresas con sede', num(emp.v?.valor_numerico ?? null), 'empresas', String(emp.anio ?? '—'), emp.v ? 'Disponible (DIRCE)' : 'No difundido')
  const elec = buildElectoralPresentation(valores, input.municipio)
  push('Participación municipal 2023', pct(elec.participacion), '%', '2023-05-28', elec.status === 'observed' ? 'Disponible (Infoelectoral)' : 'No aplicable')
  if (input.vivienda?.vacias !== null && input.vivienda?.vacias !== undefined && input.vivienda.total) {
    push('Viviendas vacías', pct(pctRatio(input.vivienda.vacias, input.vivienda.total)), '%', input.vivienda.periodo, 'Disponible (Censo 2021)')
  }

  const coberturaFilas: ExportCell[][] = coverage.areas.map((a) => {
    const nivel = a.total === 0 ? 'Sin declarar' : a.ratio >= 0.75 ? 'Alta' : a.ratio >= 0.4 ? 'Media' : a.ratio > 0 ? 'Baja' : 'Nula'
    return [
      label(a.area),
      num(a.publicables),
      num(a.total),
      pct(Math.round(a.ratio * 1000) / 10),
      label(`${nivel} (peso ${(a.peso * 100).toFixed(0)} %)`),
    ]
  })

  const meta: ExportCell[][] = [
    [label('Municipio'), label(input.municipio)],
    [label('Código INE'), label(input.codigoINE)],
    [label('Provincia'), label(input.provincia)],
    [label('Comunidad autónoma'), label(input.comunidadAutonoma)],
    [label('Fecha de generación'), label(input.fechaGeneracion)],
    [label('Esquema del libro'), label(SOCIDEAS_BOOK_SCHEMA)],
    [label('Hojas'), label(String(sheets.length))],
    [label('Cobertura global ponderada'), pct(coverage.global)],
    [label('Indicadores publicables'), label(`${coverage.publicables} de ${coverage.declarados}`)],
  ]

  return [
    table({
      id: 'portada-identificacion',
      titulo: 'Identificación del libro',
      hoja: '00_RESUMEN',
      columnas: ['Campo', 'Valor'],
      filas: meta,
      fuente: 'SOCideas · Ideas Sostenibilidad',
      periodo: input.fechaGeneracion,
      cobertura: `${input.municipio} (${input.codigoINE})`,
      indicadores: [],
      tablaExcel: 'tbl_res_meta',
    }),
    table({
      id: 'indicadores-clave',
      titulo: 'Indicadores clave',
      hoja: '00_RESUMEN',
      columnas: ['Indicador', 'Valor', 'Unidad', 'Período', 'Estado'],
      filas: indicadoresClave,
      fuente: 'Fuentes oficiales citadas en 10_METODOLOGÍA_FUENTES',
      periodo: 'Último dato publicado por indicador',
      cobertura: ctxMunicipio(input),
      note: 'Selección descriptiva de indicadores publicables. El estado distingue dato observado, cálculo SOCideas y no difundido.',
      indicadores: [],
      tablaExcel: 'tbl_res_indicadores',
    }),
    table({
      id: 'hallazgos',
      titulo: 'Hallazgos descriptivos',
      hoja: '00_RESUMEN',
      columnas: ['#', 'Hallazgo (descriptivo)', 'Trazabilidad'],
      filas: findings.map((f, i) => [num(i + 1), label(f.texto), label(f.traza.join(' · '))]),
      fuente: 'SOCideas · cálculo descriptivo sobre datos publicados',
      periodo: input.fechaGeneracion,
      cobertura: ctxMunicipio(input),
      note: 'Sin causalidad, sin valoraciones políticas y sin predicciones: solo descripción trazable de lo publicado.',
      indicadores: [],
      tablaExcel: 'tbl_res_hallazgos',
    }),
    table({
      id: 'cobertura',
      titulo: 'Semáforo de cobertura por área',
      hoja: '00_RESUMEN',
      columnas: ['Área', 'Indicadores publicables', 'Indicadores declarados', 'Cobertura', 'Nivel'],
      filas: coberturaFilas,
      fuente: 'SOCideas · rúbrica ponderada por indicadores',
      periodo: input.fechaGeneracion,
      cobertura: 'Todas las áreas temáticas',
      note: 'Cobertura = indicadores publicables / declarados, ponderada por área. No se mide por número de hojas ni por títulos.',
      indicadores: [],
      tablaExcel: 'tbl_res_cobertura',
    }),
  ]
}

// ============================================================================
// Orquestador
// ============================================================================

export interface SocideasBookV2 {
  schemaVersion: typeof SOCIDEAS_BOOK_SCHEMA
  municipio: string
  codigoINE: string
  fechaGeneracion: string
  sheets: BookSheetV2[]
  indicadores: BookIndicator[]
  coverage: BookCoverage
  findings: BookFinding[]
  checks: BookReconciliation[]
  /** Choques de clave de unicidad detectados (debe ser [] en un libro válido). */
  duplicateKeys: ReturnType<typeof findDuplicateIndicatorKeys>
}

function pendingTable(
  hoja: BookSheetId,
  id: string,
  titulo: string,
  motivo: string,
  indicadores: BookIndicator[],
  extra?: { candidataFuente?: string; siguienteAccion?: string; cobertura?: string },
): BookTableV2 {
  return table({
    id,
    titulo,
    hoja,
    columnas: ['Indicador', 'Estado', 'Fuente candidata', 'Motivo', 'Siguiente acción'],
    filas: [
      [
        label(indicadores[0]?.nombre ?? titulo),
        label(availabilityV1(indicadores[0]?.availability ?? 'pending_integration').estadoTexto),
        label(extra?.candidataFuente ?? indicadores[0]?.operacion ?? '—'),
        label(motivo),
        label(extra?.siguienteAccion ?? 'Mantener declarado como no disponible; no se estima'),
      ],
    ],
    fuente: indicadores[0]?.organismo ? `${indicadores[0].organismo} · ${indicadores[0].operacion}` : 'Fuente oficial pendiente de verificación',
    periodo: indicadores[0]?.periodo ?? '—',
    cobertura: extra?.cobertura ?? coberturaPorAmbito(indicadores[0]),
    indicadores,
  })
}

/** Cobertura declarada de un bloque pendiente según el ámbito del indicador.
 *
 *  Nunca se etiqueta un bloque provincial/autonómico como municipal: esa fue la
 *  raíz del defecto crítico de v2.3 (bloques electorales provinciales de Toledo
 *  presentados como si fueran datos del municipio). */
function coberturaPorAmbito(ind: BookIndicator | undefined): string {
  const ambito = ind?.ambito ?? 'municipio'
  if (ambito === 'provincia') return 'Circunscripción provincial: ámbito provincial, no municipal'
  if (ambito === 'autonomica' || ambito === 'ccaa') return 'Ámbito autonómico, no municipal'
  if (ambito === 'espana' || ambito === 'nacional') return 'Ámbito nacional'
  return 'Municipio'
}

/** Une los bloques de todas las hojas y calcula cobertura, hallazgos y checks. */
export function assembleSocideasBookV2(input: SocideasBookInputV2): SocideasBookV2 {
  const contenido: Record<Exclude<BookSheetId, '00_RESUMEN' | '10_METODOLOGÍA_FUENTES'>, BookTableV2[]> = {
    '01_DEMOGRAFÍA': buildDemografiaSheet(input),
    '02_POLÍTICA': buildPoliticaSheet(input),
    '03_ECONOMÍA_Y_EMPLEO': buildEconomiaSheet(input),
    '04_AGRARIO': buildAgrarioSheet(input),
    '05_SOCIAL_EDUCACIÓN_SERVICIOS': buildServiciosSheet(input),
    '06_VIVIENDA_Y_HOGARES': buildViviendaSheet(input),
    '07_PATRIMONIO_TURISMO': buildPatrimonioSheet(input),
    '08_INFRAESTRUCTURA_RECURSOS': buildInfraestructuraSheet(input),
    '09_ASOCIACIONES_GOBERNANZA': buildAsociacionesSheet(input),
  }

  // Deduplicación por identidad estable de bloque dentro de cada hoja
  for (const [hoja, bloques] of Object.entries(contenido) as [keyof typeof contenido, BookTableV2[]][]) {
    const seen = new Set<string>()
    contenido[hoja] = bloques.filter((b) => {
      const key = `${b.hoja}|${b.id}`
      if (seen.has(key)) {
        console.warn(JSON.stringify({ tag: 'SOCIDEAS_BOOK_DUPLICATE_BLOCK', hoja, id: b.id }))
        return false
      }
      seen.add(key)
      return true
    })
  }

  const todas: BookTableV2[] = Object.values(contenido).flat()
  const indicadores = todas.flatMap((t) => t.indicadores)
  const duplicateKeys = findDuplicateIndicatorKeys(indicadores)
  const checks = todas.flatMap((t) => t.checks ?? [])
  const coverage = computeBookCoverage(indicadores)

  const perfil = input.perfilDemografia
  const valores = perfil?.valores ?? []
  const elec = buildElectoralPresentation(valores, input.municipio)
  const rnp = valores
    .filter((v) => slugOf(v) === 'renta_neta_media_persona' && isPublishableValue('renta_neta_media_persona', v.valor_numerico))
    .sort((a, b) => (a.anio_referencia ?? 0) - (b.anio_referencia ?? 0))
    .pop()
  const findings = buildFindings([
    {
      id: 'poblacion',
      valor: perfil?.total?.valor_numerico ?? null,
      anio: perfil?.total?.anio_referencia ?? null,
      unidad: 'personas',
      plantilla: `Población empadronada: ${input.municipio}.`,
      traza: ['01_DEMOGRAFÍA · población-sexo'],
    },
    {
      id: 'variacion-5y',
      valor: perfil?.derivados.cambio_5y ?? null,
      anio: perfil?.total?.anio_referencia ?? null,
      unidad: '%',
      plantilla: 'Variación de población a 5 años.',
      traza: ['01_DEMOGRAFÍA · indicadores-demograficos'],
    },
    {
      id: 'envejecimiento',
      valor: perfil?.derivados.indice_envejecimiento ?? null,
      unidad: 'ratio',
      plantilla: 'Índice de envejecimiento (65+ por 100 menores de 15).',
      traza: ['01_DEMOGRAFÍA · indicadores-demograficos'],
    },
    {
      id: 'renta',
      valor: rnp?.valor_numerico ?? null,
      anio: rnp?.anio_referencia ?? null,
      unidad: '€',
      plantilla: 'Renta neta media por persona (ADRH).',
      traza: ['03_ECONOMÍA_Y_EMPLEO · renta-adrh'],
    },
    {
      id: 'participacion',
      valor: elec.participacion,
      anio: elec.status === 'observed' ? 2023 : null,
      unidad: '%',
      plantilla: 'Participación en las últimas elecciones municipales.',
      traza: ['02_POLÍTICA · elecciones-participacion'],
    },
  ])

  const metodologia = buildMetodologiaSheet(input, indicadores, checks)
  const sheets: BookSheetV2[] = []

  const resumenBloques = buildResumenSheet(input, sheets, coverage, findings)
  sheets.push({ id: '00_RESUMEN', titulo: 'Resumen ejecutivo', subtitulo: 'Identificación, indicadores clave, hallazgos y cobertura', bloques: resumenBloques })

  const metaById = new Map<string, { titulo: string; subtitulo: string }>()
  for (const m of [
    { id: '01_DEMOGRAFÍA', titulo: 'Demografía', subtitulo: 'Población, estructura, nacionalidad, arraigo y migraciones' },
    { id: '02_POLÍTICA', titulo: 'Política', subtitulo: 'Municipales, autonómicas y generales (Congreso y Senado separados)' },
    { id: '03_ECONOMÍA_Y_EMPLEO', titulo: 'Economía y empleo', subtitulo: 'Renta, desigualdad, empresas, afiliación, paro y presupuesto' },
    { id: '04_AGRARIO', titulo: 'Agrario', subtitulo: 'Explotaciones, usos, ganadería, titulares y relevo' },
    { id: '05_SOCIAL_EDUCACIÓN_SERVICIOS', titulo: 'Social, educación y servicios', subtitulo: 'Nivel educativo, centros docentes y servicios' },
    { id: '06_VIVIENDA_Y_HOGARES', titulo: 'Vivienda y hogares', subtitulo: 'Uso, tamaño, tenencia, superficie y antigüedad' },
    { id: '07_PATRIMONIO_TURISMO', titulo: 'Patrimonio y turismo', subtitulo: 'Bienes protegidos, museos, alojamientos y recursos' },
    { id: '08_INFRAESTRUCTURA_RECURSOS', titulo: 'Infraestructura y recursos', subtitulo: 'Transporte, accesibilidad, agua, residuos y energía' },
    { id: '09_ASOCIACIONES_GOBERNANZA', titulo: 'Asociaciones y gobernanza', subtitulo: 'Registro asociativo, mancomunidades y sector público local' },
    { id: '10_METODOLOGÍA_FUENTES', titulo: 'Metodología y fuentes', subtitulo: 'Diccionario, estados, fuentes y limitaciones' },
  ] as const) {
    metaById.set(m.id, { titulo: m.titulo, subtitulo: m.subtitulo })
  }

  for (const hojaId of Object.keys(contenido) as (keyof typeof contenido)[]) {
    const meta = metaById.get(hojaId)
    sheets.push({ id: hojaId, titulo: meta?.titulo ?? hojaId, subtitulo: meta?.subtitulo ?? '', bloques: contenido[hojaId] })
  }
  sheets.push({ id: '10_METODOLOGÍA_FUENTES', titulo: 'Metodología y fuentes', subtitulo: 'Diccionario, estados, fuentes y limitaciones', bloques: metodologia })

  return {
    schemaVersion: SOCIDEAS_BOOK_SCHEMA,
    municipio: input.municipio,
    codigoINE: input.codigoINE,
    fechaGeneracion: input.fechaGeneracion,
    sheets,
    indicadores,
    coverage,
    findings,
    checks,
    duplicateKeys,
  }
}

// Re-export de tipos usados por el escritor y QA
export type { BookSheetV2, BookTableV2, BookFinding, BookCoverage, BookReconciliation }
export { ELECTIONS_URL_DATOS_ABIERTOS, INE_INSTITUTION, AEAT_EDM_IRPF }
