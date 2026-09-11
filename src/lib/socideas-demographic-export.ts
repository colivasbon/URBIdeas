// Adaptador de SOLO LECTURA para volcar las dimensiones demográficas nuevas
// (nacionalidad, lugar de nacimiento y arraigo territorial) al libro XLSX.
// No modifica los bloques web ni el DTO de presentación: solo los transforma en
// tablas exportables con su procedencia oficial centralizada. Sin I/O, sin
// escrituras R2/Supabase, sin secretos.
import type { ExportCell, ExportTable } from './socideas-export'
import type {
  ArraigoData,
  BirthCountryData,
  DemographicPresentationData,
  NationalityData,
} from './socideas-demographic-summary'
import { OP_CENSO_ANUAL, registrySource } from './socideas-source-registry'

export const DIMENSION_BLOCK_IDS = {
  nacionalidad: 'nacionalidad',
  nacimiento: 'nacimiento',
  arraigo: 'arraigo',
} as const

function labelCell(text: string): ExportCell {
  return { text, numeric: null }
}

function numCell(value: number | null): ExportCell {
  return value === null ? { text: 'ND', numeric: null } : { text: value.toLocaleString('es-ES'), numeric: value }
}

function pctCell(value: number | null): ExportCell {
  if (value === null) return { text: 'ND', numeric: null }
  const text = value.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return { text: `${text} %`, numeric: value }
}

function estadoFrom(status: string): string {
  switch (status) {
    case 'observed':
      return 'Consolidado'
    case 'suppressed':
      return 'Dato no publicado por secreto estadístico (ND, nunca 0)'
    case 'partial':
      return 'Cobertura parcial; consultar fuente y período'
    default:
      return 'Información no disponible para este municipio'
  }
}

function availabilityFrom(status: string): 'available' | 'not_available' {
  return status === 'observed' || status === 'partial' ? 'available' : 'not_available'
}

function nationalityTable(data: NationalityData): ExportTable {
  return {
    id: DIMENSION_BLOCK_IDS.nacionalidad,
    titulo: 'Nacionalidad',
    hoja: '01_PERFIL_DEMOGRÁFICO',
    columnas: ['Nacionalidad', 'Personas', '% sobre total'],
    filas: [
      [labelCell('Española'), numCell(data.spanish), pctCell(data.spanishPercent)],
      [labelCell('Extranjera'), numCell(data.foreign), pctCell(data.foreignPercent)],
    ],
    fuente: `${data.source.label} · ${OP_CENSO_ANUAL} · Tabla ${data.source.tableId}`,
    periodo: data.period,
    cobertura: 'Municipio',
    estado: estadoFrom(data.status),
    source: registrySource('ine_nationality_68535'),
    comparisonMode: 'municipal_only',
    availability: availabilityFrom(data.status),
    note:
      data.status === 'suppressed'
        ? 'Nacionalidad: dato no publicado por secreto estadístico para este municipio.'
        : 'Nacionalidad publicada por el INE a nivel municipal.',
  }
}

function birthCountryTable(data: BirthCountryData): ExportTable {
  const filas: ExportCell[][] = []
  if (data.spain) filas.push([labelCell(`Nacida en ${data.spain.label}`), numCell(data.spain.value)])
  for (const country of data.topCountries) {
    filas.push([labelCell(country.label), numCell(country.value)])
  }
  if (filas.length === 0) filas.push([labelCell('Población según país de nacimiento'), numCell(null)])
  return {
    id: DIMENSION_BLOCK_IDS.nacimiento,
    titulo: 'Lugar de nacimiento',
    hoja: '01_PERFIL_DEMOGRÁFICO',
    columnas: ['País de nacimiento', 'Personas'],
    filas,
    fuente: `${data.source.label} · ${OP_CENSO_ANUAL} · Tabla ${data.source.tableId}`,
    periodo: data.period,
    cobertura: 'Municipio',
    estado: estadoFrom(data.status),
    source: registrySource('ine_birth_country_66322'),
    comparisonMode: 'municipal_only',
    availability: availabilityFrom(data.status),
    note:
      'Las categorías publicadas no equivalen a una distribución completa de población nacida en el extranjero.',
  }
}

function arraigoTable(data: ArraigoData): ExportTable {
  return {
    id: DIMENSION_BLOCK_IDS.arraigo,
    titulo: 'Arraigo territorial',
    hoja: '01_PERFIL_DEMOGRÁFICO',
    columnas: ['Arraigo territorial', 'Personas', '% sobre total'],
    filas: data.categories.map((c) => [labelCell(c.label), numCell(c.value), pctCell(c.percent)]),
    fuente: `${data.source.label} · ${OP_CENSO_ANUAL} · Tabla ${data.source.tableId}`,
    periodo: data.period,
    cobertura: 'Municipio',
    estado: estadoFrom(data.status),
    source: registrySource('ine_birth_residence_68540'),
    comparisonMode: 'municipal_only',
    availability: availabilityFrom(data.status),
  }
}

/**
 * Convierte el DTO lateral en tablas exportables. Devuelve [] si no hay DTO o
 * ninguna de las tres dimensiones tiene período publicado.
 */
export function buildDemographicDimensionTables(
  data: DemographicPresentationData | null | undefined,
): ExportTable[] {
  if (!data) return []
  const tablas: ExportTable[] = []
  if (data.nationality) tablas.push(nationalityTable(data.nationality))
  if (data.birthCountry) tablas.push(birthCountryTable(data.birthCountry))
  if (data.birthResidenceRelation) tablas.push(arraigoTable(data.birthResidenceRelation))
  return tablas
}
