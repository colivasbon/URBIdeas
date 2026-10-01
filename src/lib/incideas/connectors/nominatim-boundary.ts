import type { Connector, ConnectorResult } from "./types";
import { fetchConReintentos } from "./http";
import type { RawFeature } from "../pipeline/types";

/**
 * Límite municipal desde Nominatim (OpenStreetMap).
 * Fuente colaborativa. Endpoint verificado: devuelve MultiPolygon en EPSG:4326.
 * Uso conforme a la política de Nominatim: User-Agent identificable, 1 petición.
 */
export const nominatimBoundaryConnector: Connector = {
  id: "osm-boundary",
  version: "1.0.0",
  nombre: "Límite municipal (OSM/Nominatim)",
  descripcion: "Límite administrativo municipal como MultiPolygon desde OpenStreetMap.",
  categoria: "territorio",
  nivelAutomatizacion: "media",
  visibilidad: "publica",
  fuente: {
    nombre: "OpenStreetMap (Nominatim)",
    organismo: "OpenStreetMap Foundation",
    licencia: "ODbL 1.0",
    url: "https://nominatim.openstreetmap.org",
  },

  async ejecutar({ codigoINE, parametros }): Promise<ConnectorResult> {
    const nombre = (parametros?.nombre_municipio as string) || codigoINE;
    const url =
      `https://nominatim.openstreetmap.org/search?` +
      new URLSearchParams({
        q: nombre,
        format: "jsonv2",
        polygon_geojson: "1",
        countrycodes: "es",
        limit: "1",
      }).toString();

    const res = await fetchConReintentos(url, { timeoutMs: 45000, reintentos: 3 });
    const data = (await res.json()) as Array<{
      osm_type: string;
      osm_id: number;
      display_name: string;
      geojson?: GeoJSON.Geometry;
    }>;

    if (!data.length) {
      return { features: [], parcial: false, errores: ["Nominatim no devolvió resultados"] };
    }
    const hit = data[0];
    if (!hit.geojson) {
      return { features: [], parcial: false, errores: ["Sin geometría en la respuesta"] };
    }

    const feature: RawFeature = {
      id_origen: `osm:${hit.osm_type}/${hit.osm_id}`,
      nombre: nombre,
      categoria: "territorio",
      subcategoria: "limite_municipal",
      geometria: hit.geojson,
      fuente: {
        nombre: "OpenStreetMap (Nominatim)",
        organismo: "OpenStreetMap Foundation",
        licencia: "ODbL 1.0",
        url: "https://nominatim.openstreetmap.org",
      },
      metodo_obtencion: "api",
      descripcion: hit.display_name,
      atributos: { osm_type: hit.osm_type, osm_id: hit.osm_id, display_name: hit.display_name },
    };

    return {
      features: [feature],
      parcial: false,
      errores: [],
      boundary: hit.geojson,
    };
  },
};
