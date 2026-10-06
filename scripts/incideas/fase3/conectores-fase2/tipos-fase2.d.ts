// Fase 2 (agente-fase2) — Declaración mínima de tipos para el paquete
// `shapefile` (0.6.6, dependencia directa del repo, sin tipos propios).
// Solo la superficie usada en memoria (ArrayBuffer/Uint8Array, sin disco).

declare module "shapefile" {
  export interface CaracteristicaShp {
    type: "Feature";
    properties: Record<string, unknown> | null;
    geometry: { type: string; coordinates: unknown } | null;
  }
  export interface LecturaShp {
    done: boolean;
    value?: CaracteristicaShp;
  }
  export interface FuenteShp {
    read(): Promise<LecturaShp>;
  }
  export function open(
    shp: ArrayBuffer | Uint8Array,
    dbf?: ArrayBuffer | Uint8Array | undefined
  ): Promise<FuenteShp>;
}
