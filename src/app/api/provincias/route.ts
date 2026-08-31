import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const comunidad_autonoma_id = searchParams.get('comunidad_autonoma_id')

  if (!comunidad_autonoma_id) {
    return NextResponse.json(
      { data: null, error: 'Se requiere comunidad_autonoma_id' },
      { status: 400 }
    )
  }

  try {
    const supabase = createSupabaseServer()

    const { data, error } = await supabase
      .from('provincias')
      .select('id, nombre, codigo_ine, comunidad_autonoma_id')
      .eq('comunidad_autonoma_id', comunidad_autonoma_id)
      .order('nombre')

    if (error) throw error

    return NextResponse.json({ data, error: null })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ data: null, error: message }, { status: 500 })
  }
}
