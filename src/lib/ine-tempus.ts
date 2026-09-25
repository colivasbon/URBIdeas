// Adaptador SERVIDOR para la API JSON Tempus3 del INE (Fase 2A SOCideas).
// NUNCA importar desde componentes de cliente: no usa secretos, pero centraliza
// la lógica de normalización y validación junto a las rutas de servidor.
//
// Tablas verificadas en vivo (docs/socideas-ine-integration.md):
// - DPOP op. 22, tabla provincial PROV-MUN (p. ej. 2855 Albacete): totales y
//   sexo por municipio, 1996-actualidad. Variables: 19 municipio, 18 sexo
//   (451 Total / 452 Hombres / 453 Mujeres), 115 provincia, unidad Personas.
// - Tabla 2853 (CCAA + Total Nacional, variable 70) para comparativas.
// - Tabla 33570 (Padrón Continuo, grupos quinquenales var. 360/357) para la
//   pirámide (último año disponible: 2022).

const INE_BASE = 'https://servicios.ine.es/wstempus/js/ES'
const FETCH_TIMEOUT_MS = 15000
const FETCH_RETRIES = 1 // reintentos adicionales tras el primer intento

// variable 19 = Municipios, variable 18 = Sexo, variable 115 = Provincias,
// variable 70 = CCAA/Total Nacional (tabla 2853).
const VAR_MUNICIPIO = 19
const VAR_SEXO = 18
const SEXO_TOTAL = 451
const SEXO_HOMBRES = 452
const SEXO_MUJERES = 453

// Registro de tablas DPOP provinciales VERIFICADAS en vivo.
// Clave: código INE de provincia (2 dígitos). Provincias no listadas devuelven
// error explícito "provincia no mapeada": nunca se inventa un ID de tabla.
// Registro de tablas DPOP provinciales VERIFICADAS en vivo
// (TABLAS_OPERACION/22, 2026-09-03: 50 tablas PROV-MUN, 1996-actualidad).
// Clave: código INE de provincia (2 dígitos). Provincias no listadas devuelven
// error explícito "provincia no mapeada": nunca se inventa un ID de tabla.
export const DPOP_PROVINCE_TABLES: Record<string, number> = {
  '01': 2854, // Álava (tabla "Araba/Álava")
  '02': 2855, // Albacete
  '03': 2856, // Alicante
  '04': 2857, // Almería
  '05': 2858, // Ávila
  '06': 2859, // Badajoz
  '07': 2860, // Illes Balears
  '08': 2861, // Barcelona
  '09': 2862, // Burgos
  '10': 2863, // Cáceres
  '11': 2864, // Cádiz
  '12': 2865, // Castellón
  '13': 2866, // Ciudad Real
  '14': 2901, // Córdoba
  '15': 2868, // A Coruña
  '16': 2869, // Cuenca
  '17': 2870, // Girona
  '18': 2871, // Granada
  '19': 2872, // Guadalajara
  '20': 2873, // Gipuzkoa
  '21': 2874, // Huelva
  '22': 2875, // Huesca
  '23': 2876, // Jaén
  '24': 2877, // León
  '25': 2878, // Lleida
  '26': 2879, // La Rioja
  '27': 2880, // Lugo
  '28': 2881, // Madrid
  '29': 2882, // Málaga
  '30': 2883, // Murcia
  '31': 2884, // Navarra
  '32': 2885, // Ourense
  '33': 2886, // Asturias
  '34': 2888, // Palencia
  '35': 2889, // Las Palmas
  '36': 2890, // Pontevedra
  '37': 2891, // Salamanca
  '38': 2892, // Santa Cruz de Tenerife
  '39': 2893, // Cantabria
  '40': 2894, // Segovia
  '41': 2895, // Sevilla
  '42': 2896, // Soria
  '43': 2900, // Tarragona
  '44': 2899, // Teruel
  '45': 2902, // Toledo
  '46': 2903, // Valencia
  '47': 2904, // Valladolid
  '48': 2905, // Bizkaia
  '49': 2906, // Zamora
  '50': 2907, // Zaragoza
}

export const CCAA_TABLE_ID = 2853
export const CCAA_NACIONAL_VALUE_ID = 16473 // Total Nacional, variable 70

// CCAA verificadas en la tabla 2853 (variable 70, SERIES_TABLA/2853 en vivo).
// Clave: nombre exacto en nuestra BD. Cobertura 2010–2021 (la tabla va con
// retraso respecto a DPOP provincial).
export const CCAA_VALUE_IDS: Record<string, number> = {
  'Andalucía': 8997,
  'Aragón': 8998,
  'Asturias': 8999,
  'Islas Baleares': 9000,
  'Canarias': 9001,
  'Cantabria': 9002,
  'Castilla y León': 9003,
  'Castilla-La Mancha': 9004,
  'Cataluña': 9005,
  'Comunitat Valenciana': 9006,
  'Extremadura': 9007,
  'Galicia': 9008,
  'Comunidad de Madrid': 9009,
  'Región de Murcia': 9010,
  'Comunidad Foral de Navarra': 9011,
  'País Vasco': 9012,
  'La Rioja': 9013,
}

export const AGE_TABLE_ID = 33570 // nacional, todos los municipios

export interface IneMetaItem {
  Id: number
  FK_Variable?: number
  T3_Variable?: string
  Nombre?: string
  Codigo?: string
}

export interface IneDataPoint {
  Fecha?: string
  Anyo?: number
  Valor?: number | null
  T3_TipoDato?: string
  T3_Periodo?: string
}

export interface IneSerie {
  Id?: number
  COD?: string
  Nombre?: string
  T3_Unidad?: string
  MetaData?: IneMetaItem[]
  Data?: IneDataPoint[]
}

export class IneError extends Error {
  readonly url: string
  readonly status?: number
  constructor(message: string, url: string, status?: number) {
    super(message)
    this.name = 'IneError'
    this.url = url
    this.status = status
  }
}

async function fetchJson(url: string, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<unknown> {
  let lastError: unknown = null
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'URBIdeas/1.0' },
      })
      if (!res.ok) {
        throw new IneError(`INE respondió ${res.status}`, url, res.status)
      }
      const text = await res.text()
      try {
        return JSON.parse(text) as unknown
      } catch {
        throw new IneError('Respuesta del INE no es JSON válido', url, res.status)
      }
    } catch (err) {
      lastError = err
      if (attempt < FETCH_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      }
    } finally {
      clearTimeout(timer)
    }
  }
  if (lastError instanceof IneError) throw lastError
  throw new IneError(
    lastError instanceof Error ? `Fallo de red hacia el INE: ${lastError.message}` : 'Fallo de red hacia el INE',
    url,
  )
}

function asSeriesList(payload: unknown): IneSerie[] {
  if (!Array.isArray(payload)) {
    throw new IneError('Formato inesperado: se esperaba una lista de series', INE_BASE)
  }
  return payload as IneSerie[]
}

function metaValue(serie: IneSerie, variableId: number): IneMetaItem | undefined {
  // tip=M devuelve FK_Variable numérico; tip=AM devuelve T3_Variable nominal.
  const names: Record<number, string> = {
    19: 'Municipios',
    18: 'Sexo',
    115: 'Provincias',
    70: 'Comunidades y Ciudades Autónomas',
  };
  const wantName = names[variableId];
  return serie.MetaData?.find(
    (m) => m.FK_Variable === variableId || (wantName !== undefined && m.T3_Variable === wantName),
  );
}

export interface ResolvedMunicipio {
  valueId: number
  nombre: string
}

interface ProvinceCatalog {
  muniByCode: Map<string, { valueId: number; nombre: string }>
  provByCode: Map<string, number>
}

const provinceCatalogCache = new Map<number, ProvinceCatalog>()

/** Descarga y cachea el catálogo de series de una tabla DPOP (1 vez por tabla
 * y proceso). Evita re-descargar ~1-3 MB por cada municipio del lote. */
export async function warmProvinceCatalog(dpopTableId: number): Promise<ProvinceCatalog> {
  const hit = provinceCatalogCache.get(dpopTableId)
  if (hit) return hit
  const url = `${INE_BASE}/SERIES_TABLA/${dpopTableId}?tip=M`
  const series = asSeriesList(await fetchJson(url, 30000))
  const cat: ProvinceCatalog = { muniByCode: new Map(), provByCode: new Map() }
  for (const s of series) {
    const muni = metaValue(s, VAR_MUNICIPIO)
    if (muni?.Codigo) {
      cat.muniByCode.set(muni.Codigo, {
        valueId: muni.Id,
        nombre: s.Nombre?.split('.')[0]?.trim() ?? '',
      })
    }
    const prov = s.MetaData?.find(
      (m) => m.FK_Variable === 115 || m.T3_Variable === 'Provincias',
    )
    if (prov?.Codigo) cat.provByCode.set(prov.Codigo, prov.Id)
  }
  provinceCatalogCache.set(dpopTableId, cat)
  return cat
}

/** Localiza el valor numérico del municipio en una tabla DPOP (por código INE). */
export async function resolveMunicipioValueId(
  dpopTableId: number,
  codigoIne: string,
): Promise<ResolvedMunicipio> {
  const cat = await warmProvinceCatalog(dpopTableId)
  const found = cat.muniByCode.get(codigoIne)
  if (!found) {
    throw new IneError(
      `Municipio ${codigoIne} no encontrado en la tabla ${dpopTableId}`,
      `${INE_BASE}/SERIES_TABLA/${dpopTableId}?tip=M`,
    )
  }
  return found
}

/** Localiza el valor numérico de una provincia en su tabla DPOP (variable 115). */
export async function resolveProvinciaValueId(
  dpopTableId: number,
  provinciaCodigo: string,
): Promise<number> {
  const cat = await warmProvinceCatalog(dpopTableId)
  const valueId = cat.provByCode.get(provinciaCodigo)
  if (valueId === undefined) {
    throw new IneError(
      `Provincia ${provinciaCodigo} no encontrada en la tabla ${dpopTableId}`,
      `${INE_BASE}/SERIES_TABLA/${dpopTableId}?tip=M`,
    )
  }
  return valueId
}

export interface SeriePunto {
  anio: number
  valor: number
  fecha: string | null
  tipoDato: string | null
}

export interface MunicipioSeries {
  codigoIne: string
  nombre: string
  unidad: string
  total: SeriePunto[]
  hombres: SeriePunto[]
  mujeres: SeriePunto[]
  seriesIds: { total?: string; hombres?: string; mujeres?: string }
  sourceUrl: string
}

/** Descarga totales + sexo de un municipio (DPOP) con validación de coherencia. */
export async function fetchMunicipioTotals(
  dpopTableId: number,
  municipioValueId: number,
  codigoIne: string,
  nult?: number,
): Promise<MunicipioSeries> {
  const nultParam = nult !== undefined ? `?nult=${nult}&tip=AM` : '?tip=AM'
  const sourceUrl = `${INE_BASE}/DATOS_TABLA/${dpopTableId}${nultParam}&tv=${VAR_MUNICIPIO}:${municipioValueId}`
  const series = asSeriesList(await fetchJson(sourceUrl))
  if (series.length === 0) {
    throw new IneError(`Sin series para el municipio ${codigoIne} en la tabla ${dpopTableId}`, sourceUrl)
  }

  const pick = (sexoId: number): IneSerie => {
    const found = series.find((s) => {
      const muni = metaValue(s, VAR_MUNICIPIO)
      const sexo = metaValue(s, VAR_SEXO)
      return muni?.Codigo === codigoIne && sexo?.Id === sexoId
    })
    if (!found) {
      throw new IneError(`Serie de sexo ${sexoId} ausente para ${codigoIne} en la tabla ${dpopTableId}`, sourceUrl)
    }
    return found
  }

  const totalSerie = pick(SEXO_TOTAL)
  const hombresSerie = pick(SEXO_HOMBRES)
  const mujeresSerie = pick(SEXO_MUJERES)

  const unidad = totalSerie.T3_Unidad?.trim() || ''
  if (unidad.toLowerCase() !== 'personas') {
    throw new IneError(`Unidad inesperada "${unidad}" (se esperaba Personas)`, sourceUrl)
  }

  const toPoints = (s: IneSerie): SeriePunto[] =>
    (s.Data ?? [])
      .filter((d) => typeof d.Anyo === 'number' && typeof d.Valor === 'number')
      .map((d) => ({
        anio: d.Anyo as number,
        valor: Math.round(d.Valor as number),
        fecha: d.Fecha ?? null,
        tipoDato: d.T3_TipoDato ?? null,
      }))
      .sort((a, b) => a.anio - b.anio)

  const total = toPoints(totalSerie)
  const hombres = toPoints(hombresSerie)
  const mujeres = toPoints(mujeresSerie)
  if (total.length === 0) {
    throw new IneError(`Serie total vacía para ${codigoIne}`, sourceUrl)
  }

  // Coherencia H + M = Total en cada año común (exacta en DPOP).
  const hByYear = new Map(hombres.map((p) => [p.anio, p.valor]))
  const mByYear = new Map(mujeres.map((p) => [p.anio, p.valor]))
  for (const p of total) {
    const h = hByYear.get(p.anio)
    const m = mByYear.get(p.anio)
    if (h !== undefined && m !== undefined && h + m !== p.valor) {
      throw new IneError(
        `Incoherencia H+M (${h + m}) ≠ Total (${p.valor}) en ${codigoIne} año ${p.anio}`,
        sourceUrl,
      )
    }
  }

  return {
    codigoIne,
    nombre: totalSerie.Nombre?.split('.')[0]?.trim() ?? '',
    unidad,
    total,
    hombres,
    mujeres,
    seriesIds: {
      total: totalSerie.COD,
      hombres: hombresSerie.COD,
      mujeres: mujeresSerie.COD,
    },
    sourceUrl,
  }
}

export interface AmbitoSerie {
  ambito: 'provincia' | 'ccaa' | 'espana'
  nombre: string
  puntos: SeriePunto[]
  seriesId?: string
  sourceUrl: string
}

/** Serie de comparativa (provincia en su tabla DPOP; CCAA/España en la 2853). */
export async function fetchAmbitoTotal(
  tableId: number,
  variableId: number,
  valueId: number,
  mbitoNombre: string,
  mbito: AmbitoSerie['ambito'],
  nult?: number,
): Promise<AmbitoSerie> {
  const nultParam = nult !== undefined ? `?nult=${nult}&tip=AM` : '?tip=AM'
  const sourceUrl = `${INE_BASE}/DATOS_TABLA/${tableId}${nultParam}&tv=${variableId}:${valueId}`
  const series = asSeriesList(await fetchJson(sourceUrl))
  const total = series.find((s) => metaValue(s, VAR_SEXO)?.Id === SEXO_TOTAL)
  if (!total) {
    throw new IneError(`Serie total ausente para ${mbitoNombre} en la tabla ${tableId}`, sourceUrl)
  }
  const puntos = (total.Data ?? [])
    .filter((d) => typeof d.Anyo === 'number' && typeof d.Valor === 'number')
    .map((d) => ({
      anio: d.Anyo as number,
      valor: Math.round(d.Valor as number),
      fecha: d.Fecha ?? null,
      tipoDato: d.T3_TipoDato ?? null,
    }))
    .sort((a, b) => a.anio - b.anio)
  return { ambito: mbito, nombre: mbitoNombre, puntos, seriesId: total.COD, sourceUrl }
}

export interface AgeGroupPoint {
  tramo: string
  hombres: number
  mujeres: number
}

export interface AgeSexResult {
  anios: { anio: number; grupos: AgeGroupPoint[]; total: number }[]
  sourceUrl: string
  seriesCount: number
}

const AGE_CODE_LABELS: Record<string, string> = {
  Y0T4: '0-4', Y5T9: '5-9', Y10T14: '10-14', Y15T19: '15-19', Y20T24: '20-24',
  Y25T29: '25-29', Y30T34: '30-34', Y35T39: '35-39', Y40T44: '40-44', Y45T49: '45-49',
  Y50T54: '50-54', Y55T59: '55-59', Y60T64: '60-64', Y65T69: '65-69', Y70T74: '70-74',
  Y75T79: '75-79', Y80T84: '80-84', Y85T89: '85-89', Y90T94: '90-94', Y95T99: '95-99',
  'Y-GE100': '100+',
}

/** Pirámide por grupos quinquenales y sexo (tabla 33570 u otra verificada).
 * Sin nult trae todos los años publicados; solo se conservan años completos. */
export async function fetchAgeSex(
  ageTableId: number,
  municipioValueId: number,
  codigoIne: string,
  nult?: number,
  timeoutMs: number = 60000,
): Promise<AgeSexResult> {
  const nultParam = nult !== undefined ? `?nult=${nult}&tip=AM` : '?tip=AM'
  const sourceUrl = `${INE_BASE}/DATOS_TABLA/${ageTableId}${nultParam}&tv=${VAR_MUNICIPIO}:${municipioValueId}`
  const series = asSeriesList(await fetchJson(sourceUrl, timeoutMs))
  if (series.length === 0) {
    throw new IneError(`Sin series de edad/sexo para ${codigoIne} en la tabla ${ageTableId}`, sourceUrl)
  }

  // Agrupa por año y tramo de edad. En tip=AM la variable de edad se
  // identifica por su Codigo (Y0T4…Y-GE100); en tip=M por FK_Variable 360/357.
  // Solo se conservan años con los 21 tramos completos en H y M.
  const byYear = new Map<number, Map<string, { label: string; hombres?: number; mujeres?: number }>>()
  for (const s of series) {
    const muni = metaValue(s, VAR_MUNICIPIO)
    if (muni?.Codigo !== codigoIne) continue
    const sexo = metaValue(s, VAR_SEXO)
    const edad = s.MetaData?.find(
      (m) =>
        m.FK_Variable === 360 ||
        m.FK_Variable === 357 ||
        (typeof m.Codigo === 'string' && m.Codigo in AGE_CODE_LABELS),
    )
    if (!edad?.Codigo || !(edad.Codigo in AGE_CODE_LABELS)) continue
    for (const d of s.Data ?? []) {
      if (typeof d.Anyo !== 'number' || typeof d.Valor !== 'number') continue
      const yearMap = byYear.get(d.Anyo) ?? new Map()
      const entry = yearMap.get(edad.Codigo) ?? {
        label: AGE_CODE_LABELS[edad.Codigo] ?? edad.Nombre ?? edad.Codigo,
      }
      const valor = Math.round(d.Valor)
      if (sexo?.Id === SEXO_HOMBRES) entry.hombres = valor
      else if (sexo?.Id === SEXO_MUJERES) entry.mujeres = valor
      yearMap.set(edad.Codigo, entry)
      byYear.set(d.Anyo, yearMap)
    }
  }

  const order = Object.keys(AGE_CODE_LABELS)
  const anios: AgeSexResult['anios'] = []
  for (const [anio, yearMap] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    const grupos: AgeGroupPoint[] = []
    let completo = true
    for (const code of order) {
      const e = yearMap.get(code)
      if (e?.hombres === undefined || e?.mujeres === undefined) {
        completo = false
        break
      }
      grupos.push({ tramo: e.label, hombres: e.hombres, mujeres: e.mujeres })
    }
    if (!completo) continue // año incompleto: se descarta, no se inventa
    anios.push({ anio, grupos, total: grupos.reduce((acc, g) => acc + g.hombres + g.mujeres, 0) })
  }
  if (anios.length === 0) {
    throw new IneError(`Sin ningún año completo de edad/sexo para ${codigoIne}`, sourceUrl)
  }
  return { anios, sourceUrl, seriesCount: series.length }
}

export function ineTableUrl(tableId: number): string {
  return `https://www.ine.es/jaxiT3/Tabla.htm?t=${tableId}`
}
