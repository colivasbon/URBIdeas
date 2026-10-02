// INCideas — Formatos abiertos y lista blanca de enlaces.
//
// GeoJSON y CSV para intercambio inmediato; GeoPackage para abrir directamente en
// QGIS. El GeoPackage se escribe con el módulo SQLite incorporado en Node, sin
// añadir dependencias.
//
// La lista blanca de dominios es la misma que emplean los libros de SOCideas: solo
// se publica un hipervínculo si el protocolo es seguro y el dominio está autorizado.
// Así el libro no expone direcciones internas, de almacenamiento ni de despliegue.

import { DatabaseSync } from "node:sqlite";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------------------
// Lista blanca de enlaces
// ---------------------------------------------------------------------------

export const DOMINIOS_AUTORIZADOS: readonly string[] = [
  "www.openstreetmap.org",
  "openstreetmap.org",
  "www.ine.es",
  "ine.es",
  "www.ign.es",
  "ign.es",
  "www.cnig.es",
  "cnig.es",
  "sedeaplicaciones.minetur.gob.es",
  "terramapis.icv.gva.es",
  "dadesobertes.gva.es",
  "www.miteco.gob.es",
  "miteco.gob.es",
  "www.aemet.es",
  "aemet.es",
  "sede.agenciatributaria.gob.es",
  "infoelectoral.interior.gob.es",
  "www.agenciatributaria.es",
];

export const DOMINIOS_BLOQUEADOS: readonly string[] = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "r2.cloudflarestorage.com",
  "cloudflare.com",
  "supabase.co",
  "vercel.app",
  "github.com",
  "githubusercontent.com",
];

/** Un enlace se publica solo si es https y su dominio está autorizado. */
export function esAllowedSourceUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (DOMINIOS_BLOQUEADOS.some((b) => host === b || host.endsWith(`.${b}`))) return false;
  return DOMINIOS_AUTORIZADOS.some((a) => host === a || host.endsWith(`.${a}`));
}

// ---------------------------------------------------------------------------
// Conversión de coordenadas
// ---------------------------------------------------------------------------

type Pos = number[];

const par = (p: Pos) => `${p[0]} ${p[1]}`;
const anillo = (r: Pos[]) => `(${r.map(par).join(", ")})`;
const poligono = (r: Pos[][]) => `(${r.map(anillo).join(", ")})`;

/** Geometría GeoJSON a WKT. Cadena vacía si el tipo no está contemplado. */
export function geometriaAWKT(g: GeoJSON.Geometry | null | undefined): string {
  if (!g) return "";
  switch (g.type) {
    case "Point":
      return `POINT (${par(g.coordinates as Pos)})`;
    case "MultiPoint":
      return `MULTIPOINT (${(g.coordinates as Pos[]).map((p) => `(${par(p)})`).join(", ")})`;
    case "LineString":
      return `LINESTRING ${anillo(g.coordinates as Pos[])}`;
    case "MultiLineString":
      return `MULTILINESTRING ${(g.coordinates as Pos[][]).map(anillo).join(", ")})`;
    case "Polygon":
      return `POLYGON ${poligono(g.coordinates as Pos[][])}`;
    case "MultiPolygon":
      return `MULTIPOLYGON (${(g.coordinates as Pos[][][]).map(poligono).join(", ")})`;
    default:
      return "";
  }
}

/** Enlace al objeto en su portal de origen, o null si el identificador no lo permite. */
export function enlaceAlObjeto(
  tipo: string | null | undefined,
  idOrigen: string | null | undefined
): string | null {
  if (!tipo || !idOrigen) return null;
  const [tipoObj, id] = idOrigen.split("/");
  if (!id) return null;
  const prefijos: Record<string, string> = {
    node: "node",
    way: "way",
    relation: "relation",
  };
  const prefijo = prefijos[tipoObj];
  if (!prefijo) return null;
  if (tipo !== "OpenStreetMap (Overpass)" && tipo !== "OpenStreetMap (Nominatim)") return null;
  return `https://www.openstreetmap.org/${prefijo}/${id}`;
}

// ---------------------------------------------------------------------------
// GeoJSON
// ---------------------------------------------------------------------------

export interface PropiedadGeoJSON {
  [clave: string]: string | number | null;
}

export interface FeatureGeoJSON {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: PropiedadGeoJSON;
}

export function construirGeoJSON(
  features: FeatureGeoJSON[],
  nombre: string
): string {
  const fc = {
    type: "FeatureCollection",
    name: nombre,
    crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } },
    features,
  };
  return JSON.stringify(fc, null, 1);
}

// ---------------------------------------------------------------------------
// CSV con punto y coma, para uso administrativo en Excel en español
// ---------------------------------------------------------------------------

function escaparCsv(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV UTF-8 con marca de orden de bytes y punto y coma como separador, que es lo
 * que espera Excel en configuración española.
 */
export function construirCsvCabeceras(
  cabeceras: string[],
  filas: (string | number | null)[][]
): string {
  const out: string[] = [];
  out.push(cabeceras.map(escaparCsv).join(";"));
  for (const f of filas) {
    out.push(cabeceras.map((_, i) => escaparCsv(f[i] ?? null)).join(";"));
  }
  return "\uFEFF" + out.join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// GeoPackage (SQLite con la estructura que exige el estándar OGC)
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
function gpkgCabecera(tipo: string, srs: number, envoltura: Buffer): Buffer {
  const flags = 0x01; // orden de bytes: little endian
  // El tipo se almacena como cuatro caracteres en hexadecimal, con ceros a la различия de bits.
  const tipoBuf = Buffer.from(
    tipo.slice(0, 8).padEnd(8, "0").split("").map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join(""),
    "hex"
  );
  const cab = Buffer.alloc(8);
  cab.write("GP", 0, "ascii");
  cab.writeUInt8(0, 2);
  cab.writeUInt8(flags, 3);
  const srsBuf = Buffer.alloc(4);
  srsBuf.writeInt32LE(srs, 0);
  const flagsBuf = Buffer.alloc(4);
  flagsBuf.writeUInt32LE(0, 0); // sin encabezado extendido ni curva
  return Buffer.concat([cab, tipoBuf, srsBuf, flagsBuf, envoltura]);
}

function blobWKB(g: GeoJSON.Geometry): Buffer {
  const partes: Buffer[] = [];
  const cabecera = Buffer.alloc(5);
  cabecera.writeUInt8(1, 0); // little endian
  cabecera.writeUInt32LE(tipoWKB(g.type), 1);
  partes.push(cabecera);

  if (g.type === "MultiPolygon" || g.type === "MultiLineString" || g.type === "MultiPoint") {
    const coords = (g as { coordinates: unknown }).coordinates as unknown[];
    partes.push(Buffer.from(new Uint32Array([coords.length]).buffer));
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
    partes.push(Buffer.from(new Uint32Array([anillos.length]).buffer));
    for (const r of anillos) {
      partes.push(Buffer.from(new Uint32Array([r.length]).buffer));
      for (const pos of r) {
        const p = Buffer.alloc(16);
        p.writeDoubleLE(pos[0], 0);
        p.writeDoubleLE(pos[1], 8);
        partes.push(p);
      }
    }
  } else {
    const puntos = cont as Pos[];
    partes.push(Buffer.from(new Uint32Array([puntos.length]).buffer));
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
      return 1;
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

interface FeatureGPKG {
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

  // Extensión de geometría y sistema de referencia, con cabecera y sobre WKB.
  const cabeceraB = gpkgCabecera("GEOMETRY", 4326, Buffer.alloc(4));

  db.exec(
    `INSERT INTO gpkg_contents (table_name, data_type, identifier, description, srs_id) VALUES ('${capa}', 'features', '${capa}', '${(opciones.descripcion ?? "Inventario municipal de emergencias").replace(/'/g, "''")}', 4326);`
  );
  db.exec(
    `INSERT INTO gpkg_geometry_columns (table_name, column_name, geometry_type_name, srs_id, z, m) VALUES ('${capa}', 'geom', 'GEOMETRY', 4326, 0, 0);`
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
    const blob = Buffer.concat([cabeceraB, blobWKB(f.geom)]);
    const valores = cabeceras.map((h) => {
      const v = f.propiedades[h];
      return v === null || v === undefined ? null : v;
    });
    ins.run(blob, ...valores);
    const bbox = boundingBox(f.geom);
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
