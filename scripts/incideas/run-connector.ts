// INCideas — ejecución de conectores para un municipio.
//
// Uso:
//   npx tsx scripts/incideas/run-connector.ts --conector all --ine 03031 --nombre-municipio Benidorm
//     → DRY-RUN con store en memoria (no toca la base de datos). Ejecuta contra fuentes reales.
//
//   npx tsx scripts/incideas/run-connector.ts --conector all --ine 03031 --nombre-municipio Benidorm --go
//     → Escribe en Supabase (requiere migración 039 aplicada).
//
//   --repeticion N  ejecuta N veces seguidas para comprobar idempotencia (dry-run).
//   --conector <id[,id…]> ejecuta uno o varios conectores (ver registry.ts). Los que no
//                   cubren el municipio (p. ej. fuentes autonómicas) se omiten.
//
// Con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local, el dry-run lee de
// la base de datos el límite y el nombre del municipio (solo lectura); --go además escribe.
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { CONNECTORS, getConnector, listarConectores } from "../../src/lib/incideas/connectors/registry";
import type { Connector } from "../../src/lib/incideas/connectors/types";
import { ejecutarConector } from "../../src/lib/incideas/pipeline/runner";
import { depsMemoria, depsSupabase, cargarBoundaryDeBD } from "./deps";

config({ path: ".env.local" });

interface Args {
  conector: string;
  ine: string;
  nombreMunicipio?: string;
  go: boolean;
  repeticion: number;
  usuario: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (n: string) => {
    const i = argv.indexOf(n);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    conector: get("--conector") ?? "all",
    ine: get("--ine") ?? "03031",
    nombreMunicipio: get("--nombre-municipio"),
    go: argv.includes("--go"),
    repeticion: get("--repeticion") ? parseInt(get("--repeticion") as string, 10) : 1,
    usuario: get("--usuario") ?? "cli:incideas",
  };
}

function resumen(resultado: Awaited<ReturnType<typeof ejecutarConector>>) {
  const c = resultado.counts;
  return (
    `[${resultado.conector}] ${resultado.estado} · leídos=${resultado.leidos} ` +
    `insertados=${c.insertados} actualizados=${c.actualizados} sin_cambios=${c.sin_cambios} ` +
    `posibles_bajas=${c.posibles_bajas} rechazados=${c.rechazados} duplicados=${resultado.duplicados.length}` +
    (resultado.errores.length ? ` errores=${resultado.errores.length}` : "")
  );
}

async function main() {
  const args = parseArgs();
  console.log(
    `INCideas · conector=${args.conector} · INE=${args.ine} · modo=${args.go ? "ESCRITURA" : "DRY-RUN"}`
  );

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (args.go && (!url || !key)) {
    console.error("ERROR: --go requiere NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  // Cliente de lectura (límite y nombre) en ambos modos; solo escribe con --go.
  const lector: SupabaseClient | null = url && key ? createClient(url, key) : null;
  const supabase = args.go ? lector : null;

  let nombreMunicipio = args.nombreMunicipio;
  if (!nombreMunicipio && lector) {
    const { data } = await lector
      .from("municipios")
      .select("nombre")
      .eq("codigo_ine", args.ine)
      .maybeSingle();
    nombreMunicipio = (data?.nombre as string | undefined) ?? undefined;
  }

  const ids =
    args.conector === "all"
      ? CONNECTORS.map((c) => c.id)
      : args.conector.split(",").map((s) => s.trim()).filter(Boolean);

  const conectores: Connector[] = [];
  for (const id of ids) {
    const c = getConnector(id);
    if (!c) {
      console.error(`Conector desconocido: ${id}. Disponibles: ${listarConectores().map((x) => x.id).join(", ")}`);
      process.exit(1);
    }
    if (c.aplica && !c.aplica(args.ine)) {
      console.log(`  [${c.id}] omitido: la fuente no cubre el municipio ${args.ine}`);
      continue;
    }
    conectores.push(c);
  }

  // El store se crea UNA vez: así las repeticiones en dry-run comprueban la
  // idempotencia real (la 2ª ejecución debe actualizar o no cambiar, nunca duplicar).
  const deps = supabase ? depsSupabase(supabase) : depsMemoria();

  for (let r = 1; r <= args.repeticion; r++) {
    if (args.repeticion > 1) console.log(`\n=== Repetición ${r}/${args.repeticion} ===`);
    let boundary: GeoJSON.Geometry | null = null;

    if (!conectores.some((c) => c.id === "osm-boundary") && lector) {
      boundary = await cargarBoundaryDeBD(lector, args.ine);
    }

    for (const c of conectores) {
      const parametros = nombreMunicipio ? { nombre_municipio: nombreMunicipio } : {};
      const res = await ejecutarConector(c, deps, {
        codigoINE: args.ine,
        boundary,
        parametros,
        usuario: args.usuario,
      });
      if (res.boundary) boundary = res.boundary;
      console.log("  " + resumen(res));
      if (res.errores.length) res.errores.forEach((e) => console.log("    ! " + e));
      if (res.duplicados.length) {
        for (const g of res.duplicados.slice(0, 5)) {
          console.log(`    ~ duplicado ${g.tipo}: ${g.motivo} (${g.ids.join(", ")})`);
        }
      }
    }
  }

  console.log("\nFin.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
