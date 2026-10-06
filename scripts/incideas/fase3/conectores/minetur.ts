// Fase 3 — Conector MINETUR carburantes (muestra municipal).
//
// Reutiliza el conector existente (lectura) y publica el subconjunto
// municipal en R2. Los precios se descartan a propósito (dato dinámico,
// fuera del alcance del inventario).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fetchConReintentos } from "../../../../src/lib/incideas/connectors/http";
import { resolverIdMunicipio, type EstacionMinetur } from "../../../../src/lib/incideas/connectors/minetur-carburantes";

export interface Estacion {
  id: string;
  rotulo: string | null;
  direccion: string | null;
  cp: string | null;
  localidad: string | null;
  lat: number | null;
  lon: number | null;
}

const BASE = "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes";

const num = (v: string | undefined): number | null => {
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export async function cargarCombustible(
  ine: string,
  nombreMunicipio: string,
  provinciaId: string
): Promise<{ objetos: Estacion[]; edicion: string; shaOrigen: string | null; nota: string; resuelto: boolean }> {
  void ine;
  // Caché por provincia en tmp (una descarga por provincia y oleada).
  mkdirSync("tmp/fase3-cache", { recursive: true });
  const cacheRuta = `tmp/fase3-cache/minetur-mun-${provinciaId}.json`;
  let municipios: Array<{ IDMunicipio: string; IDProvincia: string; Municipio: string }>;
  if (existsSync(cacheRuta)) {
    municipios = JSON.parse(readFileSync(cacheRuta, "utf8")) as typeof municipios;
  } else {
    const rMun = await fetchConReintentos(`${BASE}/Listados/MunicipiosPorProvincia/${provinciaId}`);
    const crudo = (await rMun.json()) as Array<{ IDMunicipio?: unknown; IDProvincia?: unknown; Municipio?: unknown }>;
    municipios = crudo.map((m) => ({
      IDMunicipio: String(m.IDMunicipio ?? ""),
      IDProvincia: String(m.IDProvincia ?? ""),
      Municipio: String(m.Municipio ?? ""),
    }));
    writeFileSync(cacheRuta, JSON.stringify(municipios));
  }
  const idMun = resolverIdMunicipio(municipios, nombreMunicipio);
  if (!idMun) {
    return { objetos: [], edicion: "", shaOrigen: null, resuelto: false, nota: `Sin IDMunicipio MINETUR único para «${nombreMunicipio}» (cero o varios candidatos): cero_resultados.` };
  }
  const rEst = await fetchConReintentos(`${BASE}/EstacionesTerrestres/FiltroMunicipio/${idMun}`);
  const lista = ((await rEst.json()) as { ListaEESSPrecio?: EstacionMinetur[] }).ListaEESSPrecio ?? [];
  return {
    objetos: lista.map((e) => ({
      id: String(e.IDEESS ?? ""),
      rotulo: e["Rótulo"] ?? null,
      direccion: e["Dirección"] ?? null,
      cp: e["C.P."] ?? null,
      localidad: e.Localidad ?? null,
      lat: num(e.Latitud),
      lon: num(e["Longitud (WGS84)"]),
    })),
    resuelto: true,
    edicion: new Date().toISOString().slice(0, 10),
    shaOrigen: null,
    nota: `IDMunicipio=${idMun}; precios descartados.`,
  };
}
