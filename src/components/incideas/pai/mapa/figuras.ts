import { centroide, descomponer, planoLocal, superficieM2 } from "@/lib/incideas/pai/geo";

export type TipoFigura = "punto" | "linea" | "poligono" | "rectangulo" | "circulo" | "archivo";

export interface Figura {
  id: string;
  tipo: TipoFigura;
  nombre: string;
  /** Geometría WGS84 (el círculo se guarda como polígono de 72 vértices). */
  geometry: GeoJSON.Geometry;
  /** Radio original de los círculos, para mostrarlo en la lista. */
  radio?: number;
  incluida: boolean;
}

export const ETIQUETA_TIPO: Record<TipoFigura, string> = {
  punto: "Punto",
  linea: "Línea",
  poligono: "Polígono",
  rectangulo: "Rectángulo",
  circulo: "Círculo",
  archivo: "Archivo",
};

const RADIO_TIERRA = 6371008.8;

export function circuloAPoligono(lat: number, lng: number, radio: number, lados = 72): GeoJSON.Polygon {
  const anillo: GeoJSON.Position[] = [];
  const dLat = (radio / RADIO_TIERRA) * (180 / Math.PI);
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  for (let i = 0; i < lados; i++) {
    const a = (i / lados) * 2 * Math.PI;
    anillo.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  anillo.push(anillo[0]);
  return { type: "Polygon", coordinates: [anillo] };
}

function longitudM(coords: GeoJSON.Position[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const f1 = (lat1 * Math.PI) / 180;
    const f2 = (lat2 * Math.PI) / 180;
    const a = Math.sin(((lat2 - lat1) * Math.PI) / 360) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(((lng2 - lng1) * Math.PI) / 360) ** 2;
    total += 2 * RADIO_TIERRA * Math.asin(Math.sqrt(a));
  }
  return total;
}

const es = (n: number, d = 0) => n.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });

export function areaHa(g: GeoJSON.Geometry): number {
  const plana = descomponer(g);
  if (!plana.poligonos.length) return 0;
  const c = centroide(plana);
  return superficieM2(plana, planoLocal(c[1], c[0])) / 10000;
}

/** Medida legible de una figura: superficie, longitud o radio. */
export function medidaFigura(f: Pick<Figura, "tipo" | "geometry" | "radio">): string {
  const g = f.geometry;
  if (f.tipo === "punto") return "";
  if (f.tipo === "circulo" && f.radio) return `Radio ${f.radio >= 1000 ? `${es(f.radio / 1000, 2)} km` : `${es(f.radio)} m`} · ${es(areaHa(g), 2)} ha`;
  if (g.type === "LineString") return `${es(longitudM(g.coordinates))} m`;
  if (g.type === "MultiLineString") return `${es(g.coordinates.reduce((s, l) => s + longitudM(l), 0))} m`;
  const ha = areaHa(g);
  return ha > 0 ? `${es(ha, 2)} ha` : "";
}

/** Ámbito de análisis: las figuras incluidas, como una sola geometría (colección si hay varias). */
export function ambitoDeFiguras(figuras: Figura[]): GeoJSON.Geometry | null {
  const gs = figuras.filter((f) => f.incluida).flatMap((f) => (f.geometry.type === "GeometryCollection" ? f.geometry.geometries : [f.geometry]));
  if (!gs.length) return null;
  return gs.length === 1 ? gs[0] : { type: "GeometryCollection", geometries: gs };
}

export function resumenAmbito(figuras: Figura[]): string {
  const incluidas = figuras.filter((f) => f.incluida);
  if (!incluidas.length) return "Sin figuras en el ámbito";
  const ha = incluidas.reduce((s, f) => s + areaHa(f.geometry), 0);
  const n = incluidas.length;
  return `${n} ${n === 1 ? "figura" : "figuras"}${ha > 0 ? ` · ${es(ha, 2)} ha` : ""}`;
}

/** Firma estable del ámbito para detectar cambios posteriores a un análisis. */
export function firmaAmbito(figuras: Figura[]): string {
  return JSON.stringify(figuras.filter((f) => f.incluida).map((f) => f.geometry));
}

/** Límites [[sur, oeste], [norte, este]] de una geometría, para encuadrar el mapa. */
export function limitesGeometria(g: GeoJSON.Geometry): [[number, number], [number, number]] | null {
  let s = Infinity;
  let w = Infinity;
  let n = -Infinity;
  let e = -Infinity;
  const visitar = (x: unknown) => {
    if (Array.isArray(x) && typeof x[0] === "number") {
      const [lng, lat] = x as number[];
      s = Math.min(s, lat);
      n = Math.max(n, lat);
      w = Math.min(w, lng);
      e = Math.max(e, lng);
    } else if (Array.isArray(x)) x.forEach(visitar);
  };
  if (g.type === "GeometryCollection") g.geometries.forEach((sub) => "coordinates" in sub && visitar(sub.coordinates));
  else visitar(g.coordinates);
  return Number.isFinite(s) ? [[s, w], [n, e]] : null;
}
