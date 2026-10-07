// Capas WFS del IEPNB que usa el análisis de entorno. Compartido por el servidor y por el navegador:
// cuando el geoserver rechaza (403) al servidor, el navegador del usuario las descarga y las reenvía.

export type IdIepnb = "enp" | "rn2000" | "mfe" | "montes";

export interface CapaIepnb {
  typeName: string;
  /** Radio de consulta alrededor del ámbito (m). */
  radio: number;
  max: number;
  propiedades?: string[];
}

export const CAPAS_IEPNB: Record<IdIepnb, CapaIepnb> = {
  enp: { typeName: "ENP:enp", radio: 30000, max: 200 },
  rn2000: { typeName: "RN2000:rn2000", radio: 30000, max: 200 },
  mfe: { typeName: "foto_fija_mfe:ff_uso", radio: 2000, max: 3000, propiedades: ["descr_clamfe", "agrupacion_clamfe", "descr_forarb", "nm_fccarb", "geom"] },
  montes: { typeName: "propiedad_montes:propiedad_montes", radio: 10000, max: 1500 },
};

export const IDS_IEPNB = Object.keys(CAPAS_IEPNB) as IdIepnb[];

export function paramsWfsIepnb(c: CapaIepnb, bbox: [number, number, number, number]): URLSearchParams {
  const p = new URLSearchParams({
    service: "WFS",
    version: "1.1.0",
    request: "GetFeature",
    typeName: c.typeName,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    maxFeatures: String(c.max),
    bbox: `${bbox.join(",")},EPSG:4326`,
  });
  if (c.propiedades) p.set("propertyName", c.propiedades.join(","));
  return p;
}
