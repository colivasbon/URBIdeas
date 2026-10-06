// Fase 2 (verificación agente-fase2) — utilidades comunes de conectores.
//
// Solo lecturas públicas, acotadas (límite de bytes) y con pausas entre
// peticiones. Ninguna función de este fichero escribe en disco, en Supabase
// ni en R2: todo se procesa en memoria.

import JSZip from "jszip";
import { open as abrirShp } from "shapefile";
import { coincideMunicipio, normalizar } from "../../../../src/lib/incideas/fase3/nombres";
import { utmToLatLng } from "../../../../src/lib/incideas/pipeline/utm";

export interface EntidadShp {
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown } | null;
}

export const UA_FASE2 = "INCideas-Fase3/0.1";

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface ResultadoBloque {
  objetos: Record<string, unknown>[];
  edicion: string;
  nota: string;
}

export interface Bbox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export interface DescargaTexto {
  texto: string;
  bytes: number;
  contentType: string;
}

export interface DescargaBinaria {
  buf: Buffer;
  bytes: number;
  contentType: string;
}

/** Descarga de texto con tope de bytes (defensa ante respuestas gigantes). */
export async function descargarTexto(
  url: string,
  maxBytes: number,
  timeoutMs = 60000
): Promise<DescargaTexto | { error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA_FASE2 }, signal: controller.signal });
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > maxBytes) return { error: `excede maxBytes (${buf.length})` };
    return { texto: buf.toString("utf8"), bytes: buf.length, contentType: r.headers.get("content-type") ?? "" };
  } catch (e: unknown) {
    return { error: String(e instanceof Error ? e.message : e).slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

/** Descarga binaria con tope de bytes. */
export async function descargarBinario(
  url: string,
  maxBytes: number,
  timeoutMs = 60000
): Promise<DescargaBinaria | { error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA_FASE2 }, signal: controller.signal });
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > maxBytes) return { error: `excede maxBytes (${buf.length})` };
    return { buf, bytes: buf.length, contentType: r.headers.get("content-type") ?? "" };
  } catch (e: unknown) {
    return { error: String(e instanceof Error ? e.message : e).slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

export function esError<T>(d: T | { error: string }): d is { error: string } {
  return typeof d === "object" && d !== null && "error" in d;
}

/** CSV con comillas y separador autodetectado (; o ,). */
export function parseCsv(texto: string, sepForzado?: string): { cab: string[]; filas: string[][] } {
  const sinBom = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  const lineas = sinBom.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lineas.length === 0) return { cab: [], filas: [] };
  const primera = lineas[0];
  const sep =
    sepForzado ??
    ((primera.match(/;/g) ?? []).length >= (primera.match(/,/g) ?? []).length ? ";" : ",");
  const partir = (l: string): string[] => {
    const out: string[] = [];
    let campo = "";
    let comillas = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (comillas) {
        if (c === '"') {
          if (l[i + 1] === '"') {
            campo += '"';
            i++;
          } else comillas = false;
        } else campo += c;
      } else if (c === '"') comillas = true;
      else if (c === sep) {
        out.push(campo);
        campo = "";
      } else campo += c;
    }
    out.push(campo);
    return out.map((s) => s.trim());
  };
  return { cab: partir(lineas[0]), filas: lineas.slice(1).map(partir) };
}

/**
 * Índice de la primera cabecera que casa con alguno de los patrones.
 * Tolera guiones bajos (normalizar los convierte en espacios): en el patrón,
 * `_` casa con `_`, espacio o nada («georr_x» vale para «georr x»).
 */
export function indiceCab(cab: string[], patrones: RegExp[]): number {
  const norm = cab.map((c) => normalizar(c));
  const flexible = (p: RegExp): RegExp => new RegExp(p.source.replace(/_/g, "[ _]?"), p.flags);
  for (const p of patrones) {
    const f = flexible(p);
    const i = norm.findIndex((c) => f.test(c));
    if (i >= 0) return i;
  }
  return -1;
}

export function numEs(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function textoProp(v: string | number | null | undefined): string | null {
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/** ¿Algún valor textual de las propiedades menciona al municipio? */
export function propsMencionanMunicipio(props: Record<string, unknown>, municipio: string): boolean {
  for (const v of Object.values(props)) {
    if (typeof v !== "string" || v.trim() === "") continue;
    if (coincideMunicipio(v, municipio)) return true;
  }
  return false;
}

/** Valor de propiedad apto para publicar (primitivas JSON o null). */
export function propPublica(v: unknown): string | number | boolean | null {
  if (typeof v === "string") return v.slice(0, 300);
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "boolean") return v;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v).slice(0, 300);
}

interface NominatimItem {
  boundingbox?: unknown;
  lat?: unknown;
  lon?: unknown;
}

/** BBOX aproximada del municipio vía Nominatim (solo encuadre; 1 petición). */
export async function bboxNominatim(municipio: string, provincia: string): Promise<Bbox | null> {
  const q = encodeURIComponent(`${municipio}, ${provincia}, España`);
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=es&q=${q}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA_FASE2, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!r.ok) return null;
    const j = (await r.json()) as unknown;
    if (!Array.isArray(j) || j.length === 0) return null;
    const it = j[0] as NominatimItem;
    const bb = it.boundingbox;
    if (!Array.isArray(bb) || bb.length < 4) return null;
    const sur = Number(bb[0]);
    const norte = Number(bb[1]);
    const oeste = Number(bb[2]);
    const este = Number(bb[3]);
    if (![sur, norte, oeste, este].every(Number.isFinite)) return null;
    return { minLon: oeste, minLat: sur, maxLon: este, maxLat: norte };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** UTM 30N (ETRS89) → lon/lat (diferencia submétrica con WGS84 a esta escala). */
export function utm30NaLonLat(este: number, norte: number): { lon: number; lat: number } {
  const { lat, lng } = utmToLatLng(este, norte, 30);
  return { lon: lng, lat };
}

/** lon/lat → UTM 30N (Transverse Mercator directa, Snyder; ETRS89≈WGS84). */
export function lonLatAUtm30N(lon: number, lat: number): { este: number; norte: number } {
  const a = 6378137.0;
  const ecc2 = 0.00669438;
  const k0 = 0.9996;
  const lon0 = -3 * (Math.PI / 180);
  const latR = lat * (Math.PI / 180);
  const lonR = lon * (Math.PI / 180);
  const e4 = ecc2 * ecc2;
  const e6 = e4 * ecc2;
  const eccPrime2 = ecc2 / (1 - ecc2);
  const N = a / Math.sqrt(1 - ecc2 * Math.sin(latR) * Math.sin(latR));
  const T = Math.tan(latR) * Math.tan(latR);
  const C = eccPrime2 * Math.cos(latR) * Math.cos(latR);
  const A = (lonR - lon0) * Math.cos(latR);
  const M =
    a *
    ((1 - ecc2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * latR -
      ((3 * ecc2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * latR) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * latR) -
      ((35 * e6) / 3072) * Math.sin(6 * latR));
  const este =
    k0 * N * (A + ((1 - T + C) * A * A * A) / 3 + ((5 - 18 * T + T * T + 72 * C - 58 * eccPrime2) * A * A * A * A * A) / 5) +
    500000;
  const norte =
    k0 *
    (M +
      N * Math.tan(latR) * ((A * A) / 2 + ((5 - T + 9 * C + 4 * C * C) * A * A * A * A) / 24));
  return { este, norte };
}

/** BBOX lon/lat → BBOX UTM 30N (esquinas proyectadas, válida a escala municipal). */
export function bboxAUtm30N(bb: Bbox): Bbox {
  const c1 = lonLatAUtm30N(bb.minLon, bb.minLat);
  const c2 = lonLatAUtm30N(bb.maxLon, bb.maxLat);
  return {
    minLon: Math.min(c1.este, c2.este),
    minLat: Math.min(c1.norte, c2.norte),
    maxLon: Math.max(c1.este, c2.este),
    maxLat: Math.max(c1.norte, c2.norte),
  };
}

/**
 * Pares este/norte con orden de columnas dudoso (algunos CSV autonómicos
 * traen utmeste/utmnorte cruzados): el valor >2M es el norte.
 */
export function ordenarEsteNorte(a: number | null, b: number | null): { este: number; norte: number } | null {
  if (a === null || b === null) return null;
  if (a > 2000000 && b < 2000000) return { este: b, norte: a };
  if (b > 2000000 && a < 2000000) return { este: a, norte: b };
  if (a < 2000000 && b > 2000000) return { este: a, norte: b };
  // Rango UTM 30N típico: este 100k–900k, norte 3,9M–4,9M.
  if (a >= 100000 && a <= 900000 && b >= 3900000 && b <= 4900000) return { este: a, norte: b };
  if (b >= 100000 && b <= 900000 && a >= 3900000 && a <= 4900000) return { este: b, norte: a };
  return null;
}

/** Lee un ZIP remoto en memoria y devuelve sus entidades SHP (sin escribir nada). */
export async function cargarShpZip(
  url: string,
  maxBytes: number
): Promise<{ features: EntidadShp[] } | { error: string }> {
  const d = await descargarBinario(url, maxBytes, 180000);
  if (esError(d)) return d;
  try {
    const zip = await JSZip.loadAsync(d.buf);
    const nombres = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
    const baseDe = (n: string): string => n.toLowerCase().replace(/\.[a-z0-9]+$/, "");
    const shpNombre = nombres.find((n) => n.toLowerCase().endsWith(".shp"));
    if (!shpNombre) return { error: `ZIP sin .shp (${nombres.slice(0, 8).join(",")}).` };
    const dbfNombre = nombres.find(
      (n) => n.toLowerCase().endsWith(".dbf") && baseDe(n) === baseDe(shpNombre)
    );
    const aArrayBuffer = async (n: string): Promise<ArrayBuffer> => {
      const u8 = await zip.files[n].async("uint8array");
      return Uint8Array.from(u8).buffer;
    };
    const shpBuf = await aArrayBuffer(shpNombre);
    const fuente = dbfNombre ? await abrirShp(shpBuf, await aArrayBuffer(dbfNombre)) : await abrirShp(shpBuf);
    const features: EntidadShp[] = [];
    for (let i = 0; i < 20000; i++) {
      const r = await fuente.read();
      if (r.done) break;
      if (!r.value) continue;
      features.push({ properties: r.value.properties ?? {}, geometry: r.value.geometry });
    }
    return { features };
  } catch (e: unknown) {
    return { error: String(e instanceof Error ? e.message : e).slice(0, 200) };
  }
}

type CoordAnidada = number[] | CoordAnidada[];

/** BBOX de coordenadas anidadas [x, y] (proyectadas o geográficas, según origen). */
export function bboxDeCoords(coords: unknown): Bbox | null {
  const xs: number[] = [];
  const ys: number[] = [];
  let pares = 0;
  const caminar = (c: unknown): void => {
    if (pares > 5000) return;
    if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") {
      xs.push(c[0]);
      ys.push(c[1]);
      pares++;
      return;
    }
    if (Array.isArray(c)) for (const x of c) caminar(x);
  };
  caminar(coords as CoordAnidada);
  if (xs.length === 0) return null;
  return { minLon: Math.min(...xs), minLat: Math.min(...ys), maxLon: Math.max(...xs), maxLat: Math.max(...ys) };
}

export function seSolapan(a: Bbox, b: Bbox): boolean {
  return a.minLon <= b.maxLon && a.maxLon >= b.minLon && a.minLat <= b.maxLat && a.maxLat >= b.minLat;
}

/** Centroide aproximado (media de los primeros pares [x, y]). */
export function centroideAprox(coords: unknown, tope = 2000): { x: number; y: number } | null {
  let sx = 0;
  let sy = 0;
  let n = 0;
  const caminar = (c: unknown): void => {
    if (n >= tope) return;
    if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") {
      sx += c[0];
      sy += c[1];
      n++;
      return;
    }
    if (Array.isArray(c)) for (const x of c) caminar(x);
  };
  caminar(coords as CoordAnidada);
  if (n === 0) return null;
  return { x: sx / n, y: sy / n };
}

export { coincideMunicipio, normalizar };
