// Tests de la lógica pura del pipeline INCideas (src/lib/incideas/pipeline).
// Uso: npx tsx --test scripts/tests/incideas-pipeline.test.ts
//
// No tocan red ni base de datos: usan el store en memoria. Los datos de
// ejemplo son sintéticos y se marcan como tales; no representan datos reales.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeName,
  normalizePhone,
  normalizeAddress,
  normalizePostal,
  categoriaDesdeOSM,
} from "../../src/lib/incideas/pipeline/normalize";
import { computeHuella } from "../../src/lib/incideas/pipeline/huella";
import {
  validarEspacial,
  pointInPolygon,
  ejesIntercambiados,
} from "../../src/lib/incideas/pipeline/geo";
import { detectarDuplicados, type CandidatoDedup } from "../../src/lib/incideas/pipeline/dedup";
import { utmToLatLng, pareceUTM } from "../../src/lib/incideas/pipeline/utm";
import { procesarLote } from "../../src/lib/incideas/pipeline/upsert";
import { MemoryRegistroStore } from "../../src/lib/incideas/pipeline/memory-store";
import { normalizeFeature } from "../../src/lib/incideas/pipeline/normalize";
import type { EjecucionContext, RawFeature } from "../../src/lib/incideas/pipeline/types";

// ─── Normalización ───────────────────────────────────────────────────────────

test("normalizeName: quita diacríticos, minúsculas y puntuación de borde", () => {
  assert.equal(normalizeName("  Farmacia  Ochoa, S.L. "), "farmacia ochoa s l");
  assert.equal(normalizeName("Alcalá de Xivert"), "alcala de xivert");
  assert.equal(normalizeName(null), "");
});

test("normalizePhone: elimina prefijo 34 y no numéricos", () => {
  assert.equal(normalizePhone("+34 965 85 85 85"), "965858585");
  assert.equal(normalizePhone("0034-965-85-85-85"), "965858585");
  assert.equal(normalizePhone("965858585"), "965858585");
  assert.equal(normalizePhone("123"), undefined);
});

test("normalizeAddress: unifica tipos de vía", () => {
  assert.equal(normalizeAddress("Avda. de la Comunidad Valenciana, 5"), "avenida de la comunidad valenciana, 5");
  assert.equal(normalizeAddress("C/ Mayor 3"), "calle mayor 3");
});

test("normalizePostal: extrae 5 dígitos", () => {
  assert.equal(normalizePostal("03501"), "03501");
  assert.equal(normalizePostal("ES-03501 Benidorm"), "03501");
  assert.equal(normalizePostal("abc"), undefined);
});

test("categoriaDesdeOSM: mapea etiquetas conocidas y descarta desconocidas", () => {
  assert.deepEqual(categoriaDesdeOSM({ amenity: "pharmacy" }), {
    categoria: "equipamientos",
    subcategoria: "farmacia",
  });
  assert.deepEqual(categoriaDesdeOSM({ tourism: "hotel" }), {
    categoria: "infraestructuras",
    subcategoria: "alojamiento",
  });
  assert.deepEqual(categoriaDesdeOSM({ amenity: "veterinary" }), {
    categoria: "animales",
    subcategoria: "clinica_veterinaria",
  });
  assert.equal(categoriaDesdeOSM({ amenity: "bench" }), null);
});

// ─── Huella ──────────────────────────────────────────────────────────────────

test("computeHuella: determinista y sensible a la fuente", () => {
  const base = {
    codigoINE: "03031",
    categoria: "equipamientos" as const,
    nombreNormalizado: "farmacia ochoa",
    lat: 38.5357759,
    lon: -0.1031244,
  };
  const a = computeHuella({ ...base, fuente: "OpenStreetMap (Overpass)" });
  const b = computeHuella({ ...base, fuente: "OpenStreetMap (Overpass)" });
  const c = computeHuella({ ...base, fuente: "Otra fuente" });
  assert.equal(a, b, "misma entrada → misma huella");
  assert.notEqual(a, c, "distinta fuente → distinta huella");
});

// ─── Validación espacial ─────────────────────────────────────────────────────

const CUADRADO_BENIDORM: GeoJSON.Geometry = {
  type: "Polygon",
  coordinates: [
    [
      [-0.2, 38.5],
      [-0.05, 38.5],
      [-0.05, 38.6],
      [-0.2, 38.6],
      [-0.2, 38.5],
    ],
  ],
};

test("pointInPolygon: dentro y fuera", () => {
  assert.equal(pointInPolygon({ lat: 38.55, lng: -0.12 }, CUADRADO_BENIDORM), true);
  assert.equal(pointInPolygon({ lat: 39.0, lng: -0.12 }, CUADRADO_BENIDORM), false);
});

test("ejesIntercambiados: detecta lat/lng al revés", () => {
  assert.equal(ejesIntercambiados({ lat: -0.12, lng: 38.55 }), true);
  assert.equal(ejesIntercambiados({ lat: 38.55, lng: -0.12 }), false);
});

test("validarEspacial: clasifica dentro, fuera y sin geometría", () => {
  assert.equal(validarEspacial({ lat: 38.55, lng: -0.12 }, CUADRADO_BENIDORM).estado, "valido");
  assert.equal(validarEspacial({ lat: 39.0, lng: -0.12 }, CUADRADO_BENIDORM).estado, "fuera_municipio");
  assert.equal(validarEspacial(undefined, CUADRADO_BENIDORM).estado, "sin_geometria");
  assert.equal(
    validarEspacial({ lat: -0.12, lng: 38.55 }, CUADRADO_BENIDORM).estado,
    "coordenadas_sospechosas"
  );
});

test("validarEspacial: próximo al límite", () => {
  const r = validarEspacial({ lat: 38.5002, lng: -0.12 }, CUADRADO_BENIDORM, {
    umbralProximoM: 250,
  });
  assert.equal(r.estado, "proximo_limite");
});

// ─── Duplicados ──────────────────────────────────────────────────────────────

test("detectarDuplicados: mismo recurso en varias fuentes (nombre+teléfono+cerca)", () => {
  const regs: CandidatoDedup[] = [
    {
      id: "a",
      nombre_normalizado: "farmacia central",
      categoria: "equipamientos",
      fuente: "OSM",
      telefono_normalizado: "965000000",
      coordenadas: { lat: 38.54, lng: -0.12 },
    },
    {
      id: "b",
      nombre_normalizado: "farmacia central",
      categoria: "equipamientos",
      fuente: "Otra",
      telefono_normalizado: "965000000",
      coordenadas: { lat: 38.5401, lng: -0.1201 },
    },
  ];
  const grupos = detectarDuplicados(regs);
  assert.ok(grupos.some((g) => g.tipo === "mismo_recurso_varias_fuentes"));
});

test("detectarDuplicados: mismo nombre lejos → varias sedes, no duplicado", () => {
  const regs: CandidatoDedup[] = [
    { id: "a", nombre_normalizado: "mercadona", categoria: "equipamientos", fuente: "OSM", coordenadas: { lat: 38.54, lng: -0.12 } },
    { id: "b", nombre_normalizado: "mercadona", categoria: "equipamientos", fuente: "OSM", coordenadas: { lat: 38.56, lng: -0.14 } },
  ];
  const grupos = detectarDuplicados(regs);
  assert.ok(grupos.some((g) => g.tipo === "varias_sedes_misma_entidad"));
  assert.ok(!grupos.some((g) => g.tipo === "posible_duplicado"));
});

// ─── UTM → WGS84 ─────────────────────────────────────────────────────────────

test("utmToLatLng: coordenadas de Benidorm (zona 30N)", () => {
  // Parada "Av. Cuba" de la plantilla municipal (EPSG:25830).
  const r = utmToLatLng(749086, 4269668, 30);
  assert.ok(Math.abs(r.lat - 38.5405) < 0.005, `lat=${r.lat}`);
  assert.ok(Math.abs(r.lng - (-0.1421)) < 0.005, `lng=${r.lng}`);
});

test("pareceUTM: distingue UTM de geográficas", () => {
  assert.equal(pareceUTM(749086, 4269668), true);
  assert.equal(pareceUTM(-0.14, 38.54), false);
});

// ─── Motor idempotente ───────────────────────────────────────────────────────

const FUENTE = { nombre: "Fuente de prueba", organismo: "Test" };

function raw(idOrigen: string, nombre: string, lat: number, lon: number): RawFeature {
  return {
    id_origen: idOrigen,
    nombre,
    categoria: "equipamientos",
    subcategoria: "farmacia",
    lat,
    lon,
    fuente: FUENTE,
    metodo_obtencion: "test",
  };
}

function ctx(): EjecucionContext {
  return {
    id: "ej-test",
    conector: "test",
    version_conector: "1.0.0",
    codigo_ine: "03031",
    categoria: "equipamientos",
    fuente: FUENTE,
    parametros: {},
  };
}

test("procesarLote: la segunda ejecución idéntica NO duplica", async () => {
  const store = new MemoryRegistroStore();
  const records = [
    raw("n/1", "Farmacia Uno", 38.54, -0.12),
    raw("n/2", "Farmacia Dos", 38.55, -0.13),
  ].map((r) => normalizeFeature(r, { codigoINE: "03031" }));

  const r1 = await procesarLote(store, ctx(), records);
  assert.equal(r1.insertados, 2);
  assert.equal(r1.actualizados, 0);

  const r2 = await procesarLote(store, ctx(), records);
  assert.equal(r2.insertados, 0, "no debe insertar de nuevo");
  assert.equal(r2.sin_cambios, 2);
});

test("procesarLote: actualiza solo los campos cambiados", async () => {
  const store = new MemoryRegistroStore();
  const base = normalizeFeature(raw("n/1", "Farmacia Uno", 38.54, -0.12), { codigoINE: "03031" });
  await procesarLote(store, ctx(), [base]);

  const modificado = normalizeFeature(
    { ...raw("n/1", "Farmacia Uno Renombrada", 38.54, -0.12) },
    { codigoINE: "03031" }
  );
  const r = await procesarLote(store, ctx(), [modificado]);
  assert.equal(r.actualizados, 1);
  assert.equal(r.insertados, 0);
  assert.ok(store.historial.some((h) => h.accion === "actualizado" && h.campo === "nombre_oficial"));
});

test("procesarLote: NO sobrescribe un registro validado", async () => {
  const store = new MemoryRegistroStore();
  const base = normalizeFeature(raw("n/1", "Farmacia Uno", 38.54, -0.12), { codigoINE: "03031" });
  const inserted = await store.insert(base);
  await store.update(inserted.id, { estado_validacion: "validado_tecnicamente" }, inserted.version_registro);

  const modificado = normalizeFeature(raw("n/1", "Nombre automático distinto", 38.54, -0.12), {
    codigoINE: "03031",
  });
  const r = await procesarLote(store, ctx(), [modificado]);
  assert.equal(r.actualizados, 0);
  assert.equal(r.sin_cambios, 1);
  const guardado = await store.findByIdOrigen("03031", "equipamientos", FUENTE.nombre, "n/1");
  assert.equal(guardado?.nombre_oficial, "Farmacia Uno", "conserva el valor validado");
  assert.ok(store.historial.some((h) => h.accion === "observar"));
});

test("procesarLote: marca posibles bajas y las restaura", async () => {
  const store = new MemoryRegistroStore();
  const a = normalizeFeature(raw("n/1", "Uno", 38.54, -0.12), { codigoINE: "03031" });
  const b = normalizeFeature(raw("n/2", "Dos", 38.55, -0.13), { codigoINE: "03031" });
  await procesarLote(store, ctx(), [a, b]);

  const r2 = await procesarLote(store, ctx(), [a]); // desaparece b
  assert.equal(r2.posibles_bajas, 1);
  const bRow = await store.findByIdOrigen("03031", "equipamientos", FUENTE.nombre, "n/2");
  assert.ok(bRow?.desactualizado_desde, "b queda marcado como desactualizado");

  await procesarLote(store, ctx(), [a, b]); // vuelve b
  const bRow2 = await store.findByIdOrigen("03031", "equipamientos", FUENTE.nombre, "n/2");
  assert.equal(bRow2?.desactualizado_desde, null, "se restaura al reaparecer");
});

test("procesarLote: no marca bajas si la respuesta es parcial", async () => {
  const store = new MemoryRegistroStore();
  const a = normalizeFeature(raw("n/1", "Uno", 38.54, -0.12), { codigoINE: "03031" });
  const b = normalizeFeature(raw("n/2", "Dos", 38.55, -0.13), { codigoINE: "03031" });
  await procesarLote(store, ctx(), [a, b]);

  const r2 = await procesarLote(store, ctx(), [a], { permitirBajas: false });
  assert.equal(r2.posibles_bajas, 0);
});
