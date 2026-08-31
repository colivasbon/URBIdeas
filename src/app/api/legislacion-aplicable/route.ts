import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

const RATE_LIMIT = 100

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const municipio_id = searchParams.get('municipio_id')

  console.log('[legislacion-aplicable] municipio_id:', municipio_id)

  if (!municipio_id) {
    return NextResponse.json(
      { data: null, error: 'Parámetro municipio_id requerido', count: 0 },
      { status: 400 }
    )
  }

  try {
    const supabase = createSupabaseServer()

    const { data: municipio, error: municipioError } = await supabase
      .from('municipios')
      .select('id, nombre, provincia_id, provincias(id, nombre, comunidad_autonoma_id)')
      .eq('id', municipio_id)
      .single()

    console.log('[legislacion-aplicable] municipio raw:', JSON.stringify(municipio, null, 2))
    console.log('[legislacion-aplicable] municipioError:', municipioError)

    if (municipioError || !municipio) {
      return NextResponse.json(
        { data: null, error: 'Municipio no encontrado', count: 0 },
        { status: 404 }
      )
    }

    const rawProvincias = municipio.provincias
    console.log('[legislacion-aplicable] rawProvincias type:', typeof rawProvincias, 'isArray:', Array.isArray(rawProvincias))

    const provincia = Array.isArray(rawProvincias)
      ? (rawProvincias[0] as { id: string; nombre: string; comunidad_autonoma_id: string } | undefined)
      : (rawProvincias as { id: string; nombre: string; comunidad_autonoma_id: string } | undefined)

    console.log('[legislacion-aplicable] resolved provincia:', JSON.stringify(provincia, null, 2))

    if (!provincia) {
      return NextResponse.json(
        { data: null, error: 'Provincia no encontrada para el municipio', count: 0 },
        { status: 404 }
      )
    }

    const comunidad_autonoma_id = provincia.comunidad_autonoma_id
    console.log('[legislacion-aplicable] comunidad_autonoma_id:', comunidad_autonoma_id)

    const NORMATIVA_FIELDS = 'id, ambito, titulo, referencia_legal, fecha_publicacion, enlace_boe_boletin, estado_vigencia, fuente_oficial, administracion_emisora, fecha_verificacion'

    const { data: estatal, error: estatalError } = await supabase
      .from('normativa_vigente')
      .select(NORMATIVA_FIELDS)
      .eq('ambito', 'estatal')
      .in('estado_vigencia', ['vigente', 'parcialmente derogada'])
      .order('fecha_publicacion', { ascending: false })

    console.log('[legislacion-aplicable] estatal count:', estatal?.length ?? 0, 'error:', estatalError)
    if (estatalError) throw estatalError

    const { data: autonomico, error: autonomicoError } = await supabase
      .from('normativa_vigente')
      .select(NORMATIVA_FIELDS)
      .eq('ambito', 'autonomico')
      .eq('comunidad_autonoma_id', comunidad_autonoma_id)
      .in('estado_vigencia', ['vigente', 'parcialmente derogada'])
      .order('fecha_publicacion', { ascending: false })

    console.log('[legislacion-aplicable] autonomico count:', autonomico?.length ?? 0, 'error:', autonomicoError)
    if (autonomicoError) throw autonomicoError

    const { data: municipal, error: municipalError } = await supabase
      .from('normativa_vigente')
      .select(NORMATIVA_FIELDS)
      .eq('ambito', 'municipal')
      .eq('municipio_id', municipio_id)
      .in('estado_vigencia', ['vigente', 'parcialmente derogada'])
      .order('fecha_publicacion', { ascending: false })

    console.log('[legislacion-aplicable] municipal count:', municipal?.length ?? 0, 'error:', municipalError)
    if (municipalError) throw municipalError

    const response = NextResponse.json({
      data: {
        estatal: estatal || [],
        autonomico: autonomico || [],
        municipal: municipal || [],
      },
      error: null,
    })

    response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT))
    response.headers.set('X-RateLimit-Remaining', String(RATE_LIMIT - 1))
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    console.error('[legislacion-aplicable] unexpected error:', error)
    return NextResponse.json({ data: null, error: message }, { status: 500 })
  }
}
