import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { descargarSeccionesConFallback } from '@/lib/ine-secciones-geometry'
import {
  SECCIONES_ATRIBUCION,
  esPoligonoDistrito,
  isValidSeccionKey,
  type SeccionFeature,
} from '@/lib/socideas-secciones'
import { leerCompactoValidado } from '@/lib/socideas-secciones-store'
import {
  SECCIONES_BOOTSTRAP_SCHEMA,
  SECCIONES_DATASET_PATH,
  atlasBootstrapDe,
  featuresComoGeoJson,
  type SeccionesAtlasBootstrap,
  type SeccionesBootstrap,
  type SeccionesBootstrapDominios,
  type DominioSecciones,
} from '@/lib/socideas-secciones-dataset'
import {
  construirAtlasMinimo,
  fusionarCatalogos,
  fusionarEducacion,
  fusionarPolitica,
  metadatosEducacion,
  metadatosPolitica,
  type MetadatosDominio,
  type ResultadoFusionEducacion,
  type ResultadoFusionPolitica,
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
  PoliticalMunicipalObject,
} from '@/lib/socideas-secciones-political'

export const dynamic = 'force-dynamic'

/** La respuesta se sirve SIEMPRE fresca. El atlas de un municipio cambia con
 *  cada ingesta y una caché CDN de un día dejaba visible el estado «sin cargar»
 *  (o «sin indicadores») después de haberlo corregido en R2, porque
 *  `revalidateTag` purga la Data Cache del servidor pero no la copia CDN de
 *  esta respuesta. La caché real vive en `unstable_cache`, en el servidor, y se
 *  invalida por tag; aquí no se añade una segunda capa que pueda quedar obsoleta.
 *
 *  Este endpoint es el BOOTSTRAP: geometría, catálogos, cobertura, avisos y la
 *  validación del servidor. Los VALORES viajan aparte, en
 *  `/api/socideas/secciones-dataset/{ine}`, y ese sí se cachea en el servidor
 *  con la misma etiqueta `socideas-muni-<ine>` porque el bloque es pequeño.
 *  Ver `socideas-secciones-dataset.ts` para el porqué del contrato antiguo
 *  (304,5 MB y un HTTP 500 intermitente en Madrid). */
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

function esSeccionValida(f: SeccionFeature): boolean {
  return isValidSeccionKey(f.properties.CUSEC) && !esPoligonoDistrito(f.properties.CUSEC)
}

/** GET /api/socideas/secciones/[codigoINE]: BOOTSTRAP de las secciones censales
 *  del municipio. Geometría UNA vez, catálogos, cobertura, disponibilidad y
 *  configuración. SIN valores.
 *
 *  Antes esta ruta devolvía también `atlas.observations` completo. Para Madrid
 *  eran 298 MB de los 304,5 MB de respuesta (98,9 %) y obligaban a rehidratar
 *  521 944 objetos × 20 propiedades en una lambda de 1 GB: 1,5–2,5 GB de heap y
 *  un HTTP 500 intermitente (~30 %). Ningún componente lee más de un indicador y
 *  un periodo a la vez, así que el ~99,5 % de esos bytes no lo usaba nadie.
 *
 *  1. Atlas base en R2 (`socideas/secciones/v1/municipal/`), si existe.
 *  2. Educación y Actividad del Censo Anual del INE, para los periodos
 *     realmente publicados.
 *  3. Política: estado real de la convocatoria pedida o, si no se pide, de la más
 *     reciente del catálogo. Las ganadoras por sección (0,9 MB en Madrid) NO
 *     van aquí: se piden con `?dominio=politica&bloque=ganadoras`.
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

  const anioParam = request.nextUrl.searchParams.get('anio')
  const anioCrudo = anioParam ? Number.parseInt(anioParam, 10) : null
  const anioPedido =
    anioCrudo !== null && Number.isInteger(anioCrudo) && anioCrudo >= 1900 && anioCrudo <= 2100 ? anioCrudo : null
  const electionParam = request.nextUrl.searchParams.get('eleccion') ?? undefined
  const conCandidaturas = request.nextUrl.searchParams.get('cand') === '1'

  const avisos: string[] = []

  // ── 1. Atlas base (R2), en forma compacta: aquí no se rehidrata nada ───────
  // Fail-closed: un objeto que no valida NO se sirve. Tampoco se degrada en
  // silencio a «municipio sin atlas», porque eso leería «no publicado» cuando en
  // realidad hay un objeto corrupto: el motivo baja en `validacion` y en `avisos`.
  let base: Awaited<ReturnType<typeof leerCompactoValidado>> = null
  let falloAtlas: string | null = null
  try {
    base = await leerCompactoValidado(ine)
  } catch (e) {
    base = null
    falloAtlas = e instanceof Error ? e.message : String(e)
    avisos.push(
      `El atlas publicado de ${ine} no supera la validación y NO se ha servido: ${falloAtlas}. ` +
        'Los valores de este municipio no están disponibles hasta que la ingesta se corrija.',
    )
  }

  // ── 2. Educación + Actividad ─────────────────────────────────────────────
  // `conObservaciones: false` recorre conteos y cobertura (barato) pero NO crea
  // un objeto de observación por celda (caro). Sin este filtro, educación y
  // política materializaban los 20 + N indicadores completos (~40 MB) aunque el
  // atlas base ya viniera filtrado, y el arreglo no serviría de nada.
  const catEdu = await leerCatalogoEducativo().catch(() => null)
  const periodosPedidos = anioPedido && catEdu?.periods.includes(anioPedido) ? [anioPedido] : (catEdu?.periods ?? [])
  const objetosEdu = (
    await Promise.all(periodosPedidos.map((p) => leerObjetoEducativo(ine, p).catch(() => null)))
  ).filter((o): o is NonNullable<typeof o> => o !== null)
  const edu: ResultadoFusionEducacion = fusionarEducacion(ine, objetosEdu, { conObservaciones: false })
  const dominios: Array<Pick<ResultadoFusionEducacion, 'indicadores' | 'cobertura'>> = []
  if (edu.indicadores.length > 0) dominios.push(edu)
  const metadatos: MetadatosDominio[] = metadatosEducacion(objetosEdu, catEdu)

  // ── 3. Política ─────────────────────────────────────────────────────────
  const catPol: PoliticalCatalog | null = await leerCatalogoPolitico().catch(() => null)
  const eleccion = elegirConvocatoria(catPol, electionParam)
  let objetoPol: PoliticalMunicipalObject | null = null
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
  const pol: ResultadoFusionPolitica = fusionarPolitica(objetoPol, {
    catalog: catPol,
    coverage: entradaCobertura,
    incluirCandidaturas: conCandidaturas,
    conObservaciones: false,
    // La convocatoria pedida da el contexto aunque el municipio no tenga
    // objeto: sin ella, un municipio no publicable se etiquetaría como
    // «fuente no ingerida», que no es lo que ocurrió.
    electionId: eleccion?.electionId,
  })
  if (pol.indicadores.length > 0) dominios.push(pol)
  const metaPol = metadatosPolitica(pol)
  if (metaPol) metadatos.push(metaPol)

  // ── 4. Catálogo único: base + dominios, sin observaciones ───────────────
  const catalogo = fusionarCatalogos({
    indicadoresBase: base?.compacto.indicators ?? [],
    coberturaBase: base?.compacto.cobertura ?? [],
    checksumsBase: base?.compacto.sourceChecksums ?? {},
    dominios,
  })

  // ── 5. Composición del atlas ────────────────────────────────────────────
  const hayBase = base !== null
  let atlas: SeccionesAtlasBootstrap | null = null
  let features: SeccionFeature[] = base?.compacto.sections ?? []
  let via: SeccionesBootstrap['via'] = 'ninguno'
  let municipioNombre = base?.compacto.municipalityName ?? ine
  let provinciaNombre = base?.compacto.provinceName ?? ''
  let comunidadNombre: string | null = null

  if (base) {
    atlas = { ...atlasBootstrapDe(base.compacto), ...catalogo }
    via = dominios.length > 0 ? 'R2+dominios' : 'R2'
  } else if (dominios.length > 0) {
    // Municipios SIN atlas base (o con un atlas que no valida): geometría
    // oficial del INE del año del dato.
    const anyEdu = objetosEdu[0]
    const anioGeo =
      anioPedido ?? (anyEdu ? anyEdu.period : null) ?? Number.parseInt(eleccion?.electionDate.slice(0, 4) ?? '2024', 10)
    const geo = await descargarSeccionesConFallback(ine, { toleranciaMetros: TOLERANCIA_SIMPLIFICACION }).catch(() => null)
    const municipio = await leerMunicipio(ine)
    if (geo && geo.features.length > 0) {
      const feats = geo.features.filter(esSeccionValida)
      const entradas = metadatosEducacion(objetosEdu, catEdu)
        .map((m, i) => ({
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
        }))
        .filter((e) => e.indicador)
      const minimo = construirAtlasMinimo({
        municipioIne: ine,
        municipioNombre: municipio?.nombre ?? ine,
        provinciaNombre: municipio?.provincia?.nombre ?? null,
        features: feats,
        geometryYear: geo.geometryYear,
        geometryCollection: geo.collection,
        geometrySource: SECCIONES_ATRIBUCION,
        geometryCrs: 'EPSG:4326',
        geometryRetrievedAt: new Date().toISOString(),
        indicadores: catalogo.indicadores,
        cobertura: catalogo.cobertura,
        // El bootstrap no lleva observaciones. Las secciones con dato las declara
        // la propia fusión: sin pasarlas, `quality` diría «ninguna sección con
        // fila» y `status: failed`, que es falso.
        observaciones: {},
        entradas: entradas as never,
        statsRetrievedAt: new Date().toISOString(),
        seccionesConFila: [...new Set([...edu.seccionesConDato, ...pol.seccionesConDato])],
      })
      // El atlas mínimo solo se usa por su cabecera y su `quality`: la geometría
      // se sirve una vez en `geojson` y los valores, en el bloque de dataset.
      atlas = {
        schemaVersion: minimo.schemaVersion,
        municipalityIne: minimo.municipalityIne,
        municipalityName: minimo.municipalityName,
        provinceName: minimo.provinceName,
        geometryYear: minimo.geometryYear,
        geometryCollection: minimo.geometryCollection,
        geometrySource: minimo.geometrySource,
        geometryCrs: minimo.geometryCrs,
        geometryRetrievedAt: minimo.geometryRetrievedAt,
        statsRetrievedAt: minimo.statsRetrievedAt,
        generatedAt: minimo.generatedAt,
        indicators: minimo.indicators,
        cobertura: minimo.cobertura,
        municipalReference: minimo.municipalReference,
        quality: minimo.quality,
        sourceChecksums: minimo.sourceChecksums,
        observations: {},
      }
      features = feats
      municipioNombre = municipio?.nombre ?? ine
      provinciaNombre = municipio?.provincia?.nombre ?? ''
      comunidadNombre = municipio?.provincia?.comunidad_autonoma?.nombre ?? null
      via = 'INE+dominios'
      avisos.push(
        `Este municipio no tiene atlas base publicado; se ha construido uno en lectura con la geometría oficial ${geo.collection} y los indicadores de los dominios cargados. No se ha escrito ningún objeto nuevo.`,
      )
      if (geo.agregadosDistrito.length) {
        avisos.push(`Se excluyeron ${geo.agregadosDistrito.length} polígonos agregados de distrito: no son secciones.`)
      }
    }
  }

  const geojson = featuresComoGeoJson(features, esSeccionValida)

  if (atlas) {
    const dominiosIds: DominioSecciones[] = []
    if (hayBase) dominiosIds.push('base')
    if (edu.indicadores.length > 0) dominiosIds.push('educacion')
    if (pol.indicadores.length > 0) dominiosIds.push('politica')
    const periodosCatalogo = [
      ...new Set([
        ...(base?.compacto.cobertura ?? []).flatMap((c) => c.periodos),
        ...edu.periodos,
        ...(pol.electionDate ? [Number.parseInt(pol.electionDate.slice(0, 4), 10)] : []),
      ]),
    ].sort((a, b) => b - a)

    const bootstrap: SeccionesBootstrap = {
      schemaVersion: SECCIONES_BOOTSTRAP_SCHEMA,
      codigo_ine: ine,
      anio_delimitacion: atlas.geometryYear,
      fuente: atlas.geometrySource || SECCIONES_ATRIBUCION,
      n_secciones: geojson.features.length,
      via,
      municipio: {
        codigo_ine: ine,
        nombre: municipioNombre,
        provincia: provinciaNombre || null,
        comunidad_autonoma: comunidadNombre,
      },
      geojson,
      atlas,
      dominios: bloqueDominios(
        ine,
        edu,
        pol,
        catPol,
        catEdu,
        base?.compacto.indicators.length ?? 0,
        objetoPol,
      ),
      metadatos,
      avisos: avisos.concat(
        edu.periodos.length === 0
          ? ['Sin datos educativos publicados para este municipio en los periodos del catálogo.']
          : [],
        pol.status !== 'available' && eleccion ? [`Política: ${pol.status}. ${pol.notes[0] ?? ''}`.trim()] : [],
        `Contrato bajo demanda: ${catalogo.indicadores.length} indicadores disponibles sobre ${geojson.features.length} secciones. Los valores se piden por bloque, no vienen aquí.`,
      ),
      config: {
        dominios: dominiosIds,
        periodos: periodosCatalogo,
        periodo_por_defecto: periodoPorDefectoDeCatalogo(catalogo.cobertura),
        n_indicadores: catalogo.indicadores.length,
        cache: base
          ? { via: base.via, motivo: base.motivo }
          : { via: 'ninguno', motivo: 'Este municipio no tiene atlas base publicado: la geometría viene del INE.' },
      },
      // Fail-closed en el servidor. El cliente ya NO puede validar el atlas:
      // no recibe `observations`, así que este veredicto es la única garantía.
      validacion: falloAtlas
        ? { ok: false, errores: [falloAtlas], avisos: [] }
        : (base?.validacion ?? { ok: true, errores: [], avisos: [] }),
      dataset: {
        endpoint: `${SECCIONES_DATASET_PATH}/${ine}`,
        params: { dominio: 'base', indicador: '<id de atlas.indicators[]>', periodo: '<YYYY>' },
        nota:
          'Esta respuesta no lleva valores. Se piden por indicador y periodo: ' +
          `${SECCIONES_DATASET_PATH}/{ine}?dominio=base&ind={id}&periodo={YYYY}. ` +
          'El cliente rehidrata {p,v,s} contra atlas.indicators[] con expandirIndicadorCompacto.',
      },
    }

    devLogSecciones(
      `ine=${ine} via=${via} secciones=${geojson.features.length} indicadores=${catalogo.indicadores.length} ` +
        `edu=${edu.indicadores.length} pol=${pol.indicadores.length} ms=${Date.now() - t0}`,
    )
    return NextResponse.json(
      { data: bootstrap, error: null, count: geojson.features.length },
      { headers: { 'Cache-Control': CACHE_GEOMETRIA, 'X-SOCIDEAS-CONTRATO': SECCIONES_BOOTSTRAP_SCHEMA } },
    )
  }

  // ── 6. Fallback: geometría bajo demanda desde el INE (sin estadística) ────
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
    const geoSinDistritos = featuresComoGeoJson(geo.features, esSeccionValida)

    const bootstrap: SeccionesBootstrap = {
      schemaVersion: SECCIONES_BOOTSTRAP_SCHEMA,
      codigo_ine: ine,
      anio_delimitacion: geo.geometryYear,
      fuente: SECCIONES_ATRIBUCION,
      n_secciones: geoSinDistritos.features.length,
      via: 'INE',
      municipio: {
        codigo_ine: ine,
        nombre: municipio.nombre,
        provincia: municipio.provincia?.nombre ?? null,
        comunidad_autonoma: municipio.provincia?.comunidad_autonoma?.nombre ?? null,
      },
      geojson: geoSinDistritos,
      // `atlas: null` es explícito: la UI muestra un estado vacío útil, nunca
      // una coropleta inventada ni valores(DB) atribuidos a secciones.
      atlas: null,
      dominios: bloqueDominios(ine, edu, pol, catPol, catEdu, 0, objetoPol),
      metadatos,
      avisos: [
        `Geometría oficial de ${geo.collection}. Este municipio todavía no tiene indicadores por sección cargados.`,
        `Se excluyeron ${geo.agregadosDistrito.length} polígonos agregados de distrito: no son secciones.`,
      ].concat(avisos),
      config: {
        dominios: [],
        periodos: edu.periodos,
        periodo_por_defecto: null,
        n_indicadores: 0,
        cache: { via: 'ninguno', motivo: 'Sin atlas base: la geometría se descarga del INE en cada petición.' },
      },
      validacion: { ok: true, errores: [], avisos: [] },
      dataset: {
        endpoint: `${SECCIONES_DATASET_PATH}/${ine}`,
        params: { dominio: 'base', indicador: '<id de atlas.indicators[]>' },
        nota: 'Este municipio no tiene indicadores por sección publicados: el endpoint de dataset devolverá 404.',
      },
    }

    return NextResponse.json(
      { data: bootstrap, error: null, count: geoSinDistritos.features.length },
      { headers: { 'Cache-Control': CACHE_GEOMETRIA, 'X-SOCIDEAS-CONTRATO': SECCIONES_BOOTSTRAP_SCHEMA } },
    )
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error interno del servidor'
    devLogSecciones(`ine=${ine} fallo (${mensaje}) ms=${Date.now() - t0}`)
    return NextResponse.json({ data: null, error: mensaje, count: 0 }, { status: 502 })
  }
}

/** Bloques por dominio del bootstrap. Nada de aquí lleva observaciones ni
 *  ganadoras: son catálogos, conteos, totales y las claves de R2. */
function bloqueDominios(
  ine: string,
  edu: ResultadoFusionEducacion,
  pol: ResultadoFusionPolitica,
  catPol: PoliticalCatalog | null,
  catEdu: { periods: number[] } | null,
  nIndicadoresBase: number,
  objetoPol: PoliticalMunicipalObject | null,
): SeccionesBootstrapDominios {
  return {
    educacion: {
      periodos: edu.periodos,
      indicadores: edu.indicadores.length,
      indicadores_base: nIndicadoresBase,
      // Antes era el mapa entero de observaciones (decenas de MB que ningún
      // componente leía completo). Ahora es un recuento: el mapa son decenas de
      // MB y su lugar es el bloque de dataset.
      observaciones: edu.observations,
      nd: edu.nd,
      supresiones: edu.suppressed,
      secciones_all_nd: edu.allNdSections,
      secciones_con_dato: edu.seccionesConDato.length,
      periodos_catalogo: catEdu?.periods ?? [],
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
      // Las ganadoras salen del bootstrap: 0,9 MB en Madrid y sus votos ya
      // están en el bloque del dataset. Solo se piden si la pestaña las pinta.
      ganadoras_endpoint: `${SECCIONES_DATASET_PATH}/${ine}?dominio=politica&bloque=ganadoras`,
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
  }
}

/** Periodo por defecto del catálogo: el más reciente con `periodoPorDefecto`. */
function periodoPorDefectoDeCatalogo(
  cobertura: Array<{ periodoPorDefecto: number | null }>,
): number | null {
  const definidos = cobertura
    .map((c) => c.periodoPorDefecto)
    .filter((p): p is number => typeof p === 'number')
  return definidos.length > 0 ? Math.max(...definidos) : null
}

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