// Adaptador SERVIDOR para la Explotación estadística del DIRCE a nivel municipal
// (INE, tabla Tempus3 4721). Fase 2B SOCideas. NUNCA importar desde cliente.
//
// Cobertura verificada (docs/socideas-phase-2b-economic-sources.md + metodología
// municipal DIRCE): empresas activas con sede en el municipio, ref. 1 de enero,
// serie 2012-actualidad. Desglose por tamaño: <1.000 hab. solo total;
// 1.000-5.000 reducida (Total, A2, A3, A4, A11); >5.000 ampliada (A2-A11).
// Grupos: A2 industria (B-E), A3 construcción (F), A4 comercio/transporte/
// hostelería (G-I), A11 total servicios. La tabla 4721 responde >5 MB sin
// filtro: el filtro tv= por municipio es OBLIGATORIO.
import { EcoError } from './socideas-eco-common'
import type { EconomyRow } from './socideas-eco-common'

const INE_BASE = 'https://servicios.ine.es/wstempus/js/ES'
export const DIRCE_TABLE_ID = 4721
const FETCH_TIMEOUT_MS = 30000

interface DirceSerie {
  COD?: string
  Nombre?: string
  T3_Unidad?: string
  MetaData?: { Id: number; FK_Variable?: number; T3_Variable?: string; Codigo?: string; Nombre?: string }[]
  Data?: { Anyo?: number; Valor?: number | null }[]
}

async function fetchJson(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<unknown> {
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

interface DirceCatalog {
  muniByCode: Map<string, number>
  actividadVarId: number
}

const dirceCatalogCache = new Map<number, DirceCatalog>()

/** Catálogo de series DIRCE (1 vez por proceso). Resuelve por variable numérica
 * verificada en vivo: FK_Variable 19 = municipios (código INE de 5 dígitos);
 * la variable de actividad se detecta por sus códigos (AAA/A2…/A11). */
export async function warmDirceCatalog(tableId: number = DIRCE_TABLE_ID): Promise<DirceCatalog> {
  const hit = dirceCatalogCache.get(tableId)
  if (hit) return hit
  const url = `${INE_BASE}/SERIES_TABLA/${tableId}?tip=M`
  const series = (await fetchJson(url, 60000)) as DirceSerie[]
  if (!Array.isArray(series)) throw new EcoError('Formato inesperado en catálogo DIRCE', url)
  const muniByCode = new Map<string, number>()
  let actividadVarId = 0
  for (const s of series) {
    for (const m of s.MetaData ?? []) {
      if (m.FK_Variable === 19 && m.Codigo && /^\d{5}$/.test(m.Codigo)) {
        if (!muniByCode.has(m.Codigo)) muniByCode.set(m.Codigo, m.Id)
      }
      if (m.Codigo && /^(AAA|A\d{1,2})$/.test(m.Codigo) && m.FK_Variable) {
        actividadVarId = m.FK_Variable
      }
      const varName = (m.T3_Variable ?? '').toLowerCase()
      if ((varName.includes('municipio') || varName.includes('cnae') || varName.includes('actividad')) && m.FK_Variable) {
        if (varName.includes('municipio') && m.Codigo && /^\d{5}$/.test(m.Codigo)) {
          if (!muniByCode.has(m.Codigo)) muniByCode.set(m.Codigo, m.Id)
        } else if (!varName.includes('municipio')) {
          actividadVarId = m.FK_Variable
        }
      }
    }
  }
  const cat = { muniByCode, actividadVarId }
  dirceCatalogCache.set(tableId, cat)
  return cat
}

// Grupos Tempus3 de la tabla 4721 verificados en vivo (La Roda 2024):
// AAA total = KAH+KAC+KAI+KAA+KAE+KAD+KAB+KPQ+KRS (suma exacta 1067).
// A11 ("Resto de servicios") EXCLUYE comercio/hostelería: servicios en
// conjunto = A11 + KAI (395+455=850). Los slugs se mapean así; `servicios`
// es calculado y documentado (no publicado como tal por el INE).
const GRUPOS: Record<string, { slug: string; match: RegExp }> = {
  AAA: { slug: 'empresas_total', match: /^AAA$/ },
  KAH: { slug: 'empresas_industria', match: /^KAH$/ },
  KAC: { slug: 'empresas_construccion', match: /^KAC$/ },
  KAI: { slug: 'empresas_comercio_hosteleria', match: /^KAI$/ },
  A11: { slug: '__resto_servicios', match: /^A11$/ },
}

export interface DirceResult {
  codigoIne: string
  unidad: string
  grupos: Record<string, { anio: number; valor: number }[]>
  seriesIds: Record<string, string | undefined>
  sourceUrl: string
}

/** Empresas por grupo de actividad de un municipio (serie anual completa). */
export async function fetchDirceMunicipio(
  codigoIne: string,
  tableId: number = DIRCE_TABLE_ID,
): Promise<DirceResult> {
  const cat = await warmDirceCatalog(tableId)
  const valueId = cat.muniByCode.get(codigoIne)
  if (valueId === undefined) {
    throw new EcoError(
      `Municipio ${codigoIne} no encontrado en DIRCE ${tableId}`,
      `${INE_BASE}/SERIES_TABLA/${tableId}?tip=M`,
    )
  }
  // Variable de municipio: se resuelve por nombre en el catálogo (tolerante).
  const muniVarId = await resolveMuniVarId(tableId)
  const sourceUrl = `${INE_BASE}/DATOS_TABLA/${tableId}?tip=AM&tv=${muniVarId}:${valueId}`
  const series = (await fetchJson(sourceUrl, 60000)) as DirceSerie[]
  if (!Array.isArray(series) || series.length === 0) {
    throw new EcoError(`Sin series DIRCE para ${codigoIne}`, sourceUrl)
  }
  const grupos: DirceResult['grupos'] = {}
  const seriesIds: Record<string, string | undefined> = {}
  let unidad = 'empresas'
  for (const s of series) {
    // En tip=AM no hay FK_Variable: la variable de actividad es
    // "TOTALES VARIABLES CNAE" (total) o "Secciones" (grupos K..); el código
    // (AAA/KAH/…) desambigua.
    const actMeta = (s.MetaData ?? []).find(
      (m) => m.FK_Variable === cat.actividadVarId || /cnae|actividad|secciones|totales variables/i.test(m.T3_Variable ?? ''),
    )
    const code = (actMeta?.Codigo ?? '').trim()
    const entry = Object.entries(GRUPOS).find(([, g]) => g.match.test(code))
    if (!entry) continue
    const [key, g] = entry
    if (s.T3_Unidad?.trim()) unidad = s.T3_Unidad.trim()
    const puntos = (s.Data ?? [])
      .filter((d) => typeof d.Anyo === 'number' && typeof d.Valor === 'number')
      .map((d) => ({ anio: d.Anyo as number, valor: Math.round(d.Valor as number) }))
      .sort((a, b) => a.anio - b.anio)
    if (puntos.length === 0) continue
    grupos[key] = puntos
    seriesIds[key] = s.COD
    void g
  }
  if (!grupos.AAA || grupos.AAA.length === 0) {
    throw new EcoError(`Serie total DIRCE ausente para ${codigoIne}`, sourceUrl)
  }
  return { codigoIne, unidad, grupos, seriesIds, sourceUrl }
}

async function resolveMuniVarId(tableId: number): Promise<number> {
  const url = `${INE_BASE}/SERIES_TABLA/${tableId}?tip=M`
  const series = (await fetchJson(url, 60000)) as DirceSerie[]
  for (const s of series) {
    for (const m of s.MetaData ?? []) {
      const varName = (m.T3_Variable ?? '').toLowerCase()
      if (varName.includes('municipio') && m.FK_Variable) return m.FK_Variable
    }
  }
  return 19 // variable de municipios en Tempus3 (igual que DPOP)
}

export function dirceToRows(r: DirceResult): EconomyRow[] {
  const rows: EconomyRow[] = []
  const sectorDim: Record<string, string> = {
    AAA: 'total',
    KAH: 'industria',
    KAC: 'construccion',
    KAI: 'comercio_hosteleria',
    A11: 'resto_servicios',
  }
  const slugOf: Record<string, string> = {
    AAA: 'empresas_total',
    KAH: 'empresas_industria',
    KAC: 'empresas_construccion',
    KAI: 'empresas_comercio_hosteleria',
    A11: '__resto_servicios',
  }
  for (const [key, puntos] of Object.entries(r.grupos)) {
    if (key === 'A11') continue // el resto se usa solo para calcular servicios
    for (const p of puntos) {
      rows.push({
        slug: slugOf[key],
        anio: p.anio,
        valor: p.valor,
        unidad: r.unidad,
        dimensiones: { ambito: 'municipio', sector: sectorDim[key] },
        sourceSlug: 'ine_dirce',
        sourceUrl: r.sourceUrl,
        tableId: String(DIRCE_TABLE_ID),
        serieId: r.seriesIds[key] ?? null,
      })
    }
  }
  // Servicios en conjunto = resto (A11) + comercio/hostelería (KAI), por año.
  const resto = new Map(r.grupos.A11?.map((p) => [p.anio, p.valor]) ?? [])
  const comer = new Map(r.grupos.KAI?.map((p) => [p.anio, p.valor]) ?? [])
  for (const [anio, vResto] of resto) {
    const vComer = comer.get(anio)
    if (vComer === undefined) continue
    rows.push({
      slug: 'empresas_servicios',
      anio,
      valor: vResto + vComer,
      unidad: r.unidad,
      dimensiones: { ambito: 'municipio', sector: 'servicios' },
      sourceSlug: 'ine_dirce',
      sourceUrl: r.sourceUrl,
      tableId: String(DIRCE_TABLE_ID),
      serieId: r.seriesIds.A11 ?? null,
    })
  }
  return rows
}
