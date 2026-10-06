// Fase 2A — Contrato en código: estados, ejes, productos y recuentos.
//
// Puro y testeable: sin red, sin disco, sin dependencias. La red vive en
// `wfs.ts`/`fuentes.ts`, la geometría en `geo-calc.ts`.
//
// Restricciones: ninguna función de este módulo escribe en sistemas reales;
// `municipios.poblacion` está fuera de alcance (ver FUERA_DE_ALCANCE_ABAJO).

/** Estados de consulta. Exhaustivos y excluyentes (contrato §4). */
export type EstadoConsulta =
  | "CONSULTA_VALIDA"
  | "VALIDA_CERO"
  | "FUENTE_INACCESIBLE"
  | "CONSULTA_FALLIDA"
  | "COBERTURA_NO_DETERMINADA"
  | "AUSENCIA_CONFIRMADA"
  | "NO_APLICABLE";

/** Municipios de la fase. Sin reglas ad-hoc: ambos usan el mismo pipeline. */
export const MUNICIPIOS = {
  "03031": { ine: "03031", nombre: "Benidorm", ca: "Comunitat Valenciana", patricovaAplicable: true },
  "30030": { ine: "30030", nombre: "Murcia", ca: "Región de Murcia", patricovaAplicable: false },
} as const;

export type CodigoIneFase2A = keyof typeof MUNICIPIOS;

/** Trazabilidad explícita: esta columna está fuera de alcance de la fase. */
export const FUERA_DE_ALCANCE = ["municipios.poblacion", "SOCideas.*"] as const;

/** Productos PATRICOVA. La geomorfológica es nivel de peligrosidad, no producto. */
export const PRODUCTOS_PATRICOVA = [
  {
    clave: "peligrosidad",
    capa: "infraestructuras.gdb/orde_patricova_peligrosidad_inun",
    definicion:
      "Probabilidad de ocurrencia de una inundación en un período y área dados. 6 niveles (1-6, mayor a menor) más un séptimo nivel de peligrosidad geomorfológica.",
  },
  {
    clave: "riesgo",
    capa: "infraestructuras.gdb/orde_patricova_riesgo_inun",
    definicion:
      "Combinación de peligrosidad y vulnerabilidad del uso del suelo (factores económicos, sociales y medioambientales).",
  },
  {
    clave: "estudios",
    capa: "infraestructuras.gdb/orde_patricova_estudios_inun",
    definicion: "Concreción del riesgo de inundación en un ámbito geográfico determinado.",
  },
] as const;

export type ClavePatricova = (typeof PRODUCTOS_PATRICOVA)[number]["clave"];

/** Procedencia: origen y distribuidor nunca se mezclan. */
export const PROCEDENCIA = {
  PATRICOVA: { origen: "Generalitat Valenciana / PATRICOVA", distribuidor: null },
  SNCZI: { origen: "MITECO / SNCZI", distribuidor: null },
  SNCZI_VIA_IDEE: { origen: "MITECO / SNCZI", distribuidor: "IDEE (servicios INSPIRE)" },
  HIDRO: { origen: "IGN / IGR Hidrografía", distribuidor: "IDEE (WFS INSPIRE)" },
  LIMITE: { origen: "IGN / Unidades administrativas", distribuidor: "WFS INSPIRE" },
} as const;

/** Orden de ejes por (servicio, versión, CRS). Sin reglas generales. */
export type OrdenEjes = "latlon" | "lonlat";

interface ReglaEjes {
  servicio: string;
  version: string;
  crs: string;
  orden: OrdenEjes;
}

const TABLA_EJES: ReglaEjes[] = [
  { servicio: "ign-hidrografia-wfs", version: "2.0.0", crs: "urn:ogc:def:crs:EPSG::4258", orden: "latlon" },
  { servicio: "ign-hidrografia-wfs", version: "1.1.0", crs: "EPSG:4326", orden: "latlon" },
  { servicio: "ign-au-wfs", version: "2.0.0", crs: "urn:ogc:def:crs:EPSG::4258", orden: "latlon" },
  { servicio: "inspire-inundaciones-wms", version: "1.3.0", crs: "EPSG:4326", orden: "latlon" },
  { servicio: "inspire-inundaciones-wms", version: "1.3.0", crs: "CRS:84", orden: "lonlat" },
  { servicio: "inspire-inundaciones-wms", version: "1.1.1", crs: "EPSG:4326", orden: "lonlat" },
];

/** Devuelve el orden de ejes o null si la combinación no está contratada. */
export function ordenEjes(servicio: string, version: string, crs: string): OrdenEjes | null {
  const regla = TABLA_EJES.find((r) => r.servicio === servicio && r.version === version && r.crs === crs);
  return regla ? regla.orden : null;
}

/**
 * Ordena un BBOX geográfico según la regla contratada.
 * Entrada siempre en lon/lat explícitas; salida según servicio/versión/CRS.
 */
export function bboxParaServicio(
  servicio: string,
  version: string,
  crs: string,
  bboxLonLat: { minLon: number; minLat: number; maxLon: number; maxLat: number }
): string | null {
  const orden = ordenEjes(servicio, version, crs);
  if (!orden) return null;
  const { minLon, minLat, maxLon, maxLat } = bboxLonLat;
  return orden === "latlon"
    ? `${minLat},${minLon},${maxLat},${maxLon}`
    : `${minLon},${minLat},${maxLon},${maxLat}`;
}

/** Recuentos de hidrografía, siempre separados (contrato §2). */
export interface RecuentosHidro {
  n_objetos: number;
  n_con_nombre: number;
  n_nombres_distintos: number;
  /** hydroIds distintos observados (agrupación observada, NO reconciliación). */
  n_localid_distintos: number;
  /** null = modelo de identidad sin comprobar; nunca inferir. */
  n_entidades_reconciliadas: number | null;
  n_intersectan_termino: number;
  n_solo_bbox: number;
}

/** Calcula los recuentos reconciliados a partir de observaciones. Puro. */
export function reconciliarHidro(obs: {
  objetos: Array<{ id: string; nombre: string | null; localId?: string | null; intersecta: boolean }>;
}): RecuentosHidro {
  const nombres = obs.objetos.map((o) => o.nombre).filter((n): n is string => !!n && n.trim() !== "");
  const localIds = obs.objetos.map((o) => o.localId).filter((n): n is string => !!n && n.trim() !== "");
  return {
    n_objetos: obs.objetos.length,
    n_con_nombre: nombres.length,
    n_nombres_distintos: new Set(nombres.map((n) => n.trim())).size,
    n_localid_distintos: new Set(localIds.map((n) => n.trim())).size,
    n_entidades_reconciliadas: null,
    n_intersectan_termino: obs.objetos.filter((o) => o.intersecta).length,
    n_solo_bbox: obs.objetos.filter((o) => !o.intersecta).length,
  };
}

/** Comprobación T2: un filtro solo se da por aplicado si cambia el control. */
export function filtroVerificado(totalControl: number | null, totalFiltrado: number | null): boolean {
  if (totalControl === null || totalFiltrado === null) return false;
  return totalFiltrado !== totalControl;
}

/** Déficit de contención entre escenarios del mismo estudio/versión. Puro. */
export function deficitContencion(areaInferior: number, areaInterseccion: number): {
  area_no_contenida_m2: number;
  fraccion_no_contenida: number | null;
} {
  const noContenida = Math.max(0, areaInferior - areaInterseccion);
  return {
    area_no_contenida_m2: noContenida,
    fraccion_no_contenida: areaInferior > 0 ? noContenida / areaInferior : null,
  };
}

/**
 * Solo compara escenarios del mismo estudio y versión. Si difieren, no hay
 * comparación posible (devolver null), nunca forzar el resultado.
 */
export function escenariosComparables(a: { estudio: string; version: string }, b: { estudio: string; version: string }): boolean {
  return a.estudio === b.estudio && a.version === b.version;
}

/** Atributos hidráulicos: solo se conservan si vienen en el origen. */
const ATRIBUTOS_HIDRAULICOS = ["caudal", "hipotesis", "modelo", "escala", "fecha_aprobacion"] as const;

export function atributosHidraulicosPresentes(atributos: Record<string, unknown>): string[] {
  return ATRIBUTOS_HIDRAULICOS.filter((k) => {
    const v = atributos[k];
    return v !== undefined && v !== null && String(v).trim() !== "";
  });
}
