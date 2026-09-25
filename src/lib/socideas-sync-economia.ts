// Motor de sincronización económica SOCideas (SOLO servidor).
// Un municipio por ejecución. Actualización PARCIAL del JSON v2 en R2:
// lee el envelope existente, reemplaza SOLO los slugs del grupo `economia` y
// preserva Íntegramente Demografía. Si una fuente falla, se conservan los datos
// anteriores y el run queda partial/error. Registra todo en data_sync_runs.
//
// Flujo por fuente (todas controladas, ninguna en lectura de ficha):
// - AEAT EDM: fichero base xlsx del ejercicio (URL aportada por el operador;
//   el catálogo AEAT no ofrece API JSON).
// - ADRH: CSV municipal por tabla jaxiT3 + comparativas Tempus3 53688.
// - DIRCE: Tempus3 tabla 4721 con filtro tv= por municipio.
// - Censo Agrario 2020: CSV municipal por URL oficial.
import type { SupabaseClient } from '@supabase/supabase-js'
import { getMunicipioJsonRaw, putMunicipioJson, toV2Envelope } from './socideas-r2'
import type { R2MunicipioEnvelopeV2 } from './socideas-r2'
import { SOCIDEAS_ECONOMY_INDICATORS, SOCIDEAS_ECONOMY_SOURCES } from './socideas'
import type { EconomyRow, EconomySourceSlug } from './socideas-eco-common'
import { EcoError } from './socideas-eco-common'
import { fetchIrpfBaseXlsx, irpfToRows, parseIrpfBase } from './aeat-irpf'
import { adrhToRows, fetchAdrhComparativa, fetchAdrhCsv, parseAdrhMunicipalCsv } from './ine-adrh'
import { ADRH_PROVINCE_TABLES } from './ine-adrh'
import { dirceToRows, fetchDirceMunicipio } from './ine-dirce'
import { censoAgrarioToRows, fetchCensoAgrarioCsv, fetchCensoTempus, parseCensoAgrarioCsv } from './ine-censo-agrario'
import { fetchSepeParo } from './sepe-paro'
import { fetchTgssAfiliacion } from './tgss-afiliacion'

const SYNC_TYPE = 'economia'
const LOCK_MINUTES = 30
/** Tope de crecimiento del JSON por sync económico (ver r2-schema). */
const MAX_ADDED_BYTES = 150 * 1024

const ECONOMY_SLUGS = new Set<string>(SOCIDEAS_ECONOMY_INDICATORS as readonly string[])

export interface EconomiaSyncInput {
  /** Ejercicio AEAT a sincronizar (p. ej. 2023). */
  aeatEjercicio?: number
  /** URL directa del fichero base xlsx de la EDM (operador la resuelve del catálogo AEAT). */
  aeatBaseUrl?: string
  /** IDs de tabla jaxiT3 con CSV municipal ADRH (renta + Gini). */
  adrhTableIds?: (number | string)[]
  /** URLs CSV del Censo Agrario 2020 (superficie + ganadería). */
  censoAgrarioUrls?: string[]
  /** Si false, omite DIRCE (p. ej. para pruebas parciales). */
  conDirce?: boolean
  /** Si true, no escribe en R2 (dry-run). */
  dryRun?: boolean
  /** Si true, intenta fuentes provisionales (no configuradas en batch 1). */
  provisional?: boolean
}

export interface EconomiaSyncSummary {
  municipio_codigo_ine: string
  estado: 'ok' | 'partial' | 'error'
  registros_leidos: number
  registros_actualizados: number
  registros_con_error: number
  anios: number[]
  pendientes: string[]
  bytesAntes: number
  bytesDespues: number
  run_id: string
  r2_key: string | null
}

interface Catalog {
  sourceIds: Map<EconomySourceSlug, string>
  sourceMeta: Map<EconomySourceSlug, { slug: string; organismo: string; nombre: string }>
  indicators: Map<string, { id: string; nombre: string; unidad: string | null }>
}

async function getCatalog(supabase: SupabaseClient): Promise<Catalog> {
  const { data: sources, error: sErr } = await supabase
    .from('statistical_sources')
    .select('id, slug, organismo, nombre')
    .in('slug', [...SOCIDEAS_ECONOMY_SOURCES])
  if (sErr) throw sErr
  const list = (sources ?? []) as { id: string; slug: string; organismo: string; nombre: string }[]
  const sourceIds = new Map<EconomySourceSlug, string>()
  const sourceMeta = new Map<EconomySourceSlug, { slug: string; organismo: string; nombre: string }>()
  for (const s of list) {
    sourceIds.set(s.slug as EconomySourceSlug, s.id)
    sourceMeta.set(s.slug as EconomySourceSlug, { slug: s.slug, organismo: s.organismo, nombre: s.nombre })
  }
  const missing = SOCIDEAS_ECONOMY_SOURCES.filter((s) => !sourceIds.has(s as EconomySourceSlug))
  if (missing.length > 0) {
    throw new Error(`Catálogo incompleto: faltan fuentes ${missing.join(', ')} (aplicar migración 029)`)
  }
  const { data: indicators, error: iErr } = await supabase
    .from('indicator_definitions')
    .select('id, slug, nombre, unidad')
    .eq('activo', true)
    .eq('grupo', 'economia')
  if (iErr) throw iErr
  return {
    sourceIds,
    sourceMeta,
    indicators: new Map(
      ((indicators ?? []) as { id: string; slug: string; nombre: string; unidad: string | null }[]).map((i) => [
        i.slug,
        { id: i.id, nombre: i.nombre, unidad: i.unidad },
      ]),
    ),
  }
}

export async function syncMunicipioEconomia(
  supabase: SupabaseClient | null,
  codigoIneRaw: string,
  input: EconomiaSyncInput = {},
): Promise<EconomiaSyncSummary> {
  const codigoIne = codigoIneRaw.trim()
  if (!/^\d{5}$/.test(codigoIne)) throw new Error('Código INE inválido (se esperan 5 dígitos)')

  // Dry-run sin Supabase: no hay bloqueo, ni logging en data_sync_runs, ni
  // consulta a municipios. La validación de anclas vive en
  // scripts/sync-economia-batch-dry-run.ts (descargas directas + evidence.json).
  if (input.dryRun === true && !supabase) {
    console.warn('dry-run sin Supabase: omito lock y logging')
    return {
      municipio_codigo_ine: codigoIne,
      estado: 'partial',
      registros_leidos: 0,
      registros_actualizados: 0,
      registros_con_error: 0,
      anios: [],
      pendientes: [
        'dry-run sin Supabase: sin bloqueo temporal, sin registro en data_sync_runs y sin consulta a municipios',
      ],
      bytesAntes: 0,
      bytesDespues: 0,
      run_id: 'dry-run-sin-supabase',
      r2_key: null,
    }
  }
  if (!supabase) throw new Error('Se requiere cliente Supabase fuera de dry-run')

  if (!input.dryRun) {
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
      const err = new Error('Ya hay una sincronización económica en curso para este municipio') as Error & { status?: number }
      err.status = 409
      throw err
    }
  }

  const catalog = await getCatalog(supabase)

  // Dry-run sin escrituras: no registra run en Supabase, usa id sintético
  let runId = 'dry-run'
  if (!input.dryRun) {
    const { data: run, error: runError } = await supabase
      .from('data_sync_runs')
      .insert({
        source_id: null,
        tipo_sincronizacion: SYNC_TYPE,
        municipio_codigo_ine: codigoIne,
        estado: 'running',
        metadata: { input: { ...input, aeatBaseUrl: input.aeatBaseUrl ? '(aportada)' : undefined } },
      })
      .select('id')
      .single()
    if (runError || !run) throw runError ?? new Error('No se pudo registrar la ejecución')
    runId = (run as { id: string }).id
  }

  let leidos = 0
  let conError = 0
  const pendientes: string[] = []
  const anios = new Set<number>()
  let estado: EconomiaSyncSummary['estado'] = 'ok'
  const nuevos: EconomyRow[] = []

  const finish = async (
    finalEstado: EconomiaSyncSummary['estado'],
    summary: Partial<EconomiaSyncSummary> & { r2_key?: string | null; bytesAntes?: number; bytesDespues?: number },
  ): Promise<EconomiaSyncSummary> => {
    const full: EconomiaSyncSummary = {
      municipio_codigo_ine: codigoIne,
      estado: finalEstado,
      registros_leidos: leidos,
      registros_actualizados: summary.registros_actualizados ?? 0,
      registros_con_error: conError,
      anios: [...anios].sort(),
      pendientes,
      bytesAntes: summary.bytesAntes ?? 0,
      bytesDespues: summary.bytesDespues ?? 0,
      run_id: runId,
      r2_key: summary.r2_key ?? null,
    }
    if (!input.dryRun) {
      await supabase
        .from('data_sync_runs')
        .update({
          fin: new Date().toISOString(),
          estado: finalEstado,
          registros_leidos: leidos,
          registros_actualizados: full.registros_actualizados,
          registros_con_error: conError,
          error_message: finalEstado === 'error' ? pendientes.join(' | ').slice(0, 2000) : null,
          metadata: {
            pendientes,
            anios: full.anios,
            bytes_antes: full.bytesAntes,
            bytes_despues: full.bytesDespues,
            r2_key: full.r2_key,
          },
        })
        .eq('id', runId)
    }
    return full
  }

  try {
    // 1. Municipio base (única fuente territorial).
    const { data: municipio, error: muniError } = await supabase
      .from('municipios')
      .select('codigo_ine, nombre, provincia:provincias(nombre, codigo_ine, comunidad_autonoma:comunidades_autonomas(nombre))')
      .eq('codigo_ine', codigoIne)
      .single()
    if (muniError || !municipio) {
      await finish('error', {})
      throw new Error(`Municipio ${codigoIne} no existe en la tabla municipios`)
    }
    const muni = municipio as unknown as {
      codigo_ine: string
      nombre: string
      provincia: { nombre: string; codigo_ine: string; comunidad_autonoma: { nombre: string } }
    }

    // 2. JSON existente (se preserva Demografía: solo se reemplazan slugs de economía).
    const previo = await getMunicipioJsonRaw(codigoIne).catch(() => null)
    const bytesAntes = previo ? JSON.stringify(previo).length : 0
    const prevV2 = previo as unknown as R2MunicipioEnvelopeV2 | null
    // Filas previas NO económicas: se reconstruyen sin pérdidas para la fusión.
    const filasPrevias: {
      slug: string
      anio: number
      valor: number
      unidad: string
      dimensiones: Record<string, string>
      sourceSlug: string
      sourceUrl: string
      tableId: string
      serieId: string | null
      nombre: string
      unidadInd: string | null
      organismo: string
      nombreFuente: string
    }[] = []
    if (prevV2 && prevV2.version === 2) {
      const { expandV2Envelope: expand } = await import('./socideas-r2')
      const { sourceSlugForTable } = await import('./socideas-r2')
      for (const f of expand(prevV2) as unknown as {
        indicator: { slug: string; nombre: string; unidad: string | null }
        source: { slug: string; organismo: string; nombre: string }
        anio_referencia: number
        valor_numerico: number | null
        unidad: string | null
        dimensiones: Record<string, string>
        source_url: string | null
        source_table_id: string | null
        source_series_id?: string | null
        estado_validacion: string
      }[]) {
        if (ECONOMY_SLUGS.has(f.indicator.slug)) continue // se reemplazan
        if (f.valor_numerico === null || f.anio_referencia == null) continue
        filasPrevias.push({
          slug: f.indicator.slug,
          anio: f.anio_referencia,
          valor: Number(f.valor_numerico),
          unidad: f.unidad ?? '',
          dimensiones: f.dimensiones ?? {},
          sourceSlug: f.source.slug || 'ine_tempus3',
          sourceUrl: f.source_url ?? '',
          tableId: f.source_table_id ?? '',
          serieId: f.source_series_id ?? null,
          nombre: f.indicator.nombre,
          unidadInd: f.indicator.unidad,
          organismo: f.source.organismo,
          nombreFuente: f.source.nombre,
        })
        void sourceSlugForTable
      }
    }

    // 3. Fuentes económicas (cada fallo conserva lo anterior: partial).
    if (input.aeatBaseUrl && input.aeatEjercicio) {
      try {
        const buf = await fetchIrpfBaseXlsx(input.aeatBaseUrl)
        const m = parseIrpfBase(buf, input.aeatEjercicio, codigoIne, input.aeatBaseUrl)
        const rows = irpfToRows(m)
        leidos += rows.length
        rows.forEach((r) => anios.add(r.anio))
        nuevos.push(...rows)
      } catch (err) {
        conError += 1
        estado = 'partial'
        pendientes.push(`AEAT EDM: ${err instanceof EcoError || err instanceof Error ? err.message : 'sin cobertura'}`)
      }
    } else {
      pendientes.push('AEAT EDM: pendiente de aportar el fichero base del ejercicio')
      if (estado === 'ok') estado = 'partial'
    }

    // Tablas ADRH: explícitas o resueltas por provincia (verificadas en vivo).
    const adrhIds = input.adrhTableIds && input.adrhTableIds.length > 0
      ? input.adrhTableIds
      : (() => {
        const t = ADRH_PROVINCE_TABLES[muni.provincia.codigo_ine]
        return t ? [t.gini, t.renta] : []
      })()
    if (adrhIds.length > 0) {
      for (const tid of adrhIds) {
        try {
          const { text, url } = await fetchAdrhCsv(tid)
          const parsed = parseAdrhMunicipalCsv(text, codigoIne)
          leidos += parsed.length
          parsed.forEach((r) => anios.add(r.anio))
          nuevos.push(...adrhToRows(parsed, url, String(tid)))
        } catch (err) {
          conError += 1
          estado = 'partial'
          pendientes.push(`ADRH ${tid}: ${err instanceof Error ? err.message : 'sin cobertura'}`)
        }
      }
      // Comparativas homogéneas (provincia/CCAA/España, Tempus3 53688).
      for (const [terr, amb] of [
        [muni.provincia.nombre, 'provincia'],
        [muni.provincia.comunidad_autonoma.nombre, 'ccaa'],
        ['Total Nacional', 'espana'],
      ] as [string, string][]) {
        for (const ind of ['gini', 'p80_p20'] as const) {
          try {
            const c = await fetchAdrhComparativa(terr, ind)
            leidos += c.puntos.length
            for (const p of c.puntos) {
              anios.add(p.anio)
              nuevos.push({
                slug: ind, anio: p.anio, valor: p.valor,
                unidad: ind === 'gini' ? 'puntos' : 'ratio',
                dimensiones: { ambito: amb, nombre: terr },
                sourceSlug: 'ine_adrh', sourceUrl: c.sourceUrl, tableId: '53688', serieId: c.serieId ?? null,
              })
            }
          } catch (err) {
            pendientes.push(`ADRH comparativa ${amb} ${ind}: ${err instanceof Error ? err.message : 'sin cobertura'}`)
            estado = 'partial'
          }
        }
      }
    } else {
      pendientes.push('ADRH: pendiente de resolver los IDs de tabla municipal (descargas)')
      if (estado === 'ok') estado = 'partial'
    }

    if (input.conDirce !== false) {
      try {
        const d = await fetchDirceMunicipio(codigoIne)
        const rows = dirceToRows(d)
        leidos += rows.length
        rows.forEach((r) => anios.add(r.anio))
        nuevos.push(...rows)
      } catch (err) {
        conError += 1
        estado = 'partial'
        pendientes.push(`DIRCE: ${err instanceof Error ? err.message : 'sin cobertura'}`)
      }
    }

    // Censo Agrario 2020 vía Tempus3 (agregados municipales) + detalle por CSV
    // (URLs jaxiT3 por provincia, pendientes de resolver salvo aporte manual).
    try {
      const caRows = await fetchCensoTempus(codigoIne)
      leidos += caRows.length
      caRows.forEach((r) => anios.add(r.anio))
      nuevos.push(...caRows)
    } catch (err) {
      conError += 1
      estado = 'partial'
      pendientes.push(`Censo Agrario (Tempus3): ${err instanceof Error ? err.message : 'sin cobertura'}`)
    }
    if (input.censoAgrarioUrls && input.censoAgrarioUrls.length > 0) {
      for (const url of input.censoAgrarioUrls) {
        try {
          const text = await fetchCensoAgrarioCsv(url)
          const m = parseCensoAgrarioCsv(text, codigoIne)
          const rows = censoAgrarioToRows(m, url, 'CA2020')
          leidos += rows.length
          rows.forEach((r) => anios.add(r.anio))
          nuevos.push(...rows)
        } catch (err) {
          conError += 1
          estado = 'partial'
          pendientes.push(`Censo Agrario: ${err instanceof Error ? err.message : 'sin cobertura'}`)
        }
      }
    } else {
      // Censo Agrario 2020 fuera batch 1 – no se considera pendiente para este batch
      pendientes.push('Censo Agrario 2020: fuera batch 1 (no se evalúa en este batch)')
      // No cambia estado a partial por Censo en batch 1
    }

    // Batch 1 – SEPE y TGSS (dry-run: stubs sin descarga)
    if (input.provisional) {
      pendientes.push('Provisional: no hay fuente provisional configurada para economía (ADRH provisional 2024 excluido)')
      if (estado === 'ok') estado = 'partial'
    } else {
      try {
        const sepeRows = await fetchSepeParo(codigoIne, !!input.dryRun)
        if (sepeRows.length > 0) {
          leidos += sepeRows.length
          sepeRows.forEach((r) => anios.add(r.anio))
          nuevos.push(...sepeRows)
        } else {
          pendientes.push('SEPE paro: julio 2026 (libro completo ~4 MB) – pendiente de conector XLS en batch 1 dry-run')
          if (estado === 'ok') estado = 'partial'
        }
      } catch (err) {
        conError += 1
        estado = 'partial'
        pendientes.push(`SEPE: ${err instanceof Error ? err.message : 'sin cobertura'}`)
      }
      try {
        const tgssRows = await fetchTgssAfiliacion(codigoIne, !!input.dryRun)
        if (tgssRows.length > 0) {
          leidos += tgssRows.length
          tgssRows.forEach((r) => anios.add(r.anio))
          nuevos.push(...tgssRows)
        } else {
          pendientes.push('TGSS afiliación: julio 2026 Muni072026 ~510 KB – "<5"→null+flag, pendiente de conector XLSX en batch 1 dry-run')
          if (estado === 'ok') estado = 'partial'
        }
      } catch (err) {
        conError += 1
        estado = 'partial'
        pendientes.push(`TGSS: ${err instanceof Error ? err.message : 'sin cobertura'}`)
      }
    }

    // 4. Fusión: previas no-económicas + nuevas económicas validadas.
    const todas: {
      indicator: { slug: string; nombre: string; unidad: string | null }
      source: { slug: string; organismo: string; nombre: string }
      anio_referencia: number
      valor_numerico: number
      unidad: string
      dimensiones: Record<string, string>
      source_url: string
      source_table_id: string
      source_series_id?: string | null
      estado_validacion: 'validado'
    }[] = []
    for (const k of filasPrevias) {
      const meta = catalog.sourceMeta.get(k.sourceSlug as EconomySourceSlug) ?? {
        slug: k.sourceSlug, organismo: k.organismo, nombre: k.nombreFuente,
      }
      todas.push({
        indicator: { slug: k.slug, nombre: k.nombre, unidad: k.unidadInd ?? k.unidad },
        source: meta,
        anio_referencia: k.anio,
        valor_numerico: k.valor,
        unidad: k.unidad,
        dimensiones: k.dimensiones,
        source_url: k.sourceUrl,
        source_table_id: k.tableId,
        source_series_id: k.serieId ?? null,
        estado_validacion: 'validado',
      })
    }
    for (const r of nuevos) {
      const meta = catalog.indicators.get(r.slug)
      if (!meta) {
        pendientes.push(`Indicador no definido en catálogo: ${r.slug}`)
        estado = 'partial'
        continue
      }
      const src = catalog.sourceMeta.get(r.sourceSlug)
      if (!src) continue
      todas.push({
        indicator: { slug: r.slug, nombre: meta.nombre, unidad: meta.unidad ?? r.unidad },
        source: src,
        anio_referencia: r.anio,
        valor_numerico: r.valor,
        unidad: r.unidad,
        dimensiones: r.dimensiones,
        source_url: r.sourceUrl,
        source_table_id: r.tableId,
        source_series_id: r.serieId ?? null,
        estado_validacion: 'validado',
      })
    }

    const envelope = toV2Envelope(codigoIne, new Date().toISOString(), todas)
    const bytesDespues = JSON.stringify(envelope).length
    if (bytesDespues - bytesAntes > MAX_ADDED_BYTES) {
      await finish('error', { bytesAntes, bytesDespues })
      throw new Error(
        `El bloque económico supera el presupuesto (+${bytesDespues - bytesAntes} B > ${MAX_ADDED_BYTES} B). Revisar selección antes de subir.`,
      )
    }
    if (input.dryRun) {
      return finish(estado, {
        registros_actualizados: nuevos.length,
        r2_key: null,
        bytesAntes,
        bytesDespues,
      })
    }
    const r2Key = await putMunicipioJson(codigoIne, envelope)
    return finish(estado, {
      registros_actualizados: nuevos.length,
      r2_key: r2Key,
      bytesAntes,
      bytesDespues,
    })
  } catch (err) {
    if ((err as Error & { status?: number }).status === 409) throw err
    conError += 1
    const message = err instanceof Error ? err.message : 'Error desconocido'
    if (!pendientes.includes(message)) pendientes.push(message)
    await finish('error', {})
    throw new Error(message)
  }
}
