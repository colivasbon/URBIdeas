// INCideas — Escritura del GeoPackage.
//
// Vive en su propio módulo por una razón concreta: el GeoPackage se construye con
// el módulo SQLite incorporado en Node (`node:sqlite`), que no existe por debajo
// de la versión 22 y no tiene nada que ver con una petición web. Si este escritor
// conviviera con el CSV y el GeoJSON en el mismo fichero, cualquier ruta de la
// aplicación que necesitara el CSV acabaría arrastrando SQLite.
//
// El GeoPackage es un artefacto que se genera en el trabajo por lotes y se publica
// como fichero, no en cada petición.

import { DatabaseSync } from "node:sqlite";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import type { FilaLibro } from "./libro-municipal";
import { wktAGeoJSON } from "./formato-abierto";

/**
 * Construye el GeoPackage del inventario a partir de las filas ya calculadas por el
 * cargador. Vive aquí, y no en el cargador, por lo que explica la cabecera de este
 * módulo: es un artefacto por lotes.
 */

// ---------------------------------------------------------------------------
// Tipos locales
// ---------------------------------------------------------------------------

type Pos = number[];

export interface PropiedadGeoJSON {
  [clave: string]: string | number | boolean | null;
}

// ---------------------------------------------------------------------------
// Esquema del GeoPackage (OGC 12-128r19, Anexo C)
// ---------------------------------------------------------------------------

const SQL_GPKG_CABECERA = [
  `CREATE TABLE gpkg_contents (table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT UNIQUE, description TEXT DEFAULT '', last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER);`,
  `CREATE TABLE gpkg_geometry_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT NULL, CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name));`,
  `CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL, srs_id INTEGER NOT NULL PRIMARY KEY, organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT);`,
  `CREATE TABLE gpkg_geometry_columns_fk (gc_table_name TEXT NOT NULL, geometry_column_name TEXT NOT NULL, foreign_table_name TEXT NOT NULL, CONSTRAINT fk_gc_tn FOREIGN KEY (gc_table_name, geometry_column_name) REFERENCES gpkg_geometry_columns(table_name, column_name), CONSTRAINT fk_gc_fn FOREIGN KEY (foreign_table_name) REFERENCES gpkg_contents(table_name));`,
  `CREATE TABLE gpkg_data_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT, z TINYINT, m TINYINT, CONSTRAINT pk_data_cols PRIMARY KEY (table_name, column_name));`,
];

const SQL_GPKG_SRS = [
  `INSERT INTO gpkg_spatial_ref_sys (srs_name, srs_id, organization, organization_coordsys_id, definition, description) VALUES ('Undefined cartesian SRS', -1, 'NONE', -1, 'undefined', 'undefined cartesian');`,
  `INSERT INTO gpkg_spatial_ref_sys (srs_name, srs_id, organization, organization_coordsys_id, definition, description) VALUES ('Undefined geographic SRS', 0, 'NONE', 0, 'undefined', 'undefined geographic');`,
  `INSERT INTO gpkg_spatial_ref_sys (srs_name, srs_id, organization, organization_coordsys_id, definition, description) VALUES ('WGS 84 geodetic', 4326, 'EPSG', 4326, 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]]', 'longitude/latitude coordinates in decimal degrees on the WGS 84 spheroid');`,
  `INSERT INTO gpkg_spatial_ref_sys (srs_name, srs_id, organization, organization_coordsys_id, definition, description) VALUES ('WGS 84 / UTM zone 30N', 32630, 'EPSG', 32630, 'PROJCS["WGS 84 / UTM zone 30N",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",-3],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",0],UNIT["metre",1,AUTHORITY["EPSG","9001"]],AXIS["Easting",EAST],AXIS["Northing",NORTH],AUTHORITY["EPSG","32630"]]', 'projected');`,
];

/** Cabecera BLOB del estándar GeoPackage 1.2. */
/**
 * Cabecera del BLOB GeoPackageBinary (OGC 12-128r19, tabla 3).
 *
 *   bytes 0-1  «GP»
 *   byte  2    versión, 0
 *   byte  3    indicadores: bit 0 orden de bytes (1 = little endian),
 *              bits 1-3 indicador de envolvente (1 = envolvente XY, 32 bytes)
 *   bytes 4-7  srs_id, entero de 32 bits
 *   32 bytes   envolvente: minx, maxx, miny, maxy, en ese orden
 *
 * El tipo de geometría NO va en la cabecera: es el primer byte del WKB que va
 * detrás. Antes se escribían aquí ocho bytes de texto hexadecimal y, detrás, el
 * srs_id desplazado, de modo que ningún SIG podía leer la geometría aunque el
 * fichero pareciera válido por llevar la firma «GP».
 */
function gpkgCabecera(srs: number, envoltura: Buffer): Buffer {
  const cab = Buffer.alloc(8);
  cab.write("GP", 0, "ascii");
  cab.writeUInt8(0, 2); // versión
  // 0b0000_0001: little endian. 0b0000_0010: envolvente XY, que son 32 bytes.
  cab.writeUInt8(0b0000_0011, 3);
  cab.writeInt32LE(srs, 4);
  return Buffer.concat([cab, envoltura]);
}

/**
 * Escribe un contador de WKB.
 *
 * Un WKB entero es del mismo orden de bytes en todos sus campos. Los contadores se
 * escribían con `new Uint32Array`, que usa el orden de la máquina, mientras el
 * código de tipo y las coordenadas se escriben en little endian: en un procesador
 * x86 el resultado son contadores invertidos, y un polígono con un anillo de
 * cuatro vértices se leía como un polígono con 16.777.216 anillos de
 * 16.777.216 vértices. Por eso el orden se fija aquí y en ningún otro sitio.
 */
function contar(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

function blobWKB(g: GeoJSON.Geometry): Buffer {
  const partes: Buffer[] = [];
  const cabecera = Buffer.alloc(5);
  cabecera.writeUInt8(1, 0); // little endian
  cabecera.writeUInt32LE(tipoWKB(g.type), 1);
  partes.push(cabecera);

  if (g.type === "MultiPolygon" || g.type === "MultiLineString" || g.type === "MultiPoint") {
    const coords = (g as { coordinates: unknown }).coordinates as unknown[];
    partes.push(contar(coords.length));
    for (const c of coords) partes.push(blobWKB({ type: singular(g.type), coordinates: c } as GeoJSON.Geometry));
    return Buffer.concat(partes);
  }

  const cont = (g as { coordinates: unknown }).coordinates as unknown;
  if (typeof (cont as unknown[])[0] === "number") {
    const c = cont as number[];
    const p = Buffer.alloc(16);
    p.writeDoubleLE(c[0], 0);
    p.writeDoubleLE(c[1], 8);
    partes.push(p);
  } else if (Array.isArray(((cont as unknown[]) as unknown[])[0])) {
    const anillos = cont as Pos[][];
    partes.push(contar(anillos.length));
    for (const r of anillos) {
      partes.push(contar(r.length));
      for (const pos of r) {
        const p = Buffer.alloc(16);
        p.writeDoubleLE(pos[0], 0);
        p.writeDoubleLE(pos[1], 8);
        partes.push(p);
      }
    }
  } else {
    const puntos = cont as Pos[];
    partes.push(contar(puntos.length));
    for (const pos of puntos) {
      const p = Buffer.alloc(16);
      p.writeDoubleLE(pos[0], 0);
      p.writeDoubleLE(pos[1], 8);
      partes.push(p);
    }
  }
  return Buffer.concat(partes);
}

function tipoWKB(t: GeoJSON.Geometry["type"]): number {
  switch (t) {
    case "Point":
      return 1;
    case "LineString":
      return 2;
    case "Polygon":
      return 3;
    case "MultiPoint":
      return 4;
    case "MultiLineString":
      return 5;
    case "MultiPolygon":
      return 6;
    default:
      // Un tipo desconocido no se escribe como punto: se dice que no se sabe, para
      // que el fallo aparezca al generar el fichero y no al abrirlo en un SIG.
      throw new Error(`GeoPackage: tipo de geometría no admitido: ${t}`);
  }
}

function singular(t: GeoJSON.Geometry["type"]): GeoJSON.Geometry["type"] {
  switch (t) {
    case "MultiPoint":
      return "Point";
    case "MultiLineString":
      return "LineString";
    case "MultiPolygon":
      return "Polygon";
    default:
      return t;
  }
}

export interface FeatureGPKG {
  geom: GeoJSON.Geometry;
  propiedades: PropiedadGeoJSON;
}

/**
 * Escribe un GeoPackage 1.2 con una capa de puntos y una tabla de atributos. La capa se
 * llama `elementos`, con identificador `elementos` y sistema de referencia WGS 84.
 */
export function construirGeoPackage(
  features: FeatureGPKG[],
  cabeceras: string[],
  opciones: { capa?: string; descripcion?: string } = {}
): Buffer {
  // Import diferido: node:sqlite solo existe en Node 22 o superior.

  const capa = opciones.capa ?? "elementos";
  const db = new DatabaseSync(":memory:");

  for (const sql of SQL_GPKG_CABECERA) db.exec(sql);
  for (const sql of SQL_GPKG_SRS) db.exec(sql);

  const definicion = cabeceras
    .map((h) => `"${h.replace(/"/g, '""')}" TEXT`)
    .join(", ");
  db.exec(
    `CREATE TABLE "${capa}" (fid INTEGER PRIMARY KEY AUTOINCREMENT, geom BLOB, ${definicion});`
  );

  db.exec(
    `INSERT INTO gpkg_contents (table_name, data_type, identifier, description, srs_id) VALUES ('${capa}', 'features', '${capa}', '${(opciones.descripcion ?? "Inventario municipal de emergencias").replace(/'/g, "''")}', 4326);`
  );

  // El tipo declarado tiene que ser el de la geometría que hay dentro, no una
  // cadena genérica: es lo que un SIG lee para decidir cómo dibujar la capa. Con
  // varias geometrías distintas se declara GEOMETRY, que es lo que admite el
  // estándar.
  const tiposDistintos = new Set(features.map((f) => singular(f.geom.type)));
  const tipoDeclarado =
    tiposDistintos.size === 1 ? [...tiposDistintos][0] : "GEOMETRY";

  db.exec(
    `INSERT INTO gpkg_geometry_columns (table_name, column_name, geometry_type_name, srs_id, z, m) VALUES ('${capa}', 'geom', '${tipoDeclarado.replace(/'/g, "''")}', 4326, 0, 0);`
  );
  db.exec(
    `INSERT INTO gpkg_geometry_columns_fk VALUES ('${capa}', 'geom', '${capa}');`
  );

  const cols = cabeceras.map((h) => `"${h.replace(/"/g, '""')}"`).join(", ");
  const marcadores = cabeceras.map(() => "?").join(", ");
  const ins = db.prepare(
    `INSERT INTO "${capa}" (geom, ${cols}) VALUES (?, ${marcadores})`
  );

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of features) {
    const bbox = boundingBox(f.geom);
    // La envolvente viaja en la cabecera de cada BLOB, en el orden que fija el
    // estándar: minx, maxx, miny, maxy. Sin ella, el estándar la declara de
    // indicador 0 y el lector tiene que recorrer la geometría entera.
    const sobre = Buffer.alloc(32);
    if (bbox) {
      sobre.writeDoubleLE(bbox.minX, 0);
      sobre.writeDoubleLE(bbox.maxX, 8);
      sobre.writeDoubleLE(bbox.minY, 16);
      sobre.writeDoubleLE(bbox.maxY, 24);
    }
    const blob = Buffer.concat([gpkgCabecera(4326, sobre), blobWKB(f.geom)]);
    const valores = cabeceras.map((h) => {
      const v = f.propiedades[h];
      return v === null || v === undefined ? null : v;
    });
    ins.run(blob, ...valores);
    if (bbox) {
      minX = Math.min(minX, bbox.minX);
      minY = Math.min(minY, bbox.minY);
      maxX = Math.max(maxX, bbox.maxX);
      maxY = Math.max(maxY, bbox.maxY);
    }
  }

  if (Number.isFinite(minX)) {
    db.exec(
      `UPDATE gpkg_contents SET min_x=${minX}, min_y=${minY}, max_x=${maxX}, max_y=${maxY} WHERE table_name='${capa}';`
    );
  }

  // El estándar GeoPackage admite que la cabecera del fichero sea la de SQLite, y
  // en ese caso el identificador de aplicación es lo que permite reconocerlo. Se
  // escribe el mismo valor que usa GDAL, que es lo que leen QGIS y ArcGIS.
  db.exec("PRAGMA application_id = 1196444487;");
  db.exec("PRAGMA user_version = 10200;");

  // Exporta la base a un búfer temporal y lo lee.
  const tmp = tmpdir();
  const ruta = `${tmp}/incideas-${process.pid}-${Date.now()}.gpkg`;
  db.exec(`VACUUM INTO '${ruta.replace(/'/g, "''")}';`);
  db.close();
  const salida = readFileSync(ruta);
  unlinkSync(ruta);
  return salida;
}

// ---------------------------------------------------------------------------
// Envolvura de la capa
// ---------------------------------------------------------------------------

function boundingBox(g: GeoJSON.Geometry): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visitar = (c: unknown): void => {
    if (typeof c === "number") return;
    if (Array.isArray(c)) {
      if (typeof c[0] === "number" && typeof c[1] === "number") {
        minX = Math.min(minX, c[0] as number);
        maxX = Math.max(maxX, c[0] as number);
        minY = Math.min(minY, c[1] as number);
        maxY = Math.max(maxY, c[1] as number);
        return;
      }
      for (const x of c) visitar(x);
    }
  };
  visitar((g as { coordinates: unknown }).coordinates);
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/** Punto representativo de una fila, o null si la fila no tiene coordenadas. */
function punto(f: FilaLibro): GeoJSON.Point | null {
  if (f.lat === null || f.lng === null) return null;
  return { type: "Point", coordinates: [f.lng, f.lat] };
}

export function construirGeoPackageInventario(
  filas: FilaLibro[],
  nombre: string
): Buffer {
  const cabeceras = [
    "id_tecnico",
    "categoria",
    "tipo",
    "nombre",
    "estado_nombre",
    "direccion",
    "utm_x",
    "utm_y",
    "utm_huso",
    "fuente",
    "licencia",
    "confianza",
    "estado_espacial",
  ];
  const features = [];
  for (const f of filas) {
    // Igual que en el GeoJSON: geometría de la fuente si la hay, punto
    // representativo si no, y el origen declarado en la propia fila para que un
    // SIG no confunda un punto con el término municipal o con el edificio entero.
    const propia = wktAGeoJSON(f.geometria_wkt);
    const g = propia ?? punto(f);
    if (!g) continue;
    features.push({
      geom: g,
      propiedades: {
        id_tecnico: f.id_tecnico,
        categoria: f.categoria,
        tipo: f.tipo,
        nombre: f.nombre,
        estado_nombre: f.estado_nombre,
        direccion: f.direccion ?? null,
        utm_x: f.utm_x,
        utm_y: f.utm_y,
        utm_huso: f.utm_huso,
        fuente: f.fuente,
        licencia: f.licencia,
        confianza: f.confianza,
        estado_espacial: f.estado_espacial,
      },
    });
  }
  return construirGeoPackage(features, cabeceras, {
    capa: "inventario",
    descripcion: `INCideas — ${nombre}`,
  });
}
