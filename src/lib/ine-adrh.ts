// Adaptador SERVIDOR para el Atlas de Distribución de Renta de los Hogares
// (INE, ADRH). Fase 2B SOCideas. NUNCA importar desde cliente.
//
// Cobertura verificada (docs/socideas-phase-2b-economic-sources.md):
// - Serie 2015-2023. Renta neta/bruta por persona y hogar: todos los municipios.
// - Gini y P80/P20: solo municipios con 100+ residentes (metodología oct-2025).
// - Tempus3 tabla 53688 (verificada en vivo): nacional/CCAA/provincia/islas.
//   Series ADRH9974xxx; Gini unidad FK 101, P80/P20 unidad FK 123; campo Secreto.
// - Nivel municipal: descargas CSV por tabla
//   (https://www.ine.es/jaxiT3/files/t/csv_bd/{tabla}.csv, formato verificado:
//   columnas Municipios, Distritos, Secciones, Indicador, Periodo, Total).
import { EcoError, extractIne5, fetchEco, parseEsNumber } from './socideas-eco-common'
import type { EconomyRow } from './socideas-eco-common'

const INE_BASE = 'https://servicios.ine.es/wstempus/js/ES'
export const ADRH_TABLE_ID = 53688
const FETCH_TIMEOUT_MS = 30000

/** Tablas ADRH de descarga municipal por provincia (verificadas en vivo en el
 * catálogo INEbase: gini = "Índice de Gini y P80/P20", renta = "Indicadores de
 * renta media y mediana"). Provincias no listadas: resolver su ID en el
 * catálogo antes de sincronizar (nunca inventar un ID). */
export const ADRH_PROVINCE_TABLES: Record<string, { gini: number; renta: number }> = {
  '02': { gini: 37678, renta: 30656 }, // Albacete
  '15': { gini: 37694, renta: 30989 }, // A Coruña
  '41': { gini: 37716, renta: 31205 }, // Sevilla
  '50': { gini: 37724, renta: 31277 }, // Zaragoza
}

interface AdrhSerie {
  COD?: string
  Nombre?: string
  FK_Unidad?: number
  Data?: { Anyo?: number; Valor?: number | null; Secreto?: boolean; Notas?: { texto?: string }[] }[]
  MetaData?: { Id: number; FK_Variable?: number; Codigo?: string; Nombre?: string }[]
}

async function fetchJson(url: string): Promise<unknown> {
  let last: unknown = null
  for (let attempt = 0; attempt <= 1; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'URBIdeas/1.0' },
      })
      if (!res.ok) throw new EcoError(`INE respondió ${res.status}`, url, res.status)
      return (await res.json()) as unknown
    } catch (err) {
      last = err
      if (attempt < 1) await new Promise((r) => setTimeout(r, 1000))
    } finally {
      clearTimeout(timer)
    }
  }
  if (last instanceof EcoError) throw last
  throw new EcoError(last instanceof Error ? `Fallo de red hacia el INE: ${last.message}` : 'Fallo de red', url)
}

export interface AdrhPunto {
  anio: number
  valor: number
}

/** Serie de comparativa (provincia/CCAA/España) de Gini o P80/P20.
 * Localiza la serie por nombre de territorio + indicador en la tabla 53688. */
export async function fetchAdrhComparativa(
  territorio: string,
  indicador: 'gini' | 'p80_p20',
  nult?: number,
): Promise<{ puntos: AdrhPunto[]; serieId?: string; sourceUrl: string }> {
  const nultParam = nult !== undefined ? `?nult=${nult}&tip=AM` : '?tip=AM'
  const sourceUrl = `${INE_BASE}/DATOS_TABLA/${ADRH_TABLE_ID}${nultParam}`
  const payload = (await fetchJson(sourceUrl)) as AdrhSerie[]
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new EcoError(`Tabla ADRH ${ADRH_TABLE_ID} sin series`, sourceUrl)
  }
  const want = indicador === 'gini' ? 'indice de gini' : 'p80/p20'
  const norm = (s: string): string =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  // Los nombres de CCAA de nuestra BD no siempre coinciden con Tempus3
  // ("Castilla-La Mancha" vs "Castilla - La Mancha"; "Comunidad de Madrid" vs
  // "Madrid, Comunidad de"): coincidencia por palabras significativas.
  const stop = new Set(['de', 'la', 'el', 'las', 'los', 'y', 'del'])
  const words = norm(territorio).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !stop.has(w))
  const found = payload.find((s) => {
    const name = norm(s.Nombre ?? '')
    return name.includes(want) && words.every((w) => name.includes(w))
  })
  if (!found) {
    throw new EcoError(`Serie ADRH ${indicador} ausente para ${territorio}`, sourceUrl)
  }
  const puntos = (found.Data ?? [])
    .filter((d) => typeof d.Anyo === 'number' && typeof d.Valor === 'number' && d.Secreto !== true)
    .map((d) => ({ anio: d.Anyo as number, valor: d.Valor as number }))
    .sort((a, b) => a.anio - b.anio)
  return { puntos, serieId: found.COD, sourceUrl }
}

export interface AdrhMunicipalRow {
  codigoIne: string
  indicador: 'gini' | 'p80_p20' | 'renta_neta_persona' | 'renta_neta_hogar' | 'renta_bruta_persona' | 'renta_bruta_hogar' | null
  anio: number
  valor: number
}

/** Parsea una descarga CSV municipal ADRH (separador tab, ; o ,, decimales con coma).
 * Formato verificado tabla 37683: Municipios;Distritos;Secciones;Indicador;Periodo;Total
 * donde "Municipios" contiene "05001 Adanero". Solo filas de nivel municipal
 * (distrito y sección vacíos). */
export function parseAdrhMunicipalCsv(csv: string, codigoIne: string): AdrhMunicipalRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length < 2) throw new EcoError('CSV ADRH vacío', 'descarga ADRH')
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase())
  const iMuni = headers.findIndex((h) => h.includes('municip'))
  const iInd = headers.findIndex((h) => h.includes('indicador') || h.includes('índice') || h.includes('indice'))
  const iPer = headers.findIndex((h) => h.includes('periodo') || h.includes('período') || h.includes('año') || h.includes('anyo'))
  const iVal = headers.findIndex((h) => h.includes('total') || h.includes('valor'))
  const iDis = headers.findIndex((h) => h.includes('distrito'))
  const iSec = headers.findIndex((h) => h.includes('secci'))
  if (iMuni < 0 || iInd < 0 || iPer < 0 || iVal < 0) {
    throw new EcoError('CSV ADRH con formato inesperado', 'descarga ADRH')
  }
  const out: AdrhMunicipalRow[] = []
  for (const line of lines.slice(1)) {
    const cols = line.split(sep)
    if (iDis >= 0 && (cols[iDis] ?? '').trim() !== '') continue
    if (iSec >= 0 && (cols[iSec] ?? '').trim() !== '') continue
    if (extractIne5(cols[iMuni] ?? '') !== codigoIne) continue
    const indRaw = (cols[iInd] ?? '').toLowerCase()
    const indicador: AdrhMunicipalRow['indicador'] = indRaw.includes('gini')
      ? 'gini'
      : indRaw.includes('p80') ? 'p80_p20'
      : indRaw.includes('neta') && indRaw.includes('hogar') ? 'renta_neta_hogar'
      : indRaw.includes('neta') ? 'renta_neta_persona'
      : indRaw.includes('bruta') && indRaw.includes('hogar') ? 'renta_bruta_hogar'
      : indRaw.includes('bruta') ? 'renta_bruta_persona'
      : null
    if (!indicador) continue
    const anio = parseInt((cols[iPer] ?? '').trim(), 10)
    const valor = parseEsNumber(cols[iVal] ?? '')
    if (!Number.isInteger(anio) || valor === null) continue // secreto/ND: se omite, nunca cero
    out.push({ codigoIne, indicador, anio, valor })
  }
  return out
}

const ADRH_SLUG: Record<NonNullable<AdrhMunicipalRow['indicador']>, { slug: string; unidad: string }> = {
  gini: { slug: 'gini', unidad: 'puntos' },
  p80_p20: { slug: 'p80_p20', unidad: 'ratio' },
  renta_neta_persona: { slug: 'renta_neta_media_persona', unidad: 'euros' },
  renta_neta_hogar: { slug: 'renta_neta_media_hogar', unidad: 'euros' },
  renta_bruta_persona: { slug: 'renta_bruta_media_persona', unidad: 'euros' },
  renta_bruta_hogar: { slug: 'renta_bruta_media_hogar', unidad: 'euros' },
}

export function adrhToRows(
  rows: AdrhMunicipalRow[],
  sourceUrl: string,
  tableId: string,
): EconomyRow[] {
  return rows.map((r) => {
    const meta = ADRH_SLUG[r.indicador as keyof typeof ADRH_SLUG]
    return {
      slug: meta.slug,
      anio: r.anio,
      valor: r.valor,
      unidad: meta.unidad,
      dimensiones: { ambito: 'municipio' },
      sourceSlug: 'ine_adrh',
      sourceUrl,
      tableId,
      serieId: null,
    } satisfies EconomyRow
  })
}

/** Descarga un CSV municipal ADRH por ID de tabla jaxiT3. */
export async function fetchAdrhCsv(tableId: number | string): Promise<{ text: string; url: string }> {
  const url = `https://www.ine.es/jaxiT3/files/t/csv_bd/${tableId}.csv`
  const res = await fetchEco(url, 60000)
  return { text: await res.text(), url }
}
