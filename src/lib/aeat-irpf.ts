// Adaptador SERVIDOR para la Estadística de declarantes del IRPF por municipios
// (AEAT, EDM). Fase 2B SOCideas. NUNCA importar desde cliente.
//
// Cobertura verificada (docs/socideas-phase-2b-economic-sources.md):
// - Municipios de más de 1.000 habitantes del territorio fiscal común
//   (sin País Vasco ni Navarra: régimen foral).
// - Último ejercicio publicado: 2023 (1-oct-2025); periodicidad anual.
// - Variables: nº declaraciones, renta bruta/disponible media (POR DECLARACIÓN).
// - Formato: publicación HTML estable por ejercicio + ficheros base xlsx.
//   La URL del fichero base se resuelve por ejercicio; el parseo detecta
//   cabeceras por nombre (tolerante a cambios menores entre ejercicios).
import * as XLSX from 'xlsx'
import { EcoError, extractIne5, fetchEco, parseEsNumber } from './socideas-eco-common'
import type { EconomyRow } from './socideas-eco-common'

const AEAT_CATALOGO = 'https://sede.agenciatributaria.gob.es/Sede/datosabiertos/catalogo/hacienda/Estadistica_de_los_declarantes_del_IRPF_por_municipios.shtml'
// Patrón de publicación anual verificado para 2013-2023.
const AEAT_HOME = (ejercicio: number): string =>
  `https://sede.agenciatributaria.gob.es/AEAT/Contenidos_Comunes/La_Agencia_Tributaria/Estadisticas/Publicaciones/sites/irpfmunicipios/${ejercicio}/home.html`

export interface IrpfMunicipio {
  codigoIne: string
  ejercicio: number
  declaraciones: number | null
  rentaBrutaMedia: number | null
  rentaDisponibleMedia: number | null
  sourceUrl: string
}

/** Cabeceras aceptadas (minúsculas, sin acentos) por variable objetivo. */
const HEADERS = {
  municipio: ['municipio', 'nombre del municipio', 'municipios', 'codigo ine', 'cod ine', 'cod_ine', 'codmun'],
  declaraciones: ['numero de declaraciones', 'nº declaraciones', 'num declaraciones', 'declaraciones', 'número declaraciones'],
  bruta: ['renta bruta media', 'renta bruta', 'bruta media'],
  disponible: ['renta disponible media', 'renta disponible', 'disponible media'],
} as const

const norm = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

function findCol(headers: string[], keys: readonly string[]): number {
  const nn = headers.map(norm)
  for (const k of keys) {
    const i = nn.findIndex((h) => h === k || h.includes(k))
    if (i >= 0) return i
  }
  return -1
}

/** Parsea el fichero base xlsx de un ejercicio y extrae la fila del municipio. */
export function parseIrpfBase(
  buffer: ArrayBuffer,
  ejercicio: number,
  codigoIne: string,
  sourceUrl: string,
): IrpfMunicipio {
  const wb = XLSX.read(buffer, { type: 'array' })
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    if (!ws) continue
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null })
    if (aoa.length < 3) continue
    // Localiza la fila de cabecera (la que contiene "municipio" + renta).
    let headerIdx = -1
    for (let i = 0; i < Math.min(aoa.length, 15); i++) {
      const row = (aoa[i] ?? []).map((c) => String(c ?? ''))
      if (findCol(row, HEADERS.municipio) >= 0 && findCol(row, HEADERS.bruta) >= 0) {
        headerIdx = i
        break
      }
    }
    if (headerIdx < 0) continue
    const headers = (aoa[headerIdx] ?? []).map((c) => String(c ?? ''))
    const cMuni = findCol(headers, HEADERS.municipio)
    const cDecl = findCol(headers, HEADERS.declaraciones)
    const cBruta = findCol(headers, HEADERS.bruta)
    const cDisp = findCol(headers, HEADERS.disponible)
    if (cMuni < 0 || cBruta < 0) continue
    for (let i = headerIdx + 1; i < aoa.length; i++) {
      const row = aoa[i] ?? []
      const ine = extractIne5(String(row[cMuni] ?? ''))
      if (ine !== codigoIne) continue
      return {
        codigoIne,
        ejercicio,
        declaraciones: cDecl >= 0 ? parseEsNumber(row[cDecl]) && Math.round(parseEsNumber(row[cDecl]) as number) : null,
        rentaBrutaMedia: parseEsNumber(row[cBruta]),
        rentaDisponibleMedia: cDisp >= 0 ? parseEsNumber(row[cDisp]) : null,
        sourceUrl,
      }
    }
  }
  throw new EcoError(
    `Municipio ${codigoIne} no publicado en EDM ${ejercicio} (posible <1.000 hab. o territorio foral)`,
    sourceUrl,
  )
}

export function irpfToRows(m: IrpfMunicipio, nombreAmbito?: { provincia?: string; ccaa?: string }): EconomyRow[] {
  const rows: EconomyRow[] = []
  const tableId = `EDM${m.ejercicio}`
  if (m.declaraciones !== null) {
    rows.push({
      slug: 'irpf_declaraciones', anio: m.ejercicio, valor: m.declaraciones, unidad: 'declaraciones',
      dimensiones: { ambito: 'municipio' }, sourceSlug: 'aeat_edm',
      sourceUrl: m.sourceUrl, tableId, serieId: null,
    })
  }
  if (m.rentaBrutaMedia !== null) {
    rows.push({
      slug: 'irpf_renta_bruta_media', anio: m.ejercicio, valor: m.rentaBrutaMedia, unidad: 'euros',
      dimensiones: { ambito: 'municipio', tipo_renta: 'bruta' }, sourceSlug: 'aeat_edm',
      sourceUrl: m.sourceUrl, tableId, serieId: null,
    })
  }
  if (m.rentaDisponibleMedia !== null) {
    rows.push({
      slug: 'irpf_renta_disponible_media', anio: m.ejercicio, valor: m.rentaDisponibleMedia, unidad: 'euros',
      dimensiones: { ambito: 'municipio', tipo_renta: 'disponible' }, sourceSlug: 'aeat_edm',
      sourceUrl: m.sourceUrl, tableId, serieId: null,
    })
  }
  // Comparativas homogéneas de la propia publicación (si el sync las aporta).
  void nombreAmbito
  return rows
}

/** Descarga el fichero base de un ejercicio. La URL exacta del xlsx se publica
 * en la home del ejercicio; este helper acepta la URL directa del fichero. */
export async function fetchIrpfBaseXlsx(fileUrl: string): Promise<ArrayBuffer> {
  const res = await fetchEco(fileUrl, 60000)
  return res.arrayBuffer()
}

export function aeatHomeUrl(ejercicio: number): string {
  return AEAT_HOME(ejercicio)
}

export function aeatCatalogoUrl(): string {
  return AEAT_CATALOGO
}
