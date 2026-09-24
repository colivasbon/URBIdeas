// Construcción del perfil económico SOCideas (SOLO servidor).
// Lee filas ya expandidas del envelope R2 (Demografía + Economía) y selecciona
// los slugs del grupo `economia`. Sin self-fetch, sin llamadas a fuentes
// oficiales: la sincronización es el único escritor (ver socideas-sync-economia).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { IndicatorValue, PerfilEconomico, SocideasMunicipio } from './socideas'
import { SOCIDEAS_ECONOMY_INDICATORS } from './socideas'
import { expandV2Envelope, getMunicipioEnvelopeForRequest } from './socideas-r2'
import type { R2MunicipioEnvelopeV2 } from './socideas-r2'
import { isConprelMockEnabled, isConprelUiEnabled } from './conprel-flag'
import { conprelMockFixture, conprelMockValores } from './conprel-mock'

export type PerfilEconomiaResult =
  | { status: 'ok' | 'empty'; perfil: PerfilEconomico }
  | { status: 'notFound' }
  | { status: 'badRequest' }

const ECONOMY_SLUGS = new Set<string>(SOCIDEAS_ECONOMY_INDICATORS as readonly string[])

/**
 * Slugs CONPREL (`conprel_*`): se admiten en el perfil SOLO con el flag de
 * publicación ON. Con el flag OFF el envelope se filtra igual que hoy
 * (ninguna cadena CONPREL llega a ficha ni XLSX).
 */
function esSlugAdmitido(slug: string): boolean {
  if (ECONOMY_SLUGS.has(slug)) return true
  return slug.startsWith('conprel_') && isConprelUiEnabled()
}

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

  // Una sola lectura por request (deduplicada con Demografía si se piden ambas)
  const envelope = await getMunicipioEnvelopeForRequest(codigoIne).catch(() => null)
  const valoresRaw =
    envelope?.version === 2
      ? (expandV2Envelope(envelope as unknown as R2MunicipioEnvelopeV2) as unknown as IndicatorValue[])
      : ((envelope?.valores ?? []) as unknown as IndicatorValue[])

  const slugOf = (v: IndicatorValue): string =>
    (v.indicator as unknown as { slug?: string } | undefined)?.slug ?? ''
  let valores = valoresRaw
    .filter((v) => {
      const st = (v as unknown as { estado_validacion?: string }).estado_validacion
      return st === undefined || st === 'validado'
    })
    .filter((v) => esSlugAdmitido(slugOf(v)))
    .map((v) => ({
      ...v,
      valor_numerico:
        v.valor_numerico === null || v.valor_numerico === undefined
          ? null
          : Number.isNaN(Number(v.valor_numerico)) ? null : Number(v.valor_numerico),
      dimensiones: (v.dimensiones ?? {}) as Record<string, string>,
    }))

  // Envelope mock de desarrollo/QA (fixtures §6): solo con doble llave
  // NEXT_PUBLIC_CONPREL_UI=true + SOCIDEAS_CONPREL_MOCK=true. Nunca en prod.
  const mockFx =
    isConprelUiEnabled() && isConprelMockEnabled() ? conprelMockFixture(codigoIne) : null
  if (mockFx) {
    const mockRows = conprelMockValores(codigoIne)
    const mockKeys = new Set(
      mockRows.map(
        (v) =>
          `${slugOf(v)}|${v.anio_referencia}|${JSON.stringify(v.dimensiones)}`,
      ),
    )
    valores = [
      ...valores.filter(
        (v) => !slugOf(v).startsWith('conprel_') || !mockKeys.has(`${slugOf(v)}|${v.anio_referencia}|${JSON.stringify(v.dimensiones)}`),
      ),
      ...mockRows,
    ]
  }

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
    if (!s || v.anio_referencia == null || s.startsWith('conprel_')) continue
    ultimoPorIndicador[s] = Math.max(ultimoPorIndicador[s] ?? 0, v.anio_referencia)
  }

  // `disponibles` no incluye CONPREL (el selector de renta/capacidades no cambia).
  const disponibles = [
    ...new Set(valores.map(slugOf).filter((s) => ECONOMY_SLUGS.has(s))),
  ].sort()

  const perfil: PerfilEconomico = {
    municipio: socMuni,
    sincronizado: valores.length > 0 || mockFx !== null,
    ultima_sincronizacion: (lastRun as unknown as { fin: string } | null)?.fin ?? null,
    valores,
    ultimoPorIndicador,
    disponibles,
  }
  return { status: perfil.sincronizado ? 'ok' : 'empty', perfil }
}
