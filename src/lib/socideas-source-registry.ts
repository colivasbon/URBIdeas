// Registro central de fuentes oficiales del libro XLSX municipal SOCideas.
// SOLO SERVIDOR/librería pura: no lee datos, no escribe R2/Supabase, no contiene
// secretos ni URLs privadas. Toda construcción de URLs públicas vive aquí para
// no hardcodear enlaces sueltos en el generador ni en los constructores de tablas.
//
// Regla de oro: si una tabla no tiene una fuente pública concreta y atribuible,
// no se pinta enlace (solo línea de fuente), nunca un falso botón.

export interface SourceReference {
  institution: string
  operation: string
  tableId?: string
  periodLabel?: string
  publicUrl?: string
  shortLabel: string
}

/** Instituciones oficiales usadas en el libro. */
export const INE_INSTITUTION = 'Instituto Nacional de Estadística'
export const AEAT_INSTITUTION = 'Agencia Estatal de Administración Tributaria'
export const MIR_INSTITUTION = 'Ministerio del Interior'

/** Operaciones estadísticas (etiqueta visible, sin URL). */
export const OP_DPOP = 'Cifras oficiales de población (Padrón municipal)'
export const OP_PIRAMIDE = 'Padrón Continuo (estructura por edad y sexo)'
export const OP_ADRH = 'Atlas de Distribución de Renta de los Hogares (ADRH)'
export const OP_DIRCE = 'Directorio Central de Empresas (DIRCE)'
export const OP_CENSO_AGRARIO = 'Censo Agrario 2020 (resultados municipales)'
export const OP_CENSO_ANUAL = 'Censo anual de población'
export const OP_EMCR = 'Estadística de Migraciones y Cambios de Residencia'
export const OP_MUNI_MAS250 = 'Infoelectoral · Datos Abiertos — Elecciones municipales de más de 250 habitantes'

/**
 * Dominios públicos autorizados para hipervínculos de fuente. Cualquier enlace
 * fuera de esta lista (o sin https) invalida el libro.
 */
export const ALLOWED_SOURCE_HOSTS = [
  'www.ine.es',
  'ine.es',
  'www.agenciatributaria.es',
  'sede.agenciatributaria.gob.es',
  'infoelectoral.interior.gob.es',
  'descargas.interior.gob.es',
] as const

/** Dominios prohibidos explícitamente (infraestructura interna, R2, etc.). */
export const BLOCKED_SOURCE_HOSTS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'r2.cloudflarestorage.com',
  'cloudflare.com',
  'supabase.co',
  'vercel.app',
  'github.com',
] as const

/** Valida que una URL sea https y de un dominio oficial autorizado. */
export function isAllowedSourceUrl(url: string | null | undefined): boolean {
  if (!url) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  const host = parsed.hostname.toLowerCase()
  if (BLOCKED_SOURCE_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) return false
  return (ALLOWED_SOURCE_HOSTS as readonly string[]).includes(host)
}

/** Construye la ficha pública oficial (jaxiT3) de una tabla INE concreta. */
export function ineTableSource(
  tableId: string | number | null | undefined,
  operation: string,
  institution: string = INE_INSTITUTION,
): SourceReference | null {
  if (tableId === null || tableId === undefined) return null
  const id = String(tableId).trim()
  if (!/^\d+$/.test(id)) return null
  return {
    institution,
    operation,
    tableId: id,
    publicUrl: `https://www.ine.es/jaxiT3/Tabla.htm?t=${id}`,
    shortLabel: `INE · ${operation} · Tabla ${id}`,
  }
}

/** Indicador derivado: enlace a la fuente oficial base + cálculo declarado. */
export function derivedFromSource(base: SourceReference | null | undefined): SourceReference | null {
  if (!base || !base.publicUrl) return null
  return {
    institution: base.institution,
    operation: `${base.operation} · Cálculo SOCideas sobre datos oficiales`,
    tableId: base.tableId,
    publicUrl: base.publicUrl,
    shortLabel: `${base.shortLabel} · Cálculo SOCideas`,
  }
}

/**
 * Registro central. Las tres dimensiones demográficas nuevas (nacionalidad,
 * nacimiento y arraigo) apuntan a su ficha INE oficial verificada.
 */
export const SOCIDEAS_SOURCE_REGISTRY = {
  ine_nationality_68535: {
    institution: INE_INSTITUTION,
    operation: OP_CENSO_ANUAL,
    tableId: '68535',
    publicUrl: 'https://www.ine.es/jaxiT3/Tabla.htm?t=68535',
    shortLabel: 'INE · Censo anual · Tabla 68535',
  },
  ine_birth_country_66322: {
    institution: INE_INSTITUTION,
    operation: OP_CENSO_ANUAL,
    tableId: '66322',
    publicUrl: 'https://www.ine.es/jaxiT3/Tabla.htm?t=66322',
    shortLabel: 'INE · Censo anual · Tabla 66322',
  },
  ine_birth_residence_68540: {
    institution: INE_INSTITUTION,
    operation: OP_CENSO_ANUAL,
    tableId: '68540',
    publicUrl: 'https://www.ine.es/jaxiT3/Tabla.htm?t=68540',
    shortLabel: 'INE · Censo anual · Tabla 68540',
  },
  ine_migration_abroad_69711: {
    institution: INE_INSTITUTION,
    operation: OP_EMCR,
    tableId: '69711',
    publicUrl: 'https://www.ine.es/jaxiT3/Tabla.htm?t=69711',
    shortLabel: 'INE · EMCR · Tabla 69711',
  },
  ine_immigration_intermunicipal_69743: {
    institution: INE_INSTITUTION,
    operation: OP_EMCR,
    tableId: '69743',
    publicUrl: 'https://www.ine.es/jaxiT3/Tabla.htm?t=69743',
    shortLabel: 'INE · EMCR · Tabla 69743',
  },
  ine_emigration_intermunicipal_69746: {
    institution: INE_INSTITUTION,
    operation: OP_EMCR,
    tableId: '69746',
    publicUrl: 'https://www.ine.es/jaxiT3/Tabla.htm?t=69746',
    shortLabel: 'INE · EMCR · Tabla 69746',
  },
  mir_muni_mas250_2023: {
    institution: MIR_INSTITUTION,
    operation: OP_MUNI_MAS250,
    tableId: 'MIR_MUNI_202305',
    publicUrl: 'https://infoelectoral.interior.gob.es/es/elecciones-celebradas/datos-abiertos/',
    shortLabel: 'Interior · Infoelectoral · Municipales 2023 · Tabla MIR_MUNI_202305',
  },
} as const satisfies Record<string, SourceReference>

export type SourceRegistryKey = keyof typeof SOCIDEAS_SOURCE_REGISTRY

/** Devuelve una copia de la referencia registrada (evita mutaciones externas). */
export function registrySource(key: SourceRegistryKey): SourceReference {
  return { ...SOCIDEAS_SOURCE_REGISTRY[key] }
}

/**
 * AEAT — Estadística de los declarantes del IRPF por municipios (EDM).
 * Página pública de la publicación, no un endpoint ni un CSV masivo.
 * La tabla `renta` mezcla AEAT (por declaración) y ADRH (por persona/hogar):
 * queda documentado en la línea de estado y se enlaza la publicación principal.
 */
export const AEAT_EDM_IRPF: SourceReference = {
  institution: AEAT_INSTITUTION,
  operation: 'Estadística de los declarantes del IRPF por municipios (EDM)',
  publicUrl:
    'https://sede.agenciatributaria.gob.es/Sede/datosabiertos/catalogo/hacienda/Estadistica_de_los_declarantes_del_IRPF_por_municipios.shtml',
  shortLabel: 'AEAT · IRPF por municipios (EDM)',
}

/** Línea visible de procedencia: organismo · operación [· tabla] [· período]. */
export function visibleSourceLabel(
  source: SourceReference | null | undefined,
  fallback: string,
  periodo?: string,
): string {
  if (!source) {
    return `Fuente: ${fallback}${periodo ? ` · Período: ${periodo}` : ''}`
  }
  const parts = [source.institution, source.operation]
  if (source.tableId) parts.push(`Tabla ${source.tableId}`)
  return `Fuente: ${parts.join(' · ')}${periodo ? ` · Período: ${periodo}` : ''}`
}
