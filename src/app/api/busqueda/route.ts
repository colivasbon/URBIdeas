import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

const RATE_LIMIT = 100

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)

  if (!q || q.trim().length === 0) {
    return NextResponse.json({ data: [], error: null, count: 0 })
  }

  try {
    const supabase = createSupabaseServer()
    const searchTerm = q.trim()

    const [municipiosResult, normativaResult] = await Promise.all([
      supabase
        .from('municipios')
        .select(`
          id, nombre, codigo_ine, poblacion,
          provincia:provincias(
            id, nombre,
            comunidad_autonoma:comunidades_autonomas(id, nombre)
          )
        `)
        .ilike('nombre', `%${searchTerm}%`)
        .limit(limit),
      supabase
        .from('normativa_vigente')
        .select(`
          id, titulo, referencia_legal, ambito, estado_vigencia, fecha_publicacion,
          enlace_boe_boletin,
          comunidad_autonoma:comunidades_autonomas(id, nombre)
        `)
        .or(`titulo.ilike.%${searchTerm}%,referencia_legal.ilike.%${searchTerm}%`)
        .limit(limit),
    ])

    if (municipiosResult.error) throw municipiosResult.error
    if (normativaResult.error) throw normativaResult.error

    const municipios = (municipiosResult.data || []).map((m) => ({
      ...m,
      tipo: 'municipio' as const,
    }))

    const normativa = (normativaResult.data || []).map((n) => ({
      ...n,
      tipo: 'legislacion' as const,
    }))

    const data = [...municipios, ...normativa].slice(0, limit)

    const response = NextResponse.json({ data, error: null, count: data.length })
    response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT))
    response.headers.set('X-RateLimit-Remaining', String(RATE_LIMIT - 1))
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ data: null, error: message, count: 0 }, { status: 500 })
  }
}
