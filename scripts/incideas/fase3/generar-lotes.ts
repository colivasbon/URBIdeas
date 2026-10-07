// Generador de lotes de una oleada de cargas Fase 3 (por provincia).
//
//   npx tsx scripts/incideas/fase3/generar-lotes.ts --ola 2 [--destino tmp/oleada2] [--dry]
//
// Lee municipios (solo lectura) y excluye lo ya presente en
// incideas_cobertura. Orden de complejidad creciente por número de
// municipios de la provincia (la columna municipios.poblacion está auditada
// como no fiable, MEMORIA §10); dentro de cada provincia, código INE.
// Los regímenes foral/insular/ciudades autónomas se marcan en el índice
// (el cargador ya aplica sus fuentes propias). Escribe:
//   destino/lote-<prov>.json   { ola, provincia, provincia_nombre, munis, ines }
//   destino/indice.json        orden, fichero, provincia, munis, regimen
//   destino/orden.txt          un fichero de lote por línea (orden del driver)

import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { controlClient } from "../../../src/lib/incideas/fase3/cobertura";

config({ path: ".env.local" });

const REGIMEN: Record<string, string> = {
  "01": "foral (Álava)",
  "20": "foral (Gipuzkoa)",
  "48": "foral (Bizkaia)",
  "31": "foral (Navarra)",
  "07": "insular (Baleares)",
  "35": "insular (Las Palmas)",
  "38": "insular (S/C de Tenerife)",
  "51": "ciudad autónoma (Ceuta)",
  "52": "ciudad autónoma (Melilla)",
};

function args(): { ola: string; destino: string; dry: boolean } {
  const a = process.argv.slice(2);
  const get = (n: string): string | undefined => {
    const i = a.indexOf(n);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return {
    ola: get("--ola") ?? "2",
    destino: get("--destino") ?? "tmp/oleada2",
    dry: a.includes("--dry"),
  };
}

interface FilaMunicipio {
  codigo_ine: string;
  nombre: string;
  provincias: { nombre: string } | Array<{ nombre: string }>;
}

async function main(): Promise<void> {
  const { ola, destino, dry } = args();
  const c = controlClient();

  const munis: FilaMunicipio[] = [];
  const PAGINA = 1000;
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await c
      .from("municipios")
      .select("codigo_ine,nombre,provincias!inner(nombre)")
      .order("codigo_ine")
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(`municipios: ${error.message}`);
    munis.push(...((data ?? []) as unknown as FilaMunicipio[]));
    if ((data ?? []).length < PAGINA) break;
  }

  const cargados = new Set<string>();
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await c.from("incideas_cobertura").select("municipio").order("municipio").range(desde, desde + PAGINA - 1);
    if (error) throw new Error(`cobertura: ${error.message}`);
    for (const r of (data ?? []) as Array<{ municipio: string }>) cargados.add(r.municipio);
    if ((data ?? []).length < PAGINA) break;
  }

  const restantes = munis.filter((m) => !cargados.has(m.codigo_ine));
  const porProv = new Map<string, FilaMunicipio[]>();
  for (const m of restantes) {
    const prov = m.codigo_ine.slice(0, 2);
    const arr = porProv.get(prov) ?? [];
    arr.push(m);
    porProv.set(prov, arr);
  }

  const lotes = [...porProv.entries()]
    .map(([prov, lista]) => {
      const nombre = (() => {
        const p = lista[0]?.provincias;
        return Array.isArray(p) ? p[0]?.nombre ?? "" : p?.nombre ?? "";
      })();
      return { prov, nombre, lista };
    })
    .sort((a, b) => a.lista.length - b.lista.length || (a.prov < b.prov ? -1 : 1));

  const indice: Array<Record<string, unknown>> = [];
  const lineas: string[] = [];
  let total = 0;
  for (const l of lotes) {
    const ines = [...l.lista]
      .map((m) => m.codigo_ine)
      .sort((a, b) => (a < b ? -1 : 1));
    const fichero = `${destino}/lote-${l.prov}.json`;
    indice.push({
      orden: indice.length + 1,
      fichero,
      provincia: l.prov,
      provincia_nombre: l.nombre,
      munis: ines.length,
      regimen: REGIMEN[l.prov] ?? null,
    });
    lineas.push(fichero);
    total += ines.length;
    if (!dry) {
      mkdirSync(dirname(fichero), { recursive: true });
      writeFileSync(fichero, JSON.stringify({ ola, provincia: l.prov, provincia_nombre: l.nombre, munis: ines.length, ines }, null, 0) + "\n");
    }
  }

  console.log(`Ola ${ola}: ${indice.length} lotes, ${total} municipios restantes (${cargados.size} ya en control).`);
  console.log("orden  provincia                       munis  regimen");
  for (const i of indice) {
    console.log(`${String(i["orden"]).padStart(5)}  ${String(i["provincia"])} ${String(i["provincia_nombre"]).padEnd(26).slice(0, 26)} ${String(i["munis"]).padStart(5)}  ${i["regimen"] ?? ""}`);
  }
  if (dry) {
    console.log("Dry-run: no se escriben lotes.");
    return;
  }
  writeFileSync(`${destino}/indice.json`, JSON.stringify({ ola, generado: new Date().toISOString(), lotes: indice }, null, 2) + "\n");
  writeFileSync(`${destino}/orden.txt`, lineas.join("\r\n") + "\r\n");
  console.log(`Índice: ${destino}/indice.json · Orden: ${destino}/orden.txt`);
}

main().catch((e: unknown) => {
  console.error(`ERROR: ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
});
