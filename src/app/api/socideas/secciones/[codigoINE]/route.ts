import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { descargarSeccionesConFallback } from '@/lib/ine-secciones-geometry'
import {
  SECCIONES_ATRIBUCION,
  SECCIONES_ATLAS_SCHEMA,
  esPoligonoDistrito,
  isValidSeccionKey,
  type GeoJsonFeatureCollection,
  type SeccionFeature,
  type SeccionesAtlasV1,
} from '@/lib/socideas-secciones'
import { leerAtlasParaApi } from '@/lib/socideas-secciones-store'
import {
  construirAtlasMinimo,
  fusionarAtlas,
  fusionarEducacion,
  fusionarPolitica,
  ganadorasPorSeccion,
  metadatosEducacion,
  metadatosPolitica,
  type MetadatosDominio,
} from '@/lib/socideas-secciones-extension'
import {
  educationR2Key,
  leerCatalogoEducativo,
  leerObjetoEducativo,
} from '@/lib/socideas-secciones-education-store'
import {
  leerCatalogoPolitico,
  leerCoberturaPolitica,
  leerResultadosElectorales,
  politicalR2Key,
} from '@/lib/socideas-secciones-political-store'
import type {
  ElectionType,
  PoliticalCatalog,
  PoliticalCoverageFile,
} from '@/lib/socideas-secciones-political'

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

interface MunicipioDb {
  codigo_ine: string
  nombre: string
  provincia: { nombre: string; comunidad_autonoma: { nombre: string } }
}

async function leerMunicipio(ine: string): Promise<MunicipioDb | null> {
  try {
    const supabase = createSupabaseServer()
    const { data } = await supabase
      .from('municipios')
      .select('nombre, provincia:provincias(nombre, comunidad_autonoma:comunidades_autonomas(nombre))')
      .eq('codigo_ine', ine)
      .single()
    if (!data) return null
    return { codigo_ine: ine, ...(data as unknown as Omit<MunicipioDb, 'codigo_ine'>) }
  } catch {
    return null
  }
}

function featuresValidas(features: SeccionFeature[]): SeccionFeature[] {
  return features.filter((f) => isValidSeccionKey(f.properties.CUSEC) && !esPoligonoDistrito(f.properties.CUSEC))
}

/** GET /api/socideas/secciones/[codigoINE]: geometría de secciones censales del
 *  municipio más el atlas de indicadores cuando está publicado.
 *
 *  1. Atlas base en R2 (`socideas/secciones/v1/municipal/`), si existe.
 *  2. Educación y Actividad del Censo Anual del INE, para los periodos
 *     realmente publicados (2021–2024).
 *  3. Política: resultados electorales por mesa agregados a sección, para la
 *     convocatoria pedida o, si no se pide, la más reciente del catálogo.
 *
 *  Si NO hay atlas base pero sí hay datos de un dominio, se construye un atlas
 *  MÍNIMO con la geometría oficial del INE del año del dato, de modo que el
 *  municipio tiene mapa, tabla, tooltip y PNG sin tocar el atlas base de R2.
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
  const anioPedido =
    anioCrudo !== null && Number.isInteger(anioCrudo) && anioCrudo >= 1900 && anioCrudo <= 2100 ? anioCrudo : null
  const indicadorPedido = request.nextUrl.searchParams.get('ind') ?? undefined
  const electionParam = request.nextUrl.searchParams.get('eleccion') ?? undefined
  const conCandidaturas = request.nextUrl.searchParams.get('cand') === '1'

  const avisos: string[] = []

  // ── 1. Atlas base (R2) ──────────────────────────────────────────────────
  const base = await leerAtlasParaApi(ine, {
    anio: anioPedido ?? undefined,
    indicadores: indicadorPedido ? [indicadorPedido] : undefined,
  }).catch(() => null)

  // ── 2. Educación + Actividad ─────────────────────────────────────────────
  const catEdu = await leerCatalogoEducativo().catch(() => null)
  const periodosPedidos = anioPedido && catEdu?.periods.includes(anioPedido) ? [anioPedido] : (catEdu?.periods ?? [])
  const objetosEdu = (
    await Promise.all(periodosPedidos.map((p) => leerObjetoEducativo(ine, p).catch(() => null)))
  ).filter((o): o is NonNullable<typeof o> => o !== null)
  const edu = fusionarEducacion(ine, objetosEdu)
  const dominios: Array<{ indicadores: typeof edu.indicadores; cobertura: typeof edu.cobertura; observaciones: typeof edu.observaciones }> = []
  if (edu.indicadores.length > 0) dominios.push(edu)
  const metadatos: MetadatosDominio[] = metadatosEducacion(objetosEdu, catEdu)

  // ── 3. Política ─────────────────────────────────────────────────────────
  const catPol: PoliticalCatalog | null = await leerCatalogoPolitico().catch(() => null)
  const eleccion = elegirConvocatoria(catPol, electionParam)
  let objetoPol = null
  let coberturaPol: PoliticalCoverageFile | null = null
  let entradaCobertura: Parameters<typeof fusionarPolitica>[1]['coverage'] = null
  if (eleccion) {
    objetoPol = await leerResultadosElectorales(ine, eleccion.electionType, eleccion.electionDate).catch(() => null)
    coberturaPol = await leerCoberturaPolitica(eleccion.electionType, eleccion.electionDate).catch(() => null)
    const porIne = coberturaPol?.municipalities?.[ine]
    if (porIne) {
      entradaCobertura = {
        publishable: porIne.publishable,
        reason: porIne.reason,
        correspondenceStatus: porIne.correspondenceStatus,
        reconciliationStatus: porIne.reconciliationStatus,
        coveragePercentage: porIne.coveragePercentage,
      }
    }
  }
  const pol = fusionarPolitica(objetoPol, {
    catalog: catPol,
    coverage: entradaCobertura,
    incluirCandidaturas: conCandidaturas,
    // La convocatoria pedida da el contexto aunque el municipio no tenga
    // objeto: sin ella, un municipio no publicable se etiquetaría como
    // «fuente no ingerida», que no es lo que ocurrió.
    electionId: eleccion?.electionId,
  })
  if (pol.indicadores.length > 0) dominios.push(pol)
  const metaPol = metadatosPolitica(pol)
  if (metaPol) metadatos.push(metaPol)

  // ── 4. Composición del atlas ────────────────────────────────────────────
  const hayBase = base !== null
  let atlas: SeccionesAtlasV1 | null = null
  let via: 'R2' | 'R2+dominios' | 'INE+dominios' | 'ninguno' = 'ninguno'

  if (base) {
    atlas = fusionarAtlas(base, dominios)
    via = dominios.length > 0 ? 'R2+dominios' : 'R2'
  } else if (dominios.length > 0) {
    // Municipios SIN atlas base: geometría oficial del INE del año del dato.
    const anyEdu = objetosEdu[0]
    const anioGeo = anioPedido ?? (anyEdu ? anyEdu.period : null) ?? Number.parseInt(eleccion?.electionDate.slice(0, 4) ?? '2024', 10)
    const geo = await descargarSeccionesConFallback(ine, { toleranciaMetros: TOLERANCIA_SIMPLIFICACION }).catch(() => null)
    const municipio = await leerMunicipio(ine)
    if (geo && geo.features.length > 0) {
      const feats = featuresValidas(geo.features)
      const entradas = [
        ...metadatosEducacion(objetosEdu, catEdu).map((m, i) => ({
          indicador: edu.indicadores[i] ?? edu.indicadores[0],
          periodo: m.periods[0] ?? anioGeo,
          fuente: m.organism,
          sourceTable: m.sourceTable,
          operation: m.sourceTable,
          operationLabel: m.sourceTable,
          url: m.sourceUrl,
          retrievedAt: m.periods.length ? objetosEdu[0]?.source.retrieved_at ?? '' : '',
          checksum: objetosEdu[0]?.content_sha256 ?? '',
          universo: m.label,
          denominador: null,
          definicion: m.method,
          unidad: '',
        })),
      ].filter((e) => e.indicador)
      atlas = construirAtlasMinimo({
        municipioIne: ine,
        municipioNombre: municipio?.nombre ?? ine,
        provinciaNombre: municipio?.provincia?.nombre ?? null,
        features: feats,
        geometryYear: geo.geometryYear,
        geometryCollection: geo.collection,
        geometrySource: SECCIONES_ATRIBUCION,
        geometryCrs: 'EPSG:4326',
        geometryRetrievedAt: new Date().toISOString(),
        indicadores: [...edu.indicadores, ...pol.indicadores],
        cobertura: [...edu.cobertura, ...pol.cobertura],
        observaciones: { ...edu.observaciones, ...pol.observaciones },
        entradas: entradas as never,
        statsRetrievedAt: new Date().toISOString(),
      })
      via = 'INE+dominios'
      avisos.push(
        `Este municipio no tiene atlas base publicado; se ha construido uno en lectura con la geometría oficial ${geo.collection} y los indicadores de los dominios cargados. No se ha escrito ningún objeto nuevo.`,
      )
      if (geo.agregadosDistrito.length) {
        avisos.push(`Se excluyeron ${geo.agregadosDistrito.length} polígonos agregados de distrito: no son secciones.`)
      }
    }
  }

  if (atlas) {
    const geojson: GeoJsonFeatureCollection = { type: 'FeatureCollection', features: atlas.sections }
    devLogSecciones(
      `ine=${ine} via=${via} secciones=${atlas.sections.length} indicadores=${atlas.indicators.length} edu=${edu.indicadores.length} pol=${pol.indicadores.length} ms=${Date.now() - t0}`,
    )
    return NextResponse.json(
      {
        data: {
          codigo_ine: ine,
          anio_delimitacion: atlas.geometryYear,
          fuente: atlas.geometrySource || SECCIONES_ATRIBUCION,
          n_secciones: atlas.sections.length,
          via,
          geojson,
          dominios: {
            educacion: {
              periodos: edu.periodos,
              indicadores: edu.indicadores.length,
              observaciones: edu.observations,
              nd: edu.nd,
              supresiones: edu.suppressed,
              secciones_all_nd: edu.allNdSections,
              claves: {
                catalogo: 'socideas/secciones/v1/education/catalog.json',
                normalizado: edu.periodos.length ? educationR2Key(ine, edu.periodos[0] as number) : null,
              },
            },
            actividad: {
              periodos: edu.periodos,
              indicadores: edu.indicadores.filter((i) => i.tema === 'laboral').length,
            },
            politica: {
              // El catálogo se sirve entero: la interfaz nunca fija convocatorias.
              catalog: (catPol?.elections ?? []).map((e) => ({
                electionId: e.electionId,
                electionType: e.electionType,
                electionDate: e.electionDate,
                label: e.label,
                territoryCode: e.territoryCode,
                municipalities: e.municipalities,
                publishableMunicipalities: e.publishableMunicipalities,
                sections: e.sections,
                pollingStations: e.pollingStations,
              })),
              electionId: pol.electionId,
              electionType: pol.electionType,
              electionDate: pol.electionDate,
              status: pol.status,
              mesas_agregadas: pol.mesas,
              indicadores: pol.indicadores.length,
              candidaturas: pol.candidacies,
              ganadoras: ganadorasPorSeccion(objetoPol),
              totales: objetoPol
                ? {
                    censo: objetoPol.totals.census,
                    votantes: objetoPol.totals.voters,
                    validos: objetoPol.totals.validVotes,
                    blancos: objetoPol.totals.blankVotes,
                    nulos: objetoPol.totals.nullVotes,
                    candidaturas: objetoPol.totals.candidacyVotes,
                  }
                : null,
              conciliacion: objetoPol
                ? {
                    status: objetoPol.reconciliation.status,
                    reference: objetoPol.reconciliation.reference,
                    differences: objetoPol.reconciliation.differences,
                    notes: objetoPol.reconciliation.notes,
                  }
                : null,
              geometria: objetoPol
                ? {
                    year: objetoPol.geometry.geometryYear,
                    correspondenceStatus: objetoPol.geometry.correspondenceStatus,
                    resultSections: objetoPol.geometry.resultSections,
                    geometrySections: objetoPol.geometry.geometrySections,
                    matchedSections: objetoPol.geometry.matchedSections,
                    coveragePercentage: objetoPol.geometry.coveragePercentage,
                    notes: objetoPol.geometry.notes,
                  }
                : null,
              publicacion: objetoPol ? objetoPol.publication : null,
              notas: pol.notes.slice(0, 8),
              claves: {
                objeto: objetoPol ? politicalR2Key(ine, pol.electionType, pol.electionDate) : null,
              },
            },
          },
          metadatos,
          avisos: avisos.concat(
            edu.periodos.length === 0
              ? ['Sin datos educativos publicados para este municipio en los periodos del catálogo.']
              : [],
            pol.status !== 'available' && eleccion
              ? [`Política: ${pol.status}. ${pol.notes[0] ?? ''}`.trim()]
              : [],
          ),
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
            sections: atlas.sections,
          },
        },
        error: null,
        count: atlas.sections.length,
      },
      { headers: { 'Cache-Control': CACHE_GEOMETRIA } },
    )
  }

  // ── 5. Fallback: geometría bajo demanda desde el INE (sin estadística) ────
  try {
    const municipio = await leerMunicipio(ine)
    if (!municipio) {
      return NextResponse.json({ data: null, error: 'Municipio no encontrado', count: 0 }, { status: 404 })
    }

    const geo = await descargarSeccionesConFallback(ine, {
      toleranciaMetros: TOLERANCIA_SIMPLIFICACION,
    })
    devLogSecciones(
      `ine=${ine} via=INE coleccion=${geo.collection} n=${geo.features.length} agregados=${geo.agregadosDistrito.length} paginas=${geo.paginas} ms=${Date.now() - t0}`,
    )

    return NextResponse.json(
      {
        data: {
          codigo_ine: ine,
          anio_delimitacion: geo.geometryYear,
          fuente: SECCIONES_ATRIBUCION,
          n_secciones: geo.features.length,
          via: 'INE',
          geojson: { type: 'FeatureCollection', features: geo.features } as GeoJsonFeatureCollection,
          dominios: {
            educacion: { periodos: edu.periodos, indicadores: edu.indicadores.length },
            politica: { status: pol.status, electionId: pol.electionId },
          },
          metadatos,
          // `atlas: null` es explícito: la UI muestra un estado vacío útil,
          // nunca una coropleta inventada ni valores(DB) atribuidos a secciones.
          atlas: null,
          avisos: [
            `Geometría oficial de ${geo.collection}. Este municipio todavía no tiene indicadores por sección cargados.`,
            `Se excluyeron ${geo.agregadosDistrito.length} polígonos agregados de distrito: no son secciones.`,
          ].concat(avisos),
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

/** Elige la convocatoria: la pedida si existe en el catálogo; si no, la más
 *  reciente por tipo de elección. Nunca se hardcodea ninguna convocatoria. */
/** Elige la convocatoria: la pedida si existe en el catálogo; si no, la más
 *  reciente por tipo de elección. Nunca se hardcodea ninguna convocatoria.
 *  Devuelve también el `electionId` del catálogo, que es la clave con la que
 *  se guardan cobertura, manifiesto y catálogo: sin ella, un municipio sin
 *  objeto se etiquetaría como fuente no ingerida, que no es lo ocurrido. */
function elegirConvocatoria(
  cat: PoliticalCatalog | null,
  pedido: string | undefined,
): { electionId: string; electionType: ElectionType; electionDate: string } | null {
  const lista = cat?.elections ?? []
  if (lista.length === 0) return null
  if (pedido) {
    const enc = lista.find((e) => e.electionId === pedido)
    if (enc) return { electionId: enc.electionId, electionType: enc.electionType, electionDate: enc.electionDate }
  }
  const orden = (a: (typeof lista)[number], b: (typeof lista)[number]) =>
    a.electionDate < b.electionDate ? 1 : a.electionDate > b.electionDate ? -1 : 0
  const copia = [...lista].sort(orden)
  const elegida = copia[0] as (typeof lista)[number]
  return { electionId: elegida.electionId, electionType: elegida.electionType, electionDate: elegida.electionDate }
}
