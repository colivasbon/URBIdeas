// Adaptador de SOLO LECTURA para volcar al libro XLSX los bloques del libro
// municipal comparativo que viven en las capas INE laterales (R2 inmutable).
// No modifica el envelope ni los DTO web: solo los transforma en tablas
// exportables con su procedencia oficial centralizada. Sin I/O, sin escrituras
// R2/Supabase, sin secretos.

import type { ExportCell, ExportTable } from './socideas-export'
import type {
  IneEducationDistribution,
  IneMigrationYear,
  IneValue,
  MunicipalIneLayersV1,
} from './socideas-ine-layers'
import { ineTableSource, registrySource } from './socideas-source-registry'

const OP_CENSO_ANUAL = 'Censo anual de población'
const OP_CENSO_2021 = 'Censo de Población y Viviendas 2021'
const OP_EDUCACION = 'Censo de Población y Viviendas 2021 (nivel educativo)'

function labelCell(text: string): ExportCell {
  return { text, numeric: null }
}

function numCell(value: number | null): ExportCell {
  return value === null ? { text: 'ND', numeric: null } : { text: value.toLocaleString('es-ES'), numeric: value }
}

function ratioCell(value: number | null): ExportCell {
  return value === null
    ? { text: 'ND', numeric: null }
    : { text: value.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), numeric: value }
}

/**
 * Movilidad migratoria: serie anual de saldos migratorios del municipio.
 * Devuelve `[]` si la capa INE no incluye `migration` o no hay anual.
 */
export function buildMovilidadMigratoriaTable(
  layers: MunicipalIneLayersV1 | null | undefined,
): ExportTable[] | null {
  if (!layers) return null
  const mig = layers.layers.migration
  if (!mig || !mig.annualSeries || mig.annualSeries.length === 0) return null

  const filas: ExportCell[][] = mig.annualSeries.map((y: IneMigrationYear) => [
    labelCell(y.period),
    numCell(y.total?.value ?? null),
    numCell(y.interior?.value ?? null),
    numCell(y.exterior?.value ?? null),
  ])

  const primerAnyo = mig.annualSeries[0]
  const source = ineTableSource(primerAnyo.total.tableId, OP_CENSO_ANUAL)

  return [{
    id: 'movilidad-migratoria',
    titulo: 'Movilidad migratoria',
    hoja: '01_PERFIL_DEMOGRÁFICO',
    columnas: ['Año', 'Saldo total', 'Saldo interior', 'Saldo exterior'],
    filas,
    fuente: 'Instituto Nacional de Estadística',
    periodo: `${mig.annualSeries[0].period}–${mig.annualSeries[mig.annualSeries.length - 1].period}`,
    cobertura: `Municipio ${layers.municipalityName}`,
    estado: mig.status === 'observed' ? 'Consolidado' : 'Cobertura parcial; revisar periodo y fuente',
    source: source ?? undefined,
    comparisonMode: 'municipal_only',
    availability: mig.status === 'observed' ? 'available' : 'pending_integration',
    note: 'La movilidad migratoria se publica por el INE para este municipio. La comparativa territorial completa no se muestra en esta versión del libro.',
  }]
}

/**
 * Nivel educativo (Censo 2021): distribución por nivel de estudios para el
 * municipio. Devuelve `null` si la capa no incluye `education`.
 */
export function buildNivelEducativoTable(
  layers: MunicipalIneLayersV1 | null | undefined,
): ExportTable | null {
  if (!layers) return null
  const edu = layers.layers.education
  if (!edu || !edu.total) return null

  const d: IneEducationDistribution = edu.total
  const rows: ExportCell[][] = [
    [labelCell('Educación primaria e inferior'), numCell(d.primaryOrBelow?.value ?? null)],
    [labelCell('Primera etapa de secundaria y similar'), numCell(d.lowerSecondary?.value ?? null)],
    [labelCell('Segunda etapa de secundaria y postsecundaria no superior'), numCell(d.upperSecondaryPostSecondary?.value ?? null)],
    [labelCell('Educación superior'), numCell(d.higher?.value ?? null)],
    [labelCell('No aplicable: menor de 15 años'), numCell(d.notApplicableUnder15?.value ?? null)],
  ]

  const primer = d.primaryOrBelow ?? d.lowerSecondary ?? d.higher ?? d.upperSecondaryPostSecondary ?? d.notApplicableUnder15
  const source = primer?.tableId
    ? ineTableSource(primer.tableId, OP_EDUCACION)
    : registrySource('ine_birth_country_66322')

  return {
    id: 'nivel-educativo',
    titulo: 'Nivel educativo',
    hoja: '04_CONTEXTO_SOCIOCULTURAL',
    columnas: ['Nivel educativo', 'Personas'],
    filas: rows,
    fuente: `Instituto Nacional de Estadística · ${OP_CENSO_2021}`,
    periodo: edu.period,
    cobertura: `Municipio ${layers.municipalityName}`,
    estado: edu.status === 'observed' ? 'Censo de Población y Viviendas 2021' : 'Cobertura parcial',
    source: source ?? undefined,
    comparisonMode: 'municipal_only',
    availability: edu.status === 'observed' ? 'available' : 'pending_integration',
    note: 'Censo de Población y Viviendas 2021: no se presenta como dato anual.',
  }
}

/**
 * Bloque "Centros educativos, FP y servicios": pendiente de integración desde
 * registros administrativos oficiales. Se modela como bloque pendiente para que
 * el renderer pinte la nota breve correspondiente.
 */
export function buildCentrosEducativosTable(): ExportTable {
  return {
    id: 'centros-educativos',
    titulo: 'Centros educativos, formación profesional y servicios',
    hoja: '04_CONTEXTO_SOCIOCULTURAL',
    columnas: ['Indicador'],
    filas: [],
    fuente: 'Pendiente de integración desde registros administrativos y catálogos oficiales',
    periodo: '—',
    cobertura: 'Municipio',
    estado: 'Pendiente de integración',
    availability: 'pending_integration',
    comparisonMode: 'municipal_only',
    note: 'Centros educativos, formación profesional y servicios municipales: pendientes de integración desde registros administrativos y catálogos oficiales.',
  }
}

/**
 * Indicadores demográficos derivados INE (densidad, edad media, dependencias,
 * índices de envejecimiento y variaciones): complementan los derivados del
 * envelope cuando la capa INE lateral los publica.
 */
export function buildDemographicDerivedLayerTable(
  layers: MunicipalIneLayersV1 | null | undefined,
): ExportTable | null {
  if (!layers) return null
  const dd = layers.layers.demographicDerived
  if (!dd) return null
  const filas: ExportCell[][] = []
  const f = (label: string, value: number | null, unit: string) => {
    filas.push([labelCell(label), numCell(value), labelCell(unit)])
  }
  if (dd.density) f('Densidad de población', dd.density.value, 'hab./km²')
  if (dd.meanAge) f('Edad media', dd.meanAge.value, 'años')
  if (dd.dependencyTotal) f('Dependencia total', dd.dependencyTotal.value, '%')
  if (dd.dependencyYouth) f('Dependencia infantil', dd.dependencyYouth.value, '%')
  if (dd.dependencyOlder) f('Dependencia de mayores', dd.dependencyOlder.value, '%')
  if (dd.ageingIndex) f('Índice de envejecimiento', dd.ageingIndex.value, '%')
  if (dd.populationChange5y) f('Variación a 5 años', dd.populationChange5y.value, '%')
  if (dd.populationChange10y) f('Variación a 10 años', dd.populationChange10y.value, '%')
  if (filas.length === 0) return null

  const primer = dd.density ?? dd.meanAge ?? dd.dependencyTotal ?? dd.ageingIndex ?? dd.populationChange5y ?? dd.populationChange10y
  const source = primer?.tableId ? ineTableSource(primer.tableId, OP_CENSO_ANUAL) : undefined

  return {
    id: 'derivados-ine',
    titulo: 'Indicadores demográficos derivados (Capa INE)',
    hoja: '01_PERFIL_DEMOGRÁFICO',
    columnas: ['Indicador', 'Valor', 'Unidad'],
    filas,
    fuente: 'Instituto Nacional de Estadística · capa municipal lateral',
    periodo: primer?.period ?? '—',
    cobertura: `Municipio ${layers.municipalityName}`,
    estado: primer?.derived ? 'Cálculo SOCideas sobre datos oficiales' : 'Consolidado',
    source: source ?? undefined,
    comparisonMode: 'municipal_only',
    availability: 'available',
    note: 'Los indicadores derivados se identifican como cálculo SOCideas cuando la capa INE los marca como derived.',
  }
}

/**
 * Tablas XLSX del SALDO migratorio neto (INE 69767): total, exterior e interior,
 * cada una por sexo. Separadas de los FLUJOS (69711/69743/69746). ND nunca 0.
 */
export function buildSaldosMigratoriosTables(
  layers: MunicipalIneLayersV1 | null | undefined,
): ExportTable[] | null {
  const mb = layers?.layers?.migrationBalance
  if (!mb) return null
  const cell = (v: number | null): ExportCell =>
    v === null ? { text: 'ND', numeric: null } : { text: v.toLocaleString('es-ES'), numeric: v }
  const row = (label: string, v: IneValue | undefined): ExportCell[] => [
    { text: label, numeric: null },
    cell(v?.value ?? null),
  ]
  const source = ineTableSource(mb.tableId ?? '69767', 'Estadística de Migraciones y Cambios de Residencia') ?? undefined

  const tables: ExportTable[] = []
  const mk = (id: string, titulo: string, sel: 'total' | 'interior' | 'exterior'): void => {
    const t = mb[sel]
    const m = mb.bySex?.male?.[sel]
    const f = mb.bySex?.female?.[sel]
    tables.push({
      id,
      titulo,
      hoja: '01_PERFIL_DEMOGRÁFICO',
      columnas: ['Sexo', 'Saldo (personas)'],
      filas: [row('Total', t), row('Hombres', m), row('Mujeres', f)],
      fuente: `Instituto Nacional de Estadística · Saldo migratorio (${mb.period})`,
      periodo: mb.period,
      cobertura: layers?.municipalityName ? `Municipio ${layers.municipalityName}` : 'Municipio',
      estado: mb.status === 'observed' ? 'Consolidado' : 'Cobertura parcial; revisar período y fuente',
      source,
      comparisonMode: 'municipal_only',
      availability: mb.status === 'observed' ? 'available' : 'pending_integration',
      note: 'Saldo = diferencia neta entre entradas y salidas; no es el número total de movimientos. Complementa a los flujos migratorios.',
    })
  }
  mk('saldo-migratorio-total', 'Saldo migratorio total', 'total')
  mk('saldo-migratorio-exterior', 'Saldo migratorio exterior', 'exterior')
  mk('saldo-migratorio-interior', 'Saldo migratorio interior', 'interior')
  return tables
}

/**
 * Densidad de población (Capa INE): si la capa INE publica densidad a nivel
 * municipal, este bloque reemplaza al placeholder de `buildDemografiaTables`.
 */
export function buildDensidadTable(
  layers: MunicipalIneLayersV1 | null | undefined,
): ExportTable | null {
  if (!layers) return null
  const v = layers.layers.demographicDerived?.density
  if (!v || v.value === null) return null
  const source = ineTableSource(v.tableId, 'Cifras oficiales de población')
  return {
    id: 'densidad',
    titulo: 'Densidad de población',
    hoja: '01_PERFIL_DEMOGRÁFICO',
    columnas: ['Concepto', 'Valor', 'Unidad'],
    filas: [[labelCell('Densidad de población'), ratioCell(v.value), labelCell('hab./km²')]],
    fuente: `${v.source} · ${v.period}`,
    periodo: v.period,
    cobertura: `Municipio ${layers.municipalityName}`,
    estado: v.derived ? 'Cálculo SOCideas sobre datos oficiales' : 'Consolidado',
    source: source ?? undefined,
    comparisonMode: 'municipal_only',
    availability: 'available',
    note: 'Densidad calculada sobre superficie municipal validada.',
  }
}
