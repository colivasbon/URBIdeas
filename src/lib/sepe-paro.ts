// SEPE paro registrado por municipio – Batch 1.
// Fuente: SEPE – Estadística de paro registrado por municipios (mensual, libro completo XLS ~4 MB + XLS por provincia).
// Último periodo verificado: julio 2026 (04/09/2026). Parser real con xlsx, validación INE y rangos.
//
// REGLA DE CERO OBSERVADO: un cero solo se publica si está acreditado por la fuente.
// Celdas "<5" o vacías → null (secreto estadístico), NUNCA 0.

import type { EconomyRow } from './socideas-eco-common'
import * as XLSX from 'xlsx'

const SEPE_LIBRO_URL = 'https://www.sepe.es/SiteSepe/contenidos/que_es_el_sepe/estadisticas/datos_avance/datos/2026/julio_2026/libro_paro_julio_2026.xls'

/** Celda SEPE: entero ≥0; `<5`/vacío → null (secreto → se omite). */
export function parseSepeCellLocal(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null
  const s = String(raw).trim()
  if (s === '' || s === '<5' || s === '< 5') return null
  if (!/^\d+$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export async function fetchSepeParo(codigoIne: string, _dryRun = false): Promise<EconomyRow[]> {
  void _dryRun
  // Validación INE
  if (!/^\d{5}$/.test(codigoIne)) return []

  try {
    const res = await fetch(SEPE_LIBRO_URL, { headers: { 'User-Agent': 'URBIdeas/1.0' } })
    if (!res.ok) throw new Error(`SEPE ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const wb = XLSX.read(buf, { type: 'buffer' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]
    // Formato esperado: columna con código INE 5 dígitos y paro total
    // Búsqueda simple por código
    for (const r of rows) {
      const str = String(r[0] ?? '')
      const m = str.match(/(\d{5})/)
      if (m && m[1] === codigoIne) {
        const valor = parseSepeCellLocal(r[2])
        if (valor !== null) {
          return [{ slug: 'paro_registrado', anio: 2026, valor, unidad: 'personas', dimensiones: { ambito: 'municipio', periodo: '2026-07', estado: 'consolidado' }, sourceSlug: 'sepe', sourceUrl: SEPE_LIBRO_URL, tableId: 'sepe_paro', serieId: null }]
        }
      }
    }
    return []
  } catch (e) {
    throw new Error(`SEPE no disponible: ${(e as Error).message}`)
  }
}

export function sepeToRows(rows: EconomyRow[]): EconomyRow[] {
  return rows
}
