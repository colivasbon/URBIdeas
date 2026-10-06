// Fase 3 (E) — Límite municipal para cualquier INE.
//
// Reutiliza el cliente WFS y la localización de Fase 2A SIN modificarla:
// el BBOX de arranque lo aporta el llamante y el polígono exacto sale del
// servicio. Mismos estados del contrato.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { ejecutarConControl } from "../fase2a/wfs";
import { localizarMunicipio } from "../fase2a/fuentes";
import type { EvidenciaConsulta } from "../fase2a/wfs";
import type { ElementoWFS } from "../fase2a/wfs";

const UA = "INCideas-Fase3/0.1 (IDEAS Medioambientales; 1 peticion/s)";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const WFS_AU = "https://www.ign.es/wfs-inspire/unidades-administrativas";

export interface Limite3 {
  geometria: GeoJSON.Geometry;
  rutaCodigo: string;
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  evidencias: EvidenciaConsulta[];
}

export async function obtenerLimite3(
  ine: string,
  arranque: { minLon: number; minLat: number; maxLon: number; maxLat: number }
): Promise<Limite3 | { error: EvidenciaConsulta }> {
  const base = {
    base: WFS_AU,
    servicio: "ign-au-wfs" as const,
    version: "2.0.0" as const,
    crs: "urn:ogc:def:crs:EPSG::4258",
    typenames: "au:AdministrativeUnit",
    bboxLonLat: arranque,
    outputFormat: "application/geo+json",
  };
  const { control, filtrada } = await ejecutarConControl(
    { ...base, outputFormat: undefined, resultType: "hits" },
    { ...base, resultType: "results", count: 100 }
  );
  const feats: ElementoWFS[] = filtrada.geojson?.features ?? [];
  if (filtrada.evidencia.estado !== "CONSULTA_VALIDA" || feats.length === 0) {
    return {
      error: {
        servicio: "ign-au-wfs", version: "2.0.0", crs: base.crs, url: filtrada.evidencia.url,
        estado: filtrada.evidencia.estado, detalle: `Límite no obtenido (${feats.length} entidades).`,
        numberMatched: control.evidencia.numberMatched, numberReturned: 0, filtro_verificado: null, ms: filtrada.evidencia.ms,
      },
    };
  }
  const loc = localizarMunicipio(feats, ine);
  if (!loc || !loc.feature.geometry) {
    return {
      error: {
        servicio: "ign-au-wfs", version: "2.0.0", crs: base.crs, url: filtrada.evidencia.url,
        estado: "COBERTURA_NO_DETERMINADA", detalle: `Sin coincidencia exacta de ${ine} entre ${feats.length} unidades.`,
        numberMatched: control.evidencia.numberMatched, numberReturned: feats.length, filtro_verificado: null, ms: filtrada.evidencia.ms,
      },
    };
  }
  const coords: number[] = [];
  const caminar = (g: unknown): void => {
    if (!g) return;
    if (Array.isArray(g) && typeof g[0] === "number") {
      coords.push(g[0] as number, g[1] as number);
      return;
    }
    if (Array.isArray(g)) for (const c of g) caminar(c);
  };
  caminar((loc.feature.geometry as unknown as { coordinates?: unknown })?.coordinates);
  let bbox = arranque;
  if (coords.length >= 4) {
    const lons = coords.filter((_, i) => i % 2 === 0);
    const lats = coords.filter((_, i) => i % 2 === 1);
    bbox = { minLon: Math.min(...lons), minLat: Math.min(...lats), maxLon: Math.max(...lons), maxLat: Math.max(...lats) };
  }
  return { geometria: loc.feature.geometry, rutaCodigo: loc.rutaCodigo, bbox, evidencias: [control.evidencia, filtrada.evidencia] };
}

/** Arranque de respaldo: bbox de Nominatim (OSM, colaborativo) SOLO para
 * encuadrar la consulta al WFS oficial del IGN. El polígono publicado es
 * siempre el oficial; Nominatim nunca aporta geometría final. Respeta 1
 * petición/s y cachea por INE en tmp (no versionado). */
export async function arranqueNominatim(
  ine: string,
  nombre: string,
  provincia: string
): Promise<{ minLon: number; minLat: number; maxLon: number; maxLat: number } | null> {
  mkdirSync("tmp/fase3-cache", { recursive: true });
  const ruta = `tmp/fase3-cache/nominatim-${ine}.json`;
  if (existsSync(ruta)) {
    try {
      const j = JSON.parse(readFileSync(ruta, "utf8")) as { bbox?: [number, number, number, number] };
      if (j.bbox) {
        const [s, n, o, e] = j.bbox;
        return { minLon: o, minLat: s, maxLon: e, maxLat: n };
      }
    } catch { /* reintenta en vivo */ }
  }
  await sleep(1100);
  try {
    const q = new URLSearchParams({
      city: nombre.split(" / ")[0],
      state: provincia,
      country: "España",
      format: "json",
      polygon_geojson: "0",
      limit: "1",
    });
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${q.toString()}`, { headers: { "User-Agent": UA } });
    if (!r.ok) return null;
    const j = (await r.json()) as Array<{ boundingbox?: [string, string, string, string]; display_name?: string }>;
    const bb = j[0]?.boundingbox;
    if (!bb) return null;
    const num = [Number(bb[0]), Number(bb[1]), Number(bb[2]), Number(bb[3])];
    if (num.some((x) => !Number.isFinite(x))) return null;
    writeFileSync(ruta, JSON.stringify({ bbox: num, display_name: j[0]?.display_name ?? "", ine }));
    return { minLon: num[2], minLat: num[0], maxLon: num[3], maxLat: num[1] };
  } catch {
    return null;
  }
}
export const ARRANQUE_FASE3: Record<string, { minLon: number; minLat: number; maxLon: number; maxLat: number }> = {
  "01030": { minLon: -2.65, minLat: 42.58, maxLon: -2.5, maxLat: 42.66 },
  "38038": { minLon: -16.32, minLat: 28.41, maxLon: -16.15, maxLat: 28.52 },
  "31201": { minLon: -1.7, minLat: 42.79, maxLon: -1.6, maxLat: 42.84 },
  "51001": { minLon: -5.38, minLat: 35.86, maxLon: -5.32, maxLat: 35.9 },
};
