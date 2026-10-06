// Fase 2 (agente-fase2) — Incendios forestales: MITECO + CCAA.
//
// Verificación con descarga real 2026-10-06:
// - MITECO WMS https://wms.mapama.gob.es/sig/Biodiversidad/Incendios/wms.aspx
//   → CAÍDO (ServiceException 500 NullReference del servidor; 561 B).
// - IDENA Navarra: FOREST_Pol_HcoIncendioA.zip (histórico 2019-2023,
//   4 630 781 B, PK) + Pyromas/ZonUsoFuego en catálogo.
// - GVA PATFOR: WFS terramapas Recurrencia/Peligrosidad con salida CSV
//   (count=2 → 870 B: WKT MULTIPOLYGON UTM30N + recurrenci + area_ha) y WMS
//   de prevención (GetCapabilities 191 337 B).
// Filtro espacial aproximado por bbox (Nominatim solo encuadra). Sin escritura.

import {
  descargarTexto,
  esError,
  bboxNominatim,
  bboxAUtm30N,
  sleep,
  parseCsv,
  indiceCab,
  numEs,
  cargarShpZip,
  bboxDeCoords,
  seSolapan,
  centroideAprox,
  utm30NaLonLat,
  propsMencionanMunicipio,
  propPublica,
  normalizar,
  type Bbox,
  type ResultadoBloque,
} from "./comun-fase2";

const PATFOR_WFS = "https://terramapas.icv.gva.es/0506_PATFOR";

function esCV(provincia: string): boolean {
  const p = normalizar(provincia);
  return p.includes("alicante") || p.includes("alacant") || p.includes("valencia") || p.includes("castell");
}

function esNavarra(provincia: string): boolean {
  return normalizar(provincia).includes("navarra");
}

interface CeldaPatfor {
  capa: string;
  recurrencia: string;
  areaHa: string;
  lon: number;
  lat: number;
}

function numerosWkt(wkt: string): number[] {
  return (wkt.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter(Number.isFinite);
}

async function cargarPatfor(
  typename: string,
  capa: string,
  bb: Bbox,
  municipio: string
): Promise<{ celdas: CeldaPatfor[]; nota: string }> {
  // Terramapas exige la bbox en el CRS nativo (EPSG:25830), sin sufijo CRS.
  const nativa = bboxAUtm30N(bb);
  const q = new URLSearchParams({
    request: "GetFeature",
    service: "WFS",
    version: "2.0.0",
    typename,
    outputformat: "csv",
    count: "200",
    bbox: `${Math.floor(nativa.minLon)},${Math.floor(nativa.minLat)},${Math.ceil(nativa.maxLon)},${Math.ceil(nativa.maxLat)}`,
  });
  const d = await descargarTexto(`${PATFOR_WFS}?${q.toString()}`, 6 * 1024 * 1024, 120000);
  if (esError(d)) return { celdas: [], nota: `${capa}: ${d.error}.` };
  const { cab, filas } = parseCsv(d.texto);
  const iWkt = indiceCab(cab, [/^wkt$/]);
  const iRec = indiceCab(cab, [/recurrenci/]);
  const iArea = indiceCab(cab, [/area_ha/]);
  if (iWkt < 0) return { celdas: [], nota: `${capa}: CSV sin WKT.` };
  const celdas: CeldaPatfor[] = [];
  void municipio;
  for (const f of filas) {
    const nums = numerosWkt(f[iWkt] ?? "");
    if (nums.length < 6) continue;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let i = 0; i + 1 < nums.length && n < 2000; i += 2) {
      sx += nums[i];
      sy += nums[i + 1];
      n++;
    }
    if (n === 0) continue;
    const g = utm30NaLonLat(sx / n, sy / n);
    celdas.push({
      capa,
      recurrencia: iRec >= 0 ? f[iRec] : "",
      areaHa: iArea >= 0 ? f[iArea] : "",
      lon: Math.round(g.lon * 1000000) / 1000000,
      lat: Math.round(g.lat * 1000000) / 1000000,
    });
    if (celdas.length >= 200) break;
  }
  return { celdas, nota: `${capa}: ${celdas.length}/${filas.length} celdas CSV (${d.bytes} B).` };
}

/** Zonas de recurrencia/peligrosidad PATFOR que caen en la bbox municipal. */
export async function cargarIncendios(municipio: string, provincia: string): Promise<ResultadoBloque> {
  const notas: string[] = [
    "MITECO WMS Incendios (wms.mapama.gob.es): CAÍDO 2026-10-06 (ServiceException 500 del servidor).",
  ];
  const objetos: Record<string, unknown>[] = [];
  if (esCV(provincia)) {
    const bb = await bboxNominatim(municipio, provincia);
    await sleep(800);
    if (!bb) {
      notas.push("Sin bbox de encuadre: PATFOR omitido.");
    } else {
      const r1 = await cargarPatfor("Regulacion.Incendios.Recurrencia", "patfor-recurrencia", bb, municipio);
      await sleep(800);
      const r2 = await cargarPatfor("Regulacion.Incendios.Peligrosidad", "patfor-peligrosidad", bb, municipio);
      await sleep(800);
      notas.push(r1.nota, r2.nota);
      for (const c of [...r1.celdas, ...r2.celdas]) {
        objetos.push({
          capa: c.capa,
          recurrencia: c.recurrencia,
          area_ha: numEs(c.areaHa) ?? c.areaHa,
          lon: c.lon,
          lat: c.lat,
          fuente: "gva-patfor-wfs",
        });
      }
    }
    return {
      objetos,
      edicion: objetos.length > 0 ? "vigente (PATFOR)" : "",
      nota: notas.join(" "),
    };
  }
  if (esNavarra(provincia)) {
    const bb = await bboxNominatim(municipio, provincia);
    await sleep(800);
    const r = await cargarShpZip("https://idena.navarra.es/descargas/FOREST_Pol_HcoIncendioA.zip", 20 * 1024 * 1024);
    if (esError(r)) {
      notas.push(`IDENA HcoIncendioA: ${r.error}.`);
      return { objetos: [], edicion: "", nota: notas.join(" ") };
    }
    let conSolape = 0;
    for (const f of r.features) {
      if (!f.geometry) continue;
      const nativa = bboxDeCoords(f.geometry.coordinates);
      if (!nativa) continue;
      // bbox nativa (UTM30N) → esquinas a lon/lat para solape aproximado.
      const c1 = utm30NaLonLat(nativa.minLon, nativa.minLat);
      const c2 = utm30NaLonLat(nativa.maxLon, nativa.maxLat);
      const geo: Bbox = {
        minLon: Math.min(c1.lon, c2.lon),
        minLat: Math.min(c1.lat, c2.lat),
        maxLon: Math.max(c1.lon, c2.lon),
        maxLat: Math.max(c1.lat, c2.lat),
      };
      const cerca = bb ? seSolapan(geo, bb) : false;
      const menciona = propsMencionanMunicipio(f.properties, municipio);
      if (!cerca && !menciona) continue;
      conSolape++;
      const c = centroideAprox(f.geometry.coordinates);
      const g = c ? utm30NaLonLat(c.x, c.y) : null;
      const campos: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(f.properties)) campos[k] = propPublica(v);
      objetos.push({
        ...campos,
        lon: g ? Math.round(g.lon * 1000000) / 1000000 : null,
        lat: g ? Math.round(g.lat * 1000000) / 1000000 : null,
        fuente: "idena-hcoincendio-2019-2023",
      });
      if (objetos.length >= 200) break;
    }
    notas.push(`IDENA HcoIncendioA 2019-2023: ${r.features.length} polígonos; ${conSolape} con solape/mención (tope 200).`);
    return { objetos, edicion: objetos.length > 0 ? "2019-2023" : "", nota: notas.join(" ") };
  }
  notas.push(`Sin fuente de incendios verificada para «${provincia}» (verificadas: CV-PATFOR, Navarra-IDENA).`);
  return { objetos: [], edicion: "", nota: notas.join(" ") };
}
