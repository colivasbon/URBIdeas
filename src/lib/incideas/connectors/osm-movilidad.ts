import type { Connector, ConnectorResult } from "./types";
import { FUENTE_OVERPASS, consultarPorMunicipio, mapearElementosOSM } from "./overpass";

const SELECTORES = [
  'nw["highway"="bus_stop"]',
  'nw["railway"~"^(station|halt|tram_stop)$"]',
  'nw["amenity"="taxi"]',
  'nw["aeroway"~"^(helipad|heliport)$"]',
];

/**
 * Paradas y estaciones de transporte y helipuertos (OSM/Overpass), dentro del término
 * municipal. Colaborativa: las paradas municipales o del operador prevalecen.
 */
export const osmMovilidadConnector: Connector = {
  id: "osm-movilidad",
  version: "1.0.0",
  nombre: "Transporte y helipuertos (OSM/Overpass)",
  descripcion: "Paradas de autobús, estaciones de tren y tranvía, paradas de taxi y helipuertos.",
  categoria: "infraestructuras",
  nivelAutomatizacion: "media",
  visibilidad: "publica",
  fuente: FUENTE_OVERPASS,
  ambito: [
    {
      categoria: "infraestructuras",
      subcategorias: [
        "parada_autobus",
        "estacion_ferrocarril",
        "parada_tranvia",
        "parada_taxi",
        "helipuerto",
      ],
    },
  ],

  async ejecutar({ codigoINE, boundary }): Promise<ConnectorResult> {
    const r = await consultarPorMunicipio(codigoINE, SELECTORES, boundary);
    if ("error" in r) return { features: [], parcial: r.parcial, errores: [r.error] };
    return {
      features: mapearElementosOSM(r.elements),
      parcial: false,
      errores: r.modo === "bbox" ? ["Consulta por bbox: sin área ine:municipio en OSM"] : [],
    };
  },
};
