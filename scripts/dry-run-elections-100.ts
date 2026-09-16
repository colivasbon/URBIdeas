// Dry-run electoral 100 (SUBAGENTE 3, Fase 2B): envelopes v2 SOLO con el bloque
// electoral para 100 municipios estratificados y manifiesto en
// tmp/elections-100/. NADA en R2 real, NADA en Supabase.
//
// Estratos (deterministas, ordenados por `poblacion` del catálogo
// scripts/data/municipios-ine.json; solo municipios con poblacion > 250 por el
// alcance >250 hab de la fuente):
// - 10 grandes: los 10 de mayor poblacion.
// - 10 medianos: 10 equidistantes del tramo 5.000 < poblacion <= 50.000.
// - 80 pequeños: 80 equidistantes del tramo 250 < poblacion <= 5.000.
//
// Uso: npx tsx scripts/dry-run-elections-100.ts [ruta-xlsx]
// Por defecto lee tmp/elections-probe/mas250.xlsx (descarga oficial verificada:
// https://descargas.interior.gob.es/datasets/resultados_electorales/Elecciones-a-municipios-de-mas-de-250-hab.xlsx)
// No hace red: trabaja sobre el fichero local.
import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";

import {
  ELECTIONS_CONVOCATORIA,
  ELECTIONS_URL_MAS250,
  buildFilasMunicipio,
  ine5FromParts,
  type ElectionsRawRow,
} from "../src/lib/socideas-elections";
import { toV2Envelope } from "../src/lib/socideas-r2";

const require = createRequire(path.join(process.cwd(), "package.json"));
const XLSX = require("xlsx") as typeof import("xlsx");

const KB_BUDGET = 150 * 1024;

interface CatalogEntry {
  codigo_ine: string;
  nombre: string;
  provincia_codigo: string;
  poblacion: number;
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Selección determinista: n elementos equidistantes de la lista ordenada. */
function evenly<T>(list: T[], n: number): T[] {
  if (list.length <= n) return [...list];
  const step = list.length / n;
  return Array.from({ length: n }, (_, i) => list[Math.floor(i * step)]);
}

function main(): void {
  const catalog = JSON.parse(
    fs.readFileSync(path.join("scripts", "data", "municipios-ine.json"), "utf-8"),
  ) as CatalogEntry[];
  const byPop = [...catalog]
    .filter((m) => /^\d{5}$/.test(m.codigo_ine) && Number.isFinite(m.poblacion))
    .sort((a, b) => b.poblacion - a.poblacion);
  const grandes = byPop.slice(0, 10).map((m) => m.codigo_ine);
  const medianos = evenly(
    byPop.filter((m) => m.poblacion > 5000 && m.poblacion <= 50000),
    10,
  ).map((m) => m.codigo_ine);
  const pequenos = evenly(
    byPop.filter((m) => m.poblacion > 250 && m.poblacion <= 5000),
    80,
  ).map((m) => m.codigo_ine);
  const SAMPLE = [...grandes, ...medianos, ...pequenos];
  const strataOf = new Map<string, string>();
  for (const ine of grandes) strataOf.set(ine, "grande");
  for (const ine of medianos) strataOf.set(ine, "mediano");
  for (const ine of pequenos) strataOf.set(ine, "pequeno");
  console.log(`Estratos: ${grandes.length} grandes + ${medianos.length} medianos + ${pequenos.length} pequenos = ${SAMPLE.length}`);

  const xlsxPath = process.argv[2] ?? path.join("tmp", "elections-probe", "mas250.xlsx");
  if (!fs.existsSync(xlsxPath)) {
    console.error(`Fichero no encontrado: ${xlsxPath}`);
    console.error(`Descarga oficial: ${ELECTIONS_URL_MAS250}`);
    process.exit(1);
  }
  const wb = XLSX.readFile(xlsxPath, { sheetStubs: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const data = rows.slice(4) as (string | number | null)[][];
  const conv = data.filter((r) => r[0] === ELECTIONS_CONVOCATORIA.fechaExcel);
  console.log(`Filas convocatoria ${ELECTIONS_CONVOCATORIA.fecha} (${ELECTIONS_CONVOCATORIA.fechaExcel}): ${conv.length}`);

  const outDir = path.join("tmp", "elections-100");
  fs.mkdirSync(outDir, { recursive: true });
  const results: {
    ine: string;
    nombre: string;
    estrato: string;
    ok: boolean;
    motivo?: string;
    filas?: number;
    candidaturas?: number;
    concejales?: number;
    participacion?: number | null;
    bytes?: number;
    warnings?: string[];
  }[] = [];
  for (const ine of SAMPLE) {
    const estrato = strataOf.get(ine) ?? "?";
    const prov = Number(ine.slice(0, 2));
    const muni = Number(ine.slice(2));
    const sub = conv.filter((r) => r[6] === prov && r[4] === muni);
    if (sub.length === 0) {
      console.error(`${ine}: SIN FILAS en la fuente (se omite, no se inventa)`);
      results.push({ ine, nombre: catalog.find((m) => m.codigo_ine === ine)?.nombre ?? ine, estrato, ok: false, motivo: "sin_filas" });
      continue;
    }
    const nombre = String(sub[0][5] ?? ine);
    const rebuilt = ine5FromParts(Number(sub[0][6]), Number(sub[0][4]));
    if (rebuilt !== ine) {
      console.error(`${ine}: reconstrucción INE ${rebuilt} ≠ pedido (se omite)`);
      results.push({ ine, nombre, estrato, ok: false, motivo: "ine_no_coincide" });
      continue;
    }
    const raw: ElectionsRawRow[] = sub.map((r) => ({
      descripcion: String(r[3] ?? ""),
      resultados: numOrNull(r[8]),
      concejales: numOrNull(r[9]),
    }));
    const built = buildFilasMunicipio(ine, nombre, raw);
    for (const w of built.warnings) console.warn(`AVISO ${w}`);
    const envelope = toV2Envelope(ine, new Date().toISOString(), built.filas);
    const json = JSON.stringify(envelope);
    const bytes = json.length; // Presupuesto MEMORIA: JSON.stringify(v2).length
    fs.writeFileSync(path.join(outDir, `${ine}.json`), json);
    const kb = (bytes / 1024).toFixed(1);
    const r = built.resumen;
    console.log(
      `${ine} ${nombre}: filas=${built.filas.length} cand=${r.nCandidaturas} conc=${r.totalConcejales} ` +
        `part=${r.participacion ?? "ND"}% ${kb} KB ${bytes <= KB_BUDGET ? "OK" : "***** SUPERA 150KB *****"} ` +
        `-> tmp/elections-100/${ine}.json`,
    );
    results.push({
      ine,
      nombre,
      estrato,
      ok: true,
      filas: built.filas.length,
      candidaturas: r.nCandidaturas,
      concejales: r.totalConcejales,
      participacion: r.participacion,
      bytes,
      warnings: built.warnings,
    });
  }

  const ok = results.filter((r) => r.ok);
  const fail = results.filter((r) => !r.ok);
  const sizes = ok.map((r) => r.bytes ?? 0).sort((a, b) => a - b);
  const kbStats =
    sizes.length > 0
      ? {
          min: Math.round(sizes[0] / 1024),
          mediana: Math.round(sizes[Math.floor(sizes.length / 2)] / 1024),
          max: Math.round(sizes[sizes.length - 1] / 1024),
        }
      : { min: 0, mediana: 0, max: 0 };
  const manifest = {
    convocatoria: ELECTIONS_CONVOCATORIA.fecha,
    tableId: ELECTIONS_CONVOCATORIA.tableId,
    fuente: ELECTIONS_URL_MAS250,
    estratos: "10 grandes + 10 medianos + 80 pequenos (poblacion catalogo, >250 hab)",
    total: SAMPLE.length,
    ok: ok.length,
    fallos: fail.map((r) => ({ ine: r.ine, nombre: r.nombre, estrato: r.estrato, motivo: r.motivo })),
    kb: kbStats,
    presupuesto_kb_por_municipio: 150,
    supera_presupuesto: ok.filter((r) => (r.bytes ?? 0) > KB_BUDGET).map((r) => r.ine),
    r2: "ninguna escritura",
  };
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  const totalKB = sizes.reduce((a, b) => a + b, 0) / 1024;
  console.log(
    `TOTAL ${ok.length}/${SAMPLE.length} municipios, ${totalKB.toFixed(1)} KB | KB min/mediana/max: ${kbStats.min}/${kbStats.mediana}/${kbStats.max} | fallos: ${fail.length}`,
  );
  console.log("Manifiesto en tmp/elections-100/manifest.json (ignorado por git). Cero escrituras R2/Supabase.");
}

main();
