// Cruce automático del ámbito contra capas por familia (Fase 2).
// - Geometría local (suelo por provincia, archivos cargados): intersección real con turf.
// - Solo-servicio (WMS): consulta GetFeatureInfo en lote sobre puntos de muestreo.
// - Servicio caído o sin respuesta => 'sin_datos' (nunca verde por omisión).
// "borde" = proximidad inmediata según criterio interno (<10 m), no distancia normativa.

import * as turf from '@turf/turf'
import { consultarPuntoWMS, type PuntoMuestra } from './getfeatureinfo'

export type ResultadoCruce = 'solapa' | 'borde' | 'proximo' | 'limpio' | 'sin_datos'

export interface CapaCruce {
  id: string
  nombre: string
  titulo?: string
  familia: string
  severidad: 'veto' | 'condicionante' | 'informativo'
  norma_ref: string
  url_servicio: string
  nombre_capa: string
  fecha_verificacion?: string
  local?: GeoJSON.FeatureCollection | null // geometría local si existe
  etiquetaLocal?: (props: Record<string, unknown>) => string | null // etiqueta del elemento intersectado
}

export interface FilaCruce {
  capa_id: string
  familia: string
  severidad: 'veto' | 'condicionante' | 'informativo'
  norma_ref: string
  capa: string
  resultado: ResultadoCruce
  magnitud_m2: number | null
  pct: number | null
  longitud_m: number | null
  distancia_m: number | null
  detalle: string | null // p.ej. clase de suelo o atributos WMS resumidos
  fuente: string
  fecha_fuente: string
  estado_servicio: 'ok' | 'sin_datos'
}

const UMBRAL_BORDE_M = 10
const UMBRAL_PROXIMO_M = 500

function bboxAmpliado(geojson: GeoJSON.FeatureCollection, margen = 0.002): PuntoMuestra['bbox'] {
  const b = turf.bbox(geojson)
  return [b[0] - margen, b[1] - margen, b[2] + margen, b[3] + margen]
}

/** Puntos de muestreo: centroide + hasta 7 vértices del recinto. */
function puntosMuestreo(geojson: GeoJSON.FeatureCollection): { lat: number; lng: number }[] {
  const pts: { lat: number; lng: number }[] = []
  try {
    const c = turf.centroid(geojson)
    pts.push({ lng: c.geometry.coordinates[0], lat: c.geometry.coordinates[1] })
  } catch { /* ignore */ }
  const geom = geojson.features[0]?.geometry
  const anillo: number[][] =
    geom?.type === 'Polygon' ? geom.coordinates[0]
    : geom?.type === 'MultiPolygon' ? geom.coordinates[0][0]
    : geom?.type === 'LineString' ? geom.coordinates
    : []
  const paso = Math.max(1, Math.floor(anillo.length / 7))
  for (let i = 0; i < anillo.length && pts.length < 8; i += paso) {
    pts.push({ lng: anillo[i][0], lat: anillo[i][1] })
  }
  if (geom?.type === 'Point') pts.push({ lng: geom.coordinates[0], lat: geom.coordinates[1] })
  return pts
}

function areaAmbito(geojson: GeoJSON.FeatureCollection): number {
  try { return turf.area(geojson) } catch { return 0 }
}

function cruzarLocal(
  ambito: GeoJSON.FeatureCollection,
  ambitoM2: number,
  capa: CapaCruce,
): FilaCruce | null {
  if (!capa.local || capa.local.features.length === 0) return null
  const base = {
    capa_id: capa.id, familia: capa.familia, severidad: capa.severidad, norma_ref: capa.norma_ref,
    capa: capa.titulo || capa.nombre,
    fuente: capa.url_servicio ? `WMS ${capa.nombre_capa}` : 'Geometría local',
    fecha_fuente: capa.fecha_verificacion || 's.f.',
    estado_servicio: 'ok' as const,
  }
  let mejor: { m2: number; etiqueta: string | null } | null = null
  let distMin = Infinity
  const ambFeat = ambito.features[0] as GeoJSON.Feature
  try {
    for (const f of capa.local.features) {
      if (!f.geometry) continue
      const feat = f as GeoJSON.Feature
      let toca = false
      try { toca = turf.booleanIntersects(ambFeat as never, feat as never) } catch { toca = false }
      if (toca) {
        let m2 = 0
        try {
          const inter = turf.intersect(turf.featureCollection([ambFeat as never, feat as never]) as never)
          m2 = inter ? turf.area(inter as never) : 0
        } catch { m2 = 0 }
        const etiqueta = capa.etiquetaLocal ? capa.etiquetaLocal((f.properties || {}) as Record<string, unknown>) : null
        if (!mejor || m2 > mejor.m2) mejor = { m2, etiqueta }
      } else {
        try {
          const d = turf.distance(turf.centroid(ambFeat as never), feat as never, { units: 'meters' })
          if (d < distMin) distMin = d
        } catch { /* ignore */ }
      }
    }
  } catch {
    return { ...base, resultado: 'sin_datos', magnitud_m2: null, pct: null, longitud_m: null, distancia_m: null, detalle: 'Error de cálculo local.', estado_servicio: 'sin_datos' }
  }
  if (mejor) {
    const pct = ambitoM2 > 0 ? Math.min(100, (mejor.m2 / ambitoM2) * 100) : null
    return { ...base, resultado: 'solapa', magnitud_m2: Math.round(mejor.m2), pct: pct === null ? null : Math.round(pct * 10) / 10, longitud_m: null, distancia_m: null, detalle: mejor.etiqueta }
  }
  if (distMin <= UMBRAL_BORDE_M) {
    return { ...base, resultado: 'borde', magnitud_m2: null, pct: null, longitud_m: null, distancia_m: Math.round(distMin), detalle: `Proximidad inmediata según criterio interno de cruce (<${UMBRAL_BORDE_M} m), no distancia normativa.` }
  }
  if (distMin <= UMBRAL_PROXIMO_M) {
    return { ...base, resultado: 'proximo', magnitud_m2: null, pct: null, longitud_m: null, distancia_m: Math.round(distMin), detalle: null }
  }
  return { ...base, resultado: 'limpio', magnitud_m2: null, pct: null, longitud_m: null, distancia_m: null, detalle: null }
}

async function cruzarWMS(
  ambito: GeoJSON.FeatureCollection,
  capa: CapaCruce,
  signal?: AbortSignal,
): Promise<FilaCruce> {
  const base = {
    capa_id: capa.id, familia: capa.familia, severidad: capa.severidad, norma_ref: capa.norma_ref,
    capa: capa.titulo || capa.nombre,
    fuente: `WMS ${capa.nombre_capa}`, fecha_fuente: capa.fecha_verificacion || 's.f.',
  }
  if (signal?.aborted) {
    return { ...base, resultado: 'sin_datos', magnitud_m2: null, pct: null, longitud_m: null, distancia_m: null, detalle: 'Cruce cancelado.', estado_servicio: 'sin_datos' }
  }
  const bbox = bboxAmpliado(ambito)
  const muestras = puntosMuestreo(ambito)
  let fallos = 0
  let conDatos: Record<string, string> | null = null
  for (const m of muestras) {
    if (signal?.aborted) break
    const r = await consultarPuntoWMS(capa.url_servicio, capa.nombre_capa, { ...m, bbox } as PuntoMuestra)
    if (r.error) { fallos++; continue }
    if (Object.keys(r.atributos).length > 0) { conDatos = r.atributos; break }
  }
  if (conDatos) {
    const resumen = Object.entries(conDatos).slice(0, 3).map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`).join(' · ')
    return { ...base, resultado: 'solapa', magnitud_m2: null, pct: null, longitud_m: null, distancia_m: null, detalle: `GetFeatureInfo con atributos (${resumen}). Superficie exacta pendiente de geometría descargable.`, estado_servicio: 'ok' }
  }
  if (fallos === muestras.length && muestras.length > 0) {
    return { ...base, resultado: 'sin_datos', magnitud_m2: null, pct: null, longitud_m: null, distancia_m: null, detalle: 'Servicio sin respuesta: no computa como ausencia de afección.', estado_servicio: 'sin_datos' }
  }
  return { ...base, resultado: 'limpio', magnitud_m2: null, pct: null, longitud_m: null, distancia_m: null, detalle: null, estado_servicio: 'ok' }
}

export interface ProgresoCruce {
  hechas: number
  total: number
  capaActual: string
}

/**
 * Cruza el ámbito contra las capas activas.
 * Concurrency 3, abortable, con callback de progreso por capa.
 */
export async function cruzarAmbito(
  ambito: GeoJSON.FeatureCollection,
  capas: CapaCruce[],
  opts?: { signal?: AbortSignal; onProgreso?: (p: ProgresoCruce) => void },
): Promise<FilaCruce[]> {
  const ambitoM2 = areaAmbito(ambito)
  const filas: FilaCruce[] = []
  const pendientes = [...capas]
  let hechas = 0
  async function worker() {
    while (pendientes.length > 0) {
      if (opts?.signal?.aborted) break
      const capa = pendientes.shift()!
      opts?.onProgreso?.({ hechas, total: capas.length, capaActual: capa.titulo || capa.nombre })
      const local = cruzarLocal(ambito, ambitoM2, capa)
      const fila: FilaCruce = local ?? await cruzarWMS(ambito, capa, opts?.signal)
      filas.push(fila)
      hechas++
      opts?.onProgreso?.({ hechas, total: capas.length, capaActual: capa.titulo || capa.nombre })
    }
  }
  await Promise.all([worker(), worker(), worker()])
  const orden: Record<ResultadoCruce, number> = { solapa: 0, borde: 1, proximo: 2, sin_datos: 3, limpio: 4 }
  return filas.sort((a, b) => orden[a.resultado] - orden[b.resultado] || a.familia.localeCompare(b.familia))
}
