// Lectura del atlas de secciones censales desde R2 — SOLO SERVIDOR.
//
// Hay DOS formas de leer el mismo objeto, y la elección depende de lo que se
// va a servir:
//
//  1. COMPACTA (`series`, tal y como está publicado): el bootstrap y el bloque
//     de dataset. No rehidrata nada, así que no multiplica la memoria por 20
//     propiedades repetidas.
//  2. EXPANDIDA (`SeccionesAtlasV1`): solo para el XLSX, que necesita filas y
//     no un mapa de red. `expandirAtlas` recorre las series UNA vez (antes
//     llamaba a `expandirObservaciones` sobre TODAS las secciones una vez por
//     indicador: 127 × 2 462 secciones, O(n²) sobre 521 944 valores).
//
// Por qué existe el contrato bajo demanda: Madrid tiene 521 944
// observaciones. Expandidas son ~530 B cada una (el metadato —municipio,
// geometryYear, operation, sourceTable, sourceUrl, retrievedAt, checksum,
// unit, denominator, dimensions— se repite en cada una), 98,9 % de los
// 304,5 MB que devolvía la ruta y 1,5–2,5 GB de heap: de ahí el HTTP 500
// intermitente. Compactas son ~85 B y el navegador solo lee UN indicador y UN
// periodo a la vez (`SeccionesAtlas.tsx:1023`,
// `SeccionesPoliticaExtension.tsx:340`), así que el ~99,5 % de los bytes
// anteriores no lo usaba nadie.
//
// Caché: `unstable_cache` con etiqueta por municipio, siguiendo la convención
// de `socideas-r2.ts` (`socideas-muni-<ine>`), que es la que purga
// `/api/socideas/revalidate` tras una ingesta. El fallo de validación se lanza
// DENTRO de la función cacheada para que un objeto corrupto no se guarde como
// respuesta válida.

import { unstable_cache } from 'next/cache'
import {
  SECCIONES_R2_PREFIX,
  SECCIONES_ATLAS_SCHEMA,
  expandirSerieIndicador,
  validarAtlasCompacto,
  validarSeccionesAtlas,
  type ResultadoValidacion,
  type SeccionesAtlasR2V1,
  type SeccionesAtlasV1,
  type SeccionesSeriesCompactas,
  type SeccionesSeriesDeIndicador,
  type ContextoObservacion,
} from './socideas-secciones'

export const SECCIONES_R2_MANIFEST_KEY = 'socideas/secciones/v1/manifests/latest-successful.json'

class AtlasInvalido extends Error {}
class AtlasNoPublicado extends Error {
  /** Marca serializable: un error lanzado dentro de `unstable_cache` puede
   *  cruzar el límite sin conservar el prototipo; se comprueba por propiedad. */
  readonly noPublicado = true as const
}

export function seccionesR2Key(codigoIne: string): string {
  return `${SECCIONES_R2_PREFIX}/${codigoIne}.json`
}

/** Debe usar `||` y no `??`: una env definida pero VACÍA debe caer al fallback
 *  (mismo criterio que `socideas-ine-layers.ts`, donde un `??` borraba las
 *  capas INE silenciosamente en local). */
export function seccionesR2Base(): string {
  return (
    process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ||
    'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'
  )
}

export interface OpcionesLecturaAtlas {
  /** Periodo a expandir. Si se omite, se publican todos los años del objeto. */
  anio?: number
  indicadores?: string[]
}

function validarCompacto(objeto: unknown): asserts objeto is SeccionesAtlasR2V1 {
  const o = objeto as Partial<SeccionesAtlasR2V1>
  if (o.schemaVersion !== 'secciones-atlas-r2-v1') {
    throw new AtlasInvalido(`schemaVersion inesperado: ${String(o.schemaVersion)}`)
  }
  if (!o.series || typeof o.series !== 'object') {
    throw new AtlasInvalido('series ausente')
  }
  if (!Array.isArray(o.sections) || o.sections.length === 0) {
    throw new AtlasInvalido('sections ausente o vacío')
  }
  if (!Array.isArray(o.indicators) || o.indicators.length === 0) {
    throw new AtlasInvalido('indicators ausente')
  }
}

/** Descarga y valida el objeto compacto. `null` si no existe. */
export async function leerAtlasCompacto(
  codigoIne: string,
  timeoutMs = 20000,
): Promise<SeccionesAtlasR2V1 | null> {
  const url = `${seccionesR2Base()}/${seccionesR2Key(codigoIne)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (res.status === 404) return null
    if (!res.ok) throw new AtlasInvalido(`R2 respondió ${res.status} para ${codigoIne}`)
    const objeto = (await res.json()) as unknown
    validarCompacto(objeto)
    return objeto
  } catch (e) {
    if (e instanceof AtlasInvalido) throw e
    throw new AtlasInvalido(
      `No se pudo leer el atlas de ${codigoIne}: ${e instanceof Error ? e.message : String(e)}`,
    )
  } finally {
    clearTimeout(timer)
  }
}

/** Tamaño del objeto en R2, o `null` si no existe. */
export async function tamanoObjeto(codigoIne: string, timeoutMs = 10000): Promise<number | null> {
  const url = `${seccionesR2Base()}/${seccionesR2Key(codigoIne)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal, cache: 'no-store' })
    if (res.status === 404) return null
    if (!res.ok) return null
    const n = Number(res.headers.get('content-length'))
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** El Data Cache de Next.js rechaza elementos de más de 2 MB. El atlas de un
 *  municipio grande lo es con holgura (Madrid, 7,8 MB compacto), así que probar
 *  la caché a ciegas abortaba la respuesta entera con
 *  «items over 2MB can not be cached». Por eso el tamaño se consulta ANTES:
 *  el objeto pequeño se cachea con su etiqueta de invalidación y el grande se
 *  lee siempre fresco de R2. Exportado para que las rutas decidan lo mismo con
 *  el mismo número. */
export const LIMITE_DATA_CACHE = 1_800_000

/** Por qué pasó un bloque por el Data Cache o lo esquivó. Se propaga en la
 *  respuesta: un bloque servido sin cachear debe quedar dicho, nunca ser un
 *  éxito silencioso. */
export type ViaCacheBloque = 'data-cache' | 'servidor'

export interface BloqueCacheado<T> {
  dato: T
  via: ViaCacheBloque
  /** `null` si se cacheó. Si no, el motivo exacto de no haberlo hecho. */
  motivo: string | null
}

/** El Data Cache se niega por tamaño con un error propio; se distingue de un
 *  fallo de lectura para no reconstruir dos veces ante un error real. */
function esRechazoPorTamano(error: unknown): boolean {
  const mensaje = error instanceof Error ? error.message : String(error)
  return /over 2MB|too large|exceeds|maximum size/i.test(mensaje)
}

/**
 * Cachea UN bloque con `unstable_cache` y su tag, sin tumbar la respuesta si el
 * bloque no cabe: cuando el Data Cache se niega por tamaño al escribir, se
 * reconstruye sin cachear y se deja constancia en `motivo`.
 *
 * Ese aviso del Data Cache es la SEÑAL (el límite solo se conoce al escribir), y
 * por eso el objeto compacto de Madrid no se puede cachear pero su bloque sí:
 * 7,8 MB no entran, 0,15 MB sí. Un objeto grande deja de ser el problema de todas
 * las rutas.
 */
export async function cachearBloque<T>(args: {
  /** Partes de la clave: deben incluir todo lo que distingue un bloque. */
  partes: string[]
  tags: string[]
  revalidate?: number
  construir: () => Promise<T>
}): Promise<BloqueCacheado<T>> {
  const cached = unstable_cache(args.construir, args.partes, {
    revalidate: args.revalidate ?? 3600,
    tags: args.tags,
  })
  try {
    return { dato: await cached(), via: 'data-cache', motivo: null }
  } catch (error) {
    if (!esRechazoPorTamano(error)) throw error
    // El Data Cache se enteró al escribir. Se reconstruye sin cachear: el
    // bloque es demasiado grande para el límite, no la respuesta un error.
    return {
      dato: await args.construir(),
      via: 'servidor',
      motivo: `el Data Cache rechazó el bloque (${LIMITE_DATA_CACHE.toLocaleString('es-ES')} B): se sirve desde el servidor, sin cachear`,
    }
  }
}

/** Lectura del objeto compacto para el bootstrap y para los bloques de dataset.
 *  Se cachea con la etiqueta del municipio solo si el objeto cabe en el Data
 *  Cache (los pequeños); los grandes se leen frescos de R2. `null` si el
 *  municipio no tiene atlas publicado. */
export async function leerCompactoCacheado(
  codigoIne: string,
  opciones: { limiteBytes?: number } = {},
): Promise<{ compacto: SeccionesAtlasR2V1; bytes: number | null; via: ViaCacheBloque; motivo: string | null } | null> {
  const limite = opciones.limiteBytes ?? LIMITE_DATA_CACHE
  const tag = `socideas-muni-${codigoIne}`
  const bytes = await tamanoObjeto(codigoIne)
  const construir = async (): Promise<SeccionesAtlasR2V1> => {
    const compacto = await leerAtlasCompacto(codigoIne)
    if (!compacto) throw new AtlasNoPublicado(`Sin atlas publicado para ${codigoIne}`)
    return compacto
  }
  if (bytes !== null && bytes > limite) {
    try {
      return {
        compacto: await construir(),
        bytes,
        via: 'servidor',
        motivo:
          `el objeto de R2 ocupa ${bytes.toLocaleString('es-ES')} B y no cabe en el Data Cache ` +
          `(${limite.toLocaleString('es-ES')} B): se lee fresco de R2. Los bloques derivados sí se cachean.`,
      }
    } catch (e) {
      if (esNoPublicado(e)) return null
      throw e
    }
  }
  // Un municipio SIN atlas publicado NO debe quedar cacheado como «null» durante
  // una hora: si la ingesta llega después, Vercel seguiría sirviendo la ausencia
  // (y el usuario leería «no publicado» en vez de «todavía no cargado»). Por eso
  // la ausencia se lanza como error marcado: `unstable_cache` no almacena
  // resultados de una función que lanza, así que la próxima petición vuelve a
  // comprobar R2 y recoge el objeto en cuanto exista.
  const cached = unstable_cache(construir, [`compacto-${codigoIne}`], { revalidate: 3600, tags: [tag] })
  try {
    return { compacto: await cached(), bytes, via: 'data-cache', motivo: null }
  } catch (e) {
    if (esNoPublicado(e)) return null
    throw e
  }
}

function esNoPublicado(e: unknown): boolean {
  return e instanceof AtlasNoPublicado || (e as { noPublicado?: boolean })?.noPublicado === true
}

/** Objeto compacto validado en el servidor + su veredicto. La validación es
 *  fail-closed y vive AQUÍ, en el servidor: el bootstrap ya no lleva
 *  `observations` y el cliente no puede volver a validar por su cuenta. */
export async function leerCompactoValidado(
  codigoIne: string,
  opciones: { limiteBytes?: number } = {},
): Promise<{
  compacto: SeccionesAtlasR2V1
  validacion: ResultadoValidacion
  bytes: number | null
  via: ViaCacheBloque
  motivo: string | null
} | null> {
  const leido = await leerCompactoCacheado(codigoIne, opciones).catch((e: unknown) => {
    if (e instanceof AtlasInvalido) return null
    throw e
  })
  if (!leido) return null
  const validacion = validarAtlasCompacto(leido.compacto)
  if (!validacion.ok) {
    throw new AtlasInvalido(
      `Atlas de ${codigoIne} no valida: ${validacion.errores.slice(0, 3).join(' | ')}`,
    )
  }
  return { ...leido, validacion }
}

/** Agrupa las series por indicador en UNA pasada. Sin esto, expandir
 *  indicador a indicador recorría las 2 462 secciones de Madrid 127 veces
 *  (O(n²) sobre 521 944 valores). */
function indexarSeriesPorIndicador(series: SeccionesSeriesCompactas): Record<string, SeccionesSeriesDeIndicador> {
  const porIndicador: Record<string, SeccionesSeriesDeIndicador> = {}
  for (const [seccion, porInd] of Object.entries(series ?? {})) {
    for (const [indicadorId, valores] of Object.entries(porInd ?? {})) {
      const destino = (porIndicador[indicadorId] ??= {})
      destino[seccion] = valores
    }
  }
  return porIndicador
}

/** Expande el objeto compacto al contrato completo, con un año por defecto. */
export function expandirAtlas(
  compacto: SeccionesAtlasR2V1,
  opciones: OpcionesLecturaAtlas = {},
): SeccionesAtlasV1 {
  // Contexto común: se toma del primer indicador, porque la unidad y la
  // definición viven en el catálogo, no en cada observación.
  const cat = compacto.indicators
  const baseCtx = {
    municipalityIne: compacto.municipalityIne,
    geometryYear: compacto.geometryYear,
    operation: cat[0]?.operation ?? '',
    sourceTable: cat[0]?.sourceTable ?? '',
    unit: cat[0]?.unidad ?? '',
    denominator: cat[0]?.denominador ?? null,
    sourceUrl: cat[0]?.url ?? '',
    publishedAt: null,
    retrievedAt: compacto.statsRetrievedAt,
    checksum: compacto.sourceChecksums?.adrhProvincial ?? '',
  }

  // Se expande indicador a indicador para que la unidad, el denominador y la
  // URL de provenance sean los de ESE indicador y no los del primero. El
  // checksum también es por operación: el ADRH y el Censo anual tienen
  // descargas distintas y no deben compartir la misma huella.
  const checksumDe = (ind: { tableFamily: string }): string => {
    if (ind.tableFamily === 'censo_sexo_edad') {
      return compacto.sourceChecksums?.censoSexoEdad ?? baseCtx.checksum
    }
    if (ind.tableFamily === 'censo_nacionalidad') {
      return compacto.sourceChecksums?.censoNacionalidad ?? baseCtx.checksum
    }
    return compacto.sourceChecksums?.adrhProvincial ?? baseCtx.checksum
  }

  const observaciones: Record<
    string,
    Record<string, Record<string, SeccionesAtlasV1['observations'][string][string][string]>>
  > = {}
  // Un solo recorrido de `series` por indicador: el coste pasa a ser O(n) en el
  // número de valores, no 127 × 2 462 iteraciones de recorrido completo.
  const porIndicador = indexarSeriesPorIndicador(compacto.series)
  // El filtro se aplica AQUÍ. Antes se pasaba a `expandirObservaciones`, que
  // recibía el id del indicador en curso, así que `opciones.indicadores` se
  // ignoraba y una lectura filtrada expandía el catálogo entero.
  const soloPedidos = opciones.indicadores?.length ? new Set(opciones.indicadores) : null
  for (const ind of compacto.indicators) {
    if (soloPedidos && !soloPedidos.has(ind.id)) continue
    const ctx: ContextoObservacion = {
      ...baseCtx,
      sourceTable: ind.sourceTable,
      unit: ind.unidad,
      denominator: ind.denominador,
      sourceUrl: ind.url,
      operation: ind.operation,
      checksum: checksumDe(ind),
    }
    const propio = porIndicador[ind.id]
    if (!propio) continue
    const parcial = expandirSerieIndicador(propio, ctx, { indicatorId: ind.id, anio: opciones.anio })
    for (const [seccion, porPeriodo] of Object.entries(parcial)) {
      const porSec = (observaciones[seccion] ??= {})
      porSec[ind.id] = porPeriodo
    }
  }

  return {
    schemaVersion: SECCIONES_ATLAS_SCHEMA,
    municipalityIne: compacto.municipalityIne,
    municipalityName: compacto.municipalityName,
    provinceName: compacto.provinceName,
    geometryYear: compacto.geometryYear,
    geometryCollection: compacto.geometryCollection,
    geometrySource: compacto.geometrySource,
    geometryCrs: compacto.geometryCrs,
    geometryRetrievedAt: compacto.geometryRetrievedAt,
    statsRetrievedAt: compacto.statsRetrievedAt,
    indicators: compacto.indicators,
    cobertura: compacto.cobertura,
    sections: compacto.sections,
    observations: observaciones,
    municipalReference: compacto.municipalReference,
    quality: compacto.quality,
    sourceChecksums: compacto.sourceChecksums,
    generatedAt: compacto.generatedAt,
    schemaChecksum: compacto.schemaChecksum,
  }
}

/** Lectura cacheada del atlas EXPANDIDO, listo para la API. `null` si no está
 *  publicado. Solo la usa quien necesita el contrato completo (el XLSX): el
 *  bootstrap y el bloque de dataset trabajan con la forma compacta. */
export async function leerAtlasParaApi(
  codigoIne: string,
  opciones: OpcionesLecturaAtlas = {},
): Promise<SeccionesAtlasV1 | null> {
  const anio = opciones.anio ?? -1
  const inds = (opciones.indicadores ?? []).join(',')

  // Un objeto corrupto NO es «no publicado»: `leerCompactoCacheado` propaga el
  // fallo y la ruta responde con error, nunca con un atlas vacío que parece un
  // municipio sin datos.
  const leido = await leerCompactoCacheado(codigoIne)
  if (!leido) return null

  const atlas = expandirAtlas(leido.compacto, {
    anio: anio === -1 ? undefined : anio,
    indicadores: inds ? inds.split(',') : undefined,
  })
  // La validación se hace sobre lo que se va a servir, no sobre el bruto.
  const v = validarSeccionesAtlas(atlas)
  if (!v.ok) {
    throw new AtlasInvalido(`Atlas de ${codigoIne} no valida: ${v.errores.slice(0, 3).join(' | ')}`)
  }
  return atlas
}

/** Manifiesto de la última corrida con éxito, para mostrar cobertura real. */
export async function leerManifiestoSecciones(): Promise<{
  runId?: string
  generatedAt?: string
  counts?: Record<string, number>
} | null> {
  try {
    const url = `${seccionesR2Base()}/${SECCIONES_R2_MANIFEST_KEY}`
    const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as { runId?: string; generatedAt?: string; counts?: Record<string, number> }
  } catch {
    return null
  }
}
