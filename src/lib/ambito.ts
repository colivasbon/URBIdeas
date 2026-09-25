// Ámbito de trabajo del visor de dictamen (Fase 1).
// El ámbito (dibujado o subido) es el centro; las capas orbitan alrededor.
import type { PerfilId } from './familias'

export type TipoRecinto = 'poligono' | 'punto' | 'linea'

export interface TerritorioAmbito {
  municipio: string
  ine: string
  provincia: string
  ccaa: string
  exacto: boolean
}

export interface ResumenDictamen {
  estado: 'compatible' | 'condicionado' | 'incompatible'
  confianza: 'alta' | 'media' | 'baja'
  subtitulo_pendiente: boolean
  fecha: string
}

export interface Ambito {
  id: string
  nombre: string
  perfil_id: PerfilId
  geojson: GeoJSON.FeatureCollection
  tipo: TipoRecinto
  territorio?: TerritorioAmbito | null
  dictamen?: ResumenDictamen | null
  created_at: string
  updated_at: string
}

export function nuevoAmbito(nombre: string, perfil_id: PerfilId, geojson: GeoJSON.FeatureCollection, tipo: TipoRecinto): Ambito {
  const now = new Date().toISOString()
  return {
    id: `amb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    nombre: nombre.trim() || 'Ámbito sin nombre',
    perfil_id,
    geojson,
    tipo,
    created_at: now,
    updated_at: now,
  }
}

export function tipoDeGeoJSON(geojson: GeoJSON.FeatureCollection): TipoRecinto {
  const geom = geojson.features[0]?.geometry
  if (!geom) return 'poligono'
  if (geom.type === 'Point' || geom.type === 'MultiPoint') return 'punto'
  if (geom.type === 'LineString' || geom.type === 'MultiLineString') return 'linea'
  return 'poligono'
}

/** Normaliza nombres de CCAA (BD vs texto libre de servicios) para comparar. */
export function normCCAA(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function mismaCCAA(a: string, b: string): boolean {
  const x = normCCAA(a), y = normCCAA(b)
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x))
}

/** ¿Recinto cerrado válido? Polígono exige anillo cerrado con ≥4 posiciones. */
export function validarRecinto(geojson: GeoJSON.FeatureCollection): { ok: boolean; motivo?: string } {
  if (!geojson.features.length) return { ok: false, motivo: 'El ámbito no contiene geometría.' }
  const geom = geojson.features[0].geometry as GeoJSON.Geometry | null
  if (!geom) return { ok: false, motivo: 'Geometría vacía.' }
  if (geom.type === 'Polygon') {
    const ring = geom.coordinates[0]
    if (!ring || ring.length < 4) return { ok: false, motivo: 'El polígono exige recinto cerrado (mínimo 3 vértices + cierre).' }
    const [x0, y0] = ring[0]
    const [x1, y1] = ring[ring.length - 1]
    if (x0 !== x1 || y0 !== y1) return { ok: false, motivo: 'El polígono no está cerrado.' }
    return { ok: true }
  }
  if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      const ring = poly[0]
      if (!ring || ring.length < 4) return { ok: false, motivo: 'Un polígono del ámbito no está cerrado.' }
    }
    return { ok: true }
  }
  if (geom.type === 'Point' || geom.type === 'MultiPoint') return { ok: true }
  if (geom.type === 'LineString') {
    if (geom.coordinates.length < 2) return { ok: false, motivo: 'La línea necesita al menos 2 puntos.' }
    return { ok: true }
  }
  return { ok: true }
}

// ---- Búsqueda unificada: coordenadas (decimal y GMS) ----

function gmsADecimal(g: string, m: string, s: string, hemi: string): number {
  let v = Math.abs(parseFloat(g)) + parseFloat(m || '0') / 60 + parseFloat(s.replace(',', '.') || '0') / 3600
  if (/[SW]/i.test(hemi)) v = -v
  return v
}

/** Acepta "40.41,-3.69", "40,41 -3,69", "40°24'50\"N 3°41'57\"O", etc. */
export function parseCoordenadas(input: string): { lat: number; lng: number } | null {
  const t = input.trim()
  if (!t) return null
  const gms = t.match(/(\d+)[°º]\s*(\d+)['’]\s*([\d.,]+)?["”]?\s*([NnSs])[^0-9\-+]*(\d+)[°º]\s*(\d+)['’]\s*([\d.,]+)?["”]?\s*([EeOoWw])/)
  if (gms) {
    const lat = gmsADecimal(gms[1], gms[2], gms[3] || '0', gms[4])
    const lng = gmsADecimal(gms[5], gms[6], gms[7] || '0', gms[8])
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng }
    return null
  }
  const m = t.replace(/;/g, ',').match(/([+-]?\d+(?:[.,]\d+)?)\s*[, ]\s*([+-]?\d+(?:[.,]\d+)?)/)
  if (m) {
    const a = parseFloat(m[1].replace(',', '.'))
    const b = parseFloat(m[2].replace(',', '.'))
    if (Number.isFinite(a) && Number.isFinite(b)) {
      // Heurística España: si el primero está en [-10, 5] y el segundo en [35, 44], el usuario pegó lng,lat.
      if (a >= -10 && a <= 5 && b >= 35 && b <= 44) return { lat: b, lng: a }
      if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lng: b }
    }
  }
  return null
}

// ---- Mis ámbitos (localStorage; Supabase en Fase 5) ----

const KEY = 'urbideas:ambitos:v1'

export function listarAmbitos(): Ambito[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function guardarAmbito(a: Ambito): Ambito[] {
  const todos = listarAmbitos()
  const i = todos.findIndex(x => x.id === a.id)
  const next = i >= 0 ? todos.map(x => (x.id === a.id ? a : x)) : [a, ...todos]
  try { localStorage.setItem(KEY, JSON.stringify(next.slice(0, 50))) } catch { /* cuota */ }
  return next.slice(0, 50)
}

export function borrarAmbito(id: string): Ambito[] {
  const next = listarAmbitos().filter(x => x.id !== id)
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ }
  return next
}
