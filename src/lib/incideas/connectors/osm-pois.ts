import type { Connector, ConnectorResult } from "./types";
import { fetchConReintentos } from "./http";
import { boundaryBBox } from "../pipeline/geo";
import { categoriaDesdeOSM } from "../pipeline/normalize";
import type { RawFeature } from "../pipeline/types";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const FUENTE = {
  nombre: "OpenStreetMap (Overpass)",
  organismo: "OpenStreetMap Foundation",
  licencia: "ODbL 1.0",
  url: "https://overpass-api.de",
};

function construirQuery(bbox: string): string {
  return `[out:json][timeout:90];
(
  nw["amenity"~"^(pharmacy|hospital|clinic|doctors|school|kindergarten|college|police|fire_station|townhall|social_facility|community_centre|library|marketplace|fuel|bus_station|ferry_terminal|veterinary)$"](${bbox});
  nw["tourism"~"^(hotel|hostel|guest_house|apartment|motel|camp_site|caravan_site)$"](${bbox});
  nw["healthcare"~"^(hospital|clinic|centre|doctor|veterinary)$"](${bbox});
  nw["shop"~"^(supermarket|convenience|grocery)$"](${bbox});
  nw["office"="government"](${bbox});
);
out center tags;`;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/**
 * Equipamientos y servicios desde OpenStreetMap (Overpass).
 * Fuente colaborativa; requiere revisión. No se considera suficiente para
 * capacidades, aforos ni situación operativa.
 */
export const osmPoisConnector: Connector = {
  id: "osm-pois",
  version: "1.0.0",
  nombre: "Equipamientos y servicios (OSM/Overpass)",
  descripcion:
    "Farmacias, sanidad, educación, seguridad, alojamientos, combustible, veterinarias y otros.",
  categoria: "equipamientos",
  nivelAutomatizacion: "media",
  visibilidad: "publica",
  fuente: FUENTE,

  async ejecutar({ boundary }): Promise<ConnectorResult> {
    if (!boundary) {
      return { features: [], parcial: false, errores: ["Falta el límite municipal"] };
    }
    const box = boundaryBBox(boundary);
    if (!box) {
      return { features: [], parcial: false, errores: ["No se pudo calcular el bbox"] };
    }
    const bbox = `${box.minLat},${box.minLng},${box.maxLat},${box.maxLng}`;
    const query = construirQuery(bbox);

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
        const json = (await res.json()) as { elements?: OverpassElement[] };
        const features = mapearElementos(json.elements ?? []);
        return { features, parcial: false, errores: [] };
      } catch (err) {
        ultimoError = err instanceof Error ? err.message : String(err);
      }
    }
    return { features: [], parcial: true, errores: [ultimoError] };
  },
};

function mapearElementos(elements: OverpassElement[]): RawFeature[] {
  const out: RawFeature[] = [];
  const vistos = new Set<string>();

  for (const el of elements) {
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
      `${mapeo.subcategoria} ${idOrigen}`;

    const direccion = [
      tags["addr:street"],
      tags["addr:housenumber"],
    ]
      .filter(Boolean)
      .join(" ");

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
      titularidad: tags.operator ? "privada" : undefined,
      gestor: tags.operator || undefined,
      horario: tags.opening_hours || undefined,
      fuente: FUENTE,
      metodo_obtencion: "api",
      atributos: {
        osm_type: el.type,
        osm_id: el.id,
        amenity: tags.amenity,
        tourism: tags.tourism,
        shop: tags.shop,
        healthcare: tags.healthcare,
      },
    });
  }
  return out;
}
