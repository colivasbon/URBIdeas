import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

const RATE_LIMIT = 100

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const municipio_id = searchParams.get('municipio_id')

  if (!municipio_id) {
    return NextResponse.json(
      { data: null, error: 'Parámetro municipio_id requerido', count: 0 },
      { status: 400 }
    )
  }

  try {
    const supabase = createSupabaseServer()

    // 1. Get municipio → provincia → comunidad_autonoma_id
    const { data: municipio, error: municipioError } = await supabase
      .from('municipios')
      .select('id, nombre, provincia_id, provincias(id, nombre, comunidad_autonoma_id)')
      .eq('id', municipio_id)
      .single()

    if (municipioError || !municipio) {
      return NextResponse.json(
        { data: null, error: 'Municipio no encontrado', count: 0 },
        { status: 404 }
      )
    }

    const provincia = Array.isArray(municipio.provincias)
      ? municipio.provincias[0] as { id: string; nombre: string; comunidad_autonoma_id: string } | null
      : municipio.provincias as { id: string; nombre: string; comunidad_autonoma_id: string } | null
    if (!provincia) {
      return NextResponse.json(
        { data: null, error: 'Provincia no encontrada para el municipio', count: 0 },
        { status: 404 }
      )
    }

    const comunidad_autonoma_id = provincia.comunidad_autonoma_id

    // 2. Fetch normativa estatal (applies to all)
    const { data: estatal, error: estatalError } = await supabase
      .from('normativa_vigente')
      .select('*')
      .eq('ambito', 'estatal')
      .eq('estado_vigencia', 'vigente')
      .order('fecha_publicacion', { ascending: false })

    if (estatalError) throw estatalError

    // 3. Fetch normativa autonómica for this comunidad
    const { data: autonomico, error: autonomicoError } = await supabase
      .from('normativa_vigente')
      .select('*')
      .eq('ambito', 'autonomico')
      .eq('comunidad_autonoma_id', comunidad_autonoma_id)
      .eq('estado_vigencia', 'vigente')
      .order('fecha_publicacion', { ascending: false })

    if (autonomicoError) throw autonomicoError

    // 4. Fetch instrumentos de planeamiento vigentes para el municipio
    const { data: municipal, error: municipalError } = await supabase
      .from('instrumentos_planeamiento')
      .select('*')
      .eq('municipio_id', municipio_id)
      .eq('estado', 'vigente')
      .order('fecha_aprobacion_definitiva', { ascending: false })

    if (municipalError) throw municipalError

    // 5. Return grouped result
    const response = NextResponse.json({
      data: {
        estatal: estatal || [],
        autonomico: autonomico || [],
        municipal: municipal || [],
      },
      municipio: {
        id: municipio.id,
        nombre: municipio.nombre,
      },
      provincia: {
        id: provincia.id,
        nombre: provincia.nombre,
      },
      comunidad_autonoma_id,
      error: null,
    })

    response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT))
    response.headers.set('X-RateLimit-Remaining', String(RATE_LIMIT - 1))
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ data: null, error: message }, { status: 500 })
  }
}
