import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { descargarSeccionesConFallback } from '@/lib/ine-secciones-geometry'
import {
  SECCIONES_ATRIBUCION,
  SECCIONES_ATLAS_SCHEMA,
  type GeoJsonFeatureCollection,
} from '@/lib/socideas-secciones'
import { leerAtlasParaApi } from '@/lib/socideas-secciones-store'

export const dynamic = 'force-dynamic'

/** La respuesta se sirve SIEMPRE fresca. El atlas de un municipio cambia con
 *  cada ingesta y una caché CDN de un día dejaba visible el estado «sin cargar»
 *  (o «sin indicadores») después de haberlo corregido en R2, porque
 *  `revalidateTag` purga la Data Cache del servidor pero no la copia CDN de
 *  esta respuesta. La caché real vive en `unstable_cache`, en el servidor, y se
 *  invalida por tag; aquí no se añade una segunda capa que pueda quedar obsoleta. */
const CACHE_GEOMETRIA = 'private, no-store'

const TOLERANCIA_SIMPLIFICACION = 8

/** Log de rendimiento solo en desarrollo: duración, colección y conteo.
 * Sin tokens, geometrías ni datos personales. */
function devLogSecciones(msg: string): void {
  if (process.env.NODE_ENV !== 'production') {
    console.debug(`[socideas][secciones] ${msg}`)
  }
}

/** GET /api/socideas/secciones/[codigoINE]: geometría de secciones censales del
 *  municipio más el atlas de indicadores cuando está publicado.
 *
 *  Dos caminos, y la UI se comporta bien con los dos:
 *   1. Atlas publicado en R2 → se sirve desde R2 (rápido y estable) y la
 *      geometría viene dentro del propio objeto. El navegador nunca llama al
 *      INE.
 *   2. Sin atlas → la geometría se pide al INE como proxy (comportamiento
 *      previo) y la UI muestra un estado vacío honesto, sin coropleta.
 *
 *  Nunca se descarga una capa nacional: siempre se filtra por CUMUN. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ codigoINE: string }> },
) {
  const { codigoINE } = await params
  if (!/^\d{5}$/.test((codigoINE ?? '').trim())) {
    return NextResponse.json({ data: null, error: 'Código INE inválido', count: 0 }, { status: 400 })
  }
  const ine = codigoINE.trim()
  const t0 = Date.now()

  // Solo se expande el año pedido: no se envían nueve años que el usuario no
  // está viendo. Rango validado para no confiar en el parámetro.
  const anioParam = request.nextUrl.searchParams.get('anio')
  const anioCrudo = anioParam ? Number.parseInt(anioParam, 10) : null
  const anio =
    anioCrudo !== null && Number.isInteger(anioCrudo) && anioCrudo >= 1900 && anioCrudo <= 2100
      ? anioCrudo
      : undefined
  const indicadorPedido = request.nextUrl.searchParams.get('ind') ?? undefined

  // ── 1. Atlas publicado en R2 (camino normal) ──────────────────────────────
  const atlas = await leerAtlasParaApi(ine, {
    anio,
    indicadores: indicadorPedido ? [indicadorPedido] : undefined,
  }).catch(() => null)

  if (atlas) {
    const geojson: GeoJsonFeatureCollection = {
      type: 'FeatureCollection',
      features: atlas.sections,
    }
    devLogSecciones(
      `ine=${ine} via=R2 secciones=${atlas.sections.length} indicadores=${atlas.indicators.length} ms=${Date.now() - t0}`,
    )
    return NextResponse.json(
      {
        data: {
          codigo_ine: ine,
          anio_delimitacion: atlas.geometryYear,
          fuente: atlas.geometrySource || SECCIONES_ATRIBUCION,
          n_secciones: atlas.sections.length,
          geojson,
          atlas: {
            schemaVersion: SECCIONES_ATLAS_SCHEMA,
            municipalityIne: atlas.municipalityIne,
            municipalityName: atlas.municipalityName,
            provinceName: atlas.provinceName,
            geometryYear: atlas.geometryYear,
            geometryCollection: atlas.geometryCollection,
            geometrySource: atlas.geometrySource,
            geometryCrs: atlas.geometryCrs,
            geometryRetrievedAt: atlas.geometryRetrievedAt,
            statsRetrievedAt: atlas.statsRetrievedAt,
            generatedAt: atlas.generatedAt,
            indicators: atlas.indicators,
            cobertura: atlas.cobertura,
            observations: atlas.observations,
            municipalReference: atlas.municipalReference,
            quality: atlas.quality,
            sourceChecksums: atlas.sourceChecksums,
            schemaChecksum: atlas.schemaChecksum,
            // `sections` se incluye para que el bloque sea AUTOCONTENIDO y
            // validable tal cual con `validarSeccionesAtlas`: sin él, la
            // comprobación del contrato fallaría por un campo que la API sí
            // sirve, en `data.geojson`. Es la misma geometría, no una copia
            // distinta: evita que mapa y validación puedan divergir.
            sections: atlas.sections,
          },
        },
        error: null,
        count: atlas.sections.length,
      },
      { headers: { 'Cache-Control': CACHE_GEOMETRIA } },
    )
  }

  // ── 2. Fallback: geometría bajo demanda desde el INE (sin estadística) ────
  try {
    const supabase = createSupabaseServer()
    const { data: muni } = await supabase
      .from('municipios')
      .select('nombre, provincia:provincias(nombre, comunidad_autonoma:comunidades_autonomas(nombre))')
      .eq('codigo_ine', ine)
      .single()
    if (!muni) {
      return NextResponse.json(
        { data: null, error: 'Municipio no encontrado', count: 0 },
        { status: 404 },
      )
    }

    const geo = await descargarSeccionesConFallback(ine, {
      toleranciaMetros: TOLERANCIA_SIMPLIFICACION,
    })
    devLogSecciones(
      `ine=${ine} via=INE coleccion=${geo.collection} n=${geo.features.length} ` +
        `agregados=${geo.agregadosDistrito.length} paginas=${geo.paginas} ms=${Date.now() - t0}`,
    )

    return NextResponse.json(
      {
        data: {
          codigo_ine: ine,
          anio_delimitacion: geo.geometryYear,
          fuente: SECCIONES_ATRIBUCION,
          n_secciones: geo.features.length,
          geojson: { type: 'FeatureCollection', features: geo.features } as GeoJsonFeatureCollection,
          // `atlas: null` es explícito: la UI muestra un estado vacío útil,
          // nunca una coropleta inventada ni valores(DB) atribuidos a secciones.
          atlas: null,
          avisos: [
            `Geometría oficial de ${geo.collection}. Este municipio todavía no tiene indicadores por sección cargados.`,
            `Se excluyeron ${geo.agregadosDistrito.length} polígonos agregados de distrito: no son secciones.`,
          ],
        },
        error: null,
        count: geo.features.length,
      },
      { headers: { 'Cache-Control': CACHE_GEOMETRIA } },
    )
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error interno del servidor'
    devLogSecciones(`ine=${ine} fallo (${mensaje}) ms=${Date.now() - t0}`)
    return NextResponse.json({ data: null, error: mensaje, count: 0 }, { status: 502 })
  }
}
