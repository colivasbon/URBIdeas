// Fase 3 — Pruebas de la plataforma de cargas (sin red ni remoto).
//
// Uso: npx tsx --test scripts/tests/incideas-fase3-muestra.test.ts
//
// Cubre: claves R2, snapshot determinista, trampas de ejes/CQL en las URLs
// que construimos, privacidad (titulares fuera de lo público), CSV
// autonómico, estados del contrato y ausencia de escrituras prohibidas.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { claveBloque } from "../../src/lib/incideas/fase3/r2";
import { calcularSnapshot } from "../../src/lib/incideas/fase3/cobertura";
import { bboxParaServicio } from "../incideas/fase2a/contrato";
import { urlGetFeature } from "../incideas/fase2a/wfs";
import { filaAPublico } from "../incideas/fase3/conectores/regcess";
import { parsearCsv } from "../incideas/fase3/conectores/autonomicas";

const RAIZ = process.cwd();

test("R2: claves por fuente/edición/municipio, edición saneada", () => {
  assert.equal(claveBloque("sanidad", "2026-10-01", "03031"), "incideas/fase3/sanidad/2026-10-01/03031.json");
  assert.equal(claveBloque("x", "a/b", "03031"), "incideas/fase3/x/ab/03031.json");
});

test("Snapshot: determinista, con prefijo y cambia con los datos", () => {
  const a = calcularSnapshot([{ bloque: "03031:sanidad", fuente: "regcess", edicion: "2026-10-01", n: 11 }], "v1");
  const b = calcularSnapshot([{ bloque: "03031:sanidad", fuente: "regcess", edicion: "2026-10-01", n: 11 }], "v1");
  const c = calcularSnapshot([{ bloque: "03031:sanidad", fuente: "regcess", edicion: "2026-10-01", n: 12 }], "v1");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^incideas:snap:[0-9a-f]+$/);
});

test("Ejes MITECO: WMS 1.1.1 lon/lat y 1.3.0 lat/lon; nunca CQL_FILTER", () => {
  const bb = { minLon: -0.2, minLat: 38.5, maxLon: -0.08, maxLat: 38.6 };
  assert.equal(bboxParaServicio("inspire-inundaciones-wms", "1.1.1", "EPSG:4326", bb), "-0.2,38.5,-0.08,38.6");
  assert.equal(bboxParaServicio("inspire-inundaciones-wms", "1.3.0", "EPSG:4326", bb), "38.5,-0.2,38.6,-0.08");
});

test("IGN: las consultas usan BBOX, jamás CQL_FILTER", () => {
  const url = urlGetFeature({
    base: "https://servicios.idee.es/wfs-inspire/hidrografia",
    servicio: "ign-hidrografia-wfs",
    version: "2.0.0",
    crs: "urn:ogc:def:crs:EPSG::4258",
    typenames: "hy-p:Watercourse",
    bboxLonLat: { minLon: -0.2, minLat: 38.5, maxLon: -0.08, maxLat: 38.6 },
  });
  assert.ok(url);
  assert.match(url, /bbox=/);
  assert.doesNotMatch(url, /cql_filter/i);
});

test("Privacidad: el titular de farmacia no sale en lo público", () => {
  const pub = filaAPublico({
    "Tipo centro": "E1. Oficinas de farmacia",
    "Nombre": "ANA MARIA MAGANA SUAREZ",
    Municipio: "Valle de Matamoros",
    Provincia: "Badajoz",
    CCAA: "Extremadura",
    CP: "06177",
  });
  assert.equal(pub?.nombre_publico, "Oficina de farmacia");
  assert.doesNotMatch(JSON.stringify(pub), /ANA MARIA/);
  assert.equal(typeof pub?.identidad_hash, "string");
  const centro = filaAPublico({
    "Tipo centro": "C1. Hospitales",
    "Nombre Centro": "Hospital General",
    Municipio: "Murcia",
    Provincia: "Murcia",
  });
  assert.equal(centro?.nombre_publico, "Hospital General");
});

test("CSV autonómico: separador, comillas y cabeceras", () => {
  const { cabeceras, filas } = parsearCsv('CODIGO;DENOMINACION;MUNICIPIO\n1;"Colegio ""El Pilar""";Pamplona\n2;IES Benidorm;Benidorm');
  assert.deepEqual(cabeceras, ["CODIGO", "DENOMINACION", "MUNICIPIO"]);
  assert.equal(filas.length, 2);
  assert.equal(filas[0][1], 'Colegio "El Pilar"');
});

test("Estados del contrato: los 7, sin más", () => {
  const estados = ["cargado", "cargado_parcial", "sin_cobertura", "no_aplicable", "fuente_caida", "cero_resultados", "pendiente_aportacion"];
  assert.equal(estados.length, 7);
  const mig = readFileSync(join(RAIZ, "supabase", "migrations", "043_incideas_fase3_control.sql"), "utf8");
  for (const e of estados) assert.match(mig, new RegExp(`'${e}'`), `estado ${e} en el CHECK`);
});

test("Fase 3 no escribe en SOCideas ni en municipios.poblacion", () => {
  const dir = join(RAIZ, "scripts", "incideas", "fase3");
  const ficheros: string[] = [];
  const caminar = (d: string): void => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      if (f.isDirectory()) caminar(join(d, f.name));
      else if (f.name.endsWith(".ts")) ficheros.push(join(d, f.name));
    }
  };
  caminar(dir);
  caminar(join(RAIZ, "src", "lib", "incideas", "fase3"));
  assert.ok(ficheros.length >= 10);
  for (const f of ficheros) {
    const src = readFileSync(f, "utf8");
    // Sin escrituras en municipios; la lectura del envelope R2 de SOCideas
    // (reutilización documentada) sí está permitida.
    assert.doesNotMatch(src, /UPDATE\s+municipios|INSERT\s+INTO\s+municipios|DELETE\s+FROM\s+municipios/i, f);
    assert.doesNotMatch(src, /\.from\(\s*["'](?!incideas_|municipios|provincias)/, `${f}: solo tablas incideas_* (y lectura de municipios/provincias)`);
    assert.doesNotMatch(src, /putBloque\(\s*["']socideas/, `${f}: no escribe prefijos SOCideas en R2`);
  }
});
