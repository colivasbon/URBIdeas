// INCideas — importación de la plantilla municipal (Limpieza info.xlsx).
//
// Uso:
//   npx tsx scripts/incideas/import-xlsx.ts --file "…/Limpieza info.xlsx" --ine 03031
//     → DRY-RUN (store en memoria). Reproyecta UTM 30N → WGS84 y valida.
//   npx tsx scripts/incideas/import-xlsx.ts --file "…" --ine 03031 --go
//     → Escribe en Supabase (idempotente; no marca bajas).
//
// Hojas soportadas: Núcleos_partidas, Farmacias, Enseñanza, Hoja4 (paradas de bus).
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

import { normalizeFeature, normalizeName } from "../../src/lib/incideas/pipeline/normalize";
import { validarEspacial } from "../../src/lib/incideas/pipeline/geo";
import { procesarLote } from "../../src/lib/incideas/pipeline/upsert";
import { utmToLatLng } from "../../src/lib/incideas/pipeline/utm";
import type { EjecucionContext, RawFeature } from "../../src/lib/incideas/pipeline/types";
import { depsMemoria, depsSupabase, cargarBoundaryDeBD } from "./deps";

config({ path: ".env.local" });

const FUENTE = {
  nombre: "Plantilla municipal — Limpieza info (PTM Benidorm)",
  organismo: "Ayuntamiento de Benidorm (documento de trabajo)",
  licencia: "Uso interno del proyecto",
};

const UTM_ZONE = 30;

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (n: string) => {
    const i = argv.indexOf(n);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    file: get("--file"),
    ine: get("--ine") ?? "03031",
    go: argv.includes("--go"),
  };
}

type Fila = (string | number)[];

function filas(wb: XLSX.WorkBook, hoja: string): Fila[] {
  const ws = wb.Sheets[hoja];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Fila>(ws, { header: 1, blankrows: false, defval: "" });
}

const txt = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const num = (v: unknown): number | undefined => {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(String(v).replace(/\./g, "").replace(",", ".").replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

function subcategoriaEnsenanza(tipo: string): string {
  const t = tipo.toLowerCase();
  if (t.includes("infantil y primaria") || t.includes("primaria")) return "colegio";
  if (t.includes("instituto") || t.includes("secundaria")) return "instituto";
  if (t.includes("infantil")) return "escuela_infantil";
  return "centro_formacion";
}

function construirFeatures(wb: XLSX.WorkBook): RawFeature[] {
  const out: RawFeature[] = [];

  // Núcleos, partidas, distritos y áreas
  for (const r of filas(wb, "Núcleos_partidas").slice(1)) {
    const partida = txt(r[1]);
    if (!partida) continue;
    const distrito = txt(r[2]);
    const area = txt(r[3]);
    out.push({
      // Una partida puede abarcar varias áreas: el área forma parte de la clave.
      id_origen: `partida|${distrito}|${partida}|${area}`,
      nombre: partida,
      categoria: "territorio",
      subcategoria: "partida",
      fuente: FUENTE,
      metodo_obtencion: "plantilla_municipal",
      atributos: { distrito, area },
    });
  }

  // Farmacias
  for (const r of filas(wb, "Farmacias").slice(1)) {
    const nombre = txt(r[0]);
    if (!nombre || nombre.toLowerCase().startsWith("farmacia (nombre)")) continue;
    const direccion = txt(r[1]);
    const titular = txt(r[2]);
    // La mayoría de filas se llaman solo «Farmacia»: la clave es la dirección.
    const generico = normalizeName(nombre) === "farmacia";
    out.push({
      id_origen: `farmacia|${normalizeName(direccion) || normalizeName(nombre)}`,
      nombre: generico
        ? `Farmacia · ${direccion || "sin dirección"}`
        : nombre.startsWith("Farmacia")
          ? nombre
          : `Farmacia ${nombre}`,
      categoria: "equipamientos",
      subcategoria: "farmacia",
      direccion: direccion || undefined,
      gestor: titular || undefined,
      titularidad: "privada",
      fuente: FUENTE,
      metodo_obtencion: "plantilla_municipal",
      atributos: { titular },
    });
  }

  // Centros educativos
  for (const r of filas(wb, "Enseñanza").slice(1)) {
    const nombre = txt(r[1]);
    if (!nombre) continue;
    const tipo = txt(r[0]);
    out.push({
      id_origen: `ensenanza|${nombre}`,
      nombre,
      categoria: "equipamientos",
      subcategoria: subcategoriaEnsenanza(tipo),
      direccion: txt(r[2]) || undefined,
      titularidad: txt(r[3]) || undefined,
      personal_publicado: num(r[4]),
      capacidad: num(r[5]),
      unidad_capacidad: num(r[5]) !== undefined ? "alumnos" : undefined,
      fuente: FUENTE,
      metodo_obtencion: "plantilla_municipal",
      atributos: { tipo, personal: num(r[4]), alumnos: num(r[5]) },
    });
  }

  // Paradas de autobús (Hoja4): nombre, x, y, dirección, líneas
  for (const r of filas(wb, "Hoja4")) {
    const nombre = txt(r[3]);
    const x = num(r[4]);
    const y = num(r[5]);
    if (!nombre || x === undefined || y === undefined) continue;
    const { lat, lng } = utmToLatLng(x, y, UTM_ZONE);
    out.push({
      id_origen: `parada|${nombre}`,
      nombre,
      categoria: "infraestructuras",
      subcategoria: "parada_autobus",
      direccion: txt(r[6]) || txt(r[1]) || undefined,
      lat,
      lon: lng,
      fuente: FUENTE,
      metodo_obtencion: "plantilla_municipal",
      atributos: { lineas: txt(r[7]), utm_x: x, utm_y: y, utm_zone: UTM_ZONE },
    });
  }

  return out;
}

async function main() {
  const args = parseArgs();
  if (!args.file) {
    console.error("Falta --file <ruta al xlsx>");
    process.exit(1);
  }

  const wb = XLSX.readFile(args.file);
  const features = construirFeatures(wb);
  console.log(`INCideas · import xlsx · INE=${args.ine} · modo=${args.go ? "ESCRITURA" : "DRY-RUN"}`);
  console.log(`  features construidas: ${features.length}`);

  let supabase = null as ReturnType<typeof createClient> | null;
  let boundary: GeoJSON.Geometry | null = null;
  if (args.go) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.error("--go requiere NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
      process.exit(1);
    }
    supabase = createClient(url, key);
    boundary = await cargarBoundaryDeBD(supabase, args.ine);
  }

  const deps = supabase ? depsSupabase(supabase) : depsMemoria();

  const ctx: EjecucionContext = {
    id: "import-xlsx",
    conector: "import-xlsx",
    version_conector: "1.1.0",
    codigo_ine: args.ine,
    categoria: "equipamientos",
    fuente: FUENTE,
    parametros: { archivo: args.file },
    // La plantilla es la fuente completa de estas subcategorías: lo que no aparece en ella
    // (p. ej. registros colapsados por claves antiguas) se marca como posible baja.
    ambito: [
      { categoria: "territorio", subcategorias: ["partida"] },
      { categoria: "infraestructuras", subcategorias: ["parada_autobus"] },
      {
        categoria: "equipamientos",
        subcategorias: ["farmacia", "colegio", "instituto", "escuela_infantil", "centro_formacion"],
      },
    ],
  };

  const normalized = features.map((raw) => {
    const rec = normalizeFeature(raw, {
      codigoINE: args.ine,
      estadoValidacion: "contrastado",
      nivelAutomatizacion: "baja",
      visibilidad: "publica",
    });
    const val = validarEspacial(rec.coordenadas, boundary);
    rec.estado_espacial = val.estado;
    return rec;
  });

  const idFuente = deps.resolverFuente ? await deps.resolverFuente(FUENTE.nombre) : undefined;
  const ejecucionId = await deps.iniciarEjecucion({
    conector: "import-xlsx",
    version_conector: "1.1.0",
    codigo_ine: args.ine,
    categoria: "import_xlsx",
    id_fuente: idFuente,
    parametros: { archivo: args.file },
  });
  ctx.id = ejecucionId;

  const counts = await procesarLote(deps.store, ctx, normalized, {
    permitirBajas: true,
    usuario: "import:plantilla-municipal",
  });

  await deps.finalizarEjecucion(ejecucionId, {
    estado: "completada",
    fecha_fin: new Date().toISOString(),
    registros_leidos: features.length,
    registros_insertados: counts.insertados,
    registros_actualizados: counts.actualizados,
    registros_sin_cambios: counts.sin_cambios,
    posibles_bajas: counts.posibles_bajas,
    registros_rechazados: counts.rechazados,
    errores: counts.errores,
    resumen_calidad: {
      por_subcategoria: normalized.reduce<Record<string, number>>((acc, r) => {
        const k = `${r.categoria}/${r.subcategoria}`;
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {}),
    },
  });

  console.log(
    `  insertados=${counts.insertados} actualizados=${counts.actualizados} ` +
      `sin_cambios=${counts.sin_cambios} posibles_bajas=${counts.posibles_bajas} rechazados=${counts.rechazados}`
  );
  const resumen = normalized.reduce<Record<string, number>>((acc, r) => {
    const k = `${r.categoria}/${r.subcategoria}`;
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  for (const [k, v] of Object.entries(resumen).sort()) console.log(`    ${k}: ${v}`);
  if (counts.errores.length) counts.errores.forEach((e) => console.log("    ! " + e));
  console.log("Fin.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
