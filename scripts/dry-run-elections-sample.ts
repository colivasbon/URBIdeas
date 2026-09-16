// Dry-run electoral (SUBAGENTE 3, Fase 2B): construye envelopes v2 SOLO con el
// bloque electoral para los 10 municipios de muestra y los deja en
// tmp/elections-sample/{ine}.json. NADA en R2 real, NADA en Supabase.
//
// Uso: npx tsx scripts/dry-run-elections-sample.ts [ruta-xlsx]
// Por defecto lee tmp/elections-probe/mas250.xlsx (descarga oficial verificada
// el 2026-09-16: HTTP 200, 36.505.355 bytes desde
// https://descargas.interior.gob.es/datasets/resultados_electorales/Elecciones-a-municipios-de-mas-de-250-hab.xlsx)
// No hace red: trabaja sobre el fichero local. Requiere dependencias del repo
// (xlsx, tsx) y src/lib/socideas-elections.ts + src/lib/socideas-r2.ts.
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

const SAMPLE = ["01001", "07010", "28079", "28143", "08019", "41091", "29067", "35003", "46250", "15030"];
const KB_BUDGET = 150 * 1024;

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function main(): void {
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

  const outDir = path.join("tmp", "elections-sample");
  fs.mkdirSync(outDir, { recursive: true });
  let totalBytes = 0;
  let failures = 0;
  for (const ine of SAMPLE) {
    const prov = Number(ine.slice(0, 2));
    const muni = Number(ine.slice(2));
    const sub = conv.filter((r) => r[6] === prov && r[4] === muni);
    if (sub.length === 0) {
      console.error(`${ine}: SIN FILAS en la fuente (se omite, no se inventa)`);
      failures += 1;
      continue;
    }
    const nombre = String(sub[0][5] ?? ine);
    // Verificación territorial: el INE reconstruido debe coincidir con el pedido.
    const rebuilt = ine5FromParts(Number(sub[0][6]), Number(sub[0][4]));
    if (rebuilt !== ine) {
      console.error(`${ine}: reconstrucción INE ${rebuilt} ≠ pedido (se omite)`);
      failures += 1;
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
    totalBytes += bytes;
    fs.writeFileSync(path.join(outDir, `${ine}.json`), json);
    const kb = (bytes / 1024).toFixed(1);
    const r = built.resumen;
    console.log(
      `${ine} ${nombre}: filas=${built.filas.length} cand=${r.nCandidaturas} conc=${r.totalConcejales} ` +
        `part=${r.participacion ?? "ND"}% ${kb} KB ${bytes <= KB_BUDGET ? "OK" : "***** SUPERA 150KB *****"} ` +
        `-> tmp/elections-sample/${ine}.json`,
    );
  }
  console.log(`TOTAL ${SAMPLE.length - failures}/${SAMPLE.length} municipios, ${(totalBytes / 1024).toFixed(1)} KB`);
  if (failures > 0) process.exit(2);
}

main();
