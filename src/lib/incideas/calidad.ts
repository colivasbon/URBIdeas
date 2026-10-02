// INCideas — Calidad del dato: confianza, completitud y carencias.
//
// Funciones puras, sin acceso a la base de datos, para poder probarlas de forma aislada.

import {
  CATEGORIAS_INVENTARIO,
  familiaLegible,
  ESTADOS_LEGIBLES,
} from "./catalogo";

/** Campos que el contrato de salida considera imprescindibles en cada registro. */
export const CAMPOS_CLAVE = [
  "nombre_oficial",
  "subcategoria",
  "coordenadas",
  "direccion",
  "telefono_publico",
  "web",
  "horario",
  "titularidad",
  "gestor",
  "capacidad",
] as const;

export interface DesgloseConfianza {
  total: number;
  criterios: { criterio: string; puntos: number }[];
}

export interface EntradaConfianza {
  tipo_fuente?: string | null;
  fecha_dato?: string | null;
  referencia?: string;
  campos_con_valor?: number;
  fuentes_coincidentes?: number;
  estado_espacial?: string | null;
  exige_coordenadas?: boolean;
}

/**
 * Puntuación de 0 a 100. Todos los criterios son verificables sobre el propio
 * registro y el desglose acompaña a la cifra para que sea auditable.
 *
 *   Procedencia            +35 oficial, +20 municipal u operador, +10 colaborativa
 *   Integridad de campos   hasta +30, proporcional a los campos clave con valor
 *   Antigüedad             +20 menos de un año, +10 menos de tres, 0 sin fecha
 *   Coincidencia           +15 si dos fuentes independientes lo confirman
 *   Ubicación              -20 fuera del término o coordenadas sospechosas,
 *                          -10 sin coordenadas cuando debería tenerlas
 */
export function punctuacionConfianza(e: EntradaConfianza): DesgloseConfianza {
  const criterios: { criterio: string; puntos: number }[] = [];

  const tipo = (e.tipo_fuente ?? "").toLowerCase();
  let procedencia = 0;
  if (tipo.startsWith("oficial_")) procedencia = 35;
  else if (["municipal", "operador", "declaracion_municipal"].includes(tipo)) procedencia = 20;
  else if (tipo === "colaborativa") procedencia = 10;
  else if (tipo === "elaboracion_propia" || tipo === "estimacion_tecnica") procedencia = 5;
  criterios.push({ criterio: "Procedencia de la fuente", puntos: procedencia });

  const conValor = e.campos_con_valor ?? 0;
  criterios.push({
    criterio: "Integridad de campos",
    puntos: Math.round((conValor / CAMPOS_CLAVE.length) * 30),
  });

  let antiguedad = 0;
  if (e.fecha_dato) {
    const ref = new Date(e.referencia ?? Date.now()).getTime();
    const meses = (ref - new Date(e.fecha_dato).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    if (meses < 12) antiguedad = 20;
    else if (meses < 36) antiguedad = 10;
  }
  criterios.push({ criterio: "Antiguedad del dato", puntos: antiguedad });

  criterios.push({
    criterio: "Coincidencia entre fuentes",
    puntos: (e.fuentes_coincidentes ?? 1) >= 2 ? 15 : 0,
  });

  let ubicacion = 0;
  if (e.estado_espacial === "fuera_municipio") ubicacion = -20;
  else if (e.estado_espacial === "coordenadas_sospechosas") ubicacion = -20;
  else if (e.estado_espacial === "sin_geometria" && e.exige_coordenadas !== false) ubicacion = -10;
  criterios.push({ criterio: "Ubicacion espacial", puntos: ubicacion });

  const total = Math.max(0, Math.min(100, criterios.reduce((s, c) => s + c.puntos, 0)));
  return { total, criterios };
}

type RegistroResumible = {
  nombre_oficial?: string | null;
  subcategoria?: string | null;
  coordenadas?: unknown;
  direccion?: string | null;
  telefono_publico?: string | null;
  web?: string | null;
  horario?: string | null;
  titularidad?: string | null;
  gestor?: string | null;
  capacidad?: number | null;
};

/** Campos clave que faltan en un registro. Base de la hoja de carencias. */
export function camposQueFaltan(r: RegistroResumible): string[] {
  const fuera: string[] = [];
  if (!r.nombre_oficial?.trim()) fuera.push("nombre_oficial");
  if (!r.subcategoria) fuera.push("subcategoria");
  if (!r.coordenadas) fuera.push("coordenadas");
  if (!r.direccion) fuera.push("direccion");
  if (!r.telefono_publico) fuera.push("telefono_publico");
  if (!r.web) fuera.push("web");
  if (!r.horario) fuera.push("horario");
  if (!r.titularidad) fuera.push("titularidad");
  if (!r.gestor) fuera.push("gestor");
  if (r.capacidad === null || r.capacidad === undefined) fuera.push("capacidad");
  return fuera;
}

/** Un nombre se considera utilizable si no es solo un número ni un texto vacío. */
export function nombreUtilizable(nombre: string | null | undefined): boolean {
  const v = (nombre ?? "").trim();
  if (!v) return false;
  if (/^[0-9.,\s]+$/.test(v)) return false;
  return v.length > 1;
}

export function porcentaje(parte: number, total: number): number {
  return total === 0 ? 0 : Math.round((parte / total) * 100);
}

export interface FilaResumen {
  categoria: string;
  subcategoria: string | null;
  tipo: string;
  familia: string;
  registros: number;
  con_coordenadas: number;
  con_nombre_util: number;
  con_telefono: number;
  con_horario: number;
  con_capacidad: number;
  confianza_media: number;
}

export interface ResumenMunicipio {
  total_registros: number;
  con_coordenadas: number;
  pct_con_coordenadas: number;
  con_nombre_util: number;
  pct_con_nombre_util: number;
  con_telefono: number;
  pct_con_telefono: number;
  con_horario: number;
  pct_con_horario: number;
  con_capacidad: number;
  pct_con_capacidad: number;
  confianza_media: number;
  por_categoria: FilaResumen[];
  semaforo: Record<string, "verde" | "ambar" | "rojo">;
  /** Categorías del inventario sin ningún registro. */
  categorias_vacias: string[];
}

/** Umbrales del semáforo. Verde a partir del 70 %, ámbar a partir del 30 %. */
export const UMBRAL_SEMAFORO = { verde: 70, ambar: 30 } as const;

export function resumenMunicipio(filas: readonly FilaResumen[]): ResumenMunicipio {
  const total = filas.reduce((s, f) => s + f.registros, 0);
  const suma = (sel: (f: FilaResumen) => number) => filas.reduce((s, f) => s + sel(f), 0);

  const semaforo: ResumenMunicipio["semaforo"] = {};
  const vacias: string[] = [];
  for (const categoria of CATEGORIAS_INVENTARIO) {
    const propias = filas.filter((f) => f.categoria === categoria);
    const n = propias.reduce((s, f) => s + f.registros, 0);
    if (n === 0) {
      semaforo[categoria] = "rojo";
      vacias.push(categoria);
      continue;
    }
    const pct = porcentaje(
      propias.reduce((s, f) => s + f.con_coordenadas, 0),
      n
    );
    semaforo[categoria] =
      pct >= UMBRAL_SEMAFORO.verde ? "verde" : pct >= UMBRAL_SEMAFORO.ambar ? "ambar" : "rojo";
  }

  const ordenadas = [...filas].sort((a, b) =>
    a.categoria === b.categoria
      ? b.registros - a.registros
      : a.categoria.localeCompare(b.categoria, "es")
  );

  return {
    total_registros: total,
    con_coordenadas: suma((f) => f.con_coordenadas),
    pct_con_coordenadas: porcentaje(suma((f) => f.con_coordenadas), total),
    con_nombre_util: suma((f) => f.con_nombre_util),
    pct_con_nombre_util: porcentaje(suma((f) => f.con_nombre_util), total),
    con_telefono: suma((f) => f.con_telefono),
    pct_con_telefono: porcentaje(suma((f) => f.con_telefono), total),
    con_horario: suma((f) => f.con_horario),
    pct_con_horario: porcentaje(suma((f) => f.con_horario), total),
    con_capacidad: suma((f) => f.con_capacidad),
    pct_con_capacidad: porcentaje(suma((f) => f.con_capacidad), total),
    confianza_media:
      total === 0
        ? 0
        : Math.round(filas.reduce((s, f) => s + f.confianza_media * f.registros, 0) / total),
    por_categoria: ordenadas,
    semaforo,
    categorias_vacias: vacias,
  };
}

// ---------------------------------------------------------------------------
// Carencias
// ---------------------------------------------------------------------------

export interface Carencia {
  categoria: string;
  familia: string;
  falta: string;
  motivo: string;
  responsable: string;
  accion: string;
  registros_afectados: number;
}

const RESPONSABLE_POR_CATEGORIA: Record<string, string> = {
  territorio: "Ayuntamiento (urbanismo) e Instituto Geográfico Nacional",
  poblacion: "Instituto Nacional de Estadística y ayuntamiento",
  necesidades_especiales: "Ayuntamiento (servicios sociales) y autoridad sanitaria",
  animales: "Ayuntamiento (protección animal) y asociaciones de protección animal",
  infraestructuras: "Ayuntamiento (obras y movilidad) y operadores de transporte",
  equipamientos: "Consejerías competentes y titulares de los equipamientos",
  servicios_basicos: "Entidades suministradoras de agua, electricidad, gas y residuos",
  riesgos:
    "Ministerio para la Transición Ecológica y órgano competente en medio ambiente",
  medios_recursos: "Ayuntamiento (servicio municipal de protección civil)",
  evacuacion: "Ayuntamiento (protección civil) y comunidad autónoma",
};

export function responsablePorCategoria(categoria: string): string {
  return RESPONSABLE_POR_CATEGORIA[categoria] ?? "Ayuntamiento";
}

interface Defecto {
  falta: string;
  motivo: string;
  accion: string;
}

/**
 * Lo que las fuentes abiertas no publican. Se declara por categoría, con el motivo
 * y la acción. No se estima ningún valor: lo que no se puede obtener se enumera.
 */
export const DEFECTOS_POR_CATEGORIA: Record<string, Defecto[]> = {
  territorio: [
    {
      falta: "Núcleos aislados o con un único vial de acceso",
      motivo:
        "No hay fuente que lo detecte de forma fiable a escala de municipio.",
      accion:
        "Trabajo municipal de campo, con ayuda de la red viaria y de la población diseminada descritas en el Plan Territorial Municipal.",
    },
  ],
  poblacion: [
    {
      falta: "Población máxima estacional por núcleo",
      motivo:
        "El padrón recoge población residente. La estacional hay que solicitarla.",
      accion:
        "Solicitar al ayuntamiento la estimación de población máxima estacional que consta en el Plan Territorial Municipal.",
    },
  ],
  necesidades_especiales: [
    {
      falta: "Población con movilidad reducida o dependencia por zona urbana",
      motivo:
        "Solo se publican datos agregados por comunidad autónoma, no por zona del municipio.",
      accion:
        "Solicitar al ayuntamiento el número de personas en Teleasistencia y las plazas de centros de día por zona.",
    },
    {
      falta: "Relación de personas electrodependientes",
      motivo:
        "Es un dato de salud personal protegido. Solo la autoridad sanitaria puede facilitarlo, y de forma agregada.",
      accion:
        "Pedir a la autoridad sanitaria el número agregado por zona, nunca la relación nominal.",
    },
  ],
  animales: [
    {
      falta: "Centros de acogida de animales y su capacidad de acogida",
      motivo:
        "La red de veterinarios municipal y las asociaciones no publican un inventario abierto.",
      accion:
        "Contactar con el servicio municipal de protección animal y con las asociaciones del municipio.",
    },
  ],
  infraestructuras: [
    {
      falta: "Aforo de las vías de comunicación y estado de los puentes",
      motivo: "El Mapa de Tráfico y la red de carreteras autonómica no publican atributos en datos abiertos.",
      accion: "Solicitar al titular de cada vía el aforo y el estado de sus estructuras.",
    },
  ],
  equipamientos: [
    {
      falta: "Aforo o capacidad de admisión de cada centro",
      motivo:
        "Ninguna fuente abierta nacional publica el aforo de centros educativos, sanitarios, deportivos o de ocio.",
      accion:
        "Solicitar al ayuntamiento la lista de centros con aforo y ocupación media, y a cada centro directamente.",
    },
    {
      falta: "Número de personas que trabajan en cada centro",
      motivo:
        "El registro de centros docentes no difunde la plantilla y la red sanitaria solo publica datos agregados.",
      accion: "Pedir a la consejería competente y a cada centro la relación de plantilla.",
    },
    {
      falta: "Condiciones de accesibilidad de cada establecimiento",
      motivo: "No existe fuente nacional con este detalle por establecimiento.",
      accion:
        "Solicitar al ayuntamiento la declaración responsable de accesibilidad de los edificios públicos y comprobar los privados en trabajo de campo.",
    },
    {
      falta: "Horario de atención al público",
      motivo:
        "Las fuentes oficiales no lo publican de forma sistemática y OpenStreetMap lo tiene en menos de la mitad de los casos.",
      accion: "Recoger en trabajo de campo o solicitar a cada centro.",
    },
  ],
  servicios_basicos: [
    {
      falta: "Hidrantes y puntos de agua para incendios",
      motivo:
        "OpenStreetMap no tiene hidrantes mapeados en la mayoria de los terminos y no hay ninguna fuente abierta que los publique.",
      accion:
        "Pedir al servicio municipal de aguas la relacion de hidrantes con su numero, calibre y situacion, con plano de la red.",
    },
    {
      falta: "Capacidad de depósitos y de las estaciones de tratamiento y depuración",
      motivo: "Las entidades suministradoras no publican el inventario en datos abiertos.",
      accion: "Solicitar a la entidad suministradora y a la empresa de saneamiento su inventario y capacidad.",
    },
    {
      falta: "Centros de transformación y subestaciones",
      motivo:
        "La red eléctrica es de competencia estatal y su cartografía no es de acceso público.",
      accion: "Solicitar a la distribuidora eléctrica la relación de instalaciones y su ubicación.",
    },
  ],
  riesgos: [
    {
      falta: "Zonas con riesgo de inundación, zona de flujo preferente y puntos conflictivos",
      motivo:
        "La cartografía de riesgo se publica en el visor del Ministerio, pero no hay servicio de atributos abierto que permita la extracción masiva.",
      accion:
        "Descargar el GeoPackage de cada demarcación hidrográfica del visor y geolocalizar los elementos afectados.",
    },
    {
      falta: "Peligrosidad y riesgo de incendio forestal",
      motivo: "El Ministerio publica mapas en imagen, no en formato con atributos.",
      accion:
        "Digitalizar los mapas de peligrosidad por término municipal y cruzarlos con los elementos del inventario.",
    },
    {
      falta: "Empresas con sustancias peligrosas y sus productos",
      motivo: "El registro de establecimientos con actividades peligrosas no se publica en datos abiertos.",
      accion: "Solicitar al órgano competente en medio ambiente la relación de establecimientos autorizados.",
    },
  ],
  medios_recursos: [
    {
      falta: "Vehículos, maquinaria, personal y material de los servicios municipales",
      motivo: "El inventario de medios de protección civil municipal no se publica en ninguna base abierta.",
      accion:
        "Solicitar al servicio municipal de protección civil el inventario de medios, con numero, tipo y situacion operativa.",
    },
  ],
  evacuacion: [
    {
      falta: "Albergues con su capacidad, camas, duchas y plazas de comedor",
      motivo:
        "La guía nacional de albergues se publica en papel y sin coordenadas ni atributos de detalle en datos abiertos.",
      accion:
        "Pedir al ayuntamiento el catálogo de centros de acogida y contactar con cada uno para el número de plazas y si dispone de duchas y comedor.",
    },
    {
      falta: "Puntos de encuentro y sectores de evacuacion",
      motivo: "Es una decisión municipal que se toma en el plan de emergencia. Ninguna fuente abierta la publica.",
      accion: "Trabajo municipal junto a la comunidad autónoma para trazar sectores y fijar puntos de encuentro.",
    },
  ],
};

/**
 * Construye la hoja de carencias del municipio: por categoría, qué no se ha podido
 * obtener, por que, a quien hay que pedirlo y quantos registros quedan afectados.
 */
export function construirCarencias(registrosPorCategoria: Map<string, number>): Carencia[] {
  const out: Carencia[] = [];
  for (const [categoria, defectos] of Object.entries(DEFECTOS_POR_CATEGORIA)) {
    const n = registrosPorCategoria.get(categoria) ?? 0;
    const familia = familiaLegibleDeCategoria(categoria);
    for (const d of defectos) {
      out.push({
        categoria,
        familia,
        falta: d.falta,
        motivo: d.motivo,
        responsable: responsablePorCategoria(categoria),
        accion: d.accion,
        registros_afectados: n,
      });
    }
  }
  return out;
}

/** Familia de una categoría, para agrupar las carencias en la hoja. */
export function familiaLegibleDeCategoria(categoria: string): string {
  const nombres: Record<string, string> = {
    territorio: "Situación geográfica y núcleos",
    poblacion: "Población",
    necesidades_especiales: "Población vulnerable",
    animales: "Recursos veterinarios",
    infraestructuras: "Transportes y vías de comunicación",
    equipamientos: "Equipamientos y servicios",
    servicios_basicos: "Abastecimiento y servicios básicos",
    riesgos: "Riesgos",
    medios_recursos: "Medios y recursos",
    evacuacion: "Evacuación y albergue",
  };
  return nombres[categoria] ?? familiaLegible(categoria);
}

/** Estado de validación en castellano, con reserva. */
export function estadoLegible(estado: string | null | undefined): string {
  const v = (estado ?? "").trim();
  return ESTADOS_LEGIBLES[v] ?? (v || "Sin estado");
}