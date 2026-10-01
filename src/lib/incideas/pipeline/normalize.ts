import type { CategoriaINCideas } from "../types";
import type { RawFeature, NormalizedRecord, ProcedenciaAtributo, FuenteRef } from "./types";
import { computeHuella } from "./huella";

const DIACRITICS = /[\u0300-\u036f]/g;

/** Normaliza un nombre: sin diacríticos, minúsculas, espacios colapsados, sin puntuación de borde. */
export function normalizeName(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[.,;:()"'`´]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Teléfono a dígitos, sin prefijo internacional 34 cuando es español. */
export function normalizePhone(input: string | null | undefined): string | undefined {
  if (!input) return undefined;
  let digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+34")) digits = digits.slice(3);
  else if (digits.startsWith("0034")) digits = digits.slice(4);
  digits = digits.replace(/\D/g, "");
  return digits.length >= 6 ? digits : undefined;
}

/** Dirección normalizada: sin diacríticos, tipos de vía unificados, espacios colapsados. */
export function normalizeAddress(input: string | null | undefined): string | undefined {
  if (!input) return undefined;
  const base = input
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return base
    .replace(/\bc\//g, "calle ")
    .replace(/\bavda\.?(?=\s|,|$)/g, "avenida")
    .replace(/\bav\.?(?=\s|,|$)/g, "avenida")
    .replace(/\bpza\.?(?=\s|,|$)/g, "plaza")
    .replace(/\bctra\.?(?=\s|,|$)/g, "carretera")
    .replace(/\bn[º°]\.?\s*/g, "numero ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePostal(input: string | null | undefined): string | undefined {
  if (!input) return undefined;
  const m = input.match(/\b(\d{5})\b/);
  return m ? m[1] : undefined;
}

export function normalizeUrl(input: string | null | undefined): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export function normalizeTitularidad(input: string | null | undefined): string | undefined {
  if (!input) return undefined;
  const n = normalizeName(input);
  if (/public|ayuntamiento|municipal|administracion|generalitat|estado/.test(n)) return "publica";
  if (/privad|privada/.test(n)) return "privada";
  if (/concertad|mixt/.test(n)) return "mixta";
  return n || undefined;
}

export function roundCoord(value: number, decimals = 5): number {
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
}

/** Mapea etiquetas OSM a categoría/subcategoría INCideas. */
export function categoriaDesdeOSM(tags: Record<string, string>): {
  categoria: CategoriaINCideas;
  subcategoria: string;
} | null {
  const a = tags.amenity;
  const h = tags.healthcare;
  const t = tags.tourism;
  const s = tags.shop;
  const o = tags.office;

  if (a === "pharmacy") return { categoria: "equipamientos", subcategoria: "farmacia" };
  if (a === "hospital" || h === "hospital")
    return { categoria: "equipamientos", subcategoria: "hospital" };
  if (a === "clinic" || h === "clinic" || h === "centre")
    return { categoria: "equipamientos", subcategoria: "centro_salud" };
  if (a === "doctors" || h === "doctor")
    return { categoria: "equipamientos", subcategoria: "consultorio" };
  if (a === "school") return { categoria: "equipamientos", subcategoria: "colegio" };
  if (a === "kindergarten") return { categoria: "equipamientos", subcategoria: "escuela_infantil" };
  if (a === "college") return { categoria: "equipamientos", subcategoria: "instituto" };
  if (a === "university") return { categoria: "equipamientos", subcategoria: "centro_formacion" };
  if (a === "police") return { categoria: "equipamientos", subcategoria: "policia" };
  if (a === "fire_station") return { categoria: "equipamientos", subcategoria: "bomberos" };
  if (a === "townhall" || o === "government")
    return { categoria: "equipamientos", subcategoria: "administracion" };
  if (a === "social_facility")
    return { categoria: "equipamientos", subcategoria: "servicios_sociales" };
  if (a === "community_centre")
    return { categoria: "equipamientos", subcategoria: "centro_comunitario" };
  if (a === "library") return { categoria: "equipamientos", subcategoria: "biblioteca" };
  if (a === "marketplace") return { categoria: "equipamientos", subcategoria: "mercado" };
  if (t === "hotel" || t === "hostel" || t === "guest_house" || t === "apartment" || t === "motel")
    return { categoria: "infraestructuras", subcategoria: "alojamiento" };
  if (t === "camp_site" || t === "caravan_site")
    return { categoria: "infraestructuras", subcategoria: "camping" };
  if (a === "fuel") return { categoria: "servicios_basicos", subcategoria: "estacion_servicio" };
  if (a === "veterinary" || h === "veterinary")
    return { categoria: "animales", subcategoria: "clinica_veterinaria" };
  if (s === "supermarket" || s === "convenience" || s === "grocery")
    return { categoria: "equipamientos", subcategoria: "alimentacion" };
  if (a === "bus_station") return { categoria: "infraestructuras", subcategoria: "estacion_autobus" };
  if (a === "ferry_terminal") return { categoria: "infraestructuras", subcategoria: "puerto" };
  return null;
}

export function tipoGeometria(
  geometry: GeoJSON.Geometry | null | undefined
): "punto" | "linea" | "poligono" | undefined {
  if (!geometry) return undefined;
  switch (geometry.type) {
    case "Point":
    case "MultiPoint":
      return "punto";
    case "LineString":
    case "MultiLineString":
      return "linea";
    case "Polygon":
    case "MultiPolygon":
      return "poligono";
    default:
      return undefined;
  }
}

function procedencia(
  campo: string,
  fuente: FuenteRef,
  fechaConsulta: string,
  metodo: string,
  idOrigen?: string
): ProcedenciaAtributo {
  return {
    fuente: fuente.nombre,
    fecha_consulta: fechaConsulta,
    metodo,
    licencia: fuente.licencia,
    id_origen: idOrigen,
  };
}

export interface NormalizeOptions {
  codigoINE: string;
  fechaConsulta?: string;
  estadoValidacion?: NormalizedRecord["estado_validacion"];
  nivelAutomatizacion?: NormalizedRecord["nivel_automatizacion"];
  visibilidad?: NormalizedRecord["visibilidad"];
}

/** Convierte una RawFeature en un NormalizedRecord con procedencia por atributo. */
export function normalizeFeature(
  raw: RawFeature,
  options: NormalizeOptions
): NormalizedRecord {
  const fechaConsulta = options.fechaConsulta ?? new Date().toISOString();
  const metodo = raw.metodo_obtencion ?? "automatico";
  const proc: Record<string, ProcedenciaAtributo> = {};

  const nombreNormalizado = normalizeName(raw.nombre);
  const lat = raw.lat !== undefined ? roundCoord(raw.lat) : undefined;
  const lon = raw.lon !== undefined ? roundCoord(raw.lon) : undefined;

  const huella = computeHuella({
    fuente: raw.fuente.nombre,
    codigoINE: options.codigoINE,
    categoria: raw.categoria,
    nombreNormalizado,
    lat,
    lon,
  });

  const set = (campo: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== "") {
      proc[campo] = procedencia(campo, raw.fuente, fechaConsulta, metodo, raw.id_origen);
    }
  };

  set("nombre_oficial", raw.nombre);
  set("direccion", raw.direccion);
  set("telefono_publico", raw.telefono);
  set("web", raw.web);
  set("codigo_postal", raw.codigo_postal);
  set("nucleo", raw.nucleo);
  set("titularidad", raw.titularidad);
  set("gestor", raw.gestor);
  set("horario", raw.horario);
  set("capacidad", raw.capacidad);
  set("unidad_capacidad", raw.unidad_capacidad);
  set("aforo", raw.aforo);
  set("personal_publicado", raw.personal_publicado);
  set("coordenadas", lat !== undefined && lon !== undefined ? true : undefined);
  set("geometria", raw.geometria ?? undefined);

  return {
    codigo_ine: options.codigoINE,
    categoria: raw.categoria,
    subcategoria: raw.subcategoria,
    nombre_oficial: raw.nombre.trim(),
    nombre_normalizado: nombreNormalizado,
    nombre_origen: raw.nombre,
    id_origen: raw.id_origen,
    huella,
    direccion: raw.direccion,
    direccion_normalizada: normalizeAddress(raw.direccion),
    telefono_publico: raw.telefono,
    telefono_normalizado: normalizePhone(raw.telefono),
    web: normalizeUrl(raw.web),
    codigo_postal: normalizePostal(raw.codigo_postal),
    nucleo: raw.nucleo,
    distrito: raw.distrito,
    barrio: raw.barrio,
    descripcion: raw.descripcion,
    titularidad: normalizeTitularidad(raw.titularidad),
    gestor: raw.gestor,
    horario: raw.horario,
    capacidad: raw.capacidad,
    unidad_capacidad: raw.unidad_capacidad,
    aforo: raw.aforo,
    personal_publicado: raw.personal_publicado,
    coordenadas: lat !== undefined && lon !== undefined ? { lat, lng: lon } : undefined,
    geometria: raw.geometria ?? null,
    crs_original: "EPSG:4326",
    tipo_geometria: tipoGeometria(raw.geometria),
    fuente_principal: raw.fuente.nombre,
    url_fuente: raw.fuente.url,
    licencia: raw.fuente.licencia,
    fecha_dato: raw.fecha_dato,
    metodo_obtencion: metodo,
    estado_validacion: options.estadoValidacion ?? "automatico_sin_revisar",
    nivel_automatizacion: options.nivelAutomatizacion ?? "media",
    visibilidad: options.visibilidad ?? "publica",
    procedencia_atributos: proc,
    atributos: raw.atributos ?? {},
  };
}
