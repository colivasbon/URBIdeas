// Geometría auxiliar del análisis de entorno PAI: distancias geodésicas mínimas entre el
// ámbito de la instalación y elementos del entorno, rumbo en castellano y UTM ETRS89.
//
// Sin dependencias: las distancias se calculan en un plano local equirectangular centrado en
// el ámbito, con error < 0,1 % a las distancias de trabajo (< 100 km).

export type Pos = [number, number]; // [lng, lat]

const R_TIERRA = 6371008.8;

export interface PlanoLocal {
  lat0: number;
  lng0: number;
  aXY: (p: Pos) => [number, number];
  aLngLat: (xy: [number, number]) => Pos;
}

export function planoLocal(lat0: number, lng0: number): PlanoLocal {
  const kx = (Math.PI / 180) * R_TIERRA * Math.cos((lat0 * Math.PI) / 180);
  const ky = (Math.PI / 180) * R_TIERRA;
  return {
    lat0,
    lng0,
    aXY: ([lng, lat]) => [(lng - lng0) * kx, (lat - lat0) * ky],
    aLngLat: ([x, y]) => [lng0 + x / kx, lat0 + y / ky],
  };
}

/** Segmentos y anillos de una geometría GeoJSON, en coordenadas lng/lat. */
export interface GeomPlana {
  puntos: Pos[];
  segmentos: [Pos, Pos][];
  /** Anillos de polígonos (exterior + huecos) agrupados por polígono. */
  poligonos: Pos[][][];
}

export function descomponer(g: GeoJSON.Geometry | null | undefined, out?: GeomPlana): GeomPlana {
  const r: GeomPlana = out ?? { puntos: [], segmentos: [], poligonos: [] };
  if (!g) return r;
  const linea = (cs: Pos[]) => {
    if (cs.length === 1) r.puntos.push(cs[0]);
    for (let i = 1; i < cs.length; i++) r.segmentos.push([cs[i - 1], cs[i]]);
  };
  switch (g.type) {
    case "Point":
      r.puntos.push(g.coordinates as Pos);
      break;
    case "MultiPoint":
      for (const p of g.coordinates) r.puntos.push(p as Pos);
      break;
    case "LineString":
      linea(g.coordinates as Pos[]);
      break;
    case "MultiLineString":
      for (const l of g.coordinates) linea(l as Pos[]);
      break;
    case "Polygon":
      r.poligonos.push(g.coordinates as Pos[][]);
      for (const ring of g.coordinates) linea(ring as Pos[]);
      break;
    case "MultiPolygon":
      for (const poly of g.coordinates) {
        r.poligonos.push(poly as Pos[][]);
        for (const ring of poly) linea(ring as Pos[]);
      }
      break;
    case "GeometryCollection":
      for (const sub of g.geometries) descomponer(sub, r);
      break;
  }
  return r;
}

function puntoEnAnillo(p: [number, number], ring: [number, number][]): boolean {
  let dentro = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function proyectarEnSegmento(p: [number, number], a: [number, number], b: [number, number]): [number, number] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return a;
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return [a[0] + t * dx, a[1] + t * dy];
}

function cruzan(a: [number, number], b: [number, number], c: [number, number], d: [number, number]) {
  const o = (p: [number, number], q: [number, number], r: [number, number]) =>
    Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}

const d2 = (a: [number, number], b: [number, number]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

/** Geometría ya proyectada al plano local, lista para medir. */
export interface GeomXY {
  puntos: [number, number][];
  segmentos: [[number, number], [number, number]][];
  poligonos: [number, number][][][];
  bbox: [number, number, number, number];
}

export function aPlano(g: GeomPlana, plano: PlanoLocal): GeomXY {
  const puntos = g.puntos.map(plano.aXY);
  const segmentos = g.segmentos.map(([a, b]) => [plano.aXY(a), plano.aXY(b)] as [[number, number], [number, number]]);
  const poligonos = g.poligonos.map((poly) => poly.map((ring) => ring.map(plano.aXY)));
  let bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  const amp = ([x, y]: [number, number]) => {
    bbox = [Math.min(bbox[0], x), Math.min(bbox[1], y), Math.max(bbox[2], x), Math.max(bbox[3], y)];
  };
  puntos.forEach(amp);
  segmentos.forEach(([a, b]) => (amp(a), amp(b)));
  return { puntos, segmentos, poligonos, bbox };
}

function dentroDe(p: [number, number], g: GeomXY): boolean {
  for (const poly of g.poligonos) {
    if (!puntoEnAnillo(p, poly[0])) continue;
    let enHueco = false;
    for (let k = 1; k < poly.length; k++) if (puntoEnAnillo(p, poly[k])) enHueco = true;
    if (!enHueco) return true;
  }
  return false;
}

export interface Cercania {
  /** Distancia mínima en metros (0 si se tocan o solapan). */
  distancia: number;
  /** Punto del elemento más cercano al ámbito [lng, lat]. */
  puntoElemento: Pos;
  /** Punto del ámbito más cercano al elemento [lng, lat]. */
  puntoAmbito: Pos;
}

/** Puntos «vértice» de una geometría plana (puntos sueltos + extremos de segmentos). */
function vertices(g: GeomXY): [number, number][] {
  const v = [...g.puntos];
  for (const [a, b] of g.segmentos) v.push(a, b);
  return v;
}

function masCercanoEn(p: [number, number], g: GeomXY): { q: [number, number]; dd: number } {
  let mejor: { q: [number, number]; dd: number } = { q: p, dd: Infinity };
  for (const q of g.puntos) {
    const dd = d2(p, q);
    if (dd < mejor.dd) mejor = { q, dd };
  }
  for (const [a, b] of g.segmentos) {
    const q = proyectarEnSegmento(p, a, b);
    const dd = d2(p, q);
    if (dd < mejor.dd) mejor = { q, dd };
  }
  return mejor;
}

/**
 * Distancia mínima entre el ámbito y un elemento. Exacta para puntos, líneas y polígonos
 * (vértice-segmento en ambos sentidos + detección de solape/cruce).
 */
export function cercania(ambito: GeomXY, elemento: GeomXY, plano: PlanoLocal): Cercania | null {
  const va = vertices(ambito);
  const ve = vertices(elemento);
  if (!va.length || !ve.length) return null;

  // Solape: un vértice de uno dentro del otro, o segmentos que se cruzan.
  for (const p of ve) if (dentroDe(p, ambito)) return { distancia: 0, puntoElemento: plano.aLngLat(p), puntoAmbito: plano.aLngLat(p) };
  for (const p of va) if (dentroDe(p, elemento)) return { distancia: 0, puntoElemento: plano.aLngLat(p), puntoAmbito: plano.aLngLat(p) };

  let mejor = { dd: Infinity, pe: ve[0], pa: va[0] };
  for (const p of ve) {
    const m = masCercanoEn(p, ambito);
    if (m.dd < mejor.dd) mejor = { dd: m.dd, pe: p, pa: m.q };
  }
  for (const p of va) {
    const m = masCercanoEn(p, elemento);
    if (m.dd < mejor.dd) mejor = { dd: m.dd, pe: m.q, pa: p };
  }
  if (mejor.dd > 0 && ambito.segmentos.length && elemento.segmentos.length) {
    for (const [a, b] of ambito.segmentos)
      for (const [c, d] of elemento.segmentos)
        if (cruzan(a, b, c, d)) return { distancia: 0, puntoElemento: plano.aLngLat(a), puntoAmbito: plano.aLngLat(a) };
  }
  return { distancia: Math.sqrt(mejor.dd), puntoElemento: plano.aLngLat(mejor.pe), puntoAmbito: plano.aLngLat(mejor.pa) };
}

export function dentroDelAmbito(p: Pos, ambito: GeomXY, plano: PlanoLocal): boolean {
  return dentroDe(plano.aXY(p), ambito);
}

/** Distancia de un punto (ya en plano) al ámbito. */
export function distanciaPuntoAmbito(p: [number, number], ambito: GeomXY): number {
  if (dentroDe(p, ambito)) return 0;
  return Math.sqrt(masCercanoEn(p, ambito).dd);
}

const RUMBOS = ["norte", "noreste", "este", "sureste", "sur", "suroeste", "oeste", "noroeste"];

/** Rumbo (8 sectores) desde `desde` hacia `hacia`, en castellano: «norte», «sureste»… */
export function rumbo(desde: Pos, hacia: Pos): string {
  const plano = planoLocal(desde[1], desde[0]);
  const [x, y] = plano.aXY(hacia);
  if (x === 0 && y === 0) return "";
  const grados = ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
  return RUMBOS[Math.round(grados / 45) % 8];
}

const nf0 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0, useGrouping: "always" as unknown as boolean });
const nf1 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

/** «650 m», «3.217 m»; con `km` true usa kilómetros a partir de 1 km («1,5 km»). */
export function fmtDistancia(m: number, km = false): string {
  if (km && m >= 1000) return `${nf1.format(m / 1000)} km`;
  return `${nf0.format(Math.round(m))} m`;
}

/** Frase de ubicación relativa como en los PAI: «a 650 m al norte», «colindante». */
export function fraseDistancia(c: { distancia: number; rumbo: string }, km = false): string {
  if (c.distancia <= 10) return "colindante a la instalación";
  const al = c.rumbo ? ` al ${c.rumbo}` : "";
  return `a ${fmtDistancia(c.distancia, km)}${al}`;
}

/** Centroide aproximado (media de vértices del anillo exterior / puntos). */
export function centroide(g: GeomPlana): Pos {
  const pts: Pos[] = g.poligonos.length ? g.poligonos.flatMap((p) => p[0]) : [...g.puntos, ...g.segmentos.flatMap(([a, b]) => [a, b])];
  if (!pts.length) return [0, 0];
  const s = pts.reduce((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0]);
  return [s[0] / pts.length, s[1] / pts.length];
}

/** Superficie en m² de los polígonos del ámbito (fórmula del área en plano local). */
export function superficieM2(g: GeomPlana, plano: PlanoLocal): number {
  const areaAnillo = (ring: Pos[]) => {
    const xy = ring.map(plano.aXY);
    let s = 0;
    for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) s += (xy[j][0] + xy[i][0]) * (xy[j][1] - xy[i][1]);
    return Math.abs(s / 2);
  };
  let total = 0;
  for (const poly of g.poligonos) {
    total += areaAnillo(poly[0]);
    for (let k = 1; k < poly.length; k++) total -= areaAnillo(poly[k]);
  }
  return total;
}

/** UTM ETRS89 (GRS80) directa. Huso por longitud; Canarias en huso 28. */
export function latLngAUtm(lat: number, lng: number): { x: number; y: number; huso: number } {
  const huso = Math.floor((lng + 180) / 6) + 1;
  const a = 6378137;
  const f = 1 / 298.257222101;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const k0 = 0.9996;
  const phi = (lat * Math.PI) / 180;
  const lam = (lng * Math.PI) / 180;
  const lam0 = (((huso - 1) * 6 - 180 + 3) * Math.PI) / 180;
  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const T = Math.tan(phi) ** 2;
  const C = ep2 * Math.cos(phi) ** 2;
  const A = Math.cos(phi) * (lam - lam0);
  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * phi -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi));
  const x =
    k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5) / 120) + 500000;
  const y =
    k0 *
    (M +
      N *
        Math.tan(phi) *
        (A ** 2 / 2 + ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24 + ((61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6) / 720));
  return { x, y, huso };
}
