// DTO de presentación del SALDO migratorio neto municipal (INE 69767).
// Puro y testeable: sin I/O (la capa ya viene leída en `MunicipalIneLayersV1`).
// Separación estricta respecto a los FLUJOS (69711/69743/69746): el saldo es la
// diferencia neta (entradas − salidas), no el número de movimientos. Nunca se
// suman saldos y flujos. Ausencia/secreto → ND, jamás 0.
import type { IneValue, MunicipalIneLayersV1 } from './socideas-ine-layers'

export type BalanceStatus = 'observed' | 'suppressed' | 'missing' | 'partial'

export interface BalanceValue {
  value: number | null
  status: BalanceStatus
}

export interface BalanceSexBlock {
  total: BalanceValue
  interior: BalanceValue
  exterior: BalanceValue
}

export interface MigrationBalancePresentation {
  period: string
  tableId: string
  sourceLabel: string
  total: BalanceValue
  interior: BalanceValue
  exterior: BalanceValue
  bySex?: { male: BalanceSexBlock; female: BalanceSexBlock }
  status: BalanceStatus
}

function toBalanceValue(v: IneValue | undefined): BalanceValue {
  if (!v) return { value: null, status: 'missing' }
  if ((v.status === 'observed' || v.status === 'derived' || v.status === 'partial')) {
    return typeof v.value === 'number'
      ? { value: v.value, status: v.status === 'partial' ? 'partial' : 'observed' }
      : { value: null, status: 'missing' }
  }
  return { value: null, status: v.status === 'suppressed' ? 'suppressed' : 'missing' }
}

function sexBlock(s: { total: IneValue; interior: IneValue; exterior: IneValue }): BalanceSexBlock {
  return {
    total: toBalanceValue(s.total),
    interior: toBalanceValue(s.interior),
    exterior: toBalanceValue(s.exterior),
  }
}

/**
 * Construye el DTO desde las capas INE del municipio. Devuelve null si no hay
 * capa de saldos (municipio sin cobertura o capa no cargada).
 */
export function buildMigrationBalancePresentation(
  layers: MunicipalIneLayersV1 | null | undefined,
): MigrationBalancePresentation | null {
  const mb = layers?.layers?.migrationBalance
  if (!mb) return null
  return {
    period: mb.period,
    tableId: mb.tableId,
    sourceLabel: mb.source,
    total: toBalanceValue(mb.total),
    interior: toBalanceValue(mb.interior),
    exterior: toBalanceValue(mb.exterior),
    bySex: mb.bySex
      ? { male: sexBlock(mb.bySex.male), female: sexBlock(mb.bySex.female) }
      : undefined,
    status: (mb.status as BalanceStatus) ?? 'missing',
  }
}
