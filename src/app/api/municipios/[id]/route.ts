import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const supabase = createSupabaseServer()

    const { data: municipio, error: municipioError } = await supabase
      .from('municipios')
      .select(`
        *,
        provincia:provincias(
          *,
          comunidad_autonoma:comunidades_autonomas(*)
        ),
        instrumentos_planeamiento(
          id, tipo, estado, fecha_aprobacion_inicial, fecha_aprobacion_definitiva,
          enlace_documento_oficial, enlace_geoportal, fuente, created_at
        )
      `)
      .eq('id', id)
      .single()

    if (municipioError) throw municipioError
    if (!municipio) {
      return NextResponse.json({ data: null, error: 'Municipio no encontrado', count: 0 }, { status: 404 })
    }

    // Get lat/lng via RPC function
    let lat: number | null = null
    let lng: number | null = null
    try {
      const { data: coords } = await supabase.rpc('get_municipio_coords' as never, { p_id: id } as never).single()
      if (coords && typeof coords === 'object') {
        const c = coords as { lat: number; lng: number }
        lat = c.lat
        lng = c.lng
      }
    } catch { /* function may not exist yet */ }

    const data = { ...municipio, lat, lng }

    return NextResponse.json({ data, error: null, count: 1 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ data: null, error: message, count: 0 }, { status: 500 })
  }
}
