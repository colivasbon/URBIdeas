import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

const RATE_LIMIT = 100

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const comunidad_autonoma_id = searchParams.get('comunidad_autonoma_id')
  const provincia_id = searchParams.get('provincia_id')
  const search = searchParams.get('search')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
  const offset = parseInt(searchParams.get('offset') || '0')

  try {
    const supabase = createSupabaseServer()

    let query = supabase
      .from('municipios')
      .select(`
        *,
        provincia:provincias(
          *,
          comunidad_autonoma:comunidades_autonomas(*)
        ),
        instrumentos_planeamiento(
          id, tipo, estado, fecha_aprobacion_inicial, fecha_aprobacion_definitiva,
          enlace_documento_oficial, enlace_geoportal, fuente
        )
      `, { count: 'exact' })
      .order('nombre')
      .range(offset, offset + limit - 1)

    if (comunidad_autonoma_id) {
      query = query.filter('provincia.comunidad_autonoma_id', 'eq', comunidad_autonoma_id)
    }

    if (provincia_id) {
      query = query.eq('provincia_id', provincia_id)
    }

    if (search) {
      query = query.ilike('nombre', `%${search}%`)
    }

    const { data, error, count } = await query

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
