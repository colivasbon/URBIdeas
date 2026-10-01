import { fetchConReintentos } from "./http";
import { utmToLatLng } from "../pipeline/utm";

/** Provincias de la Comunitat Valenciana (código INE): Alicante, Castellón, Valencia. */
const PROVINCIAS_CV = new Set(["03", "12", "46"]);

export function esComunitatValenciana(codigoINE: string): boolean {
  return PROVINCIAS_CV.has(codigoINE.slice(0, 2));
}

export interface FeatureICV {
  geometry: { type: string; coordinates: number[] } | null;
  properties: Record<string, string | null>;
}

/**
 * Descarga una capa del WFS del Institut Cartogràfic Valencià en GeoJSON y la filtra por
 * municipio. Las capas usadas son pequeñas (cientos o pocos miles de puntos), por lo que se
 * filtra en cliente sobre `cod_ine_mun` en lugar de depender de filtros FES del servidor.
 */
export async function capaICVPorMunicipio(
  servicio: string,
  typename: string,
  codigoINE: string
): Promise<FeatureICV[]> {
  const url =
    `https://terramapas.icv.gva.es/${servicio}?request=GetFeature&service=WFS&version=2.0.0` +
    `&typename=${encodeURIComponent(typename)}` +
    `&outputformat=${encodeURIComponent("application/json; subtype=geojson")}`;
  const res = await fetchConReintentos(url, { timeoutMs: 90000, reintentos: 3 });
  const json = (await res.json()) as { features?: FeatureICV[] };
  if (!Array.isArray(json.features)) throw new Error(`Respuesta WFS sin features (${typename})`);
  return json.features.filter((f) => f.properties?.cod_ine_mun === codigoINE);
}

/** Punto EPSG:25830 (ETRS89 / UTM 30N) → WGS84. */
export function puntoICV(f: FeatureICV): { lat?: number; lon?: number } {
  const c = f.geometry?.type === "Point" ? f.geometry.coordinates : null;
  if (!c || c.length < 2) return {};
  const { lat, lng } = utmToLatLng(c[0], c[1], 30);
  return { lat, lon: lng };
}

/** Texto limpio; «0» (relleno habitual del origen en fax y teléfono) cuenta como vacío. */
export const texto = (v: string | null | undefined): string | undefined => {
  const t = (v ?? "").trim();
  return t && t !== "0" ? t : undefined;
};
