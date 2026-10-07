// Sello de snapshot Fase 3 desde la tabla de control (sin re-descargar).
//
//   npx tsx scripts/incideas/fase3/sellar-snapshot.ts --nota "Oleada CV ..." [--aprobar] [--prefijos 03,12,46] [--dry]
//
// Deriva el estado real de incideas_cobertura (solo pares cargado/
// cargado_parcial con objetos publicados > 0), en orden canónico estable
// (municipio, bloque, fuente, edición), calcula el id con calcularSnapshot y
// lo registra como borrador o aprobada. Es la vía para cerrar una oleada sin
// re-ejecutar el cargador (re-descargar 8.132 municipios es inviable).

import { config } from "dotenv";
import {
  calcularSnapshot,
  itemsDesdeControl,
  registrarSnapshot,
  controlClient,
  CONECTOR_VERSION,
  type FilaControlSnapshot,
} from "../../../src/lib/incideas/fase3/cobertura";

config({ path: ".env.local" });

function args(): { nota: string; aprobar: boolean; dry: boolean; prefijos: string[] } {
  const a = process.argv.slice(2);
  const get = (n: string): string | undefined => {
    const i = a.indexOf(n);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return {
    nota: get("--nota") ?? "",
    aprobar: a.includes("--aprobar"),
    dry: a.includes("--dry"),
    prefijos: (get("--prefijos") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  };
}

async function filasControl(prefijos: string[]): Promise<FilaControlSnapshot[]> {
  const c = controlClient();
  const filas: FilaControlSnapshot[] = [];
  const PAGINA = 1000;
  for (let desde = 0; ; desde += PAGINA) {
    let q = c
      .from("incideas_cobertura")
      .select("municipio,bloque,fuente,edicion,estado,objetos_publicados")
      .order("municipio")
      .order("bloque")
      .range(desde, desde + PAGINA - 1);
    if (prefijos.length > 0) q = q.or(prefijos.map((p) => `municipio.like.${p}%`).join(","));
    const { data, error } = await q;
    if (error) throw new Error(`control: ${error.message}`);
    filas.push(...((data ?? []) as FilaControlSnapshot[]));
    if ((data ?? []).length < PAGINA) break;
  }
  return filas;
}

async function main(): Promise<void> {
  const { nota, aprobar, dry, prefijos } = args();
  const filas = await filasControl(prefijos);
  const items = itemsDesdeControl(filas);
  const id = calcularSnapshot(items, CONECTOR_VERSION);
  const porBloque = new Map<string, { pares: number; objetos: number }>();
  for (const it of items) {
    const b = it.bloque.slice(it.bloque.indexOf(":") + 1);
    const acc = porBloque.get(b) ?? { pares: 0, objetos: 0 };
    acc.pares++;
    acc.objetos += it.n;
    porBloque.set(b, acc);
  }
  const municipios = new Set(items.map((i) => i.bloque.slice(0, i.bloque.indexOf(":"))));
  const ambito = prefijos.length > 0 ? ` (prefijos ${prefijos.join(",")})` : "";
  console.log(`Sello: ${items.length} pares, ${municipios.size} municipios${ambito}.`);
  for (const [b, v] of [...porBloque].sort((x, y) => y[1].pares - x[1].pares)) {
    console.log(`  ${b}: ${v.pares} pares, ${v.objetos} objetos`);
  }
  console.log(`Id: ${id}`);
  if (dry) {
    console.log("Dry-run: snapshot no registrada.");
    return;
  }
  const texto = nota || `Sello desde control: ${items.length} pares, ${municipios.size} municipios${ambito}.`;
  await registrarSnapshot(id, texto, CONECTOR_VERSION, aprobar ? "aprobada" : "borrador");
  console.log(`Snapshot ${id} (${aprobar ? "aprobada" : "borrador"}).`);
}

main().catch((e: unknown) => {
  console.error(`ERROR: ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
});
