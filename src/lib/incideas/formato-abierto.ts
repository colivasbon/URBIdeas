// INCideas — Formatos abiertos y lista blanca de enlaces.
//
// GeoJSON y CSV para intercambio inmediato; GeoPackage para abrir directamente en
// QGIS. El GeoPackage se escribe con el módulo SQLite incorporado en Node, sin
// añadir dependencias.
//
// La lista blanca de dominios es la misma que emplean los libros de SOCideas: solo
// se publica un hipervínculo si el protocolo es seguro y el dominio está autorizado.
// Así el libro no expone direcciones internas, de almacenamiento ni de despliegue.

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
      // Paréntesis exterior que agrupa las líneas, y paréntesis de cada línea, que
      // aporta `anillo`. Sin el exterior, el WKT no lo entiende ningún lector.
      return `MULTILINESTRING (${(g.coordinates as Pos[][]).map(anillo).join(", ")})`;
    case "Polygon":
      return `POLYGON ${poligono(g.coordinates as Pos[][])}`;
    case "MultiPolygon":
      return `MULTIPOLYGON (${(g.coordinates as Pos[][][]).map(poligono).join(", ")})`;
    default:
      return "";
  }
}

/**
 * WKT a geometría GeoJSON.
 *
 * Existe para el camino inverso: el libro guarda la geometría como WKT porque es
 * lo que se ve en una celda de texto y lo que accepts un SIG de escritorio, pero
 * los formatos abiertos (GeoJSON y GeoPackage) necesitan geometría de verdad. Sin
 * esta función, todo se reduciría a un punto y se perderían los términos
 * municipales, los cauces y las líneas de calleo, que es justo lo que un técnico
 * necesita abrir en un SIG.
 *
 * Acepta los seis tipos de la especificación OGC Simple Features más
 * GEOMETRYCOLLECTION, con o sin la_dimension extra. Devuelve null si la cadena no
 * se entiende, en lugar de adivinar: un límite mal leído es peor que un límite
 * ausente.
 */
export function wktAGeoJSON(wkt: string | null | undefined): GeoJSON.Geometry | null {
  const s = (wkt ?? "").trim();
  if (!s) return null;

  // Se separa el nombre del tipo de su cuerpo.
  const corte = s.search(/\s/);
  const tipo = (corte === -1 ? s : s.slice(0, corte)).toUpperCase();
  const cuerpo = corte === -1 ? "" : s.slice(corte).trim();

  if (tipo === "GEOMETRYCOLLECTION" || tipo === "GEOMCOLLECTION") {
    const dentro = parAngular(cuerpo);
    if (!dentro) return null;
    const subs = separarNivelSuperior(dentro).map(wktAGeoJSON);
    if (subs.some((g) => g === null)) return null;
    return { type: "GeometryCollection", geometries: subs as GeoJSON.Geometry[] };
  }

  // Los puntos y multipuntos admiten dos sintaxis: con y sin paréntesis internos.
  const cuerpoNormalizado = cuerpo.replace(/^Z\s*/i, "").replace(/^M\s*/i, "").replace(/^ZM\s*/i, "").trim();

  if (tipo === "POINT") {
    // `POINT (x y)` y `POINT x y` son válidos; hay que quitar el paréntesis antes de
    // leer la posición o los paréntesis se cuelan en el número.
    const dentro = parAngular(cuerpoNormalizado);
    const p = leerPosicion(dentro ?? cuerpoNormalizado);
    return p ? { type: "Point", coordinates: p } : null;
  }
  if (tipo === "MULTIPOINT") {
    const dentro = parAngular(cuerpoNormalizado);
    if (!dentro) return null;
    const ps = separarNivelSuperior(dentro)
      .map((t) => leerPosicion(t.trim().replace(/^\(|\)$/g, "")))
      .filter((p): p is Pos => p !== null);
    return ps.length ? { type: "MultiPoint", coordinates: ps } : null;
  }
  if (tipo === "LINESTRING") {
    const dentro = parAngular(cuerpoNormalizado);
    if (!dentro) return null;
    const ps = leerAnillo(dentro);
    return ps && ps.length >= 2 ? { type: "LineString", coordinates: ps } : null;
  }
  if (tipo === "MULTILINESTRING") {
    const dentro = parAngular(cuerpoNormalizado);
    if (!dentro) return null;
    const lineas = separarNivelSuperior(dentro)
      .map((t) => {
        const d = parAngular(t.trim());
        return d ? leerAnillo(d) : null;
      })
      .filter((l): l is Pos[] => l !== null && l.length >= 2);
    return lineas.length ? { type: "MultiLineString", coordinates: lineas } : null;
  }
  if (tipo === "POLYGON") {
    const dentro = parAngular(cuerpoNormalizado);
    if (!dentro) return null;
    const anillos = separarNivelSuperior(dentro)
      .map((t) => {
        const d = parAngular(t.trim());
        return d ? leerAnillo(d) : null;
      })
      .filter((a): a is Pos[] => a !== null && a.length >= 4);
    return anillos.length ? { type: "Polygon", coordinates: anillos } : null;
  }
  if (tipo === "MULTIPOLYGON") {
    const dentro = parAngular(cuerpoNormalizado);
    if (!dentro) return null;
    const polys = separarNivelSuperior(dentro)
      .map((t) => {
        const d = parAngular(t.trim());
        if (!d) return null;
        const anillos = separarNivelSuperior(d)
          .map((u) => {
            const dd = parAngular(u.trim());
            return dd ? leerAnillo(dd) : null;
          })
          .filter((a): a is Pos[] => a !== null && a.length >= 4);
        return anillos.length ? anillos : null;
      })
      .filter((a): a is Pos[][] => a !== null);
    return polys.length ? { type: "MultiPolygon", coordinates: polys } : null;
  }

  return null;
}

/** Contenido del primer paréntesis que abre y cierra, o null si no está balanceado. */
function parAngular(s: string): string | null {
  const abre = s.indexOf("(");
  const cierra = s.lastIndexOf(")");
  if (abre === -1 || cierra <= abre) return null;
  return s.slice(abre + 1, cierra);
}

/**
 * Separa por comas que no estén dentro de paréntesis. Es lo que distingue los
 * anillos de un polígono de las coordenadas de un anillo.
 */
function separarNivelSuperior(s: string): string[] {
  const partes: string[] = [];
  let nivel = 0;
  let actual = "";
  for (const c of s) {
    if (c === "(") nivel++;
    if (c === ")") nivel--;
    if (c === "," && nivel === 0) {
      partes.push(actual);
      actual = "";
      continue;
    }
    actual += c;
  }
  if (actual.trim()) partes.push(actual);
  return partes;
}

/** Lee «x y» o «x y z», y se queda con los dos primeros componentes. */
function leerPosicion(s: string): Pos | null {
  const n = s
    .trim()
    .split(/\s+/)
    .map(Number);
  if (n.length < 2 || !Number.isFinite(n[0]) || !Number.isFinite(n[1])) return null;
  return [n[0], n[1]];
}

function leerAnillo(s: string): Pos[] | null {
  const ps = separarNivelSuperior(s).map(leerPosicion);
  if (ps.some((p) => p === null)) return null;
  return ps as Pos[];
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
