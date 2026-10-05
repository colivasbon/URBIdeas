// Genera el libro municipal de INCideas para un código INE y sus formatos
// abiertos asociados. La base de datos solo se lee: las correcciones se aplican
// en memoria al construir el libro.
//
// Uso:
//   npx tsx scripts/incideas/generar-libro.ts 03031
//
// Variables de entorno:
//   NEXT_PUBLIC_SUPABASE_URL       proyecto de Supabase
//   SUPABASE_SERVICE_ROLE_KEY       clave de servicio (solo lectura aquí)
//   RUTA_SALIDA                    carpeta de salida (opcional)
//
// Requisitos: Node 22 o superior (usa node:sqlite para el GeoPackage) y la
// dependencia `exceljs`, que ya tiene el proyecto.

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";
import {
  cargarLibroMunicipal,
  construirCSVInventario,
  construirGeoJSONInventario,
  type ClienteSupabase,
} from "../../src/lib/incideas/cargar-libro";
import { construirGeoPackageInventario } from "../../src/lib/incideas/formato-abierto-gpkg";
import { construirLibroMunicipal } from "../../src/lib/incideas/libro-municipal";
import { CATEGORIAS_INVENTARIO } from "../../src/lib/incideas/catalogo";

// Se lee el mismo `.env.local` que usa el resto de INCideas, para que el CLI no
// exija exportar variables a mano y la web y la línea de comandos lean las mismas.
config({ path: ".env.local", quiet: true });

// ---------------------------------------------------------------------------
// Argumentos y entorno
// ---------------------------------------------------------------------------

const codigoIne = (process.argv[2] ?? "03031").padStart(5, "0");

function exigir(nombre: string): string {
  const v = process.env[nombre];
  if (!v) {
    console.error(`Falta la variable de entorno ${nombre}.`);
    process.exit(2);
  }
  return v;
}

const url = exigir("NEXT_PUBLIC_SUPABASE_URL");
const clave = exigir("SUPABASE_SERVICE_ROLE_KEY");
const carpetaSalida = path.resolve(
  process.env.RUTA_SALIDA ?? path.join(process.cwd(), "salida", `incideas_${codigoIne}`)
);

// ---------------------------------------------------------------------------
// Utilidades de salida
// ---------------------------------------------------------------------------

function kb(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function alineado(etiqueta: string, valor: string, ancho = 34): string {
  return `${etiqueta.padEnd(ancho)}${valor}`;
}

// ---------------------------------------------------------------------------
// Comprobaciones previas
// ---------------------------------------------------------------------------

/**
 * Genera todas las salidas. Se mantiene en una función porque el proyecto se
 * compila a CommonJS, donde el nivel superior no admite await.
 */
async function main(): Promise<void> {
  const cliente = createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as ClienteSupabase;

  console.log(`Generando el libro municipal de ${codigoIne}.`);
  console.log(alineado("Salida", carpetaSalida));
  console.log("");

  // ---------------------------------------------------------------------------
  // Carga
  // ---------------------------------------------------------------------------

  const { entrada, avisos } = await cargarLibroMunicipal(cliente, codigoIne);

  console.log(alineado("Municipio", entrada.municipio));
  console.log(alineado("Provincia", entrada.provincia));
  console.log(alineado("Comunidad autónoma", entrada.comunidad_autonoma));
  console.log(alineado("Comarca", entrada.comarca));
  console.log(alineado("Población", entrada.poblacion === null ? "Sin dato" : String(entrada.poblacion)));
  console.log(
    alineado(
      "Superficie",
      entrada.superficie_km2 === null ? "Sin dato" : `${entrada.superficie_km2.toFixed(2)} km2`
    )
  );
  console.log(alineado("Registros", String(entrada.filas.length)));
  console.log(alineado("Fuentes", String(entrada.fuentes.length)));
  console.log("");

  // ---------------------------------------------------------------------------
  // Comprobaciones de calidad, antes de escribir nada
  // ---------------------------------------------------------------------------

  const conCoordenadas = entrada.filas.filter((f) => f.lat !== null && f.lng !== null);
  const sinCoordenadas = entrada.filas.length - conCoordenadas.length;
  const porRevisar = entrada.filas.filter((f) => f.estado_nombre === "por_revisar").length;
  const porRegistrar = entrada.filas.filter((f) => f.estado_nombre === "por_registrar").length;
  const plantilla = entrada.filas.filter((f) => f.fuente.includes("Plantilla municipal")).length;
  const fueraDeRango = conCoordenadas.filter(
    (f) => f.lat! < 37.9 || f.lat! > 38.6 || f.lng! < -0.2 || f.lng! > 0.0
  );
  const duplicados = new Map<string, number>();
  for (const f of entrada.filas) {
    const clave = `${f.categoria}|${f.tipo}|${(f.nombre || "").toLowerCase().trim()}|${(f.direccion || "").toLowerCase().trim()}`;
    duplicados.set(clave, (duplicados.get(clave) ?? 0) + 1);
  }
  const repetidos = [...duplicados.values()].filter((n) => n > 1).length;

  console.log("Comprobaciones de calidad");
  console.log(alineado("Con coordenadas", String(conCoordenadas.length)));
  console.log(alineado("Sin coordenadas", String(sinCoordenadas)));
  console.log(alineado("Nombre por revisar", String(porRevisar)));
  console.log(alineado("Nombre por registrar", String(porRegistrar)));
  console.log(alineado("Fuera del término", String(fueraDeRango.length)));
  console.log(alineado("Grupos duplicados", String(repetidos)));
  console.log("");

  if (fueraDeRango.length > 0) {
    console.log("AVISO: hay coordenadas fuera del ámbito de Benidorm:");
    for (const f of fueraDeRango.slice(0, 10)) {
      console.log(`  ${f.nombre} (${f.lat}, ${f.lng})`);
    }
    console.log("");
  }

  if (avisos.length > 0) {
    console.log("Avisos del cargador");
    for (const a of avisos) console.log(`  - ${a}`);
    console.log("");
  }

  // Reparto por categoría, que es el eje de lectura del libro.
  console.log("Reparto por categoría");
  for (const c of CATEGORIAS_INVENTARIO) {
    const n = entrada.filas.filter((f) => f.categoria === c).length;
    if (n > 0) console.log(alineado(`  ${c}`, String(n), 30));
  }
  console.log("");

  // ---------------------------------------------------------------------------
  // Escritura de las salidas
  // ---------------------------------------------------------------------------

  await fs.mkdir(carpetaSalida, { recursive: true });

  const nombre = `${entrada.municipio.replace(/[^\w\-]+/g, "_")}_${codigoIne}`;

  const salidas: { etiqueta: string; fichero: string; bytes: number }[] = [];

  // 1. Libro Excel
  const xlsx = await construirLibroMunicipal(entrada);
  const rutaXlsx = path.join(carpetaSalida, `${nombre}_inventario.xlsx`);
  await fs.writeFile(rutaXlsx, xlsx);
  salidas.push({ etiqueta: "Libro Excel", fichero: rutaXlsx, bytes: xlsx.length });

  // 2. CSV
  const csv = construirCSVInventario(entrada.filas);
  const rutaCsv = path.join(carpetaSalida, `${nombre}_inventario.csv`);
  await fs.writeFile(rutaCsv, csv, "utf8");
  salidas.push({ etiqueta: "CSV", fichero: rutaCsv, bytes: Buffer.byteLength(csv) });

  // 3. GeoJSON
  const geojson = construirGeoJSONInventario(entrada.filas, nombre);
  const rutaGeoJson = path.join(carpetaSalida, `${nombre}_inventario.geojson`);
  await fs.writeFile(rutaGeoJson, geojson, "utf8");
  salidas.push({
    etiqueta: "GeoJSON",
    fichero: rutaGeoJson,
    bytes: Buffer.byteLength(geojson),
  });

  // 4. GeoPackage
  let geoPackageOk = true;
  try {
    const gpkg = construirGeoPackageInventario(entrada.filas, nombre);
    const rutaGpkg = path.join(carpetaSalida, `${nombre}_inventario.gpkg`);
    await fs.writeFile(rutaGpkg, gpkg);
    salidas.push({ etiqueta: "GeoPackage", fichero: rutaGpkg, bytes: gpkg.length });
  } catch (e) {
    geoPackageOk = false;
    console.log(`AVISO: no se ha podido escribir el GeoPackage: ${(e as Error).message}`);
    console.log("       El resto de formatos sí están completos.");
  }
  console.log("");

  // 5. Informe de la generación, que deja constancia de qué se ha publicado
  const informe = [
    `# Informe de generación — ${entrada.municipio} (${codigoIne})`,
    "",
    `Generado el ${entrada.generado_en}.`,
    "",
    "## Territorio",
    "",
    `- Municipio: ${entrada.municipio}`,
    `- Provincia: ${entrada.provincia}`,
    `- Comunidad autónoma: ${entrada.comunidad_autonoma}`,
    `- Comarca: ${entrada.comarca}`,
    `- Población: ${entrada.poblacion ?? "sin dato en la base"}`,
    `- Superficie: ${entrada.superficie_km2 === null ? "sin dato" : `${entrada.superficie_km2} km2 (calculada sobre la geometría almacenada)`}`,
    "",
    "## Contenido",
    "",
    `- Registros: ${entrada.filas.length}`,
    `- Con coordenadas: ${conCoordenadas.length}`,
    `- Sin coordenadas: ${sinCoordenadas}`,
    `- Con nombre pendiente de revisión: ${porRevisar}`,
    `- Con nombre pendiente de registrar: ${porRegistrar}`,
    `- Grupos con datos aparentemente duplicados: ${repetidos}`,
    "",
    "## Reparto por categoría",
    "",
    "| Categoría | Registros |",
    "| --- | ---: |",
    ...CATEGORIAS_INVENTARIO.map((c) => {
      const n = entrada.filas.filter((f) => f.categoria === c).length;
      return `| ${c} | ${n} |`;
    }),
    "",
    "## Fuentes",
    "",
    "| Fuente | Organismo | Registros | Licencia |",
    "| --- | --- | ---: | --- |",
    ...entrada.fuentes.map(
      (f) => `| ${f.nombre} | ${f.organismo} | ${f.registros_en_libro} | ${f.licencia} |`
    ),
    "",
    "## Correcciones aplicadas en lectura",
    "",
    "Ninguna de estas correcciones ha modificado la base de datos.",
    "",
    "- Etiqueta del sistema de referencia: los " +
      `${plantilla} registros de la plantilla municipal declaran ahora ETRS89 UTM 30 ` +
      "(EPSG:25830), que es el sistema real de la plantilla. Sus coordenadas ya " +
      "estaban en grados y no se han vuelto a convertir.",
    `- Nombres numéricos: ${porRevisar} registros conservan su cifra y se marcan como pendientes de revisión, porque no hay forma segura de saber a qué elemento concreto corresponden.`,
    "- Los enlaces solo se publican si el dominio está en la lista blanca.",
    "",
    "## Avisos",
    "",
    ...(avisos.length ? avisos.map((a) => `- ${a}`) : ["- Sin avisos."]),
    "",
    "## Ficheros",
    "",
    ...salidas.map((s) => `- ${s.etiqueta}: \`${path.basename(s.fichero)}\` (${kb(s.bytes)})`),
    ...(geoPackageOk ? [] : ["- GeoPackage: no generado."]),
    "",
  ].join("\n");
  const rutaInforme = path.join(carpetaSalida, "informe.md");
  await fs.writeFile(rutaInforme, informe, "utf8");

  // ---------------------------------------------------------------------------
  // Resumen final
  // ---------------------------------------------------------------------------

  console.log("Ficheros generados");
  for (const s of salidas) {
    console.log(alineado(`  ${s.etiqueta}`, `${path.basename(s.fichero)}  (${kb(s.bytes)})`, 16));
  }
  console.log(alineado("  Informe", path.basename(rutaInforme), 16));
  console.log("");
  console.log(`Carpeta: ${carpetaSalida}`);

  // Si no queda ningún punto, el GeoPackage y el GeoJSON saldrían vacíos: se avisa
  // para que no se confunda con un fallo de generación.
  if (conCoordenadas.length === 0) {
    console.log("");
    console.log("AVISO: ningún registro tiene coordenadas; GeoJSON y GeoPackage quedan sin elementos.");
  }

}

main().catch((e: unknown) => {
  console.error("");
  console.error("La generación ha fallado:");
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exitCode = 1;
});
