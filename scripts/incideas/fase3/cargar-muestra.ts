// Fase 3 Hito 2 — Carga de muestra Fase 1 (lotes, idempotente, reanudable).
//
//   npx tsx scripts/incideas/fase3/cargar-muestra.ts --ines 03031,30030 --dry-run
//   npx tsx scripts/incideas/fase3/cargar-muestra.ts --ines 03031,30030 --go
//
// Dry-run: imprime el plan (altas/cambios) sin escribir. --go escribe en R2
// (incideas/fase3/...) y en incideas_cobertura/snapshots. Nunca toca
// municipios.poblacion, SOCideas ni geometrías pesadas en Supabase.

import { config } from "dotenv";
import { readFileSync, existsSync } from "node:fs";
import { putBloque, type EnvoltorioBloque } from "../../../src/lib/incideas/fase3/r2";
import { registrarCobertura, registrarSnapshot, calcularSnapshot, controlClient, type EstadoBloque } from "../../../src/lib/incideas/fase3/cobertura";
import { obtenerLimite, obtenerHidro, muestraWMS, WMS_INSPIRE_INUND, BBOX_ARRANQUE } from "../fase2a/fuentes";
import { recortarTramos } from "../fase2a/geo-calc";
import { reconciliarHidro } from "../fase2a/contrato";
import { obtenerLimite3, ARRANQUE_FASE3, arranqueNominatim } from "./limite";
import { cargarPoblacion } from "./conectores/ine-poblacion";
import { cargarCombustible } from "./conectores/minetur";
import { cargarRegcess } from "./conectores/regcess";
import { cargarRecarga } from "./conectores/nap-recarga";
import { cargarAutonomico, DATASETS_FASE3, datasetAplica } from "./conectores/autonomicas";
import { cargarDepuradoras } from "./conectores/prtr";
import { cargarEducacion } from "./conectores/rcd";

config({ path: ".env.local" });

const MUESTRA = ["03031", "30030", "01030", "38038", "31201", "51001"];
const CONECTOR_VERSION = "fase3-h2-v1";

function args(): { ines: string[]; go: boolean; aprobar: boolean; solo: string[]; desdeArchivo: string | null; continuar: boolean; edicionOleada: string | null } {
  const a = process.argv.slice(2);
  const get = (n: string): string | undefined => {
    const i = a.indexOf(n);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return {
    ines: (get("--ines") ?? MUESTRA.join(",")).split(",").map((s) => s.trim()).filter(Boolean),
    go: a.includes("--go"),
    aprobar: a.includes("--aprobar-snapshot"),
    // --solo "bloque:ine,bloque:ine" para reintentos y actualización manual por bloque.
    solo: (get("--solo") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    // --desde-archivo tmp/agente-oleada1/cv.json (acepta {ines:[...]} o {provincias:{...:[...]}})
    desdeArchivo: get("--desde-archivo") ?? null,
    // --continuar: omite los pares ya cargados con la misma edición.
    continuar: a.includes("--continuar"),
    // --edicion-oleada ID: fija la edición de fuentes continuas (combustible, recarga)
    // para que las reejecuciones actualicen la misma fila en lugar de duplicarla.
    edicionOleada: get("--edicion-oleada") ?? null,
  };
}

interface NombreProv {
  ine: string;
  nombre: string;
  provincia: string;
  lon: number | null;
  lat: number | null;
}

async function nombresProvincias(ines: string[]): Promise<Map<string, NombreProv>> {
  const c = controlClient();
  const { data, error } = await c.from("municipios").select("codigo_ine,nombre,geom,provincias!inner(nombre)").in("codigo_ine", ines);
  if (error) throw new Error(`municipios: ${error.message}`);
  const mapa = new Map<string, NombreProv>();
  for (const r of (data ?? []) as Array<{ codigo_ine: string; nombre: string; geom?: { coordinates?: [number, number] }; provincias: { nombre: string } | Array<{ nombre: string }> }>) {
    const prov = Array.isArray(r.provincias) ? r.provincias[0]?.nombre : r.provincias?.nombre;
    const coords = r.geom?.coordinates;
    mapa.set(r.codigo_ine, {
      ine: r.codigo_ine,
      nombre: r.nombre,
      provincia: prov ?? "",
      lon: Array.isArray(coords) ? coords[0] ?? null : null,
      lat: Array.isArray(coords) ? coords[1] ?? null : null,
    });
  }
  return mapa;
}

/** BBOX de arranque desde el punto municipal (+-0,06°, se refina con el polígono real). */
function arranqueDesdeCentro(np: NombreProv): { minLon: number; minLat: number; maxLon: number; maxLat: number } | null {
  if (np.lon === null || np.lat === null) return null;
  return { minLon: np.lon - 0.06, minLat: np.lat - 0.06, maxLon: np.lon + 0.06, maxLat: np.lat + 0.06 };
}

interface PlanItem {
  ine: string;
  bloque: string;
  fuente: string;
  edicion: string;
  estado: EstadoBloque;
  n: number;
  nota: string;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const arg0 = args();
  let ines = arg0.ines;
  const { go, aprobar, solo, desdeArchivo, continuar, edicionOleada } = arg0;
  if (desdeArchivo) {
    const crudo = JSON.parse(readFileSync(desdeArchivo, "utf8")) as { ines?: string[]; provincias?: Record<string, string[]> };
    if (Array.isArray(crudo.ines)) ines = crudo.ines;
    else if (crudo.provincias) ines = Object.values(crudo.provincias).flat();
  }
  const toca = (ine: string, bloque: string): boolean =>
    solo.length === 0 || solo.includes(`${bloque}:${ine}`);
  const basePublica =
    process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ||
    process.env.SOCIDEAS_R2_PUBLIC_BASE ||
    "https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev";
  const N = await nombresProvincias(ines);
  const plan: PlanItem[] = [];
  const paraSubir: Array<{ item: PlanItem; env: EnvoltorioBloque<unknown> }> = [];
  // Contadores del lote (antes del bucle: escribirLote los usa por municipio).
  let ok = 0;
  let fallos = 0;

  const env = <T,>(bloque: string, ine: string, fuente: string, edicion: string, licencia: string, url: string, sha: string | null, objetos: T[]): EnvoltorioBloque<T> => ({
    bloque, municipio_ine: ine, fuente, edicion, obtenido_en: new Date().toISOString(), licencia, url_evidencia: url, sha256_origen: sha, objetos,
  });

  for (const ine of ines) {
    const np = N.get(ine);
    if (!np) {
      plan.push({ ine, bloque: "*", fuente: "", edicion: "", estado: "sin_cobertura", n: 0, nota: `Municipio ${ine} no encontrado en municipios.` });
      continue;
    }
    // --continuar: pares ya cargados con la misma edición no se re-descargan.
    const vistos = continuar ? await cargadosPrevios(ine) : new Map<string, { edicion: string; n: number }>();
    const prev = (bloque: string, fuente: string, edicion: string | null): { edicion: string; n: number } | null => {
      if (edicion !== null) return vistos.get(`${bloque}|${fuente}|${edicion}`) ?? null;
      for (const [k, v] of vistos) {
        if (k.startsWith(`${bloque}|${fuente}|`)) return v;
      }
      return null;
    };
    const anotarYaCargado = (bloque: string, fuente: string, v: { edicion: string; n: number }): void => {
      plan.push({ ine, bloque, fuente, edicion: v.edicion, estado: "cargado", n: v.n, nota: "ya cargado (reanudación, sin re-descarga)" });
    };
    // 1. límites (IGN AU; Fase 2A para 03031/30030, auxiliar E para el resto)
    const yaLim = prev("limites", "ign-au", null);
    if (yaLim) {
      anotarYaCargado("limites", "ign-au", yaLim);
    } else
    try {
      const rFase2A = ine === "03031" || ine === "30030" ? await obtenerLimite(ine as "03031") : null;
      // Arranque: estático verificado primero; si no hay, punto municipal
      // de la BD; si el servicio no confirma con coincidencia exacta,
      // bbox de Nominatim SOLO para encuadrar (la geometría final es la
      // oficial o no hay). Sin adivinar.
      const arr = ARRANQUE_FASE3[ine] ?? arranqueDesdeCentro(np) ?? BBOX_ARRANQUE["03031"];
      let rAux = rFase2A === null ? await obtenerLimite3(ine, arr) : null;
      if (rAux !== null && "error" in rAux) {
        const bbNominatim = await arranqueNominatim(ine, np.nombre, np.provincia);
        if (bbNominatim) rAux = await obtenerLimite3(ine, bbNominatim);
      }
      const ok = rFase2A !== null && !("error" in rFase2A)
        ? { geometria: rFase2A.feature.geometry, rutaCodigo: rFase2A.rutaCodigo, bbox: rFase2A.bbox }
        : rAux !== null && !("error" in rAux)
          ? rAux
          : null;
      const err = rFase2A !== null && "error" in rFase2A ? rFase2A.error : rAux !== null && "error" in rAux ? rAux.error : null;
      if (!ok || err) {
        const detalle = err ? err.detalle : "sin límite";
        const estado = err && err.estado === "VALIDA_CERO" ? "cero_resultados" : "fuente_caida";
        plan.push({ ine, bloque: "limites", fuente: "ign-au", edicion: "", estado, n: 0, nota: detalle.slice(0, 200) });
      } else {
        const e = env("limites", ine, "ign-au", "continua", "CC BY 4.0", "https://www.ign.es/wfs-inspire/unidades-administrativas", null, [{ ruta_codigo: ok.rutaCodigo, bbox: ok.bbox, geometria: ok.geometria }]);
        plan.push({ ine, bloque: "limites", fuente: "ign-au", edicion: "continua", estado: "cargado", n: 1, nota: ok.rutaCodigo.slice(0, 160) });
        paraSubir.push({ item: plan[plan.length - 1], env: e });
      }
    } catch (e: unknown) {
      plan.push({ ine, bloque: "limites", fuente: "ign-au", edicion: "", estado: "fuente_caida", n: 0, nota: String(e instanceof Error ? e.message : e).slice(0, 160) });
    }
    await sleep(500);

    // 2. población (R2 SOCideas, sin tocar municipios.poblacion)
    const yaPob = prev("poblacion", "ine-dpop", null);
    if (yaPob) {
      anotarYaCargado("poblacion", "ine-dpop", yaPob);
    } else
    try {
      const p = await cargarPoblacion(ine, basePublica);
      const estado: EstadoBloque = p.objetos.length > 0 ? "cargado" : "sin_cobertura";
      plan.push({ ine, bloque: "poblacion", fuente: "ine-dpop", edicion: p.edicion, estado, n: p.objetos.length, nota: p.nota.slice(0, 200) });
      if (p.objetos.length > 0) {
        paraSubir.push({ item: plan[plan.length - 1], env: env("poblacion", ine, "ine-dpop", p.edicion, "abierta INE", "https://servicios.ine.es/wstempus/", null, p.objetos) });
      }
    } catch (e: unknown) {
      plan.push({ ine, bloque: "poblacion", fuente: "ine-dpop", edicion: "", estado: "fuente_caida", n: 0, nota: String(e instanceof Error ? e.message : e).slice(0, 160) });
    }

    // 3. combustible (MINETUR por IDMunicipio)
    const yaCom = prev("combustible", "minetur-carburantes", null);
    if (yaCom) {
      anotarYaCargado("combustible", "minetur-carburantes", yaCom);
    } else
    try {
      const provId = await idProvinciaMinetur(np.provincia);
      const c = provId ? await cargarCombustible(ine, np.nombre, provId) : { objetos: [], edicion: "", shaOrigen: null as string | null, resuelto: false, nota: `Provincia «${np.provincia}» sin ID MINETUR.` };
      if (edicionOleada && c.objetos.length > 0) c.edicion = edicionOleada;
      const estado: EstadoBloque = c.objetos.length > 0 ? "cargado" : !c.resuelto ? "sin_cobertura" : "cero_resultados";
      plan.push({ ine, bloque: "combustible", fuente: "minetur-carburantes", edicion: c.edicion, estado, n: c.objetos.length, nota: c.nota.slice(0, 200) });
      if (c.objetos.length > 0) {
        paraSubir.push({ item: plan[plan.length - 1], env: env("combustible", ine, "minetur-carburantes", c.edicion, "Ley 37/2007", "https://geoportalgasolineras.es/", c.shaOrigen, c.objetos) });
      }
    } catch (e: unknown) {
      plan.push({ ine, bloque: "combustible", fuente: "minetur-carburantes", edicion: "", estado: "fuente_caida", n: 0, nota: String(e instanceof Error ? e.message : e).slice(0, 160) });
    }
    await sleep(500);

    // 4-5. sanidad + farmacias (REGCESS nacional + refuerzo autonómico verificado)
    for (const [tipo, bloque, fuente] of [["C1", "sanidad", "regcess"], ["E", "farmacias", "regcess-e"]] as const) {
      const yaRF = prev(bloque, fuente, null);
      if (yaRF) {
        anotarYaCargado(bloque, fuente, yaRF);
        continue;
      }
      try {
        const r = await cargarRegcess(tipo, np.nombre, np.provincia);
        const estado: EstadoBloque = r.objetos.length > 0 ? "cargado" : "cero_resultados";
        plan.push({ ine, bloque, fuente, edicion: r.edicion, estado, n: r.objetos.length, nota: `${r.leidos} filas nacionales; ${r.objetos.length} del municipio (nombres personales excluidos).` });
        if (r.objetos.length > 0) {
          paraSubir.push({ item: plan[plan.length - 1], env: env(bloque, ine, fuente, r.edicion, "Información pública (citar Ministerio de Sanidad)", "https://regcess.mscbs.es/", r.shaOrigen, r.objetos) });
        }
      } catch (e: unknown) {
        plan.push({ ine, bloque, fuente, edicion: "", estado: "fuente_caida", n: 0, nota: String(e instanceof Error ? e.message : e).slice(0, 160) });
      }
    }
    // 4b-5b. Refuerzo autonómico (datasets CKAN verificados por página).
    for (const ds of DATASETS_FASE3.filter((d) => datasetAplica(d, ine, np.provincia) && (d.bloque === "sanidad" || d.bloque === "farmacias" || d.bloque === "educacion"))) {
      if (!toca(ine, ds.bloque)) continue;
      const yaAu = prev(ds.bloque, ds.fuente, null);
      if (yaAu) {
        anotarYaCargado(ds.bloque, ds.fuente, yaAu);
        continue;
      }
      try {
        const a = await cargarAutonomico(ds, np.nombre);
        const estado: EstadoBloque = a.objetos.length > 0 ? "cargado" : "cero_resultados";
        plan.push({ ine, bloque: ds.bloque, fuente: ds.fuente, edicion: a.edicion, estado, n: a.objetos.length, nota: a.nota.slice(0, 220) });
        if (a.objetos.length > 0) {
          paraSubir.push({ item: plan[plan.length - 1], env: env(ds.bloque, ine, ds.fuente, a.edicion || "sin-fecha", ds.licencia, ds.ckanApi, null, a.objetos) });
        }
      } catch (e: unknown) {
        plan.push({ ine, bloque: ds.bloque, fuente: ds.fuente, edicion: "", estado: "fuente_caida", n: 0, nota: String(e instanceof Error ? e.message : e).slice(0, 160) });
      }
      await sleep(500);
    }

    // 6. recarga (NAP)
    const yaRec = prev("recarga", "nap-recarga", null);
    if (yaRec) {
      anotarYaCargado("recarga", "nap-recarga", yaRec);
    } else
    try {
      const r = await cargarRecarga(np.nombre, np.provincia);
      if (edicionOleada) r.edicion = edicionOleada;
      const estado: EstadoBloque = r.objetos.length > 0 ? "cargado" : "cero_resultados";
      plan.push({ ine, bloque: "recarga", fuente: "nap-recarga", edicion: r.edicion, estado, n: r.objetos.length, nota: `${r.leidos} sites nacionales revisados.` });
      if (r.objetos.length > 0) {
        paraSubir.push({ item: plan[plan.length - 1], env: env("recarga", ine, "nap-recarga", r.edicion, "CC BY (NAP)", "https://nap.dgt.es/", r.shaOrigen, r.objetos) });
      }
    } catch (e: unknown) {
      plan.push({ ine, bloque: "recarga", fuente: "nap-recarga", edicion: "", estado: "fuente_caida", n: 0, nota: String(e instanceof Error ? e.message : e).slice(0, 160) });
    }

    // 7. depuradoras (PRTR parcial)
    const yaDep = prev("depuradoras", "prtr", null);
    if (yaDep) {
      anotarYaCargado("depuradoras", "prtr", yaDep);
    } else
    try {
      const d = await cargarDepuradoras(np.nombre);
      const estado: EstadoBloque = d.objetos.length > 0 ? "cargado_parcial" : "sin_cobertura";
      plan.push({ ine, bloque: "depuradoras", fuente: "prtr", edicion: d.edicion, estado, n: d.objetos.length, nota: d.nota.slice(0, 220) });
      if (d.objetos.length > 0) {
        paraSubir.push({ item: plan[plan.length - 1], env: env("depuradoras", ine, "prtr", d.edicion, "Información ambiental pública (PRTR)", "https://prtr-es.miteco.gob.es/", null, d.objetos) });
      }
    } catch (e: unknown) {
      plan.push({ ine, bloque: "depuradoras", fuente: "prtr", edicion: "", estado: "fuente_caida", n: 0, nota: String(e instanceof Error ? e.message : e).slice(0, 160) });
    }
    await sleep(500);

    // 8. educación (RCD)
    const yaEdu = prev("educacion", "rcd", null);
    if (yaEdu) {
      anotarYaCargado("educacion", "rcd", yaEdu);
    } else
    try {
      const e = await cargarEducacion(np.nombre, np.provincia);
      const estado: EstadoBloque = e.objetos.length > 0 ? "cargado_parcial" : e.nota.includes("inaccesible") ? "fuente_caida" : "cero_resultados";
      plan.push({ ine, bloque: "educacion", fuente: e.fuente, edicion: e.edicion, estado, n: e.objetos.length, nota: e.nota.slice(0, 220) });
      if (e.objetos.length > 0) {
        paraSubir.push({ item: plan[plan.length - 1], env: env("educacion", ine, e.fuente, e.edicion, "Consulta pública informativa (RD 276/2003)", "https://www.educacion.gob.es/centros", null, e.objetos) });
      }
    } catch (e: unknown) {
      plan.push({ ine, bloque: "educacion", fuente: "rcd", edicion: "", estado: "fuente_caida", n: 0, nota: String(e instanceof Error ? e.message : e).slice(0, 160) });
    }
    await sleep(500);

    // 9-10. hidrografía + inundabilidad.
    // Benidorm/Murcia: artefactos Fase 2A ya generados. Resto: misma cadena
    // con los módulos Fase 2A (sin modificarlos) + bbox del límite recién
    // obtenido. PATRICOVA solo sería aplicable en la Comunitat Valenciana.
    const f2aRutas = {
      hidro: `salida/fase2a/${ine}/informe.json`,
    };
    if (existsSync(f2aRutas.hidro) && (ine === "03031" || ine === "30030")) {
      const yaH = prev("hidrografia", "ign-hidro", null);
      const yaI = prev("inundabilidad", "snczi-inspire", null);
      if (yaH && yaI) {
        anotarYaCargado("hidrografia", "ign-hidro", yaH);
        anotarYaCargado("inundabilidad", "snczi-inspire", yaI);
      } else {
      const inf = JSON.parse(readFileSync(f2aRutas.hidro, "utf8")) as Record<string, unknown>;
      const hid = (inf["hidrografia"] ?? {}) as Record<string, { recuentos?: { n_objetos?: number }; recorte?: unknown[] }>;
      const tramos = [
        ...((hid["hy-p:Watercourse"]?.recorte ?? []) as unknown[]),
        ...((hid["hy-n:WatercourseLink"]?.recorte ?? []) as unknown[]),
      ];
      const edicion = String((inf["snapshot_utc"] as string) ?? "").slice(0, 10);
      const itemH: PlanItem = { ine, bloque: "hidrografia", fuente: "ign-hidro", edicion, estado: "cargado", n: tramos.length, nota: `Fase 2A ${String(inf["snapshot_utc"] ?? "")} (artefactos en salida/fase2a/${ine}/).` };
      plan.push(itemH);
      paraSubir.push({ item: itemH, env: env("hidrografia", ine, "ign-hidro", edicion, "CC BY 4.0", "https://servicios.idee.es/wfs-inspire/hidrografia", null, tramos) });
      const pat = ((inf["patricova"] ?? {}) as { estado?: string }).estado ?? "";
      const itemI: PlanItem = { ine, bloque: "inundabilidad", fuente: "snczi-inspire", edicion, estado: "cargado", n: 1, nota: `Fase 2A ${String(inf["snapshot_utc"] ?? "")} (1 ficha resumen: raster T10/T100/T500 + PATRICOVA ${pat}).` };
      plan.push(itemI);
      paraSubir.push({
        item: itemI,
        env: env("inundabilidad", ine, "snczi-inspire", edicion, "CC BY 4.0", "https://servicios.idee.es/wms-inspire/riesgos-naturales/inundaciones", null, [
          { escenarios: ["T10", "T100", "T500"], tipo: "raster", patricova_estado: pat },
        ]),
      });
      }
    } else {
      // Término: del env de límites en memoria o del R2 ya publicado
      // (imprescindible en reanudación, donde el tramo de límites se omite).
      const limEnv = paraSubir.find((p) => p.item.bloque === "limites" && p.item.ine === ine);
      const limObjMem = (limEnv?.env.objetos?.[0] ?? null) as { bbox?: { minLon: number; minLat: number; maxLon: number; maxLat: number }; geometria?: GeoJSON.Geometry } | null;
      let limObj = limObjMem?.geometria && limObjMem?.bbox ? limObjMem : null;
      if (!limObj) {
        try {
          const r = await fetch(`${basePublica}/incideas/fase3/limites/continua/${ine}.json`, { headers: { "User-Agent": "INCideas-Fase3/0.1" } });
          if (r.ok) {
            const envLim = (await r.json()) as { objetos?: Array<{ bbox?: { minLon: number; minLat: number; maxLon: number; maxLat: number }; geometria?: GeoJSON.Geometry }> };
            const o = envLim.objetos?.[0];
            if (o?.geometria && o?.bbox) limObj = { bbox: o.bbox, geometria: o.geometria };
          }
        } catch { /* sin término no hay recorte */ }
      }
      if (!limObj?.geometria || !limObj?.bbox) {
        const limEstado = plan.find((p) => p.ine === ine && p.bloque === "limites")?.estado;
        plan.push({ ine, bloque: "hidrografia", fuente: "ign-hidro", edicion: "", estado: limEstado === "cargado" ? "fuente_caida" : "sin_cobertura", n: 0, nota: "Sin término municipal no hay recorte." });
        plan.push({ ine, bloque: "inundabilidad", fuente: "snczi-inspire", edicion: "", estado: "sin_cobertura", n: 0, nota: "Sin término municipal." });
      } else {
        const yaHD = prev("hidrografia", "ign-hidro", "IGR-v0");
        const yaID = prev("inundabilidad", "snczi-inspire", "continua");
        if (yaHD) anotarYaCargado("hidrografia", "ign-hidro", yaHD);
        else {
        try {
          const bb = {
            minLon: limObj.bbox.minLon - 0.01, minLat: limObj.bbox.minLat - 0.01,
            maxLon: limObj.bbox.maxLon + 0.01, maxLat: limObj.bbox.maxLat + 0.01,
          };
          const tramos: Array<{ id_origen: string; local_id: string | null; nombre: string | null; intersecta: boolean; longitud_original_m: number; longitud_municipal_m: number }> = [];
          let totalSrv = 0;
          let descargados = 0;
          for (const tipo of ["hy-p:Watercourse", "hy-n:WatercourseLink"] as const) {
            let capa: Awaited<ReturnType<typeof obtenerHidro>> | null = null;
            let ultimoError: unknown = null;
            // El total del servidor fluctúa entre peticiones (observado:
            // 291→0→144 en el mismo BBOX) y la red falla en oleadas: hasta
            // 3 intentos con espera creciente antes de aceptar un cero o
            // marcar la fuente como caída.
            for (let intento = 0; intento < 3; intento++) {
              if (intento > 0) await sleep(3000 * intento);
              try {
                capa = await obtenerHidro(tipo, bb);
                if ((capa.totalServidor ?? 0) > 0) break;
              } catch (e: unknown) {
                ultimoError = e;
                capa = null;
              }
            }
            if (!capa) throw ultimoError ?? new Error("hidrografía sin respuesta tras reintentos");
            totalSrv += capa.totalServidor ?? 0;
            descargados += capa.objetos.length;
            const rec = recortarTramos(
              capa.objetos.map((o) => ({ id: o.id, localId: o.localId, nombre: o.nombre, geometria: o.geometria })),
              limObj.geometria
            );
            const r = reconciliarHidro({ objetos: rec.map((x) => ({ id: x.id_origen, localId: x.localId, nombre: x.nombre, intersecta: x.intersecta })) });
            void r;
            for (const x of rec) {
              tramos.push({ id_origen: x.id_origen, local_id: x.localId, nombre: x.nombre, intersecta: x.intersecta, longitud_original_m: x.longitud_original_m, longitud_municipal_m: x.longitud_municipal_m });
            }
            await sleep(500);
          }
          const completa = totalSrv > 0 && descargados >= totalSrv;
          const vacioTotal = totalSrv === 0 && descargados === 0;
          plan.push({ ine, bloque: "hidrografia", fuente: "ign-hidro", edicion: "IGR-v0", estado: vacioTotal ? "cero_resultados" : completa ? "cargado" : "cargado_parcial", n: tramos.length, nota: vacioTotal ? "El servidor responde 0 coincidencias (fluctúa entre peticiones; hasta 3 intentos)." : `${descargados}/${totalSrv} miembros del BBOX.` });
          if (tramos.length > 0) {
            paraSubir.push({ item: plan[plan.length - 1], env: env("hidrografia", ine, "ign-hidro", "IGR-v0", "CC BY 4.0", "https://servicios.idee.es/wfs-inspire/hidrografia", null, tramos) });
          }
        } catch (e: unknown) {
          plan.push({ ine, bloque: "hidrografia", fuente: "ign-hidro", edicion: "", estado: "fuente_caida", n: 0, nota: String(e instanceof Error ? e.message : e).slice(0, 160) });
        }
        }
        if (yaID) {
          anotarYaCargado("inundabilidad", "snczi-inspire", yaID);
        } else
        try {
          const muestras = [];
          for (const capa of ["NZ.Flood.FluvialT10", "NZ.Flood.FluvialT100", "NZ.Flood.FluvialT500"]) {
            muestras.push(await muestraWMS(WMS_INSPIRE_INUND, capa, limObj.bbox, 200, 200));
          }
          const ok = muestras.filter((m) => m.estado === "CONSULTA_VALIDA").length;
          plan.push({ ine, bloque: "inundabilidad", fuente: "snczi-inspire", edicion: "continua", estado: ok === 3 ? "cargado" : ok > 0 ? "cargado_parcial" : "fuente_caida", n: ok, nota: `Raster T10/T100/T500: ${ok}/3 mapas.` });
          if (ok > 0) {
            paraSubir.push({ item: plan[plan.length - 1], env: env("inundabilidad", ine, "snczi-inspire", "continua", "CC BY 4.0", WMS_INSPIRE_INUND, null, muestras.map((m) => ({ capa: m.capa, estado: m.estado, bytes: m.bytes }))) });
          }
        } catch (e: unknown) {
          plan.push({ ine, bloque: "inundabilidad", fuente: "snczi-inspire", edicion: "", estado: "fuente_caida", n: 0, nota: String(e instanceof Error ? e.message : e).slice(0, 160) });
        }
      }
    }

    // 11. PATRICOVA por municipio (solo Comunitat Valenciana): recorte de los
    // SHP oficiales ya verificados (un shapefile por producto, sin hojas).
    if (await esComunitatValenciana(np.provincia)) {
      const yaP = prev("inundabilidad", "patricova", "vigente");
      if (yaP) {
        anotarYaCargado("inundabilidad", "patricova", yaP);
      } else {
        // Término: del env de límites en memoria o del R2 ya publicado.
        let termino: GeoJSON.Geometry | null = null;
        let bb: { minLon: number; minLat: number; maxLon: number; maxLat: number } | null = null;
        const le = paraSubir.find((p) => p.item.bloque === "limites" && p.item.ine === ine);
        const lo = (le?.env.objetos?.[0] ?? null) as { bbox?: { minLon: number; minLat: number; maxLon: number; maxLat: number }; geometria?: GeoJSON.Geometry } | null;
        if (lo?.geometria && lo?.bbox) {
          termino = lo.geometria;
          bb = lo.bbox;
        } else {
          try {
            const r = await fetch(`${basePublica}/incideas/fase3/limites/continua/${ine}.json`, { headers: { "User-Agent": "INCideas-Fase3/0.1" } });
            if (r.ok) {
              const envLim = (await r.json()) as { objetos?: Array<{ bbox?: { minLon: number; minLat: number; maxLon: number; maxLat: number }; geometria?: GeoJSON.Geometry }> };
              const o = envLim.objetos?.[0];
              if (o?.geometria && o?.bbox) {
                termino = o.geometria;
                bb = o.bbox;
              }
            }
          } catch { /* sin término no hay recorte */ }
        }
        if (!termino || !bb) {
          plan.push({ ine, bloque: "inundabilidad", fuente: "patricova", edicion: "", estado: "sin_cobertura", n: 0, nota: "Sin término municipal no hay recorte." });
        } else {
          try {
            const zips = await zipsPatricova();
            if (!zips) {
              plan.push({ ine, bloque: "inundabilidad", fuente: "patricova", edicion: "", estado: "fuente_caida", n: 0, nota: "Tarea de descarga ICV sin completar en el sondeo acotado." });
            } else {
              const { leerYRecortar } = await import("../fase2a/patricova-shp");
              const productos: Array<{ producto: string; n: number; m2: number; poligonos: unknown[] }> = [];
              for (const [clave, z] of zips) {
                const capa = await leerYRecortar(clave, z.buf, termino, bb);
                productos.push({
                  producto: clave,
                  n: capa.recorte_municipal.length,
                  m2: Math.round(capa.recorte_municipal.reduce((s, x) => s + x.area_municipal_m2, 0) * 100) / 100,
                  poligonos: capa.recorte_municipal,
                });
              }
              const n = productos.reduce((s, p) => s + p.n, 0);
              plan.push({ ine, bloque: "inundabilidad", fuente: "patricova", edicion: "vigente", estado: n > 0 ? "cargado" : "cero_resultados", n, nota: productos.map((p) => `${p.producto}:${p.n}/${p.m2}m²`).join(" ") });
              if (n > 0) {
                // Un objeto por polígono (plano): el recuento del control
                // coincide con el JSON publicado.
                const planos = productos.flatMap((p) =>
                  (p.poligonos as Array<{ id: number; campos: Record<string, string | number | null>; area_municipal_m2: number; geometria: GeoJSON.Geometry | null }>).map((x) => ({
                    producto: p.producto,
                    id: x.id,
                    area_municipal_m2: x.area_municipal_m2,
                    campos: x.campos,
                    geometria: x.geometria,
                  }))
                );
                paraSubir.push({ item: plan[plan.length - 1], env: env("inundabilidad", ine, "patricova", "vigente", "CC BY (GVA)", "https://dadesobertes.gva.es/", null, planos) });
              }
            }
          } catch (e: unknown) {
            plan.push({ ine, bloque: "inundabilidad", fuente: "patricova", edicion: "", estado: "fuente_caida", n: 0, nota: String(e instanceof Error ? e.message : e).slice(0, 160) });
          }
        }
      }
      await sleep(500);
    }
    // Escritura inmediata por municipio, también fuera de la Comunitat
    // Valenciana (libera envoltorios: con cientos de municipios el proceso
    // agota el heap si se acumula todo). La versión anterior la anidó por
    // error en el bloque PATRICOVA-CV y el resto de España no escribía.
    if (go) {
      const items = plan.filter((p) => p.ine === ine);
      const envs = paraSubir.filter((p) => p.item.ine === ine);
      await escribirLote(items, envs);
      for (let i = paraSubir.length - 1; i >= 0; i--) {
        if (paraSubir[i].item.ine === ine) paraSubir.splice(i, 1);
      }
    }
  }

  console.log(`PLAN (${go ? "ESCRITURA" : "DRY-RUN"}): ${plan.length} pares municipio×bloque`);
  for (const p of plan) {
    console.log(`  ${p.ine} ${p.bloque}: ${p.estado} n=${p.n} [${p.fuente}@${p.edicion}] ${p.nota.slice(0, 120)}`);
  }

  if (!go) {
    console.log(`Dry-run: ${paraSubir.length} escrituras R2 + cobertura pendientes. Nada escrito.`);
    return;
  }

  // Escritura por municipio (no se acumulan envoltorios en memoria: con
  // cientos de municipios el proceso agota el heap). El plan global se
  // conserva para el informe y el snapshot; los envs se liberan por ine.
  // Declarada como función (hoisting): se invoca dentro del bucle.
  // (ok/fallos viven arriba, junto al bucle, por el TDZ de let.)
  async function escribirLote(items: PlanItem[], envs: Array<{ item: PlanItem; env: EnvoltorioBloque<unknown> }>): Promise<void> {
    const porClave = new Map(envs.map((p) => [`${p.item.ine}|${p.item.bloque}|${p.item.fuente}|${p.item.edicion}`, p.env]));
    const planFiltrado = solo.length > 0 ? items.filter((p) => solo.includes(`${p.bloque}:${p.ine}`)) : items;
    for (const item of planFiltrado) {
      const e = porClave.get(`${item.ine}|${item.bloque}|${item.fuente}|${item.edicion}`);
      if (!e) {
        // Reanudación: la fila ya existe tal cual; no se reescribe (evita
        // clobber con n=0). Solo se registra lo que el plan calculó de nuevo.
        if (item.nota.includes("reanudación")) {
          ok++;
          continue;
        }
        try {
          await registrarCobertura({
            municipio: item.ine, bloque: item.bloque, fuente: item.fuente, edicion: item.edicion,
            estado: item.estado, objetos_leidos: item.n, objetos_publicados: 0,
            errores: item.estado === "fuente_caida" ? 1 : 0, reintentos: 0, version_conector: CONECTOR_VERSION, snapshot: null,
          });
          ok++;
        } catch (err: unknown) {
          fallos++;
          console.error(`  FALLO control ${item.ine}/${item.bloque}: ${String(err instanceof Error ? err.message : err).slice(0, 200)}`);
        }
        continue;
      }
      try {
        const sub = await putBloque(e.bloque, e.edicion || "sinedicion", e.municipio_ine, e);
        await registrarCobertura({
          municipio: item.ine, bloque: item.bloque, fuente: item.fuente, edicion: item.edicion,
          estado: item.estado, objetos_leidos: item.n, objetos_publicados: item.n,
          errores: 0, reintentos: 0, version_conector: CONECTOR_VERSION, snapshot: null,
        });
        console.log(`  OK ${item.ine}/${item.bloque} n=${item.n} r2=${sub.clave} (${sub.bytes} B)`);
        ok++;
      } catch (err: unknown) {
        fallos++;
        console.error(`  FALLO ${item.ine}/${item.bloque}: ${String(err instanceof Error ? err.message : err).slice(0, 200)}`);
        try {
          await registrarCobertura({
            municipio: item.ine, bloque: item.bloque, fuente: item.fuente, edicion: item.edicion,
            estado: "fuente_caida", objetos_leidos: item.n, objetos_publicados: 0,
            errores: 1, reintentos: 0, version_conector: CONECTOR_VERSION, snapshot: null,
          });
        } catch { /* el control no tumba el lote */ }
      }
      await sleep(300);
    }
  }

  if (solo.length > 0) {
    console.log(`Solo ${solo.join(", ")}: sin snapshot (ejecución parcial). Lote: ok=${ok} fallos=${fallos}.`);
    return;
  }
  const snap = calcularSnapshot(
    plan.filter((p) => p.n > 0).map((p) => ({ bloque: `${p.ine}:${p.bloque}`, fuente: p.fuente, edicion: p.edicion, n: p.n })),
    CONECTOR_VERSION
  );
  await registrarSnapshot(snap, `Muestra H2: ${ines.join(",")} ok=${ok} fallos=${fallos}`, CONECTOR_VERSION, aprobar ? "aprobada" : "borrador");
  console.log(`Snapshot ${snap} (${aprobar ? "aprobada" : "borrador"}). Lote: ok=${ok} fallos=${fallos}.`);
}

async function cargadosPrevios(ine: string): Promise<Map<string, { edicion: string; n: number }>> {
  const mapa = new Map<string, { edicion: string; n: number }>();
  try {
    const c = controlClient();
    const { data } = await c.from("incideas_cobertura").select("bloque,fuente,edicion,objetos_publicados").eq("municipio", ine).eq("estado", "cargado");
    for (const r of (data ?? []) as Array<{ bloque: string; fuente: string; edicion: string; objetos_publicados: number }>) {
      mapa.set(`${r.bloque}|${r.fuente}|${r.edicion}`, { edicion: r.edicion, n: r.objetos_publicados });
    }
  } catch { /* sin control no hay reanudación */ }
  return mapa;
}

let cacheProvinciasCV: Set<string> | null = null;

async function esComunitatValenciana(provincia: string): Promise<boolean> {
  if (!cacheProvinciasCV) {
    cacheProvinciasCV = new Set();
    try {
      const c = controlClient();
      const { data } = await c
        .from("provincias")
        .select("nombre,comunidades_autonomas!inner(nombre)");
      for (const r of (data ?? []) as Array<{ nombre: string; comunidades_autonomas: { nombre: string } | Array<{ nombre: string }> }>) {
        const ca = Array.isArray(r.comunidades_autonomas) ? r.comunidades_autonomas[0]?.nombre : r.comunidades_autonomas?.nombre;
        if (ca && /valenciana/i.test(ca)) cacheProvinciasCV.add(r.nombre);
      }
    } catch { /* sin catálogo no hay tramo CV */ }
  }
  return cacheProvinciasCV.has(provincia);
}

let cacheZipsPatricova: Map<string, Buffer> | null = null;

/** SHP oficiales ya verificados (un shapefile por producto). Descarga una vez por ejecución. */
async function zipsPatricova(): Promise<Map<string, { buf: Buffer; job: string }> | null> {
  if (cacheZipsPatricova) {
    const m = new Map<string, { buf: Buffer; job: string }>();
    for (const [k, v] of cacheZipsPatricova) m.set(k, { buf: v, job: "cache" });
    return m;
  }
  const { sondearDescargaPatricova } = await import("../fase2a/fuentes");
  const { PRODUCTOS_PATRICOVA } = await import("../fase2a/contrato");
  const out = new Map<string, { buf: Buffer; job: string }>();
  for (const p of PRODUCTOS_PATRICOVA) {
    const job = await sondearDescargaPatricova(p.clave, p.capa, 90000);
    if (job.estado !== "CONSULTA_VALIDA" || !job.urlDescarga) return null;
    const r = await fetch(job.urlDescarga, { headers: { "User-Agent": "INCideas-Fase3/0.1" } });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 1000) return null;
    out.set(p.clave, { buf, job: job.jobId ?? "" });
  }
  cacheZipsPatricova = new Map([...out].map(([k, v]) => [k, v.buf]));
  return out;
}

let cacheProvincias: Array<{ IDProvincia: string; Provincia: string }> | null = null;

async function idProvinciaMinetur(provincia: string): Promise<string | null> {
  const norm = (s: string): string =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!cacheProvincias) {
    const { fetchConReintentos } = await import("../../../src/lib/incideas/connectors/http");
    const r = await fetchConReintentos("https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/Listados/Provincias");
    const crudo = (await r.json()) as Array<{ IDProvincia?: unknown; IDPovincia?: unknown; Provincia?: unknown }>;
    // La API escribe «IDPovincia» (errata oficial); se aceptan ambas claves.
    cacheProvincias = crudo.map((p) => ({ IDProvincia: String(p.IDPovincia ?? p.IDProvincia ?? ""), Provincia: String(p.Provincia ?? "") }));
  }
  const toks = (s: string): string[] => norm(s).split(" ").filter(Boolean);
  const q = toks(provincia);
  const hits = (cacheProvincias ?? []).filter((p) => {
    const t = toks(p.Provincia);
    return q.length > 0 && t.length > 0 && (q.every((x) => t.includes(x)) || t.every((x) => q.includes(x)));
  });
  return hits.length === 1 ? hits[0].IDProvincia : null;
}

main().catch((e: unknown) => {
  console.error(`FALLO cargar-muestra: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
  process.exit(1);
});
