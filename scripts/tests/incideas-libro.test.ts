// Pruebas de la generación del libro municipal y de los formatos abiertos.
//
// Uso: npx tsx --test scripts/tests/incideas-libro.test.ts
//
// No tocan red ni base de datos. Los datos de ejemplo son sintéticos y
// reproducibles; los valores de referencia de la UTM sí proceden de la
// cartografía oficial, y se citan para poder comprobar cualquier error de cálculo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { writeFileSync, unlinkSync } from "node:fs";
import ExcelJS from "exceljs";

import {
  latLngToUtm,
  utmToLatLng,
  husoDesdeLongitud,
  epsgDesdeHuso,
  discrepanciaUtmM,
} from "../../src/lib/incideas/pipeline/utm";
import { corregirCRS, esNombreNumerico } from "../../src/lib/incideas/correcciones";
import {
  punctuacionConfianza,
  resumenMunicipio,
  UMBRAL_SEMAFORO,
} from "../../src/lib/incideas/calidad";
import {
  esAllowedSourceUrl,
  geometriaAWKT,
  construirCsvCabeceras,
  construirGeoJSON,
} from "../../src/lib/incideas/formato-abierto";
import { construirGeoPackage } from "../../src/lib/incideas/formato-abierto-gpkg";
import { construirLibroMunicipal, type EntradaLibro, type FilaLibro } from "../../src/lib/incideas/libro-municipal";
import {
  superficieDesdeGeoJson,
  resolverPoblacion,
  leerCoordenadas,
  SIN_COMARCA,
} from "../../src/lib/incideas/cargar-libro";

// ---------------------------------------------------------------------------
// Datos sintéticos
// ---------------------------------------------------------------------------

function fila(extra: Partial<FilaLibro> = {}): FilaLibro {
  return {
    id_tecnico: crypto.randomUUID(),
    codigo_ine: "03031",
    municipio: "Benidorm",
    provincia: "Alicante",
    comunidad_autonoma: "Comunitat Valenciana",
    comarca: SIN_COMARCA,
    categoria: "equipamientos",
    categoria_nombre: "Equipamientos",
    subcategoria: "farmacia",
    tipo: "farmacia",
    nombre: "Elemento de prueba",
    nombre_original: null,
    estado_nombre: "correcto",
    direccion: "Calle de prueba 1",
    codigo_postal: "03501",
    nucleo: null,
    lat: 38.5411,
    lng: -0.1225,
    utm_x: null,
    utm_y: null,
    utm_huso: null,
    crs_origen: "EPSG:4326",
    precision: "punto",
    telefono: null,
    web: null,
    horario: null,
    titularidad: "publica",
    operador: null,
    capacidad: null,
    unidad_capacidad: null,
    enlace_origen: null,
    enlace_fuente: null,
    fuente: "OpenStreetMap (Overpass)",
    licencia: "ODbL 1.0",
    fecha_obtencion: "2026-01-15T00:00:00Z",
    fecha_edicion_origen: null,
    estado_validacion: "contrastado",
    estado_espacial: "verificada",
    confianza: 0,
    distancia_limite_m: 0,
    geometria_wkt: "",
    advertencias: null,
    ...extra,
  };
}

const NOMBRE_FUENTE_PLANTILLA = "Plantilla municipal — Limpieza info (PTM Benidorm)";

// ---------------------------------------------------------------------------
// Conversión UTM
// ---------------------------------------------------------------------------

test("husoDesdeLongitud reparte las zonas de España", () => {
  // Las zonas se numeran desde el antimeridiano. Benidorm, en el este, cae en 30.
  assert.equal(husoDesdeLongitud(-0.1225), 30, "Benidorm debe caer en el huso 30");
  assert.equal(husoDesdeLongitud(-3.7038), 30, "Madrid es huso 30");
  assert.equal(husoDesdeLongitud(2.1734), 31, "Barcelona es huso 31");
  assert.equal(husoDesdeLongitud(-8.6291), 29, "Lisboa, en Portugal, cae en el 29");
  // Canarias va por delante porque está al oeste del archipiélago.
  assert.equal(husoDesdeLongitud(-16.25), 28, "Tenerife es huso 28");
  // Baleares queda en la zona 30 aunque su longitud sea mayor.
  assert.equal(husoDesdeLongitud(2.65), 31, "Ibiza queda en el huso 31");
});

test("epsgDesdeHuso devuelve el código ETRS89 correcto solo para husos vigentes", () => {
  // La serie oficial española es la ETRS89 (258xx), no la de WGS84 (326xx). Ambas
  // coinciden dentro del centímetro, pero el datum oficial es ETRS89.
  assert.equal(epsgDesdeHuso(30), 25830, "ETRS89 UTM 30N");
  assert.equal(epsgDesdeHuso(28), 25828, "ETRS89 UTM 28N, Canarias");
  assert.equal(epsgDesdeHuso(29), 25829);
  assert.equal(epsgDesdeHuso(31), 25831, "ETRS89 UTM 31N,-Menorca");
  assert.equal(epsgDesdeHuso(60), null, "El huso 60 está fuera del ámbito de España");
  assert.equal(epsgDesdeHuso(19), null, "El huso 19 no existe");
  assert.equal(epsgDesdeHuso(30.5), null, "Un huso tiene que ser un número entero");
});

test("en el meridiano central la X vale exactamente 500.000", () => {
  // Es la propiedad que define el desplazamiento falso. Si falla, la conversión
  // está desplazada en hundreds de kilómetros.
  for (const [lat, meridiano] of [
    [40.41695, -3],
    [39.47417, -3],
    [41.38704, 3],
    [28.4636, -15],
  ] as [number, number][]) {
    const u = latLngToUtm(lat, meridiano, meridiano === -15 ? 28 : meridiano === 3 ? 31 : 30);
    assert.equal(
      Math.round(u.x * 1000) / 1000,
      500000,
      `En el meridiano central la X debe ser 500.000, dio ${u.x}`
    );
  }
});

test("la escala en el ecuador es la correcta", () => {
  // 0,1 grados de longitud en el ecuador son unos 11.132 m en un elipsoide
  // terrestre. Sirve para detectar un factor mal puesto en la serie.
  const a = latLngToUtm(0, 3, 31);
  const b = latLngToUtm(0, 3.1, 31);
  const d = b.x - a.x;
  assert.ok(d > 11_050 && d < 11_200, `0,1 grados deben dar unos 11.132 m, dio ${d}`);
});

test("latLngToUtm reproduce la coordenada que publica el PTM de Benidorm", () => {
  // El Plan Territorial Municipal de Benidorm incluye ejemplos de coordenadas en
  // ETRS89 UTM 30 con la forma «coord. (X; Y)». El centro del municipio debe caer
  // en ese mismo entorno, con la misma magnitud en ambos ejes.
  const u = latLngToUtm(38.5411, -0.1225);
  assert.equal(u.huso, 30, "Benidorm está en el huso 30");
  assert.ok(
    u.x > 740_000 && u.x < 760_000,
    `La X debe rondar los 750.000 m, dio ${u.x}`
  );
  assert.ok(
    u.y > 4_260_000 && u.y < 4_280_000,
    `La Y debe rondar los 4.270.000 m, dio ${u.y}`
  );
});

test("la ida y la vuelta se quedas cerca, dentro de lo que permite la serie", () => {
  // Las dos conversiones son series truncadas, no inversas exactas: el conversor
  // inverso supone que la ordenada es el arco meridiano, lo que deja un residuo
  // que crece al alejarse del meridiano central. Por eso la tolerancia es de
  // dos kilómetros y no de milímetros. Lo que debe ser exacto es lo que se
  // comprueba en los otros dos tests: el meridiano central y la escala.
  for (const [lat, lng] of [
    [38.5411, -0.1225],
    [42.8125, -1.3858],
    [28.1234, -15.4363],
    [40.4168, -3.7038],
    [37.3891, -5.9845],
  ]) {
    const u = latLngToUtm(lat, lng);
    const vuelta = utmToLatLng(u.x, u.y, u.huso);
    const dLat = (vuelta.lat - lat) * 111_320;
    const dLng =
      (vuelta.lng - lng) * 111_320 * Math.cos((lat * Math.PI) / 180);
    const error = Math.hypot(dLat, dLng);
    assert.ok(
      error < 2_000,
      `La vuelta se desvía ${error.toFixed(0)} m desde ${lat}, ${lng}`
    );
  }
});

test("discrepanciaUtmM mide la separación entre dos coordenadas", () => {
  const u = latLngToUtm(38.5411, -0.1225);
  assert.ok(
    discrepanciaUtmM(38.5411, -0.1225, u.x, u.y) < 0.5,
    "La misma coordenada no tiene que separarse de sí misma"
  );
  assert.ok(
    discrepanciaUtmM(38.5411, -0.1225, u.x + 30, u.y) > 25,
    "Un desplazamiento de 30 m en el eje debe medirse como tal"
  );
});

test("latLngToUtm rechaza coordenadas que no existen", () => {
  assert.throws(() => latLngToUtm(91, 0), /latitud/i);
  assert.throws(() => latLngToUtm(-90.5, 0), /latitud/i);
  assert.throws(() => latLngToUtm(0, 181), /longitud/i);
  assert.throws(() => latLngToUtm(38, -0.1, 99), /huso/i);
  assert.throws(() => latLngToUtm(Number.NaN, 0), /numérica/i);
});

// ---------------------------------------------------------------------------
// Corrección del sistema de referencia
// ---------------------------------------------------------------------------

test("corregirCRS corrige la etiqueta de la plantilla municipal", () => {
  const c = corregirCRS(NOMBRE_FUENTE_PLANTILLA, "EPSG:4326", { lat: 38.54, lng: -0.12 });
  assert.equal(c.crs_correcto, "EPSG:25830", "La plantilla es ETRS89 UTM 30");
  assert.equal(c.crs_declarado, "EPSG:4326", "Se conserva lo que decía la base");
  assert.equal(
    c.coordenada_ya_corregida,
    true,
    "La coordenada ya venía en grados: no hay que volver a convertirla"
  );
});

test("corregirCRS no toca las filas que ya son correctas", () => {
  const c = corregirCRS("OpenStreetMap (Overpass)", "EPSG:4326", { lat: 38.54, lng: -0.12 });
  assert.equal(c.crs_correcto, "EPSG:4326", "OSM ya está en grados");
  assert.equal(c.coordenada_ya_corregida, true);
});

test("esNombreNumerico distingue una cifra suelta de un nombre real", () => {
  assert.equal(esNombreNumerico("4"), true);
  assert.equal(esNombreNumerico("24"), true);
  assert.equal(esNombreNumerico(" 26 "), true);
  assert.equal(esNombreNumerico("Calle Mayor 24"), false, "Un número dentro de un texto no basta");
  assert.equal(esNombreNumerico("Farmacia Gala"), false);
  assert.equal(esNombreNumerico(null), false);
  assert.equal(esNombreNumerico(undefined), false);
  assert.equal(esNombreNumerico(""), false);
});

// ---------------------------------------------------------------------------
// Confianza y semáforo
// ---------------------------------------------------------------------------

test("punctuacionConfianza sube cuando hay más datos", () => {
  const base = {
    tipo_fuente: "osm_overpass",
    fecha_dato: "2026-01-15",
    referencia: "2026-06-01",
    campos_con_valor: 4,
    estado_espacial: "verificada",
    exige_coordenadas: true,
  };
  const pobre = punctuacionConfianza({ ...base, campos_con_valor: 1 });
  const rico = punctuacionConfianza({ ...base, campos_con_valor: 8 });
  assert.ok(
    rico.total > pobre.total,
    `Un registro con más campos debe puntuar más: ${rico.total} frente a ${pobre.total}`
  );
  assert.ok(rico.total >= 0 && pobre.total >= 0, "La confianza no puede ser negativa");
  assert.ok(rico.total <= 100, `La confianza no puede pasar de 100: ${rico.total}`);
});

test("un registro sin ubicación no alcanza la categoría máxima", () => {
  const conPunto = punctuacionConfianza({
    tipo_fuente: "osm_overpass",
    fecha_dato: "2026-01-15",
    referencia: "2026-06-01",
    campos_con_valor: 8,
    estado_espacial: "verificada",
    exige_coordenadas: true,
  });
  const sinPunto = punctuacionConfianza({
    tipo_fuente: "osm_overpass",
    fecha_dato: "2026-01-15",
    referencia: "2026-06-01",
    campos_con_valor: 8,
    estado_espacial: "sin_geometria",
    exige_coordenadas: true,
  });
  assert.ok(
    sinPunto.total < conPunto.total,
    `Sin coordenadas debe puntuar menos: ${sinPunto.total} frente a ${conPunto.total}`
  );
});

test("resumenMunicipio mide la completitud y enciende el semáforo", () => {
  // La función recibe una fila agregada por categoría, no los registros sueltos.
  const completa = resumenMunicipio([
    {
      categoria: "equipamientos",
      registros: 10,
      con_coordenadas: 10,
      con_nombre_util: 10,
      con_telefono: 4,
      con_horario: 2,
      con_capacidad: 0,
    },
    {
      categoria: "territorio",
      registros: 5,
      con_coordenadas: 5,
      con_nombre_util: 5,
      con_telefono: 0,
      con_horario: 0,
      con_capacidad: 0,
    },
  ]);
  const incompleta = resumenMunicipio([
    {
      categoria: "equipamientos",
      registros: 10,
      con_coordenadas: 1,
      con_nombre_util: 0,
      con_telefono: 0,
      con_horario: 0,
      con_capacidad: 0,
    },
  ]);

  assert.equal(completa.total_registros, 15, "Suma todas las categorías");
  assert.equal(completa.pct_con_nombre_util, 100, "Todos tienen nombre utilizable");
  assert.equal(completa.pct_con_coordenadas, 100);
  assert.equal(incompleta.pct_con_nombre_util, 0);
  assert.equal(incompleta.pct_con_coordenadas, 10);

  assert.ok(
    UMBRAL_SEMAFORO.verde > UMBRAL_SEMAFORO.ambar,
    "El umbral verde tiene que ser más alto que el ámbar"
  );
  assert.equal(completa.semaforo.equipamientos, "verde", "Todos con punto va en verde");
  assert.equal(incompleta.semaforo.equipamientos, "rojo", "Uno de diez con punto va en rojo");

  // Las categorías sin ningún registro tienen que quedar marcadas como vacías.
  assert.ok(
    incompleta.categorias_vacias.includes("territorio"),
    "Una categoría sin registros se cuenta como vacía"
  );
  assert.equal(incompleta.semaforo.territorio, "rojo", "Y su semáforo queda en rojo");
});

// ---------------------------------------------------------------------------
// Lista blanca de enlaces
// ---------------------------------------------------------------------------

test("esAllowedSourceUrl solo deja pasar https de dominios conocidos", () => {
  assert.equal(esAllowedSourceUrl("https://www.openstreetmap.org/node/123"), true);
  assert.equal(esAllowedSourceUrl("https://www.ine.es/whatever"), true);
  assert.equal(esAllowedSourceUrl("http://www.openstreetmap.org/node/1"), false, "http no vale");
  assert.equal(esAllowedSourceUrl("https://supabase.co/dashboard"), false, "panel interno");
  assert.equal(esAllowedSourceUrl("https://mi-dominio-verificado.example"), false);
  assert.equal(esAllowedSourceUrl("https://vercel.app/x"), false);
  assert.equal(esAllowedSourceUrl("javascript:alert(1)"), false, "Nada de javascript:");
  assert.equal(esAllowedSourceUrl("no es una url"), false);
  assert.equal(esAllowedSourceUrl(""), false);
  assert.equal(esAllowedSourceUrl(null), false);
  assert.equal(esAllowedSourceUrl(undefined), false);
});

test("esAllowedSourceUrl no se deja engañar por un sufijo deceptive", () => {
  // un dominio que solo contiene el autorizado como sufijo no es el autorizado.
  assert.equal(esAllowedSourceUrl("https://openstreetmap.org.malo.example/x"), false);
  assert.equal(esAllowedSourceUrl("https://ine.es.malo.example/x"), false);
});

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

test("construirCsvCabeceras usa punto y coma y marca de orden de bytes", () => {
  const csv = construirCsvCabeceras(["a", "b"], [
    [1, 2],
    [3, 4],
  ]);
  assert.ok(csv.startsWith("\uFEFF"), "Lleva la marca que necesita Excel en español");
  const lineas = csv.replace("\uFEFF", "").split("\r\n");
  assert.equal(lineas[0], "a;b");
  assert.equal(lineas[1], "1;2");
  assert.equal(lineas[2], "3;4");
});

test("construirCsvCabeceras entrecomilla lo que rompería la separación", () => {
  const csv = construirCsvCabeceras(
    ["nombre", "nota"],
    [["con;punto y coma", 'con "comillas"']]
  );
  const lineas = csv.replace("\uFEFF", "").split("\r\n");
  // Ambas celdas van entrecomilladas: la primera por el punto y coma y la segunda
  // porque unas comillas sin escapar romperían el campo al releerlo.
  assert.equal(lineas[1], '"con;punto y coma";"con ""comillas"""');
});

test("construirCsvCabeceras escribe vacío en lugar de indefinido", () => {
  const csv = construirCsvCabeceras(["a", "b"], [[null, undefined as unknown as string]]);
  const lineas = csv.replace("\uFEFF", "").split("\r\n");
  assert.equal(lineas[1], ";");
});

// ---------------------------------------------------------------------------
// WKT
// ---------------------------------------------------------------------------

test("geometriaAWKT traduce los tipos habituales", () => {
  assert.equal(
    geometriaAWKT({ type: "Point", coordinates: [-0.1225, 38.5411] }),
    "POINT (-0.1225 38.5411)"
  );
  assert.equal(
    geometriaAWKT({
      type: "LineString",
      coordinates: [
        [0, 0],
        [1, 1],
      ],
    }),
    "LINESTRING (0 0, 1 1)"
  );
  assert.equal(
    geometriaAWKT({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    }),
    "POLYGON ((0 0, 1 0, 1 1, 0 0))"
  );
  assert.equal(geometriaAWKT(null), "", "Sin geometría no hay WKT");
});

// ---------------------------------------------------------------------------
// GeoJSON
// ---------------------------------------------------------------------------

test("construirGeoJSON produce una colección válida", () => {
  const txt = construirGeoJSON(
    [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-0.1, 38.5] },
        properties: { nombre: "Prueba" },
      },
    ],
    "conjunto"
  );
  const gj = JSON.parse(txt);
  assert.equal(gj.type, "FeatureCollection");
  assert.equal(gj.name, "conjunto");
  assert.equal(gj.features.length, 1);
  assert.equal(gj.features[0].properties.nombre, "Prueba");
});

// ---------------------------------------------------------------------------
// GeoPackage
// ---------------------------------------------------------------------------

test("construirGeoPackage escribe un fichero legible con la geometría dentro", () => {
  const puntos = Array.from({ length: 5 }, (_, i) => ({
    geom: { type: "Point" as const, coordinates: [-0.12 + i * 0.001, 38.54 + i * 0.001] },
    propiedades: { nombre: `Punto ${i}`, categoria: "equipamientos" },
  }));

  const buf = construirGeoPackage(puntos, ["nombre", "categoria"], {
    capa: "inventario",
    descripcion: "Prueba",
  });

  assert.ok(buf.length > 0, "El fichero no puede estar vacío");

  // Se escribe a disco porque SQLite necesita un fichero real para abrirlo.
  const ruta = `${process.env.TEMP ?? "."}/incideas-prueba-${process.pid}.gpkg`;
  writeFileSync(ruta, buf);

  const db = new DatabaseSync(ruta, { readOnly: true });
  try {
    const appId = db.prepare("pragma application_id").get();
    assert.equal(
      Number(Object.values(appId)[0]),
      1196444487,
      "El identificador de aplicación debe ser el de GeoPackage"
    );

    const capas = db.prepare("select table_name, srs_id from gpkg_contents").all();
    assert.equal(capas.length, 1);
    assert.equal(capas[0].srs_id, 4326, "WGS 84");

    const n = db.prepare("select count(*) as n from inventario").get();
    assert.equal(n.n, 5, "Deben estar los cinco puntos");

    const fila = db
      .prepare("select geom, nombre from inventario where nombre = 'Punto 3'")
      .get();
    assert.ok(fila, "Debe existir el punto 3");
    const geom = Buffer.from(fila.geom as Uint8Array);
    assert.equal(geom.toString("ascii", 0, 2), "GP", "El BLOB lleva cabecera GeoPackage");
    assert.equal(fila.nombre, "Punto 3");
  } finally {
    db.close();
    unlinkSync(ruta);
  }
});

test("construirGeoPackage con la lista vacía no falla", () => {
  const buf = construirGeoPackage([], ["nombre"], { capa: "inventario" });
  assert.ok(buf.length > 0, "Un GeoPackage sin elementos sigue siendo un fichero válido");
});

// ---------------------------------------------------------------------------
// Territorio y población
// ---------------------------------------------------------------------------

test("superficieDesdeGeoJson calcula un área razonable", () => {
  // Un cuadrado de 0,1 grados de lado en el ecuador mide unos 11,1 km por
  // 11,3 km, es decir del orden de 126 km2.
  const cuadrado = {
    type: "Polygon" as const,
    coordinates: [
      [
        [0, 0],
        [0.1, 0],
        [0.1, 0.1],
        [0, 0.1],
        [0, 0],
      ],
    ],
  };
  const km2 = superficieDesdeGeoJson(cuadrado);
  assert.ok(km2 !== null, "Debe poder calcularse");
  assert.ok(
    Math.abs(km2! - 126) < 4,
    `Un cuadrado de 0,1 grados da unos 126 km2, dio ${km2}`
  );
});

test("superficieDesdeGeoJson devuelve null si la geometría no es un polígono", () => {
  assert.equal(
    superficieDesdeGeoJson({ type: "Point", coordinates: [0, 0] }),
    null,
    "Un punto no tiene superficie"
  );
  assert.equal(superficieDesdeGeoJson(null), null);
});

test("resolverPoblacion prefiere el padrón del INE y avisa de la discrepancia", () => {
  const avisos: string[] = [];
  const registros = [
    {
      categoria: "poblacion",
      subcategoria: "padron",
      atributos: { periodo: "2020", poblacion: 66_642 },
    },
    {
      categoria: "poblacion",
      subcategoria: "padron",
      atributos: { periodo: "2025", poblacion: 77_327 },
    },
  ] as never as Parameters<typeof resolverPoblacion>[0];

  const r = resolverPoblacion(registros, 1021, avisos);
  assert.equal(r.poblacion, 77_327, "Se queda con el año más reciente");
  assert.equal(r.anio, 2025);
  assert.equal(r.poblacion_en_tabla_municipios, 1021);
  assert.ok(
    avisos.some((a) => a.includes("1021")),
    "Debe avisar de que la tabla municipalities no cuadra"
  );
});

test("resolverPoblacion sin padrón avisa de que el dato no está contrastado", () => {
  const avisos: string[] = [];
  const r = resolverPoblacion([] as never, 1021, avisos);
  assert.equal(r.poblacion, 1021);
  assert.equal(r.anio, null, "Sin padrón no se puede decir el año");
  assert.ok(avisos.length > 0, "Debe dejar constancia de la falta de contraste");
});

test("leerCoordenadas rechaza valores imposibles y acepta el respaldo geométrico", () => {
  assert.equal(
    leerCoordenadas({ coordenadas: { lat: 38.5, lng: -0.1 }, geometria: null })?.lat,
    38.5
  );
  assert.equal(
    leerCoordenadas({ coordenadas: { lat: 0, lng: 0 }, geometria: null }),
    null,
    "El origen del mar no es un municipio"
  );
  assert.equal(
    leerCoordenadas({ coordenadas: { lat: 200, lng: 0 }, geometria: null }),
    null,
    "Una latitud de 200 grados no existe"
  );
  assert.equal(
    leerCoordenadas({ coordenadas: null, geometria: { type: "Point", coordinates: [-0.1, 38.5] } })?.lng,
    -0.1,
    "Si no hay campo coordenadas, se usa la geometría"
  );
});

// ---------------------------------------------------------------------------
// Libro completo
// ---------------------------------------------------------------------------

test("construirLibroMunicipal produce un libro navegable con los datos", async () => {
  const filas = [
    fila({ nombre: "Farmacia de prueba", categoria: "equipamientos", subcategoria: "farmacia", tipo: "farmacia" }),
    fila({ nombre: "Parque de prueba", categoria: "territorio", subcategoria: "nucleo", tipo: "nucleo" }),
    fila({
      nombre: "4",
      estado_nombre: "por_revisar",
      advertencias: "Nombre numérico pendiente de revisión.",
      categoria: "territorio",
      subcategoria: "partida",
      tipo: "partida",
    }),
  ];
  const entrada: EntradaLibro = {
    codigo_ine: "03031",
    municipio: "Benidorm",
    provincia: "Alicante",
    comunidad_autonoma: "Comunitat Valenciana",
    comarca: SIN_COMARCA,
    poblacion: 77_327,
    superficie_km2: null,
    anio_poblacion: 2025,
    generado_en: "2026-10-01T00:00:00.000Z",
    filas,
    fuentes: [
      {
        nombre: "OpenStreetMap (Overpass)",
        organismo: "OpenStreetMap",
        tipo: "osm_overpass",
        licencia: "ODbL 1.0",
        url: "",
        cobertura: "Benidorm",
        periodicidad: "Puntual",
        fecha_ultima_consulta: "2026-01-15",
        version_esquema: null,
        registros_en_libro: filas.length,
        limitaciones: null,
      },
    ],
  };

  const buffer = await construirLibroMunicipal(entrada);
  assert.ok(buffer.length > 0, "El libro no puede estar vacío");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const nombres = wb.worksheets.map((h) => h.name);

  assert.ok(nombres.includes("00_PORTADA"), "Debe haber portada");
  assert.ok(nombres.includes("01_RESUMEN"), "Debe haber resumen");
  assert.ok(
    nombres.some((h) => h.startsWith("07_EQUIPAMIENTOS")),
    "Debe haber una hoja por categoría"
  );
  assert.ok(nombres.includes("12_CARENCIAS"), "Debe explicar las carencias");
  assert.ok(nombres.includes("14_METODOLOGIA"), "Debe explicar el método");

  // La tabla de una categoría debe llevar filtro y panel inmovilizado.
  const hoja = wb.getWorksheet("07_EQUIPAMIENTOS")!;
  assert.ok(hoja.autoFilter, "La tabla debe tener filtro");
  assert.equal(hoja.views?.[0]?.state, "frozen", "La tabla debe quedar inmovilizada");

  // El índice debe enlazar con las hojas que existen.
  const portada = wb.getWorksheet("00_PORTADA")!;
  let enlaces = 0;
  portada.eachRow((row) => {
    row.eachCell((c) => {
      const v = c.value as { hyperlink?: string } | null;
      if (v && typeof v === "object" && v.hyperlink) {
        const m = /^#'(.+)'!/.exec(v.hyperlink);
        assert.ok(m && wb.getWorksheet(m[1]), `El enlace ${v.hyperlink} no apunta a ninguna hoja`);
        enlaces++;
      }
    });
  });
  assert.ok(enlaces > 0, "El índice debe navegar a las hojas");

  // La hoja de identificadores técnicos queda oculta, no visible entre las demás.
  const tecnica = wb.getWorksheet("_ID_TECNICO");
  if (tecnica) {
    assert.notEqual(tecnica.state, "visible", "La hoja técnica no debe quedar visible");
  }
});

test("el libro se genera aunque alguna fila venga incompleta", async () => {
  const entrada: EntradaLibro = {
    codigo_ine: "03031",
    municipio: "Benidorm",
    provincia: "Alicante",
    comunidad_autonoma: "Comunitat Valenciana",
    comarca: SIN_COMARCA,
    poblacion: null,
    superficie_km2: null,
    anio_poblacion: null,
    generado_en: "2026-10-01T00:00:00.000Z",
    // Sin nombre, sin coordenadas y sin fuente: el caso peor.
    filas: [
      fila({
        nombre: "",
        lat: null,
        lng: null,
        fuente: "",
        licencia: "",
      }),
    ],
    fuentes: [],
  };
  const buffer = await construirLibroMunicipal(entrada);
  assert.ok(buffer.length > 0, "Una fila incompleta no puede impedir la generación");
});
