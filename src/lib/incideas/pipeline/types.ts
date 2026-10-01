import type { CategoriaINCideas, EstadoValidacion, Visibilidad } from "../types";

export interface FuenteRef {
  /** Nombre que se guarda en incideas_registros.fuente_principal. */
  nombre: string;
  organismo: string;
  licencia?: string;
  url?: string;
  /** Identificador de la fila en incideas_fuentes, si ya existe. */
  id_fuente?: string;
}

export interface RawFeature {
  /** Identificador estable de la fuente. Si falta, se usa huella determinista. */
  id_origen?: string;
  nombre: string;
  categoria: CategoriaINCideas;
  subcategoria?: string;
  lat?: number;
  lon?: number;
  /** Geometría GeoJSON (Polygon/MultiPolygon/LineString/Point) si la fuente la aporta. */
  geometria?: GeoJSON.Geometry | null;
  direccion?: string;
  telefono?: string;
  web?: string;
  codigo_postal?: string;
  nucleo?: string;
  distrito?: string;
  barrio?: string;
  titularidad?: string;
  gestor?: string;
  horario?: string;
  capacidad?: number;
  unidad_capacidad?: string;
  aforo?: number;
  personal_publicado?: number;
  descripcion?: string;
  /** Atributos específicos de la categoría (albergue, veterinaria, etc.). */
  atributos?: Record<string, unknown>;
  fuente: FuenteRef;
  fecha_dato?: string;
  metodo_obtencion?: string;
}

export interface ProcedenciaAtributo {
  fuente: string;
  fecha_consulta: string;
  metodo: string;
  licencia?: string;
  id_origen?: string;
}

export interface NormalizedRecord {
  codigo_ine: string;
  categoria: CategoriaINCideas;
  subcategoria?: string;
  nombre_oficial: string;
  nombre_normalizado: string;
  nombre_origen?: string;
  id_origen?: string;
  huella: string;
  direccion?: string;
  direccion_normalizada?: string;
  telefono_publico?: string;
  telefono_normalizado?: string;
  web?: string;
  codigo_postal?: string;
  nucleo?: string;
  distrito?: string;
  barrio?: string;
  descripcion?: string;
  titularidad?: string;
  gestor?: string;
  horario?: string;
  capacidad?: number;
  unidad_capacidad?: string;
  aforo?: number;
  personal_publicado?: number;
  coordenadas?: { lat: number; lng: number };
  geometria?: GeoJSON.Geometry | null;
  crs_original: string;
  tipo_geometria?: "punto" | "linea" | "poligono";
  fuente_principal: string;
  url_fuente?: string;
  licencia?: string;
  fecha_dato?: string;
  metodo_obtencion?: string;
  estado_validacion: EstadoValidacion;
  nivel_automatizacion: "alta" | "media" | "baja";
  visibilidad: Visibilidad;
  estado_espacial?: string;
  procedencia_atributos: Record<string, ProcedenciaAtributo>;
  atributos?: Record<string, unknown>;
  observaciones?: string;
}

/**
 * Conjunto de registros del que un conector es responsable dentro de su fuente.
 * Acota la detección de posibles bajas: sin subcategorías, toda la categoría.
 */
export interface AmbitoBajas {
  categoria: CategoriaINCideas;
  subcategorias?: string[];
}

export interface EjecucionContext {
  id: string;
  conector: string;
  version_conector: string;
  codigo_ine: string;
  categoria: CategoriaINCideas;
  fuente: FuenteRef;
  parametros: Record<string, unknown>;
  /** Ámbito de bajas; por defecto, la categoría del conector. */
  ambito?: AmbitoBajas[];
}

export interface UpsertCounts {
  insertados: number;
  actualizados: number;
  sin_cambios: number;
  posibles_bajas: number;
  rechazados: number;
  errores: string[];
  claves_vistas: string[];
}

export interface RegistroExistente {
  id: string;
  estado_validacion: string;
  version_registro: number;
  huella?: string | null;
  id_origen?: string | null;
  [key: string]: unknown;
}

export interface HistorialEntrada {
  registro_id: string;
  accion: string;
  campo?: string;
  valor_anterior?: string | null;
  valor_nuevo?: string | null;
  usuario?: string;
  unidad_validadora?: string;
  observaciones?: string;
}

/**
 * Abstracción de persistencia. Permite probar la idempotencia sin base de datos
 * (implementación en memoria) y ejecutar contra Supabase (store-supabase.ts).
 */
export interface RegistroStore {
  findByIdOrigen(
    codigoINE: string,
    categoria: string,
    fuente: string,
    idOrigen: string
  ): Promise<RegistroExistente | null>;
  /** Registro activo con esa huella; si hay varios, preferentemente uno sin id_origen. */
  findByHuella(
    codigoINE: string,
    categoria: string,
    huella: string
  ): Promise<RegistroExistente | null>;
  insert(record: NormalizedRecord): Promise<RegistroExistente>;
  update(
    id: string,
    changes: Record<string, unknown>,
    expectedVersion: number
  ): Promise<RegistroExistente>;
  registrarHistorial(entrada: HistorialEntrada): Promise<void>;
  /** Registros activos de una fuente en un municipio/categoría (y subcategorías, si se
   *  indican) con su clave lógica. */
  listarClavesFuente(
    codigoINE: string,
    categoria: string,
    fuente: string,
    subcategorias?: string[]
  ): Promise<{ clave: string; id: string }[]>;
  marcarPosibleBaja(
    id: string,
    motivo: string,
    desactualizadoDesde: string
  ): Promise<void>;
}
