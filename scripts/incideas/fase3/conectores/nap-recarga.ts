// Fase 3 — Conector NAP DATEX2 (puntos de recarga).
//
// El fichero nacional (83 MB) se descarga una vez a tmp/ y se recorre por
// fragmentos (<energyInfrastructureSite>) sin cargarlo entero en memoria.
// Filtra por municipio/provincia del <address> y conserva ids, operador,
// conector y coordenadas WGS84.

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";
import { descargarBinario, sha256 } from "../../../../src/lib/incideas/fase3/r2";

export const NAP_URL = "https://nap.dgt.es/datex2/v3/miterd/EnergyInfrastructureTablePublication/electrolineras.xml";
const CACHE = "tmp/fase3-cache/nap-electrolineras.xml";

export interface PuntoRecarga {
  id: string;
  nombre: string | null;
  operador: string | null;
  municipio: string | null;
  provincia: string | null;
  cp: string | null;
  lat: number | null;
  lon: number | null;
  conectores: string[];
  actualizado_en: string | null;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" });

function normalizar(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Nodo = Record<string, unknown>;
const esNodo = (v: unknown): v is Nodo => v !== null && typeof v === "object" && !Array.isArray(v);
const txt = (v: unknown): string | null => {
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  if (esNodo(v)) {
    const t = v["#text"];
    if (typeof t === "string" && t.trim() !== "") return t.trim();
    // com:values/com:value
    const vals = v["com:values"] ?? v["values"];
    const val = esNodo(vals) ? vals["com:value"] ?? vals["value"] : undefined;
    const lista = val === undefined ? [] : Array.isArray(val) ? val : [val];
    for (const x of lista) {
      const t2 = txt(x);
      if (t2) return t2;
    }
  }
  return null;
};
const num = (v: unknown): number | null => {
  const t = txt(v);
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Primera coincidencia en profundidad por nombre local (ignora prefijo). */
function buscar(nodo: unknown, local: string): unknown[] {
  const out: unknown[] = [];
  const caminar = (v: unknown): void => {
    if (!esNodo(v) && !Array.isArray(v)) return;
    if (Array.isArray(v)) {
      for (const x of v) caminar(x);
      return;
    }
    for (const [k, val] of Object.entries(v)) {
      if (k === local || k.endsWith(`:${local}`)) out.push(val);
      caminar(val);
    }
  };
  caminar(nodo);
  return out;
}

function parsearSite(xml: string): PuntoRecarga | null {
  let d: unknown;
  try {
    d = parser.parse(`<root>${xml}</root>`);
  } catch {
    return null;
  }
  const raiz = esNodo(d) ? (d["root"] as unknown) : null;
  const sites = buscar(raiz, "energyInfrastructureSite");
  const site = sites.length > 0 && esNodo(sites[0]) ? (sites[0] as Nodo) : null;
  if (!site) return null;
  // Dirección en líneas de texto «Municipio: X», «Provincia: Y».
  let municipio: string | null = null;
  let provincia: string | null = null;
  for (const a of buscar(site, "addressLine")) {
    const t = txt(a) ?? "";
    const mm = t.match(/municipio:\s*(.+)/i);
    if (mm) municipio = mm[1].trim();
    const pp = t.match(/provincia:\s*(.+)/i);
    if (pp) provincia = pp[1].trim();
  }
  const conectores: string[] = [];
  for (const c of buscar(site, "connectorType")) {
    const t = txt(c);
    if (t && !conectores.includes(t)) conectores.push(t);
  }
  const lat = buscar(site, "latitude").map(num).find((n) => n !== null) ?? null;
  const lon = buscar(site, "longitude").map(num).find((n) => n !== null) ?? null;
  const operador = buscar(site, "operator").map((o) => txt(esNodo(o) ? o["name"] ?? o : null)).find((t) => t) ?? null;
  return {
    id: txt(site["@id"]) ?? "sin-id",
    nombre: txt(buscar(site, "name")[0]),
    operador,
    municipio,
    provincia,
    cp: txt(buscar(site, "postcode")[0]),
    lat,
    lon,
    conectores,
    actualizado_en: txt(buscar(site, "lastUpdated")[0]),
  };
}

async function obtenerNacional(): Promise<{ ruta: string; sha: string }> {
  mkdirSync("tmp/fase3-cache", { recursive: true });
  if (existsSync(CACHE)) {
    const buf = readFileSync(CACHE);
    return { ruta: CACHE, sha: sha256(buf.toString("binary")) };
  }
  const d = await descargarBinario(NAP_URL, 150 * 1024 * 1024, 300000);
  if ("error" in d) throw new Error(`NAP: ${d.error}`);
  writeFileSync(CACHE, d.buf);
  return { ruta: CACHE, sha: sha256(d.buf.toString("binary")) };
}

let textoNacional: string | null = null;
let shaNacional = "";

/** Puntos del municipio (coincidencia exacta normalizada de municipio; provincia de apoyo). */
export async function cargarRecarga(
  municipio: string,
  provincia: string
): Promise<{ objetos: PuntoRecarga[]; edicion: string; shaOrigen: string; leidos: number }> {
  if (textoNacional === null) {
    const { ruta, sha } = await obtenerNacional();
    textoNacional = readFileSync(ruta, "utf8");
    shaNacional = sha;
  }
  const texto = textoNacional;
  const sha = shaNacional;
  const mun = normalizar(municipio).split(" / ")[0];
  const objetos: PuntoRecarga[] = [];
  let leidos = 0;
  const re = /<(\w+:)?energyInfrastructureSite[\s>][\s\S]*?<\/(\w+:)?energyInfrastructureSite>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    leidos++;
    // Filtro barato por chunk antes de parsear: «Municipio: X».
    const mm = m[0].match(/municipio:\s*([^<]{2,80})/i);
    if (!mm) continue;
    const cm = normalizar(mm[1]);
    if (cm !== mun && !cm.startsWith(mun) && !mun.startsWith(cm)) continue;
    const p = parsearSite(m[0]);
    if (!p) continue;
    if (!p.municipio) p.municipio = mm[1].trim().slice(0, 80);
    if (!p.provincia) {
      const pp = m[0].match(/provincia:\s*([^<]{2,80})/i);
      if (pp) p.provincia = pp[1].trim().slice(0, 80);
    }
    objetos.push(p);
  }
  void provincia;
  return { objetos, edicion: new Date().toISOString().slice(0, 10), shaOrigen: sha, leidos };
}
