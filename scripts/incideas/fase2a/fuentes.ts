// Fase 2A — Fuentes oficiales: descargas y evidencias.
//
// Solo lecturas públicas. Cada función devuelve datos + evidencia con estado
// del contrato. Nada se repara ni se inventa; lo que no se puede obtener se
// registra con su estado.

import { createHash } from "node:crypto";
import { type CodigoIneFase2A, type EstadoConsulta } from "./contrato";
import {
  ejecutarGetFeature,
  ejecutarConControl,
  UA_FASE2A,
  type EvidenciaConsulta,
  type ElementoWFS,
} from "./wfs";

export const WFS_HIDRO = "https://servicios.idee.es/wfs-inspire/hidrografia";
const WFS_AU = "https://www.ign.es/wfs-inspire/unidades-administrativas";
export const WMS_INSPIRE_INUND = "https://servicios.idee.es/wms-inspire/riesgos-naturales/inundaciones";
export const WMS_PATRICOVA = "http://carto.icv.gva.es/arcgis/services/tm_infraestructuras/ordenacion_territorial/MapServer/WmsServer";

/** BBOX de arranque por municipio (lon/lat explícitas; se refina con el límite real). */
export const BBOX_ARRANQUE: Record<CodigoIneFase2A, { minLon: number; minLat: number; maxLon: number; maxLat: number }> = {
  "03031": { minLon: -0.16, minLat: 38.5, maxLon: -0.07, maxLat: 38.6 },
  "30030": { minLon: -1.28, minLat: 37.9, maxLon: -0.92, maxLat: 38.12 },
};

export interface EvidenciaFuente {
  fuente: string;
  url: string;
  estado: EstadoConsulta;
  detalle: string;
  bytes: number | null;
  sha256: string | null;
  extra?: Record<string, unknown>;
}

type Props = Record<string, unknown>;

function sha(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

async function descargar(url: string, timeoutMs = 60000): Promise<{ estado: EstadoConsulta; detalle: string; buf: Buffer | null; contentType: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA_FASE2A }, signal: controller.signal });
    if (!res.ok) {
      return { estado: "CONSULTA_FALLIDA", detalle: `HTTP ${res.status} ${res.statusText}`, buf: null, contentType: res.headers.get("content-type") };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { estado: "CONSULTA_VALIDA", detalle: `HTTP 200, ${buf.length} bytes`, buf, contentType: res.headers.get("content-type") };
  } catch (e: unknown) {
    return { estado: "FUENTE_INACCESIBLE", detalle: String(e instanceof Error ? e.message : e).slice(0, 300), buf: null, contentType: null };
  } finally {
    clearTimeout(timer);
  }
}

/** Aplana propiedades anidadas en pares ruta→valor. */
function aplanar(props: Props, pref = ""): Array<[string, unknown]> {
  const planas: Array<[string, unknown]> = [];
  for (const [k, v] of Object.entries(props)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      planas.push(...aplanar(v as Props, `${pref}${k}.`));
    } else {
      planas.push([`${pref}${k}`, v]);
    }
  }
  return planas;
}

/** Busca en las propiedades el código INE (nationalCode u otra ruta): registra la ruta real. */
export function localizarMunicipio(
  features: ElementoWFS[],
  ine: string
): { feature: ElementoWFS; rutaCodigo: string; candidatos: string[] } | null {
  const candidatos: string[] = [];
  const exactos: Array<{ feature: ElementoWFS; ruta: string; nivel: string; area: number }> = [];
  for (const f of features) {
    const props: Props = f.properties ?? {};
    const planas = aplanar(props);
    const claves = planas.map(([k]) => k);
    if (candidatos.length === 0) candidatos.push(...claves.slice(0, 40));
    const soloDigitos = (v: string) => v.replace(/\D/g, "");
    const hit = planas.find(([k, v]) => {
      if (typeof v !== "string") return false;
      if (!/nationalcode|codigo|code/i.test(k)) return false;
      const d = soloDigitos(v);
      return d === ine || d === `0${ine}` || d.endsWith(ine);
    });
    if (hit) {
      const nivel = String(planas.find(([k]) => /nationallevel|level/i.test(k))?.[1] ?? "");
      const bb = f.geometry ? requireBbox(f.geometry) : null;
      const area = bb ? (bb[2] - bb[0]) * (bb[3] - bb[1]) : Infinity;
      exactos.push({ feature: f, ruta: String(hit[0]), nivel, area });
    }
  }
  if (exactos.length === 0) return null;
  // Entre coincidencias exactas de código (municipio, provincia, CCAA
  // superpuestas) gana la de menor extensión: el municipio siempre es menor
  // que sus contenedores. Principio general, sin reglas por municipio.
  exactos.sort((a, b) => a.area - b.area);
  const elegido = exactos[0];
  return {
    feature: elegido.feature,
    rutaCodigo: `${elegido.ruta} (nivel=${elegido.nivel || "?"}; ${exactos.length} coincidencias exactas, gana la menor extensión)`,
    candidatos: candidatos.slice(0, 40),
  };
}

function requireBbox(g: GeoJSON.Geometry): [number, number, number, number] | null {
  const xs: number[] = [];
  const ys: number[] = [];
  const caminar = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") {
      xs.push(c[0] as number);
      ys.push(c[1] as number);
      return;
    }
    if (Array.isArray(c)) for (const x of c) caminar(x);
  };
  caminar((g as { coordinates: unknown }).coordinates);
  if (xs.length === 0) return null;
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export interface LimiteMunicipal {
  feature: ElementoWFS;
  rutaCodigo: string;
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  evidencias: EvidenciaConsulta[];
}

/** Límite municipal desde el WFS de Unidades Administrativas del IGN. */
export async function obtenerLimite(ine: CodigoIneFase2A): Promise<LimiteMunicipal | { error: EvidenciaConsulta }> {
  const arranque = BBOX_ARRANQUE[ine];
  const base = {
    base: WFS_AU,
    servicio: "ign-au-wfs" as const,
    version: "2.0.0" as const,
    crs: "urn:ogc:def:crs:EPSG::4258",
    typenames: "au:AdministrativeUnit",
    bboxLonLat: arranque,
    outputFormat: "application/geo+json",
  };
  // T2: control por lámina (hits en GML por defecto: hits+GeoJSON es
  // combinación incompatible en este servidor — trampa T3) + página GeoJSON.
  const { control, filtrada } = await ejecutarConControl(
    { ...base, outputFormat: undefined, resultType: "hits" },
    { ...base, resultType: "results", count: 100 }
  );
  const feats = filtrada.geojson?.features ?? [];
  if (filtrada.evidencia.estado !== "CONSULTA_VALIDA" || feats.length === 0) {
    return {
      error: {
        servicio: "ign-au-wfs", version: "2.0.0", crs: base.crs, url: filtrada.evidencia.url,
        estado: filtrada.evidencia.estado, detalle: `Límite no obtenido (${feats.length} entidades). Control hits=${control.evidencia.numberMatched}.`,
        numberMatched: control.evidencia.numberMatched, numberReturned: 0, filtro_verificado: null, ms: filtrada.evidencia.ms,
      },
    };
  }
  const loc = localizarMunicipio(feats, ine);
  if (!loc) {
    const claves = feats[0]?.properties ? Object.keys(feats[0].properties).slice(0, 12).join(",") : "?";
    return {
      error: {
        servicio: "ign-au-wfs", version: "2.0.0", crs: base.crs, url: filtrada.evidencia.url,
        estado: "COBERTURA_NO_DETERMINADA", detalle: `Sin coincidencia de código ${ine} entre ${feats.length} unidades del BBOX. Claves vistas: ${claves}`,
        numberMatched: control.evidencia.numberMatched, numberReturned: feats.length, filtro_verificado: null, ms: filtrada.evidencia.ms,
      },
    };
  }
  const coords: number[] = [];
  const caminar = (g: unknown): void => {
    if (!g) return;
    if (Array.isArray(g) && typeof g[0] === "number") {
      coords.push(g[0] as number, g[1] as number);
      return;
    }
    if (Array.isArray(g)) for (const c of g) caminar(c);
  };
  const geomRaw = loc.feature.geometry as unknown as { coordinates?: unknown };
  caminar(geomRaw?.coordinates);
  let bbox = arranque;
  if (coords.length >= 4) {
    const lons = coords.filter((_, i) => i % 2 === 0);
    const lats = coords.filter((_, i) => i % 2 === 1);
    bbox = { minLon: Math.min(...lons), minLat: Math.min(...lats), maxLon: Math.max(...lons), maxLat: Math.max(...lats) };
  }
  return { feature: loc.feature, rutaCodigo: loc.rutaCodigo, bbox, evidencias: [control.evidencia, filtrada.evidencia] };
}

export interface ObjetoHidro {
  id: string;
  localId: string | null;
  nombre: string | null;
  geometria: GeoJSON.Geometry | null;
  atributos: Props;
}

export interface CapaHidro {
  tipo: "hy-p:Watercourse" | "hy-n:WatercourseLink";
  objetos: ObjetoHidro[];
  clavesPropiedades: string[];
  evidencias: EvidenciaConsulta[];
  totalServidor: number | null;
}

function extraerIdNombre(props: Props, fid: number | string): { id: string; localId: string | null; nombre: string | null } {
  // Vía lector GML: id_origen es el gml:id del miembro; localId el hydroId.
  const id = typeof props["id_origen"] === "string" && props["id_origen"] !== "" ? (props["id_origen"] as string) : String(fid ?? "sin-id");
  const localId = typeof props["localId"] === "string" && (props["localId"] as string) !== "" ? (props["localId"] as string) : null;
  const nombreDirecto = typeof props["nombre"] === "string" && (props["nombre"] as string).trim() !== "" ? (props["nombre"] as string) : null;
  const geo = props["geographicalName"];
  const geoObj = geo !== null && typeof geo === "object" && !Array.isArray(geo) ? (geo as Props) : null;
  const spelling = geoObj?.["spelling"];
  const spellingObj = spelling !== null && typeof spelling === "object" && !Array.isArray(spelling) ? (spelling as Props) : null;
  const nombre = nombreDirecto ?? (typeof spellingObj?.["text"] === "string" ? (spellingObj?.["text"] as string) : null) ?? (typeof props["name"] === "string" ? (props["name"] as string) : null);
  return { id: String(id), localId, nombre: typeof nombre === "string" && nombre.trim() !== "" ? nombre : null };
}

/** Descarga una capa hidrográfica con paginación verificada (hits + páginas). */
export async function obtenerHidro(
  tipo: "hy-p:Watercourse" | "hy-n:WatercourseLink",
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number }
): Promise<CapaHidro> {
  const base = {
    base: WFS_HIDRO,
    servicio: "ign-hidrografia-wfs" as const,
    version: "2.0.0" as const,
    crs: "urn:ogc:def:crs:EPSG::4258",
    typenames: tipo,
    outputFormat: undefined as string | undefined,
  };
  const objetos: ObjetoHidro[] = [];
  const claves = new Set<string>();
  const evidencias: EvidenciaConsulta[] = [];
  const vistos = new Set<string>();

  const ingerir = (features: ElementoWFS[]): number => {
    let nuevos = 0;
    for (const f of features) {
      const props: Props = f.properties ?? {};
      for (const k of Object.keys(props)) claves.add(k);
      const { id, localId, nombre } = extraerIdNombre(props, f.id);
      // Deduplicación por miembro (gml:id): varios miembros pueden
      // compartir hydroId sin ser el mismo tramo. No se fusionan.
      const gmlId = typeof props["gmlId"] === "string" && (props["gmlId"] as string) !== "" ? (props["gmlId"] as string) : id;
      if (vistos.has(gmlId)) continue;
      vistos.add(gmlId);
      nuevos++;
      objetos.push({ id, localId, nombre, geometria: f.geometry, atributos: props });
    }
    return nuevos;
  };

  const rango = async (bb: typeof bbox, etiqueta: string): Promise<number | null> => {
    const hits = await ejecutarGetFeature({ ...base, bboxLonLat: bb, resultType: "hits" });
    evidencias.push({ ...hits.evidencia, detalle: `${hits.evidencia.detalle} [${etiqueta}]` });
    const total = hits.evidencia.numberMatched;
    if (hits.evidencia.estado !== "CONSULTA_VALIDA" && hits.evidencia.estado !== "VALIDA_CERO") return null;
    if (!total) return 0;
    let pageSize = total > 5000 ? 1000 : 200;
    let start = 0;
    const tamMin = 50;
    let paginas = 0;
    const maxPaginas = Math.ceil(total / tamMin) + 3;
    while (start < total && paginas < maxPaginas) {
      paginas++;
      const r = await ejecutarGetFeature({ ...base, bboxLonLat: bb, resultType: "results", count: pageSize, startIndex: start });
      if (r.evidencia.estado !== "CONSULTA_VALIDA" && r.evidencia.estado !== "VALIDA_CERO") {
        evidencias.push({ ...r.evidencia, detalle: `${r.evidencia.detalle} (página ${start}+${pageSize}, ${etiqueta})` });
        if (pageSize > tamMin) {
          pageSize = Math.max(tamMin, Math.floor(pageSize / 2));
          continue;
        }
        break;
      }
      evidencias.push(r.evidencia);
      if (!r.geojson?.features) break;
      const nuevos = ingerir(r.geojson.features);
      const devueltos = r.geojson.features.length;
      start += devueltos;
      if (devueltos < pageSize || nuevos === 0) break;
    }
    return total;
  };

  const total = await rango(bbox, "bbox-completo");
  // Si la descarga quedó incompleta, subdivisión recursiva del BBOX
  // (partición espacial acotada, misma función para cualquier municipio):
  // las celdas con ≤1000 objetos se descargan enteras; las mayores se
  // subdividen hasta profundidad 4. Unión deduplicada por miembro.
  const UMBRAL_CELDA = 1000;
  const PROF_MAX = 4;
  const cubrir = async (bb: typeof bbox, prof: number, etiqueta: string): Promise<void> => {
    const hits = await ejecutarGetFeature({ ...base, bboxLonLat: bb, resultType: "hits" });
    const m = hits.evidencia.numberMatched ?? 0;
    if (hits.evidencia.estado !== "CONSULTA_VALIDA" && hits.evidencia.estado !== "VALIDA_CERO") {
      evidencias.push({ ...hits.evidencia, detalle: `${hits.evidencia.detalle} [celda ${etiqueta}]` });
      return;
    }
    if (m === 0) return;
    if (m <= UMBRAL_CELDA || prof >= PROF_MAX) {
      if (m > UMBRAL_CELDA) {
        evidencias.push({
          servicio: base.servicio, version: base.version, crs: base.crs, url: base.base,
          estado: "CONSULTA_VALIDA", detalle: `Celda ${etiqueta} con ${m} objetos a profundidad máxima: descarga parcial posible.`,
          numberMatched: m, numberReturned: null, filtro_verificado: null, ms: 0,
        });
      }
      let pageSize = Math.min(1000, m);
      let start = 0;
      const tamMin = 50;
      let paginas = 0;
      while (start < m && paginas < Math.ceil(m / tamMin) + 3) {
        paginas++;
        const r = await ejecutarGetFeature({ ...base, bboxLonLat: bb, resultType: "results", count: pageSize, startIndex: start });
        if (r.evidencia.estado !== "CONSULTA_VALIDA" && r.evidencia.estado !== "VALIDA_CERO") {
          if (pageSize > tamMin) { pageSize = Math.max(tamMin, Math.floor(pageSize / 2)); continue; }
          evidencias.push({ ...r.evidencia, detalle: `${r.evidencia.detalle} [celda ${etiqueta}]` });
          break;
        }
        if (!r.geojson?.features) break;
        const nuevos = ingerir(r.geojson.features);
        const devueltos = r.geojson.features.length;
        start += devueltos;
        if (devueltos < pageSize || nuevos === 0) break;
      }
      return;
    }
    const midLon = (bb.minLon + bb.maxLon) / 2;
    const midLat = (bb.minLat + bb.maxLat) / 2;
    const sub = [
      { minLon: bb.minLon, minLat: bb.minLat, maxLon: midLon, maxLat: midLat },
      { minLon: midLon, minLat: bb.minLat, maxLon: bb.maxLon, maxLat: midLat },
      { minLon: bb.minLon, minLat: midLat, maxLon: midLon, maxLat: bb.maxLat },
      { minLon: midLon, minLat: midLat, maxLon: bb.maxLon, maxLat: bb.maxLat },
    ];
    for (let i = 0; i < 4; i++) await cubrir(sub[i], prof + 1, `${etiqueta}.${i + 1}`);
  };
  if (total !== null && total > 0 && vistos.size < total) {
    await cubrir(bbox, 0, "raiz");
    evidencias.push({
      servicio: base.servicio, version: base.version, crs: base.crs, url: base.base,
      estado: "CONSULTA_VALIDA",
      detalle: `Partición espacial recursiva (celdas ≤${UMBRAL_CELDA}, prof ≤${PROF_MAX}): ${vistos.size}/${total} objetos únicos.`,
      numberMatched: total, numberReturned: vistos.size, filtro_verificado: null, ms: 0,
    });
  }
  if (total !== null && total > 0 && vistos.size < total) {
    evidencias.push({
      servicio: base.servicio, version: base.version, crs: base.crs, url: base.base,
      estado: "CONSULTA_VALIDA",
      detalle: `Descarga parcial: ${vistos.size}/${total}. Los recuentos son provisionales y van marcados como tales.`,
      numberMatched: total, numberReturned: vistos.size, filtro_verificado: null, ms: 0,
    });
  }
  return { tipo, objetos, clavesPropiedades: [...claves].slice(0, 60), evidencias, totalServidor: total };
}

export interface EvidenciaPatricova {
  producto: string;
  estado: EstadoConsulta;
  detalle: string;
  pdfBytes: number | null;
  jobId: string | null;
  urlDescarga: string | null;
  zipEntradas: string[] | null;
}

interface TrabajoArcGIS {
  jobId?: string;
  jobStatus?: string;
  messages?: Array<{ description?: string }>;
  value?: { url?: string };
}

/**
 * Mecanismo oficial de descarga SHP (tarea asíncrona ArcGIS). Acotado:
 * 1 submit + sondeo breve. No evade nada: usa el endpoint que publica la
 * propia página de descarga del ICV.
 */
export async function sondearDescargaPatricova(clave: string, capa: string, esperaMaxMs = 100000): Promise<EvidenciaPatricova> {
  const capasParam = encodeURIComponent(`"/home/carto_tema/datos/vectorial/${capa}"`);
  const formato = encodeURIComponent("Shapefile - SHP - .shp");
  const submit = `http://carto.icv.gva.es/arcgis/rest/services/utils/descargas/GPServer/tarea_descarga_datos/submitJob?Capas=[${capasParam}]&Formato_Salida=${formato}&f=json`;
  try {
    const r = await fetch(submit, { headers: { "User-Agent": UA_FASE2A } });
    const j = (await r.json()) as TrabajoArcGIS;
    if (!j.jobId) {
      return { producto: clave, estado: "CONSULTA_FALLIDA", detalle: `submitJob sin jobId: ${JSON.stringify(j).slice(0, 300)}`, pdfBytes: null, jobId: null, urlDescarga: null, zipEntradas: null };
    }
    const t0 = Date.now();
    let estadoJob = "";
    let mensajes = "";
    while (Date.now() - t0 < esperaMaxMs) {
      await new Promise((res) => setTimeout(res, 8000));
      const s = await fetch(`http://carto.icv.gva.es/arcgis/rest/services/utils/descargas/GPServer/tarea_descarga_datos/jobs/${j.jobId}?f=json`, { headers: { "User-Agent": UA_FASE2A } });
      const sj = (await s.json()) as TrabajoArcGIS;
      estadoJob = sj.jobStatus ?? "";
      mensajes = (sj.messages ?? []).map((m) => m.description).join(" | ").slice(0, 500);
      if (estadoJob === "esriJobSucceeded") break;
      if (estadoJob === "esriJobFailed" || estadoJob === "esriJobCancelled" || estadoJob === "esriJobTimedOut") {
        return { producto: clave, estado: "CONSULTA_FALLIDA", detalle: `Tarea ${j.jobId}: ${estadoJob}. ${mensajes}`, pdfBytes: null, jobId: j.jobId, urlDescarga: null, zipEntradas: null };
      }
    }
    if (estadoJob !== "esriJobSucceeded") {
      return { producto: clave, estado: "COBERTURA_NO_DETERMINADA", detalle: `Tarea ${j.jobId} sin completar en el sondeo acotado (${Math.round((Date.now() - t0) / 1000)} s). Último estado: ${estadoJob}. ${mensajes}`, pdfBytes: null, jobId: j.jobId, urlDescarga: null, zipEntradas: null };
    }
    const rr = await fetch(`http://carto.icv.gva.es/arcgis/rest/services/utils/descargas/GPServer/tarea_descarga_datos/jobs/${j.jobId}/results/Fichero_Salida?f=json`, { headers: { "User-Agent": UA_FASE2A } });
    const rj = (await rr.json()) as TrabajoArcGIS;
    const url = rj?.value?.url ? String(rj.value.url).replace("http://", "https://") : null;
    return { producto: clave, estado: "CONSULTA_VALIDA", detalle: `Tarea ${j.jobId} completada. Fichero: ${url ?? "sin URL"}.`, pdfBytes: null, jobId: j.jobId, urlDescarga: url, zipEntradas: null };
  } catch (e: unknown) {
    return { producto: clave, estado: "FUENTE_INACCESIBLE", detalle: String(e instanceof Error ? e.message : e).slice(0, 300), pdfBytes: null, jobId: null, urlDescarga: null, zipEntradas: null };
  }
}

export async function descargarPdfPatricova(clave: string): Promise<{ bytes: number | null; sha256: string | null; estado: EstadoConsulta; detalle: string }> {
  const nombres: Record<string, string> = {
    peligrosidad: "orde_patricova_peligrosidad_inun.pdf",
    riesgo: "orde_patricova_riesgo_inun.pdf",
    estudios: "orde_patricova_estudios_inun.pdf",
  };
  const url = `https://icvficherosweb.icv.gva.es/04/geonetwork/definicion_datos/${nombres[clave]}`;
  const d = await descargar(url);
  return { bytes: d.buf?.length ?? null, sha256: d.buf ? sha(d.buf) : null, estado: d.estado, detalle: `${url} — ${d.detalle}` };
}

export interface MuestraWMS {
  capa: string;
  estado: EstadoConsulta;
  detalle: string;
  bytes: number | null;
  url: string;
}

/** GetMap de muestra (WMS 1.1.1 + lon/lat: evita la trampa T1 por construcción). */
export async function muestraWMS(base: string, capa: string, bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number }, w = 400, h = 400): Promise<MuestraWMS> {
  const q = new URLSearchParams({
    service: "WMS", request: "GetMap", version: "1.1.1", layers: capa, styles: "",
    srs: "EPSG:4326", bbox: `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`,
    width: String(w), height: String(h), format: "image/png",
  });
  const url = `${base}?${q.toString()}`;
  const d = await descargar(url);
  const esPng = (d.contentType ?? "").includes("png");
  return {
    capa, url,
    estado: d.estado === "CONSULTA_VALIDA" && esPng ? "CONSULTA_VALIDA" : d.estado === "CONSULTA_VALIDA" ? "CONSULTA_FALLIDA" : d.estado,
    detalle: `${d.detalle} (ct=${d.contentType})`,
    bytes: d.buf?.length ?? null,
  };
}

/** GetFeatureInfo puntual sobre cobertura raster (devuelve GRAY_INDEX, no vector). */
export async function infoRastersInundacion(bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number }): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const capa of ["NZ.Flood.FluvialT10", "NZ.Flood.FluvialT100", "NZ.Flood.FluvialT500"]) {
    const q = new URLSearchParams({
      service: "WMS", request: "GetFeatureInfo", version: "1.1.1", layers: capa, query_layers: capa, styles: "",
      srs: "EPSG:4326", bbox: `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`,
      width: "200", height: "200", format: "image/png", info_format: "text/plain", x: "100", y: "100",
    });
    try {
      const r = await fetch(`${WMS_INSPIRE_INUND}?${q.toString()}`, { headers: { "User-Agent": UA_FASE2A } });
      out[capa] = (await r.text()).replace(/\s+/g, " ").slice(0, 300);
    } catch (e: unknown) {
      out[capa] = `FUENTE_INACCESIBLE: ${String(e instanceof Error ? e.message : e).slice(0, 120)}`;
    }
  }
  return out;
}
