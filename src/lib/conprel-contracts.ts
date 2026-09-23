// Contratos CONPREL — familias, URLs oficiales, tableIds, columnas esperadas.
// Baseline: docs/conprel-integracion-partial-diseno.md §§1-3,7-8.
// Este fichero NO escribe R2/Supabase ni descarga nada por sí solo.

export const CONPREL_PARSER_VERSION = '1.0.0'

export type ConprelFamilia = 'ppto' | 'liq'

/** Tope de envelope (mismo gate que el resto de loaders SOCideas). */
export const CONPREL_MAX_ENVELOPE_BYTES = 150 * 1024

/** Concurrency por defecto para lecturas públicas R2 en medición de tamaño. */
export const CONPREL_R2_READ_CONCURRENCY = 15

export const CONPREL_SOURCE_SLUG = 'hacienda_conprel'
export const CONPREL_SOURCE_ORGANISMO = 'Ministerio de Hacienda y Función Pública'
export const CONPREL_SOURCE_NOMBRE = 'CONPREL — Presupuestos y Liquidaciones de Entidades Locales'

export interface ConprelFamiliaDef {
  familia: ConprelFamilia
  ejercicio: number
  tableId: string
  tipoDato: 'Presupuestos' | 'Liquidaciones'
  /** URL oficial de descarga (TipoPublicacion=Access). */
  url: string
  /** Nombre esperado del ZIP y del accdb tras la descarga/extracción. */
  zipName: string
  accdbName: string
  /** Etiqueta de corte documentada en el diseño (NO es glosario cdFase). */
  etiqueta: string
  /** Columnas obligatorias de tb_inventario (orden exacto de cabecera). */
  invColumns: readonly string[]
  /** Columnas obligatorias de tb_economica (capítulo) en el CSV extraído. */
  ecoColumns: readonly string[]
  /** Columnas monetarias a publicar, en orden de definición de slugs. */
  magnitudes: readonly string[]
  /** Cobertura documentada (matriz §11.2 del documento de decisión). */
  coberturaEsperada: { presentes: number; denominador: number }
}

const BASE_URL = 'https://serviciostelematicosext.hacienda.gob.es/SGFAL/CONPREL/Consulta/DescargaFichero'

export const CONPREL_PPTO_2025: ConprelFamiliaDef = {
  familia: 'ppto',
  ejercicio: 2025,
  tableId: 'CONPREL-PPTO-2025',
  tipoDato: 'Presupuestos',
  url: `${BASE_URL}?CCAA=&TipoDato=Presupuestos&Ejercicio=2025&TipoPublicacion=Access`,
  zipName: 'Presupuestos2025_def.zip',
  accdbName: 'Presupuestos2025.accdb',
  etiqueta: 'definitiva_publicacion',
  invColumns: ['codente', 'estado', 'id', 'idente', 'nombreente', 'nsec', 'poblacion'],
  ecoColumns: ['idente', 'cdcta', 'tipreig', 'importe'],
  magnitudes: ['importe'],
  coberturaEsperada: { presentes: 7345, denominador: 8132 },
}

export const CONPREL_LIQ_2024: ConprelFamiliaDef = {
  familia: 'liq',
  ejercicio: 2024,
  tableId: 'CONPREL-LIQ-2024',
  tipoDato: 'Liquidaciones',
  url: `${BASE_URL}?CCAA=&TipoDato=Liquidaciones&Ejercicio=2024&TipoPublicacion=Access`,
  zipName: 'Liquidaciones2024_def.zip',
  accdbName: 'Liquidaciones2024.accdb',
  etiqueta: 'definitiva_publicacion',
  invColumns: ['codente', 'estado', 'id', 'idente', 'nombreente', 'nsec', 'poblacion'],
  ecoColumns: ['idente', 'cdcta', 'tipreig', 'imported', 'importer', 'importel', 'importec'],
  magnitudes: ['imported', 'importer', 'importel', 'importec'],
  coberturaEsperada: { presentes: 6861, denominador: 8132 },
}

export const CONPREL_FAMILIAS: Record<ConprelFamilia, ConprelFamiliaDef> = {
  ppto: CONPREL_PPTO_2025,
  liq: CONPREL_LIQ_2024,
}

/** Municipal = tipo AA, o ZZ (Ceuta/Melilla). ZV/ZO y el resto NO entran. */
export function esMunicipalCodente(codente: string): boolean {
  if (codente.length < 7) return false
  const tipo = codente.slice(5, 7).toUpperCase()
  return tipo === 'AA' || tipo === 'ZZ'
}

export function prefijoIne5(codente: string): string {
  return codente.slice(0, 5)
}

/** Capítulo EHA = dígitos 1..9 con trim (cdcta de 1 carácter numérico). */
export function esCapitulo(cdctaRaw: string): boolean {
  return /^\d$/.test(cdctaRaw.trim())
}
