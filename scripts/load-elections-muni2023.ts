// Carga del bloque CONTEXTO POLÍTICO (Elecciones municipales 2023-05-28) en R2.
// Fuente: Ministerio del Interior · Infoelectoral · Datos Abiertos.
// Fichero MVP (>250 hab): tmp/elections-probe/mas250.xlsx (descarga oficial verificada,
// 866.576 filas; 12 convocatorias 1979-2023; última general municipal 2023-05-28).
//
// Convocatoria vigente reverificada en vivo el 2026-09-16:
// - Portal Datos Abiertos: datasets de resultados electorales (sin municipal posterior).
// - Procesos electorales: última LOCAL general 28-05-2023 (RD 207/2023); solo
//   parciales limitadas 26-11-2023 (RD 758/2023), fuera del alcance MVP nacional.
// - Elecciones anteriores: última web local 2023; nada municipal posterior.
// - XLSX local: fechas distintas max = 45074 (2023-05-28). Sin convocatoria más reciente.
//   Próximas municipales generales 2027 (aún no celebradas).
//
// Reglas:
// - MERGE por municipio: lee el JSON existente, sustituye SOLO slugs elec_*,
//   preserva demografía/economía. Sin JSON previo: crea documento mínimo v2.
// - Regla ≤250 hab → missing honesto, NUNCA 0 ni error: sin filas en la fuente
//   para 2023 se registra missing (motivo scope_hasta250: fuera del alcance MVP,
//   vive en el fichero complementario hasta-250 de grano candidato, sin
//   participación). Con filas → observed (manda la fuente; el campo poblacion
//   del catálogo local no es fiable y no se usa como filtro).
// - Presupuesto 150 KB por municipio (JSON.stringify del envelope electoral).
// - Read-back tras cada PUT (con cache-buster) + manifest reanudable
//   tmp/elections/r2-load-manifest.json. Registra data_sync_runs
//   tipo_sincronizacion='elecciones_muni2023', bloque='politica'.
// - Sin --write no se toca R2 ni Supabase (dry-run / parse-only puros, sin red).
//
// Uso:
//   npx tsx scripts/load-elections-muni2023.ts --parse-only
//   npx tsx scripts/load-elections-muni2023.ts --parse-only --codes=28079,08019
//   npx tsx scripts/load-elections-muni2023.ts --write --limit 500 --offset 0
//   npx tsx scripts/load-elections-muni2023.ts --write --codes=28079 --force
//   npx tsx scripts/load-elections-muni2023.ts --mock --write  → exit 1

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";

import {
  ELECTIONS_CONVOCATORIA,
  ELECTIONS_INDICATORS,
  ELECTIONS_URL_MAS250,
  buildFilasMunicipio,
  type ElectionsRawRow,
} from "../src/lib/socideas-elections";
import { expandV2Envelope, putMunicipioJson, readMunicipioJson, toV2Envelope } from "../src/lib/socideas-r2";
import type { R2MunicipioEnvelopeV2 } from "../src/lib/socideas-r2";

const require = createRequire(join(process.cwd(), "package.json"));
const XLSX = require("xlsx") as typeof import("xlsx");

const TMP = join(process.cwd(), "tmp", "elections");
const MANIFEST_PATH = join(TMP, "r2-load-manifest.json");
const SUMMARY_PATH = join(TMP, "manifest.json");
const ROWS_PATH = join(TMP, "muni2023_rows.json");
const SAMPLES_DIR = join(TMP, "samples");
const CATALOG_PATH = join(process.cwd(), "scripts", "data", "municipios-ine.json");
const XLSX_PATH = join(process.cwd(), "tmp", "elections-probe", "mas250.xlsx");

const MAX_BYTES = 150 * 1024;
const TIPO_SYNC = "elecciones_muni2023";

const ELECTIONS_SLUGS = new Set<string>(ELECTIONS_INDICATORS.map((i) => i.slug));

// Carga .env.local sin dependencias (nunca imprime valores; solo en --write).
function loadEnvLocal(): void {
  try {
    const txt = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  } catch {
    /* sin .env.local: fallará solo si se pide --write */
  }
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

interface CatalogEntry {
  codigo_ine: string;
  nombre: string;
  provincia_codigo: string;
  poblacion: number;
}

interface ParsedEntry {
  ine: string;
  nombre: string;
  estado: "observed" | "missing";
  motivo?: string;
  filas?: ElectionsRawRow[] | undefined;
  nCandidaturas?: number;
  totalConcejales?: number;
  participacion?: number | null;
  bytes?: number;
  warnings?: string[];
}

function flagVal(args: string[], name: string): number {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return parseInt(eq.split("=")[1], 10) || 0;
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1] !== undefined) return parseInt(args[i + 1], 10) || 0;
  return 0;
}

function parseCatalog(): CatalogEntry[] {
  const raw = JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as CatalogEntry[];
  return raw.filter((m) => /^\d{5}$/.test(m.codigo_ine)).sort((a, b) => a.codigo_ine.localeCompare(b.codigo_ine));
}

/** Lee el XLSX local y devuelve filas de la convocatoria 2023 indexadas por INE-5. */
function indexConvocatoria(): { byIne: Map<string, { nombre: string; rows: ElectionsRawRow[] }>; nFilas: number } {
  if (!existsSync(XLSX_PATH) || statSync(XLSX_PATH).size === 0) {
    throw new Error(`Falta el XLSX local: ${XLSX_PATH} (descarga oficial: ${ELECTIONS_URL_MAS250})`);
  }
  const wb = XLSX.readFile(XLSX_PATH, { sheetStubs: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const data = rows.slice(4) as (string | number | null)[][];
  const conv = data.filter((r) => r[0] === ELECTIONS_CONVOCATORIA.fechaExcel);
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
      resultados: numOrNull(r[8]),
      concejales: numOrNull(r[9]),
    });
    byIne.set(ine, entry);
  }
  return { byIne, nFilas: conv.length };
}

/** Fase 1 (sin red, sin credenciales): parseo nacional → ROWS + SUMMARY + muestras. */
async function faseParse(onlyCodes: string[] | null, force: boolean): Promise<{ observed: number; missing: number; total: number }> {
  if (existsSync(ROWS_PATH) && existsSync(SUMMARY_PATH) && !force && !onlyCodes) {
    const summary = JSON.parse(await readFile(ROWS_PATH, "utf8")) as { entries?: unknown[] };
    void summary;
  }
  const catalog = parseCatalog();
  const wanted = onlyCodes ? catalog.filter((m) => onlyCodes.includes(m.codigo_ine)) : catalog;
  if (onlyCodes) {
    const unknown = onlyCodes.filter((c) => !catalog.some((m) => m.codigo_ine === c));
    if (unknown.length > 0) throw new Error(`Códigos fuera de catálogo: ${unknown.join(",")}`);
  }
  const { byIne, nFilas } = indexConvocatoria();
  console.log(`[fase1] convocatoria ${ELECTIONS_CONVOCATORIA.fecha} (excel ${ELECTIONS_CONVOCATORIA.fechaExcel}): ${nFilas} filas`);
  const ahora = new Date().toISOString();
  const entries: ParsedEntry[] = [];
  let over = 0;
  for (const m of wanted) {
    const hit = byIne.get(m.codigo_ine);
    if (!hit || hit.rows.length === 0) {
      // Missing honesto: fuera del alcance >250 hab (concejo abierto / hasta-250)
      // o sin cobertura en la fuente. Nunca 0, nunca error.
      entries.push({ ine: m.codigo_ine, nombre: m.nombre, estado: "missing", motivo: "scope_hasta250" });
      continue;
    }
    const built = buildFilasMunicipio(m.codigo_ine, hit.nombre, hit.rows);
    const envelope = toV2Envelope(m.codigo_ine, ahora, built.filas);
    const bytes = JSON.stringify(envelope).length;
    if (bytes > MAX_BYTES) over += 1;
    entries.push({
      ine: m.codigo_ine,
      nombre: hit.nombre,
      estado: "observed",
      filas: hit.rows,
      nCandidaturas: built.resumen.nCandidaturas,
      totalConcejales: built.resumen.totalConcejales,
      participacion: built.resumen.participacion,
      bytes,
      warnings: built.warnings,
    });
    for (const w of built.warnings) console.warn(`AVISO ${w}`);
  }
  const observed = entries.filter((e) => e.estado === "observed");
  const missing = entries.filter((e) => e.estado === "missing");
  const sizes = observed.map((e) => e.bytes ?? 0).sort((a, b) => a - b);
  const kb = (b: number): number => Math.round(b / 1024);
  const stats =
    sizes.length > 0
      ? { min: kb(sizes[0]), mediana: kb(sizes[Math.floor(sizes.length / 2)]), max: kb(sizes[sizes.length - 1]) }
      : { min: 0, mediana: 0, max: 0 };
  const totalKB = sizes.reduce((a, b) => a + b, 0) / 1024;
  // Persistencia fase 1: filas compactas (sin duplicar envelopes) + resumen + muestras.
  await mkdir(TMP, { recursive: true });
  const compact: Record<string, ParsedEntry> = {};
  for (const e of entries) {
    const { filas, ...rest } = e;
    void filas;
    compact[e.ine] = rest;
  }
  await writeFile(ROWS_PATH, JSON.stringify({ convocatoria: ELECTIONS_CONVOCATORIA.fecha, entries: compact }));
  const summary = {
    convocatoria: ELECTIONS_CONVOCATORIA.fecha,
    tableId: ELECTIONS_CONVOCATORIA.tableId,
    fuente: ELECTIONS_URL_MAS250,
    catalogo: `${catalog.length} municipios (scripts/data/municipios-ine.json)`,
    alcance: onlyCodes ? `filtrado --codes (${wanted.length})` : "nacional completo",
    total: wanted.length,
    observed: observed.length,
    missing: missing.length,
    missing_ejemplo: missing.slice(0, 20).map((e) => e.ine),
    kb: stats,
    total_kb: Math.round(totalKB * 10) / 10,
    presupuesto_kb_por_municipio: 150,
    supera_presupuesto: observed.filter((e) => (e.bytes ?? 0) > MAX_BYTES).map((e) => e.ine),
    r2: "ninguna escritura",
    supabase: "sin toques",
  };
  await writeFile(SUMMARY_PATH, JSON.stringify(summary, null, 2));
  // Muestras: 5 observed (primero, 2 intermedios, 2 últimos) como envelopes reales.
  await mkdir(SAMPLES_DIR, { recursive: true });
  const picks = observed.length <= 5 ? observed : [observed[0], observed[Math.floor(observed.length / 4)], observed[Math.floor(observed.length / 2)], observed[Math.floor((observed.length * 3) / 4)], observed[observed.length - 1]];
  for (const p of picks) {
    const hit = byIne.get(p.ine);
    if (!hit) continue;
    const built = buildFilasMunicipio(p.ine, p.nombre, hit.rows);
    await writeFile(join(SAMPLES_DIR, `${p.ine}.json`), JSON.stringify(toV2Envelope(p.ine, ahora, built.filas)));
  }
  console.log(`[fase1] total=${wanted.length} observed=${observed.length} missing=${missing.length} (missing honesto scope_hasta250, nunca 0)`);
  console.log(`[fase1] KB min/mediana/max: ${stats.min}/${stats.mediana}/${stats.max} | total ${totalKB.toFixed(1)} KB | superan 150KB: ${over}`);
  console.log(`[fase1] Resumen en ${SUMMARY_PATH} · filas en ${ROWS_PATH} · muestras en ${SAMPLES_DIR}/ (cero R2/Supabase)`);
  if (over > 0) {
    console.error(`FAIL: ${over} municipios superan el presupuesto de 150 KB`);
    process.exit(1);
  }
  return { observed: observed.length, missing: missing.length, total: wanted.length };
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isMock = args.includes("--mock");
  const doWrite = args.includes("--write");
  if (isMock && doWrite) {
    console.error("ERROR: --mock no puede combinarse con --write. Exit 1");
    process.exit(1);
  }
  const parseOnly = args.includes("--parse-only");
  if (doWrite && parseOnly) {
    console.error("ERROR: --write y --parse-only son excluyentes. Exit 1");
    process.exit(1);
  }
  const limit = flagVal(args, "--limit");
  const offset = flagVal(args, "--offset");
  const force = args.includes("--force");
  const codesArg = args.find((a) => a.startsWith("--codes="))?.split("=")[1] ?? "";
  const onlyCodes = codesArg ? codesArg.split(",").map((s) => s.trim()).filter((s) => /^\d{5}$/.test(s)) : null;
  if (codesArg && (!onlyCodes || onlyCodes.length === 0)) throw new Error("--codes requiere lista de INE de 5 dígitos separados por coma");

  // Fase 1 siempre (también antes de --write, para garantizar cobertura).
  const parsed = await faseParse(onlyCodes, force);
  void parsed;
  if (!doWrite) {
    console.log("[dry-run] Parseo OK. Sin --write no se toca R2 ni Supabase.");
    return;
  }

  // Fase 2: carga con MERGE (requiere credenciales; el orquestador autoriza).
  loadEnvLocal();
  const envOk = (k: string): string => (process.env[k] ? `OK(${process.env[k]!.length}c)` : "FALTA");
  console.log(`[env] SUPABASE_URL=${envOk("NEXT_PUBLIC_SUPABASE_URL")} SERVICE_ROLE=${envOk("SUPABASE_SERVICE_ROLE_KEY")} R2_BASE=${envOk("NEXT_PUBLIC_SOCIDEAS_R2_BASE")} R2_BUCKET=${envOk("R2_BUCKET")}`);
  const { createClient } = await import("@supabase/supabase-js");
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPA_URL || !SERVICE_KEY) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  if (!process.env.R2_BUCKET) throw new Error("Faltan credenciales R2 en .env.local");
  const supabase = createClient(SUPA_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const catalog = parseCatalog();
  const { byIne } = indexConvocatoria();

  let manifest: {
    started: string;
    items: Record<string, { key: string; bytesAntes: number; bytesDespues: number; readback: string; estado: string; created_minimal?: boolean }>;
  };
  try {
    manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as typeof manifest;
  } catch {
    manifest = { started: new Date().toISOString(), items: {} };
  }
  const sliceAll = onlyCodes ? catalog.filter((m) => onlyCodes.includes(m.codigo_ine)) : catalog;
  const slice = sliceAll.slice(offset, limit > 0 ? offset + limit : undefined);
  console.log(`[fase2] municipios en tramo: ${slice.length} (offset=${offset} limit=${limit || "∞"} fuerza=${force ? "sí" : "no"})`);
  const { data: sources } = await supabase.from("statistical_sources").select("id, slug, organismo, nombre");
  const srcMeta = new Map(
    ((sources ?? []) as { id: string; slug: string; organismo: string; nombre: string }[]).map((s) => [s.slug, s]),
  );
  const { data: inds } = await supabase.from("indicator_definitions").select("id, slug, nombre, unidad").eq("activo", true);
  const indMeta = new Map(((inds ?? []) as { id: string; slug: string; nombre: string; unidad: string | null }[]).map((i) => [i.slug, i]));

  const t0 = Date.now();
  let escritos = 0;
  let bytesOut = 0;
  let errores = 0;
  let readbackErr = 0;
  const counts = { actualizado: 0, missing: 0, error: 0 };
  for (const [idx, m] of slice.entries()) {
    const ine = m.codigo_ine;
    if (!force && manifest.items[ine]?.readback === "ok" && manifest.items[ine]?.estado !== "error") continue;
    try {
      const hit = byIne.get(ine);
      const isMissing = !hit || hit.rows.length === 0;
      const previo = await readMunicipioJson(ine).catch(() => null);
      const bytesAntes = previo ? JSON.stringify(previo).length : 0;
      const filasPrevias: {
        slug: string;
        anio: number;
        valor: number;
        unidad: string;
        dim: Record<string, string>;
        sslug: string;
        surl: string;
        tid: string;
        sid: string | null;
        nombre: string;
        uind: string | null;
        org: string;
        nfuente: string;
      }[] = [];
      let createdMinimal = false;
      if (previo && previo.version === 2) {
        for (const f of expandV2Envelope(previo as unknown as R2MunicipioEnvelopeV2) as unknown as {
          indicator: { slug: string; nombre: string; unidad: string | null };
          source: { slug: string; organismo: string; nombre: string };
          anio_referencia: number;
          valor_numerico: number | null;
          unidad: string | null;
          dimensiones: Record<string, string>;
          source_url: string | null;
          source_table_id: string | null;
          source_series_id?: string | null;
        }[]) {
          if (ELECTIONS_SLUGS.has(f.indicator.slug)) continue;
          if (f.valor_numerico === null || f.anio_referencia == null) continue;
          filasPrevias.push({
            slug: f.indicator.slug,
            anio: f.anio_referencia,
            valor: Number(f.valor_numerico),
            unidad: f.unidad ?? "",
            dim: f.dimensiones ?? {},
            sslug: f.source.slug || "ine_tempus3",
            surl: f.source_url ?? "",
            tid: f.source_table_id ?? "",
            sid: f.source_series_id ?? null,
            nombre: f.indicator.nombre,
            uind: f.indicator.unidad,
            org: f.source.organismo,
            nfuente: f.source.nombre,
          });
        }
      } else if (!previo) {
        createdMinimal = true;
      }
      const nuevas: {
        indicator: { slug: string; nombre: string; unidad: string | null };
        source: { slug: string; organismo: string; nombre: string };
        anio_referencia: number;
        valor_numerico: number;
        unidad: string;
        dimensiones: Record<string, string>;
        source_url: string;
        source_table_id: string;
        source_series_id?: string | null;
        estado_validacion: "validado";
      }[] = [];
      if (!isMissing && hit) {
        const built = buildFilasMunicipio(ine, hit.nombre, hit.rows);
        for (const fila of built.filas) {
          if (fila.valor_numerico === null) continue; // nunca 0 inventado
          nuevas.push({
            indicator: fila.indicator,
            source: fila.source,
            anio_referencia: fila.anio_referencia ?? ELECTIONS_CONVOCATORIA.anio,
            valor_numerico: fila.valor_numerico,
            unidad: fila.unidad ?? "",
            dimensiones: fila.dimensiones,
            source_url: fila.source_url ?? "",
            source_table_id: fila.source_table_id ?? "",
            source_series_id: fila.source_series_id ?? null,
            estado_validacion: "validado",
          });
        }
      }
      const todas: {
        indicator: { slug: string; nombre: string; unidad: string | null };
        source: { slug: string; organismo: string; nombre: string };
        anio_referencia: number;
        valor_numerico: number;
        unidad: string;
        dimensiones: Record<string, string>;
        source_url: string;
        source_table_id: string;
        source_series_id?: string | null;
        estado_validacion: "validado";
      }[] = [];
      for (const k of filasPrevias) {
        const meta = srcMeta.get(k.sslug) ?? { slug: k.sslug, organismo: k.org, nombre: k.nfuente };
        todas.push({
          indicator: { slug: k.slug, nombre: k.nombre, unidad: k.uind ?? k.unidad },
          source: { slug: meta.slug, organismo: meta.organismo, nombre: meta.nombre },
          anio_referencia: k.anio,
          valor_numerico: k.valor,
          unidad: k.unidad,
          dimensiones: k.dim,
          source_url: k.surl,
          source_table_id: k.tid,
          source_series_id: k.sid ?? null,
          estado_validacion: "validado",
        });
      }
      for (const r of nuevas) {
        const meta = indMeta.get(r.indicator.slug);
        const src = srcMeta.get(r.source.slug);
        if (!meta || !src) continue;
        todas.push({
          indicator: { slug: r.indicator.slug, nombre: meta.nombre, unidad: meta.unidad ?? r.indicator.unidad },
          source: { slug: src.slug, organismo: src.organismo, nombre: src.nombre },
          anio_referencia: r.anio_referencia,
          valor_numerico: r.valor_numerico,
          unidad: r.unidad,
          dimensiones: r.dimensiones,
          source_url: r.source_url,
          source_table_id: r.source_table_id,
          source_series_id: r.source_series_id ?? null,
          estado_validacion: "validado",
        });
      }
      const envelope = toV2Envelope(ine, new Date().toISOString(), todas);
      const bytesDespues = JSON.stringify(envelope).length;
      if (bytesDespues - bytesAntes > MAX_BYTES) throw new Error(`Presupuesto superado +${bytesDespues - bytesAntes}B`);
      const key = await putMunicipioJson(ine, envelope);
      const base = (process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ?? process.env.SOCIDEAS_R2_PUBLIC_BASE ?? "").replace(/\/$/, "");
      const rb = await fetch(`${base}/socideas/v2/municipios/${ine}.json?v=${Date.now()}`, { headers: { Accept: "application/json" } });
      if (!rb.ok) throw new Error(`Read-back HTTP ${rb.status}`);
      const rbJson = (await rb.json()) as { codigo_ine?: string; valores?: unknown[] };
      if (rbJson.codigo_ine !== ine || !Array.isArray(rbJson.valores)) throw new Error("Read-back inválido");
      const estado = isMissing ? "missing" : nuevas.length > 0 ? "ok" : "missing";
      manifest.items[ine] = {
        key,
        bytesAntes,
        bytesDespues,
        readback: "ok",
        estado,
        ...(createdMinimal ? { created_minimal: true } : {}),
      };
      escritos += 1;
      bytesOut += bytesDespues;
      if (isMissing) counts.missing += 1;
      else counts.actualizado += 1;
      const sha = createHash("sha256").update(JSON.stringify(envelope)).digest("hex").slice(0, 16);
      await supabase.from("data_sync_runs").insert({
        source_id: null,
        tipo_sincronizacion: TIPO_SYNC,
        municipio_codigo_ine: ine,
        estado: isMissing ? "partial" : "ok",
        registros_leidos: nuevas.length,
        registros_actualizados: nuevas.length,
        fin: new Date().toISOString(),
        estado_dato: "consolidado",
        bloque: "politica",
        periodo: ELECTIONS_CONVOCATORIA.fecha,
        fuente: "mir_infoelectoral",
        metadata: { estado_bloque: estado, sha, tableId: ELECTIONS_CONVOCATORIA.tableId },
      });
      if ((idx + 1) % 100 === 0) {
        await writeFile(MANIFEST_PATH, JSON.stringify(manifest));
        console.log(`[progreso] ${idx + 1}/${slice.length} escritos=${escritos} errores=${errores}`);
      }
    } catch (e) {
      errores += 1;
      counts.error += 1;
      if (String((e as Error).message).startsWith("Read-back")) readbackErr += 1;
      manifest.items[ine] = { key: "", bytesAntes: 0, bytesDespues: 0, readback: "error", estado: "error" };
      await supabase.from("data_sync_runs").insert({
        source_id: null,
        tipo_sincronizacion: TIPO_SYNC,
        municipio_codigo_ine: ine,
        estado: "error",
        fin: new Date().toISOString(),
        error_message: String((e as Error).message).slice(0, 2000),
        estado_dato: "consolidado",
        bloque: "politica",
        periodo: ELECTIONS_CONVOCATORIA.fecha,
        fuente: "mir_infoelectoral",
      });
    }
  }
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest));
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`[fin] escritos=${escritos} bytes=${bytesOut} readbackErr=${readbackErr} errores=${errores} mins=${mins}`);
  console.log(`[conteos] actualizado=${counts.actualizado} missing=${counts.missing} error=${counts.error}`);
  if (readbackErr > 0) {
    console.error(`FAIL: ${readbackErr} errores de read-back`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  process.exit(1);
});
