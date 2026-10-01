export type EstadoValidacion =
  | "automatico_sin_revisar"
  | "contrastado"
  | "validado_tecnicamente"
  | "validado_ayuntamiento"
  | "incompleto"
  | "conflictivo"
  | "potencialmente_obsoleto"
  | "no_disponible"
  | "restringido"
  | "estimado"
  | "pendiente_municipal";

export type TipoFuente =
  | "oficial_estructurada"
  | "oficial_cartografica"
  | "oficial_documental"
  | "municipal"
  | "operador"
  | "colaborativa"
  | "comercial"
  | "elaboracion_propia"
  | "estimacion_tecnica"
  | "declaracion_municipal";

export type NivelAutomatizacion = "alta" | "media" | "baja";

export type Visibilidad = "publica" | "tecnica" | "restringida" | "personal_protegida";

export type CategoriaINCideas =
  | "territorio"
  | "poblacion"
  | "necesidades_especiales"
  | "animales"
  | "infraestructuras"
  | "equipamientos"
  | "servicios_basicos"
  | "riesgos"
  | "medios_recursos"
  | "evacuacion"
  | "calidad"
  | "exportaciones";

export interface RegistroINCideas {
  id: string;
  codigo_ine: string;
  categoria: CategoriaINCideas;
  subcategoria: string;
  nombre_oficial: string;
  nombre_normalizado: string;
  nombres_alternativos?: string[];
  descripcion?: string;
  direccion?: string;
  nucleo?: string;
  barrio?: string;
  distrito?: string;
  codigo_postal?: string;
  geometria?: string;
  coordenadas?: { lat: number; lng: number };
  crs_original?: string;
  tipo_geometria?: "punto" | "linea" | "poligono";
  titularidad?: string;
  gestor?: string;
  telefono_publico?: string;
  correo_publico?: string;
  web?: string;
  horario?: string;
  capacidad?: number;
  unidad_capacidad?: string;
  aforo?: number;
  personal_publicado?: number;
  accesibilidad?: boolean;
  estado_operativo?: string;
  funcion_emergencia?: string;
  riesgos_asociados?: string[];
  plan_autoproteccion?: boolean;
  fuente_principal: string;
  fuentes_secundarias?: string[];
  url_fuente?: string;
  fecha_dato?: string;
  fecha_consulta: string;
  fecha_validacion?: string;
  metodo_obtencion?: string;
  licencia?: string;
  calidad?: "alta" | "media" | "baja";
  confianza?: number;
  estado_validacion: EstadoValidacion;
  unidad_validadora?: string;
  observaciones?: string;
  posible_duplicado?: boolean;
  dato_sensible?: boolean;
  visibilidad: Visibilidad;
  nivel_automatizacion: NivelAutomatizacion;
  creado_en: string;
  actualizado_en: string;
  creado_por?: string;
  actualizado_por?: string;
}

export interface FuenteINCideas {
  id: string;
  organismo: string;
  nombre: string;
  tipo: TipoFuente;
  cobertura: string;
  categorias: CategoriaINCideas[];
  formato: string;
  licencia?: string;
  fecha?: string;
  frecuencia?: string;
  estabilidad?: "alta" | "media" | "baja";
  limitaciones?: string;
  campos_disponibles?: string[];
  nivel_confianza_inicial?: number;
  url?: string;
  comunidad_autonoma?: string;
  activa: boolean;
  ultima_ejecucion?: string;
  ultima_ejecucion_correcta?: string;
  estado?: "activa" | "fallida" | "pendiente" | "inactiva";
  errores?: string;
  version_esquema?: string;
  transformaciones?: string;
}

export interface CategoriaInfo {
  id: CategoriaINCideas;
  nombre: string;
  descripcion: string;
  icono?: string;
  nivel_automatizacion: NivelAutomatizacion;
  campos_obligatorios: string[];
  campos_deseables: string[];
  caducidad_meses?: number;
}

export interface FichaMunicipalResumen {
  codigo_ine: string;
  denominacion: string;
  provincia: string;
  comunidad_autonoma: string;
  fecha_actualizacion?: string;
  categorias_disponibles: CategoriaINCideas[];
  categorias_incompletas: CategoriaINCideas[];
  categorias_sin_datos: CategoriaINCideas[];
  fuentes_activas: number;
  fuentes_con_errores: number;
  registros_automaticos_sin_revisar: number;
  registros_validados: number;
  registros_obsoletos: number;
  registros_conflictivos: number;
  alertas_calidad: number;
}
