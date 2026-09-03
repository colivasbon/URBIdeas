// Motor de sincronización demográfica SOCideas (SOLO servidor).
// Un municipio por ejecución. Registra todo en data_sync_runs.
// No inventa datos: cualquier cobertura no verificada queda como pendiente.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  AGE_TABLE_ID,
  CCAA_NACIONAL_VALUE_ID,
  CCAA_TABLE_ID,
  CCAA_VALUE_IDS,
  DPOP_PROVINCE_TABLES,
  IneError,
  fetchAgeSex,
  fetchAmbitoTotal,
  fetchMunicipioTotals,
  resolveMunicipioValueId,
  resolveProvinciaValueId,
} from './ine-tempus'

const SYNC_TYPE = 'ine_demografico'
// Sin límite de años por código: se trae la historia completa publicada.
// El volumen por municipio sigue siendo pequeño (filtros tv= por municipio).
const LOCK_MINUTES = 30

export interface SyncSummary {
  municipio_codigo_ine: string
  estado: 'ok' | 'partial' | 'error'
  registros_leidos: number
  registros_actualizados: number
  registros_con_error: number
  anios: number[]
  pendientes: string[]
  run_id: string
}

interface Catalog {
  sourceId: string
  indicators: Map<string, string>
}

async function getCatalog(supabase: SupabaseClient): Promise<Catalog> {
  const { data: source, error: sourceError } = await supabase
    .from('statistical_sources')
    .select('id')
    .eq('slug', 'ine_tempus3')
    .single()
  if (sourceError || !source) {
    throw new Error('Catálogo SOCideas no inicializado (falta fuente ine_tempus3)')
  }
  const { data: indicators, error: indicatorsError } = await supabase
    .from('indicator_definitions')
    .select('id, slug')
    .eq('activo', true)
  if (indicatorsError) throw indicatorsError
  return {
    sourceId: (source as { id: string }).id,
    indicators: new Map(((indicators ?? []) as { id: string; slug: string }[]).map((i) => [i.slug, i.id])),
  }
}

function requireIndicator(catalog: Catalog, slug: string): string {
  const id = catalog.indicators.get(slug)
  if (!id) throw new Error(`Indicador no definido en catálogo: ${slug}`)
  return id
}

interface StoredRow {
  municipio_codigo_ine: string
  indicator_id: string
  anio_referencia: number
  fecha_referencia: string
  valor_numerico: number
  unidad: string
  dimensiones: Record<string, string>
  source_id: string
  source_url: string
  source_table_id: string
  source_series_id?: string
  estado_validacion: 'validado'
}

/** Reescritura idempotente: borra los valores previos del indicador y inserta. */
async function replaceValues(
  supabase: SupabaseClient,
  municipioCodigoIne: string,
  indicatorId: string,
  sourceId: string,
  rows: StoredRow[],
): Promise<number> {
  const { error: deleteError } = await supabase
    .from('municipal_indicator_values')
    .delete()
    .eq('municipio_codigo_ine', municipioCodigoIne)
    .eq('indicator_id', indicatorId)
    .eq('source_id', sourceId)
  if (deleteError) throw deleteError
  if (rows.length === 0) return 0
  const { error: insertError } = await supabase.from('municipal_indicator_values').insert(rows)
  if (insertError) throw insertError
  return rows.length
}

function janFirst(anio: number): string {
  return `${anio}-01-01`
}

export async function syncMunicipioDemografico(
  supabase: SupabaseClient,
  codigoIneRaw: string,
): Promise<SyncSummary> {
  const codigoIne = codigoIneRaw.trim()
  if (!/^\d{5}$/.test(codigoIne)) {
    throw new Error('Código INE inválido (se esperan 5 dígitos)')
  }

  // Bloqueo anti-duplicados: una sincronización running reciente del municipio.
  const lockSince = new Date(Date.now() - LOCK_MINUTES * 60_000).toISOString()
  const { data: running } = await supabase
    .from('data_sync_runs')
    .select('id')
    .eq('tipo_sincronizacion', SYNC_TYPE)
    .eq('municipio_codigo_ine', codigoIne)
    .eq('estado', 'running')
    .gte('inicio', lockSince)
    .limit(1)
  if (running && running.length > 0) {
    const err = new Error('Ya hay una sincronización en curso para este municipio') as Error & { status?: number }
    err.status = 409
    throw err
  }

  const catalog = await getCatalog(supabase)

  const { data: run, error: runError } = await supabase
    .from('data_sync_runs')
    .insert({
      source_id: catalog.sourceId,
      tipo_sincronizacion: SYNC_TYPE,
      municipio_codigo_ine: codigoIne,
      estado: 'running',
      metadata: {},
    })
    .select('id')
    .single()
  if (runError || !run) throw runError ?? new Error('No se pudo registrar la ejecución')
  const runId = (run as { id: string }).id

  let leidos = 0
  let actualizados = 0
  let conError = 0
  const pendientes: string[] = []
  const anios = new Set<number>()
  let estado: SyncSummary['estado'] = 'ok'
  const errorMessage: string | null = null

  const fail = async (message: string): Promise<never> => {
    await supabase
      .from('data_sync_runs')
      .update({
        fin: new Date().toISOString(),
        estado: 'error',
        registros_leidos: leidos,
        registros_actualizados: actualizados,
        registros_con_error: conError,
        error_message: message,
        metadata: { pendientes },
      })
      .eq('id', runId)
    throw new Error(message)
  }

  try {
    // Municipio base (única fuente territorial: public.municipios).
    const { data: municipio, error: muniError } = await supabase
      .from('municipios')
      .select(
        'codigo_ine, nombre, provincia:provincias(nombre, codigo_ine, comunidad_autonoma:comunidades_autonomas(nombre))',
      )
      .eq('codigo_ine', codigoIne)
      .single()
    if (muniError || !municipio) {
      return fail(`Municipio ${codigoIne} no existe en la tabla municipios`)
    }
    const muni = municipio as unknown as {
      codigo_ine: string
      nombre: string
      provincia: { nombre: string; codigo_ine: string; comunidad_autonoma: { nombre: string } }
    }
    const provCode = muni.provincia.codigo_ine
    const ccaaNombre = muni.provincia.comunidad_autonoma.nombre

    const dpopTableId = DPOP_PROVINCE_TABLES[provCode]
    if (!dpopTableId) {
      return fail(`Provincia ${provCode} aún no mapeada a tabla DPOP (ver docs/socideas-ine-integration.md)`)
    }

    // 1. Totales + sexo + evolución (DPOP provincial).
    const { valueId } = await resolveMunicipioValueId(dpopTableId, codigoIne)
    const totals = await fetchMunicipioTotals(dpopTableId, valueId, codigoIne)
    leidos += totals.total.length + totals.hombres.length + totals.mujeres.length
    totals.total.forEach((p) => anios.add(p.anio))

    const latest = totals.total[totals.total.length - 1]
    const latestH = totals.hombres[totals.hombres.length - 1]
    const latestM = totals.mujeres[totals.mujeres.length - 1]
    const totalIndicatorId = requireIndicator(catalog, 'population_total')
    // Todas las filas de population_total (municipio + ámbitos) se reescriben
    // en una sola operación: replaceValues borra por indicador.
    const totalRows: StoredRow[] = [
      {
        municipio_codigo_ine: codigoIne,
        indicator_id: totalIndicatorId,
        anio_referencia: latest.anio,
        fecha_referencia: janFirst(latest.anio),
        valor_numerico: latest.valor,
        unidad: totals.unidad,
        dimensiones: { ambito: 'municipio' },
        source_id: catalog.sourceId,
        source_url: totals.sourceUrl,
        source_table_id: String(dpopTableId),
        source_series_id: totals.seriesIds.total,
        estado_validacion: 'validado',
      },
    ]
    const mkRows = (
      indicatorSlug: string,
      puntos: { anio: number; valor: number }[],
      seriesId: string | undefined,
      dimensiones: Record<string, string>,
    ): StoredRow[] =>
      puntos.map((p) => ({
        municipio_codigo_ine: codigoIne,
        indicator_id: requireIndicator(catalog, indicatorSlug),
        anio_referencia: p.anio,
        fecha_referencia: janFirst(p.anio),
        valor_numerico: p.valor,
        unidad: totals.unidad,
        dimensiones,
        source_id: catalog.sourceId,
        source_url: totals.sourceUrl,
        source_table_id: String(dpopTableId),
        source_series_id: seriesId,
        estado_validacion: 'validado' as const,
      }))

    actualizados += await replaceValues(
      supabase, codigoIne, requireIndicator(catalog, 'population_male'), catalog.sourceId,
      mkRows('population_male', [latestH], totals.seriesIds.hombres, { ambito: 'municipio', sexo: 'hombres' }),
    )
    actualizados += await replaceValues(
      supabase, codigoIne, requireIndicator(catalog, 'population_female'), catalog.sourceId,
      mkRows('population_female', [latestM], totals.seriesIds.mujeres, { ambito: 'municipio', sexo: 'mujeres' }),
    )
    actualizados += await replaceValues(
      supabase, codigoIne, requireIndicator(catalog, 'population_evolution'), catalog.sourceId,
      mkRows('population_evolution', totals.total, totals.seriesIds.total, { ambito: 'municipio' }),
    )

    // Comparativas provincia / CCAA / España (serie total anual).
    const provValueId = await resolveProvinciaValueId(dpopTableId, provCode)
    const provSerie = await fetchAmbitoTotal(dpopTableId, 115, provValueId, muni.provincia.nombre, 'provincia')
    leidos += provSerie.puntos.length
    provSerie.puntos.forEach((p) => anios.add(p.anio))
    for (const p of provSerie.puntos) {
      totalRows.push({
        municipio_codigo_ine: codigoIne,
        indicator_id: totalIndicatorId,
        anio_referencia: p.anio,
        fecha_referencia: janFirst(p.anio),
        valor_numerico: p.valor,
        unidad: 'personas',
        dimensiones: { ambito: 'provincia', nombre: muni.provincia.nombre },
        source_id: catalog.sourceId,
        source_url: provSerie.sourceUrl,
        source_table_id: String(dpopTableId),
        source_series_id: provSerie.seriesId,
        estado_validacion: 'validado',
      })
    }

    const ccaaValueId = CCAA_VALUE_IDS[ccaaNombre]
    if (ccaaValueId === undefined) {
      pendientes.push(`Comparativa CCAA (${ccaaNombre}): valor INE no mapeado`)
      estado = 'partial'
    } else {
      const ccaaSerie = await fetchAmbitoTotal(CCAA_TABLE_ID, 70, ccaaValueId, ccaaNombre, 'ccaa')
      const espSerie = await fetchAmbitoTotal(CCAA_TABLE_ID, 70, CCAA_NACIONAL_VALUE_ID, 'España', 'espana')
      leidos += ccaaSerie.puntos.length + espSerie.puntos.length
      for (const s of [ccaaSerie, espSerie]) {
        s.puntos.forEach((p) => anios.add(p.anio))
        for (const p of s.puntos) {
          totalRows.push({
            municipio_codigo_ine: codigoIne,
            indicator_id: totalIndicatorId,
            anio_referencia: p.anio,
            fecha_referencia: janFirst(p.anio),
            valor_numerico: p.valor,
            unidad: 'personas',
            dimensiones: { ambito: s.ambito, nombre: s.nombre },
            source_id: catalog.sourceId,
            source_url: s.sourceUrl,
            source_table_id: String(CCAA_TABLE_ID),
            source_series_id: s.seriesId,
            estado_validacion: 'validado',
          })
        }
      }
    }

    // Escritura única de population_total (municipio + comparativas).
    actualizados += await replaceValues(
      supabase, codigoIne, totalIndicatorId, catalog.sourceId, totalRows,
    )

    // Derivados 5y/10y sobre la evolución municipal.
    const byYear = new Map(totals.total.map((p) => [p.anio, p.valor]))
    const refYear = latest.anio
    const change = (back: number): number | null => {
      const base = byYear.get(refYear - back)
      if (base === undefined || base === 0) return null
      return Math.round(((latest.valor - base) / base) * 1000) / 10
    }
    const change5y = change(5)
    const change10y = change(10)
    if (change5y !== null) {
      actualizados += await replaceValues(
        supabase, codigoIne, requireIndicator(catalog, 'population_change_5y'), catalog.sourceId,
        [{
          municipio_codigo_ine: codigoIne,
          indicator_id: requireIndicator(catalog, 'population_change_5y'),
          anio_referencia: refYear,
          fecha_referencia: janFirst(refYear),
          valor_numerico: change5y,
          unidad: 'porcentaje',
          dimensiones: { ambito: 'municipio', base: String(refYear - 5) },
          source_id: catalog.sourceId,
          source_url: totals.sourceUrl,
          source_table_id: String(dpopTableId),
          estado_validacion: 'validado',
        }],
      )
    }
    if (change10y !== null) {
      actualizados += await replaceValues(
        supabase, codigoIne, requireIndicator(catalog, 'population_change_10y'), catalog.sourceId,
        [{
          municipio_codigo_ine: codigoIne,
          indicator_id: requireIndicator(catalog, 'population_change_10y'),
          anio_referencia: refYear,
          fecha_referencia: janFirst(refYear),
          valor_numerico: change10y,
          unidad: 'porcentaje',
          dimensiones: { ambito: 'municipio', base: String(refYear - 10) },
          source_id: catalog.sourceId,
          source_url: totals.sourceUrl,
          source_table_id: String(dpopTableId),
          estado_validacion: 'validado',
        }],
      )
    }

    // 2. Pirámide edad/sexo (tabla nacional 33570): todos los años completos.
    try {
      const age = await fetchAgeSex(AGE_TABLE_ID, valueId, codigoIne)
      leidos += age.seriesCount
      const ageRows: StoredRow[] = []
      for (const y of age.anios) {
        anios.add(y.anio)
        for (const g of y.grupos) {
          ageRows.push({
            municipio_codigo_ine: codigoIne,
            indicator_id: requireIndicator(catalog, 'population_age_sex'),
            anio_referencia: y.anio,
            fecha_referencia: janFirst(y.anio),
            valor_numerico: g.hombres,
            unidad: 'personas',
            dimensiones: { ambito: 'municipio', sexo: 'hombres', tramo_edad: g.tramo },
            source_id: catalog.sourceId,
            source_url: age.sourceUrl,
            source_table_id: String(AGE_TABLE_ID),
            estado_validacion: 'validado',
          })
          ageRows.push({
            municipio_codigo_ine: codigoIne,
            indicator_id: requireIndicator(catalog, 'population_age_sex'),
            anio_referencia: y.anio,
            fecha_referencia: janFirst(y.anio),
            valor_numerico: g.mujeres,
            unidad: 'personas',
            dimensiones: { ambito: 'municipio', sexo: 'mujeres', tramo_edad: g.tramo },
            source_id: catalog.sourceId,
            source_url: age.sourceUrl,
            source_table_id: String(AGE_TABLE_ID),
            estado_validacion: 'validado',
          })
        }
      }
      actualizados += await replaceValues(
        supabase, codigoIne, requireIndicator(catalog, 'population_age_sex'), catalog.sourceId, ageRows,
      )
    } catch (err) {
      conError += 1
      estado = 'partial'
      pendientes.push(`Pirámide edad/sexo: ${err instanceof Error ? err.message : 'sin cobertura'}`)
    }

    // 3. Densidad y extranjería: sin fuente validada en Fase 2A.
    pendientes.push('Densidad: pendiente de integración de fuente de superficie')
    pendientes.push('Población extranjera y saldo migratorio: sin cobertura municipal verificada en Tempus3')

    // Cobertura real por indicador (min/max obtenidos, sin años fijados).
    const { data: cobertura } = await supabase
      .from('municipal_indicator_values')
      .select('anio_referencia, indicator:indicator_definitions!inner(slug)')
      .eq('municipio_codigo_ine', codigoIne)
      .eq('estado_validacion', 'validado')
    const porIndicador: Record<string, { desde: number | null; hasta: number | null }> = {}
    for (const row of ((cobertura ?? []) as unknown as { anio_referencia: number | null; indicator: { slug: string } }[])) {
      if (row.anio_referencia == null) continue
      const s = row.indicator.slug
      const cur = porIndicador[s] ?? { desde: row.anio_referencia, hasta: row.anio_referencia }
      cur.desde = Math.min(cur.desde ?? row.anio_referencia, row.anio_referencia)
      cur.hasta = Math.max(cur.hasta ?? row.anio_referencia, row.anio_referencia)
      porIndicador[s] = cur
    }

    await supabase
      .from('data_sync_runs')
      .update({
        fin: new Date().toISOString(),
        estado,
        registros_leidos: leidos,
        registros_actualizados: actualizados,
        registros_con_error: conError,
        error_message: errorMessage,
        metadata: { pendientes, anios: [...anios].sort(), por_indicador: porIndicador },
      })
      .eq('id', runId)

    return {
      municipio_codigo_ine: codigoIne,
      estado,
      registros_leidos: leidos,
      registros_actualizados: actualizados,
      registros_con_error: conError,
      anios: [...anios].sort(),
      pendientes,
      run_id: runId,
    }
  } catch (err) {
    conError += 1
    const message = err instanceof IneError ? `INE: ${err.message}` : err instanceof Error ? err.message : 'Error desconocido'
    await supabase
      .from('data_sync_runs')
      .update({
        fin: new Date().toISOString(),
        estado: 'error',
        registros_leidos: leidos,
        registros_actualizados: actualizados,
        registros_con_error: conError,
        error_message: message,
        metadata: { pendientes },
      })
      .eq('id', runId)
    const statusErr = err as Error & { status?: number }
    if (statusErr.status === 409) throw err
    throw new Error(message)
  }
}
