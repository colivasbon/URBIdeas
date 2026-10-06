// Fase 2 (agente-fase2) — Ferrocarril: red ferroviaria IGN (INSPIRE TN).
//
// Fuente verificada con descarga real 2026-10-06:
// WFS https://servicios.idee.es/wfs-inspire/transportes, typename
// tn:RailwayLink (GetFeature count=1 → GML 3 854 B, numberMatched=1) y GetMap
// WMS TN.RailTransportNetwork.RailwayLink sobre Benidorm (PNG 3 317 B).
// Encuadre por bbox de Nominatim; filtro BBOX en servidor. GML en EPSG:4258
// (eje lat,lon): se invierte a lon/lat. Sin escritura en ningún sitio.

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

/** Miembros tn:RailwayLink: gml:id + centroide del primer posList (lat lon → lon/lat). */
function parsearMiembrosRailwayLink(gml: string): TramoWfs[] {
  const out: TramoWfs[] = [];
  const reMiembro = /<(?:tn-ra:RailwayLink|tn:RailwayLink)\b[^>]*gml:id="([^"]+)"[^>]*>([\s\S]*?)<\/(?:tn-ra:RailwayLink|tn:RailwayLink)>/g;
  let m: RegExpExecArray | null;
  while ((m = reMiembro.exec(gml)) !== null) {
    const id = m[1];
    const cuerpo = m[2];
    const pos = cuerpo.match(/<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/);
    if (!pos) continue;
    const nums = pos[1].trim().split(/\s+/).map(Number).filter(Number.isFinite);
    if (nums.length < 4) continue;
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

/** Tramos de ferrocarril que cruzan el término (centroide lon/lat por tramo). */
export async function cargarFerrocarril(municipio: string, provincia: string): Promise<ResultadoBloque> {
  const bb = await bboxNominatim(municipio, provincia);
  await sleep(800);
  if (!bb) {
    return { objetos: [], edicion: "", nota: `Sin bbox de encuadre para ${municipio} (${provincia}).` };
  }
  const q = new URLSearchParams({
    service: "WFS",
    request: "GetFeature",
    version: "2.0.0",
    typenames: "tn:RailwayLink",
    count: "100",
    bbox: `${bb.minLat},${bb.minLon},${bb.maxLat},${bb.maxLon},urn:ogc:def:crs:EPSG::4258`,
  });
  const d = await descargarTexto(`${WFS_TN}?${q.toString()}`, 4 * 1024 * 1024, 120000);
  if (esError(d)) return { objetos: [], edicion: "", nota: `IGN WFS transportes (RailwayLink): ${d.error}.` };
  const tramos = parsearMiembrosRailwayLink(d.texto);
  const objetos: Record<string, unknown>[] = tramos.map((t) => ({
    id_origen: t.id,
    lon: Math.round(t.lon * 1000000) / 1000000,
    lat: Math.round(t.lat * 1000000) / 1000000,
    fuente: "ign-inspire-tn-railwaylink",
  }));
  return {
    objetos,
    edicion: "continua",
    nota: `IGN INSPIRE TN RailwayLink por BBOX municipal (${d.bytes} B GML): ${objetos.length} tramos (tope 100/200; centroides aproximados).`,
  };
}
