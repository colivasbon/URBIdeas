// Fase 3 — Conector autonómico genérico (CKAN + CSV).
//
// Resuelve el recurso CSV de un dataset CKAN, lo descarga y filtra por
// municipio con columnas autodetectadas por patrones de nombre. Los nombres
// de columna reales se registran en la evidencia (sin suponer esquema).

import { descargarBinario } from "../../../../src/lib/incideas/fase3/r2";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { coincideMunicipio, normalizar } from "../../../../src/lib/incideas/fase3/nombres";

export interface DatasetAutonomico {
  fuente: string;
  bloque: "educacion" | "farmacias" | "sanidad";
  ckanApi: string;
  packageId: string;
  licencia: string;
}

/** Alcance: INEs explícitos o provincias enteras (p. ej. toda la CV). */
export interface AlcanceDataset extends DatasetAutonomico {
  ines?: string[];
  provincias?: string[];
}

export interface EntidadAutonomica {
  nombre: string | null;
  municipio: string | null;
  direccion: string | null;
  cp: string | null;
  lat: number | null;
  lon: number | null;
}

const UA = "INCideas-Fase3/0.1";

function normalizar(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** CSV con comillas y separador ; o ,. Exportado para pruebas. */
export function parsearCsv(texto: string): { cabeceras: string[]; filas: string[][] } {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lineas.length === 0) return { cabeceras: [], filas: [] };
  const primera = lineas[0];
  const sep = (primera.match(/;/g) ?? []).length >= (primera.match(/,/g) ?? []).length ? ";" : ",";
  const partir = (l: string): string[] => {
    const out: string[] = [];
    let campo = "";
    let comillas = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (comillas) {
        if (c === '"') {
          if (l[i + 1] === '"') { campo += '"'; i++; } else comillas = false;
        } else campo += c;
      } else if (c === '"') comillas = true;
      else if (c === sep) { out.push(campo); campo = ""; }
      else campo += c;
    }
    out.push(campo);
    return out.map((s) => s.trim());
  };
  return { cabeceras: partir(lineas[0]), filas: lineas.slice(1).map(partir) };
}

function columna(cabeceras: string[], patrones: RegExp[]): number {
  const norm = cabeceras.map((c) => normalizar(c));
  for (const p of patrones) {
    const i = norm.findIndex((c) => p.test(c));
    if (i >= 0) return i;
  }
  return -1;
}

const num = (v: string | undefined): number | null => {
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export async function cargarAutonomico(
  ds: DatasetAutonomico,
  municipio: string
): Promise<{ objetos: EntidadAutonomica[]; edicion: string; nota: string; columnas: string[] }> {
  const r = await fetch(`${ds.ckanApi}/api/3/action/package_show?id=${encodeURIComponent(ds.packageId)}`, { headers: { "User-Agent": UA } });
  if (!r.ok) return { objetos: [], edicion: "", nota: `CKAN package_show HTTP ${r.status}.`, columnas: [] };
  const j = (await r.json()) as { result?: { resources?: Array<{ format?: string; url?: string; last_modified?: string }>; metadata_modified?: string } };
  const recCsv = (j.result?.resources ?? []).find((x) => /csv/i.test(x.format ?? "") && x.url);
  const recGeo = (j.result?.resources ?? []).find((x) => /geojson/i.test(x.format ?? "") && x.url);
  // GeoJSON primero cuando existe (geometría + propiedades); si no, CSV.
  const rec = recGeo ?? recCsv ?? (j.result?.resources ?? [])[0];
  if (!rec?.url) return { objetos: [], edicion: "", nota: "Dataset sin recurso descargable.", columnas: [] };
  if (/geojson/i.test(rec.format ?? "")) {
    return cargarGeojson(ds, municipio, rec.url, rec.last_modified ?? j.result?.metadata_modified ?? "");
  }
  // Caché del CSV por fuente (una descarga por oleada, no por municipio).
  mkdirSync("tmp/fase3-cache", { recursive: true });
  const cacheRuta = `tmp/fase3-cache/autonomica-${ds.fuente}.csv`;
  let d: { buf: Buffer } | { error: string };
  if (existsSync(cacheRuta)) {
    d = { buf: readFileSync(cacheRuta) };
  } else {
    const dd = await descargarBinario(rec.url, 60 * 1024 * 1024, 120000);
    if ("error" in dd) return { objetos: [], edicion: "", nota: `Descarga CSV: ${dd.error}.`, columnas: [] };
    writeFileSync(cacheRuta, dd.buf);
    d = { buf: dd.buf };
  }
  let texto = d.buf.toString("utf8");
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  // Detección de codificación: si hay mojibake típico, releer como latin1.
  if (/Ã|Â/.test(texto.slice(0, 2000))) {
    const latin = d.buf.toString("latin1");
    if (!/Ã/.test(latin.slice(0, 2000))) texto = latin;
  }
  const { cabeceras, filas } = parsearCsv(texto);
  const iMun = columna(cabeceras, [/^municipio$/, /localidad/, /municipio residencia/]);
  const iNom = columna(cabeceras, [/denominacion/, /^nombre/, /centro/, /establecimiento/]);
  const iDir = columna(cabeceras, [/direccion/, /domicilio/, /via/]);
  const iCp = columna(cabeceras, [/codigo postal/, /^cp$/, /cod postal/]);
  const iLat = columna(cabeceras, [/latitud/, /^y$/, /coord y/]);
  const iLon = columna(cabeceras, [/longitud/, /^x$/, /coord x/]);
  const objetos: EntidadAutonomica[] = [];
  for (const f of filas) {
    if (iMun < 0) break;
    if (!coincideMunicipio(f[iMun], municipio)) continue;
    objetos.push({
      nombre: iNom >= 0 ? f[iNom] || null : null,
      municipio: f[iMun] || null,
      direccion: iDir >= 0 ? f[iDir] || null : null,
      cp: iCp >= 0 ? f[iCp] || null : null,
      lat: iLat >= 0 ? num(f[iLat]) : null,
      lon: iLon >= 0 ? num(f[iLon]) : null,
    });
  }
  return {
    objetos,
    edicion: (rec.last_modified ?? j.result?.metadata_modified ?? "").slice(0, 10),
    nota: `${filas.length} filas; columnas: ${cabeceras.slice(0, 14).join(" | ")}${iMun < 0 ? " (SIN columna de municipio: no filtrable)" : ""}.`,
    columnas: cabeceras,
  };
}

/** GeoJSON de puntos: propiedades autodetectadas + geometría. */
async function cargarGeojson(
  ds: DatasetAutonomico,
  municipio: string,
  url: string,
  modificacion: string
): Promise<{ objetos: EntidadAutonomica[]; edicion: string; nota: string; columnas: string[] }> {
  const d = await descargarBinario(url, 60 * 1024 * 1024, 120000);
  if ("error" in d) return { objetos: [], edicion: "", nota: `Descarga GeoJSON: ${d.error}.`, columnas: [] };
  const fc = JSON.parse(d.buf.toString("utf8")) as { features?: Array<{ geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> }> };
  const feats = fc.features ?? [];
  const claves = feats.length > 0 ? Object.keys(feats[0].properties ?? {}) : [];
  const norm = claves.map((c) => normalizar(c));
  const col = (p: RegExp): string | null => {
    const i = norm.findIndex((c) => p.test(c));
    return i >= 0 ? claves[i] : null;
  };
  const cMun = col(/^municipio$/) ?? col(/localidad/) ?? col(/municipio/);
  const cNom = col(/denominacion/) ?? col(/^nombre/) ?? col(/centro/) ?? col(/establecimiento/);
  const cDir = col(/direccion/) ?? col(/domicilio/) ?? col(/via/);
  const cCp = col(/codigo postal/) ?? col(/^cp$/);
  const objetos: EntidadAutonomica[] = [];
  for (const f of feats) {
    const props = f.properties ?? {};
    if (!cMun) break;
    if (!coincideMunicipio(props[cMun], municipio)) continue;
    let lat: number | null = null;
    let lon: number | null = null;
    const g = f.geometry;
    if (g?.type === "Point" && Array.isArray(g.coordinates)) {
      lon = num(String(g.coordinates[0]));
      lat = num(String(g.coordinates[1]));
    }
    objetos.push({
      nombre: cNom ? String(props[cNom] ?? "") || null : null,
      municipio: String(props[cMun] ?? "") || null,
      direccion: cDir ? String(props[cDir] ?? "") || null : null,
      cp: cCp ? String(props[cCp] ?? "") || null : null,
      lat, lon,
    });
  }
  return {
    objetos,
    edicion: modificacion.slice(0, 10),
    nota: `${feats.length} entidades; columnas: ${claves.slice(0, 14).join(" | ")}${!cMun ? " (SIN columna de municipio: no filtrable)" : ""}.`,
    columnas: claves,
  };
}
export const DATASETS_FASE3: AlcanceDataset[] = [
  { fuente: "navarra-educacion-2026", bloque: "educacion", ckanApi: "https://datosabiertos.navarra.es", packageId: "37044915-b9fe-47f6-8e1e-f6bb9a3e1cc8", licencia: "CC BY", ines: ["31201"] },
  { fuente: "navarra-farmacias", bloque: "farmacias", ckanApi: "https://datosabiertos.navarra.es", packageId: "3946167a-38cc-4cb1-821d-81a9277fb225", licencia: "CC BY", ines: ["31201"] },
  { fuente: "gva-educacion-2020", bloque: "educacion", ckanApi: "https://dadesobertes.gva.es", packageId: "d3671ae8-cf9b-43cc-bd29-1989454b25f1", licencia: "CC BY", provincias: ["Alicante", "Valencia", "Castellón", "Castello"] },
  { fuente: "tenerife-sanidad-farmacias", bloque: "sanidad", ckanApi: "https://datos.tenerife.es/ckan", packageId: "7d98949a-1e2f-4bdc-9280-83b81da0be35", licencia: "abierta", ines: ["38038"] },
];

export function datasetAplica(ds: AlcanceDataset, ine: string, provincia: string): boolean {
  if (ds.ines && ds.ines.includes(ine)) return true;
  if (ds.provincias && ds.provincias.includes(provincia)) return true;
  return false;
}
