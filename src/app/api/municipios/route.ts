import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const provincia_id = searchParams.get('provincia_id')
  const search = searchParams.get('search')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 500)

  if (!provincia_id && !search) {
    return NextResponse.json({ data: [], error: null, count: 0 })
  }

  try {
    const supabase = createSupabaseServer()

    let query = supabase
      .from('municipios')
      .select('id, nombre, codigo_ine, poblacion, provincia_id')
      .order('nombre')
      .limit(limit)

    if (provincia_id) {
      query = query.eq('provincia_id', provincia_id)
    }

    if (search) {
      query = query.ilike('nombre', `%${search}%`)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ data: data || [], error: null, count: data?.length ?? 0 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ data: null, error: message, count: 0 }, { status: 500 })
  }
}
