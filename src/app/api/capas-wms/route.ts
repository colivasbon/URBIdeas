import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

const RATE_LIMIT = 100

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const comunidad_autonoma_id = searchParams.get('comunidad_autonoma_id')
  const categoria = searchParams.get('categoria')

  try {
    const supabase = createSupabaseServer()

    let query = supabase
      .from('capas_wms')
      .select(`
        *,
        comunidad_autonoma:comunidades_autonomas(id, nombre)
      `, { count: 'exact' })
      .eq('activo', true)
      .order('nombre_capa')

    if (comunidad_autonoma_id) {
      query = query.eq('comunidad_autonoma_id', comunidad_autonoma_id)
    }

    if (categoria) {
      query = query.eq('categoria', categoria)
    }

    const { data, error, count } = await query

    if (error) throw error

    const seen = new Set<string>()
    const deduped = (data || []).filter((capa: Record<string, unknown>) => {
      const ca = capa.comunidad_autonoma as Record<string, unknown> | Record<string, unknown>[] | undefined
      const caName = Array.isArray(ca) ? (ca[0] as Record<string, unknown>)?.nombre : (ca as Record<string, unknown>)?.nombre
      const key = `${caName || ''}|${capa.nombre_capa}|${capa.url_servicio}`
      if (seen.has(key)) return false
      seen.add(key)
      if (Array.isArray(ca)) {
        capa.comunidad_autonoma = ca[0]
      }
      return true
    })

    let geoLayers: Record<string, unknown>[] = []

    try {
      const { data: geoData } = await supabase
        .from('geo_layers')
        .select(`
          id,
          layer_name,
          layer_title,
          thematic_category,
          queryable,
          geo_services(
            service_name,
            url,
            ccaa,
            scope,
            endpoint_status
          )
        `)
        .order('layer_name')

      if (geoData) {
        geoLayers = geoData
          .filter((layer: Record<string, unknown>) => {
            const service = layer.geo_services as Record<string, unknown> | null
            return service?.endpoint_status === 'confirmed'
          })
          .map((layer: Record<string, unknown>) => {
            const service = layer.geo_services as Record<string, unknown>
            return {
              id: `geo-${layer.id}`,
              nombre_capa: layer.layer_name,
              url_servicio: service?.url || '',
              formato_soportado: 'image/png',
              sistema_referencia: 'EPSG:4326',
              comunidad_autonoma: {
                id: null,
                nombre: service?.ccaa || 'Desconocido',
              },
              categoria: layer.thematic_category || 'otro',
              geo_layer: true,
              layer_title: layer.layer_title,
              queryable: layer.queryable,
              scope: service?.scope,
            }
          })
      }
    } catch {
      // geo_layers table may not exist yet - continue without it
    }

    const allLayers = [...deduped, ...geoLayers]

    const response = NextResponse.json({ data: allLayers, error: null, count: allLayers.length })
    response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT))
    response.headers.set('X-RateLimit-Remaining', String(RATE_LIMIT - 1))
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ data: null, error: message, count: 0 }, { status: 500 })
  }
}
