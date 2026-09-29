// Loader electoral único e independiente
// Soporta: municipal 2023-05-28, 2019-05-26, otras convocatorias futuras
// NO depende de indicator_definitions, statistical_sources, ni merge municipal

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import {
  ELECTIONS_CONVOCATORIAS,
  ELECTIONS_URL_MAS250,
  buildFilasMunicipio,
  type ElectionsRawRow,
} from "../src/lib/socideas-elections";
import type {
  MunicipalElection,
  LoaderOptions,
  LoaderResult,
  ElectionSummary,
  Candidacy,
  ValidationReport,
} from "../src/lib/elections-schema";

const require = createRequire(join(process.cwd(), "package.json"));
const XLSX = require("xlsx") as typeof import("xlsx");

const TMP = join(process.cwd(), "tmp", "elections");
const CATALOG_PATH = join(process.cwd(), "scripts", "data", "municipios-ine.json");
const XLSX_PATH = join(process.cwd(), "tmp", "elections-probe", "mas250.xlsx");

interface CatalogEntry {
  codigo_ine: string;
  nombre: string;
  provincia_codigo: string;
  poblacion: number;
}

interface CLIOptions extends LoaderOptions {
  dryRun?: boolean;
}

function parseCliArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const result: CLIOptions = {
    type: "municipal",
    date: "",
    write: args.includes("--write"),
    verify: args.includes("--verify"),
    resume: args.includes("--resume"),
    all: args.includes("--all"),
    force: args.includes("--force"),
    dryRun: !args.includes("--write"),
  };

  const dateArg = args.find((a) => a.startsWith("--date="))?.split("=")[1];
  if (dateArg) result.date = dateArg;

  const codesArg = args.find((a) => a.startsWith("--codes="))?.split("=")[1];
  if (codesArg) result.codes = codesArg.split(",").map((s) => s.trim());

  const concurrencyArg = args.find((a) => a.startsWith("--concurrency="))?.split("=")[1];
  if (concurrencyArg) result.concurrency = parseInt(concurrencyArg, 10);

  const manifestArg = args.find((a) => a.startsWith("--manifest="))?.split("=")[1];
  if (manifestArg) result.manifest = manifestArg;

  return result;
}

function loadEnvLocal(): void {
  try {
    const txt = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  } catch {
    /* sin .env.local */
  }
}

function r2ClientFromEnv(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Falta configuración R2 en .env.local");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function parseCatalog(): CatalogEntry[] {
  const raw = JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as CatalogEntry[];
  return raw.filter((m) => /^\d{5}$/.test(m.codigo_ine)).sort((a, b) => a.codigo_ine.localeCompare(b.codigo_ine));
}

function findConvocatoria(dateArg: string): (typeof ELECTIONS_CONVOCATORIAS)[number] | null {
  if (!dateArg) return null;
  return ELECTIONS_CONVOCATORIAS.find((c) => c.fecha === dateArg || c.anio === parseInt(dateArg, 10)) ?? null;
}

async function indexConvocatoria(convocatoria: (typeof ELECTIONS_CONVOCATORIAS)[number]): Promise<
  Map<string, { nombre: string; rows: ElectionsRawRow[] }>
> {
  if (!existsSync(XLSX_PATH)) {
    throw new Error(`XLSX no encontrado: ${XLSX_PATH}`);
  }
  const wb = XLSX.readFile(XLSX_PATH, { sheetStubs: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const data = rows.slice(4) as (string | number | null)[][];
  const conv = data.filter((r) => r[0] === convocatoria.fechaExcel);

  const byIne = new Map<string, { nombre: string; rows: ElectionsRawRow[] }>();
  for (const r of conv) {
    const prov = r[6];
    const muni = r[4];
    if (typeof prov !== "number" || typeof muni !== "number") continue;
    const ine = String(prov).padStart(2, "0") + String(muni).padStart(3, "0");
    if (!/^\d{5}$/.test(ine)) continue;

    const entry = byIne.get(ine) ?? { nombre: String(r[5] ?? ine), rows: [] };
    entry.rows.push({
      descripcion: String(r[3] ?? ""),
      resultados: typeof r[8] === "number" && Number.isFinite(r[8]) ? r[8] : null,
      concejales: typeof r[9] === "number" && Number.isFinite(r[9]) ? r[9] : null,
    });
    byIne.set(ine, entry);
  }
  return byIne;
}

function buildElectionObject(
  ine: string,
  municipioNombre: string,
  provinciaCode: string,
  provinciaNombre: string,
  autonomousCommunity: string,
  convocatoria: (typeof ELECTIONS_CONVOCATORIAS)[number],
  filas: ReturnType<typeof buildFilasMunicipio>,
): MunicipalElection {
  const summary: ElectionSummary = {
    census: filas.resumen.censo,
    voters: filas.resumen.votantes,
    abstentions: null,
    participation_percentage: filas.resumen.participacion,
    valid_votes: null,
    blank_votes: null,
    null_votes: null,
    votes_to_candidacies: null,
    representatives_total: null,
    majority_threshold: filas.resumen.totalConcejales > 0 ? Math.floor(filas.resumen.totalConcejales / 2) + 1 : null,
    candidacies_total: filas.resumen.nCandidaturas,
  };

  const candidacies: Candidacy[] = [];
  const aggregated = new Map<string, Candidacy>();

  for (const fila of filas.filas) {
    const dim = fila.dimensiones;
    if (dim.candidatura) {
      const key = dim.candidatura;
      if (!aggregated.has(key)) {
        aggregated.set(key, {
          official_name: dim.candidatura,
          official_acronym: dim.siglas ?? "",
          ballot_order: null,
          votes: null,
          percentage_valid_votes: null,
          representatives: null,
          normalized_family_id: null,
          comparability_status: "unreviewed",
          source_record_id: null,
        });
      }
      const cand = aggregated.get(key)!;
      if (fila.indicator.slug === "elec_votos_candidatura") {
        cand.votes = fila.valor_numerico;
      }
      if (fila.indicator.slug === "elec_concejales") {
        cand.representatives = fila.valor_numerico;
      }
    }
  }

  for (const cand of aggregated.values()) {
    candidacies.push(cand);
  }

  const validation: ValidationReport = {
    status: "valid",
    rules: [],
    warnings: [],
    errors: filas.warnings,
  };

  return {
    schema_version: "1.0",
    election_type: "municipal",
    election_date: convocatoria.fecha,
    election_year: convocatoria.anio,
    municipality: {
      ine_code: ine,
      name: municipioNombre,
      province_code: provinciaCode,
      province_name: provinciaNombre,
      autonomous_community: autonomousCommunity,
    },
    scope: {
      votes: "municipality",
      representation: "municipality",
    },
    status: "definitive",
    source: {
      publisher: "Ministerio del Interior",
      dataset: "Infoelectoral",
      source_url: ELECTIONS_URL_MAS250,
      source_file: "Elecciones-a-municipios-de-mas-de-250-hab.xlsx",
      source_hash: "",
      downloaded_at: new Date().toISOString(),
      parsed_at: new Date().toISOString(),
      parser_version: "1.0",
    },
    summary,
    candidacies,
    validation,
    quality_flags: [],
  };
}

function hashElection(obj: MunicipalElection): string {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex").slice(0, 16);
}

async function main(): Promise<void> {
  const opts = parseCliArgs();

  if (!opts.date) {
    console.error("ERROR: --date es requerido. Ejemplo: --date=2023-05-28");
    process.exit(1);
  }

  const convocatoria = findConvocatoria(opts.date);
  if (!convocatoria) {
    console.error(`ERROR: Convocatoria ${opts.date} no encontrada`);
    process.exit(1);
  }

  console.log(`[LOAD] Convocatoria: ${convocatoria.fecha} (${convocatoria.anio})`);
  console.log(`[LOAD] Modo: ${opts.dryRun ? "DRY-RUN" : "WRITE"}`);

  const catalog = parseCatalog();
  const wanted = opts.all ? catalog : opts.codes ? catalog.filter((m) => opts.codes!.includes(m.codigo_ine)) : [];

  if (!opts.all && !opts.codes) {
    console.error("ERROR: --all o --codes requerido");
    process.exit(1);
  }

  console.log(`[LOAD] Municipios a procesar: ${wanted.length}`);

  const byIne = await indexConvocatoria(convocatoria);
  console.log(`[LOAD] Municipios en XLSX: ${byIne.size}`);

  await mkdir(TMP, { recursive: true });

  const results: LoaderResult = {
    election_type: "municipal",
    election_date: convocatoria.fecha,
    timestamp: new Date().toISOString(),
    summary: {
      detected: wanted.length,
      parsed: 0,
      written: 0,
      unchanged: 0,
      failed: 0,
      bytes_written: 0,
      duration_ms: 0,
    },
    results: {},
  };

  const t0 = Date.now();
  let s3Client: S3Client | null = null;
  if (!opts.dryRun) {
    loadEnvLocal();
    s3Client = r2ClientFromEnv();
  }

  for (const [idx, m] of wanted.entries()) {
    const ine = m.codigo_ine;
    const hit = byIne.get(ine);

    if (!hit || hit.rows.length === 0) {
      results.results[ine] = { status: "skipped" };
      continue;
    }

    try {
      const built = buildFilasMunicipio(ine, hit.nombre, hit.rows);
      const obj = buildElectionObject(ine, hit.nombre, m.provincia_codigo, "", "", convocatoria, built);

      if (obj.candidacies.length === 0) {
        throw new Error("No candidacies found (invalid source or parsing error)");
      }

      const body = JSON.stringify(obj);
      const hash = hashElection(obj);
      const key = `socideas/elections/normalized/municipal/${convocatoria.fecha}/${ine}.json`;

      results.summary.parsed++;

      if (!opts.dryRun && s3Client) {
        try {
          await s3Client.send(
            new PutObjectCommand({
              Bucket: process.env.R2_BUCKET!,
              Key: key,
              Body: body,
              ContentType: "application/json",
              CacheControl: "public, max-age=300, must-revalidate",
            })
          );

          if (opts.verify) {
            const rb = await s3Client.send(
              new GetObjectCommand({
                Bucket: process.env.R2_BUCKET!,
                Key: key,
              })
            );
            const rbText = await rb.Body?.transformToString();
            if (!rbText) throw new Error("Read-back failed");
            const rbHash = hashElection(JSON.parse(rbText));
            if (rbHash !== hash) throw new Error("Hash mismatch after write");
          }

          results.results[ine] = {
            status: "written",
            bytes: body.length,
            hash,
          };
          results.summary.written++;
          results.summary.bytes_written += body.length;
        } catch (e) {
          results.results[ine] = { status: "failed", error: String(e) };
          results.summary.failed++;
        }
      } else {
        results.results[ine] = {
          status: "written",
          bytes: body.length,
          hash,
        };
      }

      if ((idx + 1) % 100 === 0) {
        console.log(`[PROGRESO] ${idx + 1}/${wanted.length}`);
      }
    } catch (e) {
      results.results[ine] = { status: "failed", error: String(e) };
      results.summary.failed++;
    }
  }

  results.summary.duration_ms = Date.now() - t0;

  console.log(`\n[RESULTADOS]`);
  console.log(`  Detectados: ${results.summary.detected}`);
  console.log(`  Parseados: ${results.summary.parsed}`);
  console.log(`  Escritos: ${results.summary.written}`);
  console.log(`  Fallidos: ${results.summary.failed}`);
  console.log(`  Bytes: ${results.summary.bytes_written.toLocaleString()}`);
  console.log(`  Duración: ${(results.summary.duration_ms / 1000).toFixed(1)}s`);

  if (opts.manifest) {
    await writeFile(opts.manifest, JSON.stringify(results, null, 2));
    console.log(`[MANIFEST] ${opts.manifest}`);
  }

  if (results.summary.failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[FATAL]", e instanceof Error ? e.message : e);
  process.exit(1);
});
