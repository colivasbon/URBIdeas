// INCideas — Catálogo de rótulos legibles.
//
// El modelo guarda categorías y subcategorías como identificadores internos
// (`parada_autobus`, `estacion_servicio`). Esos identificadores no sirven en un
// documento dirigido a un técnico municipal. Este módulo traduce cada uno a su
// rótulo en castellano y añade el "tipo legible" que pide el contrato de salida:
// el nombre de la clase del elemento tal y como lo nombra el Plan Territorial
// Municipal (por ejemplo, «hidrante», «depósito», «centro social»).
//
// Cuando el documento de referencia y este catálogo discrepen, prevalece el
// documento. Los rótulos marcados con `ptm` están tomados literalmente de las
// tablas del Plan Territorial Municipal de Benidorm.

import type { CategoriaINCideas } from "./types";

export interface RotuloSubcategoria {
  /** Nombre en castellano, como aparece en el Plan Territorial Municipal. */
  tipo: string;
  /** Familia gruesa, útil para agrupar en la hoja de carencias. */
  familia: string;
  /** Apartado del Plan Territorial Municipal donde encaja. */
  apartado?: string;
  /** Quién puede aportar el dato que falta, si el dato no es obtenible de forma automática. */
  responsable_dato?: string;
}

/** Apartados del Plan Territorial Municipal de referencia. */
export const APARTADOS_PTM: Record<string, string> = {
  territorio: "2.1 a 2.3 — Situación geográfica, superficie y población",
  poblacion: "2.3 — Población y núcleos habitados",
  necesidades_especiales: "2.3.2 — Población vulnerable",
  animales: "Anexo II — Medios y recursos",
  infraestructuras: "2.4 — Infraestructuras y vías de comunicación",
  equipamientos: "2.7 — Equipamientos con afluencia de público",
  servicios_basicos: "2.6 — Servicios básicos",
  riesgos: "3.1 — Riesgos en el término municipal",
  medios_recursos: "Anexo II — Directorio y catálogo de medios y recursos",
  evacuacion: "5.9 — Plan de evacuación",
};

/**
 * Rótulos de subcategoría. La clave es la subcategoría; el valor, el tipo legible.
 * Cuando la clave no está aquí, el tipo se compone con el diccionario de
 * `categorias` sustituyendo la raya baja por un espacio.
 */
export const TIPOS: Record<string, RotuloSubcategoria> = {
  // --- territorio -----------------------------------------------------------
  limite_municipal: { tipo: "Límite municipal", familia: "Límites", apartado: "2.1" },
  partida: {
    tipo: "Partida",
    familia: "Núcleos de población",
    apartado: "2.3",
    responsable_dato: "Ayuntamiento (relación de partidas y districts)",
  },

  // --- poblacion ------------------------------------------------------------
  padron: { tipo: "Padrón municipal", familia: "Padrón", apartado: "2.3" },

  // --- necesidades especiales ------------------------------------------------
  movilidad_reducida: {
    tipo: "Personas con movilidad reducida",
    familia: "Población vulnerable",
    responsable_dato: "Ayuntamiento (servicios sociales)",
  },
  teleasistencia: {
    tipo: "Teleasistencia domiciliaria",
    familia: "Población vulnerable",
    responsable_dato: "Ayuntamiento (servicios sociales) y empresa adjudicataria",
  },

  // --- animales -------------------------------------------------------------
  clinica_veterinaria: {
    tipo: "Clínica veterinaria",
    familia: "Recursos veterinarios",
    responsable_dato: "Colegio oficial de veterinarios y ayuntamiento",
  },
  centro_acogida_animal: {
    tipo: "Centro de acogida de animales",
    familia: "Recursos veterinarios",
    responsable_dato: "Ayuntamiento (protección animal)",
  },

  // --- infraestructuras -----------------------------------------------------
  parada_autobus: { tipo: "Parada de autobús", familia: "Transporte público", apartado: "2.4" },
  estacion_autobus: { tipo: "Estación de autobuses", familia: "Transporte público", apartado: "2.4" },
  parada_tranvia: { tipo: "Parada de tranvía", familia: "Transporte público", apartado: "2.4" },
  estacion_ferrocarril: { tipo: "Estación de ferrocarril", familia: "Transporte público", apartado: "2.4" },
  parada_taxi: { tipo: "Parada de taxi", familia: "Transporte público", apartado: "2.4" },
  puerto: { tipo: "Puerto", familia: "Transporte público", apartado: "2.4" },
  helipuerto: { tipo: "Helipuerto", familia: "Transporte público", apartado: "2.4" },
  carretera: { tipo: "Carretera", familia: "Vías de comunicación", apartado: "2.4" },
  camino: { tipo: "Camino", familia: "Vías de comunicación", apartado: "2.4" },
  ferrocarril: { tipo: "Línea de ferrocarril", familia: "Vías de comunicación", apartado: "2.4" },
  puente: { tipo: "Puente", familia: "Vías de comunicación", apartado: "2.4" },
  tunel: { tipo: "Túnel", familia: "Vías de comunicación", apartado: "2.4" },
  paso_a_nivel: { tipo: "Paso a nivel", familia: "Vías de comunicación", apartado: "2.4" },
  via_publica: { tipo: "Vía pública", familia: "Vías de comunicación", apartado: "2.4" },
  parking: { tipo: "Parking", familia: "Aparcamiento", apartado: "2.4" },

  // --- equipamientos --------------------------------------------------------
  hospital: { tipo: "Hospital", familia: "Sanidad", apartado: "2.7" },
  centro_salud: { tipo: "Centro de salud", familia: "Sanidad", apartado: "2.7" },
  centro_especialidades: { tipo: "Centro de especialidades", familia: "Sanidad", apartado: "2.7" },
  consultorio: { tipo: "Consultorio", familia: "Sanidad", apartado: "2.7" },
  farmacia: { tipo: "Farmacia", familia: "Sanidad", apartado: "2.7" },
  residencia_mayores: { tipo: "Residencia de mayores", familia: "Sanidad", apartado: "2.7" },
  colegio: { tipo: "Colegio de educación infantil y primaria", familia: "Educación", apartado: "2.7" },
  instituto: { tipo: "Instituto de educación secundaria", familia: "Educación", apartado: "2.7" },
  escuela_infantil: { tipo: "Escuela infantil", familia: "Educación", apartado: "2.7" },
  educacion_especial: { tipo: "Centro de educación especial", familia: "Educación", apartado: "2.7" },
  centro_formacion: {
    tipo: "Centro de formación",
    familia: "Educación",
    apartado: "2.7",
    responsable_dato: "Consellería de Educación (Registro de Centros Docentes)",
  },
  universidad: { tipo: "Universidad", familia: "Educación", apartado: "2.7" },
  biblioteca: { tipo: "Biblioteca", familia: "Cultura", apartado: "2.7" },
  museo: { tipo: "Museo", familia: "Cultura", apartado: "2.7" },
  teatro: { tipo: "Teatro", familia: "Cultura", apartado: "2.7" },
  cine: { tipo: "Cine", familia: "Cultura", apartado: "2.7" },
  centro_cultural: { tipo: "Centro cultural", familia: "Cultura", apartado: "2.7" },
  mercado: { tipo: "Mercado", familia: "Abastecimiento", apartado: "2.7" },
  alimentacion: {
    tipo: "Establecimiento de alimentación",
    familia: "Abastecimiento",
    apartado: "2.7",
    responsable_dato: "Ayuntamiento (licencias de actividad)",
  },
  alojamiento: { tipo: "Alojamiento", familia: "Alojamiento y turismo", apartado: "2.7" },
  camping: { tipo: "Camping", familia: "Alojamiento y turismo", apartado: "2.7" },
  hotel: { tipo: "Hotel", familia: "Alojamiento y turismo", apartado: "2.7" },
  hostel: { tipo: "Hostal", familia: "Alojamiento y turismo", apartado: "2.7" },
  piscina: { tipo: "Piscina", familia: "Deporte", apartado: "2.7" },
  pista_deportiva: { tipo: "Pista deportiva", familia: "Deporte", apartado: "2.7" },
  instalacion_deportiva: { tipo: "Instalación deportiva", familia: "Deporte", apartado: "2.7" },
  centro_deportivo: { tipo: "Centro deportivo", familia: "Deporte", apartado: "2.7" },
  campo_de_golf: { tipo: "Campo de golf", familia: "Deporte", apartado: "2.7" },
  centro_comunitario: { tipo: "Centro comunitario", familia: "Servicios sociales", apartado: "2.7" },
  centro_social: { tipo: "Centro social", familia: "Servicios sociales", apartado: "2.7" },
  servicios_sociales: {
    tipo: "Servicio social",
    familia: "Servicios sociales",
    apartado: "2.7",
    responsable_dato: "Ayuntamiento (concejalía de Servicios Sociales)",
  },
  residencia: { tipo: "Residencia", familia: "Servicios sociales", apartado: "2.7" },
  centro_de_dia: { tipo: "Centro de día", familia: "Servicios sociales", apartado: "2.7" },
  administracion: { tipo: "Centro administrativo", familia: "Administración", apartado: "2.8" },
  ayuntamiento: { tipo: "Ayuntamiento", familia: "Administración", apartado: "2.8" },
  justicia: { tipo: "Sede judicial", familia: "Administración", apartado: "2.8" },
  policia: { tipo: "Policía", familia: "Seguridad", apartado: "2.8" },
  bomberos: {
    tipo: "Parque de bomberos",
    familia: "Seguridad",
    apartado: "2.8",
    responsable_dato: "Consellería competente y Servicio Municipal de Protección Civil",
  },
  guardia_civil: { tipo: "Puesto de la Guardia Civil", familia: "Seguridad", apartado: "2.8" },
  proteccion_civil: { tipo: "Protección Civil", familia: "Seguridad", apartado: "2.8" },
  lugar_culto: { tipo: "Lugar de culto", familia: "Religión", apartado: "2.7" },
  cementerio: { tipo: "Cementerio", familia: "Servicios funerarios", apartado: "2.7" },

  // --- servicios básicos ----------------------------------------------------
  estacion_servicio: { tipo: "Estación de servicio", familia: "Combustibles", apartado: "2.6" },
  punto_recarga: { tipo: "Punto de recarga eléctrica", familia: "Combustibles", apartado: "2.6" },
  hidrante: {
    tipo: "Hidrante",
    familia: "Extinción de incendios",
    apartado: "2.6",
    responsable_dato: "Entidad suministradora de agua potable (plantilla municipal)",
  },
  punto_agua_incendios: {
    tipo: "Punto de agua para incendios",
    familia: "Extinción de incendios",
    responsable_dato: "Entidad suministradora de agua potable (plantilla municipal)",
  },
  deposito_agua: {
    tipo: "Depósito de agua",
    familia: "Abastecimiento",
    apartado: "2.6",
    responsable_dato: "Entidad suministradora de agua potable",
  },
  etap: {
    tipo: "Estación de tratamiento de agua potable",
    familia: "Abastecimiento",
    apartado: "2.6",
    responsable_dato: "Entidad suministradora de agua potable",
  },
  edar: {
    tipo: "Estación de depuración de aguas residuales",
    familia: "Saneamiento",
    apartado: "2.6",
    responsable_dato: "Entidad de saneamiento",
  },
  subestacion: {
    tipo: "Subestación eléctrica",
    familia: "Electricidad",
    apartado: "2.6",
    responsable_dato: "Distribuidora eléctrica",
  },
  centro_transformacion: {
    tipo: "Centro de transformación",
    familia: "Electricidad",
    apartado: "2.6",
    responsable_dato: "Distribuidora eléctrica (plantilla municipal)",
  },
  gasoducto: { tipo: "Gasoducto", familia: "Gas", apartado: "2.6" },
  antena: { tipo: "Antena de telecomunicaciones", familia: "Telecomunicaciones", apartado: "2.6" },
  planta_residuos: {
    tipo: "Planta de tratamiento de residuos",
    familia: "Residuos",
    apartado: "2.6",
    responsable_dato: "Entidad de gestión de residuos",
  },
  punto_limpio: { tipo: "Punto limpio", familia: "Residuos", apartado: "2.6" },
  contenedor: { tipo: "Contenedor de residuos", familia: "Residuos", apartado: "2.6" },

  // --- riesgos --------------------------------------------------------------
  riesgo_inundacion: {
    tipo: "Zona con riesgo de inundación",
    familia: "Inundaciones",
    apartado: "3.1",
    responsable_dato: "Ministerio para la Transición Ecológica (SNCZI) y, en la Comunitat Valenciana, la PATRICOVA",
  },
  riesgo_incendio_forestal: {
    tipo: "Zona con riesgo de incendio forestal",
    familia: "Incendios forestales",
    apartado: "3.1",
    responsable_dato: "Ministerio para la Transición Ecológica (mapas de peligrosidad)",
  },
  riesgo_sismico: {
    tipo: "Zona con riesgo sísmico",
    familia: "Sísmico",
    apartado: "3.1",
    responsable_dato: "Instituto Geográfico Nacional",
  },
  empresa_peligrosa: {
    tipo: "Empresa con sustancias peligrosas",
    familia: "Mercancías peligrosas",
    apartado: "3.1",
    responsable_dato: "Consejería competente en medio ambiente",
  },
  zona_industrial: { tipo: "Zona o polígono industrial", familia: "Usos del suelo", apartado: "2.5" },
  actividad_minera: {
    tipo: "Actividad minera",
    familia: "Usos del suelo",
    apartado: "2.5",
    responsable_dato: "Consejería competente en industria y minas",
  },

  // --- medios y recursos ----------------------------------------------------
  cecopal: {
    tipo: "Centro de Coordinación Operativa Municipal",
    familia: "Estructura de respuesta",
    apartado: "Anexo II",
    responsable_dato: "Ayuntamiento (servicio municipal de protección civil)",
  },
  pma: {
    tipo: "Puesto de Mando Avanzado",
    familia: "Estructura de respuesta",
    apartado: "Anexo II",
    responsable_dato: "Ayuntamiento (servicio municipal de protección civil)",
  },
  crm: {
    tipo: "Centro de Recepción de Medios",
    familia: "Estructura de respuesta",
    apartado: "Anexo II",
    responsable_dato: "Ayuntamiento (servicio municipal de protección civil)",
  },
  centro_comunicaciones: {
    tipo: "Centro de Comunicaciones",
    familia: "Estructura de respuesta",
    apartado: "Anexo II",
    responsable_dato: "Ayuntamiento (servicio municipal de protección civil)",
  },
  vehiculo: {
    tipo: "Vehículo municipal",
    familia: "Medios materiales",
    apartado: "Anexo II",
    responsable_dato: "Ayuntamiento (inventario de medios)",
  },
  maquinaria: {
    tipo: "Maquinaria municipal",
    familia: "Medios materiales",
    apartado: "Anexo II",
    responsable_dato: "Ayuntamiento (inventario de medios)",
  },
  desfibrilador: {
    tipo: "Desfibrilador externo automático",
    familia: "Medios materiales",
    apartado: "Anexo II",
    responsable_dato: "Consejería competente en sanidad (registro autonómico de desfibriladores)",
  },
  base_ambulancias: {
    tipo: "Base de ambulancias",
    familia: "Estructura de respuesta",
    apartado: "Anexo II",
    responsable_dato: "Consejería competente en sanidad",
  },
  puesto_socorrismo: {
    tipo: "Puesto de socorrismo",
    familia: "Medios materiales",
    apartado: "Anexo II",
    responsable_dato: "Ayuntamiento (servicio municipal de protección civil)",
  },
  agrupacion_voluntaria: {
    tipo: "Agrupación de voluntariado",
    familia: "Estructura de respuesta",
    apartado: "Anexo II",
    responsable_dato: "Ayuntamiento y asociaciones de voluntariado",
  },

  // --- evacuación -----------------------------------------------------------
  punto_encuentro: {
    tipo: "Punto de encuentro",
    familia: "Evacuación",
    apartado: "5.9",
    responsable_dato: "Trabajo municipal junto a la comunidad autónoma",
  },
  sector_evacuacion: {
    tipo: "Sector de evacuación",
    familia: "Evacuación",
    apartado: "5.9",
    responsable_dato: "Trabajo municipal con la comunidad autónoma",
  },
  albergue: {
    tipo: "Albergue",
    familia: "Evacuación",
    apartado: "5.9",
    responsable_dato: "Ayuntamiento y RED (Red Española de Albergues)",
  },
  centro_acogida: {
    tipo: "Centro de acogida",
    familia: "Evacuación",
    apartado: "5.9",
    responsable_dato: "Ayuntamiento y servicios sociales",
  },
  ruta_evacuacion: {
    tipo: "Ruta de evacuación",
    familia: "Evacuación",
    apartado: "5.9",
    responsable_dato: "Trabajo municipal con la comunidad autónoma",
  },
};

/** Categorías que forman el inventario del municipio, en el orden del libro. */
export const CATEGORIAS_INVENTARIO: CategoriaINCideas[] = [
  "territorio",
  "poblacion",
  "necesidades_especiales",
  "animales",
  "infraestructuras",
  "equipamientos",
  "servicios_basicos",
  "riesgos",
  "medios_recursos",
  "evacuacion",
];

/** Tipo legible de una subcategoría, con reserva por si no está en el catálogo. */
export function tipoLegible(subcategoria: string | null | undefined): string {
  const clave = (subcategoria ?? "").trim();
  if (!clave) return "Sin clasificar";
  const directo = TIPOS[clave];
  if (directo) return directo.tipo;
  // Reserva: "centro_social" → "Centro social"
  const palabras = clave.replace(/_/g, " ").trim();
  return palabras.charAt(0).toUpperCase() + palabras.slice(1);
}

/** Familia de una subcategoría, usada para agrupar carencias. */
export function familiaLegible(subcategoria: string | null | undefined): string {
  const clave = (subcategoria ?? "").trim();
  return TIPOS[clave]?.familia ?? "Sin familia";
}

/** Apartado del Plan Territorial Municipal que corresponde a una subcategoría. */
export function apartadoPtm(subcategoria: string | null | undefined): string {
  const clave = (subcategoria ?? "").trim();
  return TIPOS[clave]?.apartado ?? "";
}

/** A quién hay que pedir el dato cuando la fuente automática no lo aporta. */
export function responsableDato(subcategoria: string | null | undefined): string {
  const clave = (subcategoria ?? "").trim();
  return TIPOS[clave]?.responsable_dato ?? "";
}

/** Titularidad en castellano normalizada a tres valores. */
export function titularidadLegible(valor: string | null | undefined): string {
  const v = (valor ?? "").trim().toLowerCase();
  if (!v) return "";
  if (/public|pubica|ayuntamiento|municipal|administracion|generalitat|estado|autonom/.test(v))
    return "Pública";
  if (/mixt|concertad/.test(v)) return "Mixta (concertada)";
  if (/privad|privat/.test(v)) return "Privada";
  return valor ?? "";
}

/** Estado de validación en castellano. */
export const ESTADOS_LEGIBLES: Record<string, string> = {
  automatico_sin_revisar: "Automático, sin revisar",
  contrastado: "Contrastado con fuente municipal",
  validado_tecnicamente: "Validado técnicamente",
  validado_ayuntamiento: "Validado por el ayuntamiento",
  incompleto: "Incompleto",
  conflictivo: "Conflictivo",
  potencialmente_obsoleto: "Potencialmente obsoleto",
  no_disponible: "No disponible",
  restringido: "Restringido",
  estimado: "Estimado",
  pendiente_municipal: "Pendiente de datos municipales",
};

/** Estado espacial en castellano. */
export const ESTADOS_ESPACIALES_LEGIBLES: Record<string, string> = {
  valido: "Dentro del término municipal",
  fuera_municipio: "Fuera del término municipal",
  proximo_limite: "Dentro, a menos de 250 m del límite",
  sin_geometria: "Sin coordenadas",
  geometria_invalida: "Coordenadas no válidas",
  coordenadas_sospechosas: "Coordenadas con ejes intercambiados",
  localizacion_aproximada: "Ubicación aproximada",
};

/** Precisión de la geolocalización en castellano. */
export const PRECISION_LEGIBLE: Record<string, string> = {
  punto: "Punto",
  punto_verificado: "Punto verificado en campo",
  centroide_edificio: "Centroide del edificio",
  centroide_municipio: "Centroide del municipio",
  sin_ubicacion: "Sin ubicación precisa",
};

/** Estado espacial en castellano, con reserva. */
export function estadoEspacialLegible(estado: string | null | undefined): string {
  const v = (estado ?? "").trim();
  return ESTADOS_ESPACIALES_LEGIBLES[v] ?? (v || "Sin situacion");
}

/** Precisión de la geolocalización en castellano, con reserva. */
export function precisionLegible(precision: string | null | undefined): string {
  const v = (precision ?? "").trim();
  return PRECISION_LEGIBLE[v] ?? (v || "Sin precisión");
}
