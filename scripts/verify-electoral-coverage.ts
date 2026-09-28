// Verifica la cobertura electoral en R2 para una lista de municipios.
// Comprueba si tienen datos electorales (elec_*) y si el ámbito está bien declarado.
//
// Uso:
//   npx tsx scripts/verify-electoral-coverage.ts 02007 28079 45090
//   npx tsx scripts/verify-electoral-coverage.ts --all
//
// Sin red: solo lee de R2 (base pública). No escribe nada.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const R2_BASE = "https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev";
const CATALOG_PATH = join(process.cwd(), "scripts", "data", "municipios-ine.json");

interface CatalogEntry {
  codigo_ine: string;
  nombre: string;
  provincia_codigo: string;
  poblacion: number;
}

interface VerificacionMunicipio {
  ine: string;
  nombre: string;
  enR2: boolean;
  totalValores: number;
  valoresElectorales: number;
  tieneDatosElectorales: boolean;
  ambitoDeclarado: string | null;
  problema: string | null;
}

async function verificarMunicipio(ine: string): Promise<VerificacionMunicipio> {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as CatalogEntry[];
  const entry = catalog.find((m) => m.codigo_ine === ine);
  const nombre = entry?.nombre ?? ine;

  try {
    const res = await fetch(`${R2_BASE}/socideas/v2/municipios/${ine}.json`);
    if (!res.ok) {
      return {
        ine,
        nombre,
        enR2: false,
        totalValores: 0,
        valoresElectorales: 0,
        tieneDatosElectorales: false,
        ambitoDeclarado: null,
        problema: "no_en_r2",
      };
    }
    const json = (await res.json()) as {
      version: number;
      valores: Array<{
        indicator: { slug: string };
        dimensiones?: Record<string, string>;
      }>;
    };
    const valores = json.valores ?? [];
    const electorales = valores.filter((v) => v.indicator?.slug?.startsWith("elec_"));
    const ambitos = new Set<string>();
    for (const v of electorales) {
      if (v.dimensiones?.ambito) ambitos.add(v.dimensiones.ambito);
    }
    const ambitoDeclarado = ambitos.size === 1 ? [...ambitos][0] : null;
    const problema =
      electorales.length === 0
        ? "sin_datos_electorales"
        : ambitos.size === 0
          ? "ambito_no_declarado"
          : ambitos.size > 1
            ? "ambitos_mixtos"
            : null;

    return {
      ine,
      nombre,
      enR2: true,
      totalValores: valores.length,
      valoresElectorales: electorales.length,
      tieneDatosElectorales: electorales.length > 0,
      ambitoDeclarado,
      problema,
    };
  } catch (e) {
    return {
      ine,
      nombre,
      enR2: false,
      totalValores: 0,
      valoresElectorales: 0,
      tieneDatosElectorales: false,
      ambitoDeclarado: null,
      problema: "error_lectura",
    };
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let ines: string[];

  if (args.includes("--all")) {
    const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as CatalogEntry[];
    ines = catalog.map((m) => m.codigo_ine).filter((c) => /^\d{5}$/.test(c));
  } else {
    ines = args.filter((a) => /^\d{5}$/.test(a));
  }

  if (ines.length === 0) {
    console.error("Uso: npx tsx scripts/verify-electoral-coverage.ts <INE>... | --all");
    process.exit(1);
  }

  console.log(`Verificando cobertura electoral para ${ines.length} municipios...`);
  console.log("");

  const resultados: VerificacionMunicipio[] = [];
  for (const ine of ines) {
    const r = await verificarMunicipio(ine);
    resultados.push(r);
    const icono = r.tieneDatosElectorales ? "OK" : "FALTA";
    const problema = r.problema ? ` [${r.problema}]` : "";
    console.log(
      `${icono} ${r.ine} ${r.nombre}: ${r.valoresElectorales}/${r.totalValores} electorales, ámbito=${r.ambitoDeclarado ?? "ND"}${problema}`,
    );
  }

  const conDatos = resultados.filter((r) => r.tieneDatosElectorales);
  const sinDatos = resultados.filter((r) => !r.tieneDatosElectorales);
  const conProblemas = resultados.filter((r) => r.problema !== null);

  console.log("");
  console.log("=== RESUMEN ===");
  console.log(`Total: ${resultados.length}`);
  console.log(`Con datos electorales: ${conDatos.length}`);
  console.log(`Sin datos electorales: ${sinDatos.length}`);
  console.log(`Con problemas: ${conProblemas.length}`);

  if (sinDatos.length > 0) {
    console.log("");
    console.log("Municipios sin datos electorales:");
    for (const r of sinDatos) {
      console.log(`  ${r.ine} ${r.nombre} (${r.problema})`);
    }
  }

  if (conProblemas.length > 0) {
    console.log("");
    console.log("Municipios con problemas:");
    for (const r of conProblemas) {
      console.log(`  ${r.ine} ${r.nombre}: ${r.problema}`);
    }
  }

  if (sinDatos.length > 0 || conProblemas.length > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  process.exit(1);
});
