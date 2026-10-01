export type EstadoEspacial =
  | "valido"
  | "fuera_municipio"
  | "proximo_limite"
  | "sin_geometria"
  | "geometria_invalida"
  | "coordenadas_sospechosas"
  | "localizacion_aproximada";

export interface Coordenadas {
  lat: number;
  lng: number;
}

export function coordenadasValidas(c: Coordenadas | undefined): boolean {
  if (!c) return false;
  if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return false;
  if (Math.abs(c.lat) > 90 || Math.abs(c.lng) > 180) return false;
  return true;
}

/** Detecta ejes intercambiados: en España lat≈38, lon≈-0.4. */
export function ejesIntercambiados(c: Coordenadas): boolean {
  // Si "lat" parece una longitud española y "lng" una latitud española, están al revés.
  const latPareceLon = c.lat < 20 && c.lat > -20;
  const lngPareceLat = c.lng > 27 && c.lng < 45;
  return latPareceLon && lngPareceLat;
}

type Ring = number[][];
type PolygonCoords = Ring[];

function anillosDe(geometry: GeoJSON.Geometry | null | undefined): PolygonCoords[] {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates as unknown as PolygonCoords];
  if (geometry.type === "MultiPolygon") return geometry.coordinates as unknown as PolygonCoords[];
  return [];
}

/** Ray casting: ¿está el punto dentro del anillo? [lng, lat] */
function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(
  c: Coordenadas,
  geometry: GeoJSON.Geometry | null | undefined
): boolean {
  const polys = anillosDe(geometry);
  if (polys.length === 0) return false;
  for (const poly of polys) {
    if (poly.length === 0) continue;
    const exterior = poly[0];
    if (!pointInRing(c.lng, c.lat, exterior)) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) {
      if (pointInRing(c.lng, c.lat, poly[h])) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

function distanciaPuntoSegmento(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Distancia aproximada (m) al borde del límite, proyectando localmente a metros
 * (equirectangular). Calcula distancia a las aristas, no solo a los vértices.
 */
export function distanciaLimiteM(
  c: Coordenadas,
  geometry: GeoJSON.Geometry | null | undefined
): number | null {
  const polys = anillosDe(geometry);
  if (polys.length === 0) return null;
  const mPorGradoLat = 110540;
  const mPorGradoLng = 111320 * Math.cos((c.lat * Math.PI) / 180);
  const aXY = (lng: number, lat: number): [number, number] => [
    (lng - c.lng) * mPorGradoLng,
    (lat - c.lat) * mPorGradoLat,
  ];
  let min = Infinity;
  for (const poly of polys) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [ax, ay] = aXY(ring[i][0], ring[i][1]);
        const [bx, by] = aXY(ring[i + 1][0], ring[i + 1][1]);
        const d = distanciaPuntoSegmento(0, 0, ax, ay, bx, by);
        if (d < min) min = d;
      }
    }
  }
  return Number.isFinite(min) ? min : null;
}

export interface BBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/** Bounding box [minLng,minLat,maxLng,maxLat] de una geometría. */
export function boundaryBBox(geometry: GeoJSON.Geometry | null | undefined): BBox | null {
  const polys = anillosDe(geometry);
  if (polys.length === 0) {
    if (geometry && geometry.type === "Point") {
      const [lng, lat] = geometry.coordinates as number[];
      return { minLng: lng, minLat: lat, maxLng: lng, maxLat: lat };
    }
    return null;
  }
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const poly of polys) {
    for (const ring of poly) {
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  return { minLng, minLat, maxLng, maxLat };
}

export interface ValidacionEspacial {
  estado: EstadoEspacial;
  distancia_limite_m?: number;
  motivo?: string;
}

/**
 * Clasifica un registro según su posición respecto al límite municipal.
 * No elimina nada: "fuera_municipio" puede ser un recurso próximo útil.
 */
export function validarEspacial(
  coords: Coordenadas | undefined,
  boundary: GeoJSON.Geometry | null | undefined,
  opciones: { umbralProximoM?: number; localizacionAproximada?: boolean } = {}
): ValidacionEspacial {
  const umbral = opciones.umbralProximoM ?? 250;
  if (!coords) return { estado: "sin_geometria", motivo: "Sin coordenadas" };
  if (!coordenadasValidas(coords)) {
    return { estado: "geometria_invalida", motivo: "Coordenadas fuera de rango" };
  }
  if (ejesIntercambiados(coords)) {
    return { estado: "coordenadas_sospechosas", motivo: "Ejes lat/lng posiblemente intercambiados" };
  }
  if (opciones.localizacionAproximada) {
    return { estado: "localizacion_aproximada", motivo: "Centroide o ubicación genérica" };
  }
  if (!boundary) {
    return { estado: "valido", motivo: "Sin límite de referencia para validar" };
  }
  const dentro = pointInPolygon(coords, boundary);
  const dist = distanciaLimiteM(coords, boundary);
  if (dentro) {
    if (dist !== null && dist < umbral) {
      return { estado: "proximo_limite", distancia_limite_m: Math.round(dist) };
    }
    return { estado: "valido", distancia_limite_m: dist !== null ? Math.round(dist) : undefined };
  }
  return {
    estado: "fuera_municipio",
    distancia_limite_m: dist !== null ? Math.round(dist) : undefined,
    motivo: "Fuera del término municipal",
  };
}
