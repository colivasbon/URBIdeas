import type { Connector, ConnectorResult } from "./types";
import { FUENTE_OVERPASS, consultarPorMunicipio, mapearElementosOSM } from "./overpass";

const SELECTORES = [
  'nw["emergency"~"^(fire_hydrant|water_tank|suction_point|fire_water_pond)$"]',
  'nw["emergency"~"^(defibrillator|ambulance_station|lifeguard|assembly_point)$"]',
];

/**
 * Recursos de emergencia mapeados en OSM dentro del término municipal: hidrantes y puntos
 * de agua, desfibriladores, bases de ambulancias, socorrismo y puntos de encuentro.
 * La cobertura OSM de estos elementos es muy desigual: la ausencia no significa inexistencia.
 */
export const osmEmergenciasConnector: Connector = {
  id: "osm-emergencias",
  version: "1.0.0",
  nombre: "Recursos de emergencia (OSM/Overpass)",
  descripcion: "Hidrantes, puntos de agua, DEA, ambulancias, socorrismo y puntos de encuentro.",
  categoria: "medios_recursos",
  nivelAutomatizacion: "baja",
  visibilidad: "publica",
  fuente: FUENTE_OVERPASS,
  ambito: [
    { categoria: "servicios_basicos", subcategorias: ["hidrante", "punto_agua_incendios"] },
    {
      categoria: "medios_recursos",
      subcategorias: ["desfibrilador", "base_ambulancias", "puesto_socorrismo"],
    },
    { categoria: "evacuacion", subcategorias: ["punto_encuentro"] },
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
