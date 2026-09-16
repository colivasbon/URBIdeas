// Adaptador de SOLO LECTURA para volcar los flujos migratorios
// (emigración al extranjero 69711, inmigración intermunicipal 69743 y
// emigración intermunicipal 69746) al libro XLSX.
// No modifica los bloques web ni el DTO de presentación: solo los transforma en
// tablas exportables con su procedencia oficial centralizada. Sin I/O, sin
// escrituras R2/Supabase, sin secretos.
import type { ExportCell, ExportTable } from './socideas-export'
import type {
  MigrationFlowGroup,
  MigrationPresentationData,
} from './socideas-migration-summary'
import { OP_EMCR, registrySource } from './socideas-source-registry'

export const MIGRATION_BLOCK_IDS = {
  emigracion_extranjero: 'migracion-emigracion-extranjero',
  inmigracion_intermunicipal: 'migracion-inmigracion-intermunicipal',
  emigracion_intermunicipal: 'migracion-emigracion-intermunicipal',
} as const

function labelCell(text: string): ExportCell {
  return { text, numeric: null }
}

function numCell(value: number | null): ExportCell {
  return value === null ? { text: 'ND', numeric: null } : { text: value.toLocaleString('es-ES'), numeric: value }
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

function flowTable(
  id: string,
  titulo: string,
  data: MigrationFlowGroup,
  registryKey: 'ine_migration_abroad_69711' | 'ine_immigration_intermunicipal_69743' | 'ine_emigration_intermunicipal_69746',
): ExportTable {
  return {
    id,
    titulo,
    hoja: '01_PERFIL_DEMOGRÁFICO',
    columnas: ['Sexo', 'Personas'],
    filas: [
      [labelCell('Total'), numCell(data.total)],
      [labelCell('Hombres'), numCell(data.male)],
      [labelCell('Mujeres'), numCell(data.female)],
    ],
    fuente: `${data.source.label} · ${OP_EMCR} · Tabla ${data.source.tableId}`,
    periodo: data.period,
    cobertura: 'Municipio',
    estado: estadoFrom(data.status),
    source: registrySource(registryKey),
    comparisonMode: 'municipal_only',
    availability: availabilityFrom(data.status),
    note:
      data.status === 'suppressed'
        ? `${titulo}: dato no publicado por secreto estadístico para este municipio.`
        : `${titulo} publicado por el INE a nivel municipal.`,
  }
}

/**
 * Convierte el DTO lateral en tablas exportables. Devuelve [] si no hay DTO o
 * ningún flujo tiene período publicado.
 */
export function buildMigrationFlowTables(
  data: MigrationPresentationData | null | undefined,
): ExportTable[] {
  if (!data) return []
  const tablas: ExportTable[] = []
  if (data.emigrationAbroad) tablas.push(flowTable(MIGRATION_BLOCK_IDS.emigracion_extranjero, 'Emigración al extranjero', data.emigrationAbroad, 'ine_migration_abroad_69711'))
  if (data.immigrationIntermunicipal) tablas.push(flowTable(MIGRATION_BLOCK_IDS.inmigracion_intermunicipal, 'Inmigración intermunicipal', data.immigrationIntermunicipal, 'ine_immigration_intermunicipal_69743'))
  if (data.emigrationIntermunicipal) tablas.push(flowTable(MIGRATION_BLOCK_IDS.emigracion_intermunicipal, 'Emigración intermunicipal', data.emigrationIntermunicipal, 'ine_emigration_intermunicipal_69746'))
  return tablas
}
