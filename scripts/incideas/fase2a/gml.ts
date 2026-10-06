// Fase 2A — Lector GML 3.2 del WFS de hidrografía (el servidor no ofrece GeoJSON).
//
// Puro y probado con fixtures: convierte `wfs:member` en entidades
// `{id_origen, nombre, geometria, atributos}` con el orden de ejes correcto
// según el srsName de cada geometría (T1).

import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: false,
  isArray: (nombre) => nombre === "wfs:member",
});

export interface EntidadGml {
  id_origen: string;
  nombre: string | null;
  localId: string | null;
  geometria: GeoJSON.LineString | null;
  atributos: Record<string, string | null>;
}

type Nodo = Record<string, unknown>;

function esNodo(v: unknown): v is Nodo {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function texto(v: unknown): string | null {
  if (typeof v === "string" && v.trim() !== "") return v;
  if (esNodo(v)) {
    const t = v["#text"];
    if (typeof t === "string" && t.trim() !== "") return t;
  }
  return null;
}

/** Búsqueda profunda del primer subobjeto con alguna de las claves. */
function buscar(nodo: unknown, claves: string[]): unknown {
  if (!esNodo(nodo)) return undefined;
  for (const k of Object.keys(nodo)) {
    if (claves.some((c) => k === c || k.endsWith(`:${c}`))) return nodo[k];
  }
  for (const k of Object.keys(nodo)) {
    if (k.startsWith("@") || k === "#text") continue;
    const v = nodo[k];
    const lista = Array.isArray(v) ? v : [v];
    for (const item of lista) {
      const hallado = buscar(item, claves);
      if (hallado !== undefined) return hallado;
    }
  }
  return undefined;
}

/** Topónimo INSPIRE: cualquier gn:text bajo un geographicalName. */
function extraerToponimo(nodo: unknown): string | null {
  const geo = buscar(nodo, ["geographicalName"]);
  if (!geo) return null;
  const gns = Array.isArray(geo) ? geo : [geo];
  for (const g of gns) {
    const t = texto(buscar(g, ["text"]));
    if (t) return t;
  }
  return null;
}

function extraerLocalId(nodo: unknown): string | null {
  return texto(buscar(nodo, ["localId"]));
}

/** ¿El srs es geográfico (lat,lon) o proyectado (x,y)? */
function esGeografico(srs: string): boolean {
  return /4258|4326|4230|4277|4269/i.test(srs);
}

function paresAPuntos(posList: string, geografico: boolean): number[][] {
  const nums = posList.trim().split(/\s+/).map(Number).filter((n) => Number.isFinite(n));
  const pts: number[][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push(geografico ? [nums[i + 1], nums[i]] : [nums[i], nums[i + 1]]);
  }
  return pts;
}

function posDe(nodo: unknown): { srs: string; pos: string } | null {
  if (!esNodo(nodo)) return null;
  const srs = String(nodo["@srsName"] ?? "");
  const pos = texto(nodo["gml:posList"] ?? nodo["posList"]);
  return pos ? { srs, pos } : null;
}

function geometriaDe(nodo: unknown): GeoJSON.LineString | null {
  // Cualquier gml:LineString descendiente (hy-p:geometry en aguas físicas,
  // net:centrelineGeometry en el modelo de red).
  const ls = buscar(nodo, ["gml:LineString", "LineString"]);
  const directa = posDe(ls);
  if (directa) {
    return { type: "LineString", coordinates: paresAPuntos(directa.pos, esGeografico(directa.srs)) };
  }
  // gml:Curve con segmentos (modelo de red alternativo).
  const curve = buscar(nodo, ["gml:Curve", "Curve"]);
  const segs = esNodo(curve) ? (curve["gml:segments"] as unknown) : undefined;
  const listaRaw = esNodo(segs) ? segs["gml:LineStringSegment"] : undefined;
  const lista = listaRaw === undefined ? [] : Array.isArray(listaRaw) ? listaRaw : [listaRaw];
  const coords: number[][] = [];
  for (const s of lista) {
    const p = posDe(s);
    if (p) coords.push(...paresAPuntos(p.pos, esGeografico(p.srs)));
  }
  if (coords.length > 0) return { type: "LineString", coordinates: coords };
  return null;
}

export interface ColeccionGml {
  matched: number | null;
  returned: number | null;
  entidades: EntidadGml[];
}

/** Raíz numberMatched/numberReturned + miembros. Nunca lanza: lo raro se cuenta, no se inventa. */
export function leerGml(xml: string): ColeccionGml {
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    return { matched: null, returned: null, entidades: [] };
  }
  const raizRaw = esNodo(doc) ? (doc["wfs:FeatureCollection"] ?? doc["FeatureCollection"]) : undefined;
  const raiz: Nodo = esNodo(raizRaw) ? raizRaw : {};
  const num = (v: unknown): number | null => {
    if (v === undefined || v === "unknown") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const membersRaw = raiz["wfs:member"];
  const members: unknown[] = Array.isArray(membersRaw) ? membersRaw : [];
  const entidades: EntidadGml[] = [];
  for (const m of members) {
    if (!esNodo(m)) continue;
    const clave = Object.keys(m).find((k) => k.includes(":") && !k.startsWith("@"));
    if (!clave) continue;
    const nodo = m[clave];
    const gmlId = esNodo(nodo) ? String(nodo["@gml:id"] ?? m["@gml:id"] ?? "") : String(m["@gml:id"] ?? "");
    const localId = extraerLocalId(nodo);
    const nombre = extraerToponimo(nodo);
    // Identidad de miembro (gml:id) primero: varios miembros pueden compartir
    // el mismo hydroId (tramos del mismo objeto). No se fusionan.
    entidades.push({
      id_origen: gmlId !== "" ? gmlId : (localId ?? "sin-id"),
      nombre,
      localId,
      geometria: geometriaDe(nodo),
      atributos: { gmlId: gmlId || null, localId, nombre },
    });
  }
  return { matched: num(raiz["@numberMatched"]), returned: num(raiz["@numberReturned"]), entidades };
}
