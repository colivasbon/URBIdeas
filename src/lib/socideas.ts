// Tipos SOCideas Fase 2A — caracterización sociodemográfica municipal.
// Estilo del proyecto: snake_case de BD, interfaces TS en src/lib.

export type ValidationState = 'pendiente' | 'validado' | 'revision' | 'descartado'
export type SyncRunState = 'pending' | 'running' | 'ok' | 'partial' | 'error'

export interface StatisticalSource {
  id: string
  slug: string
  organismo: string
  nombre: string
  descripcion: string | null
  url_base: string | null
  api_table_id: string | null
  licencia: string | null
  frecuencia_actualizacion: string | null
  activo: boolean
}

export interface IndicatorDefinition {
  id: string
  slug: string
  nombre: string
  grupo: string
  descripcion: string | null
  unidad: string | null
  metodologia: string | null
  fuente_principal_id: string | null
  periodicidad: string | null
  visualizacion_recomendada: string | null
  activo: boolean
}

export interface IndicatorValue {
  id: string
  municipio_codigo_ine: string
  indicator_id: string
  fecha_referencia: string | null
  anio_referencia: number | null
  valor_numerico: number | null
  valor_texto: string | null
  unidad: string | null
  dimensiones: Record<string, string>
  source_id: string
  source_url: string | null
  source_table_id: string | null
  source_series_id: string | null
  obtenido_en: string
  estado_validacion: ValidationState
  indicator?: IndicatorDefinition
  source?: StatisticalSource
}

export interface SyncRun {
  id: string
  source_id: string | null
  tipo_sincronizacion: string
  municipio_codigo_ine: string | null
  inicio: string
  fin: string | null
  estado: SyncRunState
  registros_leidos: number
  registros_actualizados: number
  registros_con_error: number
  error_message: string | null
  metadata: Record<string, unknown>
}

export interface SocideasMunicipio {
  codigo_ine: string
  nombre: string
  poblacion: number | null
  provincia: string
  provincia_codigo_ine: string | null
  comunidad_autonoma: string
  centroide_lng: number | null
  centroide_lat: number | null
}

export interface AgeSexGroup {
  tramo: string
  hombres: number
  mujeres: number
}

export type AmbitoTerritorial = 'municipio' | 'provincia' | 'ccaa' | 'espana'

export const AMBITOS: AmbitoTerritorial[] = ['municipio', 'provincia', 'ccaa', 'espana']

export interface Disponibles {
  /** Años con total+H+M municipal (selector de Población actual). */
  anios_municipio: number[]
  /** Años de la serie de evolución municipal. */
  anios_evolucion: number[]
  /** Años con pirámide completa por edad y sexo. */
  piramide_anios: number[]
  /** Rango real por ámbito (population_total). */
  ambitos: Record<AmbitoTerritorial, { desde: number | null; hasta: number | null; puntos: number }>
  /** Último año por slug de indicador. */
  ultimo_por_indicador: Record<string, number | null>
}

export interface FiltrosAplicados {
  anio: number | null
  desde: number | null
  hasta: number | null
  ambitos: AmbitoTerritorial[]
  pir_anio: number | null
}

export interface PerfilDemografico {
  municipio: SocideasMunicipio
  sincronizado: boolean
  ultima_sincronizacion: string | null
  total: IndicatorValue | null
  hombres: IndicatorValue | null
  mujeres: IndicatorValue | null
  evolucion: IndicatorValue[]
  comparativas: {
    provincia: IndicatorValue[]
    ccaa: IndicatorValue[]
    espana: IndicatorValue[]
  }
  piramide: { anio: number | null; grupos: AgeSexGroup[] }
  derivados: {
    cambio_5y: number | null
    cambio_10y: number | null
    indice_envejecimiento: number | null
    indice_dependencia: number | null
  }
  densidad: { valor: number | null; pendiente: string | null }
  valores: IndicatorValue[]
  disponibles: Disponibles
  filtros: FiltrosAplicados
}

// Slugs de indicadores de Fase 2A (ver 028_socideas_catalog_seed.sql).
export const SOCIDEAS_INDICATORS = [
  'population_total',
  'population_male',
  'population_female',
  'population_evolution',
  'population_age_sex',
  'population_density',
  'population_change_5y',
  'population_change_10y',
] as const
