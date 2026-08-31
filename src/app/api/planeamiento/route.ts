import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

const RATE_LIMIT = 100

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const municipio_ids = searchParams.get('municipio_ids')
  const municipio_id = searchParams.get('municipio_id')

  const ids = [
    ...(municipio_id ? [municipio_id] : []),
    ...(municipio_ids ? municipio_ids.split(',').map((s) => s.trim()).filter(Boolean) : []),
  ]

  if (ids.length === 0) {
    return NextResponse.json(
      { data: [], error: 'Se requiere al menos un municipio_id', count: 0 },
      { status: 400 }
    )
  }

  try {
    const supabase = createSupabaseServer()

    const { data, error, count } = await supabase
      .from('instrumentos_planeamiento')
      .select(`
        *,
        municipio:municipios(
          id, nombre, codigo_ine, poblacion,
          provincia:provincias(
            id, nombre, codigo_ine,
            comunidad_autonoma:comunidades_autonomas(id, nombre)
          )
        )
      `, { count: 'exact' })
      .in('municipio_id', ids)
      .order('created_at', { ascending: false })

    if (error) throw error

    const response = NextResponse.json({ data, error: null, count })
    response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT))
    response.headers.set('X-RateLimit-Remaining', String(RATE_LIMIT - 1))
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ data: null, error: message, count: 0 }, { status: 500 })
  }
}
