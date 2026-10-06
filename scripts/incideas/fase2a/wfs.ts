// Fase 2A — Cliente WFS con orden de ejes contratado y detección de filtros.
//
// Aplica las trampas T1/T2/T3: ejes por tabla (contrato.ts), control sin
// filtro + resultType=hits, y superficie de excepciones del servidor.

import { bboxParaServicio, type EstadoConsulta } from "./contrato";
import { leerGml } from "./gml";

export const UA_FASE2A = "INCideas-Fase2A/0.1 (IDEAS Medioambientales; descargas públicas de prueba)";

export interface EvidenciaConsulta {
  servicio: string;
  version: string;
  crs: string;
  url: string;
  estado: EstadoConsulta;
  detalle: string;
  numberMatched: number | null;
  numberReturned: number | null;
  filtro_verificado: boolean | null;
  ms: number;
}

export interface ElementoWFS {
  type: "Feature";
  id: number;
  geometry: GeoJSON.Geometry | null;
  properties: Record<string, unknown>;
}

export interface PaginaWFS {
  type: "FeatureCollection";
  features: ElementoWFS[];
}

async function leerConTiempo(url: string, timeoutMs = 60000): Promise<{ res: Response; texto: string; ms: number }> {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA_FASE2A }, signal: controller.signal });
    const texto = await res.text();
    return { res, texto, ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

function esExcepcionOWS(texto: string): string | null {
  if (/<\w*:?ExceptionReport|ServiceExceptionReport/.test(texto)) {
    const plano = texto.replace(/\s+/g, " ");
    const m = plano.match(/<(\w*:)?ExceptionText>([^<]{1,400})<\//)
      ?? plano.match(/<(\w*:)?ServiceException[^>]*>([^<]{1,400})</);
    return (m?.[2] ?? m?.[3] ?? "excepción del servidor").slice(0, 400);
  }
  return null;
}

export function extraerConteosWFS200(texto: string): { matched: number | null; returned: number | null } {
  const m = texto.match(/numberMatched="([^"]*)"/);
  const r = texto.match(/numberReturned="([^"]*)"/);
  const num = (s: string | undefined): number | null => {
    if (s === undefined || s === "unknown") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  return { matched: num(m?.[1]), returned: num(r?.[1]) };
}

export interface ParametrosGetFeature {
  base: string;
  servicio: "ign-hidrografia-wfs" | "ign-au-wfs";
  version: "2.0.0" | "1.1.0";
  crs: string;
  typenames: string;
  bboxLonLat: { minLon: number; minLat: number; maxLon: number; maxLat: number } | null;
  outputFormat?: string;
  count?: number;
  startIndex?: number;
  resultType?: "results" | "hits";
  extra?: Record<string, string>;
}

/** Construye la URL GetFeature. Devuelve null si los ejes no están contratados (T1). */
export function urlGetFeature(p: ParametrosGetFeature): string | null {
  let bbox: string | null = null;
  if (p.bboxLonLat) {
    bbox = bboxParaServicio(p.servicio, p.version, p.crs, p.bboxLonLat);
    if (!bbox) return null;
  }
  const q = new URLSearchParams({
    service: "WFS",
    version: p.version,
    request: "GetFeature",
    typenames: p.typenames,
    srsName: p.crs,
  });
  if (bbox) {
    q.set("bbox", `${bbox},${p.crs}`);
  }
  // Sin outputFormat el servidor responde su GML por defecto (algunos
  // servicios rechazan combinaciones como hits+GeoJSON: trampa T3).
  if (p.outputFormat) q.set("outputFormat", p.outputFormat);
  if (p.count !== undefined) q.set("count", String(p.count));
  if (p.startIndex !== undefined) q.set("startIndex", String(p.startIndex));
  if (p.resultType) q.set("resultType", p.resultType);
  for (const [k, v] of Object.entries(p.extra ?? {})) q.set(k, v);
  return `${p.base}?${q.toString()}`;
}

export interface ResultadoWFS {
  evidencia: EvidenciaConsulta;
  geojson: PaginaWFS | null;
  textoCrudo: string;
}

/** Ejecuta un GetFeature y clasifica el estado (contrato §4). */
export async function ejecutarGetFeature(p: ParametrosGetFeature): Promise<ResultadoWFS> {
  const url = urlGetFeature(p);
  const base_ev: Omit<EvidenciaConsulta, "estado" | "detalle" | "numberMatched" | "numberReturned" | "filtro_verificado" | "ms" | "url"> = {
    servicio: p.servicio,
    version: p.version,
    crs: p.crs,
  };
  if (!url) {
    return {
      evidencia: {
        ...base_ev,
        url: p.base,
        estado: "CONSULTA_FALLIDA",
        detalle: `Combinación servicio/versión/CRS sin orden de ejes contratado (T1): ${p.servicio} ${p.version} ${p.crs}`,
        numberMatched: null,
        numberReturned: null,
        filtro_verificado: null,
        ms: 0,
      },
      geojson: null,
      textoCrudo: "",
    };
  }
  try {
    const { res, texto, ms } = await leerConTiempo(url);
    const exc = esExcepcionOWS(texto);
    if (!res.ok || exc) {
      return {
        evidencia: {
          ...base_ev, url, estado: "CONSULTA_FALLIDA",
          detalle: `HTTP ${res.status}${exc ? ` + excepción OWS: ${exc}` : ""}`,
          numberMatched: null, numberReturned: null, filtro_verificado: null, ms,
        },
        geojson: null, textoCrudo: texto,
      };
    }
    const { matched, returned } = extraerConteosWFS200(texto);
    // GeoJSON nativo o GML 3.2 (hidrografía): ambos acaban en features.
    let geojson: PaginaWFS | null = null;
    const recortado = texto.trimStart();
    if (recortado.startsWith("{")) {
      try {
        const parsed = JSON.parse(texto) as { features?: Array<{ id?: unknown; geometry?: GeoJSON.Geometry | null; properties?: Record<string, unknown> }> };
        geojson = {
          type: "FeatureCollection",
          features: (parsed.features ?? []).map((f, i) => ({
            type: "Feature" as const,
            id: typeof f.id === "number" ? f.id : i + 1,
            geometry: f.geometry ?? null,
            properties: f.properties ?? {},
          })),
        };
      } catch {
        geojson = null;
      }
    } else if (recortado.startsWith("<")) {
      const gml = leerGml(texto);
      geojson = {
        type: "FeatureCollection",
        features: gml.entidades.map((e, i) => ({
          type: "Feature" as const,
          id: i + 1,
          geometry: e.geometria,
          properties: { id_origen: e.id_origen, nombre: e.nombre, localId: e.localId, ...(e.atributos as Record<string, unknown>) },
        })),
      };
    }
    const n = geojson?.features?.length ?? returned ?? 0;
    const esHits = p.resultType === "hits";
    const vacia = !esHits && n === 0 && (matched ?? 0) === 0;
    const detalle = esHits
      ? `Control hits: total del servidor numberMatched=${matched}`
      : vacia
        ? "Consulta válida con cero resultados"
        : `Consulta válida con ${n} resultados en página`;
    return {
      evidencia: {
        ...base_ev, url,
        estado: vacia ? "VALIDA_CERO" : "CONSULTA_VALIDA",
        detalle,
        numberMatched: matched, numberReturned: returned ?? n, filtro_verificado: null, ms,
      },
      geojson, textoCrudo: texto,
    };
  } catch (e: unknown) {
    return {
      evidencia: {
        ...base_ev, url, estado: "FUENTE_INACCESIBLE",
        detalle: `Red/servidor inalcanzable: ${String(e instanceof Error ? e.message : e).slice(0, 300)}`,
        numberMatched: null, numberReturned: null, filtro_verificado: null, ms: 0,
      },
      geojson: null, textoCrudo: "",
    };
  }
}

/**
 * Par T2: control sin filtro + consulta filtrada. Si ambas devuelven lo
 * mismo, el filtro NO se da por aplicado.
 */
export async function ejecutarConControl(
  control: ParametrosGetFeature,
  filtrada: ParametrosGetFeature
): Promise<{ control: ResultadoWFS; filtrada: ResultadoWFS }> {
  const c = await ejecutarGetFeature({ ...control, resultType: control.resultType ?? "hits" });
  const f = await ejecutarGetFeature({ ...filtrada, resultType: filtrada.resultType ?? "hits" });
  const verificado =
    c.evidencia.numberMatched !== null && f.evidencia.numberMatched !== null
      ? f.evidencia.numberMatched !== c.evidencia.numberMatched
      : null;
  f.evidencia.filtro_verificado = verificado;
  if (verificado === false) {
    f.evidencia.detalle += " [T2: idéntico al control; el filtro no se da por aplicado]";
  }
  return { control: c, filtrada: f };
}
