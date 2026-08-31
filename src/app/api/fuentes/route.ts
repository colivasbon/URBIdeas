import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

export async function GET(_request: NextRequest) {
  try {
    const supabase = createSupabaseServer()

    const { data, error } = await supabase
      .from('fuentes_geoportales')
      .select('id, nombre, url, tipo_servicio, ultima_actualizacion, activo')
      .order('nombre')

    if (error) throw error

    return NextResponse.json({ data, error: null })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ data: null, error: message }, { status: 500 })
  }
}
