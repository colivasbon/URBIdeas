// Registro de capacidades de dimensiones demográficas (metadatos, sin datos).
// Ninguna dimensión nueva está disponible: `nationality`, `birth_country` y
// `birth_residence_relation` quedan en `requires-validation` y NO generan
// selectores visibles. `sex` y `age_group` ya están integradas por otras vías.
export type DemographicDimensionCapability = {
  id: 'sex' | 'age_group' | 'nationality' | 'birth_country' | 'birth_residence_relation'
  label: string
  source: string
  period: string
  territoryLevel: 'municipio' | 'seccion'
  sourceTable: string
  categories: string[]
  coverageRule: string
  confidentialityRule?: string
  loadStatus: 'available' | 'prepared' | 'requires-validation' | 'without-coverage'
}

export const DEMOGRAPHIC_DIMENSIONS: DemographicDimensionCapability[] = [
  {
    id: 'sex', label: 'Sexo', source: 'INE · Padrón/DPOP (Tempus3)', period: 'Serie anual (corte H/M: último publicado)',
    territoryLevel: 'municipio', sourceTable: 'Tablas DPOP provinciales (ya integradas)',
    categories: ['Total', 'Hombres', 'Mujeres'], coverageRule: 'Total: todos los municipios; H/M: publicados en corte anual',
    loadStatus: 'available',
  },
  {
    id: 'age_group', label: 'Edad', source: 'INE · Padrón (tabla 33570)', period: 'Año de pirámide',
    territoryLevel: 'municipio', sourceTable: '33570 (ya integrada)',
    categories: ['Tramos quinquenales 0-4 … 95-99, 100+ (publicados)'],
    coverageRule: 'Todos los municipios con pirámide',
    confidentialityRule: 'Los tramos con 0 son recuento real, no supresión',
    loadStatus: 'available',
  },
  {
    id: 'nationality', label: 'Nacionalidad', source: 'INE · Censo 2021 / Padrón por nacionalidad', period: 'Por verificar',
    territoryLevel: 'municipio', sourceTable: 'Por verificar (sin ID inventado)',
    categories: ['Nacionalidad española', 'Nacionalidad extranjera'],
    coverageRule: 'Por verificar (dry-run)', confidentialityRule: 'Probable supresión en municipios pequeños',
    loadStatus: 'requires-validation',
  },
  {
    id: 'birth_country', label: 'País de nacimiento', source: 'INE · Censo 2021', period: 'Por verificar',
    territoryLevel: 'municipio', sourceTable: 'Por verificar (sin ID inventado)',
    categories: ['Nacida en España', 'Nacida en el extranjero'],
    coverageRule: 'Por verificar (dry-run)', confidentialityRule: 'Probable supresión; nunca «extranjero» como sinónimo',
    loadStatus: 'requires-validation',
  },
  {
    id: 'birth_residence_relation', label: 'Relación nacimiento-residencia', source: 'INE · Censo 2021', period: 'Por verificar',
    territoryLevel: 'municipio', sourceTable: 'Por verificar (sin ID inventado)',
    categories: ['Mismo municipio', 'Otro municipio de la misma provincia', 'Otra provincia de la misma comunidad autónoma', 'Otra comunidad autónoma', 'Nacida en el extranjero'],
    coverageRule: 'Por verificar (dry-run, categorías candidatas a confirmar)',
    confidentialityRule: 'Probable supresión; no mezclar con nacionalidad ni país',
    loadStatus: 'requires-validation',
  },
]

/** Solo dimensiones con datos reales generan controles (hoy: sexo y edad). */
export function visibleDemographicDimensions(): DemographicDimensionCapability[] {
  return DEMOGRAPHIC_DIMENSIONS.filter((d) => d.loadStatus === 'available')
}
