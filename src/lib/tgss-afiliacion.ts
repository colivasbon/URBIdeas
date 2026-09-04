// Stub TGSS afiliación por municipio – Batch 1 (dry-run).
// Fuente: TGSS – Afiliación último día del mes, Muni072026 (14/08/2026), XLSX ~510 KB.
// Regla secreto: "<5" → null + flag, nunca 0.

import type { EconomyRow } from './socideas-eco-common'

export async function fetchTgssAfiliacion(_codigoIne: string, _dryRun = true): Promise<EconomyRow[]> {
  void _dryRun
  // Dry-run: no descarga. En implementación real:
  // - Descargar https://.../Muni072026.xlsx
  // - Parsear con xlsx, filtrar codigoIne, mapear afiliados_total, si "<5" → {valor: null, dimensiones: {secreto:"true"}}
  // - Validar mes 2026-07, valor >=0 o secreto
  // - Retornar filas con slug afiliacion_total, fuente tgss, bloque afiliacion, fecha_referencia 2026-07-31
  return []
}

export function tgssToRows(rows: EconomyRow[]): EconomyRow[] {
  return rows
}
