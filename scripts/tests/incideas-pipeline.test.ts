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
import { igual, procesarLote } from "../../src/lib/incideas/pipeline/upsert";
import { MemoryRegistroStore } from "../../src/lib/incideas/pipeline/memory-store";
import { normalizeFeature } from "../../src/lib/incideas/pipeline/normalize";
import type { EjecucionContext, RawFeature } from "../../src/lib/incideas/pipeline/types";
import ExcelJS from "exceljs";
import { normalizeTitularidad } from "../../src/lib/incideas/pipeline/normalize";
import { ejecutarConector } from "../../src/lib/incideas/pipeline/runner";
import type { Connector } from "../../src/lib/incideas/connectors/types";
import {
  fechaMinetur,
  mapearEstaciones,
  resolverIdMunicipio,
  variantesNombre,
} from "../../src/lib/incideas/connectors/minetur-carburantes";
import {
  mapearCentrosDocentes,
  subcategoriaDocente,
} from "../../src/lib/incideas/connectors/gva-centros-docentes";
import { mapearCentrosSanitarios } from "../../src/lib/incideas/connectors/gva-centros-sanitarios";
import { esComunitatValenciana } from "../../src/lib/incideas/connectors/gva-icv";
import { mapearElementosOSM } from "../../src/lib/incideas/connectors/overpass";
import { pieFuentes, seleccionarPorFuente } from "../../src/lib/incideas/seleccion-fuentes";
import { leerTodas, TAM_PAGINA } from "../../src/lib/incideas/paginar";
import type { RegistroINCideas } from "../../src/lib/incideas/types";
import {
  construirCsv,
  construirXlsx,
  geometriaAWKT,
  geometriaComoObjeto,
  geometriaEfectiva,
  wktParaCelda,
  type RegistroExport,
} from "../../src/lib/incideas/exportacion";

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

// ─── Exportación (WKT / XLSX) ────────────────────────────────────────────────

test("geometriaAWKT: punto, polígono con hueco y multipolígono", () => {
  assert.equal(geometriaAWKT({ type: "Point", coordinates: [-0.12, 38.54] }), "POINT (-0.12 38.54)");
  const poly = geometriaAWKT({
    type: "Polygon",
    coordinates: [
      [[0, 0], [4, 0], [4, 4], [0, 0]],
      [[1, 1], [2, 1], [2, 2], [1, 1]],
    ],
  });
  assert.equal(poly, "POLYGON ((0 0, 4 0, 4 4, 0 0), (1 1, 2 1, 2 2, 1 1))");
  const multi = geometriaAWKT({
    type: "MultiPolygon",
    coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]], [[[5, 5], [6, 5], [6, 6], [5, 5]]]],
  });
  assert.equal(multi, "MULTIPOLYGON (((0 0, 1 0, 1 1, 0 0)), ((5 5, 6 5, 6 6, 5 5)))");
  assert.equal(geometriaAWKT(null), "");
});

test("wktParaCelda: sustituye por aviso si excede el límite de celda de Excel", () => {
  const ring = Array.from({ length: 3000 }, (_, i) => [i / 1000, i / 1000]);
  const largo = wktParaCelda({ type: "Polygon", coordinates: [ring] });
  assert.match(largo, /demasiado extensa/);
  assert.equal(wktParaCelda({ type: "Point", coordinates: [1, 2] }), "POINT (1 2)");
});

test("geometriaComoObjeto: acepta objeto, cadena JSON y basura", () => {
  const g: GeoJSON.Geometry = { type: "Point", coordinates: [1, 2] };
  assert.deepEqual(geometriaComoObjeto(g), g);
  assert.deepEqual(geometriaComoObjeto(JSON.stringify(g)), g);
  assert.equal(geometriaComoObjeto("no-json"), null);
  assert.equal(geometriaComoObjeto(null), null);
});

test("construirXlsx: hojas, trazabilidad, WKT y atribución ODbL", async () => {
  // Datos sintéticos de prueba; no representan registros reales.
  const reg: RegistroExport = {
    id: "00000000-0000-0000-0000-000000000001",
    codigo_ine: "03031",
    categoria: "equipamientos",
    subcategoria: "farmacia",
    nombre_oficial: "Farmacia de prueba",
    direccion: "calle prueba 1",
    coordenadas: { lat: 38.54, lng: -0.12 },
    geometria: null,
    fuente_principal: "OpenStreetMap (Overpass)",
    id_origen: "node/1",
    huella: "abc123",
    fecha_dato: null,
    fecha_consulta: "2026-01-01T00:00:00.000Z",
    estado_validacion: "automatico_sin_revisar",
    estado_espacial: "valido",
    licencia: "ODbL 1.0",
    observaciones: null,
    crs_original: null,
    desactualizado_desde: null,
  };
  const buf = await construirXlsx(
    [reg, { ...reg, id: "00000000-0000-0000-0000-000000000002", geometria: { type: "Point", coordinates: [-0.12, 38.54] } }],
    { codigoINE: "03031", categoria: null, generadoEn: "2026-01-02T00:00:00.000Z" }
  );
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Registros", "Léame"]);

  const hoja = wb.getWorksheet("Registros")!;
  const cab = (hoja.getRow(1).values as unknown[]).slice(1);
  for (const c of ["id", "lat", "lng", "geometria_wkt", "crs", "fuente", "id_origen", "huella", "estado_validacion", "estado_espacial", "licencia", "advertencias"]) {
    assert.ok(cab.includes(c), `falta la columna ${c}`);
  }
  assert.equal(hoja.rowCount, 3);
  const colWkt = cab.indexOf("geometria_wkt") + 1;
  assert.equal(
    hoja.getRow(2).getCell(colWkt).value,
    "POINT (-0.12 38.54)",
    "sin geometría, el WKT sale de las coordenadas"
  );
  assert.equal(hoja.getRow(3).getCell(colWkt).value, "POINT (-0.12 38.54)");
  const colCrs = cab.indexOf("crs") + 1;
  assert.equal(hoja.getRow(2).getCell(colCrs).value, "EPSG:4326");

  const csv = construirCsv([reg]).split("\n");
  assert.ok(csv[0].startsWith("id,codigo_ine,categoria,subcategoria,nombre,"));
  assert.match(csv[1], /"Farmacia de prueba"/, "el nombre no puede salir vacío en CSV");
  assert.match(csv[1], /"OpenStreetMap \(Overpass\)"/, "la fuente no puede salir vacía en CSV");

  const leame = wb.getWorksheet("Léame")!;
  const texto = JSON.stringify(leame.getSheetValues());
  assert.match(texto, /OpenStreetMap contributors/);
  assert.match(texto, /ODbL 1\.0/);
});

test("geometriaEfectiva: usa la geometría y, si falta, las coordenadas", () => {
  const base = { coordenadas: { lat: 38.5, lng: -0.1 } } as RegistroExport;
  assert.deepEqual(geometriaEfectiva({ ...base, geometria: null }), {
    type: "Point",
    coordinates: [-0.1, 38.5],
  });
  const g: GeoJSON.Geometry = { type: "Point", coordinates: [9, 9] };
  assert.deepEqual(geometriaEfectiva({ ...base, geometria: g }), g);
  assert.equal(geometriaEfectiva({ ...base, coordenadas: null, geometria: null }), null);
});

// ─── Ámbito de bajas y red de seguridad ──────────────────────────────────────

function rawCat(
  idOrigen: string,
  categoria: RawFeature["categoria"],
  subcategoria: string
): RawFeature {
  return { ...raw(idOrigen, `R ${idOrigen}`, 38.54, -0.12), categoria, subcategoria };
}

const normar = (r: RawFeature) => normalizeFeature(r, { codigoINE: "03031" });

test("procesarLote: un conector no marca como baja lo de otro conector de la misma fuente", async () => {
  const store = new MemoryRegistroStore();
  const ctxA: EjecucionContext = {
    ...ctx(),
    categoria: "infraestructuras",
    ambito: [{ categoria: "infraestructuras", subcategorias: ["alojamiento"] }],
  };
  await procesarLote(store, ctxA, [normar(rawCat("n/1", "infraestructuras", "alojamiento"))]);
  const ctxB: EjecucionContext = {
    ...ctx(),
    categoria: "infraestructuras",
    ambito: [{ categoria: "infraestructuras", subcategorias: ["parada_autobus"] }],
  };
  const r = await procesarLote(store, ctxB, [
    normar(rawCat("n/2", "infraestructuras", "parada_autobus")),
  ]);
  assert.equal(r.posibles_bajas, 0, "B no debe tocar los alojamientos de A");
});

test("procesarLote: el ámbito cubre todas las categorías que emite el conector", async () => {
  const store = new MemoryRegistroStore();
  const c: EjecucionContext = {
    ...ctx(),
    ambito: [
      { categoria: "equipamientos", subcategorias: ["farmacia"] },
      { categoria: "servicios_basicos", subcategorias: ["estacion_servicio"] },
    ],
  };
  await procesarLote(store, c, [
    normar(rawCat("n/1", "equipamientos", "farmacia")),
    normar(rawCat("n/2", "servicios_basicos", "estacion_servicio")),
  ]);
  const r = await procesarLote(store, c, [normar(rawCat("n/1", "equipamientos", "farmacia"))]);
  assert.equal(r.posibles_bajas, 1, "la gasolinera desaparecida se marca fuera de la categoría principal");
});

test("ejecutarConector: respuesta vacía con errores no marca bajas", async () => {
  const deps = {
    store: new MemoryRegistroStore(),
    iniciarEjecucion: async () => "ej",
    finalizarEjecucion: async () => {},
  };
  const base: Connector = {
    id: "fake",
    version: "1",
    nombre: "fake",
    descripcion: "",
    categoria: "equipamientos",
    nivelAutomatizacion: "alta",
    visibilidad: "publica",
    fuente: FUENTE,
    ejecutar: async () => ({
      features: [raw("n/1", "Uno", 38.54, -0.12)],
      parcial: false,
      errores: [],
    }),
  };
  await ejecutarConector(base, deps, { codigoINE: "03031" });
  const fallido: Connector = {
    ...base,
    ejecutar: async () => ({ features: [], parcial: false, errores: ["Sin resultados"] }),
  };
  const res = await ejecutarConector(fallido, deps, { codigoINE: "03031" });
  assert.equal(res.counts.posibles_bajas, 0);
  assert.equal(res.estado, "parcial");
});

// ─── Normalización: titularidad y OSM ampliado ───────────────────────────────

test("normalizeTitularidad: errata «pubica», concertado y etiqueta OSM", () => {
  assert.equal(normalizeTitularidad("pubica"), "publica");
  assert.equal(normalizeTitularidad("PRIVADO CONCERTADO"), "mixta");
  assert.equal(normalizeTitularidad("CONCERTADO"), "mixta");
  assert.equal(normalizeTitularidad("PÚBLICO"), "publica");
  assert.equal(normalizeTitularidad("private"), "privada");
  assert.equal(normalizeTitularidad("public"), "publica");
});

test("categoriaDesdeOSM: transporte y emergencias", () => {
  const c = categoriaDesdeOSM;
  assert.deepEqual(c({ highway: "bus_stop" }), { categoria: "infraestructuras", subcategoria: "parada_autobus" });
  assert.deepEqual(c({ railway: "tram_stop" }), { categoria: "infraestructuras", subcategoria: "parada_tranvia" });
  assert.deepEqual(c({ aeroway: "helipad" }), { categoria: "infraestructuras", subcategoria: "helipuerto" });
  assert.deepEqual(c({ emergency: "fire_hydrant" }), { categoria: "servicios_basicos", subcategoria: "hidrante" });
  assert.deepEqual(c({ emergency: "defibrillator" }), { categoria: "medios_recursos", subcategoria: "desfibrilador" });
  assert.deepEqual(c({ emergency: "assembly_point" }), { categoria: "evacuacion", subcategoria: "punto_encuentro" });
  // Precedencia: lo que ya mapeaba osm-pois no cambia.
  assert.deepEqual(c({ amenity: "pharmacy", emergency: "defibrillator" }), { categoria: "equipamientos", subcategoria: "farmacia" });
});

test("mapearElementosOSM: operator no implica titularidad privada", () => {
  const [f] = mapearElementosOSM([
    { type: "node", id: 1, lat: 38.5, lon: -0.1, tags: { amenity: "townhall", name: "Ayuntamiento", operator: "Ayuntamiento" } },
  ]);
  assert.equal(f.titularidad, undefined);
  assert.equal(f.gestor, "Ayuntamiento");
  const [g] = mapearElementosOSM([
    { type: "node", id: 2, lat: 38.5, lon: -0.1, tags: { emergency: "defibrillator", "operator:type": "public", access: "yes" } },
  ]);
  assert.equal(g.titularidad, "public");
  assert.equal(g.atributos?.access, "yes");
  assert.equal(mapearElementosOSM([{ type: "count", id: 0, tags: { areas: "1" } }]).length, 0);
});

// ─── MINETUR (gasolineras) ───────────────────────────────────────────────────

test("MINETUR: resolución de municipio por nombre con variantes", () => {
  const lista = [
    { IDMunicipio: "168", IDProvincia: "03", Municipio: "Benidorm" },
    { IDMunicipio: "901", IDProvincia: "03", Municipio: "Alcoy/Alcoi" },
  ];
  assert.equal(resolverIdMunicipio(lista, "Benidorm"), "168");
  assert.equal(resolverIdMunicipio(lista, "Alcoi/Alcoy"), "901");
  assert.equal(resolverIdMunicipio(lista, "Inexistente"), null);
  assert.ok(variantesNombre("Vila Joiosa, la").includes("la vila joiosa"));
});

test("MINETUR: mapeo sin precios, decimales con coma y fecha", () => {
  // Estación sintética de prueba.
  const estacion = {
    IDEESS: "1",
    IDMunicipio: "168",
    "Rótulo": "PRUEBA",
    "Dirección": "CALLE PRUEBA 1",
    "C.P.": "03501",
    Horario: "L-D: 24H",
    Latitud: "38,557694",
    "Longitud (WGS84)": "-0,101500",
    Margen: "D",
    "Precio Gasoleo A": "1,834",
  };
  const [f] = mapearEstaciones([estacion], fechaMinetur("01/10/2026 12:02:41"));
  assert.equal(f.id_origen, "IDEESS/1");
  assert.equal(f.lat, 38.557694);
  assert.equal(f.lon, -0.1015);
  assert.equal(f.fecha_dato, "2026-10-01");
  assert.ok(!JSON.stringify(f).includes("1,834"), "los precios no se almacenan");
});

// ─── GVA / ICV ───────────────────────────────────────────────────────────────

test("GVA: cobertura y tipo de centro docente", () => {
  assert.ok(esComunitatValenciana("03031"));
  assert.ok(!esComunitatValenciana("02003"));
  assert.equal(subcategoriaDocente("COLEGIO DE EDUCACIÓN INFANTIL Y PRIMARIA"), "colegio");
  assert.equal(subcategoriaDocente("INSTITUTO DE EDUCACIÓN SECUNDARIA"), "instituto");
  assert.equal(subcategoriaDocente("ESCUELA INFANTIL DE PRIMER CICLO"), "escuela_infantil");
  assert.equal(subcategoriaDocente("CENTRO DE EDUCACIÓN ESPECIAL"), "educacion_especial");
  assert.equal(subcategoriaDocente("ESCUELA OFICIAL DE IDIOMAS"), "centro_formacion");
});

test("GVA: centros docentes y sanitarios reproyectados desde EPSG:25830", () => {
  // Coordenadas de un centro real de Benidorm (UTM 30N); el resto de campos son sintéticos.
  const geom = { type: "Point", coordinates: [749622.58, 4270338.88] };
  const [d, ...resto] = mapearCentrosDocentes([
    {
      geometry: geom,
      properties: {
        codcen: "03000001",
        dlibre: "CEIP PRUEBA",
        dgenerica_cas: "COLEGIO DE EDUCACIÓN INFANTIL Y PRIMARIA",
        regimen: "PÚBLICO",
        telef: "0",
        desc_estado: "ALTA",
        cod_ine_mun: "03031",
      },
    },
    { geometry: geom, properties: { codcen: null, dlibre: "Sin código" } },
  ]);
  assert.equal(resto.length, 0, "sin código de centro no hay registro");
  assert.equal(d.id_origen, "codcen/03000001");
  assert.equal(d.subcategoria, "colegio");
  assert.equal(d.telefono, undefined, "«0» es relleno, no teléfono");
  assert.ok(Math.abs((d.lat ?? 0) - 38.5465) < 0.001);
  assert.ok(Math.abs((d.lon ?? 0) + 0.1357) < 0.001);

  const [sn] = mapearCentrosSanitarios(
    [
      {
        geometry: geom,
        properties: { cen_cod: "617", cen_desclar: "CS PRUEBA", cen_nombcall: "AVDA. PRUEBA", cen_numcall: "12", nombre_zona: "ZONA 1" },
      },
    ],
    "centro_salud"
  );
  assert.equal(sn.id_origen, "cen_cod/617");
  assert.equal(sn.direccion, "AVDA. PRUEBA, 12");
  assert.equal(sn.atributos?.zona_basica, "ZONA 1");
});

// ─── Memoria: selección de fuente ────────────────────────────────────────────

test("seleccionarPorFuente: oficial > municipal > OSM por subcategoría", () => {
  const r = (fuente: string, sub: string) =>
    ({ fuente_principal: fuente, subcategoria: sub, nombre_oficial: sub }) as RegistroINCideas;
  const OSM = "OpenStreetMap (Overpass)";
  const m = {
    porSubcategoria: {
      "equipamientos/colegio": [r("GVA", "colegio"), r("Plantilla", "colegio"), r(OSM, "colegio")],
      "equipamientos/farmacia": [r("Plantilla", "farmacia"), r(OSM, "farmacia")],
      "equipamientos/hospital": [r(OSM, "hospital")],
    },
    tiposFuente: new Map([
      ["GVA", "oficial_estructurada"],
      ["Plantilla", "municipal"],
      [OSM, "colaborativa"],
    ]),
  };
  const sel = seleccionarPorFuente(m, [
    "equipamientos/colegio",
    "equipamientos/farmacia",
    "equipamientos/hospital",
  ]);
  assert.deepEqual(
    sel.usados.map((x) => x.fuente_principal),
    ["GVA", "Plantilla", OSM]
  );
  assert.equal(sel.alternativos.length, 3);
  const pie = pieFuentes(sel);
  assert.match(pie, /OpenStreetMap contributors/);
  assert.match(pie, /contraste/);
});

test("igual: insensible al orden de claves (JSONB reordena) y a claves undefined", () => {
  assert.ok(igual({ codcen: "1", tipo: "A", x: undefined }, { tipo: "A", codcen: "1" }));
  assert.ok(igual({ a: { y: 1, x: 2 } }, { a: { x: 2, y: 1 } }));
  assert.ok(!igual({ a: 1 }, { a: 2 }));
  assert.ok(!igual([1, 2], [2, 1]), "el orden de los arrays sí importa");
});

test("leerTodas: recorre todas las páginas y se detiene en la última incompleta", async () => {
  const total = TAM_PAGINA * 2 + 37;
  const filas = Array.from({ length: total }, (_, i) => i);
  const rangos: [number, number][] = [];
  const { data, error } = await leerTodas<number>(async (desde, hasta) => {
    rangos.push([desde, hasta]);
    return { data: filas.slice(desde, hasta + 1), error: null };
  });
  assert.equal(error, null);
  assert.equal(data.length, total);
  assert.equal(rangos.length, 3);
  const fallo = await leerTodas<number>(async () => ({ data: null, error: { message: "x" } }));
  assert.equal(fallo.error, "x");
});

test("procesarLote: homónimos sin coordenadas con distinto id_origen no se fusionan", async () => {
  const store = new MemoryRegistroStore();
  const partida = (area: string): RawFeature => ({
    id_origen: `partida|2|El Saladar|${area}`,
    nombre: "El Saladar",
    categoria: "territorio",
    subcategoria: "partida",
    fuente: FUENTE,
    atributos: { area },
  });
  const c: EjecucionContext = { ...ctx(), ambito: [{ categoria: "territorio", subcategorias: ["partida"] }] };
  const lote = ["9", "10", "12"].map((a) => normalizeFeature(partida(a), { codigoINE: "03031" }));
  const r1 = await procesarLote(store, c, lote);
  assert.equal(r1.insertados, 3, "misma huella, distinto id_origen: tres registros");
  const r2 = await procesarLote(store, c, lote);
  assert.equal(r2.sin_cambios, 3, "sin sobrescrituras cruzadas en la segunda pasada");
  assert.equal(r2.posibles_bajas, 0);
});

test("procesarLote: la huella empareja registros antiguos sin id_origen y no los da de baja", async () => {
  const store = new MemoryRegistroStore();
  const sinId = normalizeFeature({ ...raw("x", "Uno", 38.54, -0.12), id_origen: undefined }, { codigoINE: "03031" });
  await procesarLote(store, ctx(), [sinId]);
  const conId = normalizeFeature(raw("n/1", "Uno", 38.54, -0.12), { codigoINE: "03031" });
  const r = await procesarLote(store, ctx(), [conId]);
  assert.equal(r.insertados, 0, "se completa el id_origen del registro existente");
  assert.equal(r.posibles_bajas, 0, "el registro emparejado por huella no es una baja");
});

test("marcarPosibleBaja: conserva la fecha de la primera ausencia", async () => {
  const store = new MemoryRegistroStore();
  const a = normalizeFeature(raw("n/1", "Uno", 38.54, -0.12), { codigoINE: "03031" });
  const b = normalizeFeature(raw("n/2", "Dos", 38.55, -0.13), { codigoINE: "03031" });
  await procesarLote(store, ctx(), [a, b]);
  await procesarLote(store, ctx(), [a]);
  const primera = (await store.findByIdOrigen("03031", "equipamientos", FUENTE.nombre, "n/2"))?.desactualizado_desde;
  await new Promise((r) => setTimeout(r, 5));
  await procesarLote(store, ctx(), [a]);
  const segunda = (await store.findByIdOrigen("03031", "equipamientos", FUENTE.nombre, "n/2"))?.desactualizado_desde;
  assert.ok(primera);
  assert.equal(segunda, primera);
});
