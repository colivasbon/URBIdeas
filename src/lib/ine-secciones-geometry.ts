// Geometría oficial del seccionado censal (INE) — SOLO SERVIDOR.
//
// Descarga bajo demanda, POR MUNICIPIO, desde el GeoServer del INE. Nunca una
// capa nacional. Nunca durante una petición de usuario cuando el objeto ya
// está publicado en R2 (el atlas se sirve desde R2; esta fuente es la ingesta).
//
// Facts verificados contra el GeoServer del INE (no de documentación):
//  - Colecciones: `WMS_INE_SECCIONES_G01:Secciones_<año>`, 2020..2025.
//  - Filtro CQL por `CUMUN='<ine5>'` (CUMUN == municipios.codigo_ine).
//  - La API OGC Features PAGINA: `limit` + `startIndex`. Con limit=1000 Madrid
//    devuelve 2483 features. Una petición sin paginar TRUNCA EN SILENCIO: se
//    perderían 1483 secciones. Por eso `descargarSecciones` pagina siempre y
//    valida el total contra `numberMatched` cuando el servidor lo publica.
//  - La capa incluye polígonos AGREGADOS DE DISTRITO con `CSEC='000'`
//    (p. ej. `0200701000`, y 6 de ellos en Ceuta junto a 56 secciones reales).
//    No son secciones: `descargarSecciones` los descarta y los reporta aparte.
//  - `the_geom` es MultiPolygon en EPSG:25830 (UTM30 ETRS89). Leaflet necesita
//    WGS84 (EPSG:4326): se reproyecta en el servidor, nunca en el navegador.
//  - Atribución obligatoria: SECCIONES_ATRIBUCION.

import {
  SECCIONES_ATRIBUCION,
  esPoligonoDistrito,
  isValidIne5,
  isValidSeccionKey,
  municipioDeSeccion,
  type GeoJsonFeatureCollection,
  type SeccionAtributosIne,
  type SeccionFeature,
} from './socideas-secciones'

const OGC_BASE = 'https://www.ine.es/geoserver/ogc/features/v1'
const WFS_BASE = 'https://www.ine.es/geoserver/WMS_INE_SECCIONES_G01/wfs'
const ESPACIO = 'WMS_INE_SECCIONES_G01'
const PAGE_SIZE = 1000
const MAX_PAGES = 40
const TIMEOUT_MS = 45000

export const CRS_ORIGEN_INE = 'EPSG:25830'
export const CRS_PUBLICADO = 'EPSG:4326'

/** Colecciones verificadas, más reciente primero. El año de la colección es el
 *  año de DELIMITACIÓN y se expone aparte del periodo estadístico. */
export const COLECCIONES_SECCIONES = [
  'Secciones_2025',
  'Secciones_2024',
  'Secciones_2023',
  'Secciones_2022',
  'Secciones_2021',
  'Secciones_2020',
] as const

export type ColeccionSecciones = (typeof COLECCIONES_SECCIONES)[number]

export function anioDeColeccion(coleccion: string): number {
  return Number.parseInt(coleccion.replace('Secciones_', ''), 10)
}

export interface ResultadoGeometria {
  collection: ColeccionSecciones
  geometryYear: number
  /** CRS detectado en la respuesta cruda del INE (no supuesto). */
  crsOrigenDetectado: CrsDetectado
  features: SeccionFeature[]
  /** Polígonos `CSEC='000'` encontrados y EXCLUIDOS (agregados de distrito). */
  agregadosDistrito: string[]
  /** `numberMatched` del servidor si lo publica; `null` si no. */
  totalAnunciado: number | null
  paginas: number
  ms: number
  via: 'ogc' | 'wfs'
}

export class ErrorGeometria extends Error {
  readonly detalle: string
  constructor(mensaje: string, detalle = '') {
    super(mensaje)
    this.name = 'ErrorGeometria'
    this.detalle = detalle
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CRS: DETECCIÓN, NO SUPUESTO
//
// Un hecho verificado contra el GeoServer del INE (2026-09): la API OGC
// Features con `f=json` devuelve la geometría YA en EPSG:4326
// (Alcalá del Júcar: -1.3103392, 39.14491732). El EPSG:25830 del que habla la
// documentación corresponde a los SHAPEFILES y al WMS, no a esta respuesta.
//
// Por eso NO se reproyecta a ciegas: reproyectar una geometría que ya está en
// 4326 la destruye (los valores pasan a ~-7.48°, 0.0004°, es decir el DMS de
// Greenwich: el fallo que detectó scripts/verify-secciones-proyeccion.ts).
//
// El módulo DETECTA el CRS de lo recibido y solo entonces actúa, y siempre
// valida la salida antes de publicarla. Un WMS/WFS que devolviera 25830 se
// reproyectaría; uno en 4326 se dejaría intacto. Ante una geometría que no se
// puede clasificar, falla cerrado en vez de publicar coordenadas inventadas.
// ─────────────────────────────────────────────────────────────────────────────

type CoordCruda = number | number[]

/** Recorre una geometría y devuelve el primer par [x, y] encontrado. */
function primerPar(coords: unknown): [number, number] | null {
  if (!Array.isArray(coords)) return null
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    return [coords[0] as number, coords[1] as number]
  }
  for (const c of coords) {
    const p = primerPar(c)
    if (p) return p
  }
  return null
}

export type CrsDetectado = 'EPSG:4326' | 'EPSG:25830' | 'desconocido'

/** Clasifica el CRS a partir de un par de coordenadas representativo.
 *  Un par en grados tiene |x| ≤ 180 e |y| ≤ 90. Un par proyectado en metros
 *  UTM 30N tiene magnitudes del orden de 10^5–10^7. */
export function detectarCrs(geometria: unknown): CrsDetectado {
  const p = primerPar((geometria as { coordinates?: unknown })?.coordinates)
  if (!p) return 'desconocido'
  const [x, y] = p
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 'desconocido'
  if (Math.abs(x) <= 180.000001 && Math.abs(y) <= 90.000001) return 'EPSG:4326'
  // Metros proyectados: magnitudes grandes pero no absurdas.
  if (Math.abs(x) <= 1_000_000 && Math.abs(y) <= 1_000_000_000) return 'EPSG:25830'
  return 'desconocido'
}

/** Ámbito máximo admisible en la salida publicada (España + Ceuta/Melilla).
 *  Un valor fuera de este rango significa que la geometría está mal: se rechaza. */
const RANGO_PUBLICABLE = { lonMin: -25, lonMax: 10, latMin: 25, latMax: 49 }

export function validarRangoPublicable(features: SeccionFeature[]): string[] {
  const errores: string[] = []
  for (const f of features.slice(0, 400)) {
    const p = primerPar((f.geometry as { coordinates?: unknown })?.coordinates)
    if (!p) continue
    const [lon, lat] = p
    if (
      lon < RANGO_PUBLICABLE.lonMin ||
      lon > RANGO_PUBLICABLE.lonMax ||
      lat < RANGO_PUBLICABLE.latMin ||
      lat > RANGO_PUBLICABLE.latMax
    ) {
      errores.push(
        `${f.properties.CUSEC}: coordenada fuera de rango (${lon.toFixed(4)}, ${lat.toFixed(4)})`,
      )
      if (errores.length >= 5) break
    }
  }
  return errores
}

// ─────────────────────────────────────────────────────────────────────────────
// Transversal de Mercator inversa (EPSG:25830 → EPSG:4326)
// Implementada a mano para no añadir `proj4` como dependencia directa
// (MEMORIA.md:54). Solo se usa si la detección dice 25830.
// ─────────────────────────────────────────────────────────────────────────────

const A_GRS80 = 6378137.0
const F_GRS80 = 1 / 298.257222101
const K0 = 0.9996
const FE = 500000.0
const FN = 0.0
const LON0 = -3.0 // huso 30: meridiano central 3° O

const DEG = 180 / Math.PI

/** Transversal de Mercator inversa (fórmula cerrada, la misma que usa GDAL). */
export function project25830(x: number, y: number): [number, number] {
  const e2 = F_GRS80 * (2 - F_GRS80)
  const ep2 = e2 / (1 - e2)
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))
  const M0 = A_GRS80 * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256)

  const mu = ((y - FN) / K0) / M0

  // Latitud de aproximación inicial (serie de Fuß).
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    (151 * e1 ** 3) / 96 * Math.sin(6 * mu) +
    (1097 * e1 ** 4) / 512 * Math.sin(8 * mu)

  const sp = Math.sin(phi1)
  const cp = Math.cos(phi1)
  const tp = Math.tan(phi1)
  const N1 = A_GRS80 / Math.sqrt(1 - e2 * sp * sp)
  const R1 = (A_GRS80 * (1 - e2)) / Math.pow(1 - e2 * sp * sp, 1.5)
  const T1 = tp * tp
  const C1 = ep2 * cp * cp
  const D = (x - FE) / (N1 * K0)

  const lat =
    phi1 -
    ((N1 * tp) / R1) *
      (D * D / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) *
          D ** 6) /
          720)

  // El desplazamiento sale en RADIANES; el meridiano central ya está en GRADOS.
  // Convertir solo el desplazamiento: convertir la suma multiplicaría también
  // LON0 y devolvería longitudes absurdas.
  const lonOffsetRad =
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) /
        120) /
    cp

  return [LON0 + lonOffsetRad * DEG, lat * DEG]
}

type Coord = CoordCruda

function reproyectarCoord(c: Coord): Coord {
  if (typeof c === 'number') return c
  const [lon, lat] = project25830(c[0] as number, c[1] as number)
  if (c.length >= 3) return [lon, lat, c[2]]
  return [lon, lat]
}

function reproyectarGeometria(g: unknown): unknown {
  if (!g || typeof g !== 'object') return g
  const geo = g as { type?: string; coordinates?: unknown; geometries?: unknown[] }
  if (geo.type === 'GeometryCollection' && Array.isArray(geo.geometries)) {
    return { ...geo, geometries: geo.geometries.map(reproyectarGeometria) }
  }
  if (geo.type === 'MultiPolygon' && Array.isArray(geo.coordinates)) {
    return {
      ...geo,
      coordinates: geo.coordinates.map((poly) =>
        (poly as unknown[]).map((ring) => (ring as Coord[]).map(reproyectarCoord)),
      ),
    }
  }
  if (geo.type === 'Polygon' && Array.isArray(geo.coordinates)) {
    return {
      ...geo,
      coordinates: (geo.coordinates as unknown[]).map((ring) =>
        (ring as Coord[]).map(reproyectarCoord),
      ),
    }
  }
  if (geo.type === 'LineString' && Array.isArray(geo.coordinates)) {
    return { ...geo, coordinates: (geo.coordinates as Coord[]).map(reproyectarCoord) }
  }
  if (geo.type === 'MultiLineString' && Array.isArray(geo.coordinates)) {
    return {
      ...geo,
      coordinates: (geo.coordinates as unknown[]).map((line) =>
        (line as Coord[]).map(reproyectarCoord),
      ),
    }
  }
  if (geo.type === 'Point' && Array.isArray(geo.coordinates)) {
    return { ...geo, coordinates: reproyectarCoord(geo.coordinates as Coord) }
  }
  if (geo.type === 'MultiPoint' && Array.isArray(geo.coordinates)) {
    return { ...geo, coordinates: (geo.coordinates as Coord[]).map(reproyectarCoord) }
  }
  return g
}

/** Redondea a 7 decimales (~1 cm). Reduce el peso sin deformar el borde. */
function redondearProfundidad(valor: number): number {
  return Math.round(valor * 1e7) / 1e7
}

function simplificarAnillo(anillo: number[][], toleranciaMetros: number): number[][] {
  if (toleranciaMetros <= 0 || anillo.length < 4) return anillo
  const out: number[][] = [anillo[0] as number[]]
  let ultimo = anillo[0] as number[]
  for (let i = 1; i < anillo.length - 1; i++) {
    const p = anillo[i] as number[]
    const d = distanciaMetros(ultimo, p)
    if (d >= toleranciaMetros) {
      out.push(p)
      ultimo = p
    }
  }
  const ultimoFinal = anillo[anillo.length - 1] as number[]
  if (out[out.length - 1] !== ultimoFinal) out.push(ultimoFinal)
  return out
}

function distanciaMetros(a: number[], b: number[]): number {
  const lat = ((a[1] as number) + (b[1] as number)) / 2
  const dx =
    ((a[0] as number) - (b[0] as number)) * 111320 * Math.cos((lat * Math.PI) / 180)
  const dy = ((a[1] as number) - (b[1] as number)) * 110540
  return Math.sqrt(dx * dx + dy * dy)
}

export interface OpcionesSimplificacion {
  /** Tolerancia en METROS para la versión web. Por defecto 8 m. */
  toleranciaMetros?: number
  decimales?: number
  /** CRS forzado. Si no se indica, se DETECTA en la primera geometría válida. */
  forzarCrs?: 'EPSG:4326' | 'EPSG:25830'
}

/** Redondea a 7 decimales (~1 cm). Reduce el peso sin deformar el borde. */
function limpiarGeometria(g: unknown, op: OpcionesSimplificacion, origen: CrsDetectado): unknown {
  const dec = op.decimales ?? 7
  const tol = op.toleranciaMetros ?? 8
  // Solo se reproyecta si la fuente vino en un CRS proyectado. Una geometría
  // ya en 4326 se deja intacta: reproyectarla la destruiría.
  const base: unknown = origen === 'EPSG:25830' ? reproyectarGeometria(g) : g
  const geo = base as { type?: string; coordinates?: unknown; geometries?: unknown[] }
  void dec
  const redondear = (c: unknown): unknown => {
    if (Array.isArray(c)) {
      if (typeof c[0] === 'number' && typeof c[1] === 'number') {
        return [
          redondearProfundidad(c[0] as number),
          redondearProfundidad(c[1] as number),
          ...(typeof c[2] === 'number' ? [redondearProfundidad(c[2] as number)] : []),
        ]
      }
      return c.map(redondear)
    }
    return c
  }
  const out: Record<string, unknown> = { ...geo }
  if (geo.type === 'GeometryCollection' && Array.isArray(geo.geometries)) {
    out.geometries = geo.geometries.map((x) => limpiarGeometria(x, op, origen))
    return out
  }
  if (
    (geo.type === 'Polygon' || geo.type === 'MultiPolygon') &&
    Array.isArray(geo.coordinates)
  ) {
    const polys: unknown[] = geo.type === 'Polygon' ? [geo.coordinates] : geo.coordinates
    out.coordinates = polys.map((poly) =>
      (poly as unknown[]).map((anillo) =>
        simplificarAnillo(redondear(anillo) as number[][], tol),
      ),
    )
    return out
  }
  out.coordinates = redondear(geo.coordinates)
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Lectura de atributos del INE
// ─────────────────────────────────────────────────────────────────────────────

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim())
const strOrNull = (v: unknown): string | null => {
  const s = str(v)
  return s === '' ? null : s
}

function leerAtributos(p: Record<string, unknown>): SeccionAtributosIne {
  return {
    CUSEC: str(p.CUSEC),
    CSEC: str(p.CSEC),
    CDIS: str(p.CDIS),
    CUDIS: str(p.CUDIS),
    CUMUN: str(p.CUMUN),
    CMUN: str(p.CMUN),
    CPRO: str(p.CPRO),
    NMUN: str(p.NMUN),
    NPRO: str(p.NPRO),
    TIPO: strOrNull(p.TIPO),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Descarga
// ─────────────────────────────────────────────────────────────────────────────

async function pedir(url: string, ms = TIMEOUT_MS): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/geo+json, application/json',
        'User-Agent': 'URBIdeas/1.0 (+https://urbideas.com)',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as unknown
  } finally {
    clearTimeout(timer)
  }
}

type FeatureCruda = { properties?: Record<string, unknown>; geometry?: unknown; type?: string }

function clasificar(features: FeatureCruda[], ine5: string) {
  const secciones: SeccionFeature[] = []
  const agregados: string[] = []
  const invalidas: string[] = []
  for (const f of features) {
    const props = f.properties ?? {}
    const attrs = leerAtributos(props)
    if (!isValidSeccionKey(attrs.CUSEC)) {
      invalidas.push(attrs.CUSEC || '(sin CUSEC)')
      continue
    }
    if (municipioDeSeccion(attrs.CUSEC) !== ine5) {
      invalidas.push(`${attrs.CUSEC} (otro municipio)`)
      continue
    }
    if (esPoligonoDistrito(attrs.CUSEC)) {
      agregados.push(attrs.CUSEC)
      continue
    }
    secciones.push({
      type: 'Feature',
      properties: attrs,
      geometry: f.geometry ?? null,
    })
  }
  return { secciones, agregados, invalidas }
}

/** Descarga la geometría de un municipio, paginando siempre. */
export async function descargarSecciones(
  ine5: string,
  coleccion: ColeccionSecciones = COLECCIONES_SECCIONES[0],
  opciones: OpcionesSimplificacion = {},
): Promise<ResultadoGeometria> {
  if (!isValidIne5(ine5)) throw new ErrorGeometria(`Código INE inválido: "${ine5}"`)
  const t0 = Date.now()
  const collectionId = `${ESPACIO}:${coleccion}`
  const collectionEnc = encodeURIComponent(collectionId)
  const cql = `CUMUN='${ine5}'`
  const cqlEnc = encodeURIComponent(cql)

  let ultimaFila = ''
  const features: FeatureCruda[] = []
  let totalAnunciado: number | null = null
  let paginas = 0

  for (let intento = 0; intento < 2; intento++) {
    try {
      features.length = 0
      paginas = 0
      totalAnunciado = null
      for (let start = 0; start < PAGE_SIZE * MAX_PAGES; start += PAGE_SIZE) {
        const url =
          `${OGC_BASE}/collections/${collectionEnc}/items` +
          `?f=json&limit=${PAGE_SIZE}&startIndex=${start}` +
          `&filter-lang=cql-text&filter=${cqlEnc}`
        const payload = (await pedir(url)) as {
          features?: FeatureCruda[]
          numberMatched?: number
          numberReturned?: number
        }
        const lote = Array.isArray(payload.features) ? payload.features : []
        if (typeof payload.numberMatched === 'number') totalAnunciado = payload.numberMatched
        features.push(...lote)
        paginas++
        if (lote.length < PAGE_SIZE) break
      }
      // Salvaguarda: si el servidor|ga numberMatched y no hemos leído todo, es un fallo.
      if (typeof totalAnunciado === 'number' && features.length < totalAnunciado) {
        throw new ErrorGeometria(
          `Paginación incompleta: ${features.length} de ${totalAnunciado}`,
          `coleccion=${coleccion} ine=${ine5}`,
        )
      }
      break
    } catch (e) {
      ultimaFila = e instanceof Error ? e.message : String(e)
      if (intento === 1) {
        // Fallback WFS clásico (con paginación por count/ startIndex).
        try {
          const wfs =
            `${WFS_BASE}?service=WFS&version=2.0.0&request=GetFeature` +
            `&typeNames=${encodeURIComponent(collectionId)}` +
            `&outputFormat=application%2Fjson&count=${PAGE_SIZE}&startIndex=0` +
            `&CQL_FILTER=${cqlEnc}`
          const payload = (await pedir(wfs)) as { features?: FeatureCruda[] }
          const lote = Array.isArray(payload.features) ? payload.features : []
          features.push(...lote)
          paginas = 1
          totalAnunciado = lote.length
        } catch (e2) {
          throw new ErrorGeometria(
            `No se pudo obtener la geometría (${ultimaFila})`,
            e2 instanceof Error ? e2.message : String(e2),
          )
        }
      }
    }
  }

  const { secciones, agregados, invalidas } = clasificar(features, ine5)
  if (invalidas.length) {
    console.warn(
      `[ine-secciones] ${ine5} ${coleccion}: ${invalidas.length} geometrías descartadas ` +
        `(CUSEC inválido o de otro municipio): ${invalidas.slice(0, 5).join(', ')}`,
    )
  }
  if (!secciones.length) {
    throw new ErrorGeometria(
      `Sin secciones para ${ine5} en ${coleccion}`,
      `recibidas=${features.length} agregados=${agregados.length} invalidas=${invalidas.length}`,
    )
  }

  // ── CRS: se detecta sobre la geometría CRUDO, antes de transformarla ─────
  const origen: CrsDetectado =
    opciones.forzarCrs ??
    (() => {
      for (const f of secciones) {
        const d = detectarCrs(f.geometry)
        if (d !== 'desconocido') return d
      }
      return 'desconocido' as CrsDetectado
    })()

  if (origen === 'desconocido') {
    throw new ErrorGeometria(
      `No se pudo determinar el CRS de la geometría de ${ine5}`,
      'Se rechaza publicar en lugar de asumir un sistema de referencia',
    )
  }

  const publicada: SeccionFeature[] = secciones.map((f) => ({
    ...f,
    geometry: limpiarGeometria(f.geometry, opciones, origen),
  }))

  // ── Puerta fail-closed: la salida debe ser geográficamente plausible ──────
  const fueraDeRango = validarRangoPublicable(publicada)
  if (fueraDeRango.length) {
    throw new ErrorGeometria(
      `Geometría de ${ine5} fuera del ámbito publicable tras ${origen} → ${CRS_PUBLICADO}`,
      fueraDeRango.join(' | '),
    )
  }

  return {
    collection: coleccion,
    geometryYear: anioDeColeccion(coleccion),
    crsOrigenDetectado: origen,
    features: publicada,
    agregadosDistrito: agregados,
    totalAnunciado,
    paginas,
    ms: Date.now() - t0,
    via: 'ogc',
  }
}

/** Prueba las colecciones de más reciente a más antigua hasta obtener geometría. */
export async function descargarSeccionesConFallback(
  ine5: string,
  opciones: OpcionesSimplificacion = {},
): Promise<ResultadoGeometria> {
  const errores: string[] = []
  for (const coleccion of COLECCIONES_SECCIONES) {
    try {
      return await descargarSecciones(ine5, coleccion, opciones)
    } catch (e) {
      errores.push(`${coleccion}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  throw new ErrorGeometria(
    `Ninguna colección de seccionado devolvió geometría para ${ine5}`,
    errores.join(' | '),
  )
}

export function toFeatureCollection(features: SeccionFeature[]): GeoJsonFeatureCollection {
  return { type: 'FeatureCollection', features }
}

export { SECCIONES_ATRIBUCION }
