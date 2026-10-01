import ExcelJS from "exceljs";

/** Registro tal como se lee de incideas_registros para exportar. */
export interface RegistroExport {
  id: string;
  codigo_ine: string;
  categoria: string;
  subcategoria: string | null;
  nombre_oficial: string;
  direccion: string | null;
  coordenadas: { lat: number; lng: number } | null;
  geometria: GeoJSON.Geometry | string | null;
  fuente_principal: string;
  id_origen: string | null;
  huella: string | null;
  fecha_dato: string | null;
  fecha_consulta: string | null;
  estado_validacion: string;
  estado_espacial: string | null;
  licencia: string | null;
  observaciones: string | null;
  crs_original: string | null;
  desactualizado_desde: string | null;
}

export const COLUMNAS_SELECT =
  "id,codigo_ine,categoria,subcategoria,nombre_oficial,direccion,coordenadas,geometria,fuente_principal,id_origen,huella,fecha_dato,fecha_consulta,estado_validacion,estado_espacial,licencia,observaciones,crs_original,desactualizado_desde";

/** PostgREST puede devolver la geometría como objeto GeoJSON o como cadena JSON. */
export function geometriaComoObjeto(
  g: RegistroExport["geometria"]
): GeoJSON.Geometry | null {
  if (!g) return null;
  if (typeof g !== "string") return g;
  try {
    return JSON.parse(g) as GeoJSON.Geometry;
  } catch {
    return null;
  }
}

/** Geometría del registro; si no la tiene, un punto a partir de `coordenadas`. */
export function geometriaEfectiva(r: RegistroExport): GeoJSON.Geometry | null {
  const g = geometriaComoObjeto(r.geometria);
  if (g) return g;
  if (r.coordenadas) {
    return { type: "Point", coordinates: [r.coordenadas.lng, r.coordenadas.lat] };
  }
  return null;
}

export function propiedades(r: RegistroExport): Record<string, unknown> {
  return {
    id: r.id,
    codigo_ine: r.codigo_ine,
    categoria: r.categoria,
    subcategoria: r.subcategoria,
    nombre: r.nombre_oficial,
    direccion: r.direccion,
    lat: r.coordenadas?.lat ?? null,
    lng: r.coordenadas?.lng ?? null,
    fuente: r.fuente_principal,
    id_origen: r.id_origen,
    huella: r.huella,
    fecha_dato: r.fecha_dato,
    fecha_consulta: r.fecha_consulta,
    estado_validacion: r.estado_validacion,
    estado_espacial: r.estado_espacial,
    licencia: r.licencia,
    advertencias: r.observaciones,
    posible_baja_desde: r.desactualizado_desde ?? null,
    crs: r.crs_original ?? "EPSG:4326",
  };
}

/** CSV con las mismas claves que GeoJSON y XLSX (`propiedades`); la ruta añade el BOM. */
export function construirCsv(registros: RegistroExport[]): string {
  if (registros.length === 0) return "";
  const cols = Object.keys(propiedades(registros[0]));
  const escapar = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const filas = registros.map((r) => {
    const p = propiedades(r);
    return cols.map((c) => escapar(p[c])).join(",");
  });
  return [cols.join(","), ...filas].join("\n");
}

// ---------------------------------------------------------------------------
// WKT
// ---------------------------------------------------------------------------

type Pos = number[];

const par = (p: Pos) => `${p[0]} ${p[1]}`;
const anillo = (ring: Pos[]) => `(${ring.map(par).join(", ")})`;
const poligono = (rings: Pos[][]) => `(${rings.map(anillo).join(", ")})`;

/** Convierte una geometría GeoJSON a WKT (2D). Devuelve "" si no hay geometría soportada. */
export function geometriaAWKT(geometry: GeoJSON.Geometry | null | undefined): string {
  if (!geometry) return "";
  switch (geometry.type) {
    case "Point":
      return `POINT (${par(geometry.coordinates)})`;
    case "MultiPoint":
      return `MULTIPOINT (${geometry.coordinates.map((p) => `(${par(p)})`).join(", ")})`;
    case "LineString":
      return `LINESTRING ${anillo(geometry.coordinates)}`;
    case "MultiLineString":
      return `MULTILINESTRING (${geometry.coordinates.map(anillo).join(", ")})`;
    case "Polygon":
      return `POLYGON ${poligono(geometry.coordinates)}`;
    case "MultiPolygon":
      return `MULTIPOLYGON (${geometry.coordinates.map(poligono).join(", ")})`;
    case "GeometryCollection":
      return `GEOMETRYCOLLECTION (${geometry.geometries.map(geometriaAWKT).filter(Boolean).join(", ")})`;
    default:
      return "";
  }
}

/** Excel admite 32 767 caracteres por celda. */
const MAX_CELDA = 32000;
const AVISO_WKT_LARGO = "[geometría demasiado extensa para una celda; usar GeoJSON]";

export function wktParaCelda(geometry: GeoJSON.Geometry | null | undefined): string {
  const wkt = geometriaAWKT(geometry);
  return wkt.length > MAX_CELDA ? AVISO_WKT_LARGO : wkt;
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

const MUSGO = "FF3E665C";
const CARBON = "FF3C403E";
const HUESO = "FFF1F1F1";
const LIMO = "FFB0BDB0";
const CRISOPA = "FFC2E189";
const FUENTE = "Poppins";

const COLUMNAS: { clave: string; cabecera: string; ancho: number }[] = [
  { clave: "id", cabecera: "id", ancho: 38 },
  { clave: "codigo_ine", cabecera: "codigo_ine", ancho: 12 },
  { clave: "categoria", cabecera: "categoria", ancho: 20 },
  { clave: "subcategoria", cabecera: "subcategoria", ancho: 22 },
  { clave: "nombre", cabecera: "nombre", ancho: 42 },
  { clave: "direccion", cabecera: "direccion", ancho: 36 },
  { clave: "lat", cabecera: "lat", ancho: 12 },
  { clave: "lng", cabecera: "lng", ancho: 12 },
  { clave: "wkt", cabecera: "geometria_wkt", ancho: 40 },
  { clave: "crs", cabecera: "crs", ancho: 12 },
  { clave: "fuente", cabecera: "fuente", ancho: 34 },
  { clave: "id_origen", cabecera: "id_origen", ancho: 20 },
  { clave: "huella", cabecera: "huella", ancho: 26 },
  { clave: "fecha_dato", cabecera: "fecha_dato", ancho: 14 },
  { clave: "fecha_consulta", cabecera: "fecha_consulta", ancho: 22 },
  { clave: "estado_validacion", cabecera: "estado_validacion", ancho: 26 },
  { clave: "estado_espacial", cabecera: "estado_espacial", ancho: 22 },
  { clave: "licencia", cabecera: "licencia", ancho: 14 },
  { clave: "advertencias", cabecera: "advertencias", ancho: 44 },
  { clave: "posible_baja_desde", cabecera: "posible_baja_desde", ancho: 22 },
];

export interface OpcionesXlsx {
  codigoINE: string;
  categoria: string | null;
  /** Fecha de generación (ISO); inyectable para pruebas. */
  generadoEn?: string;
}

/** Libro XLSX nativo: hoja «Registros» con trazabilidad completa y hoja «Léame». */
export async function construirXlsx(
  registros: RegistroExport[],
  opciones: OpcionesXlsx
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Ideas Medioambientales - INCideas";
  wb.created = new Date(opciones.generadoEn ?? Date.now());

  const hoja = wb.addWorksheet("Registros", {
    views: [{ state: "frozen", ySplit: 1, xSplit: 5 }],
  });
  hoja.columns = COLUMNAS.map((c) => ({ header: c.cabecera, key: c.clave, width: c.ancho }));

  const cab = hoja.getRow(1);
  cab.height = 22;
  cab.eachCell((cell) => {
    cell.font = { name: FUENTE, size: 10, bold: true, color: { argb: HUESO } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MUSGO } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });

  for (const r of registros) {
    const p = propiedades(r);
    const fila = hoja.addRow({
      ...p,
      lat: r.coordenadas?.lat ?? null,
      lng: r.coordenadas?.lng ?? null,
      wkt: wktParaCelda(geometriaEfectiva(r)),
    });
    fila.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: FUENTE, size: 10, color: { argb: CARBON } };
      cell.alignment = { vertical: "top" };
      cell.border = { bottom: { style: "thin", color: { argb: LIMO } } };
    });
  }
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNAS.length } };

  const generado = opciones.generadoEn ?? new Date().toISOString();
  const usaOSM = registros.some((r) => /openstreetmap/i.test(r.fuente_principal));
  const fuentes = Array.from(new Set(registros.map((r) => r.fuente_principal))).sort();
  const licencias = Array.from(
    new Set(registros.map((r) => r.licencia).filter((l): l is string => !!l))
  ).sort();

  const leame = wb.addWorksheet("Léame");
  leame.getColumn(1).width = 28;
  leame.getColumn(2).width = 100;
  const filas: [string, string][] = [
    ["Producto", "INCideas — Ideas Sostenibilidad"],
    ["Municipio (INE)", opciones.codigoINE],
    ["Categoría", opciones.categoria ?? "todas"],
    ["Registros exportados", String(registros.length)],
    ["Generado", generado],
    ["Fuentes presentes", fuentes.join("; ") || "—"],
    ["Licencias presentes", licencias.join("; ") || "—"],
    [
      "Atribución",
      usaOSM
        ? "Contiene datos de © OpenStreetMap contributors, bajo licencia ODbL 1.0 (https://www.openstreetmap.org/copyright). Las bases derivadas deben conservar esta atribución y licencia."
        : "—",
    ],
    [
      "Estado de los datos",
      "Los registros con estado_validacion «automatico_sin_revisar» proceden de carga automática y no han sido contrastados. OpenStreetMap es colaborativo y no constituye fuente oficial.",
    ],
    [
      "Geometría",
      "CRS EPSG:4326 (lon/lat). geometria_wkt contiene la geometría en WKT; si excede el límite de celda de Excel se indica y debe usarse la exportación GeoJSON.",
    ],
    [
      "Exclusiones",
      "No se incluyen registros de visibilidad restringida o con datos personales protegidos, ni registros dados de baja.",
    ],
  ];
  filas.forEach(([k, v], i) => {
    const row = leame.getRow(i + 1);
    row.getCell(1).value = k;
    row.getCell(2).value = v;
    row.getCell(1).font = { name: FUENTE, size: 10, bold: true, color: { argb: CARBON } };
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: CRISOPA } };
    row.getCell(2).font = { name: FUENTE, size: 10, color: { argb: CARBON } };
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    row.getCell(1).alignment = { vertical: "top" };
  });

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
