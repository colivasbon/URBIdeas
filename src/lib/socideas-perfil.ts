// Construcción de la ficha demográfica SOCideas (SOLO servidor).
// Usada por la ruta /api/socideas/perfil/[codigoINE] y directamente por la
// página /socideas/[codigoINE] (sin self-fetch HTTP: un fetch a uno mismo
// puede fallar a nivel de red en serverless y tumbar la página entera).
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AgeSexGroup,
  IndicatorValue,
  PerfilDemografico,
  SocideasMunicipio,
} from './socideas'

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

function pickLatest(values: IndicatorValue[], slug: string): IndicatorValue | null {
  const list = values.filter(
    (v) =>
      (v.indicator as unknown as { slug?: string } | undefined)?.slug === slug &&
      isMunicipioAmbito(v) &&
      v.valor_numerico !== null,
  )
  list.sort((a, b) => (b.anio_referencia ?? 0) - (a.anio_referencia ?? 0))
  return list[0] ?? null
}

export async function getPerfilDemografico(
  supabase: SupabaseClient,
  codigoIneRaw: string,
  opts?: { autoRefresh?: boolean },
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
      return getPerfilDemografico(supabase, codigoIne)
    } catch {
      // Degradación: servir la caché aunque esté caducada.
    }
  }

  const bySlug = (slug: string) =>
    values.filter(
      (v) => (v.indicator as unknown as { slug?: string } | undefined)?.slug === slug,
    )
  const total = pickLatest(values, 'population_total')
  const evolucion = bySlug('population_evolution')
    .filter((v) => isMunicipioAmbito(v) && v.valor_numerico !== null)
    .sort((a, b) => (a.anio_referencia ?? 0) - (b.anio_referencia ?? 0))

  const inAmbito = (ambito: string) => (v: IndicatorValue) => v.dimensiones?.ambito === ambito
  const serie = (list: IndicatorValue[]) =>
    list
      .filter((v) => v.valor_numerico !== null)
      .sort((a, b) => (a.anio_referencia ?? 0) - (b.anio_referencia ?? 0))

  // Pirámide: agrupa population_age_sex del último año por tramo.
  const ageRows = bySlug('population_age_sex').filter((v) => v.valor_numerico !== null)
  const ageYear = ageRows.length > 0 ? Math.max(...ageRows.map((v) => v.anio_referencia ?? 0)) : null
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

  // Derivados propios (solo con datos suficientes).
  const evoByYear = new Map(evolucion.map((v) => [v.anio_referencia, v.valor_numerico as number]))
  const refYear = total?.anio_referencia ?? null
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
    hombres: pickLatest(values, 'population_male'),
    mujeres: pickLatest(values, 'population_female'),
    evolucion,
    comparativas: {
      provincia: serie(bySlug('population_total').filter(inAmbito('provincia'))),
      ccaa: serie(bySlug('population_total').filter(inAmbito('ccaa'))),
      espana: serie(bySlug('population_total').filter(inAmbito('espana'))),
    },
    piramide: { anio: ageYear, grupos },
    derivados: {
      cambio_5y: pctChange(5),
      cambio_10y: pctChange(10),
      indice_envejecimiento: grupos.length > 0 ? indiceEnvejecimiento : null,
      indice_dependencia: grupos.length > 0 ? indiceDependencia : null,
    },
    densidad: { valor: null, pendiente: 'Pendiente de integración de fuente de superficie' },
    valores: values,
  }
  return { status: 'ok', perfil }
}
