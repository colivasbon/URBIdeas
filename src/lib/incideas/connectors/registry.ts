import type { Connector } from "./types";
import { nominatimBoundaryConnector } from "./nominatim-boundary";
import { osmPoisConnector } from "./osm-pois";
import { inePoblacionConnector } from "./ine-poblacion";

export const CONNECTORS: Connector[] = [
  nominatimBoundaryConnector,
  osmPoisConnector,
  inePoblacionConnector,
];

export function getConnector(id: string): Connector | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

export function listarConectores(): { id: string; nombre: string; categoria: string }[] {
  return CONNECTORS.map((c) => ({ id: c.id, nombre: c.nombre, categoria: c.categoria }));
}
