import { NextRequest, NextResponse } from 'next/server'
import {
  type ResultadoValidacion,
  type SeccionIndicador,
  type SeccionesSeriesDeIndicador,
} from '@/lib/socideas-secciones'
import { cachearBloque, leerCompactoValidado } from '@/lib/socideas-secciones-store'
import {
  SECCIONES_DATASET_SCHEMA,
  construirBloqueDataset,
  compactarObservacionesIndicador,
  esBloquePolitica,
  esDominioSecciones,
  extraerSerieIndicador,
  validarGanadoras,
  validarSerieBloque,
  periodoPorDefectoDe,
  type DominioSecciones,
  type SeccionesDatasetBloque,
} from '@/lib/socideas-secciones-dataset'
import {
  fusionarEducacion,
  fusionarPolitica,
  ganadorasPorSeccion,
} from '@/lib/socideas-secciones-extension'
import { leerCatalogoEducativo, leerObjetoEducativo } from '@/lib/socideas-secciones-education-store'
import {
  leerCatalogoPolitico,
  leerResultadosElectorales,
} from '@/lib/socideas-secciones-political-store'
import type { ElectionType, PoliticalCatalog, PoliticalMunicipalObject } from '@/lib/socideas-secciones-political'
import { elegirConvocatoria } from '@/lib/socideas-secciones-dataset'

export const dynamic = 'force-dynamic'

/** Igual que en el bootstrap: la respuesta HTTP se sirve fresca y la frescura
 *  la gobierna el Data Cache del servidor, invalidado por la etiqueta
 *  `socideas-muni-<ine>` tras cada ingesta. Una caché CDN aquí haría que una
 *  corrección en R2 tardara hasta un día en verse. */
const CACHE_DATASET = 'private, no-store'

const ANIO_MIN = 1900
const ANIO_MAX = 2100

/** Fallo con código HTTP. Los errores de dominio (no hay atlas, no hay
 *  convocatoria, el indicador no existe) NO son fallos internos: son 404 con
 *  su motivo, y el cliente los necesita para pintar el estado vacío.
 *
 *  Se reconoce POR PROPIEDAD, no por prototipo: un error lanzado dentro de
 *  `unstable_cache` puede cruzar el límite sin conservar la clase (mismo
 *  criterio que `AtlasNoPublicado` en `socideas-secciones-store.ts`). */
class BloqueNoDisponible extends Error {
  readonly noDisponible = true as const
  readonly status: number
  constructor(mensaje: string, status: number) {
    super(mensaje)
    this.status = status
    this.name = 'BloqueNoDisponible'
  }
}

function esNoDisponible(e: unknown): e is BloqueNoDisponible {
  if (e instanceof BloqueNoDisponible) return true
  return (e as { noDisponible?: boolean })?.noDisponible === true
}

function devLog(msg: string): void {
  if (process.env.NODE_ENV !== 'production') {
    console.debug(`[socideas][secciones-dataset] ${msg}`)
  }
}

function error(mensaje: string, status: number): NextResponse {
  return NextResponse.json({ data: null, error: mensaje, count: 0 }, { status })
}

function anioValido(v: string | null): number | null {
  if (v === null) return null
  const n = Number.parseInt(v, 10)
  return Number.isInteger(n) && n >= ANIO_MIN && n <= ANIO_MAX ? n : null
}

function okValidacion(): ResultadoValidacion {
  return { ok: true, errores: [], avisos: [] }
}

/** Bloque de un indicador electoral o de la convocatoria completa. */
interface SerieServida {
  tipo: 'serie'
  convocatoria: string | null
  serie: SeccionesSeriesDeIndicador
  nValores: number
  periodo: number | null
  periodoClave: string | null
  meta: SeccionIndicador | null
  nSecciones: number
  validacion: ResultadoValidacion
}

/** GET /api/socideas/secciones-dataset/[codigoINE]: valores seccionales de UN
 *  indicador y UN periodo, en la forma columnar `{p,v,s}` que ya está publicada
 *  en R2, SIN rehidratar nada.
 *
 *  Parámetros
 *    dominio      `base` (por defecto) | `educacion` | `politica`
 *    ind          id del indicador. OBLIGATORIO salvo en `bloque=ganadoras`:
 *                 un bloque es de un indicador. Pedirlos todos son los 298 MB
 *                 que este contrato elimina.
 *    periodo      `YYYY` opcional. Si falta se usa el `periodoPorDefecto` que
 *                 declara la cobertura del indicador; nunca se inventa un año.
 *    convocatoria `electionId` (solo política). Si falta, la más reciente del
 *                 catálogo; nunca se hardcodea ninguna.
 *    bloque       `ganadoras` (solo política): la tabla de ganadoras por
 *                 sección, 0,9 MB en Madrid, que sale del bootstrap porque sus
 *                 votos ya están en el bloque de dataset.
 *
 *  Tamaño (Madrid, 2 462 secciones): ~0,15 MB por indicador y periodo, frente a
 *  los 298 MB de `observations` del contrato antiguo.
 *
 *  Caché: `unstable_cache` con clave `[ine, dominio, indicador, periodo,
 *  convocatoria]` y la etiqueta `socideas-muni-<ine>`, la misma que purga
 *  `/api/socideas/revalidate` tras una ingesta. El bloque va muy por debajo del
 *  límite del Data Cache, así que aquí sí se cachea: de paso Madrid, que hoy no
 *  cachea nada porque su objeto de R2 son 7,8 MB, deja de releerlo. Si un bloque
 *  exceediera ese límite se serviría SIN cachear, con el motivo en la respuesta,
 *  sin tumbar el resto de rutas. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ codigoINE: string }> },
) {
  const { codigoINE } = await params
  if (!/^\d{5}$/.test((codigoINE ?? '').trim())) {
    return error('Código INE inválido', 400)
  }
  const ine = codigoINE.trim()
  const t0 = Date.now()
  const q = request.nextUrl.searchParams

  const dominioParam = q.get('dominio') ?? 'base'
  if (!esDominioSecciones(dominioParam)) {
    return error(`Dominio desconocido: "${dominioParam}"`, 400)
  }
  const dominio: DominioSecciones = dominioParam
  const bloque = q.get('bloque')
  if (bloque !== null && !esBloquePolitica(bloque)) {
    return error(`Bloque desconocido: "${bloque}"`, 400)
  }
  if (bloque !== null && dominio !== 'politica') {
    return error(`El bloque "${bloque}" solo existe en el dominio política`, 400)
  }

  const indicadorId = q.get('ind')
  if (!bloque && !indicadorId) {
    return error(
      'Falta `ind`: un bloque es de UN indicador y UN periodo. Pedir el atlas entero son los 298 MB que este contrato elimina.',
      400,
    )
  }

  const periodoPedido = anioValido(q.get('periodo'))
  if (q.get('periodo') !== null && periodoPedido === null) {
    return error(`\`periodo\` debe ser un año entre ${ANIO_MIN} y ${ANIO_MAX}`, 400)
  }
  const convocatoriaPedida = q.get('convocatoria') ?? undefined

  try {
    if (dominio === 'base') {
      return await servirBase(ine, indicadorId as string, periodoPedido, t0)
    }
    if (dominio === 'educacion') {
      return await servirEducacion(ine, indicadorId as string, periodoPedido, t0)
    }
    return await servirPolitica(ine, bloque, indicadorId, periodoPedido, convocatoriaPedida, t0)
  } catch (e) {
    // 404 con motivo (el estado vacío lo pinta el cliente) vs 500 con motivo (el
    // bloque no valida: fail-closed, no se sirven datos dudosos).
    if (esNoDisponible(e)) return error(e.message, e.status ?? 404)
    return error(e instanceof Error ? e.message : 'Error interno del servidor', 500)
  }
}

function responder(cuerpo: SeccionesDatasetBloque, cache: { via: string; motivo: string | null; tag: string }, validacion: ResultadoValidacion): NextResponse {
  return NextResponse.json(
    { data: cuerpo, error: null, count: cuerpo.n_secciones, cache, validacion },
    { headers: { 'Cache-Control': CACHE_DATASET, 'X-SOCIDEAS-CONTRATO': SECCIONES_DATASET_SCHEMA } },
  )
}

/** Dominio `base`: se lee el objeto compacto de R2 y se copia el trocito del
 *  indicador. Cero rehidratación, cero filtros por el resto de indicadores. */
async function servirBase(
  ine: string,
  indicadorId: string,
  periodoPedido: number | null,
  t0: number,
): Promise<NextResponse> {
  const tag = `socideas-muni-${ine}`
  const { dato, via, motivo } = await cachearBloque<SerieServida>({
    partes: ['secciones-dataset', ine, 'base', indicadorId, String(periodoPedido ?? 'defecto')],
    tags: [tag],
    construir: async () => {
      const leido = await leerCompactoValidado(ine)
      if (!leido) throw new BloqueNoDisponible(`No hay atlas seccional publicado para ${ine}`, 404)
      const meta = leido.compacto.indicators.find((i) => i.id === indicadorId) ?? null
      const periodo = periodoPedido ?? periodoPorDefectoDe(indicadorId, leido.compacto.cobertura, leido.compacto.series)
      const extraido = extraerSerieIndicador(leido.compacto.series, indicadorId, { periodo })
      const nSecciones = leido.compacto.sections.length
      return {
        tipo: 'serie',
        convocatoria: null,
        serie: extraido.series,
        nValores: extraido.nValores,
        periodo,
        periodoClave: periodo === null ? null : String(periodo),
        meta,
        nSecciones,
        // Fail-closed también en el bloque: se valida lo que se va a servir.
        validacion: validarSerieBloque(extraido.series, { municipalityIne: ine, indicatorId: indicadorId }),
      }
    },
  })

  if (!dato.validacion.ok) {
    throw new Error(`El bloque ${ine}/${indicadorId} no valida: ${dato.validacion.errores.slice(0, 3).join(' | ')}`)
  }
  if (dato.meta === null) {
    throw new BloqueNoDisponible(`El indicador "${indicadorId}" no está publicado en el atlas de ${ine}`, 404)
  }

  const cuerpo = construirBloqueDataset({
    codigoIne: ine,
    dominio: 'base',
    indicador: indicadorId,
    periodo: dato.periodo,
    periodoClave: dato.periodoClave,
    indicadorMeta: dato.meta,
    series: dato.serie,
    nValores: dato.nValores,
  })
  devLog(
    `ine=${ine} dominio=base ind=${indicadorId} periodo=${String(dato.periodo)} ` +
      `n=${cuerpo.n_secciones} v=${cuerpo.n_valores} via=${via} ms=${Date.now() - t0}`,
  )
  return responder(cuerpo, { via, motivo, tag }, dato.validacion)
}

/** Dominio `educacion`: Censo Anual (Educación + Actividad). La fusión recibe
 *  `indicadores: [id]`: sin ese filtro materializaría los 20 indicadores del
 *  censo para todas las secciones (~40 MB en Madrid). */
async function servirEducacion(
  ine: string,
  indicadorId: string,
  periodoPedido: number | null,
  t0: number,
): Promise<NextResponse> {
  const tag = `socideas-muni-${ine}`
  const { dato, via, motivo } = await cachearBloque<SerieServida>({
    partes: ['secciones-dataset', ine, 'educacion', indicadorId, String(periodoPedido ?? 'defecto')],
    tags: [tag],
    construir: async () => {
      const cat = await leerCatalogoEducativo().catch(() => null)
      const objetos = (
        await Promise.all((cat?.periods ?? []).map((p) => leerObjetoEducativo(ine, p).catch(() => null)))
      ).filter((o): o is NonNullable<typeof o> => o !== null)
      const fusion = fusionarEducacion(ine, objetos, { indicadores: [indicadorId], conObservaciones: true })
      const meta = fusion.indicadores.find((i) => i.id === indicadorId) ?? null
      const periodo = periodoPedido ?? fusion.cobertura.find((c) => c.indicatorId === indicadorId)?.periodoPorDefecto ?? null
      if (meta === null || periodo === null) {
        return {
          tipo: 'serie',
          convocatoria: null,
          serie: {},
          nValores: 0,
          periodo,
          periodoClave: null,
          meta,
          nSecciones: 0,
          validacion: okValidacion(),
        }
      }
      const compacto = compactarObservacionesIndicador(fusion.observaciones, { indicadorId, periodo })
      return {
        tipo: 'serie',
        convocatoria: null,
        serie: compacto.series,
        nValores: compacto.nValores,
        periodo,
        periodoClave: compacto.periodoClave,
        meta,
        nSecciones: Object.keys(compacto.series).length,
        validacion: validarSerieBloque(compacto.series, { municipalityIne: ine, indicatorId: indicadorId }),
      }
    },
  })

  if (!dato.validacion.ok) {
    throw new Error(`El bloque ${ine}/${indicadorId} no valida: ${dato.validacion.errores.slice(0, 3).join(' | ')}`)
  }
  if (dato.meta === null) {
    throw new BloqueNoDisponible(
      `El indicador "${indicadorId}" no está publicado para ${ine} en el Censo Anual`,
      404,
    )
  }
  const cuerpo = construirBloqueDataset({
    codigoIne: ine,
    dominio: 'educacion',
    indicador: indicadorId,
    periodo: dato.periodo,
    periodoClave: dato.periodoClave,
    indicadorMeta: dato.meta,
    series: dato.serie,
    nValores: dato.nValores,
  })
  devLog(
    `ine=${ine} dominio=educacion ind=${indicadorId} periodo=${String(dato.periodo)} ` +
      `n=${cuerpo.n_secciones} v=${cuerpo.n_valores} via=${via} ms=${Date.now() - t0}`,
  )
  return responder(cuerpo, { via, motivo, tag }, dato.validacion)
}

/** Dominio `politica`: un indicador electoral, o el bloque `ganadoras`. */
async function servirPolitica(
  ine: string,
  bloque: string | null,
  indicadorId: string | null,
  periodoPedido: number | null,
  convocatoriaPedida: string | undefined,
  t0: number,
): Promise<NextResponse> {
  const tag = `socideas-muni-${ine}`
  const esGanadoras = bloque === 'ganadoras'

  if (esGanadoras) {
    const { dato, via, motivo } = await cachearBloque<{
      convocatoria: string
      ganadoras: ReturnType<typeof ganadorasPorSeccion>
      nSecciones: number
      validacion: ResultadoValidacion
    }>({
      partes: ['secciones-dataset', ine, 'politica', 'ganadoras', convocatoriaPedida ?? 'defecto'],
      tags: [tag],
      construir: async () => {
        const obj = await objetoPolitico(ine, convocatoriaPedida)
        const ganadoras = ganadorasPorSeccion(obj)
        return {
          convocatoria: obj.electionId,
          ganadoras,
          nSecciones: Object.keys(ganadoras).length,
          validacion: validarGanadoras(ganadoras, ine),
        }
      },
    })
    if (!dato.validacion.ok) {
      throw new Error(
        `El bloque de ganadoras de ${ine} no valida: ${dato.validacion.errores.slice(0, 3).join(' | ')}`,
      )
    }
    devLog(`ine=${ine} bloque=ganadoras n=${dato.nSecciones} via=${via} ms=${Date.now() - t0}`)
    return NextResponse.json(
      {
        data: {
          schemaVersion: SECCIONES_DATASET_SCHEMA,
          codigo_ine: ine,
          dominio: 'politica',
          bloque: 'ganadoras',
          convocatoria: dato.convocatoria,
          n_secciones: dato.nSecciones,
          ganadoras: dato.ganadoras,
        },
        error: null,
        count: dato.nSecciones,
        cache: { via, motivo, tag },
        validacion: dato.validacion,
      },
      { headers: { 'Cache-Control': CACHE_DATASET, 'X-SOCIDEAS-CONTRATO': SECCIONES_DATASET_SCHEMA } },
    )
  }

  const id = indicadorId as string
  const { dato, via, motivo } = await cachearBloque<SerieServida>({
    partes: [
      'secciones-dataset',
      ine,
      'politica',
      id,
      String(periodoPedido ?? 'defecto'),
      convocatoriaPedida ?? 'defecto',
    ],
    tags: [tag],
    construir: async () => {
      const cat: PoliticalCatalog | null = await leerCatalogoPolitico().catch(() => null)
      const eleccion = elegirConvocatoria(cat, convocatoriaPedida, ine)
      if (!eleccion) throw new BloqueNoDisponible('No hay ninguna convocatoria electoral publicada', 404)
      const obj = await leerResultadosElectorales(ine, eleccion.electionType, eleccion.electionDate).catch(() => null)
      if (!obj) throw new BloqueNoDisponible(`No hay resultados electorales publicados para ${ine}`, 404)
      const fusion = fusionarPolitica(obj, {
        catalog: cat,
        coverage: null,
        // Un indicador: 5 base + N candidaturas por sección son ~40 MB en Madrid.
        indicadores: [id],
        conObservaciones: true,
        electionId: eleccion.electionId,
      })
      const meta = fusion.indicadores.find((i) => i.id === id) ?? null
      const periodo =
        periodoPedido ?? fusion.cobertura.find((c) => c.indicatorId === id)?.periodoPorDefecto ?? null
      if (meta === null || periodo === null) {
        return {
          tipo: 'serie',
          convocatoria: obj.electionId,
          serie: {},
          nValores: 0,
          periodo,
          periodoClave: null,
          meta,
          nSecciones: 0,
          validacion: okValidacion(),
        }
      }
      // Política indexa por CONVOCATORIA: la clave que usa el cliente es la
      // fecha, y el año es lo que declara `referencePeriod`.
      const compacto = compactarObservacionesIndicador(fusion.observaciones, {
        indicadorId: id,
        periodo,
        periodoClave: obj.electionDate,
      })
      return {
        tipo: 'serie',
        convocatoria: obj.electionId,
        serie: compacto.series,
        nValores: compacto.nValores,
        periodo,
        periodoClave: compacto.periodoClave,
        meta,
        nSecciones: Object.keys(compacto.series).length,
        validacion: validarSerieBloque(compacto.series, { municipalityIne: ine, indicatorId: id }),
      }
    },
  })

  if (!dato.validacion.ok) {
    throw new Error(`El bloque ${ine}/${id} no valida: ${dato.validacion.errores.slice(0, 3).join(' | ')}`)
  }
  if (dato.meta === null) {
    throw new BloqueNoDisponible(
      `El indicador "${id}" no está publicado para ${ine} en esta convocatoria`,
      404,
    )
  }
  const cuerpo = construirBloqueDataset({
    codigoIne: ine,
    dominio: 'politica',
    indicador: id,
    periodo: dato.periodo,
    periodoClave: dato.periodoClave,
    convocatoria: dato.convocatoria,
    indicadorMeta: dato.meta,
    series: dato.serie,
    nValores: dato.nValores,
  })
  devLog(
    `ine=${ine} dominio=politica ind=${id} conv=${String(cuerpo.convocatoria)} ` +
      `n=${cuerpo.n_secciones} v=${cuerpo.n_valores} via=${via} ms=${Date.now() - t0}`,
  )
  return responder(cuerpo, { via, motivo, tag }, dato.validacion)
}

async function objetoPolitico(
  ine: string,
  convocatoriaPedida: string | undefined,
): Promise<PoliticalMunicipalObject> {
  const cat: PoliticalCatalog | null = await leerCatalogoPolitico().catch(() => null)
  const eleccion = elegirConvocatoria(cat, convocatoriaPedida, ine)
  if (!eleccion) throw new BloqueNoDisponible('No hay ninguna convocatoria electoral publicada', 404)
  const obj = await leerResultadosElectorales(ine, eleccion.electionType, eleccion.electionDate).catch(() => null)
  if (!obj) throw new BloqueNoDisponible(`No hay resultados electorales publicados para ${ine}`, 404)
  return obj
}
