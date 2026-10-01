import type { Connector, ConnectorResult } from "./types";
import { boundaryBBox } from "../pipeline/geo";
import { FUENTE_OVERPASS, consultarOverpass, mapearElementosOSM } from "./overpass";

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

/**
 * Equipamientos y servicios desde OpenStreetMap (Overpass).
 * Fuente colaborativa; requiere revisión. No se considera suficiente para
 * capacidades, aforos ni situación operativa.
 *
 * Consulta por bbox a propósito: conserva recursos próximos de municipios vecinos
 * (p. ej. el hospital comarcal), que la validación espacial marca como fuera_municipio
 * o próximo_limite sin descartarlos.
 */
export const osmPoisConnector: Connector = {
  id: "osm-pois",
  version: "1.1.0",
  nombre: "Equipamientos y servicios (OSM/Overpass)",
  descripcion:
    "Farmacias, sanidad, educación, seguridad, alojamientos, combustible, veterinarias y otros.",
  categoria: "equipamientos",
  nivelAutomatizacion: "media",
  visibilidad: "publica",
  fuente: FUENTE_OVERPASS,
  ambito: [
    {
      categoria: "equipamientos",
      subcategorias: [
        "farmacia",
        "hospital",
        "centro_salud",
        "consultorio",
        "colegio",
        "escuela_infantil",
        "instituto",
        "centro_formacion",
        "policia",
        "bomberos",
        "administracion",
        "servicios_sociales",
        "centro_comunitario",
        "biblioteca",
        "mercado",
        "alimentacion",
      ],
    },
    {
      categoria: "infraestructuras",
      subcategorias: ["alojamiento", "camping", "estacion_autobus", "puerto"],
    },
    { categoria: "servicios_basicos", subcategorias: ["estacion_servicio"] },
    { categoria: "animales", subcategorias: ["clinica_veterinaria"] },
  ],

  async ejecutar({ boundary }): Promise<ConnectorResult> {
    if (!boundary) {
      return { features: [], parcial: true, errores: ["Falta el límite municipal"] };
    }
    const box = boundaryBBox(boundary);
    if (!box) {
      return { features: [], parcial: true, errores: ["No se pudo calcular el bbox"] };
    }
    const r = await consultarOverpass(
      construirQuery(`${box.minLat},${box.minLng},${box.maxLat},${box.maxLng}`)
    );
    if ("error" in r) return { features: [], parcial: true, errores: [r.error] };
    return { features: mapearElementosOSM(r.elements), parcial: false, errores: [] };
  },
};
