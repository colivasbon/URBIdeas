// Análisis de entorno para Planes de Autoprotección (PAI/PAIF) de instalaciones en suelo
// rústico. Reproduce la tabla «Descripción del entorno de la instalación» de los PAI de IDEAS
// y los datos de ubicación, accesos y medios externos que recoge el documento.
//
// Cobertura nacional. Fuentes:
//   - OpenStreetMap (Overpass): núcleos, viario, ferrocarril, líneas eléctricas, gasoductos,
//     centrales/subestaciones, cauces, usos urbano/industrial y medios externos.
//   - IEPNB/MITECO (WFS geoserver.iepnb.es): ENP, Red Natura 2000, Mapa Forestal de España
//     (foto fija) y catálogo de montes (MUP).
//   - SNCZI vía IGN (WMS INSPIRE inundaciones): zonas inundables T=500 de las ARPSI.
//   - Catastro (OVC Coordenadas), Nominatim (municipio/provincia), Open-Meteo (altitud) y
//     OSRM (tiempo de llegada por carretera de los medios externos).
//
// Solo servidor (usa el decodificador PNG con zlib).

import { OVERPASS_ENDPOINTS, type OverpassElement } from "../connectors/overpass";
import { fetchConReintentos, USER_AGENT } from "../connectors/http";
import {
  aPlano,
  centroide,
  cercania,
  descomponer,
  distanciaPuntoAmbito,
  fmtDistancia,
  fraseDistancia,
  latLngAUtm,
  planoLocal,
  rumbo,
  superficieM2,
  type GeomXY,
  type PlanoLocal,
  type Pos,
} from "./geo";
import { decodificarAlfaPng } from "./png";

// ── Criterios (se muestran en la interfaz para trazabilidad) ────────────────────────────────

export const CRITERIOS = {
  /** Radio para marcar la tipología del entorno (urbano, industrial, agrícola, forestal). */
  radioTipologia: 500,
  /** Zona de influencia forestal (art. 44 Ley 43/2003 de Montes y normativa autonómica). */
  radioInfluenciaForestal: 400,
  /** Zona de policía de cauces del DPH (art. 6 TRLA). */
  radioPoliciaCauces: 100,
  radioNucleos: 25000,
  radioEspacios: 30000,
  radioInundable: 2000,
  radioForestal: 2000,
  radioMontes: 10000,
};

export const TEXTO_CRITERIOS = [
  `Tipología del entorno: usos presentes en ${CRITERIOS.radioTipologia} m alrededor del ámbito (urbano e industrial según OSM; agrícola y forestal según el Mapa Forestal de España).`,
  `Proximidad a masa forestal: «Sí» si hay terreno forestal del MFE a ${CRITERIOS.radioInfluenciaForestal} m o menos (zona de influencia forestal, art. 44 Ley 43/2003).`,
  `Cauces y zonas inundables: «Sí» si el ámbito está en zona inundable T=500 años (ARPSI, SNCZI) o a ${CRITERIOS.radioPoliciaCauces} m o menos de un cauce (zona de policía del DPH).`,
  "Espacios naturales protegidos: «Sí» si el ámbito se solapa con un ENP o un espacio Red Natura 2000 (IEPNB).",
  "Distancias: mínimas en línea recta entre el ámbito y el elemento; rumbo desde el centro del ámbito al punto más próximo del elemento. «Colindante» por debajo de 10 m.",
];

// ── Tipos de resultado ─────────────────────────────────────────────────────────────────────

export interface ElementoCercano {
  categoria: string;
  nombre: string;
  detalle?: string;
  distancia: number;
  rumbo: string;
  /** Frase lista para el informe: «Autovía A-3 a 650 m al norte.» */
  frase: string;
  /** [ámbito, elemento] para dibujar la medición en el mapa. */
  linea: [Pos, Pos];
  fuente: string;
  telefono?: string;
  ruta?: { km: number; minutos: number };
  /** Interno: el elemento no tiene nombre en OSM (se completa con la localidad). */
  sinNombre?: boolean;
}

export interface FilaSiNo {
  si: boolean;
  elementos: ElementoCercano[];
  textos: string[];
}

export interface Acceso {
  denominacion: string;
  tipo: string;
  ancho: string;
  sentido: string;
  distancia: number;
}

export interface ResultadoEntorno {
  generado: string;
  ubicacion: {
    lat: number;
    lng: number;
    utm: { x: number; y: number; huso: number };
    altitud: number | null;
    municipio: string | null;
    provincia: string | null;
    comunidad: string | null;
    parcelas: { referencia: string; descripcion: string }[];
    superficieHa: number | null;
  };
  tipologia: { urbano: boolean; industrial: boolean; agricola: boolean; forestal: boolean };
  nucleos: ElementoCercano[];
  infraestructuras: ElementoCercano[];
  generacion: ElementoCercano[];
  espacios: FilaSiNo;
  masaForestal: FilaSiNo;
  cauces: FilaSiNo;
  accesos: Acceso[];
  mediosExternos: ElementoCercano[];
  avisos: string[];
  criterios: string[];
  fuentes: { nombre: string; url: string }[];
}

// ── Utilidades ─────────────────────────────────────────────────────────────────────────────

const MINUSCULAS = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "o", "u", "en", "a"]);

/** «LA VELL Y OTROS» → «La Vell y Otros». Respeta textos ya en mayúsculas/minúsculas. */
export function tituloPropio(s: string): string {
  if (s !== s.toUpperCase()) return s.trim();
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && MINUSCULAS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ")
    .trim();
}

function geomDeElemento(el: OverpassElement & { geometry?: { lat: number; lon: number }[]; members?: { geometry?: { lat: number; lon: number }[] }[] }): GeoJSON.Geometry | null {
  if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) return { type: "Point", coordinates: [el.lon, el.lat] };
  if (el.type === "way" && el.geometry?.length) {
    const cs = el.geometry.filter(Boolean).map((g) => [g.lon, g.lat]);
    const cerrado = cs.length > 3 && cs[0][0] === cs[cs.length - 1][0] && cs[0][1] === cs[cs.length - 1][1];
    const area = cerrado && !el.tags?.highway && !el.tags?.waterway && !el.tags?.power?.includes("line") && !el.tags?.railway;
    return area ? { type: "Polygon", coordinates: [cs] } : { type: "LineString", coordinates: cs };
  }
  if (el.type === "relation" && el.members?.length) {
    const lineas = el.members.filter((m) => m.geometry?.length).map((m) => m.geometry!.filter(Boolean).map((g) => [g.lon, g.lat]));
    if (lineas.length) return { type: "MultiLineString", coordinates: lineas };
  }
  if (el.center) return { type: "Point", coordinates: [el.center.lon, el.center.lat] };
  return null;
}

interface Contexto {
  plano: PlanoLocal;
  ambito: GeomXY;
  centro: Pos;
}

function medir(ctx: Contexto, g: GeoJSON.Geometry | null) {
  if (!g) return null;
  const c = cercania(ctx.ambito, aPlano(descomponer(g), ctx.plano), ctx.plano);
  if (!c) return null;
  return { ...c, rumbo: rumbo(ctx.centro, c.puntoElemento) };
}

function elemento(
  ctx: Contexto,
  g: GeoJSON.Geometry | null,
  base: Omit<ElementoCercano, "distancia" | "rumbo" | "frase" | "linea"> & { frase?: (d: string) => string; km?: boolean }
): ElementoCercano | null {
  const m = medir(ctx, g);
  if (!m) return null;
  const dist = fraseDistancia({ distancia: m.distancia, rumbo: m.rumbo }, base.km);
  const { frase, km: _km, ...resto } = base;
  void _km;
  return {
    ...resto,
    distancia: m.distancia,
    rumbo: m.rumbo,
    frase: frase ? frase(dist) : `${base.nombre} ${dist}.`,
    linea: [m.puntoAmbito, m.puntoElemento],
  };
}

const masCercano = <T extends { distancia: number }>(xs: (T | null)[]): T | null =>
  xs.filter((x): x is T => !!x).sort((a, b) => a.distancia - b.distancia)[0] ?? null;

const ordenar = <T extends { distancia: number }>(xs: (T | null)[]) =>
  xs.filter((x): x is T => !!x).sort((a, b) => a.distancia - b.distancia);

// ── OSM ────────────────────────────────────────────────────────────────────────────────────

function consultaOSM(lat: number, lon: number, radioAmbito: number): string {
  const a = (r: number) => `(around:${Math.round(r + radioAmbito)},${lat.toFixed(6)},${lon.toFixed(6)})`;
  return `[out:json][timeout:150];
node["place"~"^(city|town|village)$"]${a(CRITERIOS.radioNucleos)};out;
way["highway"~"^(motorway|trunk)$"]${a(12000)};out tags geom;
way["highway"~"^(primary|secondary)$"]${a(6000)};out tags geom;
way["highway"="tertiary"]${a(3000)};out tags geom;
way["highway"~"^(unclassified|track|service)$"]${a(400)};out tags geom;
way["railway"="rail"]${a(5000)};out tags geom;
way["power"~"^(line|minor_line|cable)$"]${a(2000)};out tags geom;
way["man_made"="pipeline"]${a(3000)};out tags geom;
nwr["power"~"^(plant|substation)$"]${a(5000)};out tags geom;
nwr["landuse"~"^(residential|industrial)$"]${a(1000)};out tags geom;
way["waterway"~"^(river|canal)$"]${a(10000)};out tags geom;
way["waterway"="stream"]${a(3000)};out tags geom;
nwr["amenity"="fire_station"]${a(60000)};out tags center;
nwr["amenity"="police"]${a(30000)};out tags center;
nwr["amenity"="hospital"]${a(60000)};out tags center;
nwr["amenity"~"^(clinic|doctors)$"]${a(25000)};out tags center;
nwr["healthcare"="centre"]${a(25000)};out tags center;`;
}

function etiquetaVia(tags: Record<string, string>): { tipo: string; denominacion: string } {
  const ref = (tags.ref ?? "").split(";")[0].trim();
  const nombre = tags.name ?? "";
  const hw = tags.highway;
  let tipo = "Carretera";
  if (hw === "motorway") tipo = /^AP-/.test(ref) ? "Autopista" : "Autovía";
  else if (hw === "trunk") tipo = /^A-|^A\d/.test(ref) ? "Autovía" : /^N-/.test(ref) ? "Carretera nacional" : "Carretera";
  else if (/^N-/.test(ref)) tipo = "Carretera nacional";
  else if (hw === "primary" || hw === "secondary") tipo = "Carretera autonómica";
  else if (hw === "tertiary") tipo = "Carretera local";
  else if (hw === "track") tipo = "Camino";
  else if (hw === "unclassified" || hw === "service") tipo = "Camino";
  return { tipo, denominacion: ref || nombre || "" };
}

function etiquetaGeneracion(tags: Record<string, string>): string {
  if (tags.power === "substation") return "SET";
  const fuente = tags["plant:source"] ?? tags["generator:source"] ?? "";
  if (fuente.includes("solar")) return "PSF";
  if (fuente.includes("wind")) return "Parque eólico";
  if (fuente.includes("hydro")) return "Central hidroeléctrica";
  if (fuente.includes("biomass") || fuente.includes("biogas")) return "Planta de biomasa";
  if (fuente.includes("battery")) return "Almacenamiento (BESS)";
  return "Central eléctrica";
}

// ── IEPNB WFS ──────────────────────────────────────────────────────────────────────────────

const IEPNB_WFS = "https://geoserver.iepnb.es/geoserver/wfs";

async function wfsIEPNB(typeName: string, bbox: [number, number, number, number], max = 500, propiedades?: string[]) {
  const params = new URLSearchParams({
    service: "WFS",
    version: "1.1.0",
    request: "GetFeature",
    typeName,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    maxFeatures: String(max),
    bbox: `${bbox.join(",")},EPSG:4326`,
  });
  if (propiedades) params.set("propertyName", propiedades.join(","));
  const res = await fetchConReintentos(`${IEPNB_WFS}?${params}`, { timeoutMs: 90000, reintentos: 2, pausaMs: 2000 });
  const fc = (await res.json()) as GeoJSON.FeatureCollection;
  return fc.features ?? [];
}

function bboxAlrededor(ctx: Contexto, radio: number): [number, number, number, number] {
  const [minx, miny, maxx, maxy] = ctx.ambito.bbox;
  const [w, s] = ctx.plano.aLngLat([minx - radio, miny - radio]);
  const [e, n] = ctx.plano.aLngLat([maxx + radio, maxy + radio]);
  return [w, s, e, n];
}

// ── SNCZI (zonas inundables T500) por muestreo del WMS ─────────────────────────────────────

const WMS_INUNDACIONES = "https://servicios.idee.es/wms-inspire/riesgos-naturales/inundaciones";

async function zonaInundableMasCercana(ctx: Contexto): Promise<{ distancia: number; punto: Pos } | null> {
  const [w, s, e, n] = bboxAlrededor(ctx, CRITERIOS.radioInundable);
  const [anchoM, altoM] = [ctx.ambito.bbox[2] - ctx.ambito.bbox[0] + 2 * CRITERIOS.radioInundable, ctx.ambito.bbox[3] - ctx.ambito.bbox[1] + 2 * CRITERIOS.radioInundable];
  const escala = Math.min(1024 / anchoM, 1024 / altoM, 1 / 5); // máx. 1024 px y 5 m/px
  const width = Math.max(64, Math.round(anchoM * escala));
  const height = Math.max(64, Math.round(altoM * escala));
  const params = new URLSearchParams({
    service: "WMS",
    version: "1.1.1",
    request: "GetMap",
    layers: "NZ.Flood.FluvialT500,NZ.Flood.MarinaT500",
    styles: ",",
    srs: "EPSG:4326",
    bbox: [w, s, e, n].join(","),
    width: String(width),
    height: String(height),
    format: "image/png",
    transparent: "true",
  });
  const res = await fetchConReintentos(`${WMS_INUNDACIONES}?${params}`, { timeoutMs: 60000, reintentos: 2 });
  if (!(res.headers.get("content-type") ?? "").includes("png")) throw new Error("El WMS de inundaciones no devolvió PNG");
  const png = decodificarAlfaPng(Buffer.from(await res.arrayBuffer()));
  let mejor: { distancia: number; punto: Pos } | null = null;
  // Recorrido con paso adaptativo: suficiente para una distancia orientativa (< 2 px de error).
  const paso = png.width * png.height > 400000 ? 2 : 1;
  for (let y = 0; y < png.height; y += paso) {
    for (let x = 0; x < png.width; x += paso) {
      if (png.alfa[y * png.width + x] < 32) continue;
      const lng = w + ((x + 0.5) / png.width) * (e - w);
      const lat = n - ((y + 0.5) / png.height) * (n - s);
      const p: Pos = [lng, lat];
      const d = distanciaPuntoAmbito(ctx.plano.aXY(p), ctx.ambito);
      if (!mejor || d < mejor.distancia) mejor = { distancia: d, punto: p };
      if (d === 0) return mejor;
    }
  }
  return mejor;
}

// ── Servicios auxiliares ───────────────────────────────────────────────────────────────────

async function catastro(lat: number, lng: number) {
  const url = `https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_RCCOOR?SRS=EPSG:4326&Coordenada_X=${lng}&Coordenada_Y=${lat}`;
  const res = await fetchConReintentos(url, { timeoutMs: 20000, reintentos: 2 });
  const xml = await res.text();
  const out: { referencia: string; descripcion: string }[] = [];
  const re = /<pc1>([^<]*)<\/pc1>\s*<pc2>([^<]*)<\/pc2>[\s\S]*?<ldt>([^<]*)<\/ldt>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push({ referencia: `${m[1]}${m[2]}`, descripcion: m[3].trim() });
  return out;
}

async function nominatim(lat: number, lng: number) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&accept-language=es`;
  const res = await fetchConReintentos(url, { timeoutMs: 20000, reintentos: 2, headers: { "User-Agent": USER_AGENT } });
  const j = (await res.json()) as { address?: Record<string, string> };
  const a = j.address ?? {};
  return {
    municipio: a.city ?? a.town ?? a.village ?? a.municipality ?? null,
    provincia: a.province ?? a.state_district ?? null,
    comunidad: a.state ?? null,
  };
}

async function altitud(lat: number, lng: number): Promise<number | null> {
  const res = await fetchConReintentos(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`, { timeoutMs: 15000, reintentos: 2 });
  const j = (await res.json()) as { elevation?: number[] };
  return typeof j.elevation?.[0] === "number" ? Math.round(j.elevation[0]) : null;
}

async function rutaOSRM(desde: Pos, hasta: Pos): Promise<{ km: number; minutos: number } | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${desde[0]},${desde[1]};${hasta[0]},${hasta[1]}?overview=false`;
  const res = await fetchConReintentos(url, { timeoutMs: 15000, reintentos: 1 });
  const j = (await res.json()) as { routes?: { distance: number; duration: number }[] };
  const r = j.routes?.[0];
  return r ? { km: Math.round(r.distance / 100) / 10, minutos: Math.round(r.duration / 60) } : null;
}

// ── Overpass con respaldo escalonado y caché ────────────────────────────────────────────────

// El Overpass público es muy irregular (la misma consulta tarda entre 5 s y más de 2 min según la
// carga). Se lanza al servidor principal y, si no responde en unos segundos, se lanza también a
// los espejos; gana la primera respuesta válida y se cancela el resto.
const ESPEJOS_OVERPASS = [...OVERPASS_ENDPOINTS, "https://overpass.private.coffee/api/interpreter"];
const RETRASO_ESPEJO_MS = 7000;
const TIMEOUT_OVERPASS_MS = 75000;
const CACHE_OSM_TTL_MS = 30 * 60 * 1000;
const CACHE_OSM_MAX = 40;
const cacheOSM = new Map<string, { t: number; elementos: OverpassElement[] }>();

export async function overpassEscalonado(query: string, retrasoMs = RETRASO_ESPEJO_MS): Promise<OverpassElement[]> {
  const global = new AbortController();
  const lanzar = async (endpoint: string): Promise<OverpassElement[]> => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.any([global.signal, AbortSignal.timeout(TIMEOUT_OVERPASS_MS)]),
    });
    const texto = await res.text();
    if (!res.ok || !texto.trimStart().startsWith("{")) throw new Error(`${new URL(endpoint).host}: HTTP ${res.status}`);
    const json = JSON.parse(texto) as { elements?: OverpassElement[]; remark?: string };
    if (json.remark && /error|timed out/i.test(json.remark)) throw new Error(`${new URL(endpoint).host}: ${json.remark}`);
    return json.elements ?? [];
  };

  return new Promise((resolve, reject) => {
    const errores: string[] = [];
    const lanzados = new Set<number>();
    const temporizadores: ReturnType<typeof setTimeout>[] = [];
    let resuelto = false;
    let fallidos = 0;

    const arrancar = (i: number) => {
      if (resuelto || i >= ESPEJOS_OVERPASS.length || lanzados.has(i)) return;
      lanzados.add(i);
      lanzar(ESPEJOS_OVERPASS[i]).then(
        (els) => {
          if (resuelto) return;
          resuelto = true;
          temporizadores.forEach(clearTimeout);
          global.abort();
          resolve(els);
        },
        (e) => {
          if (resuelto) return;
          errores.push(e instanceof Error ? e.message : String(e));
          if (++fallidos === ESPEJOS_OVERPASS.length) reject(new Error(`Overpass no disponible (${errores.join("; ")})`));
          else arrancar(i + 1);
        }
      );
    };
    ESPEJOS_OVERPASS.forEach((_, i) => temporizadores.push(setTimeout(() => arrancar(i), i * retrasoMs)));
  });
}

async function osmConCache(query: string, clave: string): Promise<OverpassElement[]> {
  const hit = cacheOSM.get(clave);
  if (hit && Date.now() - hit.t < CACHE_OSM_TTL_MS) return hit.elementos;
  const elementos = await overpassEscalonado(query);
  if (cacheOSM.size >= CACHE_OSM_MAX) cacheOSM.delete(cacheOSM.keys().next().value as string);
  cacheOSM.set(clave, { t: Date.now(), elementos });
  return elementos;
}

async function intentar<T>(avisos: string[], fuente: string, f: () => Promise<T>): Promise<T | null> {
  try {
    return await f();
  } catch (err) {
    avisos.push(`${fuente}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Orquestador ────────────────────────────────────────────────────────────────────────────

export async function analizarEntorno(ambitoGeoJSON: GeoJSON.Geometry): Promise<ResultadoEntorno> {
  const avisos: string[] = [];
  const plana = descomponer(ambitoGeoJSON);
  const centro = centroide(plana);
  const plano = planoLocal(centro[1], centro[0]);
  const ambito = aPlano(plana, plano);
  const ctx: Contexto = { plano, ambito, centro };
  const radioAmbito = Math.max(0, ...[...ambito.puntos, ...ambito.segmentos.flat()].map(([x, y]) => Math.hypot(x, y)));
  const esArea = plana.poligonos.length > 0;

  const [osm, enp, rn2000, mfe, montes, inundable, parcelas, admin, alt] = await Promise.all([
    intentar(avisos, "OpenStreetMap (Overpass)", async () => {
      const clave = `${centro[1].toFixed(4)},${centro[0].toFixed(4)},${Math.ceil(radioAmbito / 100)}`;
      return osmConCache(consultaOSM(centro[1], centro[0], radioAmbito), clave);
    }),
    intentar(avisos, "IEPNB · ENP", () => wfsIEPNB("ENP:enp", bboxAlrededor(ctx, CRITERIOS.radioEspacios), 200)),
    intentar(avisos, "IEPNB · Red Natura 2000", () => wfsIEPNB("RN2000:rn2000", bboxAlrededor(ctx, CRITERIOS.radioEspacios), 200)),
    intentar(avisos, "IEPNB · Mapa Forestal de España", () =>
      wfsIEPNB("foto_fija_mfe:ff_uso", bboxAlrededor(ctx, CRITERIOS.radioForestal), 3000, [
        "descr_clamfe",
        "agrupacion_clamfe",
        "descr_forarb",
        "nm_fccarb",
        "geom",
      ])
    ),
    intentar(avisos, "IEPNB · Catálogo de montes", () => wfsIEPNB("propiedad_montes:propiedad_montes", bboxAlrededor(ctx, CRITERIOS.radioMontes), 1500)),
    intentar(avisos, "SNCZI · Zonas inundables (IGN)", () => zonaInundableMasCercana(ctx)),
    intentar(avisos, "Catastro", () => catastro(centro[1], centro[0])),
    intentar(avisos, "Nominatim", () => nominatim(centro[1], centro[0])),
    intentar(avisos, "Altitud (Open-Meteo)", () => altitud(centro[1], centro[0])),
  ]);

  const elementos = (osm ?? []) as (OverpassElement & { geometry?: { lat: number; lon: number }[] })[];
  const conTag = (k: string, re: RegExp) => elementos.filter((e) => e.tags && re.test(e.tags[k] ?? ""));

  // Núcleos de población.
  const nucleos = ordenar(
    conTag("place", /^(city|town|village)$/).map((e) =>
      elemento(ctx, geomDeElemento(e), { categoria: "nucleo", nombre: e.tags!.name ?? "Núcleo sin nombre", fuente: "OpenStreetMap", km: true })
    )
  )
    .filter((n) => n.distancia > 0)
    .slice(0, 3);

  // Infraestructuras lineales y energéticas.
  const vias = conTag("highway", /./).map((e) => {
    const { tipo, denominacion } = etiquetaVia(e.tags!);
    const el = elemento(ctx, geomDeElemento(e), {
      categoria: e.tags!.highway,
      nombre: `${tipo}${denominacion ? ` ${denominacion}` : ""}`,
      fuente: "OpenStreetMap",
    });
    return el ? { ...el, tipo, denominacion, tags: e.tags! } : null;
  });
  const viasOrdenadas = ordenar(vias);
  const autovia = viasOrdenadas.find((v) => /^(motorway|trunk)$/.test(v.tags.highway) && /^Auto/.test(v.tipo));
  const esCarretera = (v: (typeof viasOrdenadas)[number]) => /^(trunk|primary|secondary|tertiary)$/.test(v.tags.highway) && !/^Auto/.test(v.tipo);
  // Se prefiere la carretera con matrícula (CM-310, N-301…) frente a travesías urbanas sin ella.
  const carretera = viasOrdenadas.find((v) => esCarretera(v) && v.tags.ref) ?? viasOrdenadas.find(esCarretera);
  const ferrocarril = masCercano(
    conTag("railway", /^rail$/).map((e) =>
      elemento(ctx, geomDeElemento(e), { categoria: "ferrocarril", nombre: e.tags!.name ? `Ferrocarril ${e.tags!.name}` : "Línea de ferrocarril", fuente: "OpenStreetMap" })
    )
  );
  const linea = masCercano(
    conTag("power", /^(line|minor_line|cable)$/).map((e) => {
      const kv = Number((e.tags!.voltage ?? "").split(";")[0]) / 1000;
      const nombre = `Línea eléctrica${kv ? ` de ${kv.toLocaleString("es-ES")} kV` : ""}`;
      return elemento(ctx, geomDeElemento(e), { categoria: "linea_electrica", nombre, fuente: "OpenStreetMap" });
    })
  );
  const gasoducto = masCercano(
    conTag("man_made", /^pipeline$/).map((e) =>
      elemento(ctx, geomDeElemento(e), {
        categoria: "conduccion",
        nombre: e.tags!.substance === "gas" ? "Gasoducto" : e.tags!.substance === "water" ? "Conducción de agua" : "Conducción",
        fuente: "OpenStreetMap",
      })
    )
  );
  const infraestructuras = [autovia, carretera, ferrocarril, linea, gasoducto]
    .filter((x): x is ElementoCercano => !!x)
    .map(({ categoria, nombre, distancia, rumbo: r, frase, linea: l, fuente }) => ({ categoria, nombre, distancia, rumbo: r, frase, linea: l, fuente }));

  // Instalaciones de generación eléctrica (excluye la propia instalación si está cartografiada).
  const generacion = ordenar(
    conTag("power", /^(plant|substation)$/)
      .filter((e) => e.tags!.power === "plant" || !/minor_distribution|traction/.test(e.tags!.substation ?? ""))
      .map((e) => {
        const prefijo = etiquetaGeneracion(e.tags!);
        const n = e.tags!.name ?? "";
        const yaPrefijado = /^(SET|ST|Subestaci[oó]n|PSF|Planta|Parque|Central|Huerto)\b/i.test(n);
        const nombre = n ? (yaPrefijado ? n : `${prefijo} ${n}`) : `${prefijo} sin denominación`;
        const g = geomDeElemento(e);
        const el = elemento(ctx, g, { categoria: e.tags!.power, nombre, fuente: "OpenStreetMap" });
        // La propia instalación, si está cartografiada en OSM, contiene el centro del ámbito.
        if (el && el.distancia === 0 && e.tags!.power === "plant" && g) {
          const pg = aPlano(descomponer(g), plano);
          if (cercania(pg, aPlano(descomponer({ type: "Point", coordinates: centro }), plano), plano)?.distancia === 0) return null;
        }
        return el;
      })
  ).slice(0, 5);

  // Espacios naturales protegidos (ENP y Red Natura 2000).
  const enpCercano = masCercano(
    (enp ?? []).map((f) => {
      const p = f.properties as Record<string, string>;
      const etiqueta = `${p.designacion ?? "Espacio Natural Protegido"} ${tituloPropio(p.nombre ?? "")}`.trim();
      return elemento(ctx, f.geometry, {
        categoria: "enp",
        nombre: etiqueta,
        detalle: p.id_ref_es ?? undefined,
        fuente: "IEPNB (MITECO)",
        km: true,
        frase: (d) => `El Espacio Natural Protegido más próximo se ubica ${d.replace(/^colindante a la instalación$/, "colindante")} «${etiqueta}»${p.id_ref_es ? ` (${p.id_ref_es})` : ""}.`,
      });
    })
  );
  const rnCercano = masCercano(
    (rn2000 ?? []).map((f) => {
      const p = f.properties as Record<string, string>;
      const figuras = (p.id_espacio_proteg ?? "").split("_").slice(1).filter((x) => x !== "LIC" || !(p.id_espacio_proteg ?? "").includes("ZEC"));
      const figura = figuras.length ? figuras.join("/") : "Red Natura 2000";
      const etiqueta = `${figura} ${tituloPropio(p.nombre ?? "")}`.trim();
      return elemento(ctx, f.geometry, {
        categoria: "rn2000",
        nombre: etiqueta,
        detalle: p.id_ref_es ?? undefined,
        fuente: "IEPNB (MITECO)",
        km: true,
        frase: (d) => `El espacio Red Natura 2000 más próximo se ubica ${d.replace(/^colindante a la instalación$/, "colindante")} «${etiqueta}»${p.id_ref_es ? ` (${p.id_ref_es})` : ""}.`,
      });
    })
  );
  const espaciosEls = [enpCercano, rnCercano].filter((x): x is ElementoCercano => !!x);
  const espacios: FilaSiNo = {
    si: espaciosEls.some((e) => e.distancia === 0),
    elementos: espaciosEls,
    textos: espaciosEls.map((e) =>
      e.distancia === 0 ? `El ámbito se ubica dentro de «${e.nombre}»${e.detalle ? ` (${e.detalle})` : ""}.` : e.frase
    ),
  };
  if (!enpCercano && enp) espacios.textos.unshift(`No se localizan Espacios Naturales Protegidos en ${CRITERIOS.radioEspacios / 1000} km.`);
  if (!rnCercano && rn2000) espacios.textos.push(`No se localizan espacios Red Natura 2000 en ${CRITERIOS.radioEspacios / 1000} km.`);

  // Masa forestal (MFE) y Montes de Utilidad Pública.
  const mfeProps = (f: GeoJSON.Feature) => f.properties as Record<string, string | number | null>;
  const arbolado = masCercano(
    (mfe ?? [])
      .filter((f) => mfeProps(f).agrupacion_clamfe === "Forestal arbolado")
      .map((f) => {
        const p = mfeProps(f);
        const fcc = Number(p.nm_fccarb) || 0;
        const especie = p.descr_forarb ? String(p.descr_forarb) : null;
        const detalle = [especie, fcc ? `FCC ${fcc} %` : null].filter(Boolean).join(", ");
        return elemento(ctx, f.geometry, {
          categoria: "masa_forestal",
          nombre: "Monte arbolado",
          detalle: detalle || undefined,
          fuente: "Mapa Forestal de España (MITECO)",
          frase: (d) => `Monte arbolado${detalle ? ` (${detalle})` : ""} ${d}.`,
        });
      })
  );
  const desarbolado = masCercano(
    (mfe ?? [])
      .filter((f) => mfeProps(f).agrupacion_clamfe === "Forestal desarbolado")
      .map((f) =>
        elemento(ctx, f.geometry, {
          categoria: "forestal_desarbolado",
          nombre: "Terreno forestal desarbolado",
          detalle: String(mfeProps(f).descr_clamfe ?? ""),
          fuente: "Mapa Forestal de España (MITECO)",
          frase: (d) => `Terreno forestal desarbolado (${String(mfeProps(f).descr_clamfe ?? "").toLowerCase()}) ${d}.`,
        })
      )
  );
  const mup = masCercano(
    (montes ?? [])
      .filter((f) => /utilidad p[uú]blica/i.test(String((f.properties as Record<string, unknown>).nombre_afeccion ?? "")) || (f.properties as Record<string, unknown>).es_mup === "S")
      .map((f) => {
        const p = f.properties as Record<string, string | null>;
        const codigo = p.cmup ? `n.º ${p.cmup}` : p.cd_monte || "";
        const nombre = tituloPropio(p.monte ?? "");
        return elemento(ctx, f.geometry, {
          categoria: "mup",
          nombre: `Monte de Utilidad Pública (MUP) ${nombre}`,
          detalle: codigo || undefined,
          fuente: "Catálogo de montes (IEPNB)",
          frase: (d) => `Monte de Utilidad Pública (MUP) ${nombre}${codigo ? ` (${codigo})` : ""} ${d}.`,
        });
      })
  );
  const forestalCercano = Math.min(arbolado?.distancia ?? Infinity, desarbolado?.distancia ?? Infinity);
  const masaEls = [arbolado, desarbolado && (!arbolado || desarbolado.distancia < arbolado.distancia) ? desarbolado : null, mup].filter(
    (x): x is ElementoCercano => !!x
  );
  const masaForestal: FilaSiNo = {
    si: forestalCercano <= CRITERIOS.radioInfluenciaForestal,
    elementos: masaEls,
    textos: masaEls.map((e) => (e.distancia === 0 && e.categoria !== "mup" ? `${e.nombre}${e.detalle ? ` (${e.detalle})` : ""} en contacto con el ámbito de la instalación.` : e.distancia === 0 ? `El ámbito se ubica dentro del ${e.nombre}${e.detalle ? ` (${e.detalle})` : ""}.` : e.frase)),
  };
  if (mfe && !arbolado) masaForestal.textos.unshift(`No se localiza monte arbolado en ${fmtDistancia(CRITERIOS.radioForestal, true)}.`);
  if (montes && !mup) masaForestal.textos.push(`No se localizan Montes de Utilidad Pública en ${fmtDistancia(CRITERIOS.radioMontes, true)}.`);

  // Cauces y zonas inundables.
  const cauces = ordenar(
    conTag("waterway", /^(river|canal|stream)$/).map((e) => {
      const tipo = e.tags!.waterway === "river" ? "Río" : e.tags!.waterway === "canal" ? "Canal" : "Cauce";
      const nombre = e.tags!.name ?? `${tipo} sin denominación`;
      return elemento(ctx, geomDeElemento(e), { categoria: "cauce", nombre, detalle: e.tags!.name ? undefined : "sin nombre en OSM", fuente: "OpenStreetMap" });
    })
  );
  const cauceNombrado = cauces.find((c) => !c.detalle);
  const cauceCualquiera = cauces[0];
  const caucesEls = [cauceNombrado, cauceCualquiera && cauceCualquiera !== cauceNombrado && cauceCualquiera.distancia < (cauceNombrado?.distancia ?? Infinity) ? cauceCualquiera : null].filter(
    (x): x is ElementoCercano => !!x
  );
  let textoInundable: string | null = null;
  let arpsi: ElementoCercano | null = null;
  if (inundable) {
    const r = rumbo(centro, inundable.punto);
    arpsi = {
      categoria: "arpsi",
      nombre: "Zona inundable T=500 años (ARPSI)",
      distancia: inundable.distancia,
      rumbo: r,
      frase: "",
      linea: [inundable.punto, inundable.punto],
      fuente: "SNCZI (MITECO) vía IGN",
    };
    const m = medir(ctx, { type: "Point", coordinates: inundable.punto });
    if (m) arpsi.linea = [m.puntoAmbito, inundable.punto];
    textoInundable =
      inundable.distancia === 0
        ? "El ámbito se encuentra en zona inundable T=500 años de un Área con Riesgo Potencial Significativo de Inundación (ARPSI)."
        : `Zona inundable T=500 años de Área con Riesgo Potencial Significativo de Inundación (ARPSI) ${fraseDistancia({ distancia: inundable.distancia, rumbo: r })}.`;
    arpsi.frase = textoInundable;
  } else if (!avisos.some((a) => a.startsWith("SNCZI"))) {
    textoInundable = `Áreas con Riesgo Potencial Significativo de Inundación (ARPSI) no localizadas en ${fmtDistancia(CRITERIOS.radioInundable, true)}.`;
  }
  const caucesFila: FilaSiNo = {
    si: (inundable?.distancia ?? Infinity) === 0 || (cauceCualquiera?.distancia ?? Infinity) <= CRITERIOS.radioPoliciaCauces,
    elementos: [...caucesEls, ...(arpsi ? [arpsi] : [])],
    textos: [...caucesEls.map((c) => c.frase), ...(textoInundable ? [textoInundable] : [])],
  };

  // Tipología del entorno.
  const usoCerca = (re: RegExp) =>
    conTag("landuse", re).some((e) => (medir(ctx, geomDeElemento(e))?.distancia ?? Infinity) <= CRITERIOS.radioTipologia);
  const mfeCerca = (pred: (p: Record<string, string | number | null>) => boolean) =>
    (mfe ?? []).some((f) => pred(mfeProps(f)) && (medir(ctx, f.geometry)?.distancia ?? Infinity) <= CRITERIOS.radioTipologia);
  const tipologia = {
    urbano: usoCerca(/^residential$/),
    industrial: usoCerca(/^industrial$/),
    agricola: mfeCerca((p) => /agr[ií]cola|cultivo/i.test(String(p.descr_clamfe ?? ""))),
    forestal: mfeCerca((p) => String(p.agrupacion_clamfe ?? "").startsWith("Forestal")),
  };

  // Accesos (tabla de vías de acceso a la zona).
  const accesos: Acceso[] = [];
  const vistas = new Set<string>();
  for (const v of viasOrdenadas) {
    if (accesos.length >= 4) break;
    const clave = v.denominacion || v.tipo;
    if (vistas.has(clave)) continue;
    const esCamino = v.tipo === "Camino";
    if (esCamino && accesos.some((a) => a.tipo === "Camino")) continue;
    if (!esCamino && (v.distancia > 3000 || !v.tags.ref)) continue;
    vistas.add(clave);
    const tramos = viasOrdenadas.filter((x) => (x.denominacion || x.tipo) === clave);
    const dobleSentido = /^(motorway|trunk)$/.test(v.tags.highway) || tramos.some((x) => x.tags.oneway !== "yes");
    accesos.push({
      denominacion: esCamino ? v.denominacion || "Camino de acceso" : clave,
      tipo: v.tipo,
      ancho: v.tags.width ? `${String(v.tags.width).replace(".", ",")} m` : "—",
      sentido: dobleSentido ? "Doble" : "Único",
      distancia: v.distancia,
    });
  }

  // Medios externos: bomberos, seguridad y asistencia sanitaria.
  const medio = (e: OverpassElement, categoria: string, defecto: string) => {
    const nombre = e.tags?.name ?? e.tags?.official_name ?? (e.tags?.["addr:city"] ? `${defecto} de ${e.tags["addr:city"]}` : null);
    const el = elemento(ctx, geomDeElemento(e), {
      categoria,
      nombre: nombre ?? defecto,
      fuente: "OpenStreetMap",
      telefono: e.tags?.phone ?? e.tags?.["contact:phone"] ?? undefined,
      km: true,
    });
    return el ? ({ ...el, sinNombre: !nombre } as ElementoCercano) : null;
  };
  const bomberos = ordenar(conTag("amenity", /^fire_station$/).map((e) => medio(e, "bomberos", "Parque de bomberos"))).slice(0, 2);
  const policias = conTag("amenity", /^police$/);
  const esGC = (e: OverpassElement) => /guardia civil/i.test(`${e.tags?.name ?? ""} ${e.tags?.operator ?? ""} ${e.tags?.["police:ES"] ?? ""}`);
  const guardiaCivil = masCercano(policias.filter(esGC).map((e) => medio(e, "guardia_civil", "Puesto de la Guardia Civil")));
  const policia = masCercano(policias.filter((e) => !esGC(e)).map((e) => medio(e, "policia", "Policía")));
  const hospital = masCercano(conTag("amenity", /^hospital$/).map((e) => medio(e, "hospital", "Hospital")));
  const centroSalud = masCercano(
    [...conTag("amenity", /^(clinic|doctors)$/), ...conTag("healthcare", /^centre$/)].map((e) => medio(e, "centro_salud", "Centro de salud"))
  );
  const mediosExternos = [...bomberos, guardiaCivil, policia, centroSalud, hospital].filter((x): x is ElementoCercano => !!x);
  // Medios sin nombre en OSM: se identifica la localidad por geocodificación inversa
  // (secuencial, política de uso de Nominatim de 1 petición/s).
  for (const m of mediosExternos.filter((x) => x.sinNombre)) {
    await new Promise((res) => setTimeout(res, 1100));
    const loc = await intentar(avisos, "Nominatim", () => nominatim(m.linea[1][1], m.linea[1][0]));
    if (loc?.municipio) {
      const nuevo = `${m.nombre} de ${loc.municipio}`;
      m.frase = m.frase.replace(m.nombre, nuevo);
      m.nombre = nuevo;
    }
  }
  mediosExternos.forEach((m) => delete m.sinNombre);
  await Promise.all(
    mediosExternos
      .filter((m) => m.categoria === "bomberos" || m.categoria === "hospital")
      .map(async (m) => {
        const r = await intentar(avisos, "OSRM (rutas)", () => rutaOSRM(m.linea[1], m.linea[0]));
        if (r) m.ruta = r;
      })
  );

  const sup = esArea ? superficieM2(plana, plano) : null;
  return {
    generado: new Date().toISOString(),
    ubicacion: {
      lat: centro[1],
      lng: centro[0],
      utm: (() => {
        const u = latLngAUtm(centro[1], centro[0]);
        return { x: Math.round(u.x), y: Math.round(u.y), huso: u.huso };
      })(),
      altitud: alt,
      municipio: admin?.municipio ?? null,
      provincia: admin?.provincia ?? null,
      comunidad: admin?.comunidad ?? null,
      parcelas: parcelas ?? [],
      superficieHa: sup === null ? null : Math.round(sup / 100) / 100,
    },
    tipologia,
    nucleos,
    infraestructuras,
    generacion,
    espacios,
    masaForestal,
    cauces: caucesFila,
    accesos,
    mediosExternos,
    avisos,
    criterios: TEXTO_CRITERIOS,
    fuentes: [
      { nombre: "OpenStreetMap (Overpass API), ODbL", url: "https://www.openstreetmap.org/copyright" },
      { nombre: "IEPNB · ENP, Red Natura 2000, MFE y montes (MITECO)", url: "https://geoserver.iepnb.es/geoserver/web/" },
      { nombre: "SNCZI · Zonas inundables ARPSI (MITECO), servicio IGN", url: WMS_INUNDACIONES },
      { nombre: "Sede Electrónica del Catastro", url: "https://www.sedecatastro.gob.es" },
      { nombre: "Nominatim (OSM), Open-Meteo (altitud) y OSRM (rutas)", url: "https://nominatim.org" },
    ],
  };
}
