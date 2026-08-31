import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

const MAX_IDS = 10

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const param = searchParams.get('municipio_ids')

  if (!param) {
    return NextResponse.json({ data: null, error: 'municipio_ids requerido', count: 0 }, { status: 400 })
  }

  const ids = param.split(',').map(s => s.trim()).filter(Boolean)
  if (ids.length === 0 || ids.length > MAX_IDS) {
    return NextResponse.json({ data: null, error: `Se requieren 1-${MAX_IDS} IDs`, count: 0 }, { status: 400 })
  }

  try {
    const supabase = createSupabaseServer()

    const { data: municipios, error } = await supabase
      .from('municipios')
      .select(`
        id, nombre, codigo_ine, poblacion,
        provincia:provincias(
          id, nombre,
          comunidad_autonoma:comunidades_autonomas(id, nombre)
        ),
        instrumentos_planeamiento(
          tipo, estado, fecha_aprobacion_definitiva,
          enlace_documento_oficial, enlace_geoportal
        )
      `)
      .in('id', ids)

    if (error) throw error

    // Get lat/lng for all municipios via RPC
    const coordMap = new Map<string, { lat: number; lng: number }>()
    for (const id of ids) {
      try {
        const { data: coords } = await supabase.rpc('get_municipio_coords' as never, { p_id: id } as never).single()
        if (coords && typeof coords === 'object' && 'lat' in coords) {
          const c = coords as { lat: number; lng: number }
          if (c.lat != null && c.lng != null) coordMap.set(id, { lat: c.lat, lng: c.lng })
        }
      } catch { /* skip */ }
    }

    const data = (municipios || []).map(m => {
      const prov = Array.isArray(m.provincia) ? m.provincia[0] : m.provincia
      const ccaa = prov ? (Array.isArray(prov.comunidad_autonoma) ? prov.comunidad_autonoma[0] : prov.comunidad_autonoma) : null
      const coords = coordMap.get(m.id)
      return {
        id: m.id,
        nombre: m.nombre,
        codigo_ine: m.codigo_ine,
        poblacion: m.poblacion,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        provincia: prov?.nombre || null,
        comunidad_autonoma: ccaa?.nombre || null,
        instrumentos_planeamiento: m.instrumentos_planeamiento || [],
      }
    })

    return NextResponse.json({ data, error: null, count: data.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ data: null, error: message, count: 0 }, { status: 500 })
  }
}
