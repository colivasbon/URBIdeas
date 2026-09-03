import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

// Buscador municipal de SOCideas (servidor): por nombre, provincia y código INE.
// Respuesta: { data, error, count } con provincia y comunidad autónoma.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()
  const provincia = (searchParams.get('provincia') ?? '').trim()
  const provinciaId = (searchParams.get('provincia_id') ?? '').trim()
  const codigoIne = (searchParams.get('codigo_ine') ?? '').trim()
  const maxLimit = provinciaId ? 500 : 50
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), maxLimit)

  if (!q && !provincia && !provinciaId && !codigoIne) {
    return NextResponse.json({ data: [], error: null, count: 0 })
  }
  if (provinciaId && !/^[0-9a-f-]{36}$/i.test(provinciaId)) {
    return NextResponse.json({ data: null, error: 'provincia_id inválido', count: 0 }, { status: 400 })
  }

  try {
    const supabase = createSupabaseServer()
    // El filtro por provincia exige join interno (!inner) para filtrar
    // sobre la tabla relacionada.
    const join = provincia ? '!inner' : ''
    let query = supabase
      .from('municipios')
      .select(
        `codigo_ine, nombre, poblacion, provincia:provincias${join}(nombre, comunidad_autonoma:comunidades_autonomas(nombre))`,
      )
      .limit(limit)

    if (codigoIne) {
      query = query.eq('codigo_ine', codigoIne)
    } else {
      if (q) query = query.ilike('nombre', `%${q}%`)
      if (provinciaId) query = query.eq('provincia_id', provinciaId)
      else if (provincia) query = query.ilike('provincias.nombre', `%${provincia}%`)
    }

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ data: data ?? [], error: null, count: (data ?? []).length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ data: null, error: message, count: 0 }, { status: 500 })
  }
}
