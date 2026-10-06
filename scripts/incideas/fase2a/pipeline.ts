// Fase 2A — Cadena vertical por municipio (lecturas públicas + artefactos locales).
//
// Uso: npx tsx scripts/incideas/fase2a/pipeline.ts --ine <codigo>
// Códigos contratados: 03031 (Benidorm), 30030 (Murcia).
//
// No escribe en ningún sistema real: toda la salida va a `salida/fase2a/<ine>/`.
// No toca SOCideas ni la población municipal (ni siquiera la lee).

import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as turf from "@turf/turf";
import {
  MUNICIPIOS,
  PRODUCTOS_PATRICOVA,
  reconciliarHidro,
  type CodigoIneFase2A,
  type EstadoConsulta,
  type RecuentosHidro,
} from "./contrato";
import {
  BBOX_ARRANQUE,
  obtenerLimite,
  obtenerHidro,
  sondearDescargaPatricova,
  descargarPdfPatricova,
  muestraWMS,
  infoRastersInundacion,
  WMS_INSPIRE_INUND,
  type EvidenciaConsulta,
  type CapaHidro,
} from "./fuentes";
import { ampliarBbox, recortarTramos, areaM2, type TramoRecortado } from "./geo-calc";
import { escribirExcel, escribirGeoJSON, escribirGPKG, escribirMapa, type PaqueteExportacion } from "./exportar";
import type { FeatureGPKG } from "../../../src/lib/incideas/formato-abierto-gpkg";
import type { CapaPatricova } from "./patricova-shp";

const RAIZ = process.cwd();

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

type Json = Record<string, unknown>;

interface FilaRecorte {
  id_origen: string;
  local_id: string | null;
  nombre: string | null;
  intersecta: boolean;
  longitud_original_m: number;
  longitud_municipal_m: number;
  con_geometria_recorte: boolean;
}

interface CapaHidroInforme {
  total_servidor_bbox: number | null;
  n_descargados: number;
  descarga_completa: boolean | null;
  claves_propiedades: string[];
  recuentos: RecuentosHidro & { provisional?: string; nota?: string };
  longitud_municipal_m: number;
  n_recortes_con_geometria: number;
  evidencias: EvidenciaConsulta[];
  recorte: FilaRecorte[];
  geometrias?: TramoRecortado[];
}

interface CapaPatInforme {
  zip_bytes: number;
  zip_url: string | null;
  n_objetos_cv: number;
  campos: string[];
  bbox_cv: CapaPatricova["bbox_cv"];
  valores_por_campo: CapaPatricova["valores_por_campo"];
  n_recorte_municipal: number;
  area_municipal_m2: number;
  recorte: CapaPatricova["recorte_municipal"];
}

interface Informe {
  snapshot_utc: string;
  ine: string;
  municipio: string;
  patricova_aplicable: boolean;
  limite: Json;
  hidrografia: Record<string, CapaHidroInforme>;
  patricova: Json;
  escenarios: Json;
  exposicion: Json;
  exportaciones: Json;
}

/** Lectura tipada y tolerante de un campo del informe. */
function campo(o: Json, k: string): unknown {
  return o[k];
}

async function main(): Promise<void> {
  const ineRaw = arg("--ine");
  if (!ineRaw || !MUNICIPIOS[ineRaw as CodigoIneFase2A]) {
    throw new Error(`Fase 2A: indica --ine con un código contratado (${Object.keys(MUNICIPIOS).join(", ")})`);
  }
  const ine = ineRaw as CodigoIneFase2A;
  const muni = MUNICIPIOS[ine];
  const snapshotUtc = new Date().toISOString();
  const dir = join(RAIZ, "salida", "fase2a", ine);
  mkdirSync(dir, { recursive: true });
  const informe: Informe = {
    snapshot_utc: snapshotUtc, ine, municipio: muni.nombre,
    patricova_aplicable: muni.patricovaAplicable,
    limite: {}, hidrografia: {}, patricova: {}, escenarios: {}, exposicion: {}, exportaciones: {},
  };

  // ---- 1. Límite municipal (IGN AU) ----
  console.log(`[fase2a:${ine}] 1/6 límite…`);
  const lim = await obtenerLimite(ine);
  let termino: GeoJSON.Geometry | null = null;
  let bbox = BBOX_ARRANQUE[ine];
  if ("error" in lim) {
    informe.limite = { estado: lim.error.estado, detalle: lim.error.detalle, evidencia: lim.error };
  } else {
    termino = lim.feature.geometry;
    bbox = lim.bbox;
    let areaM2Termino = 0;
    try { areaM2Termino = termino ? areaM2(termino) : 0; } catch { areaM2Termino = 0; }
    informe.limite = {
      estado: "CONSULTA_VALIDA", ruta_codigo: lim.rutaCodigo,
      bbox, area_termino_m2: Math.round(areaM2Termino),
      evidencias: lim.evidencias,
    };
    if (termino) {
      writeFileSync(join(dir, `${muni.nombre}_${ine}_limite.geojson`), JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: termino }] }));
    }
  }

  // ---- 2. Hidrografía (IGN IGR): objetos/tramos originales ----
  console.log(`[fase2a:${ine}] 2/6 hidrografía…`);
  const bboxHidro = termino ? ampliarBbox(bbox, 0.01) : BBOX_ARRANQUE[ine];
  const capas: Record<string, CapaHidroInforme> = {};
  for (const tipo of ["hy-p:Watercourse", "hy-n:WatercourseLink"] as const) {
    console.log(`[fase2a:${ine}] hidro ${tipo}…`);
    const capa: CapaHidro = await obtenerHidro(tipo, bboxHidro);
    console.log(`[fase2a:${ine}] hidro ${tipo}: total=${capa.totalServidor} descargados=${capa.objetos.length}`);
    // Término simplificado solo para el test por segmento (municipios
    // grandes); la intersección previa usa el término exacto.
    let terminoSimple: GeoJSON.Geometry | null = null;
    try {
      const nVert = termino ? JSON.stringify(termino).length : 0;
      if (termino && nVert > 200000) {
        terminoSimple = turf.simplify(termino, { tolerance: 0.0003, highQuality: false }).geometry;
      }
    } catch { terminoSimple = null; }
    const recorte = termino
      ? recortarTramos(capa.objetos.map((o) => ({ id: o.id, localId: o.localId, nombre: o.nombre, geometria: o.geometria })), termino, terminoSimple ?? undefined)
      : [];
    console.log(`[fase2a:${ine}] hidro ${tipo}: recorte listo`);
    const rec = reconciliarHidro({
      objetos: recorte.length > 0
        ? recorte.map((r) => ({ id: r.id_origen, localId: r.localId, nombre: r.nombre, intersecta: r.intersecta }))
        : capa.objetos.map((o) => ({ id: o.id, localId: o.localId, nombre: o.nombre, intersecta: false })),
    });
    const longitudMunicipal = recorte.filter((r) => r.intersecta).reduce((s, r) => s + r.longitud_municipal_m, 0);
    const completa = capa.totalServidor === null ? null : capa.objetos.length >= capa.totalServidor;
    capas[tipo] = {
      total_servidor_bbox: capa.totalServidor,
      n_descargados: capa.objetos.length,
      descarga_completa: completa,
      claves_propiedades: capa.clavesPropiedades,
      recuentos: termino
        ? completa === false
          ? { ...rec, provisional: "Descarga parcial: recuentos provisionales sobre lo descargado." }
          : rec
        : { ...rec, nota: "Sin término municipal: intersección no calculada; todo es n_solo_bbox provisional." },
      longitud_municipal_m: Math.round(longitudMunicipal * 100) / 100,
      n_recortes_con_geometria: recorte.filter((r) => r.geometria_recorte).length,
      evidencias: capa.evidencias,
      // En el informe, el recorte va sin geometrías (viven en los exports);
      // el recorte completo con geometrías solo se usa en memoria.
      recorte: recorte.map((r) => ({
        id_origen: r.id_origen, local_id: r.localId, nombre: r.nombre, intersecta: r.intersecta,
        longitud_original_m: r.longitud_original_m, longitud_municipal_m: r.longitud_municipal_m,
        con_geometria_recorte: !!r.geometria_recorte,
      })),
    };
    // Geometrías para exportar (no se serializan al informe).
    capas[tipo].geometrias = recorte;
  }
  informe.hidrografia = capas;

  // ---- 3. PATRICOVA (solo Comunitat Valenciana) ----
  console.log(`[fase2a:${ine}] 3/6 PATRICOVA…`);
  const capasPatricova: Record<string, CapaPatInforme> = {};
  if (!muni.patricovaAplicable) {
    informe.patricova = { estado: "NO_APLICABLE" as EstadoConsulta, detalle: `PATRICOVA no aplicable por ámbito territorial (${muni.ca}).` };
  } else {
    const productos: Json = {};
    for (const p of PRODUCTOS_PATRICOVA) {
      const [pdf, job] = await Promise.all([descargarPdfPatricova(p.clave), sondearDescargaPatricova(p.clave, p.capa, 60000)]);
      const entrada: Json = {
        capa: p.capa, definicion: p.definicion,
        pdf: { bytes: pdf.bytes, sha256: pdf.sha256, estado: pdf.estado },
        descarga_shp: job,
      };
      // Distribución real: un único shapefile por producto (sin hojas).
      // Descarga acotada + recorte municipal cuando el término está disponible.
      if (termino && job.estado === "CONSULTA_VALIDA" && job.urlDescarga) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 120000);
          const r = await fetch(job.urlDescarga, { headers: { "User-Agent": "INCideas-Fase2A/0.1" }, signal: controller.signal });
          clearTimeout(timer);
          const buf = Buffer.from(await r.arrayBuffer());
          const { leerYRecortar } = await import("./patricova-shp");
          const capa = await leerYRecortar(p.clave, buf, termino, bbox);
          capasPatricova[p.clave] = {
            zip_bytes: buf.length, zip_url: job.urlDescarga,
            n_objetos_cv: capa.n_objetos_cv, campos: capa.campos, bbox_cv: capa.bbox_cv,
            valores_por_campo: capa.valores_por_campo,
            n_recorte_municipal: capa.recorte_municipal.length,
            area_municipal_m2: Math.round(capa.recorte_municipal.reduce((s, x) => s + x.area_municipal_m2, 0) * 100) / 100,
            recorte: capa.recorte_municipal,
          };
        } catch (e: unknown) {
          entrada["recorte_shp"] = { estado: "CONSULTA_FALLIDA", detalle: String(e instanceof Error ? e.message : e).slice(0, 300) };
        }
      }
      productos[p.clave] = entrada;
    }
    const recorteResumen: Json = {};
    for (const prod of Object.keys(capasPatricova)) {
      const c = capasPatricova[prod];
      recorteResumen[prod] = {
        zip_bytes: c.zip_bytes, n_objetos_cv: c.n_objetos_cv, campos: c.campos,
        bbox_cv: c.bbox_cv, valores_por_campo: c.valores_por_campo,
        n_recorte_municipal: c.n_recorte_municipal, area_municipal_m2: c.area_municipal_m2,
      };
    }
    informe.patricova = { estado: "CONSULTA_VALIDA" as EstadoConsulta, productos, recorte: recorteResumen };
  }

  // ---- 4. Escenarios SNCZI/INSPIRE (raster: consulta de mapa, no vector) ----
  console.log(`[fase2a:${ine}] 4/6 escenarios raster…`);
  const muestras = [];
  for (const capa of ["NZ.Flood.FluvialT10", "NZ.Flood.FluvialT100", "NZ.Flood.FluvialT500"]) {
    muestras.push(await muestraWMS(WMS_INSPIRE_INUND, capa, bbox));
  }
  const gfi = await infoRastersInundacion(bbox);
  informe.escenarios = {
    nota: "INSPIRE expone cobertura raster (GRAY_INDEX), no polígonos vectoriales: no hay áreas de contención T10∖T100/T100∖T500 sin distribución vectorial oficial. El comparador está implementado y probado (fixtures); pendiente de vector oficial.",
    estado_vectorial: "COBERTURA_NO_DETERMINADA" as EstadoConsulta,
    muestras_getmap: muestras.map((m) => ({ capa: m.capa, estado: m.estado, bytes: m.bytes, url: m.url })),
    getfeatureinfo_centro: gfi,
  };

  // ---- 5. Exposición con el inventario activo y público (artefactos locales) ----
  console.log(`[fase2a:${ine}] 5/6 exposición…`);
  informe.exposicion = await calcularExposicion(ine, termino, capas, capasPatricova);

  // ---- 6. Exportaciones coherentes ----
  console.log(`[fase2a:${ine}] 6/6 exportaciones…`);
  informe.exportaciones = await exportarTodo(dir, muni.nombre, ine, snapshotUtc, informe, termino, capas, capasPatricova);

  // Las geometrías completas viven en los exports, no en el informe.
  for (const k of Object.keys(capas)) delete capas[k].geometrias;
  writeFileSync(join(dir, "informe.json"), JSON.stringify(informe, null, 2));
  writeFileSync(join(dir, "informe.md"), aMarkdown(informe));
  console.log(`OK salida/fase2a/${ine}/informe.json`);
  console.log(resumen(informe));
}

interface PuntoInventario {
  i: number;
  categoria: string;
  punto: [number, number];
}

async function calcularExposicion(
  ine: CodigoIneFase2A,
  termino: GeoJSON.Geometry | null,
  capas: Record<string, CapaHidroInforme>,
  capasPatricova: Record<string, CapaPatInforme>
): Promise<Json> {
  void termino;
  // Inventario publicado como artefacto local; si no existe, estado honesto.
  // Mismo código en todos los municipios (sin reglas ad-hoc).
  const exacto = join(RAIZ, "salida", `incideas_${ine}`);
  let geojsonPath: string | null = null;
  if (existsSync(exacto)) {
    const f = readdirSync(exacto).find((n) => n.endsWith("_inventario.geojson"));
    if (f) geojsonPath = join(exacto, f);
  }
  if (!geojsonPath) {
    return { estado: "COBERTURA_NO_DETERMINADA" as EstadoConsulta, detalle: `Sin inventario público publicado para ${ine}: no hay relaciones de exposición que calcular. Mismo código que en todos los municipios (sin reglas ad-hoc).` };
  }
  const inv = JSON.parse(readFileSync(geojsonPath, "utf8")) as { features?: Array<{ geometry?: GeoJSON.Geometry | null; properties?: Record<string, unknown> }> };
  const feats = inv.features ?? [];
  // Puntos con coordenadas (el GeoJSON ya trae la geometría de la fuente o el punto representativo).
  const puntos: PuntoInventario[] = [];
  feats.forEach((f, i) => {
    let p: [number, number] | null = null;
    try {
      if (f.geometry?.type === "Point") p = f.geometry.coordinates as [number, number];
      else if (f.geometry) p = turf.centroid(f.geometry).geometry.coordinates as [number, number];
    } catch { p = null; }
    if (p) {
      const props = f.properties ?? {};
      puntos.push({ i, categoria: String(props["categoria"] ?? props["categoria_ine"] ?? "sin_categoria"), punto: p });
    }
  });
  // Corredores: recortes municipales con geometría.
  const lineas: Array<GeoJSON.LineString | GeoJSON.MultiLineString> = [];
  for (const k of Object.keys(capas)) {
    for (const r of capas[k].geometrias ?? []) {
      if (r.geometria_recorte) lineas.push(r.geometria_recorte);
    }
  }
  const bandas = { lt50: 0, lt100: 0, lt250: 0, resto: 0, sin_corredor: lineas.length === 0 };
  const porCategoria: Record<string, number> = {};
  if (lineas.length > 0) {
    for (const x of puntos) {
      const pt = turf.point(x.punto);
      let dMin = Infinity;
      for (const l of lineas) {
        try {
          const d = turf.pointToLineDistance(pt, l, { units: "kilometers" }) * 1000;
          if (d < dMin) dMin = d;
        } catch { /* tramo degenerado: se ignora sin romper el resto */ }
      }
      if (!Number.isFinite(dMin)) { bandas.resto++; continue; }
      if (dMin < 50) bandas.lt50++;
      else if (dMin < 100) bandas.lt100++;
      else if (dMin < 250) bandas.lt250++;
      else bandas.resto++;
      porCategoria[x.categoria] = (porCategoria[x.categoria] ?? 0) + 1;
    }
  }
  // Overlay PATRICOVA: puntos del inventario dentro de polígonos de cada
  // producto (conteo por producto y por valor observado de cada campo con
  // pocos distintos; los nombres de campo son los publicados, sin traducir).
  let overlayPatricova: Json | string | null = null;
  const clavesPat = Object.keys(capasPatricova);
  if (clavesPat.length > 0 && puntos.length > 0) {
    overlayPatricova = {};
    for (const prod of clavesPat) {
      const polys = (capasPatricova[prod].recorte ?? []).filter((x) => x.geometria);
      // Una pasada punto×polígono; luego se agrega por campo-valor observado.
      const dentroDe = new Map<number, typeof polys>();
      for (const x of puntos) {
        const lista: typeof polys = [];
        for (const poly of polys) {
          try {
            if (poly.geometria && turf.booleanPointInPolygon(turf.point(x.punto), poly.geometria)) lista.push(poly);
          } catch { /* polígono degenerado: se ignora */ }
        }
        if (lista.length > 0) dentroDe.set(x.i, lista);
      }
      const porCampo: Record<string, Record<string, number>> = {};
      const campos = polys.length > 0 ? Object.keys(polys[0].campos) : [];
      for (const c of campos) {
        const distintos = new Set(polys.map((q) => String(q.campos[c]))).size;
        if (distintos > 12) continue;
        const cont: Record<string, number> = {};
        for (const lista of dentroDe.values()) {
          const vistos = new Set<string>();
          for (const q of lista) vistos.add(String(q.campos[c]));
          for (const v of vistos) cont[v] = (cont[v] ?? 0) + 1;
        }
        porCampo[c] = cont;
      }
      (overlayPatricova as Json)[prod] = {
        n_poligonos_municipales: polys.length,
        n_inventario_dentro: dentroDe.size,
        por_valor_observado: porCampo,
      };
    }
  }
  return {
    estado: "CONSULTA_VALIDA" as EstadoConsulta,
    inventario_geojson: geojsonPath,
    n_inventario_total: feats.length,
    n_inventario_con_punto: puntos.length,
    n_corredores_hidro: lineas.length,
    bandas_distancia_m: bandas,
    por_categoria_con_corredor: porCategoria,
    overlay_patricova: overlayPatricova ?? "sin recorte PATRICOVA (no aplicable o sin término)",
    nota: "Distancia punto→corredor hidrográfico municipal (recorte) + puntos dentro de PATRICOVA. No fusiona ni renombra: el inventario queda intacto.",
  };
}

async function exportarTodo(
  dir: string, nombre: string, ine: string, snapshotUtc: string,
  informe: Informe, termino: GeoJSON.Geometry | null, capas: Record<string, CapaHidroInforme>, capasPatricova: Record<string, CapaPatInforme>
): Promise<Json> {
  const base = `${nombre}_${ine}_fase2a`;
  const wc = capas["hy-p:Watercourse"];
  const wl = capas["hy-n:WatercourseLink"];

  const filasTramos = (c: CapaHidroInforme, tipo: string): Array<Array<string | number | null>> =>
    c.recorte.map((r) => [tipo, r.id_origen, r.local_id ?? "", r.nombre ?? "", r.intersecta ? "sí" : "no (solo BBOX)", r.longitud_original_m, r.intersecta ? r.longitud_municipal_m : null]);

  const paquete: PaqueteExportacion = {
    snapshotUtc, ine, nombreMunicipio: nombre,
    centroMapa: [BBOX_ARRANQUE[ine as CodigoIneFase2A].minLat, BBOX_ARRANQUE[ine as CodigoIneFase2A].minLon],
    portada: [
      ["Municipio", `${nombre} (${ine})`],
      ["Foto (snapshot_utc)", snapshotUtc],
      ["PATRICOVA aplicable", informe.patricova_aplicable ? "sí" : "no (NO_APLICABLE territorial)"],
      ["Límite (estado)", String(campo(informe.limite, "estado") ?? "?")],
      ["Watercourse: miembros / con nombre / nombres≠ / localId≠ / intersectan / solo BBOX", `${wc.recuentos.n_objetos} / ${wc.recuentos.n_con_nombre} / ${wc.recuentos.n_nombres_distintos} / ${wc.recuentos.n_localid_distintos} / ${wc.recuentos.n_intersectan_termino} / ${wc.recuentos.n_solo_bbox}`],
      ["WatercourseLink: miembros / con nombre / nombres≠ / localId≠ / intersectan / solo BBOX", `${wl.recuentos.n_objetos} / ${wl.recuentos.n_con_nombre} / ${wl.recuentos.n_nombres_distintos} / ${wl.recuentos.n_localid_distintos} / ${wl.recuentos.n_intersectan_termino} / ${wl.recuentos.n_solo_bbox}`],
      ["Entidades reconciliadas", "no determinado (modelo de identidad sin comprobar; varios miembros pueden compartir hydroId)"],
      ["Escenarios T10/T100/T500 (vectorial)", String(campo(informe.escenarios, "estado_vectorial"))],
      ["Exposición (estado)", String(campo(informe.exposicion, "estado") ?? "?")],
    ],
    hojas: [
      {
        nombre: "hidro_recuentos",
        columnas: ["capa", "n_objetos_miembros", "n_con_nombre", "n_nombres_distintos", "n_localid_distintos_obs", "n_entidades_reconciliadas", "n_intersectan_termino", "n_solo_bbox", "longitud_municipal_m", "total_servidor_bbox", "descarga_completa"],
        filas: [
          ["hy-p:Watercourse", wc.recuentos.n_objetos, wc.recuentos.n_con_nombre, wc.recuentos.n_nombres_distintos, wc.recuentos.n_localid_distintos, "no determinado", wc.recuentos.n_intersectan_termino, wc.recuentos.n_solo_bbox, wc.longitud_municipal_m, wc.total_servidor_bbox, wc.descarga_completa],
          ["hy-n:WatercourseLink", wl.recuentos.n_objetos, wl.recuentos.n_con_nombre, wl.recuentos.n_nombres_distintos, wl.recuentos.n_localid_distintos, "no determinado", wl.recuentos.n_intersectan_termino, wl.recuentos.n_solo_bbox, wl.longitud_municipal_m, wl.total_servidor_bbox, wl.descarga_completa],
        ],
      },
      {
        nombre: "hidro_tramos",
        columnas: ["capa", "id_origen", "local_id", "nombre", "intersecta_termino", "longitud_original_m", "longitud_municipal_m"],
        filas: [...filasTramos(wc, "Watercourse"), ...filasTramos(wl, "WatercourseLink")],
      },
      {
        nombre: "consultas_evidencia",
        columnas: ["fuente", "estado", "detalle", "url"],
        filas: [
          ...evidenciasDe(informe.limite, "IGN AU"),
          ...wc.evidencias.map((e) => ["IGN hidro Watercourse", e.estado, `${e.detalle} (matched=${e.numberMatched})`, e.url] as Array<string | number | null>),
          ...wl.evidencias.map((e) => ["IGN hidro WatercourseLink", e.estado, `${e.detalle} (matched=${e.numberMatched})`, e.url] as Array<string | number | null>),
        ],
      },
    ],
  };

  // Hojas PATRICOVA / escenarios / exposición según aplique.
  if (informe.patricova_aplicable) {
    const prods = (campo(informe.patricova, "productos") ?? {}) as Json;
    paquete.hojas.push({
      nombre: "patricova_evidencia",
      columnas: ["producto", "capa_gdb", "pdf_bytes", "pdf_sha256", "descarga_estado", "descarga_detalle", "url_descarga"],
      filas: Object.entries(prods).map(([k, v]) => {
        const vv = (v ?? {}) as Json;
        const pdf = (vv["pdf"] ?? {}) as Json;
        const job = (vv["descarga_shp"] ?? {}) as Json;
        return [k, vv["capa"], pdf["bytes"], pdf["sha256"], job["estado"], job["detalle"], job["urlDescarga"]] as Array<string | number | null>;
      }),
    });
    const filasPat: Array<Array<string | number | null>> = [];
    for (const prod of Object.keys(capasPatricova)) {
      const c = capasPatricova[prod];
      filasPat.push([prod, "objetos_cv", c.n_objetos_cv]);
      filasPat.push([prod, "recorte_municipal_n", c.n_recorte_municipal]);
      filasPat.push([prod, "recorte_municipal_m2", c.area_municipal_m2]);
      for (const [cf, dist] of Object.entries(c.valores_por_campo)) {
        for (const [valor, n] of dist.slice(0, 20)) {
          filasPat.push([prod, `cv:${cf}=${valor}`, n]);
        }
      }
    }
    if (filasPat.length > 0) {
      paquete.hojas.push({
        nombre: "patricova_recorte",
        columnas: ["producto", "metrica", "valor"],
        filas: filasPat.map((f) => [f[0], f[1], f[2]]),
      });
    }
    paquete.portada.push(
      ["PATRICOVA recorte (productos)", Object.keys(capasPatricova).join(", ") || "sin recorte"],
      ["PATRICOVA recorte (n polígonos / m²)", Object.entries(capasPatricova).map(([k, c]) => `${k}:${c.n_recorte_municipal}/${c.area_municipal_m2}`).join(" ") || "—"],
    );
  }
  paquete.hojas.push({
    nombre: "escenarios_raster",
    columnas: ["capa", "estado", "bytes_png", "detalle"],
    filas: (((campo(informe.escenarios, "muestras_getmap") ?? []) as unknown[]) as Array<Record<string, unknown>>).map((m) => [m["capa"], m["estado"], m["bytes"], m["url"]] as Array<string | number | null>),
  });
  const exp = informe.exposicion;
  const bandas = (campo(exp, "bandas_distancia_m") ?? {}) as Json;
  paquete.hojas.push({
    nombre: "exposicion",
    columnas: ["metrica", "valor"],
    filas: campo(exp, "estado") === "CONSULTA_VALIDA"
      ? [
        ["inventario_total", campo(exp, "n_inventario_total")],
        ["inventario_con_punto", campo(exp, "n_inventario_con_punto")],
        ["corredores_hidro", campo(exp, "n_corredores_hidro")],
        ["a_menos_de_50m", campo(bandas, "lt50")],
        ["entre_50_y_100m", campo(bandas, "lt100")],
        ["entre_100_y_250m", campo(bandas, "lt250")],
        ["resto", campo(bandas, "resto")],
      ] as Array<Array<string | number | null>>
      : [["estado", campo(exp, "estado")], ["detalle", campo(exp, "detalle")]] as Array<Array<string | number | null>>,
  });

  const xlsx = join(dir, `${base}.xlsx`);
  await escribirExcel(paquete, xlsx);

  // GeoJSON + GPKG coherentes (mismas entidades que el Excel).
  const geoDe = (c: CapaHidroInforme): TramoRecortado[] => c.geometrias ?? [];
  const aFeat = (r: TramoRecortado, capa: string): FeatureGPKG => ({
    geom: r.geometria_original as GeoJSON.Geometry,
    propiedades: { id_origen: r.id_origen, local_id: r.localId, nombre: r.nombre, capa, intersecta: r.intersecta ? 1 : 0, long_original_m: r.longitud_original_m, long_municipal_m: r.longitud_municipal_m },
  });
  const featsWC = geoDe(wc).filter((r) => r.geometria_original).map((r) => aFeat(r, "Watercourse"));
  const featsWL = geoDe(wl).filter((r) => r.geometria_original).map((r) => aFeat(r, "WatercourseLink"));
  const featsRec: FeatureGPKG[] = [...geoDe(wc), ...geoDe(wl)]
    .filter((r) => r.geometria_recorte && r.geometria_original)
    .map((r) => ({
      geom: r.geometria_recorte as GeoJSON.Geometry,
      propiedades: { id_origen: r.id_origen, local_id: r.localId, nombre: r.nombre, long_municipal_m: r.longitud_municipal_m },
    }));
  const columnas = ["id_origen", "local_id", "nombre", "capa", "intersecta", "long_original_m", "long_municipal_m"];
  const capasGeo: Array<{ capa: string; features: FeatureGPKG[] }> = [
    { capa: "hidro_original", features: [...featsWC, ...featsWL] },
    { capa: "hidro_recorte_municipal", features: featsRec },
  ];
  const capasGpkg: Array<{ capa: string; descripcion: string; columnas: string[]; features: FeatureGPKG[] }> = [
    { capa: "hidro_original", descripcion: `Fase 2A ${nombre} (${ine}): objetos originales IGN`, columnas, features: [...featsWC, ...featsWL] },
    {
      capa: "hidro_recorte_municipal", descripcion: `Fase 2A ${nombre} (${ine}): recorte municipal`,
      columnas: ["id_origen", "local_id", "nombre", "long_municipal_m"],
      features: featsRec.map((f) => ({
        geom: f.geom,
        propiedades: {
          id_origen: String(f.propiedades["id_origen"] ?? ""), local_id: typeof f.propiedades["local_id"] === "string" ? (f.propiedades["local_id"] as string) : null,
          nombre: typeof f.propiedades["nombre"] === "string" ? (f.propiedades["nombre"] as string) : null, long_municipal_m: Number(f.propiedades["long_municipal_m"] ?? 0),
        },
      })),
    },
  ];
  // Capas PATRICOVA recortadas (una por producto; campos publicados tal cual).
  const nombresCapasMapa = [`${base}_hidro_original.geojson`, `${base}_hidro_recorte_municipal.geojson`];
  for (const prod of Object.keys(capasPatricova)) {
    const rec = capasPatricova[prod].recorte.filter((x) => x.geometria);
    if (rec.length === 0) continue;
    const colsBase = capasPatricova[prod].campos.slice(0, 12);
    const cols = ["id", ...colsBase, "area_municipal_m2"];
    const feats: FeatureGPKG[] = rec.map((x) => {
      const props: Record<string, string | number | boolean | null> = { id: x.id, area_municipal_m2: x.area_municipal_m2 };
      for (const c of colsBase) {
        const v = x.campos[c];
        props[c] = typeof v === "string" || typeof v === "number" ? v : null;
      }
      return { geom: x.geometria as GeoJSON.Geometry, propiedades: props };
    });
    capasGeo.push({ capa: `patricova_${prod}`, features: feats });
    capasGpkg.push({ capa: `patricova_${prod}`, descripcion: `Fase 2A ${nombre} (${ine}): PATRICOVA ${prod} recorte municipal (origen GVA)`, columnas: cols, features: feats });
    nombresCapasMapa.push(`${base}_patricova_${prod}.geojson`);
  }
  const geojson = escribirGeoJSON(dir, base, capasGeo);
  const gpkg = escribirGPKG(dir, base, capasGpkg);

  // Paridad: el Excel describe los mismos objetos que los recuentos; el
  // GeoJSON/GPKG, el mismo subconjunto con geometría (los sin geometría no
  // se pueden dibujar y se cuentan aparte, no se inventan).
  const nExcel = (wc.recorte?.length ?? 0) + (wl.recorte?.length ?? 0);
  const nGeo = featsWC.length + featsWL.length;
  const nSinGeom = nExcel - nGeo;
  if (nExcel !== (wc.recuentos.n_objetos + wl.recuentos.n_objetos)) {
    throw new Error(`Incoherencia de exportación: Excel ${nExcel} ≠ recuentos ${wc.recuentos.n_objetos + wl.recuentos.n_objetos}`);
  }

  const mapa = escribirMapa(dir, base, `Fase 2A — ${nombre} (${ine})`, paquete.centroMapa,
    nombresCapasMapa,
    termino ? `${nombre}_${ine}_limite.geojson` : null);

  return { xlsx, geojson, gpkg, mapa, paridad_ok: true, n_objetos: nExcel, n_sin_geometria: nSinGeom, n_recortes: featsRec.length };
}

function evidenciasDe(limite: Json, fuente: string): Array<Array<string | number | null>> {
  const evs = (campo(limite, "evidencias") ?? []) as Array<Record<string, unknown>>;
  return evs.map((e) => [fuente, e["estado"], e["detalle"], e["url"]] as Array<string | number | null>);
}

function resumen(i: Informe): string {
  const wc = i.hidrografia["hy-p:Watercourse"]?.recuentos;
  return [
    `municipio=${i.municipio} (${i.ine})`,
    `limite=${String(campo(i.limite, "estado"))}`,
    `wc=${wc?.n_objetos ?? "?"}/${wc?.n_intersectan_termino ?? "?"}`,
    `patricova=${String(campo(i.patricova, "estado"))}`,
    `esc_vectorial=${String(campo(i.escenarios, "estado_vectorial"))}`,
    `expo=${String(campo(i.exposicion, "estado"))}`,
  ].join(" | ");
}

function aMarkdown(i: Informe): string {
  const L: string[] = [];
  L.push(`# Fase 2A — ${i.municipio} (${i.ine}) — ${i.snapshot_utc}`);
  L.push("");
  L.push(`- Límite: ${String(campo(i.limite, "estado"))} — ${String(campo(i.limite, "detalle") ?? campo(i.limite, "ruta_codigo") ?? "")}`);
  const h = i.hidrografia;
  for (const k of ["hy-p:Watercourse", "hy-n:WatercourseLink"]) {
    const c = h[k];
    L.push(`- ${k}: miembros=${c?.recuentos?.n_objetos} con_nombre=${c?.recuentos?.n_con_nombre} nombres_distintos=${c?.recuentos?.n_nombres_distintos} localid_distintos=${c?.recuentos?.n_localid_distintos} reconciliadas=no determinado intersectan=${c?.recuentos?.n_intersectan_termino} solo_bbox=${c?.recuentos?.n_solo_bbox} long_municipal_m=${c?.longitud_municipal_m} descarga_completa=${c?.descarga_completa}`);
  }
  L.push(`- PATRICOVA: ${String(campo(i.patricova, "estado"))} ${String(campo(i.patricova, "detalle") ?? "")}`);
  L.push(`- Escenarios (vectorial): ${String(campo(i.escenarios, "estado_vectorial"))}`);
  L.push(`- Exposición: ${String(campo(i.exposicion, "estado"))}`);
  L.push(`- Exportaciones: ${JSON.stringify(String(campo(i.exportaciones, "xlsx") ?? ""))}`);
  return L.join("\n") + "\n";
}

main().catch((e: unknown) => {
  console.error(`FALLO pipeline Fase 2A: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  process.exit(1);
});
