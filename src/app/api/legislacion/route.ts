import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

const RATE_LIMIT = 100

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const ambito = searchParams.get('ambito')
  const comunidad_autonoma_id = searchParams.get('comunidad_autonoma_id')

  try {
    const supabase = createSupabaseServer()

    let query = supabase
      .from('normativa_vigente')
      .select(`
        *,
        comunidad_autonoma:comunidades_autonomas(id, nombre)
      `, { count: 'exact' })
      .order('fecha_publicacion', { ascending: false })

    if (ambito) {
      query = query.eq('ambito', ambito)
    }

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
