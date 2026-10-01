import { createHash } from "node:crypto";
import type { CategoriaINCideas } from "../types";

export interface HuellaInput {
  fuente: string;
  codigoINE: string;
  categoria: CategoriaINCideas;
  nombreNormalizado: string;
  lat?: number;
  lon?: number;
}

/**
 * Huella determinista. Incluye la fuente para que dos fuentes distintas que
 * describan el mismo lugar NO colisionen: la deduplicación entre fuentes se
 * resuelve aparte y nunca fusiona automáticamente.
 *
 * La coordenada se redondea a 5 decimales (~1 m) para absorber microvariaciones
 * sin fusionar puntos claramente distintos.
 */
export function computeHuella(input: HuellaInput): string {
  const lat = input.lat !== undefined ? input.lat.toFixed(5) : "";
  const lon = input.lon !== undefined ? input.lon.toFixed(5) : "";
  const payload = [
    input.fuente,
    input.codigoINE,
    input.categoria,
    input.nombreNormalizado,
    lat,
    lon,
  ].join("|");
  return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 32);
}
