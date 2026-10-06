// Fase 3 — Conector REGCESS (sanidad C1 + farmacias E).
//
// Descarga nacional una vez (caché en tmp/), filtra por municipio y publica
// solo datos no personales: el titular de farmacia (nombre de persona) NO se
// publica; se conserva un hash para identidad. Sin coordenadas en origen:
// los objetos quedan como observaciones administrativas sin geometría.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { createHash } from "node:crypto";
import { descargarBinario, sha256 } from "../../../../src/lib/incideas/fase3/r2";

export const REGCESS_C1_URL = "https://regcesslm.sanidad.gob.es/recesAdminWeb/lm/GetExcelListadoMensual?tipoListado=C1";
export const REGCESS_E_URL = "https://regcesslm.sanidad.gob.es/recesAdminWeb/lm/GetExcelListadoMensual?tipoListado=E";
export const EDICION = "2026-10-01";
const CACHE = "tmp/fase3-cache";

export interface CentroRegcess {
  tipo: string;
  nombre_publico: string;
  municipio: string;
  provincia: string;
  ccaa: string;
  direccion: string;
  cp: string;
  camas: string | null;
  identidad_hash: string;
}

type Fila = Record<string, string | number | null>;

function normalizar(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function leerXlsx(buf: Buffer): Fila[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Fila>(ws, { defval: null, raw: false });
}

async function obtener(url: string, nombre: string): Promise<{ buf: Buffer; sha: string }> {
  mkdirSync(CACHE, { recursive: true });
  const ruta = join(CACHE, nombre);
  if (existsSync(ruta)) {
    const buf = readFileSync(ruta);
    return { buf, sha: sha256(buf.toString("binary")) };
  }
  const d = await descargarBinario(url, 30 * 1024 * 1024, 120000);
  if ("error" in d) throw new Error(`REGCESS ${nombre}: ${d.error}`);
  writeFileSync(ruta, d.buf);
  return { buf: d.buf, sha: sha256(d.buf.toString("binary")) };
}

function hashIdentidad(...partes: Array<string | null>): string {
  return createHash("sha256").update(partes.map((p) => p ?? "").join("|")).digest("hex").slice(0, 16);
}

/**
 * Fila REGCESS → objeto público. Puro y probado: el nombre del titular
 * (persona física) nunca sale en `nombre_publico`.
 */
export function filaAPublico(f: Fila): CentroRegcess | null {
  const tipoCentro = String(f["Tipo centro"] ?? f["Tipo Centro"] ?? "");
  const esFarmacia = /farmacia/i.test(tipoCentro);
  const nombreOrigen = String(f["Nombre Centro"] ?? f["Nombre"] ?? "");
  return {
    tipo: tipoCentro,
    nombre_publico: esFarmacia ? "Oficina de farmacia" : nombreOrigen,
    municipio: String(f["Municipio"] ?? ""),
    provincia: String(f["Provincia"] ?? ""),
    ccaa: String(f["CCAA"] ?? ""),
    direccion: [f["Tipo Via"] ?? f["Tipo Vía"], f["Nombre Via"] ?? f["Nombre Vía"], f["Numero"] ?? f["Número"]].filter(Boolean).join(" "),
    cp: String(f["CP"] ?? ""),
    camas: f["Camas"] !== undefined && f["Camas"] !== null ? String(f["Camas"]) : null,
    identidad_hash: hashIdentidad(tipoCentro, nombreOrigen, String(f["Municipio"] ?? ""), String(f["Via"] ?? "")),
  };
}

/** Filtra centros del listado por municipio (requiere coincidir también provincia). */
export async function cargarRegcess(
  tipo: "C1" | "E",
  municipio: string,
  provincia: string
): Promise<{ objetos: CentroRegcess[]; edicion: string; shaOrigen: string; leidos: number }> {
  const { buf, sha } = await obtener(tipo === "C1" ? REGCESS_C1_URL : REGCESS_E_URL, `regcess-${tipo}.xlsx`);
  const filas = leerXlsx(buf);
  const mun = normalizar(municipio).split(" / ")[0];
  const prov = normalizar(provincia);
  const objetos: CentroRegcess[] = [];
  for (const f of filas) {
    const fMun = normalizar(f["Municipio"]);
    const fProv = normalizar(f["Provincia"]);
    if (!fMun || !fProv) continue;
    const coincideMun = fMun === mun || fMun.startsWith(mun) || mun.startsWith(fMun);
    if (!coincideMun || fProv !== prov) continue;
    const pub = filaAPublico(f);
    if (pub) objetos.push(pub);
  }
  return { objetos, edicion: EDICION, shaOrigen: sha, leidos: filas.length };
}
