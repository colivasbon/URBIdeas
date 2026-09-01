import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

const RATE_LIMIT = 100

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const codigo_ine = searchParams.get('codigo_ine')
  const municipio_id = searchParams.get('municipio_id')
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')

  try {
    const supabase = createSupabaseServer()

    let query = supabase
      .from('directorio_ayuntamientos')
      .select(`
        *,
        municipio:municipios(id, nombre, provincia_id)
      `, { count: 'exact' })
      .order('nombre_ayuntamiento')
      .range(offset, offset + limit - 1)

    if (codigo_ine) {
      query = query.eq('codigo_ine', codigo_ine)
    }

    if (municipio_id) {
      query = query.eq('municipio_id', municipio_id)
    }

    const { data, error, count } = await query

    if (error) throw error

    const response = NextResponse.json({ 
      data, 
      error: null, 
      count,
      pagination: {
        limit,
        offset,
        total: count || 0,
        hasMore: (offset + limit) < (count || 0)
      }
    })
    
    response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT))
    response.headers.set('X-RateLimit-Remaining', String(RATE_LIMIT - 1))
    return response

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ 
      data: null, 
      error: message, 
      count: 0 
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = createSupabaseServer()

    // Validate required fields
    if (!body.codigo_ine || !body.nombre_ayuntamiento) {
      return NextResponse.json(
        { error: 'codigo_ine y nombre_ayuntamiento son requeridos' },
        { status: 400 }
      )
    }

    // Check if already exists
    const { data: existing } = await supabase
      .from('directorio_ayuntamientos')
      .select('id')
      .eq('codigo_ine', body.codigo_ine)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'Ya existe un registro para este código INE' },
        { status: 409 }
      )
    }

    const { data, error } = await supabase
      .from('directorio_ayuntamientos')
      .insert({
        codigo_ine: body.codigo_ine,
        municipio_id: body.municipio_id,
        nombre_ayuntamiento: body.nombre_ayuntamiento,
        url_web_oficial: body.url_web_oficial,
        url_legislacion_urbanistica: body.url_legislacion_urbanistica,
        url_plan_ordenacion: body.url_plan_ordenacion,
        url_boletin_municipal: body.url_boletin_municipal,
        tiene_datos_abiertos: body.tiene_datos_abiertos || false,
        url_api_datos_abiertos: body.url_api_datos_abiertos,
        notas: body.notas
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ data, error: null }, { status: 201 })

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = createSupabaseServer()

    if (!body.id) {
      return NextResponse.json(
        { error: 'id es requerido para actualizar' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('directorio_ayuntamientos')
      .update({
        municipio_id: body.municipio_id,
        nombre_ayuntamiento: body.nombre_ayuntamiento,
        url_web_oficial: body.url_web_oficial,
        url_legislacion_urbanistica: body.url_legislacion_urbanistica,
        url_plan_ordenacion: body.url_plan_ordenacion,
        url_boletin_municipal: body.url_boletin_municipal,
        tiene_datos_abiertos: body.tiene_datos_abiertos,
        url_api_datos_abiertos: body.url_api_datos_abiertos,
        notas: body.notas,
        updated_at: new Date().toISOString()
      })
      .eq('id', body.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ data, error: null })

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
