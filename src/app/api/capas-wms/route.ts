import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

const RATE_LIMIT = 100

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const comunidad_autonoma_id = searchParams.get('comunidad_autonoma_id')

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
