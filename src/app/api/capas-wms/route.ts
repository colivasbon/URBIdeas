import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { clasificarCapa } from '@/lib/familias'

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

    const FAMILIAS_VALIDAS = ['planeamiento', 'catastro', 'usos', 'patrimonio', 'inundacion', 'dominio', 'infra', 'medio', 'pecuarias']
    const SEVERIDADES_VALIDAS = ['veto', 'condicionante', 'informativo']
    const NORMA_DEFECTO = 'Fuente WMS (ver ficha de capa)'

    // La BD manda: una fila con algún valor distinto del defecto (023/025 o
    // corrección manual) se respeta íntegra. Una fila totalmente por defecto
    // equivale a "sin clasificar" y la resuelve el clasificador (con overrides).
    function conClasificacion(
      capa: Record<string, unknown>,
      persistida: { familia?: unknown; severidad?: unknown; norma_ref?: unknown },
    ): Record<string, unknown> {
      const fam = persistida.familia
      const sev = persistida.severidad
      const norma = persistida.norma_ref
      const sinClasificar = fam === 'usos' && sev === 'informativo'
        && (typeof norma !== 'string' || !norma || norma === NORMA_DEFECTO)
      if (!sinClasificar
        && typeof fam === 'string' && FAMILIAS_VALIDAS.includes(fam)
        && typeof sev === 'string' && SEVERIDADES_VALIDAS.includes(sev)
        && typeof norma === 'string' && norma) {
        return { ...capa, familia: fam, severidad: sev, norma_ref: norma }
      }
      const cls = clasificarCapa({
        nombre_capa: String(capa.nombre_capa || ''),
        layer_title: (capa.layer_title as string) || null,
        categoria: (capa.categoria as string) || null,
      })
      return { ...capa, familia: cls.familia, severidad: cls.severidad, norma_ref: cls.norma }
    }

    const seen = new Set<string>()
    // Servicios estatales (IGN, Catastro, MITECO, Fomento): una sola entrada
    // "Estatal" aunque vengan duplicados por CCAA. Nunca se acotan por territorio.
    const ESTATAL_RE = /ign\.es|catastro|miteco|fomento\.gob|cnig\.es|laministracion\.gob/i
    const deduped = (data || [])
      .filter((capa: Record<string, unknown>) => {
        const key = `${capa.nombre_capa}|${capa.url_servicio}`
        if (seen.has(key)) return false
        seen.add(key)
        const ca = capa.comunidad_autonoma as Record<string, unknown> | Record<string, unknown>[] | undefined
        if (Array.isArray(ca)) {
          capa.comunidad_autonoma = ca[0]
        }
        return true
      })
      .map((capa: Record<string, unknown>) => {
        const estatal = ESTATAL_RE.test(String(capa.url_servicio || ''))
        if (estatal) {
          capa.comunidad_autonoma = { id: null, nombre: 'Estatal' }
        }
        return conClasificacion(
          { ...capa, estatal },
          { familia: capa.familia, severidad: capa.severidad, norma_ref: capa.norma_ref },
        )
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
          familia,
          severidad,
          norma_ref,
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
            const scope = String(service?.scope || '')
            return conClasificacion({
              id: `geo-${layer.id}`,
              nombre_capa: layer.layer_name,
              url_servicio: service?.url || '',
              formato_soportado: 'image/png',
              sistema_referencia: 'EPSG:4326',
              comunidad_autonoma: {
                id: null,
                nombre: scope === 'estatal' ? 'Estatal' : (service?.ccaa || 'Desconocido'),
              },
              categoria: layer.thematic_category || 'otro',
              geo_layer: true,
              layer_title: layer.layer_title,
              queryable: layer.queryable,
              scope,
              estatal: scope === 'estatal',
            }, { familia: layer.familia, severidad: layer.severidad, norma_ref: layer.norma_ref })
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
