// TGSS afiliación por municipio – Batch 1.
// Fuente: TGSS – Afiliación último día del mes, Muni072026 (14/08/2026), XLSX ~510 KB.
// Regla secreto: "<5" → null + flag secreto:true, nunca 0.

import type { EconomyRow } from './socideas-eco-common'
import * as XLSX from 'xlsx'

const TGSS_URL = 'https://www.seg-social.es/wps/wcm/connect/wss/.../Muni072026.xlsx'

export async function fetchTgssAfiliacion(codigoIne: string, _dryRun = false): Promise<EconomyRow[]> {
  void _dryRun
  if (!/^\d{5}$/.test(codigoIne)) return []
  try {
    const res = await fetch(TGSS_URL, { headers: { 'User-Agent': 'URBIdeas/1.0' } })
    if (!res.ok) throw new Error(`TGSS ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const wb = XLSX.read(buf, { type: 'buffer' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]
    for (const r of rows) {
      const str = String(r[0] ?? '')
      const m = str.match(/(\d{5})/)
      if (m && m[1] === codigoIne) {
        const raw = String(r[1] ?? '').trim()
        if (raw === '<5' || raw === '< 5') {
          return [{ slug: 'afiliacion_total', anio: 2026, valor: null as unknown as number, unidad: 'personas', dimensiones: { ambito: 'municipio', periodo: '2026-07', estado: 'consolidado', secreto: 'true' }, sourceSlug: 'tgss', sourceUrl: TGSS_URL, tableId: 'tgss_afiliacion', serieId: null }]
        }
        const valor = Number(String(raw).replace(/\./g, '').replace(',', '.'))
        if (Number.isFinite(valor) && valor >= 0) {
          return [{ slug: 'afiliacion_total', anio: 2026, valor, unidad: 'personas', dimensiones: { ambito: 'municipio', periodo: '2026-07', estado: 'consolidado' }, sourceSlug: 'tgss', sourceUrl: TGSS_URL, tableId: 'tgss_afiliacion', serieId: null }]
        }
      }
    }
    return []
  } catch (e) {
    throw new Error(`TGSS no disponible: ${(e as Error).message}`)
  }
}

export function tgssToRows(rows: EconomyRow[]): EconomyRow[] {
  return rows
}
