// Stub SEPE paro registrado por municipio – Batch 1 (dry-run).
// Fuente: SEPE – Estadística de paro registrado por municipios (mensual, libro completo XLS ~4 MB + XLS por provincia).
// Último periodo verificado: julio 2026. Implementación real parseará XLS con `xlsx` y mapeará código INE.
// En dry-run no se descarga nada.

import type { EconomyRow } from './socideas-eco-common'

export async function fetchSepeParo(_codigoIne: string, _dryRun = true): Promise<EconomyRow[]> {
  void _dryRun
  // Dry-run: no descarga; retorna vacío. En implementación real:
  // - Descargar https://www.sepe.es/.../libro completo julio 2026 (~4 MB) o XLS provincia
  // - Parsear con xlsx, filtrar por codigoIne, extraer paro_total, paro_hombres/mujeres, contratos
  // - Validar año=2026, mes=07, valor >=0, secreto no aplica
  // - Retornar filas con slug paro_registrado / contratos, fuente sepe, bloque paro, fecha_referencia 2026-07-01
  return []
}

export function sepeToRows(rows: EconomyRow[]): EconomyRow[] {
  return rows
}
