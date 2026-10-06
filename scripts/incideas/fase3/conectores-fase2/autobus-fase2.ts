// Fase 2 (agente-fase2) — Autobús: paradas y líneas GTFS autonómicos.
//
// Fuentes verificadas con descarga real 2026-10-06:
// - GVA interurbano (CV): 7 CSV GTFS sueltos (stops 379 496 B con
//   stop_id,stop_name,stop_lat,stop_lon; stop_name trae [Localidad]).
// - Navarra interurbano: gtfs.zip (5 962 773 B, PK) vía CKAN.
// - Tenerife TITSA: Google-Transit zip (19 787 236 B, PK) vía CKAN.
// Galicia REST ya verificado por otro agente (no se re-sondea aquí).
// El filtro es por nombre de localidad ([Localidad] preferente): documentado
// en la nota. Sin escritura en ningún sitio (todo en memoria).

import JSZip from "jszip";
import {
  UA_FASE2,
  descargarTexto,
  descargarBinario,
  esError,
  parseCsv,
  numEs,
  indiceCab,
  bboxNominatim,
  sleep,
  coincideMunicipio,
  normalizar,
  type Bbox,
  type ResultadoBloque,
} from "./comun-fase2";

const GVA_BASE = "https://dadesobertes.gva.es/dataset/2f380ffd-b389-4ff4-9f7c-be92b30fbf28/resource";
const GVA_URLS = {
  stops: `${GVA_BASE}/bc9d83f7-ebba-4962-8c21-40a8cb557f10/download/stops.csv`,
  trips: `${GVA_BASE}/04621a78-1a33-4ff2-b195-98065c956795/download/trips.csv`,
  routes: `${GVA_BASE}/cf548844-a2d5-4ca2-9acf-5c0f20aacc06/download/routes.csv`,
  stopTimes: `${GVA_BASE}/35e44991-4a4d-483c-b9eb-a0d52e1b6253/download/stop_times.csv`,
};
const NAVARRA_ZIP =
  "https://datosabiertos.navarra.es/dataset/ebfb5edd-0cd9-4b31-b0d9-8bc2d25e2493/resource/d3c1c89a-5d4c-4c25-97b5-66da663d3691/download/gtfs.zip";
const TITSA_ZIP =
  "https://datos.tenerife.es/ckan/dataset/36c2e26f-0d18-4b5a-b214-1636168e0765/resource/9f291323-8b78-453a-9008-4f0e3bfb3ce3/download/fichero-zip-de-google-transit.zip";

interface Parada {
  id: string;
  nombre: string;
  lat: number;
  lon: number;
}

interface FeedGtfs {
  paradas: Parada[];
  rutaPorViaje: Map<string, string>;
  nombreRuta: Map<string, { corta: string; larga: string }>;
  viajesPorParada: Map<string, Set<string>>;
}

function columnasGtfs(cab: string[]): Record<string, number> {
  const col = (patrones: RegExp[]): number => indiceCab(cab, patrones);
  return {
    stopId: col([/^stop_id$/]),
    stopName: col([/^stop_name$/]),
    stopLat: col([/^stop_lat$/]),
    stopLon: col([/^stop_lon$/]),
    tripId: col([/^trip_id$/]),
    routeId: col([/^route_id$/]),
    routeShort: col([/^route_short_name$/]),
    routeLong: col([/^route_long_name$/]),
  };
}

function feedDesdeCsv(
  stops: string,
  trips: string,
  routes: string,
  stopTimes: string
): FeedGtfs {
  const feed: FeedGtfs = { paradas: [], rutaPorViaje: new Map(), nombreRuta: new Map(), viajesPorParada: new Map() };
  const cs = columnasGtfs(parseCsv(stops).cab);
  const ps = parseCsv(stops);
  for (const f of ps.filas) {
    const lat = cs.stopLat >= 0 ? numEs(f[cs.stopLat]) : null;
    const lon = cs.stopLon >= 0 ? numEs(f[cs.stopLon]) : null;
    if (lat === null || lon === null || cs.stopId < 0 || cs.stopName < 0) continue;
    feed.paradas.push({ id: f[cs.stopId], nombre: f[cs.stopName], lat, lon });
  }
  const pt = parseCsv(trips);
  const ct = columnasGtfs(pt.cab);
  if (ct.tripId >= 0 && ct.routeId >= 0) {
    for (const f of pt.filas) feed.rutaPorViaje.set(f[ct.tripId], f[ct.routeId]);
  }
  const pr = parseCsv(routes);
  const cr = columnasGtfs(pr.cab);
  if (cr.routeId >= 0) {
    for (const f of pr.filas) {
      feed.nombreRuta.set(f[cr.routeId], {
        corta: cr.routeShort >= 0 ? f[cr.routeShort] : "",
        larga: cr.routeLong >= 0 ? f[cr.routeLong] : "",
      });
    }
  }
  const ph = parseCsv(stopTimes);
  const ch = columnasGtfs(ph.cab);
  if (ch.tripId >= 0 && ch.stopId >= 0) {
    for (const f of ph.filas) {
      const s = feed.viajesPorParada.get(f[ch.stopId]);
      if (s) s.add(f[ch.tripId]);
      else feed.viajesPorParada.set(f[ch.stopId], new Set([f[ch.tripId]]));
    }
  }
  return feed;
}

async function feedDesdeZip(url: string, maxBytes: number): Promise<FeedGtfs | { error: string }> {
  const d = await descargarBinario(url, maxBytes, 180000);
  if (esError(d)) return d;
  try {
    const zip = await JSZip.loadAsync(d.buf);
    const leer = async (nombres: string[]): Promise<string | null> => {
      for (const n of nombres) {
        const f = zip.file(n);
        if (f) return f.async("string");
      }
      return null;
    };
    const stops = await leer(["stops.txt", "stops.csv"]);
    if (!stops) return { error: "ZIP sin stops.txt." };
    const trips = (await leer(["trips.txt"])) ?? "trip_id,route_id\n";
    const routes = (await leer(["routes.txt"])) ?? "route_id,route_short_name,route_long_name\n";
    const stopTimes = (await leer(["stop_times.txt"])) ?? "trip_id,stop_id\n";
    return feedDesdeCsv(stops, trips, routes, stopTimes);
  } catch (e: unknown) {
    return { error: String(e instanceof Error ? e.message : e).slice(0, 200) };
  }
}

/** Localidad entre corchetes de stop_name ("... [Benidorm]"), si existe. */
function localidadCorchete(nombre: string): string | null {
  const m = nombre.match(/\[([^\]]{2,60})\]/);
  return m ? m[1].trim() : null;
}

function dentroMargen(bb: Bbox, lon: number, lat: number, margen = 0.02): boolean {
  return lon >= bb.minLon - margen && lon <= bb.maxLon + margen && lat >= bb.minLat - margen && lat <= bb.maxLat + margen;
}

function esCV(provincia: string): boolean {
  const p = normalizar(provincia);
  return p.includes("alicante") || p.includes("alacant") || p.includes("valencia") || p.includes("castell");
}

function esNavarra(provincia: string): boolean {
  return normalizar(provincia).includes("navarra");
}

function esTenerife(provincia: string): boolean {
  const p = normalizar(provincia);
  return p.includes("tenerife") || p.includes("santa cruz");
}

/**
 * Paradas del municipio con sus líneas (GTFS autonómico según provincia).
 * Sin coordenadas aproximadas: todas las paradas traen stop_lat/stop_lon.
 */
export async function cargarAutobus(municipio: string, provincia: string): Promise<ResultadoBloque> {
  let feed: FeedGtfs | { error: string } | null = null;
  let fuente = "";
  let edicion = "";
  if (esCV(provincia)) {
    fuente = "gva-gtfs-interurbano";
    edicion = "2026-10-06";
    const partes: Record<string, string> = {};
    for (const [clave, url] of Object.entries(GVA_URLS)) {
      const tope = clave === "stopTimes" ? 12 * 1024 * 1024 : 2 * 1024 * 1024;
      const d = await descargarTexto(url, tope, 120000);
      if (esError(d)) return { objetos: [], edicion: "", nota: `GVA ${clave}: ${d.error}.` };
      partes[clave] = d.texto;
      await sleep(800);
    }
    feed = feedDesdeCsv(partes["stops"], partes["trips"], partes["routes"], partes["stopTimes"]);
    void UA_FASE2;
  } else if (esNavarra(provincia)) {
    fuente = "navarra-gtfs-interurbano";
    edicion = "verificada 2026-10-06";
    const f = await feedDesdeZip(NAVARRA_ZIP, 20 * 1024 * 1024);
    if (esError(f)) return { objetos: [], edicion: "", nota: `Navarra GTFS: ${f.error}.` };
    feed = f;
  } else if (esTenerife(provincia)) {
    fuente = "titsa-gtfs";
    edicion = "verificada 2026-10-06";
    const f = await feedDesdeZip(TITSA_ZIP, 40 * 1024 * 1024);
    if (esError(f)) return { objetos: [], edicion: "", nota: `TITSA GTFS: ${f.error}.` };
    feed = f;
  } else {
    return {
      objetos: [],
      edicion: "",
      nota: `Sin feed GTFS verificado para «${provincia}» (verificados: CV-GVA, Navarra, Tenerife-TITSA; Galicia REST previo de otro agente).`,
    };
  }
  const g = feed as FeedGtfs;
  // Encuadre para depurar coincidencias por nombre de calle (p. ej. una
  // «Av. Benidorm» en otro municipio): con [Localidad] basta el nombre;
  // sin corchetes se exige además estar en la bbox municipal (+margen).
  // Feeds sin localidades en los nombres (p. ej. TITSA: «ACORÁN»):
  // modo espacial puro (paradas dentro de la bbox, margen estrecho).
  const bb = await bboxNominatim(municipio, provincia);
  await sleep(800);
  const conCorchete = g.paradas.filter((p) => localidadCorchete(p.nombre) !== null).length;
  const modoEspacial = g.paradas.length > 0 && conCorchete / g.paradas.length < 0.01;
  const objetos: Record<string, unknown>[] = [];
  for (const p of g.paradas) {
    const loc = localidadCorchete(p.nombre);
    let vale = false;
    if (modoEspacial) {
      vale = bb ? dentroMargen(bb, p.lon, p.lat, 0.005) : false;
    } else if (loc) {
      vale = coincideMunicipio(loc, municipio);
    } else if (normalizar(p.nombre).includes(normalizar(municipio))) {
      vale = bb ? dentroMargen(bb, p.lon, p.lat) : true;
    }
    if (!vale) continue;
    const lineas = new Set<string>();
    for (const viaje of g.viajesPorParada.get(p.id) ?? []) {
      const rutaId = g.rutaPorViaje.get(viaje);
      if (!rutaId) continue;
      const r = g.nombreRuta.get(rutaId);
      lineas.add(r ? `${r.corta} ${r.larga}`.trim() : rutaId);
    }
    objetos.push({
      parada: p.nombre,
      stop_id: p.id,
      lon: p.lon,
      lat: p.lat,
      lineas: [...lineas].slice(0, 12),
      fuente: fuente,
    });
    if (objetos.length >= 400) break;
  }
  return {
    objetos,
    edicion,
    nota: `${g.paradas.length} paradas en el feed ${fuente} (${modoEspacial ? "modo espacial: feed sin localidades" : "filtro [Localidad] o nombre+bbox"}); ${objetos.length} del municipio (sin geometría municipal).`,
  };
}
