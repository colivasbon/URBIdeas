// Adaptador SERVIDOR para el Censo Agrario 2020 a nivel municipal (INE).
// Fase 2B SOCideas. NUNCA importar desde cliente.
//
// Indicador ESTRUCTURAL del año 2020 (no anual): el año se muestra siempre y la
// ficha incluye el aviso "estructural". Selección agregada y trazable (ver
// docs/socideas-phase-2b-economic-sources.md): 5 categorías de superficie (ha),
// nº de explotaciones, y ganadería (explotaciones + cabezas por especie).
// Secreto estadístico / ND: se omiten (nunca se convierten a cero).
import { EcoError, extractIne5, fetchEco, parseEsNumber } from './socideas-eco-common'
import type { EconomyRow } from './socideas-eco-common'

export const CENSO_AGRARIO_ANIO = 2020
export const CA_TABLE_ID = 29006
// Filtros tv= exigen el Id de la VARIABLE de municipios en Tempus3 (19,
// verificado en vivo); el Id numérico del valor se resuelve en el catálogo.
export const CA_VAR_MUNICIPIO = 19

export type CategoriaAgraria = 'sau_total' | 'arable' | 'lenosos' | 'pastos' | 'huertos'
export type EspecieGanadera = 'bovino' | 'ovino_caprino' | 'porcino' | 'aves'

export interface CensoAgrarioMunicipio {
  codigoIne: string
  superficies: Partial<Record<CategoriaAgraria, number>>
  explotaciones: number | null
  ganaderia: Partial<Record<EspecieGanadera, { exp: number | null; cab: number | null }>>
}

/** Detección de categoría por nombre de fila/columna (tolerante). */
function categoriaDe(texto: string): CategoriaAgraria | null {
  const t = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (/sau|superficie agricola utilizada.*total|superficie total.*sau/.test(t)) return 'sau_total'
  if (/arable|herbace|barbecho|tierra labrada/.test(t)) return 'arable'
  if (/leñ|lenos|permanente.*cultivo|cultivo.*permanente/.test(t)) return 'lenosos'
  if (/pasto/.test(t)) return 'pastos'
  if (/huerto/.test(t)) return 'huertos'
  return null
}

function especieDe(texto: string): EspecieGanadera | null {
  const t = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (/bovino|vacuno/.test(t)) return 'bovino'
  if (/ovino|caprino/.test(t)) return 'ovino_caprino'
  if (/porcino/.test(t)) return 'porcino'
  if (/ave|pollos|gallinas/.test(t)) return 'aves'
  return null
}

/** Parsea una descarga CSV municipal del Censo Agrario (separador ; o ,).
 * Busca la fila del municipio por código INE de 5 dígitos y extrae las
 * categorías por nombre de columna o de fila según el layout (ancho/largo). */
export function parseCensoAgrarioCsv(csv: string, codigoIne: string): CensoAgrarioMunicipio {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length < 2) throw new EcoError('CSV de Censo Agrario vacío', 'descarga CA2020')
  const sep = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(sep).map((h) => h.trim())
  const normH = headers.map((h) => h.toLowerCase())
  const iMuni = normH.findIndex((h) => h.includes('municip') || h.includes('cod'))
  if (iMuni < 0) throw new EcoError('CSV de Censo Agrario sin columna municipal', 'descarga CA2020')
  const target = lines.slice(1).find((l) => extractIne5(l.split(sep)[iMuni] ?? '') === codigoIne)
  if (!target) {
    throw new EcoError(
      `Municipio ${codigoIne} sin datos en Censo Agrario 2020 (posible secreto estadístico)`,
      'descarga CA2020',
    )
  }
  const cols = target.split(sep)
  const out: CensoAgrarioMunicipio = { codigoIne, superficies: {}, explotaciones: null, ganaderia: {} }
  headers.forEach((h, i) => {
    const cat = categoriaDe(h)
    if (cat) {
      const v = parseEsNumber(cols[i])
      if (v !== null) out.superficies[cat] = v
      return
    }
    if (/explotacion/.test(h.toLowerCase()) && !especieDe(h)) {
      const v = parseEsNumber(cols[i])
      if (v !== null) out.explotaciones = Math.round(v)
      return
    }
    const esp = especieDe(h)
    if (esp) {
      const v = parseEsNumber(cols[i])
      if (v === null) return
      const cur = out.ganaderia[esp] ?? { exp: null, cab: null }
      if (/explotacion|num.*exp/.test(h.toLowerCase())) cur.exp = Math.round(v)
      else cur.cab = Math.round(v)
      out.ganaderia[esp] = cur
    }
  })
  return out
}

const CATEGORIA_SLUG: Record<CategoriaAgraria, string> = {
  sau_total: 'agr_sau_total',
  arable: 'agr_tierra_arable',
  lenosos: 'agr_cultivos_lenosos',
  pastos: 'agr_pastos',
  huertos: 'agr_huertos',
}

const ESPECIE_SLUG: Record<EspecieGanadera, { exp: string; cab: string }> = {
  bovino: { exp: 'gan_bovino_exp', cab: 'gan_bovino_cab' },
  ovino_caprino: { exp: 'gan_ovino_caprino_exp', cab: 'gan_ovino_caprino_cab' },
  porcino: { exp: 'gan_porcino_exp', cab: 'gan_porcino_cab' },
  aves: { exp: 'gan_aves_exp', cab: 'gan_aves_cab' },
}

export function censoAgrarioToRows(
  m: CensoAgrarioMunicipio,
  sourceUrl: string,
  tableId: string,
): EconomyRow[] {
  const rows: EconomyRow[] = []
  const base = {
    sourceSlug: 'ine_censo_agrario' as const,
    sourceUrl,
    tableId,
    serieId: null as string | null,
  }
  for (const [cat, valor] of Object.entries(m.superficies)) {
    if (valor === undefined) continue
    rows.push({
      ...base, slug: CATEGORIA_SLUG[cat as CategoriaAgraria], anio: CENSO_AGRARIO_ANIO,
      valor, unidad: 'hectareas', dimensiones: { ambito: 'municipio', categoria: cat },
    })
  }
  if (m.explotaciones !== null) {
    rows.push({
      ...base, slug: 'agr_explotaciones', anio: CENSO_AGRARIO_ANIO, valor: m.explotaciones,
      unidad: 'explotaciones', dimensiones: { ambito: 'municipio' },
    })
  }
  for (const [esp, g] of Object.entries(m.ganaderia)) {
    if (!g) continue
    const slugs = ESPECIE_SLUG[esp as EspecieGanadera]
    if (g.exp !== null) {
      rows.push({
        ...base, slug: slugs.exp, anio: CENSO_AGRARIO_ANIO, valor: g.exp,
        unidad: 'explotaciones',
        dimensiones: { ambito: 'municipio', especie: esp, medida: 'explotaciones' },
      })
    }
    if (g.cab !== null) {
      rows.push({
        ...base, slug: slugs.cab, anio: CENSO_AGRARIO_ANIO, valor: g.cab,
        unidad: 'cabezas',
        dimensiones: { ambito: 'municipio', especie: esp, medida: 'cabezas' },
      })
    }
  }
  return rows
}

/** Descarga un CSV municipal del Censo Agrario por URL oficial. */
export async function fetchCensoAgrarioCsv(url: string): Promise<string> {
  const res = await fetchEco(url, 60000)
  return res.text()
}

interface CaSerie {
  COD?: string
  Nombre?: string
  T3_Unidad?: string
  MetaData?: { Id: number; T3_Variable?: string; Codigo?: string; Nombre?: string }[]
  Data?: { Anyo?: number; Valor?: number | null }[]
}

async function fetchJson(url: string, timeoutMs = 30000): Promise<unknown> {
  let last: unknown = null
  for (let attempt = 0; attempt <= 1; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
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

const caCatalogCache = new Map<string, number>()

/** Resuelve el Id numérico del municipio en la tabla 29006 (filtros tv=
 * exigen Id, no código). Cacheado por proceso. */
export async function resolveCaMunicipioValueId(codigoIne: string): Promise<number> {
  const hit = caCatalogCache.get(codigoIne)
  if (hit) return hit
  const url = `https://servicios.ine.es/wstempus/js/ES/SERIES_TABLA/${CA_TABLE_ID}?tip=M`
  const series = (await fetchJson(url, 60000)) as CaSerie[]
  if (!Array.isArray(series)) throw new EcoError('Formato inesperado en catálogo CA2020', url)
  for (const s of series) {
    const muni = (s.MetaData ?? []).find((m) => m.Codigo === codigoIne)
    if (muni) {
      caCatalogCache.set(codigoIne, muni.Id)
      return muni.Id
    }
  }
  throw new EcoError(
    `Municipio ${codigoIne} no encontrado en Censo Agrario 2020 (posible secreto estadístico)`,
    url,
  )
}

/** Agregados municipales del Censo Agrario 2020 vía Tempus3 (tabla 29006):
 * SAU (ha), nº de explotaciones y unidades ganaderas totales. Año único 2020,
 * carácter estructural. El detalle por cultivos y especies solo está en
 * descargas jaxiT3 (pendiente de resolver IDs por provincia). */
export async function fetchCensoTempus(codigoIne: string): Promise<EconomyRow[]> {
  const valueId = await resolveCaMunicipioValueId(codigoIne)
  const sourceUrl =
    `https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/${CA_TABLE_ID}?tip=AM&tv=${CA_VAR_MUNICIPIO}:${valueId}`
  const series = (await fetchJson(sourceUrl, 60000)) as CaSerie[]
  if (!Array.isArray(series) || series.length === 0) {
    throw new EcoError(`Sin series CA2020 para ${codigoIne}`, sourceUrl)
  }
  const pick = (match: RegExp): CaSerie => {
    const found = series.find((s) =>
      (s.MetaData ?? []).some((m) => m.T3_Variable === 'Unidad de medida' && match.test(m.Nombre ?? '')),
    )
    if (!found) throw new EcoError(`Serie CA2020 ${match} ausente para ${codigoIne}`, sourceUrl)
    return found
  }
  const rows: EconomyRow[] = []
  const push = (serie: CaSerie, slug: string, unidad: string, dimensiones: Record<string, string>): void => {
    const d = (serie.Data ?? []).find((p) => typeof p.Anyo === 'number' && typeof p.Valor === 'number')
    if (!d) return // ND/secreto: se omite, nunca cero
    rows.push({
      slug,
      anio: d.Anyo as number,
      valor: d.Valor as number,
      unidad,
      dimensiones: { ambito: 'municipio', ...dimensiones },
      sourceSlug: 'ine_censo_agrario',
      sourceUrl,
      tableId: String(CA_TABLE_ID),
      serieId: serie.COD ?? null,
    })
  }
  push(pick(/SAU/i), 'agr_sau_total', 'hectareas', { categoria: 'sau_total' })
  push(pick(/explotaciones/i), 'agr_explotaciones', 'explotaciones', {})
  push(pick(/unidades ganaderas/i), 'gan_ug_total', 'unidades_ganaderas', { especie: 'todas', medida: 'ug' })
  if (rows.length === 0) {
    throw new EcoError(`CA2020 sin valores publicados para ${codigoIne}`, sourceUrl)
  }
  return rows
}
