// Fase 2A — Pruebas independientes del contrato y las trampas.
//
// Uso: npx tsx --test scripts/tests/fase2a-contrato.test.ts
//
// Cubre, sin red ni disco de producción:
//   T1 orden de ejes por (servicio, versión, CRS), sin reglas generales.
//   T2 filtros ignorados: idéntico al control ⇒ no aplicado.
//   T3 combinaciones incompatibles: ejes no contratados ⇒ URL nula;
//      hits+GeoJSON y numberMatched=unknown ⇒ tratados.
//   Recuentos separados de hidrografía (miembros, nombres, localIds,
//      reconciliadas=null) y recorte que conserva el original.
//   Escenarios: solo mismo estudio+versión; déficit de contención;
//      atributos hidráulicos solo si presentes.
//   PATRICOVA no aplicable en Murcia; GVA origen / MITECO distribuidor.
//   Restricciones: sin escrituras, sin municipios.poblacion, mismo código
//      para ambos municipios (sin reglas ad-hoc).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  MUNICIPIOS,
  FUERA_DE_ALCANCE,
  PRODUCTOS_PATRICOVA,
  PROCEDENCIA,
  ordenEjes,
  bboxParaServicio,
  reconciliarHidro,
  filtroVerificado,
  deficitContencion,
  escenariosComparables,
  atributosHidraulicosPresentes,
} from "../incideas/fase2a/contrato";
import { urlGetFeature, extraerConteosWFS200 } from "../incideas/fase2a/wfs";
import { leerGml } from "../incideas/fase2a/gml";
import { recortarTramos, areaM2, areaInterseccion } from "../incideas/fase2a/geo-calc";

const RAIZ = process.cwd();
const FASE2A = join(RAIZ, "scripts", "incideas", "fase2a");

// ---------------------------------------------------------------------------
// T1: orden de ejes
// ---------------------------------------------------------------------------

test("T1: la tabla de ejes es por servicio/versión/CRS, sin regla general", () => {
  assert.equal(ordenEjes("ign-hidrografia-wfs", "2.0.0", "urn:ogc:def:crs:EPSG::4258"), "latlon");
  assert.equal(ordenEjes("inspire-inundaciones-wms", "1.3.0", "EPSG:4326"), "latlon");
  assert.equal(ordenEjes("inspire-inundaciones-wms", "1.3.0", "CRS:84"), "lonlat");
  assert.equal(ordenEjes("inspire-inundaciones-wms", "1.1.1", "EPSG:4326"), "lonlat");
  // «latitud, longitud» no vale para todo: CRS:84 en 1.3.0 es lon,lat.
  assert.notEqual(
    ordenEjes("inspire-inundaciones-wms", "1.3.0", "EPSG:4326"),
    ordenEjes("inspire-inundaciones-wms", "1.3.0", "CRS:84")
  );
});

test("T1: el BBOX se ordena según la regla; sin regla no hay URL", () => {
  const bb = { minLon: -0.2, minLat: 38.5, maxLon: -0.08, maxLat: 38.6 };
  assert.equal(
    bboxParaServicio("ign-hidrografia-wfs", "2.0.0", "urn:ogc:def:crs:EPSG::4258", bb),
    "38.5,-0.2,38.6,-0.08"
  );
  assert.equal(
    bboxParaServicio("inspire-inundaciones-wms", "1.3.0", "CRS:84", bb),
    "-0.2,38.5,-0.08,38.6"
  );
  assert.equal(bboxParaServicio("otro-servicio", "9.9.9", "EPSG:9999", bb), null);
});

test("T1: la misma consulta con ejes cambiados daría otro BBOX (no intercambiables)", () => {
  const bb = { minLon: -0.2, minLat: 38.5, maxLon: -0.08, maxLat: 38.6 };
  const bien = bboxParaServicio("ign-hidrografia-wfs", "2.0.0", "urn:ogc:def:crs:EPSG::4258", bb);
  const mal = `${bb.minLon},${bb.minLat},${bb.maxLon},${bb.maxLat}`;
  assert.notEqual(bien, mal);
});

// ---------------------------------------------------------------------------
// T2: filtros ignorados
// ---------------------------------------------------------------------------

test("T2: idéntico al control ⇒ filtro no verificado", () => {
  assert.equal(filtroVerificado(372, 372), false);
  assert.equal(filtroVerificado(9, 3), true);
  assert.equal(filtroVerificado(null, 3), false);
  assert.equal(filtroVerificado(9, null), false);
});

// ---------------------------------------------------------------------------
// T3: combinaciones incompatibles
// ---------------------------------------------------------------------------

test("T3: sin orden de ejes contratado no se construye URL", () => {
  const url = urlGetFeature({
    base: "https://ejemplo.test/wfs",
    servicio: "ign-hidrografia-wfs",
    version: "2.0.0",
    crs: "EPSG:9999",
    typenames: "hy-p:Watercourse",
    bboxLonLat: { minLon: 0, minLat: 0, maxLon: 1, maxLat: 1 },
  });
  assert.equal(url, null);
});

test("T3: numberMatched=unknown no es un total", () => {
  const { matched } = extraerConteosWFS200('<wfs:FeatureCollection numberMatched="unknown" numberReturned="0"/>');
  assert.equal(matched, null);
});

test("T3: los conteos de la raíz GML se leen aunque el formato no sea GeoJSON", () => {
  const { matched, returned } = extraerConteosWFS200(
    '<wfs:FeatureCollection numberMatched="311" numberReturned="0"/>'
  );
  assert.equal(matched, 311);
  assert.equal(returned, 0);
});

// ---------------------------------------------------------------------------
// GML: miembros, identidad y ejes
// ---------------------------------------------------------------------------

const GML_FIXTURE = `<?xml version='1.0' encoding='UTF-8'?>
<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:gml="http://www.opengis.net/gml/3.2" numberMatched="3" numberReturned="3">
<wfs:member><hy-p:Watercourse xmlns:hy-p="http://inspire.ec.europa.eu/schemas/hy-p/4.0" gml:id="M1">
<hy-p:geographicalName><gn:GeographicalName xmlns:gn="http://inspire.ec.europa.eu/schemas/gn/4.0"><gn:spelling><gn:SpellingOfName><gn:text>Riu Sec</gn:text></gn:SpellingOfName></gn:spelling></gn:GeographicalName></hy-p:geographicalName>
<hy-p:hydroId><hy:HydroIdentifier xmlns:hy="http://inspire.ec.europa.eu/schemas/hy/4.0"><hy:localId>H1</hy:localId></hy:HydroIdentifier></hy-p:hydroId>
<hy-p:geometry><gml:LineString srsName="urn:ogc:def:crs:EPSG::4258"><gml:posList>38.5 -0.2 38.51 -0.19</gml:posList></gml:LineString></hy-p:geometry>
</hy-p:Watercourse></wfs:member>
<wfs:member><hy-p:Watercourse xmlns:hy-p="http://inspire.ec.europa.eu/schemas/hy-p/4.0" gml:id="M2">
<hy-p:hydroId><hy:HydroIdentifier xmlns:hy="http://inspire.ec.europa.eu/schemas/hy/4.0"><hy:localId>H1</hy:localId></hy:HydroIdentifier></hy-p:hydroId>
<hy-p:geometry><gml:LineString srsName="urn:ogc:def:crs:EPSG::4258"><gml:posList>38.51 -0.19 38.52 -0.18</gml:posList></gml:LineString></hy-p:geometry>
</hy-p:Watercourse></wfs:member>
<wfs:member><hy-n:WatercourseLink xmlns:hy-n="http://inspire.ec.europa.eu/schemas/hy-n/4.0" gml:id="L1">
<net:centrelineGeometry xmlns:net="http://inspire.ec.europa.eu/schemas/net/4.0"><gml:LineString srsName="urn:ogc:def:crs:EPSG::4258"><gml:posList>38.6 -0.1 38.61 -0.09</gml:posList></gml:LineString></net:centrelineGeometry>
</hy-n:WatercourseLink></wfs:member>
</wfs:FeatureCollection>`;

test("GML: dos miembros con el mismo hydroId son dos objetos (no se fusionan)", () => {
  const col = leerGml(GML_FIXTURE);
  assert.equal(col.matched, 3);
  assert.equal(col.entidades.length, 3);
  const ids = col.entidades.map((e) => e.id_origen);
  assert.deepEqual(ids, ["M1", "M2", "L1"]);
  assert.equal(col.entidades[0].nombre, "Riu Sec");
  assert.equal(col.entidades[1].nombre, null);
  assert.equal(col.entidades[0].localId, "H1");
  assert.equal(col.entidades[1].localId, "H1");
});

test("GML: posList en EPSG:4258 (lat,lon) sale como GeoJSON (lon,lat)", () => {
  const col = leerGml(GML_FIXTURE);
  assert.deepEqual(col.entidades[0].geometria, {
    type: "LineString",
    coordinates: [[-0.2, 38.5], [-0.19, 38.51]],
  });
});

test("GML: centrelineGeometry del modelo de red también se lee", () => {
  const col = leerGml(GML_FIXTURE);
  assert.equal(col.entidades[2].geometria?.type, "LineString");
  assert.deepEqual(col.entidades[2].geometria?.coordinates[0], [-0.1, 38.6]);
});

// ---------------------------------------------------------------------------
// Recuentos separados
// ---------------------------------------------------------------------------

test("Hidrografía: objetos, nombres, localIds y reconciliadas=null, siempre separados", () => {
  const r = reconciliarHidro({
    objetos: [
      { id: "M1", localId: "H1", nombre: "Riu Sec", intersecta: true },
      { id: "M2", localId: "H1", nombre: null, intersecta: true },
      { id: "L1", localId: null, nombre: "Riu Sec", intersecta: false },
    ],
  });
  assert.equal(r.n_objetos, 3);
  assert.equal(r.n_con_nombre, 2);
  assert.equal(r.n_nombres_distintos, 1);
  assert.equal(r.n_localid_distintos, 1);
  assert.equal(r.n_entidades_reconciliadas, null);
  assert.equal(r.n_intersectan_termino, 2);
  assert.equal(r.n_solo_bbox, 1);
});

// ---------------------------------------------------------------------------
// Recorte municipal
// ---------------------------------------------------------------------------

const TERMINO_FIXTURE = {
  type: "Polygon",
  coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
};

test("Recorte: distingue intersección real de solo-BBOX y conserva el original", () => {
  const dentro = { type: "LineString", coordinates: [[0.2, 0.2], [0.4, 0.4]] };
  const fuera = { type: "LineString", coordinates: [[2, 2], [3, 3]] };
  const cruzando = { type: "LineString", coordinates: [[-1, 0.5], [2, 0.5]] };
  const out = recortarTramos(
    [
      { id: "a", localId: "H", nombre: "Dentro", geometria: dentro },
      { id: "b", localId: null, nombre: null, geometria: fuera },
      { id: "c", localId: "H", nombre: "Cruza", geometria: cruzando },
    ],
    TERMINO_FIXTURE
  );
  assert.equal(out[0].intersecta, true);
  assert.equal(out[1].intersecta, false);
  assert.equal(out[1].geometria_recorte, null);
  assert.equal(out[2].intersecta, true);
  // El original se conserva intacto en todos los casos.
  assert.deepEqual(out[2].geometria_original, cruzando);
  assert.ok((out[2].longitud_municipal_m ?? 0) > 0);
  assert.ok((out[0].longitud_municipal_m ?? 0) > 0);
  assert.equal(out[1].longitud_municipal_m, 0);
  const rec = reconciliarHidro({
    objetos: out.map((r) => ({ id: r.id_origen, localId: r.localId, nombre: r.nombre, intersecta: r.intersecta })),
  });
  assert.equal(rec.n_intersectan_termino, 2);
  assert.equal(rec.n_solo_bbox, 1);
});

// ---------------------------------------------------------------------------
// Escenarios: misma versión y déficit sin reparar
// ---------------------------------------------------------------------------

test("Escenarios: solo compara mismo estudio y versión", () => {
  assert.equal(escenariosComparables({ estudio: "E1", version: "2" }, { estudio: "E1", version: "2" }), true);
  assert.equal(escenariosComparables({ estudio: "E1", version: "2" }, { estudio: "E1", version: "3" }), false);
  assert.equal(escenariosComparables({ estudio: "E1", version: "2" }, { estudio: "E2", version: "2" }), false);
});

test("Escenarios: cuantifica lo no contenido sin reparar (incluye el caso inverso)", () => {
  const t10 = { type: "Polygon", coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] };
  const t100 = { type: "Polygon", coordinates: [[[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]] };
  const a10 = areaM2(t10);
  const inter = areaInterseccion(t10, t100);
  const def = deficitContencion(a10, inter);
  assert.ok(def.area_no_contenida_m2 > 0);
  assert.ok((def.fraccion_no_contenida ?? 0) > 0.5);
  // Contención total ⇒ déficit cero (el comparador no inventa discrepancias).
  const def0 = deficitContencion(a10, a10);
  assert.equal(def0.area_no_contenida_m2, 0);
});

test("Hidráulicos: solo se conservan los presentes en el origen", () => {
  assert.deepEqual(atributosHidraulicosPresentes({ caudal: "120 m3/s", modelo: "", escala: null }), ["caudal"]);
  assert.deepEqual(atributosHidraulicosPresentes({}), []);
});

// ---------------------------------------------------------------------------
// Productos, procedencia y aplicabilidad
// ---------------------------------------------------------------------------

test("PATRICOVA: tres productos no intercambiables; la geomorfológica es nivel", () => {
  const claves = PRODUCTOS_PATRICOVA.map((p) => p.clave);
  assert.deepEqual(claves, ["peligrosidad", "riesgo", "estudios"]);
  const pel = PRODUCTOS_PATRICOVA.find((p) => p.clave === "peligrosidad");
  assert.match(pel?.definicion ?? "", /geomorfol/i);
});

test("Procedencia: GVA origen, MITECO distribuidor cuando corresponda", () => {
  assert.equal(PROCEDENCIA.PATRICOVA.origen, "Generalitat Valenciana / PATRICOVA");
  assert.equal(PROCEDENCIA.SNCZI_VIA_IDEE.origen, "MITECO / SNCZI");
  assert.ok((PROCEDENCIA.SNCZI_VIA_IDEE.distribuidor ?? "").includes("IDEE"));
});

test("PATRICOVA no aplicable en Murcia, aplicable en Benidorm", () => {
  assert.equal(MUNICIPIOS["30030"].patricovaAplicable, false);
  assert.equal(MUNICIPIOS["03031"].patricovaAplicable, true);
});

// ---------------------------------------------------------------------------
// Restricciones estructurales del código entregado
// ---------------------------------------------------------------------------

/** Código sin comentarios ni cadenas de ejemplo: lo que se ejecuta. */
function codigoEfectivo(src: string): string {
  return src
    .split("\n")
    .filter((l) => {
      const t = l.trimStart();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("#");
    })
    .join("\n");
}

test("Sin escrituras en sistemas reales ni municipios.poblacion", () => {
  const ficheros = readdirSync(FASE2A).filter((f) => f.endsWith(".ts"));
  assert.ok(ficheros.length >= 5);
  for (const f of ficheros) {
    const src = codigoEfectivo(readFileSync(join(FASE2A, f), "utf8"));
    assert.doesNotMatch(src, /UPDATE\s+municipios|INSERT\s+INTO\s+municipios|DELETE\s+FROM\s+municipios/i, `${f} sin escrituras`);
    if (f !== "contrato.ts") {
      // contrato.ts declara FUERA_DE_ALCANCE; el resto ni lo nombra en código.
      assert.doesNotMatch(src, /poblacion/, `${f} no toca población`);
    }
  }
  assert.ok(FUERA_DE_ALCANCE.includes("municipios.poblacion"));
});

test("Mismo pipeline para ambos municipios, sin reglas ad-hoc", () => {
  const src = codigoEfectivo(readFileSync(join(FASE2A, "pipeline.ts"), "utf8"));
  assert.doesNotMatch(src, /03031|30030/, "el orquestador no nombra municipios en código");
  assert.doesNotMatch(src, /ine\s*===\s*["']|case\s+["']0?30/, "sin ramas por municipio");
  assert.match(src, /--ine/, "el municipio entra por parámetro");
  assert.deepEqual(Object.keys(MUNICIPIOS).sort(), ["03031", "30030"]);
});
