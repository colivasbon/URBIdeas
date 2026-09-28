// Lectura del atlas de secciones censales desde R2 — SOLO SERVIDOR.
//
// El objeto publicado es COMPACTO (`series`); aquí se expande al contrato
// completo `SeccionesAtlasV1` que consumen la API, el mapa, el PNG y el XLSX.
//
// Caché: `unstable_cache` con etiqueta por municipio, siguiendo la convención
// de `socideas-r2.ts` (`socideas-muni-<ine>`). El fallo de validación se lanza
// DENTRO de la función cacheada para que un objeto corrupto no se guarde como
// respuesta válida.

import { unstable_cache } from 'next/cache'
import {
  SECCIONES_R2_PREFIX,
  SECCIONES_ATLAS_SCHEMA,
  expandirObservaciones,
  validarSeccionesAtlas,
  type SeccionesAtlasR2V1,
  type SeccionesAtlasV1,
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

  const observations: Record<
    string,
    Record<string, Record<string, SeccionesAtlasV1['observations'][string][string][string]>>
  > = {}
  for (const ind of compacto.indicators) {
    const ctx: ContextoObservacion = {
      ...baseCtx,
      sourceTable: ind.sourceTable,
      unit: ind.unidad,
      denominator: ind.denominador,
      sourceUrl: ind.url,
      operation: ind.operation,
      checksum: checksumDe(ind),
    }
    const parcial = expandirObservaciones(compacto.series, ctx, {
      anio: opciones.anio,
      indicadores: [ind.id],
    })
    for (const [seccion, porIndicador] of Object.entries(parcial)) {
      observations[seccion] = observations[seccion] ?? {}
      for (const [indicadorId, porPeriodo] of Object.entries(porIndicador)) {
        observations[seccion]![indicadorId] = porPeriodo
      }
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
    observations,
    municipalReference: compacto.municipalReference,
    quality: compacto.quality,
    sourceChecksums: compacto.sourceChecksums,
    generatedAt: compacto.generatedAt,
    schemaChecksum: compacto.schemaChecksum,
  }
}

/** Lectura cacheada del atlas listo para la API. `null` si no está publicado. */
export async function leerAtlasParaApi(
  codigoIne: string,
  opciones: OpcionesLecturaAtlas = {},
): Promise<SeccionesAtlasV1 | null> {
  const anio = opciones.anio ?? -1
  const inds = (opciones.indicadores ?? []).join(',')
  const tag = `socideas-muni-${codigoIne}`

  const leer = async (): Promise<SeccionesAtlasV1 | null> => {
    const compacto = await leerAtlasCompacto(codigoIne).catch(() => null)
    if (!compacto) return null
    const atlas = expandirAtlas(compacto, {
      anio: anio === -1 ? undefined : anio,
      indicadores: inds ? inds.split(',') : undefined,
    })
    // La validación se hace sobre lo que se va a servir, no sobre el bruto.
    const v = validarSeccionesAtlas(atlas)
    if (!v.ok) {
      throw new AtlasInvalido(
        `Atlas de ${codigoIne} no valida: ${v.errores.slice(0, 3).join(' | ')}`,
      )
    }
    return atlas
  }

  // `unstable_cache` solo puede cachear funciones sin argumentos no serializables;
  // el tag se fija en la clave de caché.
  //
  // Un municipio SIN atlas publicado NO debe quedar cacheado como «null» durante
  // una hora: si la ingesta llega después, Vercel seguiría sirviendo la ausencia
  // (y el usuario leería «no publicado» en vez de «todavía no cargado»). Por eso
  // la ausencia se lanza como error marcado: `unstable_cache` no almacena
  // resultados de una función que lanza, así que la próxima petición vuelve a
  // comprobar R2 y recoge el objeto en cuanto exista. Solo el atlas presente se
  // cachea (y se puede invalidar por tag tras una ingesta).
  const cached = unstable_cache(
    async () => {
      const atlas = await leer()
      if (!atlas) throw new AtlasNoPublicado(`Sin atlas publicado para ${codigoIne}`)
      return atlas
    },
    [codigoIne, String(anio), inds],
    { revalidate: 3600, tags: [tag] },
  )
  try {
    return await cached()
  } catch (e) {
    if (e instanceof AtlasNoPublicado || (e as { noPublicado?: boolean })?.noPublicado) return null
    throw e
  }
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
