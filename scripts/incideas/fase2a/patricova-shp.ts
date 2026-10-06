// Fase 2A — SHP de PATRICOVA: extracción, inspección y recorte municipal.
//
// Cada producto se distribuye como UN único shapefile autonómico (verificado:
// 7 ficheros por ZIP, sin particiones en hojas). Se lee con el paquete
// `shapefile` ya presente en el repo; los nombres de campo se publican tal
// cual vienen (sin traducir ni reparar).

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import JSZip from "jszip";
import * as turf from "@turf/turf";
import { utmToLatLng } from "../../../src/lib/incideas/pipeline/utm";

export type CampoPat = string | number | null;

export interface RegistroPatricova {
  id: number;
  campos: Record<string, CampoPat>;
  geometria: GeoJSON.Geometry | null;
}

export interface RecortePatricova {
  id: number;
  campos: Record<string, CampoPat>;
  area_municipal_m2: number;
  geometria: GeoJSON.Geometry | null;
}

export interface CapaPatricova {
  producto: string;
  n_objetos_cv: number;
  campos: string[];
  bbox_cv: { minLon: number; minLat: number; maxLon: number; maxLat: number } | null;
  valores_por_campo: Record<string, Array<[string, number]>>;
  recorte_municipal: RecortePatricova[];
}

/** UTM 30N → lon/lat con la función probada del repo (serie de Snyder). */
function utm30AaLonLat(x: number, y: number): [number, number] {
  // ETRS89 ≈ WGS84 a efectos de esta fase (diferencia submétrica).
  const { lat, lng } = utmToLatLng(x, y, 30);
  return [lng, lat];
}

type Coord = number[] | Coord[];

function reprotecPunto(p: number[]): [number, number] {
  return utm30AaLonLat(p[0], p[1]);
}

function reprotecGeometria(g: GeoJSON.Geometry | null, esUtm: boolean): GeoJSON.Geometry | null {
  if (!g || !esUtm) return g;
  if (g.type === "Point") return { ...g, coordinates: reprotecPunto(g.coordinates) };
  if (g.type === "MultiPoint") {
    return { ...g, coordinates: g.coordinates.map(reprotecPunto) };
  }
  if (g.type === "LineString" || g.type === "MultiLineString" || g.type === "Polygon" || g.type === "MultiPolygon") {
    const caminar = (c: Coord): Coord => {
      if (c.length > 0 && typeof c[0] === "number") return reprotecPunto(c as number[]);
      return (c as Coord[]).map(caminar);
    };
    return { ...g, coordinates: caminar(g.coordinates as Coord) as never };
  }
  return g;
}

function comoCampo(v: unknown): CampoPat {
  if (typeof v === "string" || typeof v === "number") return v;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/**
 * Extrae el ZIP oficial a temporal, lee el SHP y recorta al término.
 * Los campos se publican tal cual vienen en el DBF.
 */
export async function leerYRecortar(
  producto: string,
  zipBuffer: Buffer,
  termino: GeoJSON.Geometry,
  bboxMunicipal: { minLon: number; minLat: number; maxLon: number; maxLat: number }
): Promise<CapaPatricova> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const shapefile = require("shapefile") as {
    open: (shp: string, dbf: string, opts?: { encoding: string }) => Promise<{
      read: () => Promise<{ done: boolean; value?: { properties?: Record<string, unknown>; geometry?: GeoJSON.Geometry | null } }>;
    }>;
  };
  const zip = await JSZip.loadAsync(zipBuffer);
  const nombres = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const base = nombres.find((n) => n.endsWith(".shp"))?.replace(/\.shp$/, "") ?? "";
  const tmp = join(tmpdir(), `fase2a-patricova-${producto}-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  for (const ext of ["shp", "shx", "dbf", "cpg", "prj"]) {
    const nombre = nombres.find((n) => n === `${base}.${ext}`) ?? nombres.find((n) => n.endsWith(`.${ext}`));
    const f = nombre ? zip.files[nombre] : undefined;
    if (f) writeFileSync(join(tmp, `${producto}.${ext}`), Buffer.from(await f.async("nodebuffer")));
  }
  const prjEntry = zip.files[`${base}.prj`];
  let prj = "";
  try {
    prj = prjEntry ? await prjEntry.async("string") : "";
  } catch {
    prj = "";
  }
  const esUtm = /UTM|Transverse_Mercator|25830|23030/i.test(prj ?? "");
  // Codificación del DBF según el .cpg publicado (sin suponerla).
  const cpgEntry = zip.files[`${base}.cpg`];
  let encoding = "utf-8";
  try {
    const cpg = cpgEntry ? (await cpgEntry.async("string")).trim() : "";
    if (/utf-?8/i.test(cpg)) encoding = "utf-8";
    else if (/1252|latin|ansi/i.test(cpg)) encoding = "windows-1252";
    else if (cpg) encoding = cpg;
  } catch {
    encoding = "utf-8";
  }

  const fuente = await shapefile.open(join(tmp, `${producto}.shp`), join(tmp, `${producto}.dbf`), { encoding });
  const objetos: RegistroPatricova[] = [];
  const camposSet = new Set<string>();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let id = 0;
  for (;;) {
    const r = await fuente.read();
    if (r.done || !r.value) break;
    id++;
    const props: Record<string, CampoPat> = {};
    for (const [k, v] of Object.entries(r.value.properties ?? {})) {
      camposSet.add(k);
      props[k] = comoCampo(v);
    }
    const g = reprotecGeometria(r.value.geometry ?? null, esUtm);
    // BBOX autonómica en grados.
    const bb = g ? bboxDe(g) : null;
    if (bb) {
      minX = Math.min(minX, bb[0]); minY = Math.min(minY, bb[1]);
      maxX = Math.max(maxX, bb[2]); maxY = Math.max(maxY, bb[3]);
    }
    objetos.push({ id, campos: props, geometria: g });
  }
  const campos = [...camposSet];
  const bboxCv = Number.isFinite(minX) ? { minLon: minX, minLat: minY, maxLon: maxX, maxLat: maxY } : null;

  // Distribución de valores por campo (top 40 por campo, para documentar niveles sin inventar).
  const valores_por_campo: Record<string, Array<[string, number]>> = {};
  for (const c of campos) {
    const cont = new Map<string, number>();
    for (const o of objetos) {
      const k = String(o.campos[c] ?? "null");
      cont.set(k, (cont.get(k) ?? 0) + 1);
    }
    valores_por_campo[c] = [...cont.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
  }

  // Recorte municipal con pre-filtro por BBOX. Puntos (estudios): respecto
  // al término por punto en polígono (sin área). Polígonos: intersección
  // exacta turf v7 (FeatureCollection); si no hay resultado se conserva el
  // objeto con área 0 y geometría original, nunca se inventa.
  const recorte_municipal: RecortePatricova[] = [];
  for (const o of objetos) {
    if (!o.geometria) continue;
    const bb = bboxDe(o.geometria);
    if (!bb) continue;
    if (bb[2] < bboxMunicipal.minLon || bb[0] > bboxMunicipal.maxLon || bb[3] < bboxMunicipal.minLat || bb[1] > bboxMunicipal.maxLat) continue;
    if (o.geometria.type === "Point" || o.geometria.type === "MultiPoint") {
      const pts = o.geometria.type === "Point" ? [o.geometria.coordinates] : o.geometria.coordinates;
      let dentro = false;
      try {
        dentro = pts.some((p) => turf.booleanPointInPolygon(turf.point(p), termino));
      } catch { dentro = false; }
      if (!dentro) continue;
      recorte_municipal.push({ id: o.id, campos: o.campos, area_municipal_m2: 0, geometria: o.geometria });
      continue;
    }
    let toca = false;
    try { toca = turf.booleanIntersects(o.geometria, termino); } catch { toca = false; }
    if (!toca) continue;
    let area = 0;
    let geomRec: GeoJSON.Geometry | null = o.geometria;
    try {
      const inter = turf.intersect(
        turf.featureCollection([turf.feature(o.geometria), turf.feature(termino)])
      );
      if (inter) {
        geomRec = inter.geometry;
        area = turf.area(inter);
      }
    } catch { /* se conserva el objeto con área 0 y geometría original */ }
    recorte_municipal.push({ id: o.id, campos: o.campos, area_municipal_m2: Math.round(area * 100) / 100, geometria: geomRec });
  }

  return { producto, n_objetos_cv: objetos.length, campos, bbox_cv: bboxCv, valores_por_campo, recorte_municipal };
}

function bboxDe(g: GeoJSON.Geometry): [number, number, number, number] | null {
  try {
    const b = turf.bbox(g);
    return [b[0], b[1], b[2], b[3]];
  } catch {
    return null;
  }
}
