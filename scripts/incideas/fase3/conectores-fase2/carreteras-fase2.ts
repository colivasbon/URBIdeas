// Fase 2 (agente-fase2) — Carreteras: red viaria IGN (INSPIRE TN).
//
// Fuente verificada con descarga real 2026-10-06:
// WFS https://servicios.idee.es/wfs-inspire/transportes, typename
// tn:RoadLink (GetFeature count=1 → GML 6 873 B, numberMatched=1) y GetMap
// WMS TN.RoadTransportNetwork.RoadLink sobre Benidorm (PNG 10 472 B).
// El encuadre municipal viene de Nominatim (solo bbox); el WFS filtra por
// BBOX en servidor. GML en EPSG:4258 (eje lat,lon): se invierte a lon/lat.
// Sin escritura en ningún sitio.

import {
  descargarTexto,
  esError,
  bboxNominatim,
  sleep,
  type ResultadoBloque,
} from "./comun-fase2";

const WFS_TN = "https://servicios.idee.es/wfs-inspire/transportes";

interface TramoWfs {
  id: string;
  lon: number;
  lat: number;
}

/** Extrae miembros tn:RoadLink: gml:id + centroide del primer posList (lat lon → lon/lat). */
function parsearMiembrosRoadLink(gml: string): TramoWfs[] {
  const out: TramoWfs[] = [];
  const reMiembro = /<(?:tn-ro:RoadLink|tn:RoadLink)\b[^>]*gml:id="([^"]+)"[^>]*>([\s\S]*?)<\/(?:tn-ro:RoadLink|tn:RoadLink)>/g;
  let m: RegExpExecArray | null;
  while ((m = reMiembro.exec(gml)) !== null) {
    const id = m[1];
    const cuerpo = m[2];
    const pos = cuerpo.match(/<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/);
    if (!pos) continue;
    const nums = pos[1].trim().split(/\s+/).map(Number).filter(Number.isFinite);
    if (nums.length < 4) continue;
    // EPSG:4258 → pares (lat, lon).
    let sLat = 0;
    let sLon = 0;
    let n = 0;
    const tope = Math.min(nums.length - 1, 400);
    for (let i = 0; i < tope; i += 2) {
      sLat += nums[i];
      sLon += nums[i + 1];
      n++;
    }
    if (n === 0) continue;
    out.push({ id, lon: sLon / n, lat: sLat / n });
    if (out.length >= 200) break;
  }
  return out;
}

/** Tramos de carretera que cruzan el término (centroide lon/lat por tramo). */
export async function cargarCarreteras(municipio: string, provincia: string): Promise<ResultadoBloque> {
  const bb = await bboxNominatim(municipio, provincia);
  await sleep(800);
  if (!bb) {
    return { objetos: [], edicion: "", nota: `Sin bbox de encuadre para ${municipio} (${provincia}).` };
  }
  const q = new URLSearchParams({
    service: "WFS",
    request: "GetFeature",
    version: "2.0.0",
    typenames: "tn:RoadLink",
    count: "100",
    bbox: `${bb.minLat},${bb.minLon},${bb.maxLat},${bb.maxLon},urn:ogc:def:crs:EPSG::4258`,
  });
  const d = await descargarTexto(`${WFS_TN}?${q.toString()}`, 4 * 1024 * 1024, 120000);
  if (esError(d)) return { objetos: [], edicion: "", nota: `IGN WFS transportes (RoadLink): ${d.error}.` };
  const tramos = parsearMiembrosRoadLink(d.texto);
  const objetos: Record<string, unknown>[] = tramos.map((t) => ({
    id_origen: t.id,
    lon: Math.round(t.lon * 1000000) / 1000000,
    lat: Math.round(t.lat * 1000000) / 1000000,
    fuente: "ign-inspire-tn-roadlink",
  }));
  return {
    objetos,
    edicion: "continua",
    nota: `IGN INSPIRE TN RoadLink por BBOX municipal (${d.bytes} B GML): ${objetos.length} tramos (tope 100/200; centroides aproximados).`,
  };
}
