import { fetchConReintentos } from "./http";
import { boundaryBBox } from "../pipeline/geo";
import { categoriaDesdeOSM } from "../pipeline/normalize";
import type { FuenteRef, RawFeature } from "../pipeline/types";

export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

export const FUENTE_OVERPASS: FuenteRef = {
  nombre: "OpenStreetMap (Overpass)",
  organismo: "OpenStreetMap Foundation",
  licencia: "ODbL 1.0",
  url: "https://overpass-api.de",
};

export interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Ejecuta una consulta Overpass QL probando los endpoints en orden. */
export async function consultarOverpass(
  query: string
): Promise<{ elements: OverpassElement[] } | { error: string }> {
  let ultimoError = "";
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetchConReintentos(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        timeoutMs: 100000,
        reintentos: 2,
        pausaMs: 4000,
      });
      const texto = await res.text();
      // Overpass responde 200 con HTML cuando el despachador está saturado.
      if (!texto.trimStart().startsWith("{")) {
        throw new Error(`Respuesta no JSON de ${endpoint}`);
      }
      const json = JSON.parse(texto) as { elements?: OverpassElement[]; remark?: string };
      if (json.remark && /error|timed out/i.test(json.remark)) {
        throw new Error(`Overpass: ${json.remark}`);
      }
      return { elements: json.elements ?? [] };
    } catch (err) {
      ultimoError = err instanceof Error ? err.message : String(err);
    }
  }
  return { error: ultimoError };
}

/**
 * Consulta los selectores dentro del término municipal, identificado por el código INE
 * que OSM etiqueta en los límites españoles (`ine:municipio`). Esto evita capturar recursos
 * de municipios vecinos, cosa que ocurre al consultar por bbox.
 *
 * La consulta devuelve primero el recuento de áreas encontradas; si es 0 (el límite no
 * lleva la etiqueta), se repite por bbox del límite y se indica en `modo`.
 */
export async function consultarPorMunicipio(
  codigoINE: string,
  selectores: string[],
  boundary?: GeoJSON.Geometry | null
): Promise<
  | { elements: OverpassElement[]; modo: "area" | "bbox" }
  | { error: string; parcial: true }
> {
  const area = `area["boundary"="administrative"]["ine:municipio"="${codigoINE}"]->.a;`;
  const cuerpo = selectores.map((s) => `  ${s}(area.a);`).join("\n");
  const qArea = `[out:json][timeout:90];\n${area}\n.a out count;\n(\n${cuerpo}\n);\nout center tags;`;

  const r = await consultarOverpass(qArea);
  if ("error" in r) return { error: r.error, parcial: true };

  const [conteo, ...resto] = r.elements;
  const areas = Number((conteo?.tags as Record<string, string> | undefined)?.areas ?? 0);
  if (conteo?.type === "count" && areas > 0) return { elements: resto, modo: "area" };

  const box = boundary ? boundaryBBox(boundary) : null;
  if (!box) {
    return {
      error: `OSM no tiene área con ine:municipio=${codigoINE} y no hay límite para usar bbox`,
      parcial: true,
    };
  }
  const bbox = `${box.minLat},${box.minLng},${box.maxLat},${box.maxLng}`;
  const qBox = `[out:json][timeout:90];\n(\n${selectores.map((s) => `  ${s}(${bbox});`).join("\n")}\n);\nout center tags;`;
  const rb = await consultarOverpass(qBox);
  if ("error" in rb) return { error: rb.error, parcial: true };
  return { elements: rb.elements, modo: "bbox" };
}

/** Convierte elementos Overpass en RawFeature con el mapeo de categorías de INCideas. */
export function mapearElementosOSM(
  elements: OverpassElement[],
  fuente: FuenteRef = FUENTE_OVERPASS
): RawFeature[] {
  const out: RawFeature[] = [];
  const vistos = new Set<string>();

  for (const el of elements) {
    if (el.type !== "node" && el.type !== "way" && el.type !== "relation") continue;
    const tags = el.tags ?? {};
    const mapeo = categoriaDesdeOSM(tags);
    if (!mapeo) continue;

    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    const idOrigen = `${el.type}/${el.id}`;
    if (vistos.has(idOrigen)) continue;
    vistos.add(idOrigen);

    const nombre =
      tags.name ||
      tags["name:es"] ||
      tags.operator ||
      `${mapeo.subcategoria.replace(/_/g, " ")} ${idOrigen}`;

    const direccion = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");

    const atributos: Record<string, unknown> = { osm_type: el.type, osm_id: el.id };
    for (const k of [
      "amenity",
      "tourism",
      "shop",
      "healthcare",
      "emergency",
      "highway",
      "railway",
      "aeroway",
      "route_ref",
      "network",
      "access",
      "indoor",
      "fire_hydrant:type",
      "defibrillator:location",
    ]) {
      if (tags[k]) atributos[k] = tags[k];
    }

    out.push({
      id_origen: idOrigen,
      nombre,
      categoria: mapeo.categoria,
      subcategoria: mapeo.subcategoria,
      lat,
      lon,
      direccion: direccion || undefined,
      telefono: tags.phone || tags["contact:phone"] || undefined,
      web: tags.website || tags["contact:website"] || undefined,
      codigo_postal: tags["addr:postcode"] || undefined,
      // operator:type (public/private/...) es la etiqueta específica; `operator` solo nombra
      // al gestor y no implica titularidad privada.
      titularidad: tags["operator:type"] || undefined,
      gestor: tags.operator || undefined,
      horario: tags.opening_hours || undefined,
      fuente,
      metodo_obtencion: "api",
      atributos,
    });
  }
  return out;
}
