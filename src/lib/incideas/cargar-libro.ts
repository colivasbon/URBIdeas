// INCideas — Cargador del libro municipal.
//
// Lee los registros de un municipio desde Supabase y los convierte en la
// `EntradaLibro` que consume el generador. Todas las correcciones se aplican en
// lectura: la base de datos no se modifica.
//
// Dos correcciones de lectura:
//
// 1. `crs_original` de la plantilla municipal venía etiquetado como EPSG:4326
//    cuando el Catastro INSPIRE entrega ETRS89 UTM 30 (EPSG:25830). Solo se
//    corrige la etiqueta; las coordenadas ya están en WGS84 porque se
//    reproyectaron al importar.
//
// 2. Los nombres numéricos de la plantilla municipal (partidas de limpieza y
//    paradas de autobús) se marcan como «por revisar» cuando no hay forma
//    segura de saber a qué elemento corresponden, para no publicar un nombre
//    inventado.

import { latLngToUtm, husoDesdeLongitud } from "./pipeline/utm";
import { leerTodas, TAM_PAGINA } from "./paginar";
import {
  CATEGORIAS_INVENTARIO,
  tipoLegible,
  titularidadLegible,
} from "./catalogo";
import { corregirCRS, esSoloUnaCifra } from "./correcciones";
import {
  construirCsvCabeceras,
  construirGeoJSON,
  construirGeoPackage,
  esAllowedSourceUrl,
  type FeatureGeoJSON,
} from "./formato-abierto";
import { enriquecerFila, type EntradaLibro, type FilaLibro, type FuenteLibro } from "./libro-municipal";

// ---------------------------------------------------------------------------
// Tipo de la respuesta de Supabase
// ---------------------------------------------------------------------------

export interface RegistroCrudo {
  id: string;
  codigo_ine: string;
  categoria: string;
  subcategoria: string | null;
  nombre_oficial: string | null;
  nombre_normalizado: string | null;
  nombres_alternativos: string[] | null;
  direccion: string | null;
  direccion_normalizada: string | null;
  nucleo: string | null;
  barrio: string | null;
  distrito: string | null;
  codigo_postal: string | null;
  coordenadas: { lat: number; lon: number } | { lat: number; lng: number } | null;
  geometria: GeoJSON.Geometry | null;
  crs_original: string | null;
  tipo_geometria: string | null;
  estado_espacial: string | null;
  precision_geolocalizacion: string | null;
  utm_x: number | null;
  utm_y: number | null;
  utm_huso: number | null;
  titularidad: string | null;
  gestor: string | null;
  telefono_publico: string | null;
  correo_publico: string | null;
  web: string | null;
  horario: string | null;
  capacidad: number | null;
  unidad_capacidad: string | null;
  aforo: number | null;
  accesibilidad: boolean | null;
  estado_operativo: string | null;
  funcion_emergencia: string | null;
  fuente_principal: string | null;
  fuentes_secundarias: string[] | null;
  url_fuente: string | null;
  licencia: string | null;
  fecha_dato: string | null;
  fecha_consulta: string | null;
  fecha_edicion_origen: string | null;
  version_origen: number | null;
  metodo_obtencion: string | null;
  calidad: string | null;
  confianza: number | null;
  estado_validacion: string | null;
  unidad_validadora: string | null;
  observaciones: string | null;
  id_origen: string | null;
  tipo_origen: string | null;
  id_origen_tipo: string | null;
  refcat: string | null;
  enlace_origen: string | null;
  etiquetas_origen: Record<string, string> | null;
  atributos: Record<string, unknown> | null;
  nombre_origen: string | null;
  eliminado_en: string | null;
  posible_duplicado: boolean | null;
}

/** Rótulo que se usa cuando la base no aporta la comarca. */
export const SIN_COMARCA = "No consta en la base";

/** Rótulo que se usa cuando falta el nombre de un nivel territorial. */
export const SIN_DATO_TERRITORIO = "Sin dato";

export interface MunicipioCrudo {
  id: string;
  provincia_id: string | null;
  nombre: string;
  codigo_ine: string;
  poblacion: number | null;
  geom: GeoJSON.Geometry | GeoJSON.Feature | null;
}

export interface ProvinciaCruda {
  id: string;
  comunidad_autonoma_id: string | null;
  nombre: string;
}

export interface ComunidadCruda {
  id: string;
  nombre: string;
}

/**
 * Superficie del municipio en km2, calculada sobre la geometría almacenada.
 * Se usa la fórmula del exceso esférico, que a escala municipal es más exacta que
 * un área planar. Devuelve null si la geometría no es un polígono utilizable.
 */
export function superficieDesdeGeoJson(geom: MunicipioCrudo["geom"]): number | null {
  const g = geom && "type" in geom && geom.type === "Feature" ? geom.geometry : geom;
  if (!g || g.type !== "Polygon" && g.type !== "MultiPolygon") return null;
  // Se toma el primer polígono si la geometría es multi: para superficie
  // municipal, la parte principal es la que delimita el término.
  const anillos: number[][][] =
    g.type === "Polygon"
      ? (g.coordinates as number[][][])
      : (g.coordinates as number[][][][])[0];
  const exterior = anillos[0];
  if (!exterior || exterior.length < 4) return null;

  const R = 6378137;
  let area = 0;
  for (let i = 0; i < exterior.length - 1; i++) {
    const [lon1, lat1] = exterior[i];
    const [lon2, lat2] = exterior[i + 1];
    area +=
      toRad(lon2 - lon1) *
      (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  area = Math.abs((area * R * R) / 2);
  return Math.round(area / 1_000_000 * 100) / 100;
}

function toRad(g: number): number {
  return (g * Math.PI) / 180;
}

export interface TerritorioCrudo {
  codigo_ine: string;
  municipio: string;
  provincia: string;
  comunidad_autonoma: string;
  comarca: string | null;
  poblacion: number | null;
  superficie_km2: number | null;
  anio_poblacion: number | null;
}

/** Respuesta de una página de consulta. */
type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Subconjunto de la API de PostgREST que usa el cargador. */
type Consulta<T> = {
  eq(columna: string, valor: unknown): Consulta<T>;
  order(orden: string, ascendente?: boolean): Consulta<T>;
  range(desde: number, hasta: number): Pagina<T>;
  limit(n: number): Pagina<T>;
};

export type ClienteSupabase = {
  from(tabla: string): {
    select<T>(columnas: string): Consulta<T>;
  };
};

// ---------------------------------------------------------------------------
// Utilidades de conversión
// ---------------------------------------------------------------------------

/**
 * Lee latitud y longitud. La mayoría de registros las traen en el campo
 * `coordenadas`; unos pocos, solo en la geometría PostGIS, de la que se toma el
 * centroide. Una fila sin punto se queda sin coordenadas, sin inventar ninguna.
 */
export function leerCoordenadas(r: {
  coordenadas: RegistroCrudo["coordenadas"];
  geometria: GeoJSON.Geometry | null;
}): { lat: number; lng: number } | null {
  const c = r.coordenadas;
  if (c && typeof c === "object") {
    const lat = (c as { lat?: unknown }).lat;
    const lng = (c as { lng?: unknown }).lng ?? (c as { lon?: unknown }).lon;
    if (typeof lat === "number" && typeof lng === "number") {
      return validar(lat, lng);
    }
  }
  return centroide(r.geometria);
}

/** Descarta coordenadas imposibles en el ámbito terrestre. */
function validar(lat: number, lng: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/** Centroide de un punto, línea o polígono; null si no es una geometría simple. */
function centroide(g: GeoJSON.Geometry | null): { lat: number; lng: number } | null {
  if (!g) return null;
  if (g.type === "Point") {
    const c = g.coordinates as number[];
    return validar(c[1], c[0]);
  }
  if (g.type === "GeometryCollection") {
    for (const sub of g.geometries) {
      const c = centroide(sub);
      if (c) return c;
    }
    return null;
  }
  const puntos = aplanar(g.coordinates as unknown);
  if (puntos.length === 0) return null;
  const suma = puntos.reduce(
    (a, p) => [a[0] + p[1], a[1] + p[0]] as [number, number],
    [0, 0] as [number, number]
  );
  return validar(suma[0] / puntos.length, suma[1] / puntos.length);
}

/** Aplana una estructura de coordenadas GeoJSON a una lista de [lon, lat]. */
function aplanar(c: unknown): number[][] {
  if (!Array.isArray(c)) return [];
  if (typeof c[0] === "number") return [c as number[]];
  const out: number[][] = [];
  for (const x of c) out.push(...aplanar(x));
  return out;
}

/** Convierte el valor de la base al rótulo deInventario. */
function aCategoria(v: string | null): string {
  if (!v) return "otros";
  const t = v.trim().toLowerCase();
  return (CATEGORIAS_INVENTARIO as readonly string[]).includes(t) ? t : "other";
}

// ---------------------------------------------------------------------------
// Corrección de la etiqueta CRS
// ---------------------------------------------------------------------------

/**
 * Devuelve la etiqueta CRS que corresponde de verdad al dato, sin tocar las
 * coordenadas. Si la fuente es la plantilla municipal, la etiqueta correcta es
 * ETRS89 UTM 30 aunque el dato almacenado diga otra cosa.
 */
export function crsLegible(r: RegistroCrudo): string {
  const coord = leerCoordenadas(r);
  const fuente = r.fuente_principal ?? "";
  const correccion = corregirCRS(fuente, r.crs_original, coord);
  if (correccion.verificada || correccion.crs_correcto) return correccion.crs_correcto;
  const guardado = (r.crs_original ?? "").trim();
  if (guardado) return guardado;
  return coord ? "EPSG:4326" : "Sin datum";
}

// ---------------------------------------------------------------------------
// Nombre: recuperación y marca de pendiente
// ---------------------------------------------------------------------------

interface NombreResuelto {
  nombre: string;
  nombre_original: string | null;
  estado_nombre: FilaLibro["estado_nombre"];
  advertencias: string | null;
}

/**
 * Decide el nombre que se publica. Un nombre numérico de la plantilla municipal
 * no se puede atribuir con certeza a un elemento concreto, así que se conserva
 * la cifra y se marca como pendiente de revisión, en lugar de inventar un nombre.
 */
function resolverNombre(r: RegistroCrudo, tipo: string): NombreResuelto {
  const bruto = (r.nombre_oficial ?? r.nombre_origen ?? "").trim();

  if (!bruto) {
    return {
      nombre: "Sin nombre",
      nombre_original: null,
      estado_nombre: "por_registrar",
      advertencias: "El registro no trae nombre en la fuente de origen.",
    };
  }

  // Un nombre formado solo por una cifra no dice qué elemento es. Da igual
  // de qué fuente venga: se marca y se explica, en lugar de dar por bueno un
  // identificador opaco.
  if (esSoloUnaCifra(bruto)) {
    const clase = r.fuente_principal === NOMBRE_FUENTE_PLANTILLA ? "partida de limpieza" : tipo;
    return {
      nombre: bruto,
      nombre_original: bruto,
      estado_nombre: "por_revisar",
      advertencias:
        `El nombre es una cifra suelta, propia de la ${clase}. No identifica el elemento, ` +
        "de modo que se conserva tal cual y se marca como pendiente en lugar de " +
        "sustituirlo por una suposición.",
    };
  }

  return {
    nombre: bruto,
    nombre_original: r.nombre_origen,
    estado_nombre: "correcto",
    advertencias: null,
  };
}

// ---------------------------------------------------------------------------
// Construcción de la fila del libro
// ---------------------------------------------------------------------------

/** Nombre exacto con el que la plantilla municipal figura en la base. */
const NOMBRE_FUENTE_PLANTILLA = "Plantilla municipal — Limpieza info (PTM Benidorm)";

const TIPO_FUENTE: Record<string, string> = {
  "OpenStreetMap (Overpass)": "osm_overpass",
  "OpenStreetMap (Nominatim)": "osm_nominatim",
  [NOMBRE_FUENTE_PLANTILLA]: "plantilla_municipal",
  "INE - Padrón municipal (tabla 29005)": "ine_padron",
  "Geoportal de Gasolineras (MITECO, API REST)": "miteco_gasolineras",
  "GVA - Centros docentes de la Comunitat Valenciana (ICV WFS)": "gva_educacion",
  "GVA - Sistema Valenciano de Salud, centros sanitarios (ICV WFS)": "gva_salud",
};

/** Advertencias heredadas de la base que el libro debe mostrar. */
function advertenciasHeredadas(r: RegistroCrudo): string | null {
  const a: string[] = [];
  if (r.posible_duplicado) {
    a.push("Posible duplicado señalado en la carga original.");
  }
  if (r.eliminado_en) {
    a.push("Registro marcado como baja; se conserva por trazabilidad.");
  }
  if (!r.metodo_obtencion) {
    a.push("La fuente no declara el método de obtención.");
  }
  if (r.accesibilidad === false) {
    a.push("La fuente indica que no es accesible.");
  }
  return a.length ? a.join(" ") : null;
}

export function filaDesdeRegistro(
  r: RegistroCrudo,
  t: TerritorioCrudo
): FilaLibro {
  const categoria = aCategoria(r.categoria);
  const sub = (r.subcategoria ?? "").trim().toLowerCase() || null;
  const tipo = sub ?? "sin_clasificar";
  const coord = leerCoordenadas(r);
  const nombre = resolverNombre(r, tipo);
  const advertencias = [nombre.advertencias, advertenciasHeredadas(r)]
    .filter(Boolean)
    .join(" ") || null;

  // La fuente sola no basta: si la URL no está autorizada no se publica enlace.
  const enlaceFuente = esAllowedSourceUrl(r.url_fuente) ? r.url_fuente : null;
  const enlaceOrigen = esAllowedSourceUrl(r.enlace_origen) ? r.enlace_origen : null;

  return {
    id_tecnico: r.id,
    codigo_ine: t.codigo_ine,
    municipio: t.municipio,
    provincia: t.provincia,
    comunidad_autonoma: t.comunidad_autonoma,
    comarca: t.comarca ?? SIN_COMARCA,
    categoria,
    categoria_nombre: tipoLegible(categoria),
    subcategoria: sub,
    tipo,
    nombre: nombre.nombre,
    nombre_original: nombre.nombre_original,
    estado_nombre: nombre.estado_nombre,
    direccion: r.direccion,
    codigo_postal: r.codigo_postal,
    nucleo: r.nucleo,
    lat: coord?.lat ?? null,
    lng: coord?.lng ?? null,
    utm_x: null,
    utm_y: null,
    utm_huso: coord ? husoDesdeLongitud(coord.lng) : null,
    crs_origen: crsLegible(r),
    precision: (r.precision_geolocalizacion ?? "").trim() || "sin_ubicacion",
    telefono: r.telefono_publico,
    web: esAllowedSourceUrl(r.web) ? r.web : null,
    horario: r.horario,
    titularidad: titularidadLegible(r.titularidad),
    operador: r.gestor,
    capacidad: r.capacidad ?? r.aforo,
    unidad_capacidad: r.unidad_capacidad,
    enlace_origen: enlaceOrigen,
    enlace_fuente: enlaceFuente,
    fuente: r.fuente_principal ?? "Sin fuente declarada",
    licencia: r.licencia ?? "Uso interno del proyecto",
    fecha_obtencion: r.fecha_consulta,
    fecha_edicion_origen: r.fecha_edicion_origen ?? r.fecha_dato,
    estado_validacion: (r.estado_validacion ?? "").trim() || "sin_validar",
    estado_espacial: r.estado_espacial ?? (coord ? "verificada" : "sin_geometria"),
    confianza: 0,
    distancia_limite_m: null,
    geometria_wkt: "",
    advertencias,
  };
}

// ---------------------------------------------------------------------------
// Fuentes
// ---------------------------------------------------------------------------

const ORGANISMO: Record<string, string> = {
  "OpenStreetMap (Overpass)": "OpenStreetMap",
  "OpenStreetMap (Nominatim)": "OpenStreetMap",
  [NOMBRE_FUENTE_PLANTILLA]: "Ayuntamiento de Benidorm",
  "INE - Padrón municipal (tabla 29005)": "Instituto Nacional de Estadística",
  "Geoportal de Gasolineras (MITECO, API REST)": "Ministerio para la Transición Ecológica",
  "GVA - Centros docentes de la Comunitat Valenciana (ICV WFS)":
    "Generalitat Valenciana, Institut Cartogràfic Valencià",
  "GVA - Sistema Valenciano de Salud, centros sanitarios (ICV WFS)":
    "Generalitat Valenciana, Institut Cartogràfic Valencià",
};

const LICENCIA_FUENTE: Record<string, string> = {
  "OpenStreetMap (Overpass)": "Open Database License (ODbL) 1.0",
  "OpenStreetMap (Nominatim)": "Open Database License (ODbL) 1.0",
  [NOMBRE_FUENTE_PLANTILLA]: "Uso interno del proyecto",
  "INE - Padrón municipal (tabla 29005)": "Licencia de uso con fines estadísticos",
  "Geoportal de Gasolineras (MITECO, API REST)": "Licencia de reutilización del Geoportal MITECO",
  "GVA - Centros docentes de la Comunitat Valenciana (ICV WFS)":
    "Licencia de reutilización de la Generalitat Valenciana",
  "GVA - Sistema Valenciano de Salud, centros sanitarios (ICV WFS)":
    "Licencia de reutilización de la Generalitat Valenciana",
};

const LIMITACIONES: Record<string, string> = {
  [NOMBRE_FUENTE_PLANTILLA]:
    "Plantilla de trabajo facilitada por el municipio. Los elementos de partida y " +
    "parada llegan sin identificador normalizado y buena parte carecen de " +
    "coordenadas; su nombre y su posición deben revisarse antes de publicarse.",
  "OpenStreetMap (Overpass)":
    "Datos aportados por personas voluntarias. La cobertura y la fecha " +
    "dependen de la consulta y no garantizan exactitud de posición ni cobertura " +
    "completa.",
  "INE - Padrón municipal (tabla 29005)":
    "Cifras oficiales de población; no identifican equipamientos concretos.",
};

function construirFuentes(
  filas: FilaLibro[],
  registros: RegistroCrudo[]
): FuenteLibro[] {
  const porFuente = new Map<string, number>();
  for (const f of filas) porFuente.set(f.fuente, (porFuente.get(f.fuente) ?? 0) + 1);

  const fechas = new Map<string, string[]>();
  for (const r of registros) {
    const f = r.fuente_principal;
    if (!f) continue;
    if (!fechas.has(f)) fechas.set(f, []);
    const v = r.fecha_edicion_origen ?? r.fecha_dato ?? r.fecha_consulta;
    if (v) fechas.get(f)!.push(String(v).slice(0, 10));
  }

  return [...porFuente.entries()]
    .map(([nombre, n]) => {
      const d = (fechas.get(nombre) ?? []).sort();
      return {
        nombre,
        organismo: ORGANISMO[nombre] ?? "Sin organismo declarado",
        tipo: TIPO_FUENTE[nombre] ?? "sin_clasificar",
        licencia: licenciaDeFuente(nombre),
        url: "",
        cobertura: "Municipio de Benidorm (03031)",
        periodicidad: "Puntual, según disponibilidad de cada fuente",
        fecha_ultima_consulta: d.length ? d[d.length - 1] : null,
        version_esquema: null,
        registros_en_libro: n,
        limitaciones: LIMITACIONES[nombre] ?? null,
      };
    })
    .sort((a, b) => b.registros_en_libro - a.registros_en_libro);
}

/** Licencia declarada de cada fuente, con reserva. */
function licenciaDeFuente(nombre: string): string {
  return LICENCIA_FUENTE[nombre] ?? "Uso interno del proyecto";
}

// ---------------------------------------------------------------------------
// Paginación
// ---------------------------------------------------------------------------

/**
 * Lee todos los registros de un municipio. Delega en el paginador compartido,
 * porque el servidor de Supabase corta las respuestas largas en silencio: sin
 * esto, un municipio con más de mil registros saldría truncado en el libro sin
 * que nada lo indicara.
 */
export async function paginarRegistros(
  cliente: ClienteSupabase,
  codigoIne: string
): Promise<{ filas: RegistroCrudo[]; total: number }> {
  const consulta = cliente
    .from("incideas_registros")
    .select<RegistroCrudo>("*")
    .eq("codigo_ine", codigoIne)
    .order("id", true);

  const { data, error } = await leerTodas<RegistroCrudo>((desde, hasta) =>
    consulta.range(desde, hasta)
  );
  if (error) throw new Error(`Registros de ${codigoIne}: ${error}`);

  const filas = data;
  return { filas, total: filas.length };
}

// ---------------------------------------------------------------------------
// Población
// ---------------------------------------------------------------------------

/**
 * Población oficial del municipio, tomada de los registros del padrón que el
 * propio INCideas ya contiene (tabla 29005 del INE), que es la fuente fiable.
 *
 * El campo `municipios.poblacion` no se usa como valor principal: en la base
 * contiene 1.021 habitantes para Benidorm, cuando el padrón del INE registra
 * 77.327 para 2025. Se conserva la cifra de la base solo como contraste y se
 * avisa de la discrepancia en lugar de publicar un dato que se sabe falso.
 */
export function resolverPoblacion(
  registros: RegistroCrudo[],
  poblacionEnMunicipios: number | null,
  avisos: string[]
): { poblacion: number | null; anio: number | null; poblacion_en_tabla_municipios: number | null } {
  let mejor: { anio: number; valor: number } | null = null;
  for (const r of registros) {
    if (r.categoria !== "poblacion" || r.subcategoria !== "padron") continue;
    const a = r.atributos as { periodo?: unknown; poblacion?: unknown; total?: unknown } | null;
    if (!a) continue;
    const anio = Number(a.periodo);
    const valor = Number(a.poblacion ?? a.total);
    if (!Number.isFinite(anio) || !Number.isFinite(valor) || valor <= 0) continue;
    if (!mejor || anio > mejor.anio) mejor = { anio, valor };
  }

  if (mejor && poblacionEnMunicipios !== null) {
    const desvio = Math.abs(poblacionEnMunicipios - mejor.valor) / mejor.valor;
    if (desvio > 0.2) {
      avisos.push(
        `La tabla municipios guarda ${poblacionEnMunicipios} habitantes para este ` +
          `municipio, mientras que el padrón del INE de ${mejor.anio} registra ` +
          `${mejor.valor}. Se publica la cifra del INE y no la de la tabla, que parece ` +
          `corrupta. La corrección en la base queda pendiente de tu autorización.`
      );
    }
  }

  if (!mejor && poblacionEnMunicipios !== null) {
    avisos.push(
      "No hay registros del padrón del INE, así que la población se toma de la " +
        "tabla municipios, que no se ha podido contrastar."
    );
    return { poblacion: poblacionEnMunicipios, anio: null, poblacion_en_tabla_municipios: poblacionEnMunicipios };
  }

  if (!mejor) {
    avisos.push("No hay ninguna fuente de población en la base para este municipio.");
    return { poblacion: null, anio: null, poblacion_en_tabla_municipios: poblacionEnMunicipios };
  }

  return { poblacion: mejor.valor, anio: mejor.anio, poblacion_en_tabla_municipios: poblacionEnMunicipios };
}

// ---------------------------------------------------------------------------
// Carga completa
// ---------------------------------------------------------------------------

export interface ResultadoCarga {
  entrada: EntradaLibro;
  avisos: string[];
}

export async function cargarLibroMunicipal(
  cliente: ClienteSupabase,
  codigoIne: string
): Promise<ResultadoCarga> {
  const avisos: string[] = [];

  // La base no guarda la provincia ni la comunidad dentro de `municipios`, y no
  // existe una vista que las reúna, así que se leen las tres tablas y se une en
  // memoria. No se crea ninguna vista nueva en producción.
  const { data: dMun, error: eMun } = await cliente
    .from("municipios")
    .select<MunicipioCrudo>("id, provincia_id, nombre, codigo_ine, poblacion, geom")
    .eq("codigo_ine", codigoIne)
    .limit(1);
  if (eMun) throw new Error(`Municipios: ${eMun.message}`);
  const mun = (dMun ?? [])[0];
  if (!mun) throw new Error(`No hay municipio con el código ${codigoIne}`);

  const { data: dProv, error: eProv } = await cliente
    .from("provincias")
    .select<ProvinciaCruda>("id, comunidad_autonoma_id, nombre")
    .limit(200);
  if (eProv) throw new Error(`Provincias: ${eProv.message}`);
  const provincias = dProv ?? [];

  const { data: dCCAA, error: eCCAA } = await cliente
    .from("comunidades_autonomas")
    .select<ComunidadCruda>("id, nombre")
    .limit(100);
  if (eCCAA) throw new Error(`Comunidades: ${eCCAA.message}`);
  const comunidades = dCCAA ?? [];

  const provincia = provincias.find((x) => x.id === mun.provincia_id);
  const comunidad = provincia
    ? comunidades.find((c) => c.id === provincia.comunidad_autonoma_id)
    : undefined;
  if (!provincia) avisos.push(`No se ha encontrado la provincia del municipio.`);
  if (!comunidad) avisos.push(`No se ha encontrado la comunidad autónoma del municipio.`);

  const territorio: TerritorioCrudo = {
    codigo_ine: mun.codigo_ine,
    municipio: mun.nombre,
    provincia: provincia?.nombre ?? SIN_DATO_TERRITORIO,
    comunidad_autonoma: comunidad?.nombre ?? SIN_DATO_TERRITORIO,
    comarca: null,
    poblacion: null,
    superficie_km2: superficieDesdeGeoJson(mun.geom),
    anio_poblacion: null,
  };
  if (territorio.superficie_km2 === null) {
    avisos.push(
      "La geometría que guarda la tabla municipios es un punto, no el término " +
        "municipal, así que la superficie no se puede calcular. El libro lo indica " +
        "en lugar de publicar un valor aproximado sin respaldo."
    );
  }
  if (!territorio.comarca) {
    avisos.push(
      "La base no tiene tabla de comarcas, así que la comarca figura como «No consta»."
    );
  }

  const { filas: registros, total: registrosTotales } = await paginarRegistros(cliente, codigoIne);
  avisos.push(
    `Registros leídos: ${registros.length}. La consulta se hace por páginas de ` +
      `${TAM_PAGINA} porque el servidor corta los resultados largos.`
  );
  const bajas = registrosTotales - registros.length;
  if (bajas > 0) {
    avisos.push(`${bajas} registros con baja se han dejado fuera del libro.`);
  }

  const pob = resolverPoblacion(registros, mun.poblacion ?? null, avisos);
  territorio.poblacion = pob.poblacion;
  territorio.anio_poblacion = pob.anio;

  const filas = registros.map((r) => filaDesdeRegistro(r, territorio));
  const fuentes = construirFuentes(filas, registros);

  // Las columnas derivadas se calculan aquí, una sola vez, para que el libro y
  // los formatos abiertos partan del mismo valor. Si las calculara cada consumidor
  // por su cuenta, el Excel y el GeoJSON podrían contradecirse.
  const tiposFuente = new Map(fuentes.map((f) => [f.nombre, f.tipo]));
  const referencia = new Date().toISOString().slice(0, 10);
  const filasEnriquecidas = filas.map((f) => ({
    ...f,
    ...enriquecerFila(f, tiposFuente, { referencia }),
  }));

  const entrada: EntradaLibro = {
    ...territorio,
    comarca: territorio.comarca ?? SIN_COMARCA,
    generado_en: new Date().toISOString(),
    filas: filasEnriquecidas,
    fuentes,
  };

  return { entrada, avisos };
}

// ---------------------------------------------------------------------------
// Formatos abiertos a partir de las filas del libro
// ---------------------------------------------------------------------------

const COLUMNAS_CSV = [
  "id_tecnico",
  "categoria",
  "tipo",
  "nombre",
  "estado_nombre",
  "direccion",
  "nucleo",
  "codigo_postal",
  "lat",
  "lng",
  "utm_x",
  "utm_y",
  "utm_huso",
  "crs_origen",
  "precision",
  "telefono",
  "web",
  "horario",
  "titularidad",
  "operador",
  "capacidad",
  "unidad_capacidad",
  "fuente",
  "licencia",
  "fecha_edicion_origen",
  "estado_validacion",
  "estado_espacial",
  "confianza",
  "advertencias",
];

/** Punto de la fila, si tiene coordenadas válidas. */
function punto(f: FilaLibro): GeoJSON.Point | null {
  if (f.lat === null || f.lng === null) return null;
  return { type: "Point", coordinates: [f.lng, f.lat] };
}

export function construirCSVInventario(filas: FilaLibro[]): string {
  return construirCsvCabeceras(
    COLUMNAS_CSV,
    filas.map((f) => COLUMNAS_CSV.map((c) => (f as unknown as Record<string, unknown>)[c] as string | number | null))
  );
}

export function construirGeoJSONInventario(
  filas: FilaLibro[],
  nombre: string
): string {
  const features: FeatureGeoJSON[] = [];
  for (const f of filas) {
    const g = punto(f);
    if (!g) continue;
    features.push({
      type: "Feature",
      geometry: g,
      properties: {
        id_tecnico: f.id_tecnico,
        categoria: f.categoria,
        tipo: f.tipo,
        nombre: f.nombre,
        estado_nombre: f.estado_nombre,
        direccion: f.direccion,
        lat: f.lat,
        lng: f.lng,
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
  return construirGeoJSON(features, nombre);
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
    const g = punto(f);
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

/** Columnas UTM de referencia, para contrastar con la tabla del libro. */
export function tablaUTM(filas: FilaLibro[]): string[] {
  return filas
    .filter((f) => f.lat !== null && f.lng !== null)
    .slice(0, 5)
    .map((f) => {
      const u = latLngToUtm(f.lat!, f.lng!);
      return `${f.nombre}: E ${u.x.toFixed(2)} N ${u.y.toFixed(2)} huso ${u.huso}`;
    });
}
