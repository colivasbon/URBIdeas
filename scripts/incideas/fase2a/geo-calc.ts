// Fase 2A — Cálculos geográficos puros (testeables sin red).
//
// Conserva siempre geometría e identificador originales; el recorte añade,
// nunca sustituye. Longitudes en metros (turf/length), áreas en m² (turf/area).

import * as turf from "@turf/turf";

export interface BboxLonLat {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

type Geom = GeoJSON.Geometry | null | undefined;

function comoFeatureCollection(a: unknown, b: unknown): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: {}, geometry: a as GeoJSON.Geometry },
      { type: "Feature", properties: {}, geometry: b as GeoJSON.Geometry },
    ],
  };
}

export function bboxDeFeatureCollection(fc: unknown): BboxLonLat | null {
  try {
    const b = turf.bbox(fc as GeoJSON.FeatureCollection);
    return { minLon: b[0], minLat: b[1], maxLon: b[2], maxLat: b[3] };
  } catch {
    return null;
  }
}

/** BBOX ampliado con margen en grados (para no perder tramos en el borde). */
export function ampliarBbox(b: BboxLonLat, margen = 0.02): BboxLonLat {
  return {
    minLon: b.minLon - margen,
    minLat: b.minLat - margen,
    maxLon: b.maxLon + margen,
    maxLat: b.maxLat + margen,
  };
}

export interface TramoRecortado {
  id_origen: string;
  localId: string | null;
  nombre: string | null;
  geometria_original: GeoJSON.Geometry | null;
  intersecta: boolean;
  geometria_recorte: GeoJSON.LineString | GeoJSON.MultiLineString | null;
  longitud_municipal_m: number;
  longitud_original_m: number;
}

export interface TramoEntrada {
  id: string;
  localId?: string | null;
  nombre: string | null;
  geometria: GeoJSON.Geometry | null;
}

/**
 * Recorta tramos lineales al polígono municipal por segmentos entre vértices.
 *
 * Método (documentado, no reparado): cada tramo se recorre por pares de
 * vértices consecutivos; se conserva el subsegmento cuyo punto medio cae
 * dentro del término (o que toca el borde). La longitud municipal es la suma
 * de subsegmentos conservados: aproximación al vértice, válida porque la IGR
 * densifica vértices (~decenas de metros). La geometría e identificador
 * originales se conservan intactos aparte. Si el tramo no toca el término,
 * se conserva con intersecta=false y recorte null (n_solo_bbox).
 *
 * `terminoSimple` (opcional): versión simplificada del término solo para el
 * test punto-en-polígono por segmento en municipios grandes. El test de
 * intersección previa usa siempre el término exacto; las longitudes se
 * calculan sobre las coordenadas originales.
 */
export function recortarTramos(tramos: TramoEntrada[], termino: GeoJSON.Geometry, terminoSimple?: GeoJSON.Geometry): TramoRecortado[] {
  // Pre-filtro numérico por BBOX del término: evita el test exacto en los
  // tramos que ni se acercan (determinante en municipios grandes).
  let tb: [number, number, number, number] | null = null;
  try {
    const b = turf.bbox(termino);
    tb = [b[0], b[1], b[2], b[3]];
  } catch { tb = null; }
  const bboxDeLinea = (coords: number[][]): [number, number, number, number] => {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const p of coords) {
      if (p[0] < a) a = p[0];
      if (p[1] < b) b = p[1];
      if (p[0] > c) c = p[0];
      if (p[1] > d) d = p[1];
    }
    return [a, b, c, d];
  };
  return tramos.map((t) => {
    const vacio: TramoRecortado = {
      id_origen: t.id,
      localId: t.localId ?? null,
      nombre: t.nombre,
      geometria_original: t.geometria,
      intersecta: false,
      geometria_recorte: null,
      longitud_municipal_m: 0,
      longitud_original_m: 0,
    };
    if (!t.geometria) return vacio;
    let longitud_original_m = 0;
    try {
      longitud_original_m = turf.length(t.geometria, { units: "kilometers" }) * 1000;
    } catch {
      longitud_original_m = 0;
    }
    vacio.longitud_original_m = Math.round(longitud_original_m * 100) / 100;
    let intersecta = false;
    if (t.geometria.type === "LineString" && tb) {
      const lb = bboxDeLinea(t.geometria.coordinates);
      if (lb[2] < tb[0] || lb[0] > tb[2] || lb[3] < tb[1] || lb[1] > tb[3]) {
        return vacio;
      }
    }
    try {
      intersecta = turf.booleanIntersects(t.geometria, termino);
    } catch {
      intersecta = false;
    }
    let geometria_recorte: TramoRecortado["geometria_recorte"] = null;
    let longitud_municipal_m = 0;
    if (intersecta && t.geometria.type === "LineString") {
      const dentro: number[][][] = [];
      let actual: number[][] = [];
      const vaciar = () => {
        if (actual.length >= 2) dentro.push(actual);
        actual = [];
      };
      const pts = t.geometria.coordinates;
      const refSimple = terminoSimple ?? termino;
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const medio: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        let ok = false;
        if (tb && (medio[0] < tb[0] || medio[0] > tb[2] || medio[1] < tb[1] || medio[1] > tb[3])) {
          // Punto medio fuera del BBOX del término: solo puede valer si el
          // subsegmento cruza el borde; se comprueba abajo por intersección.
          ok = false;
        } else {
          try {
            ok = turf.booleanPointInPolygon(turf.point(medio), refSimple);
          } catch {
            ok = false;
          }
        }
        if (!ok) {
          // El subsegmento puede cruzar el borde sin punto medio dentro:
          // también se conserva si toca el término (con pre-filtro BBOX).
          const tocaBbox = !tb || !(Math.min(a[0], b[0]) > tb[2] || Math.max(a[0], b[0]) < tb[0] || Math.min(a[1], b[1]) > tb[3] || Math.max(a[1], b[1]) < tb[1]);
          if (tocaBbox) {
            try {
              ok = turf.booleanIntersects(turf.lineString([a, b]), termino);
            } catch {
              ok = false;
            }
          }
        }
        if (ok) {
          if (actual.length === 0) actual.push(a);
          actual.push(b);
        } else {
          vaciar();
        }
      }
      vaciar();
      if (dentro.length > 0) {
        geometria_recorte = dentro.length === 1
          ? { type: "LineString", coordinates: dentro[0] }
          : { type: "MultiLineString", coordinates: dentro };
        try {
          longitud_municipal_m = turf.length(geometria_recorte, { units: "kilometers" }) * 1000;
        } catch {
          longitud_municipal_m = 0;
        }
      }
    }
    return {
      ...vacio,
      intersecta,
      geometria_recorte,
      longitud_municipal_m: Math.round(longitud_municipal_m * 100) / 100,
    };
  });
}

export function areaM2(geometria: Geom): number {
  if (!geometria) return 0;
  try {
    return turf.area(geometria);
  } catch {
    return 0;
  }
}

/**
 * Intersección de dos escenarios (mismo estudio/versión). Devuelve el área
 * común; el déficit se calcula con `deficitContencion` (contrato.ts).
 * turf v7 exige colección de Features (no geometrías sueltas).
 */
export function areaInterseccion(a: Geom, b: Geom): number {
  if (!a || !b) return 0;
  try {
    const inter = turf.intersect(comoFeatureCollection(a, b));
    if (!inter) return 0;
    return turf.area(inter);
  } catch {
    return 0;
  }
}
