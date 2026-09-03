// Construcción de la ficha demográfica SOCideas (SOLO servidor).
// Usada por la ruta /api/socideas/perfil/[codigoINE] y directamente por la
// página /socideas/[codigoINE] (sin self-fetch HTTP: un fetch a uno mismo
// puede fallar a nivel de red en serverless y tumbar la página entera).
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AgeSexGroup,
  AmbitoTerritorial,
  Disponibles,
  FiltrosAplicados,
  IndicatorValue,
  PerfilDemografico,
  SocideasMunicipio,
} from './socideas'
import { AMBITOS } from './socideas'

export type PerfilResult =
  | { status: 'ok' | 'empty'; perfil: PerfilDemografico }
  | { status: 'notFound' }
  | { status: 'badRequest' }

// Los datos se refrescan automáticamente si la última sincronización supera
// este umbral. Solo para municipios YA sincronizados.
export const STALE_DAYS = 7

function isMunicipioAmbito(v: IndicatorValue): boolean {
  return (v.dimensiones?.ambito ?? 'municipio') === 'municipio'
}

export interface FiltrosPerfil {
  autoRefresh?: boolean
  /** Año de referencia para Población actual (total/H/M). */
  anio?: number
  /** Rango de la evolución y comparativas. */
  desde?: number
  hasta?: number
  /** Ámbitos de comparativa (por defecto, los cuatro). */
  ambitos?: AmbitoTerritorial[]
  /** Año de la pirámide (por defecto, el último con datos completos). */
  pirAnio?: number
  /** Slugs de indicadores a incluir (por defecto, todos). */
  indicadores?: string[]
}

const DEFAULT_FILTROS: FiltrosAplicados = {
  anio: null,
  desde: null,
  hasta: null,
  ambitos: [...AMBITOS],
  pir_anio: null,
}

const DISPONIBLES_VACIOS: Disponibles = {
  anios_municipio: [],
  anios_evolucion: [],
  piramide_anios: [],
  ambitos: {
    municipio: { desde: null, hasta: null, puntos: 0 },
    provincia: { desde: null, hasta: null, puntos: 0 },
    ccaa: { desde: null, hasta: null, puntos: 0 },
    espana: { desde: null, hasta: null, puntos: 0 },
  },
  ultimo_por_indicador: {},
}

export async function getPerfilDemografico(
  supabase: SupabaseClient,
  codigoIneRaw: string,
  opts?: FiltrosPerfil,
): Promise<PerfilResult> {
  const codigoIne = (codigoIneRaw ?? '').trim()
  if (!/^\d{5}$/.test(codigoIne)) {
    return { status: 'badRequest' }
  }

  const { data: municipio, error: muniError } = await supabase
    .from('municipios')
    .select(
      'id, codigo_ine, nombre, poblacion, provincia:provincias(nombre, codigo_ine, comunidad_autonoma:comunidades_autonomas(nombre))',
    )
    .eq('codigo_ine', codigoIne)
    .single()
  if (muniError || !municipio) {
    return { status: 'notFound' }
  }
  const muni = municipio as unknown as {
    id: string
    codigo_ine: string
    nombre: string
    poblacion: number | null
    provincia: { nombre: string; codigo_ine: string; comunidad_autonoma: { nombre: string } }
  }

  let lat: number | null = null
  let lng: number | null = null
  try {
    const { data: coords } = await supabase.rpc('get_municipio_coords' as never, { p_id: muni.id } as never).single()
    if (coords && typeof coords === 'object') {
      const c = coords as { lat: number; lng: number }
      if (Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
        lat = c.lat
        lng = c.lng
      }
    }
  } catch {
    // Sin centroide: el enlace a URBideas será genérico.
  }

  const socMuni: SocideasMunicipio = {
    codigo_ine: muni.codigo_ine,
    nombre: muni.nombre,
    poblacion: muni.poblacion,
    provincia: muni.provincia.nombre,
    provincia_codigo_ine: muni.provincia.codigo_ine,
    comunidad_autonoma: muni.provincia.comunidad_autonoma.nombre,
    centroide_lng: lng,
    centroide_lat: lat,
  }

  const perfilSinDatos = (): PerfilDemografico => ({
    municipio: socMuni,
    sincronizado: false,
    ultima_sincronizacion: null,
    total: null,
    hombres: null,
    mujeres: null,
    evolucion: [],
    comparativas: { provincia: [], ccaa: [], espana: [] },
    piramide: { anio: null, grupos: [] },
    derivados: { cambio_5y: null, cambio_10y: null, indice_envejecimiento: null, indice_dependencia: null },
    densidad: { valor: null, pendiente: 'Pendiente de integración de fuente de superficie' },
    valores: [],
    disponibles: DISPONIBLES_VACIOS,
    filtros: DEFAULT_FILTROS,
  })

  const { data: valores, error: valoresError } = await supabase
    .from('municipal_indicator_values')
    .select('*, indicator:indicator_definitions(slug, nombre, unidad), source:statistical_sources(slug, organismo, nombre)')
    .eq('municipio_codigo_ine', codigoIne)
    .eq('estado_validacion', 'validado')
    .order('anio_referencia', { ascending: true })
  if (valoresError) {
    // Tablas aún no migradas (PGRST205/42P01): el municipio existe pero no hay perfil.
    const code = (valoresError as { code?: string }).code
    if (code === 'PGRST205' || code === '42P01') {
      return { status: 'empty', perfil: perfilSinDatos() }
    }
    throw valoresError
  }
  const values = ((valores ?? []) as unknown as IndicatorValue[]).map((v) => ({
    ...v,
    // PostgREST devuelve numeric como string: normalizar a número una sola
    // vez aquí para que tarjetas, gráficos, tablas y derivados calculen bien.
    valor_numerico:
      v.valor_numerico === null || v.valor_numerico === undefined
        ? null
        : Number.isNaN(Number(v.valor_numerico))
          ? null
          : Number(v.valor_numerico),
    dimensiones: (v.dimensiones ?? {}) as Record<string, string>,
  }))

  const { data: lastRun } = await supabase
    .from('data_sync_runs')
    .select('fin, estado')
    .eq('municipio_codigo_ine', codigoIne)
    .eq('tipo_sincronizacion', 'ine_demografico')
    .in('estado', ['ok', 'partial'])
    .order('fin', { ascending: false })
    .limit(1)
    .maybeSingle()

  const slugOf = (v: IndicatorValue): string =>
    (v.indicator as unknown as { slug?: string } | undefined)?.slug ?? ''

  // Años y ámbitos REALMENTE disponibles (de lo almacenado, sin inventar).
  const yearsOf = (list: IndicatorValue[]): number[] =>
    [...new Set(list.map((v) => v.anio_referencia ?? 0).filter((a) => a > 0))].sort((a, b) => a - b)
  const municipalTotals = values.filter((v) => slugOf(v) === 'population_total' && isMunicipioAmbito(v))
  const muniByYear = new Map<number, IndicatorValue[]>()
  for (const v of values.filter((v) => isMunicipioAmbito(v) && v.valor_numerico !== null)) {
    const arr = muniByYear.get(v.anio_referencia ?? 0) ?? []
    arr.push(v)
    muniByYear.set(v.anio_referencia ?? 0, arr)
  }
  const aniosMunicipio = yearsOf(municipalTotals).filter((a) => {
    const slugs = new Set((muniByYear.get(a) ?? []).map(slugOf))
    return slugs.has('population_total') && slugs.has('population_male') && slugs.has('population_female')
  })
  const evoAll = values
    .filter((v) => slugOf(v) === 'population_evolution' && isMunicipioAmbito(v) && v.valor_numerico !== null)
    .sort((a, b) => (a.anio_referencia ?? 0) - (b.anio_referencia ?? 0))
  const aniosEvolucion = yearsOf(evoAll)
  const ageAll = values.filter((v) => slugOf(v) === 'population_age_sex' && v.valor_numerico !== null)
  const piramideAnios = yearsOf(ageAll)
  const ambitoRange = (ambito: AmbitoTerritorial) => {
    const ys = yearsOf(
      values.filter((v) => slugOf(v) === 'population_total' && v.dimensiones?.ambito === ambito && v.valor_numerico !== null),
    )
    return { desde: ys.length > 0 ? ys[0] : null, hasta: ys.length > 0 ? ys[ys.length - 1] : null, puntos: ys.length }
  }
  const ultimoPorIndicador: Record<string, number | null> = {}
  for (const v of values) {
    const s = slugOf(v)
    if (!s || v.anio_referencia == null) continue
    ultimoPorIndicador[s] = Math.max(ultimoPorIndicador[s] ?? 0, v.anio_referencia)
  }
  const disponibles: Disponibles = {
    anios_municipio: aniosMunicipio,
    anios_evolucion: aniosEvolucion,
    piramide_anios: piramideAnios,
    ambitos: {
      municipio: ambitoRange('municipio'),
      provincia: ambitoRange('provincia'),
      ccaa: ambitoRange('ccaa'),
      espana: ambitoRange('espana'),
    },
    ultimo_por_indicador: ultimoPorIndicador,
  }

  if (values.length === 0) {
    return { status: 'empty', perfil: perfilSinDatos() }
  }

  // Refresco automático: si hay datos pero la última sincronización supera el
  // umbral, se re-sincroniza en servidor antes de servir. Solo municipios ya
  // sincronizados (values.length > 0). El lock de sync evita estampidas y, si
  // el refresco falla, se sirve la caché existente.
  const lastRunFin = (lastRun as unknown as { fin: string } | null)?.fin ?? null
  const stale =
    lastRunFin !== null &&
    Date.now() - new Date(lastRunFin).getTime() > STALE_DAYS * 86400_000
  if (opts?.autoRefresh && stale) {
    try {
      const { syncMunicipioDemografico } = await import('./socideas-sync')
      await syncMunicipioDemografico(supabase, codigoIne)
      return getPerfilDemografico(supabase, codigoIne, { ...opts, autoRefresh: false })
    } catch {
      // Degradación: servir la caché aunque esté caducada.
    }
  }

  // Filtros efectivos: todo lo inválido se ignora (defaults).
  const inRange = (a: number, lo: number | undefined, hi: number | undefined) =>
    (lo === undefined || a >= lo) && (hi === undefined || a <= hi)
  let desde = opts?.desde
  let hasta = opts?.hasta
  if (desde !== undefined && !aniosEvolucion.includes(desde)) desde = undefined
  if (hasta !== undefined && !aniosEvolucion.includes(hasta)) hasta = undefined
  if (desde !== undefined && hasta !== undefined && desde > hasta) {
    desde = undefined
    hasta = undefined
  }
  const ambitos = (opts?.ambitos ?? [...AMBITOS]).filter((a): a is AmbitoTerritorial =>
    (AMBITOS as string[]).includes(a),
  )
  const ambitosEff = ambitos.length > 0 ? ambitos : [...AMBITOS]
  const anioEff =
    opts?.anio !== undefined && aniosMunicipio.includes(opts.anio) ? opts.anio : null
  const pirAnioEff =
    opts?.pirAnio !== undefined && piramideAnios.includes(opts.pirAnio)
      ? opts.pirAnio
      : (piramideAnios.length > 0 ? piramideAnios[piramideAnios.length - 1] : null)
  const indicadoresEff =
    opts?.indicadores && opts.indicadores.length > 0
      ? new Set(opts.indicadores)
      : null
  const fValues = indicadoresEff
    ? values.filter((v) => indicadoresEff.has(slugOf(v)))
    : values
  const bySlug = (slug: string) => fValues.filter((v) => slugOf(v) === slug)
  const latestIn = (anio: number | null, slug: string): IndicatorValue | null => {
    const list = bySlug(slug).filter(
      (v) => isMunicipioAmbito(v) && v.valor_numerico !== null && (anio === null || v.anio_referencia === anio),
    )
    list.sort((a, b) => (b.anio_referencia ?? 0) - (a.anio_referencia ?? 0))
    return list[0] ?? null
  }
  const total = latestIn(anioEff, 'population_total')
  const hombres = latestIn(anioEff, 'population_male')
  const mujeres = latestIn(anioEff, 'population_female')
  const fullEvo =
    !indicadoresEff || indicadoresEff.has('population_evolution') ? evoAll : []
  const evolucion = fullEvo.filter((v) => inRange(v.anio_referencia ?? 0, desde, hasta))

  const inAmbito = (ambito: string) => (v: IndicatorValue) => v.dimensiones?.ambito === ambito
  const serie = (list: IndicatorValue[]) =>
    list
      .filter((v) => v.valor_numerico !== null)
      .sort((a, b) => (a.anio_referencia ?? 0) - (b.anio_referencia ?? 0))

  // Pirámide: agrupa population_age_sex del año elegido por tramo.
  const ageRows = bySlug('population_age_sex').filter((v) => v.valor_numerico !== null)
  const ageYear = pirAnioEff
  const ageMap = new Map<string, { hombres: number; mujeres: number }>()
  for (const v of ageRows.filter((v) => v.anio_referencia === ageYear)) {
    const tramo = v.dimensiones?.tramo_edad
    if (!tramo) continue
    const entry = ageMap.get(tramo) ?? { hombres: 0, mujeres: 0 }
    if (v.dimensiones?.sexo === 'hombres') entry.hombres = v.valor_numerico ?? 0
    if (v.dimensiones?.sexo === 'mujeres') entry.mujeres = v.valor_numerico ?? 0
    ageMap.set(tramo, entry)
  }
  const TRAMO_ORDER = [
    '0-4', '5-9', '10-14', '15-19', '20-24', '25-29', '30-34', '35-39', '40-44',
    '45-49', '50-54', '55-59', '60-64', '65-69', '70-74', '75-79', '80-84',
    '85-89', '90-94', '95-99', '100+',
  ]
  const grupos: AgeSexGroup[] = TRAMO_ORDER.filter((t) => ageMap.has(t)).map((t) => ({
    tramo: t,
    hombres: ageMap.get(t)?.hombres ?? 0,
    mujeres: ageMap.get(t)?.mujeres ?? 0,
  }))

  // Derivados propios (solo con datos suficientes). La referencia es el año
  // seleccionado o el último del período visible; la base se busca en la
  // serie completa almacenada (no en el rango recortado).
  const evoByYear = new Map(fullEvo.map((v) => [v.anio_referencia, v.valor_numerico as number]))
  const lastShown = evolucion.length > 0 ? (evolucion[evolucion.length - 1].anio_referencia ?? null) : null
  const refYear = anioEff ?? lastShown
  const pctChange = (back: number): number | null => {
    if (refYear === null) return null
    const base = evoByYear.get(refYear - back)
    const now = evoByYear.get(refYear)
    if (base === undefined || now === undefined || base === 0) return null
    return Math.round(((now - base) / base) * 1000) / 10
  }
  const sumTramos = (pred: (t: string) => boolean): number =>
    grupos.filter((g) => pred(g.tramo)).reduce((acc, g) => acc + g.hombres + g.mujeres, 0)
  const isOld = (t: string) => {
    const n = parseInt(t.split('-')[0], 10)
    return Number.isFinite(n) && n >= 65
  }
  const isYoung = (t: string) => {
    const n = parseInt(t.split('-')[0], 10)
    return Number.isFinite(n) && n < 15
  }
  const isWork = (t: string) => !isOld(t) && !isYoung(t)
  const pop65 = sumTramos(isOld)
  const pop014 = sumTramos(isYoung)
  const pop1564 = sumTramos(isWork)
  const indiceEnvejecimiento = pop014 > 0 ? Math.round((pop65 / pop014) * 1000) / 10 : null
  const indiceDependencia = pop1564 > 0 ? Math.round(((pop014 + pop65) / pop1564) * 1000) / 10 : null

  const perfil: PerfilDemografico = {
    municipio: socMuni,
    sincronizado: true,
    ultima_sincronizacion: (lastRun as unknown as { fin: string } | null)?.fin ?? null,
    total,
    hombres,
    mujeres,
    evolucion,
    comparativas: {
      provincia: ambitosEff.includes('provincia')
        ? serie(bySlug('population_total').filter(inAmbito('provincia'))).filter((v) =>
            inRange(v.anio_referencia ?? 0, desde, hasta),
          )
        : [],
      ccaa: ambitosEff.includes('ccaa')
        ? serie(bySlug('population_total').filter(inAmbito('ccaa'))).filter((v) =>
            inRange(v.anio_referencia ?? 0, desde, hasta),
          )
        : [],
      espana: ambitosEff.includes('espana')
        ? serie(bySlug('population_total').filter(inAmbito('espana'))).filter((v) =>
            inRange(v.anio_referencia ?? 0, desde, hasta),
          )
        : [],
    },
    piramide: { anio: ageYear, grupos },
    derivados: {
      cambio_5y: pctChange(5),
      cambio_10y: pctChange(10),
      indice_envejecimiento: grupos.length > 0 ? indiceEnvejecimiento : null,
      indice_dependencia: grupos.length > 0 ? indiceDependencia : null,
    },
    densidad: { valor: null, pendiente: 'Pendiente de integración de fuente de superficie' },
    valores: fValues,
    disponibles,
    filtros: {
      anio: anioEff,
      desde: desde ?? null,
      hasta: hasta ?? null,
      ambitos: ambitosEff,
      pir_anio: pirAnioEff,
    },
  }
  return { status: 'ok', perfil }
}
