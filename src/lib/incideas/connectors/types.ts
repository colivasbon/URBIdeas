import type { CategoriaINCideas, Visibilidad } from "../types";
import type { FuenteRef, RawFeature } from "../pipeline/types";

export interface ConnectorRunArgs {
  codigoINE: string;
  /** Límite municipal en EPSG:4326, si ya se ha obtenido. */
  boundary?: GeoJSON.Geometry | null;
  parametros?: Record<string, unknown>;
}

export interface ConnectorResult {
  features: RawFeature[];
  /** true si la respuesta fue incompleta (no se deben marcar bajas). */
  parcial: boolean;
  errores: string[];
  /** Solo el conector de límites lo rellena. */
  boundary?: GeoJSON.Geometry | null;
}

export interface Connector {
  id: string;
  version: string;
  nombre: string;
  descripcion: string;
  categoria: CategoriaINCideas;
  nivelAutomatizacion: "alta" | "media" | "baja";
  visibilidad: Visibilidad;
  fuente: FuenteRef;
  ejecutar(args: ConnectorRunArgs): Promise<ConnectorResult>;
}
