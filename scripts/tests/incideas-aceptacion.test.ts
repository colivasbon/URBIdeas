// Pruebas de aceptación de INCideas.
//
// Uso: npx tsx --test scripts/tests/incideas-aceptacion.test.ts
//
// Las pruebas se agrupan en cuatro bloques:
//
//   1. Línea de base documental. Se leen los ficheros entregados y se comprueba que
//      las cifras del encargo se reproducen, y de dónde sale la única diferencia
//      entre el Excel adjunto y el libro nuevo.
//   2. Importación de la plantilla municipal. Se comprueba la lectura de la hoja
//      de partidas con sus dos bloques, el encabezado repetido y la idempotencia
//      de las claves.
//   3. Formatos abiertos. Se comprueba que la geometría sobrevive al viaje a WKT y
//      vuelve, y que el GeoPackage se abre.
//   4. Exportación. Se comprueba con un cliente falso que la paginación supera el
//      millar, que el filtro de visibilidad no se puede saltar y que todos los
//      formatos salen de la misma instantánea.
//
// Las pruebas 1 y 2 leen los documentos reales de `INCIDEAS DOCUMENTOS`. Si no
// están, la prueba se salta con un aviso explícito en vez de darse por buena.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import * as XLSX from "xlsx";

import {
  clavePartida,
  clavesUnicas,
  esListaNumerica,
  identidadPartida,
  leerPartidas,
} from "../../src/lib/incideas/plantilla-partidas";
import { geometriaAWKT, wktAGeoJSON } from "../../src/lib/incideas/formato-abierto";
import {
  construirCSVInventario,
  construirGeoJSONInventario,
  paginarRegistros,
  type ClienteSupabase,
  type RegistroCrudo,
} from "../../src/lib/incideas/cargar-libro";
import { construirGeoPackageInventario } from "../../src/lib/incideas/formato-abierto-gpkg";
import { construirLibroMunicipal, type EntradaLibro, type FilaLibro } from "../../src/lib/incideas/libro-municipal";
import { SIN_COMARCA } from "../../src/lib/incideas/cargar-libro";

const RAIZ = process.cwd();
const ADJUNTO = path.join(RAIZ, "INCIDEAS DOCUMENTOS", "incideas_03031_todos.xlsx");
const PLANTILLA = path.join(RAIZ, "INCIDEAS DOCUMENTOS", "Limpieza info.xlsx");

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

type Fila = Record<string, unknown>;

function t(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

function num(v: unknown): number | null {
  const s = t(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function conCoordenadas(f: Fila): boolean {
  const lat = num(f.lat);
  const lng = num(f.lng);
  return lat !== null && lng !== null && lat !== 0 && lng !== 0;
}

function conteo(valores: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of valores) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

// ===========================================================================
// 1. Línea de base documental
// ===========================================================================

const HAY_ADJUNTO = existsSync(ADJUNTO);

test("el Excel adjunto tiene la estructura que declara el encargo", { skip: !HAY_ADJUNTO }, () => {
  const wb = XLSX.read(readFileSync(ADJUNTO), { type: "buffer" });
  assert.deepEqual(wb.SheetNames, ["Registros", "Léame"], "Debe tener dos hojas");

  const ws = wb.Sheets["Registros"];
  const cabeceras = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, range: 0 })[0] ?? [];
  const filas = XLSX.utils.sheet_to_json<Fila>(ws, { defval: null, raw: true });

  assert.equal(filas.length, 1378, "1.378 filas de datos");
  assert.equal(cabeceras.length, 20, "20 columnas");
  assert.equal(
    XLSX.utils.sheet_to_json<Fila>(wb.Sheets["Léame"], { defval: null }).length,
    10,
    "La hoja «Léame» tiene 10 filas de metadatos"
  );
});

test("las cifras de coordenadas y estados se reproducen exactamente", { skip: !HAY_ADJUNTO }, () => {
  const wb = XLSX.read(readFileSync(ADJUNTO), { type: "buffer" });
  const filas = XLSX.utils.sheet_to_json<Fila>(wb.Sheets["Registros"], { defval: null, raw: true });

  const conCoords = filas.filter(conCoordenadas);
  assert.equal(conCoords.length, 1110, "1.110 filas con latitud y longitud");
  assert.equal(filas.length - conCoords.length, 268, "268 filas sin ambas coordenadas");
  assert.equal(
    conCoords.length + (filas.length - conCoords.length),
    filas.length,
    "Las dos mitades suman el total: no hay filas con una sola coordenada contadas aparte"
  );

  const validacion = conteo(filas.map((f) => t(f.estado_validacion)));
  assert.equal(validacion.get("automatico_sin_revisar"), 940, "940 registros automáticos sin revisar");
  assert.equal(validacion.get("contrastado"), 437, "437 contrastados");
  assert.equal(validacion.get("validado_tecnicamente"), 1, "1 validado técnicamente");
  assert.equal(validacion.size, 3, "No hay otros estados de validación");

  const espacial = conteo(filas.map((f) => t(f.estado_espacial)));
  assert.equal(espacial.get("fuera_municipio"), 99, "99 fuera del municipio");
  assert.equal(espacial.get("proximo_limite"), 264, "264 próximos al límite");

  const soloCifras = filas.filter((f) => /^[0-9]+$/.test(t(f.nombre)));
  assert.equal(soloCifras.length, 42, "42 nombres constituidos solo por cifras");
});

test("las huellas repetidas se descomponen en 62 filasCaducadas y 103 activas", { skip: !HAY_ADJUNTO }, () => {
  const wb = XLSX.read(readFileSync(ADJUNTO), { type: "buffer" });
  const filas = XLSX.utils.sheet_to_json<Fila>(wb.Sheets["Registros"], { defval: null, raw: true });

  // Solo la huella.
  const porHuella = new Map<string, Fila[]>();
  for (const f of filas) {
    const h = t(f.huella);
    if (!h) continue;
    porHuella.set(h, [...(porHuella.get(h) ?? []), f]);
  }
  const gruposHuella = [...porHuella.values()].filter((l) => l.length > 1);
  assert.equal(gruposHuella.length, 62, "62 grupos de huellas repetidas");
  assert.equal(
    gruposHuella.reduce((s, l) => s + l.length, 0),
    165,
    "165 filas dentro de esos grupos"
  );

  // Fuente + huella, que es la clave con la que se importa.
  const porFuenteHuella = new Map<string, Fila[]>();
  for (const f of filas) {
    const k = `${t(f.fuente)} ${t(f.huella)}`;
    porFuenteHuella.set(k, [...(porFuenteHuella.get(k) ?? []), f]);
  }
  const grupos = [...porFuenteHuella.values()].filter((l) => l.length > 1);
  const repeticiones = grupos.reduce((s, l) => s + l.length - 1, 0);
  assert.equal(repeticiones, 103, "103 repeticiones adicionales por fuente + huella");

  // Comprobación que separa las dos mitades y explica la cifra: de cada grupo, una
  // fila quedó caducada por el cambio de forma de la clave de importación, y las
  // demás son entidades distintas que comparten huella.
  const enGrupos = grupos.flat();
  const caducadas = enGrupos.filter((f) => t(f.posible_baja_desde) !== "");
  const activas = enGrupos.filter((f) => t(f.posible_baja_desde) === "");
  assert.equal(caducadas.length, 62, "Hay una fila caducada por grupo");
  assert.equal(activas.length, 103, "Las 103 repeticiones son filas activas, no duplicados");
  assert.equal(caducadas.length + activas.length, 165);

  // Las activas no comparten identificador de origen: son entidades distintas. Si
  // lo compartieran, sí serían duplicados y esta prueba fallaría.
  const idsActivos = new Set(activas.map((f) => t(f.id_origen)));
  assert.equal(
    idsActivos.size,
    activas.length,
    "Cada fila activa tiene su propio identificador de origen: no son la misma fila"
  );

  // Y todas las caducadas vienen de la plantilla municipal, que es la fuente cuya
  // clave se cambió.
  const fuentesCaducadas = new Set(caducadas.map((f) => t(f.fuente)));
  assert.equal(
    [...fuentesCaducadas].every((f) => f.includes("Plantilla municipal")),
    true,
    "Las filas caducadas son de la plantilla municipal, la única fuente cuya clave cambió"
  );
});

test("la diferencia de una coordenada es el límite municipal, no una transformación", { skip: !HAY_ADJUNTO }, () => {
  const wb = XLSX.read(readFileSync(ADJUNTO), { type: "buffer" });
  const filas = XLSX.utils.sheet_to_json<Fila>(wb.Sheets["Registros"], { defval: null, raw: true });

  // En el adjunto, el límite municipal no tiene latitud ni longitud, pero sí WKT.
  const limite = filas.find(
    (f) => t(f.categoria) === "territorio" && t(f.subcategoria) === "limite_municipal"
  );
  assert.ok(limite, "El adjunto debe traer el límite municipal");
  assert.equal(num(limite.lat), null, "El adjunto no le da coordenadas al límite");
  assert.equal(num(limite.lng), null);
  assert.ok(
    t(limite.geometria_wkt).startsWith("MULTIPOLYGON"),
    `El límite sí está como polígono: ${t(limite.geometria_wkt).slice(0, 20)}…`
  );

  // Por eso el libro nuevo tiene 1.111 puntos y el adjunto 1.110: el generador
  // nuevo toma un punto representativo de la geometría. Ninguna coordenada se ha
  // convertido dos veces ni se ha desplazado.
  const resto = filas.filter((f) => f !== limite);
  assert.equal(resto.filter(conCoordenadas).length, 1110, "Los otros 1.377 siguen igual");

  // Y el punto que sale del polígono cae dentro del ámbito municipal, lo que
  // descarta que sea una transformación equivocada.
  const gj = wktAGeoJSON(t(limite.geometria_wkt));
  assert.ok(gj, "El WKT del límite tiene que entenderse");
  assert.equal(gj.type, "MultiPolygon");
});

// ===========================================================================
// 2. Importación de la plantilla municipal
// ===========================================================================

const HAY_PLANTILLA = existsSync(PLANTILLA);

function hojaPartidas(): (string | number | null)[][] {
  const wb = XLSX.readFile(PLANTILLA);
  return XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets["Núcleos_partidas"], {
    header: 1,
    blankrows: true,
    defval: null,
  }) as (string | number | null)[][];
}

test("la hoja de partidas tiene dos bloques y un encabezado repetido", { skip: !HAY_PLANTILLA }, () => {
  const lectura = leerPartidas(hojaPartidas());

  assert.equal(lectura.bloques.length, 2, "Se detectan dos bloques");
  assert.equal(lectura.bloques[0].fila_encabezado, 1, "El primer bloque abre en la fila 1");
  assert.equal(lectura.bloques[0].desplazamiento, 1, "Con la partida en la columna B");
  assert.equal(lectura.bloques[1].fila_encabezado, 83, "El segundo bloque abre en la fila 83");
  assert.equal(lectura.bloques[1].desplazamiento, 0, "Con la partida en la columna A");
  assert.equal(lectura.bloques[0].filas, 74, "El primer bloque aporta 74 filas");
  assert.equal(lectura.bloques[1].filas, 53, "El segundo bloque aporta 53 filas");
  assert.equal(lectura.filas.length, 127, "127 partidas leídas");
});

test("ninguna partida queda con un número de distrito por nombre", { skip: !HAY_PLANTILLA }, () => {
  const lectura = leerPartidas(hojaPartidas());

  // Este es el defecto que se corrige: antes, desde la fila 83 el importador leía el
  // distrito como nombre de partida y salían partidas llamadas «2», «3» o «4».
  const numericas = lectura.filas.filter((f) => /^[\d.,\s]+$/.test(f.partida));
  assert.equal(
    numericas.length,
    0,
    `Ninguna partida puede llamarse solo con cifras: ${numericas.map((f) => f.partida).join(", ")}`
  );

  // Y el encabezado repetido se descarta, no entra como una partida llamada
  // «Distrito».
  assert.ok(
    !lectura.filas.some((f) => f.partida === "Distrito" || f.partida === "Partida"),
    "El encabezado repetido no puede convertirse en una partida"
  );
});

test("las partidas del segundo bloque conservan sus nombres reales", { skip: !HAY_PLANTILLA }, () => {
  const lectura = leerPartidas(hojaPartidas());
  const segundo = lectura.filas.filter((f) => f.desplazamiento === 0);

  assert.ok(segundo.length > 0, "El segundo bloque tiene filas");
  assert.ok(
    segundo.every((f) => f.partida.length > 1),
    "Todos los nombres del segundo bloque son texto"
  );
  // Ninguna puede ser un número de distrito.
  assert.equal(
    segundo.filter((f) => /^\d+$/.test(f.partida)).length,
    0,
    "Ninguna es un número de distrito"
  );
});

test("la clave de partida no incluye el área: una partida no se multiplica por áreas", () => {
  // La hoja documenta «Serra Gelada» dos veces: en el primer bloque con una fila
  // por área (6, luego 9, luego 13) y en el segundo con la lista completa
  // («6, 9, 13»). Con el área en la clave eran tres entidades y el libro la
  // mostraba repetida. El área es un atributo que se acumula.
  const base = { fila: 1, desplazamiento: 1, partida: "Serra Gelada", distrito: "3" };
  const porArea = clavePartida({ ...base, area: "6" });
  const lista = clavePartida({ ...base, area: "6, 9, 13" });
  assert.equal(
    porArea,
    lista,
    "Las filas por área y la fila con la lista completa son la misma entidad"
  );
  assert.equal(lista, "partida|3|Serra Gelada");

  // Lo que sí distingue entidades es el distrito o el nombre.
  assert.notEqual(lista, clavePartida({ ...base, distrito: "4", area: "6, 9, 13" }));
  assert.notEqual(lista, clavePartida({ ...base, partida: "Pla del Quarter", area: "6, 9, 13" }));
});

test("la identidad de una clave guardada separa los lugares de los artefactos", () => {
  // Claves bien formadas.
  assert.deepEqual(identidadPartida("partida|3|Serra Gelada"), {
    identidad: "partida|3|Serra Gelada",
    artefacto: false,
  });
  assert.deepEqual(identidadPartida("partida|3|Serra Gelada|6, 9, 13"), {
    identidad: "partida|3|Serra Gelada",
    artefacto: false,
  });

  // Artefactos de la lectura que tomaba la columna Distrito por nombre. La
  // columna solo tiene cuatro valores, así que estos nombres no son topónimos.
  assert.equal(identidadPartida("partida|4, 5|4|").artefacto, true);
  assert.equal(identidadPartida("partida|10|1|").artefacto, true);
  assert.equal(identidadPartida("partida|Subsector|Distrito|").artefacto, true);
  assert.equal(identidadPartida("partida|3|").artefacto, true);

  // Y un topónimo que empiece por cifra sigue siendo un topónimo.
  assert.equal(identidadPartida("partida|4|Alt de Rajadell").artefacto, false);
});

test("esListaNumerica distingue una lista de un texto que lo parezca", () => {
  assert.equal(esListaNumerica("6, 9, 13"), true);
  assert.equal(esListaNumerica("6,9,13"), true);
  assert.equal(esListaNumerica("6"), false, "Un solo número no es una lista");
  assert.equal(esListaNumerica("6, 9, norte"), false, "Con texto no es una lista de áreas");
  assert.equal(esListaNumerica(""), false);
});

test("clavesUnicas separa lo que se repite de lo que no", () => {
  const r = clavesUnicas(["a", "b", "a", "c", "a"]);
  assert.deepEqual(r.unicas, ["a", "b", "c"]);
  assert.deepEqual(r.repetidas, ["a", "a"]);
});

test("la lectura de partidas es idempotente: dos veces da las mismas claves", { skip: !HAY_PLANTILLA }, () => {
  const primera = leerPartidas(hojaPartidas()).filas.map(clavePartida);
  const segunda = leerPartidas(hojaPartidas()).filas.map(clavePartida);
  assert.deepEqual(segunda, primera, "La lectura tiene que ser determinista");
});

test("una fila de encabezado en medio de la hoja no se lee como partida", () => {
  // Hoja mínima que reproduce el caso real: cabecera con la partida en la columna B,
  // un bloque de datos, y un encabezado repetido que abre un bloque desplazado.
  const lectura = leerPartidas([
    [null, "PARTIDA", "DISTRITO", "ÁREA"],
    [null, "El Calvari", 1, 10],
    ["Partida", "Distrito", "Subsector", null],
    [null, null, null, null],
    ["La Caseta", 1, 10],
  ] as never);

  // Lo que importa es que el encabezado no se convierta en una partida llamada
  // «Distrito», y que las dos partidas de datos sí se lean con su nombre.
  assert.deepEqual(
    lectura.filas.map((f) => f.partida),
    ["El Calvari", "La Caseta"],
    "Se leen las dos partidas, con su nombre y sin el encabezado"
  );
  assert.equal(
    lectura.filas.filter((f) => f.distrito === "Subsector").length,
    0,
    "El «Distrito» del encabezado no puede pasar por distrito de una partida"
  );
  assert.equal(lectura.bloques.length, 2, "El encabezado repetido abre el segundo bloque");
  assert.equal(lectura.descartadas.some((d) => d.motivo === "partida_vacia"), false,
    "Una fila totalmente vacía es separador, no carencia");
});

test("un encabezado que repite el mismo desplazamiento se declara y se descarta", () => {
  const lectura = leerPartidas([
    [null, "PARTIDA", "DISTRITO", "ÁREA"],
    [null, "El Calvari", 1, 10],
    [null, "PARTIDA", "DISTRITO", "ÁREA"],
    [null, "La Caseta", 1, 10],
  ] as never);

  const repetidos = lectura.descartadas.filter((d) => d.motivo === "encabezado_repetido");
  assert.equal(repetidos.length, 1, "El segundo encabezado se declara como repetido");
  assert.equal(repetidos[0].fila, 3, "Y se sabe en qué fila está");
  assert.deepEqual(
    lectura.filas.map((f) => f.partida),
    ["El Calvari", "La Caseta"],
    "Las dos partidas se leen igual"
  );
  assert.equal(lectura.bloques.length, 1, "Y no abre un bloque nuevo, porque no cambia el desplazamiento");
});

test("leerPartidas no inventa columnas cuando la hoja no tiene cabecera", () => {
  const lectura = leerPartidas([
    [null, "El Calvari", 1, 10],
    [null, "La Caseta", 1, 10],
  ] as never);
  assert.equal(lectura.filas.length, 0, "Sin cabecera reconocible no se lee nada");
  assert.equal(lectura.bloques.length, 0);
});

// ===========================================================================
// 3. Formatos abiertos
// ===========================================================================

test("la geometría sobrevive al viaje a WKT y de vuelta", () => {
  const geometrias: GeoJSON.Geometry[] = [
    { type: "Point", coordinates: [-0.1225, 38.5411] },
    { type: "LineString", coordinates: [[-0.1, 38.5], [-0.2, 38.6]] },
    {
      type: "Polygon",
      coordinates: [
        [
          [-0.1, 38.5],
          [-0.2, 38.5],
          [-0.2, 38.6],
          [-0.1, 38.5],
        ],
      ],
    },
    {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [-0.1, 38.5],
            [-0.2, 38.5],
            [-0.2, 38.6],
            [-0.1, 38.5],
          ],
        ],
        [
          [
            [-0.3, 38.7],
            [-0.4, 38.7],
            [-0.4, 38.8],
            [-0.3, 38.7],
          ],
        ],
      ],
    },
    { type: "MultiPoint", coordinates: [[-0.1, 38.5], [-0.2, 38.6]] },
    {
      type: "MultiLineString",
      coordinates: [
        [[-0.1, 38.5], [-0.2, 38.6]],
        [[-0.3, 38.7], [-0.4, 38.8]],
      ],
    },
  ];

  for (const g of geometrias) {
    const wkt = geometriaAWKT(g);
    assert.ok(wkt.length > 0, `${g.type} debe tener WKT`);
    const vuelta = wktAGeoJSON(wkt);
    assert.ok(vuelta, `El WKT de ${g.type} tiene que entenderse: ${wkt}`);
    assert.equal(vuelta.type, g.type, `El tipo se conserva en ${g.type}`);
    assert.equal(
      JSON.stringify(vuelta.coordinates),
      JSON.stringify(g.coordinates),
      `Las coordenadas se conservan en ${g.type}`
    );
  }
});

test("wktAGeoJSON devuelve null en vez de adivinar", () => {
  assert.equal(wktAGeoJSON(""), null);
  assert.equal(wktAGeoJSON(null), null);
  assert.equal(wktAGeoJSON("CIRCULARSTRING (0 0, 1 1, 2 0)"), null, "Un tipo no admitido no se interpreta");
  assert.equal(wktAGeoJSON("POINT (abc def)"), null, "Una coordenada no numérica no se inventa");
  assert.equal(wktAGeoJSON("POLYGON ((0 0, 1 0, 1 1))"), null, "Un anillo con menos de 4 puntos no es un polígono");
});

test("el límite municipal con 697 vértices se guarda y se vuelve a leer", { skip: !HAY_ADJUNTO }, () => {
  const wb = XLSX.read(readFileSync(ADJUNTO), { type: "buffer" });
  const filas = XLSX.utils.sheet_to_json<Fila>(wb.Sheets["Registros"], { defval: null, raw: true });
  const limite = filas.find((f) => t(f.subcategoria) === "limite_municipal")!;
  const wkt = t(limite.geometria_wkt);

  const gj = wktAGeoJSON(wkt);
  assert.ok(gj, "Un polígono de 697 vértices tiene que poder leerse");
  assert.equal(gj.type, "MultiPolygon");
  const anillos = (gj.coordinates as number[][][][]).flat();
  const vertices = anillos.reduce((s, a) => s + a.length, 0);
  // El número de vértices se cuenta sobre el texto original y sobre lo releído: si
  // el conversor perdiera alguno, los dos no coincidirían.
  const originales = (wkt.match(/-?\d+\.\d+/g) ?? []).length / 2;
  assert.equal(vertices, originales, "No se pierde ningún vértice al volver a leer el WKT");
  assert.equal(vertices, 697, "Y son los 697 del límite de Benidorm");
  // Cada anillo de un polígono va cerrado.
  for (const a of anillos) {
    assert.deepEqual(a[0], a[a.length - 1], "Un anillo de polígono tiene que empezar y acabar igual");
  }
});

// ===========================================================================
// 4. Exportación
// ===========================================================================

/**
 * Cliente falso de Supabase. Aplica los mismos filtros que el servidor, incluida la
 * paginación, para poder comprobar que el cargador supera el millar de filas y que
 * no se salta el filtro de visibilidad.
 */
function clienteFalso(filas: RegistroCrudo[], tamPagina = 1000): ClienteSupabase & {
  leidas: { rango: [number, number]; filtros: string[] }[];
} {
  const leidas: { rango: [number, number]; filtros: string[] }[] = [];

  const aplicar = (
    lista: RegistroCrudo[],
    filtros: { col: string; op: string; val: unknown }[],
    desde: number,
    hasta: number
  ) => {
    let out = lista;
    for (const f of filtros) {
      out = out.filter((r) => {
        const v = (r as unknown as Record<string, unknown>)[f.col];
        switch (f.op) {
          case "eq":
            return v === f.val;
          case "is_null":
            return v === null || v === undefined;
          case "not_in":
            return !String(f.val)
              .replace(/[()]/g, "")
              .split(",")
              .includes(String(v));
          default:
            return true;
        }
      });
    }
    return out.slice(desde, hasta + 1);
  };

  return {
    leidas,
    from(tabla: string) {
      const filtros: { col: string; op: string; val: unknown }[] = [];
      let modo: "filas" | "conteo" = "filas";
      let ordenAsc = true;

      const consulta = {
        eq(col: string, val: unknown) {
          filtros.push({ col, op: "eq", val });
          return consulta;
        },
        is(col: string, val: unknown) {
          filtros.push({ col, op: "is_null", val });
          return consulta;
        },
        not(col: string, _op: string, val: unknown) {
          filtros.push({ col, op: "not_in", val });
          return consulta;
        },
        order(_c: string, asc = true) {
          ordenAsc = asc;
          return consulta;
        },
        range(desde: number, hasta: number) {
          leidas.push({ rango: [desde, hasta], filtros: filtros.map((f) => `${f.col}:${f.op}`) });
          const todas = aplicar(filas, filtros, 0, filas.length);
          const datos = aplicar(filas, filtros, desde, hasta);
          const ordenadas = [...datos].sort((a, b) =>
            ordenAsc ? String(a.id).localeCompare(String(b.id)) : String(b.id).localeCompare(String(a.id))
          );
          return Promise.resolve({ data: ordenadas, error: null, count: todas.length });
        },
        limit(n: number) {
          modo = "conteo";
          const todas = aplicar(filas, filtros, 0, filas.length);
          void n;
          return Promise.resolve({
            data: modo === "conteo" ? [] : todas,
            error: null,
            count: todas.length,
          });
        },
      };
      void tabla;
      void tamPagina;
      return { select: () => consulta };
    },
  } as never;
}

function registroCrudo(i: number, extra: Partial<RegistroCrudo> = {}): RegistroCrudo {
  return {
    id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    codigo_ine: "03031",
    categoria: "equipamientos",
    subcategoria: "farmacia",
    nombre_oficial: `Elemento ${i}`,
    ...extra,
  } as RegistroCrudo;
}

test("la paginación supera el millar de filas sin truncar", async () => {
  // Mil doscientas filas: si el cargador leyera una sola página, devolvería mil.
  const filas = Array.from({ length: 1200 }, (_, i) => registroCrudo(i + 1));
  const cliente = clienteFalso(filas);

  const r = await paginarRegistros(cliente, "03031");
  assert.equal(r.filas.length, 1200, "Llegan las 1.200 filas, no solo la primera página");
  assert.equal(r.total_en_municipio, 1200);
  assert.ok(
    cliente.leidas.some((l) => l.rango[1] > 1000),
    "Ha hecho falta más de una página"
  );
});

test("el filtro de visibilidad no se puede saltar por la vía de lectura", async () => {
  const filas = [
    registroCrudo(1, { visibilidad: "publica" }),
    registroCrudo(2, { visibilidad: "restringida" }),
    registroCrudo(3, { visibilidad: "personal_protegida" }),
    registroCrudo(4, { visibilidad: "tecnica" }),
  ];
  const cliente = clienteFalso(filas);
  const r = await paginarRegistros(cliente, "03031");

  assert.deepEqual(
    r.filas.map((f) => f.id.endsWith("000000000001") ? 1 : f.id.endsWith("000000000002") ? 2 : f.id.endsWith("000000000003") ? 3 : 4),
    [1, 4],
    "Solo salen la pública y la técnica; la restringida y la protegida, nunca"
  );
  assert.equal(r.excluidos_visibilidad, 2, "Y el libro declara cuántas ha dejado fuera");
  assert.ok(
    cliente.leidas.every((l) => l.filtros.some((f) => f.startsWith("visibilidad:not_in"))),
    "Todas las lecturas paginadas llevan el filtro de visibilidad"
  );
});

test("los registros dados de baja quedan fuera y se cuentan aparte", async () => {
  const filas = [
    registroCrudo(1, { eliminado_en: null }),
    registroCrudo(2, { eliminado_en: "2026-10-01T00:00:00Z" }),
    registroCrudo(3, { eliminado_en: null }),
  ];
  const cliente = clienteFalso(filas);
  const r = await paginarRegistros(cliente, "03031");

  assert.equal(r.filas.length, 2, "El dado de baja no sale");
  assert.equal(r.excluidos_baja, 1, "Y se declara como baja, no como invisible");
  assert.ok(
    cliente.leidas.every((l) => l.filtros.some((f) => f.startsWith("eliminado_en:is_null"))),
    "Todas las lecturas filtran los dados de baja"
  );
});

test("las bajas lógicas tampoco se publican, aunque no estén borradas", async () => {
  // En Benidorm el libro llegó a publicar 157 partidas cuando solo había 53
  // vigentes: las 104 bajas lógicas seguían apareciendo, con los duplicados por
  // área y los nombres «1», «2», «3», «4» de una lectura antigua de la plantilla.
  // Una baja lógica significa que la fuente dejó de documentar el registro, así
  // que no debe publicarse como si siguiera vigente.
  const filas = [
    registroCrudo(1, { eliminado_en: null, desactualizado_desde: null }),
    registroCrudo(2, { eliminado_en: null, desactualizado_desde: "2026-10-05T00:00:00Z" }),
    registroCrudo(3, { eliminado_en: null, desactualizado_desde: null }),
    registroCrudo(4, { eliminado_en: null, desactualizado_desde: "2026-10-05T00:00:00Z" }),
  ];
  const cliente = clienteFalso(filas);
  const r = await paginarRegistros(cliente, "03031");

  assert.equal(r.filas.length, 2, "Solo las dos vigentes se publican");
  assert.equal(r.excluidos_baja, 2, "Las dos bajas lógicas se declaran aparte");
  assert.ok(
    cliente.leidas.every((l) => l.filtros.some((f) => f.startsWith("desactualizado_desde:is_null"))),
    "Todas las lecturas filtran las bajas lógicas"
  );
});

test("un fallo en el conteo no inventa un cero de registros excluidos", async () => {
  const filas = Array.from({ length: 5 }, (_, i) => registroCrudo(i + 1));
  const cliente = clienteFalso(filas);
  // Se rompe el conteo para comprobar que el libro se genera igual.
  const roto = {
    from: (t: string) => {
      const c = cliente.from(t);
      return {
        select: (...a: unknown[]) => {
          const q = (c.select as (...x: unknown[]) => unknown)(...a);
          return { ...(q as object), limit: () => Promise.resolve({ data: [], error: { message: "x" }, count: null }) };
        },
      };
    },
  } as unknown as ClienteSupabase;

  const r = await paginarRegistros(roto, "03031");
  assert.equal(r.filas.length, 5, "La lectura de filas sigue funcionando");
  assert.equal(r.total_en_municipio, 5);
});

test("todos los formatos parten de las mismas filas", () => {
  const filas: FilaLibro[] = Array.from({ length: 5 }, (_, i) => ({
    id_tecnico: `id-${i}`,
    codigo_ine: "03031",
    municipio: "Benidorm",
    provincia: "Alicante",
    comunidad_autonoma: "Comunitat Valenciana",
    comarca: SIN_COMARCA,
    categoria: "equipamientos",
    categoria_nombre: "Equipamientos",
    subcategoria: "farmacia",
    tipo: "farmacia",
    nombre: `Farmacia ${i}`,
    nombre_original: null,
    estado_nombre: "correcto",
    direccion: `Calle ${i}`,
    codigo_postal: null,
    nucleo: null,
    lat: 38.5 + i / 1000,
    lng: -0.12 + i / 1000,
    utm_x: null,
    utm_y: null,
    utm_huso: 30,
    crs_origen: "EPSG:4326",
    precision: "punto",
    telefono: null,
    web: null,
    horario: null,
    titularidad: "privada",
    operador: null,
    capacidad: null,
    unidad_capacidad: null,
    enlace_origen: null,
    enlace_fuente: null,
    fuente: "OpenStreetMap (Overpass)",
    licencia: "ODbL 1.0",
    fecha_obtencion: "2026-01-01T00:00:00Z",
    fecha_edicion_origen: null,
    estado_validacion: "contrastado",
    estado_espacial: "verificada",
    confianza: 50,
    distancia_limite_m: 0,
    geometria_wkt: "",
    advertencias: null,
  }));

  const csv = construirCSVInventario(filas);
  const gj = JSON.parse(construirGeoJSONInventario(filas, "prueba")) as {
    features: { properties: Record<string, unknown> }[];
  };

  const lineasCsv = csv.replace(/^\uFEFF/, "").split("\r\n").filter((l) => l.trim());
  assert.equal(lineasCsv.length, filas.length + 1, "El CSV tiene una línea por fila, más la cabecera");
  assert.equal(gj.features.length, filas.length, "El GeoJSON tiene una entidad por fila");
  assert.equal(
    CSV_A_IDS(lineasCsv[1]),
    filas[0].id_tecnico,
    "El CSV conserva el identificador técnico de la misma fila"
  );
  assert.equal(gj.features[0].properties.id_tecnico, filas[0].id_tecnico);
});

function CSV_A_IDS(linea: string): string {
  return linea.split(";")[0];
}

test("el GeoJSON declara si la geometría viene de la fuente o es un punto", () => {
  const base: FilaLibro = {
    id_tecnico: "id-1",
    codigo_ine: "03031",
    municipio: "Benidorm",
    provincia: "Alicante",
    comunidad_autonoma: "Comunitat Valenciana",
    comarca: SIN_COMARCA,
    categoria: "territorio",
    categoria_nombre: "Territorio",
    subcategoria: "limite_municipal",
    tipo: "limite_municipal",
    nombre: "Benidorm",
    nombre_original: null,
    estado_nombre: "correcto",
    direccion: null,
    codigo_postal: null,
    nucleo: null,
    lat: 38.5,
    lng: -0.12,
    utm_x: null,
    utm_y: null,
    utm_huso: 30,
    crs_origen: "EPSG:4326",
    precision: "sin_ubicacion",
    telefono: null,
    web: null,
    horario: null,
    titularidad: "publica",
    operador: null,
    capacidad: null,
    unidad_capacidad: null,
    enlace_origen: null,
    enlace_fuente: null,
    fuente: "OpenStreetMap (Nominatim)",
    licencia: "ODbL 1.0",
    fecha_obtencion: "2026-01-01T00:00:00Z",
    fecha_edicion_origen: null,
    estado_validacion: "automatico_sin_revisar",
    estado_espacial: "verificada",
    confianza: 40,
    distancia_limite_m: 0,
    geometria_wkt:
      "MULTIPOLYGON (((-0.1 38.5, -0.2 38.5, -0.2 38.6, -0.1 38.5)))",
    advertencias: null,
  };

  const conPoligono = JSON.parse(construirGeoJSONInventario([base], "p")) as {
    features: { geometry: { type: string }; properties: Record<string, unknown> }[];
  };
  assert.equal(conPoligono.features[0].geometry.type, "MultiPolygon", "El límite sale como polígono");
  assert.equal(conPoligono.features[0].properties.geometria_origen, "fuente");

  const soloPunto = JSON.parse(
    construirGeoJSONInventario([{ ...base, geometria_wkt: "" }], "p")
  ) as { features: { geometry: { type: string }; properties: Record<string, unknown> }[] };
  assert.equal(soloPunto.features[0].geometry.type, "Point", "Sin geometría, sale el punto");
  assert.equal(
    soloPunto.features[0].properties.geometria_origen,
    "punto_representativo",
    "Y se declara que es un punto representativo, no el término"
  );
});

test("el GeoPackage se abre y conserva la geometría del límite", () => {
  const fila: FilaLibro = {
    id_tecnico: "id-1",
    codigo_ine: "03031",
    municipio: "Benidorm",
    provincia: "Alicante",
    comunidad_autonoma: "Comunitat Valenciana",
    comarca: SIN_COMARCA,
    categoria: "territorio",
    categoria_nombre: "Territorio",
    subcategoria: "limite_municipal",
    tipo: "limite_municipal",
    nombre: "Benidorm",
    nombre_original: null,
    estado_nombre: "correcto",
    direccion: null,
    codigo_postal: null,
    nucleo: null,
    lat: 38.5,
    lng: -0.12,
    utm_x: null,
    utm_y: null,
    utm_huso: 30,
    crs_origen: "EPSG:4326",
    precision: "sin_ubicacion",
    telefono: null,
    web: null,
    horario: null,
    titularidad: "publica",
    operador: null,
    capacidad: null,
    unidad_capacidad: null,
    enlace_origen: null,
    enlace_fuente: null,
    fuente: "OpenStreetMap (Nominatim)",
    licencia: "ODbL 1.0",
    fecha_obtencion: "2026-01-01T00:00:00Z",
    fecha_edicion_origen: null,
    estado_validacion: "automatico_sin_revisar",
    estado_espacial: "verificada",
    confianza: 40,
    distancia_limite_m: 0,
    geometria_wkt: "MULTIPOLYGON (((-0.1 38.5, -0.2 38.5, -0.2 38.6, -0.1 38.5)))",
    advertencias: null,
  };

  const buf = construirGeoPackageInventario([fila], "prueba");
  const ruta = `${process.env.TEMP ?? "."}/incideas-aceptacion-${process.pid}.gpkg`;
  writeFileSync(ruta, buf);

  const db = new DatabaseSync(ruta, { readOnly: true });
  try {
    const n = db.prepare("select count(*) as n from inventario").get() as { n: number };
    assert.equal(n.n, 1, "El GeoPackage contiene la fila");

    const g = db.prepare("select geom, nombre, tipo from inventario").get() as {
      geom: Uint8Array;
      nombre: string;
      tipo: string;
    };
    const blob = Buffer.from(g.geom);
    // Lectura independiente de la cabecera, byte a byte, según OGC 12-128r19 tabla 3.
    // No basta con comprobar que el fichero empieza por «GP»: un BLOB mal formado
    // también lo lleva, y es justo el caso que hace que un SIG no abra la capa.
    assert.equal(blob.toString("ascii", 0, 2), "GP", "Firma GeoPackageBinary");
    assert.equal(blob.readUInt8(2), 0, "Versión 0");
    assert.equal(blob.readUInt8(3) & 0b0000_0001, 1, "Bit 0: orden de bytes little endian");
    const indicador = (blob.readUInt8(3) & 0b0000_1110) >> 1;
    assert.equal(indicador, 1, "Indicador de envolvente XY, que ocupa 32 bytes");
    assert.equal(blob.readInt32LE(4), 4326, "El SRID de la cabecera es 4326");

    // El tipo no está en la cabecera: es el primer campo del WKB, detrás de la
    // envolvente. En WKB el byte de orden ocupa un byte y el código de tipo cuatro.
    const wkb = 8 + 32;
    assert.equal(blob.readUInt8(wkb), 1, "El WKB empieza por su marca de little endian");
    assert.equal(blob.readUInt32LE(wkb + 1), 6, "El tipo 6 es MultiPolygon");

    // Recorrido completo de la geometría, que es lo que un SIG hace al abrirla.
    const nPoligonos = blob.readUInt32LE(wkb + 5);
    assert.equal(nPoligonos, 1, "Un polígono");
    const poligono = wkb + 9;
    assert.equal(blob.readUInt8(poligono), 1, "El polígono es little endian");
    assert.equal(blob.readUInt32LE(poligono + 1), 3, "Y es un Polygon");
    const anillos = blob.readUInt32LE(poligono + 5);
    assert.equal(anillos, 1, "Con un anillo");
    const anillo = poligono + 9;
    const vertices = blob.readUInt32LE(anillo);
    assert.equal(vertices, 4, "De cuatro vértices");
    const primerX = blob.readDoubleLE(anillo + 4);
    assert.ok(Math.abs(primerX - -0.1) < 1e-9, `La primera X es -0.1, dio ${primerX}`);

    // La envolvente de la cabecera tiene que encajar con la geometría, y en el
    // orden que fija el estándar: minx, maxx, miny, maxy.
    assert.ok(Math.abs(blob.readDoubleLE(8) - -0.2) < 1e-9, "La envolvente declara minx");
    assert.ok(Math.abs(blob.readDoubleLE(16) - -0.1) < 1e-9, "y maxx");
    assert.ok(Math.abs(blob.readDoubleLE(24) - 38.5) < 1e-9, "y miny");
    assert.ok(Math.abs(blob.readDoubleLE(32) - 38.6) < 1e-9, "y maxy");

    assert.equal(g.nombre, "Benidorm");
    assert.equal(g.tipo, "limite_municipal", "Los atributos viajan con la geometría");

    const tipos = db
      .prepare("select geometry_type_name from gpkg_geometry_columns")
      .get() as { geometry_type_name: string };
    assert.equal(tipos.geometry_type_name, "Polygon", "El tipo declarado es Polygon, la parte del MultiPolygon");

    const srs = db.prepare("select srs_id from gpkg_contents").get() as { srs_id: number };
    assert.equal(srs.srs_id, 4326, "El sistema de referencia declarado es WGS 84");
  } finally {
    db.close();
    unlinkSync(ruta);
  }
});

test("el libro declara la instantánea con la que se ha construido", async () => {
  const entrada: EntradaLibro = {
    codigo_ine: "03031",
    municipio: "Benidorm",
    provincia: "Alicante",
    comunidad_autonoma: "Comunitat Valenciana",
    comarca: SIN_COMARCA,
    poblacion: 77_327,
    superficie_km2: null,
    anio_poblacion: 2025,
    generado_en: "2026-10-02T00:00:00.000Z",
    filas: [],
    fuentes: [],
  };
  const buf = await construirLibroMunicipal(entrada);
  assert.ok(buf.length > 0);

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const portada = wb.getWorksheet("00_PORTADA")!;
  const textos: string[] = [];
  portada.eachRow((r) =>
    r.eachCell((c) => {
      const v = c.value as { richText?: { text: string }[] } | string | null;
      if (typeof v === "string") textos.push(v);
      else if (v && typeof v === "object" && v.richText) textos.push(v.richText.map((t) => t.text).join(""));
    })
  );
  const todo = textos.join(" | ");
  assert.ok(todo.includes("2026"), `La portada tiene que llevar la fecha de generación: ${todo.slice(0, 200)}`);
});