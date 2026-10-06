// Fase 3 — Programador de actualización por fuente (contrato §5).
//
// Solo lectura + plan por defecto (dry-run): lee frecuencias de CONFIG,
// consulta incideas_cobertura (service_role vía dotenv, como
// cargar-muestra.ts), detecta pares vencidos (fin más antiguo que la
// frecuencia del bloque) y emite comandos agrupados por bloque. NO ejecuta
// nada salvo --ejecutar (un solo par, prueba de concepto, con timeout y log).
//
// Uso:
//   npx tsx scripts/incideas/fase3/actualizar.ts [--ines 03031,30030] [--bloque combustible] [--ejecutar] [--timeout-ms 120000]
// Manual por municipio y bloque (botón manual):
//   npx tsx scripts/incideas/fase3/actualizar.ts --ines 03031 --bloque sanidad
//   # imprime el comando --solo sanidad:03031; añade --ejecutar para lanzarlo.

import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { controlClient } from "../../../src/lib/incideas/fase3/cobertura";

config({ path: ".env.local" });

/** Frecuencias en días por bloque + edición de oleada vigente (contrato §5). */
const CONFIG = {
  /** Fija la edición de fuentes continuas (combustible, recarga) para que las
   *  reejecuciones actualicen la misma fila en lugar de duplicarla. */
  edicionOleada: "2026-10-06",
  frecuenciasDias: {
    // Diaria: precios/alertas.
    combustible: 1,
    recarga: 1,
    // Mensual: registros dinámicos.
    sanidad: 30,
    farmacias: 30,
    educacion: 30,
    // Anual / por edición: cartografía y estadísticas.
    depuradoras: 365,
    poblacion: 365,
    limites: 365,
    hidrografia: 365,
    inundabilidad: 365,
  },
} as const;

type Bloque = keyof typeof CONFIG.frecuenciasDias;

const MUESTRA: readonly string[] = ["03031", "30030", "01030", "38038", "31201", "51001"];
const BLOQUES_CON_EDICION_OLEADA: readonly Bloque[] = ["combustible", "recarga"];
const TIMEOUT_MS_DEFECTO = 120000;

interface FilaCobertura {
  municipio: string;
  bloque: string;
  fuente: string;
  edicion: string;
  estado: string;
  fin: string | null;
  objetos_publicados: number;
}

interface Vencido extends FilaCobertura {
  frecuenciaDias: number;
  edadDias: number;
}

function leerArg(nombre: string): string | null {
  const a: string[] = process.argv.slice(2);
  const i: number = a.indexOf(nombre);
  if (i < 0 || i + 1 >= a.length) return null;
  const v: string = a[i + 1];
  return v.trim() !== "" ? v : null;
}

function tieneFlag(nombre: string): boolean {
  return process.argv.slice(2).includes(nombre);
}

function esBloque(b: string): b is Bloque {
  return (Object.keys(CONFIG.frecuenciasDias) as string[]).includes(b);
}

function comandoCarga(ine: string, bloque: string): string {
  const base: string =
    `npx tsx scripts/incideas/fase3/cargar-muestra.ts --ines ${ine} --solo ${bloque}:${ine} --go`;
  if (esBloque(bloque) && (BLOQUES_CON_EDICION_OLEADA as readonly string[]).includes(bloque)) {
    return `${base} --edicion-oleada ${CONFIG.edicionOleada}`;
  }
  return base;
}

async function leerCobertura(ines: string[]): Promise<FilaCobertura[]> {
  const c = controlClient();
  const { data, error } = await c
    .from("incideas_cobertura")
    .select("municipio,bloque,fuente,edicion,estado,fin,objetos_publicados")
    .in("municipio", ines)
    .order("municipio")
    .order("bloque")
    .order("fuente")
    .limit(500);
  if (error) throw new Error(`incideas_cobertura (solo lectura): ${error.message}`);
  const filas: FilaCobertura[] = ((data ?? []) as FilaCobertura[]).map((r: FilaCobertura) => ({
    municipio: String(r.municipio),
    bloque: String(r.bloque),
    fuente: String(r.fuente),
    edicion: String(r.edicion ?? ""),
    estado: String(r.estado),
    fin: r.fin === null || r.fin === undefined ? null : String(r.fin),
    objetos_publicados: Number(r.objetos_publicados ?? 0),
  }));
  return filas;
}

function detectarVencidos(filas: FilaCobertura[], ahoraMs: number): { vencidos: Vencido[]; desconocidos: FilaCobertura[] } {
  const vencidos: Vencido[] = [];
  const desconocidos: FilaCobertura[] = [];
  for (const f of filas) {
    if (!esBloque(f.bloque)) {
      desconocidos.push(f);
      continue;
    }
    const frecuenciaDias: number = CONFIG.frecuenciasDias[f.bloque];
    if (f.fin === null) {
      vencidos.push({ ...f, frecuenciaDias, edadDias: Number.POSITIVE_INFINITY });
      continue;
    }
    const finMs: number = new Date(f.fin).getTime();
    if (Number.isNaN(finMs)) {
      vencidos.push({ ...f, frecuenciaDias, edadDias: Number.POSITIVE_INFINITY });
      continue;
    }
    const edadDias: number = (ahoraMs - finMs) / 86400000;
    if (edadDias > frecuenciaDias) vencidos.push({ ...f, frecuenciaDias, edadDias });
  }
  return { vencidos, desconocidos };
}

function imprimirPlan(vencidos: Vencido[], totalFilas: number, ahoraIso: string): void {
  console.log(`PLAN ACTUALIZACIÓN (dry-run, nada ejecutado): ${vencidos.length} vencidos de ${totalFilas} filas (ref ${ahoraIso}).`);
  const porBloque = new Map<string, Vencido[]>();
  for (const v of vencidos) {
    const lista: Vencido[] = porBloque.get(v.bloque) ?? [];
    lista.push(v);
    porBloque.set(v.bloque, lista);
  }
  const bloquesOrdenados: string[] = [...porBloque.keys()].sort();
  for (const b of bloquesOrdenados) {
    const lista: Vencido[] = (porBloque.get(b) ?? []).sort((x: Vencido, y: Vencido) =>
      x.municipio.localeCompare(y.municipio),
    );
    const freq: number = esBloque(b) ? CONFIG.frecuenciasDias[b] : 0;
    console.log(`# bloque ${b} — cada ${freq}d — ${lista.length} pares`);
    for (const v of lista) {
      const edad: string = Number.isFinite(v.edadDias) ? `${v.edadDias.toFixed(1)}d` : "sin-fin";
      console.log(`  # ${v.municipio} [${v.fuente}@${v.edicion || "sinedicion"} ${v.estado} fin=${v.fin ?? "?"} edad=${edad}]`);
      console.log(`  ${comandoCarga(v.municipio, v.bloque)}`);
    }
  }
  if (vencidos.length === 0) console.log("Sin vencidos: todo dentro de frecuencia. Manual: --ines X --bloque Y imprime el comando --solo.");
}

function ejecutarUnPar(v: Vencido, timeoutMs: number): number {
  const cmd: string = comandoCarga(v.municipio, v.bloque);
  const stamp: string = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync("tmp/agente-actualiza", { recursive: true });
  const logPath: string = `tmp/agente-actualiza/ejecucion-${v.municipio}-${v.bloque}-${stamp}.log`;
  console.log(`EJECUTAR (PoC, un solo par): ${v.municipio} ${v.bloque} [${v.fuente}@${v.edicion}]`);
  console.log(`  ${cmd}`);
  const r = spawnSync(cmd, { timeout: timeoutMs, encoding: "utf-8", shell: true, maxBuffer: 10 * 1024 * 1024 });
  const salida: string =
    `# comando: ${cmd}\n# par: ${v.municipio} ${v.bloque} [${v.fuente}@${v.edicion}]\n` +
    `# inicio: ${new Date().toISOString()} timeout_ms=${timeoutMs} estado=${r.status} signal=${String(r.signal)}\n` +
    `--- stdout ---\n${String(r.stdout ?? "").slice(0, 20000)}\n--- stderr ---\n${String(r.stderr ?? "").slice(0, 20000)}\n`;
  writeFileSync(logPath, salida);
  console.log(`Log: ${logPath} (estado=${String(r.status)} signal=${String(r.signal)})`);
  return r.status ?? 1;
}

async function main(): Promise<void> {
  const inesArg: string | null = leerArg("--ines");
  const bloqueFiltro: string | null = leerArg("--bloque");
  const ejecutar: boolean = tieneFlag("--ejecutar");
  const timeoutMs: number = Number(leerArg("--timeout-ms") ?? String(TIMEOUT_MS_DEFECTO));
  const ines: string[] = inesArg === null ? [...MUESTRA] : inesArg.split(",").map((s: string) => s.trim()).filter((s: string) => s !== "");
  if (ines.length === 0) throw new Error("Sin INEs (--ines vacío).");
  if (bloqueFiltro !== null && !esBloque(bloqueFiltro)) {
    throw new Error(`--bloque desconocido: ${bloqueFiltro} (válidos: ${Object.keys(CONFIG.frecuenciasDias).join(",")}).`);
  }
  const filas: FilaCobertura[] = await leerCobertura(ines);
  const ahoraIso: string = new Date().toISOString();
  const { vencidos, desconocidos } = detectarVencidos(filas, Date.parse(ahoraIso));
  for (const d of desconocidos) console.log(`  AVISO bloque sin frecuencia CONFIG: ${d.municipio} ${d.bloque} [${d.fuente}] (se omite).`);
  const filtrados: Vencido[] = bloqueFiltro === null ? vencidos : vencidos.filter((v: Vencido) => v.bloque === bloqueFiltro);
  if (!ejecutar) {
    imprimirPlan(filtrados, filas.length, ahoraIso);
    if (filtrados.length === 0 && bloqueFiltro !== null && ines.length === 1) {
      console.log(`Manual (no vencido, dentro de frecuencia):\n  ${comandoCarga(ines[0], bloqueFiltro)}`);
    }
    return;
  }
  // PoC: un solo par. Si el filtro manual no está vencido, se lanza igual (botón manual).
  let objetivo: Vencido | null = filtrados.length > 0 ? filtrados[0] : null;
  if (objetivo === null && ines.length === 1 && bloqueFiltro !== null) {
    const existente: FilaCobertura | undefined = filas.find(
      (f: FilaCobertura) => f.municipio === ines[0] && f.bloque === bloqueFiltro,
    );
    const freq: number = CONFIG.frecuenciasDias[bloqueFiltro as Bloque];
    objetivo = {
      municipio: ines[0],
      bloque: bloqueFiltro,
      fuente: existente?.fuente ?? "",
      edicion: existente?.edicion ?? "",
      estado: existente?.estado ?? "manual",
      fin: existente?.fin ?? null,
      objetos_publicados: existente?.objetos_publicados ?? 0,
      frecuenciaDias: freq,
      edadDias: 0,
    };
  }
  if (objetivo === null) {
    console.log("Nada que ejecutar: sin vencidos para el filtro (quitar --bloque/--ines para ver el plan).");
    return;
  }
  const estado: number = ejecutarUnPar(objetivo, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : TIMEOUT_MS_DEFECTO);
  if (estado !== 0) throw new Error(`El par PoC terminó con estado ${estado} (ver log en tmp/agente-actualiza/).`);
}

main().catch((e: unknown) => {
  console.error(`FALLO actualizar: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
