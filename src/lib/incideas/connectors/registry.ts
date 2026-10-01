import type { Connector } from "./types";
import { nominatimBoundaryConnector } from "./nominatim-boundary";
import { osmPoisConnector } from "./osm-pois";
import { inePoblacionConnector } from "./ine-poblacion";
import { osmMovilidadConnector } from "./osm-movilidad";
import { osmEmergenciasConnector } from "./osm-emergencias";
import { mineturCarburantesConnector } from "./minetur-carburantes";
import { gvaCentrosDocentesConnector } from "./gva-centros-docentes";
import { gvaCentrosSanitariosConnector } from "./gva-centros-sanitarios";

/** Orden de ejecución de «all»: el límite primero, porque lo usan los demás. */
export const CONNECTORS: Connector[] = [
  nominatimBoundaryConnector,
  osmPoisConnector,
  inePoblacionConnector,
  osmMovilidadConnector,
  osmEmergenciasConnector,
  mineturCarburantesConnector,
  gvaCentrosDocentesConnector,
  gvaCentrosSanitariosConnector,
];

export function getConnector(id: string): Connector | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

export function listarConectores(): { id: string; nombre: string; categoria: string }[] {
  return CONNECTORS.map((c) => ({ id: c.id, nombre: c.nombre, categoria: c.categoria }));
}
