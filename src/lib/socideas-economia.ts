// Construcción del perfil económico SOCideas (SOLO servidor).
// Lee filas ya expandidas del envelope R2 (Demografía + Economía) y selecciona
// los slugs del grupo `economia`. Sin self-fetch, sin llamadas a fuentes
// oficiales: la sincronización es el único escritor (ver socideas-sync-economia).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { IndicatorValue, PerfilEconomico, SocideasMunicipio } from './socideas'
import { SOCIDEAS_ECONOMY_INDICATORS } from './socideas'
import { expandV2Envelope, readMunicipioJson } from './socideas-r2'
import type { R2MunicipioEnvelopeV2 } from './socideas-r2'

export type PerfilEconomiaResult =
  | { status: 'ok' | 'empty'; perfil: PerfilEconomico }
  | { status: 'notFound' }
  | { status: 'badRequest' }

const ECONOMY_SLUGS = new Set<string>(SOCIDEAS_ECONOMY_INDICATORS as readonly string[])

export async function getPerfilEconomico(
  supabase: SupabaseClient,
  codigoIneRaw: string,
): Promise<PerfilEconomiaResult> {
  const codigoIne = (codigoIneRaw ?? '').trim()
  if (!/^\d{5}$/.test(codigoIne)) return { status: 'badRequest' }

  const { data: municipio, error: muniError } = await supabase
    .from('municipios')
    .select(
      'id, codigo_ine, nombre, poblacion, provincia:provincias(nombre, codigo_ine, comunidad_autonoma:comunidades_autonomas(nombre))',
    )
    .eq('codigo_ine', codigoIne)
    .single()
  if (muniError || !municipio) return { status: 'notFound' }
  const muni = municipio as unknown as {
    id: string
    codigo_ine: string
    nombre: string
    poblacion: number | null
    provincia: { nombre: string; codigo_ine: string; comunidad_autonoma: { nombre: string } }
  }
  const socMuni: SocideasMunicipio = {
    codigo_ine: muni.codigo_ine,
    nombre: muni.nombre,
    poblacion: muni.poblacion,
    provincia: muni.provincia.nombre,
    provincia_codigo_ine: muni.provincia.codigo_ine,
    comunidad_autonoma: muni.provincia.comunidad_autonoma.nombre,
    centroide_lng: null,
    centroide_lat: null,
  }

  const envelope = await readMunicipioJson(codigoIne).catch(() => null)
  const valoresRaw =
    envelope?.version === 2
      ? (expandV2Envelope(envelope as unknown as R2MunicipioEnvelopeV2) as unknown as IndicatorValue[])
      : ((envelope?.valores ?? []) as unknown as IndicatorValue[])

  const slugOf = (v: IndicatorValue): string =>
    (v.indicator as unknown as { slug?: string } | undefined)?.slug ?? ''
  const valores = valoresRaw
    .filter((v) => {
      const st = (v as unknown as { estado_validacion?: string }).estado_validacion
      return st === undefined || st === 'validado'
    })
    .filter((v) => ECONOMY_SLUGS.has(slugOf(v)))
    .map((v) => ({
      ...v,
      valor_numerico:
        v.valor_numerico === null || v.valor_numerico === undefined
          ? null
          : Number.isNaN(Number(v.valor_numerico)) ? null : Number(v.valor_numerico),
      dimensiones: (v.dimensiones ?? {}) as Record<string, string>,
    }))

  const { data: lastRun } = await supabase
    .from('data_sync_runs')
    .select('fin, estado')
    .eq('municipio_codigo_ine', codigoIne)
    .like('tipo_sincronizacion', 'economia%')
    .in('estado', ['ok', 'partial'])
    .order('fin', { ascending: false })
    .limit(1)
    .maybeSingle()

  const ultimoPorIndicador: Record<string, number | null> = {}
  for (const v of valores) {
    const s = slugOf(v)
    if (!s || v.anio_referencia == null) continue
    ultimoPorIndicador[s] = Math.max(ultimoPorIndicador[s] ?? 0, v.anio_referencia)
  }

  const perfil: PerfilEconomico = {
    municipio: socMuni,
    sincronizado: valores.length > 0,
    ultima_sincronizacion: (lastRun as unknown as { fin: string } | null)?.fin ?? null,
    valores,
    ultimoPorIndicador,
    disponibles: [...new Set(valores.map(slugOf))].sort(),
  }
  return { status: valores.length > 0 ? 'ok' : 'empty', perfil }
}
