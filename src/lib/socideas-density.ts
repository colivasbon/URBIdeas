// Densidad de población SOCideas — cálculo derivado + diseño de envelope v2.
//
// SOLO LECTURA/CÁLCULO PURO: no lee R2/Supabase, no escribe nada, no contiene
// secretos. La superficie municipal viene del IGN (ver SURFACE_SOURCE); la
// población se reutiliza de la ya cargada en R2 v2 (no se recarga padrón).
//
// Patrón replicado de los derivados existentes ("Índice de envejecimiento" /
// "Índice de dependencia" en socideas-perfil.ts + FichaFiltros.tsx):
//   - el indicador se etiqueta como cálculo SOCideas sobre datos oficiales;
//   - los años de cada componente se declaran por separado;
//   - si los años no son contemporáneos, se advierte (nunca se mezclan en
//     silencio). Regla MEMORIA §3: "años no contemporáneos se advierten".
//
// Fuente de superficie (verificada 2026-09-16, descarga real inspeccionada):
//   IGN · Información Geográfica Destacada · Municipios (listado extenso),
//   derivado del NGMEP (Nomenclátor Geográfico de Municipios y Entidades de
//   Población, Registro Central de Cartografía).
//   - Descarga: https://www.ign.es/resources/ane/Informacion_Geografica_Destacada/IGN_INFOGEO_MUNICIPIOS.xlsx
//   - Ficha: https://www.ign.es/web/ign/portal/municipios
//   - Memoria NGMEP: https://centrodedescargas.cnig.es/CentroDescargas/documentos/Memoria_NGMEP.pdf
//   - Cabecera real: Identificador | Nombre | Población | Superficie (km2) | Capital | Provincia | Ver en mapa
//   - Identificador = código INE de 5 cifras; Superficie ya en km² (en el NGMEP
//     original la unidad es hectáreas: SUPERFICIE_OFICIAL en ha; aquí el IGN la
//     sirve convertida a km²).
//   - Revisión del fichero: 20/10/2025 → ANIO_SUPERFICIE = 2025.
//   - Cobertura: 8.132 municipios (total nacional). Licencia CC BY 4.0 ign.es.
//   - Estabilidad: la superficie oficial solo cambia con alteraciones de
//     límites (deslindes); periodicidad IGN "1 año, en caso de que haya habido
//     modificaciones". Aun así el año de la superficie SE DECLARA SIEMPRE junto
//     a la densidad para no mezclarlo silenciosamente con la población.

/** Slug del indicador de superficie en el catálogo del envelope v2. */
export const AREA_SLUG = 'area_km2'

/** Slug del indicador de densidad en el catálogo del envelope v2. */
export const DENSITY_SLUG = 'density_per_km2'

/** Slug de la fuente IGN en el catálogo `sources` del envelope v2. */
export const IGN_SOURCE_SLUG = 'ign_infogeo'

/** Año de la superficie usada (revisión del fichero IGN). */
export const ANIO_SUPERFICIE = 2025

/** Unidad de la superficie. */
export const AREA_UNIT = 'km²'

/** Unidad de la densidad. */
export const DENSITY_UNIT = 'hab/km²'

/** Entrada `sources` para el catálogo v2 (nueva fuente, no rompe las existentes). */
export const IGN_INFOGEO_SOURCE = {
  slug: IGN_SOURCE_SLUG,
  organismo: 'Instituto Geográfico Nacional',
  nombre: 'Información Geográfica Destacada · Municipios (NGMEP)',
} as const

/** URLs de trazabilidad de la superficie (una vez cada una, norma v2 §3). */
export const IGN_SURFACE_URLS = [
  'https://www.ign.es/resources/ane/Informacion_Geografica_Destacada/IGN_INFOGEO_MUNICIPIOS.xlsx',
  'https://www.ign.es/web/ign/portal/municipios',
] as const

/**
 * tableId para la fila de superficie. NO es una tabla Tempus3: el lector v2
 * (`expandV2Envelope` en src/lib/socideas-r2.ts) resuelve la fuente por
 * `tableId`, así que para atribuir correctamente a `ign_infogeo` hace falta
 * UNA línea en `sourceSlugForTable` (fichero fuera del alcance de este
 * bloque; se propone, no se toca):
 *
 *   if (tableId === 'NGMEP') return 'ign_infogeo'
 *
 * Sin esa línea, la fila caería al fallback `sources[0]` (INE Tempus3) y
 * quedaría mal atribuida. El dry-run demuestra el diseño con esa
 * correspondencia aplicada en local.
 */
export const NGMEP_TABLE_ID = 'NGMEP'

export interface DensityInput {
  /** Población municipal (reutilizada de R2 v2, no recargada). */
  poblacion: number | null
  /** Año de referencia de la población (p. ej. 2025 DPOP). */
  anioPoblacion: number | null
  /** Superficie oficial IGN en km². */
  superficieKm2: number | null
  /** Año de la superficie (fijo: revisión IGN). */
  anioSuperficie: number
}

export interface DensityResult {
  /** Densidad en hab/km² redondeada a 1 decimal, o null si falta un componente. */
  valor: number | null
  /** true cuando anioPoblacion ≠ anioSuperficie (aviso obligatorio). */
  avisoAnios: boolean
}

/**
 * Densidad = población / superficie. INDICADOR DERIVADO (cálculo SOCideas,
 * no dato INE). null ante cualquier componente ausente o superficie ≤ 0
 * (nunca se muestra 0 ni se estima).
 */
export function calcDensity(input: DensityInput): DensityResult {
  const { poblacion, anioPoblacion, superficieKm2, anioSuperficie } = input
  if (poblacion === null || anioPoblacion === null || superficieKm2 === null || superficieKm2 <= 0) {
    return { valor: null, avisoAnios: anioPoblacion !== null && anioPoblacion !== anioSuperficie }
  }
  return {
    valor: Math.round((poblacion / superficieKm2) * 10) / 10,
    avisoAnios: anioPoblacion !== anioSuperficie,
  }
}

/** Etiqueta de tarjeta, mismo tono que "Cálculo propio sobre serie oficial". */
export function densityDetailLabel(anioPoblacion: number | null, anioSuperficie: number): string {
  return `Cálculo SOCideas · Población ${anioPoblacion ?? '—'} / Superficie IGN ${anioSuperficie}`
}

/** Advertencia de años no contemporáneos (regla nunca-mezclar-en-silencio). */
export function densityYearsWarning(anioPoblacion: number | null, anioSuperficie: number): string | null {
  if (anioPoblacion === null || anioPoblacion === anioSuperficie) return null
  return (
    `La población es de ${anioPoblacion} y la superficie oficial IGN de ${anioSuperficie}: ` +
    `los límites municipales varían poco entre años, pero la densidad resultante debe leerse ` +
    `con esa diferencia de referencia en mente. Nada se ha estimado.`
  )
}

/** Texto "Cómo se calcula" para el <details> del bloque (réplica del patrón envejecimiento/dependencia). */
export const DENSITY_METHOD_TEXT =
  'Densidad = población municipal (INE, serie ya cargada en la ficha) dividida por la superficie ' +
  'oficial del término municipal (IGN, Información Geográfica Destacada · Municipios, derivada del NGMEP). ' +
  'Es un indicador derivado: un cálculo SOCideas sobre datos oficiales, no un dato publicado por el INE. ' +
  'El año de la población y el año de la superficie se declaran por separado; si no coinciden, se advierte.'

/** Estado de trazabilidad cuando falta la superficie o la población. */
export function densityPendingReason(poblacion: number | null, superficieKm2: number | null): string {
  if (poblacion === null && superficieKm2 === null) return 'Sin población ni superficie para este municipio.'
  if (poblacion === null) return 'Sin población municipal en el año de referencia; no se calcula densidad.'
  return 'Sin superficie oficial IGN para este municipio; no se estima.'
}
