// INCideas — Correcciones de dato en tiempo de lectura.
//
// Dos correcciones que la auditoría detectó y que este módulo aplica al LEER, sin
// escribir en la base de datos:
//
//  1. Sistema de referencia de origen mal declarado. Las filas que provienen de la
//     plantilla municipal se guardaron declarando EPSG:4326, pero la plantilla está
//     en UTM 30N (EPSG:25830). Hay que distinguir dos cosas que el modelo confundía:
//
//        · el VALOR de la coordenada, que ya fue reproyectado a grados al importar
//          y es correcto;
//        · la ETIQUETA del sistema de referencia, que es incorrecta.
//
//     Verificado en el municipio 03031: las 199 filas de paradas de autobús tienen
//     coordenadas entre 38,52 y 38,57 de latitud, que son grados, no metros. Lo que
//     falla es la declaración.
//
//  2. Nombre formado solo por un número. Cuarenta y dos registros tienen en
//     `nombre_oficial` un valor numérico ("1", "2", "24", "26"). Se intenta
//     recuperar el nombre real desde las fuentes disponibles y, si no es posible, se
//     marca como «por revisar» en lugar de inventarlo.
//
// Ninguna de las dos correcciones modifica `incideas_registros`. Cuando el usuario
// autorice aplicarlas, se insertan en `incideas_correcciones_propuestas` y la
// bandeja de revisión decide.

// ---------------------------------------------------------------------------
// 1. Sistema de referencia de origen
// ---------------------------------------------------------------------------

/** Fuentes cuya coordenada de origen está en un sistema proyectado, no en grados. */
export const CRS_ORIGEN_PROYECTADO: Record<string, { epsg: string; nombre: string }> = {
  "Plantilla municipal — Limpieza info (PTM Benidorm)": {
    epsg: "EPSG:25830",
    nombre: "ETRS89 UTM 30N",
  },
};

export interface CorreccionCRS {
  /** Sistema de referencia correcto. */
  crs_correcto: string;
  /** Lo que decía antes. */
  crs_declarado: string;
  /** La coordenada almacenada ya estaba en grados y no hay que convertirla. */
  coordenada_ya_corregida: boolean;
  /** Comprobación: la coordenada es coherente con el sistema declarado. */
  verificada: boolean;
}

/**
 * Determina el sistema de referencia de origen real de una fila y dice si su
 * coordenada necesita conversión o solo si le faltaba la etiqueta.
 */
export function corregirCRS(
  fuentePrincipal: string,
  crsDeclarado: string | null,
  coordenadas: { lat: number; lng: number } | null | undefined
): CorreccionCRS {
  const declarado = crsDeclarado ?? "";
  const proyectado = CRS_ORIGEN_PROYECTADO[fuentePrincipal];

  if (proyectado) {
    if (!coordenadas) {
      return {
        crs_correcto: proyectado.epsg,
        crs_declarado: declarado,
        coordenada_ya_corregida: false,
        verificada: false,
      };
    }
    // Una coordenada en grados dentro del ámbito municipal español está entre 27 y 44 de
    // latitud. Si cae fuera, el valor no fue reproyectado y sí hay que convertirlo.
    const enGrados = coordenadas.lat > 27 && coordenadas.lat < 44;
    return {
      crs_correcto: proyectado.epsg,
      crs_declarado: declarado,
      coordenada_ya_corregida: enGrados,
      verificada: enGrados,
    };
  }

  return {
    crs_correcto: declarado || "EPSG:4326",
    crs_declarado: declarado,
    coordenada_ya_corregida: true,
    verificada: true,
  };
}

// ---------------------------------------------------------------------------
// 2. Recuperación de nombres numéricos
// ---------------------------------------------------------------------------

/** Un nombre es numérico si no contiene ninguna letra. */
/**
 * Nombre formado exclusivamente por una o más cifras, sin ninguna otra palabra.
 *
 * Es el criterio que decide si un registro se publica como «Por revisar». Se
 * distingue del test más amplio `esNombreNumerico`, que también acepta listas de
 * cifras como «2, 24, 30, 31»: en el caso de una parada de autobús eso describe las
 * líneas que pasan por ella y es un dato útil, no un nombre perdido.
 */
export function esSoloUnaCifra(nombre: string | null | undefined): boolean {
  const v = (nombre ?? "").trim();
  return v !== "" && /^[0-9]+$/.test(v);
}

export function esNombreNumerico(nombre: string | null | undefined): boolean {
  const v = (nombre ?? "").trim();
  if (!v) return false;
  return !/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(v);
}

export interface IntentoRecuperacion {
  /** Nombre recuperado, o null si no se ha podido. */
  nombre_propuesto: string | null;
  /** De dónde sale el nombre. */
  fuente_propuesta: string;
  /** De 0 a 100. Por debajo de 60 se considera «por revisar». */
  confianza: number;
  /** Por qué se propone o por qué no. */
  motivo: string;
}

export interface ContextoRecuperacion {
  /** Identificador de origen, por ejemplo «node/9246202782» o «partida|3|…». */
  id_origen?: string | null;
  subcategoria?: string | null;
  direccion?: string | null;
  nucleo?: string | null;
  barrio?: string | null;
  distrito?: string | null;
  /** Etiquetas del objeto en OpenStreetMap, si el registro viene de ahí. */
  etiquetas_origen?: Record<string, string> | null;
  /** Datos del Plan Territorial Municipal indexados por nombre o por tipo. */
  ptm_por_tipo?: { tipo: string; nombre: string; direccion?: string | null }[];
}

/**
 * Intenta recuperar el nombre real de un registro cuyo nombre es solo un número.
 *
 * Orden de intento, de más a menos fiable:
 *   1. Etiquetas del propio objeto en OpenStreetMap (`name`, `ref`, `operator`).
 *   2. Encaje con un elemento del Plan Territorial Municipal del mismo tipo cuya
 *      dirección coincide con la del registro.
 *   3. Los atributos de la fila, cuando la clave de importación guardó un nombre en
 *      otro campo (así ocurre con las paradas de autobús de la plantilla).
 *
 * Si ninguno de los tres acierta, devuelve null y el registro se marca «por revisar».
 */
export function recuperarNombre(
  nombreActual: string,
  ctx: ContextoRecuperacion
): IntentoRecuperacion {
  // 1. Etiquetas de OpenStreetMap
  const etiquetas = ctx.etiquetas_origen;
  if (etiquetas) {
    for (const clave of ["name", "name:es", "ref", "operator", "brand"]) {
      const v = etiquetas[clave];
      if (v && v.trim() && !esNombreNumerico(v)) {
        return {
          nombre_propuesto: v.trim(),
          fuente_propuesta: `OpenStreetMap · ${clave}`,
          confianza: 85,
          motivo: `El objeto tiene etiqueta ${clave} con un nombre propio en OpenStreetMap.`,
        };
      }
    }
  }

  // 2. Encaje con el Plan Territorial Municipal
  const tipo = (ctx.subcategoria ?? "").toLowerCase();
  const candidatos = (ctx.ptm_por_tipo ?? []).filter((c) =>
    c.tipo.toLowerCase().includes(tipo.split("_")[0] ?? tipo)
  );
  const dirNorm = normalizaParaComparar(ctx.direccion);
  if (dirNorm) {
    for (const c of candidatos) {
      if (normalizaParaComparar(c.direccion) === dirNorm) {
        return {
          nombre_propuesto: c.nombre,
          fuente_propuesta: "Plan Territorial Municipal",
          confianza: 75,
          motivo: `Coincide con el elemento «${c.nombre}» del Plan Territorial Municipal, en la misma dirección.`,
        };
      }
    }
  }

  // 3. Atributos de la fila, cuando la clave de importación partió de un nombre
  const atr = ctx.etiquetas_origen;
  if (atr) {
    for (const clave of ["nombre_parada", "denominacion", "nombre"]) {
      const v = atr[clave];
      if (v && !esNombreNumerico(v)) {
        return {
          nombre_propuesto: String(v).trim(),
          fuente_propuesta: `Ficha municipal · ${clave}`,
          confianza: 70,
          motivo: "El nombre consta en la ficha municipal del municipio.",
        };
      }
    }
  }

  return {
    nombre_propuesto: null,
    fuente_propuesta: "—",
    confianza: 0,
    motivo:
      "El nombre es un número y no se ha podido recuperar de ninguna fuente verificada. Se marca como «por revisar»: no se inventa.",
  };
}

/** Normaliza una dirección para poder compararla entre fuentes. */
export function normalizaParaComparar(texto: string | null | undefined): string {
  if (!texto) return "";
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(c\/|calle|avda\.?|avenida|pza\.?|plaza|ctra\.?|carretera|passeig|avinguda|paseig|carretera|av)\b\.?/g, " ")
    .replace(/\bn[º°o]\.?\s*/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}