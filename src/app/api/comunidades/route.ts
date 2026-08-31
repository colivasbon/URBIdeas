import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = createSupabaseServer()

    const { data, error } = await supabase
      .from('comunidades_autonomas')
      .select('id, nombre')
      .order('nombre')

    if (error) throw error

    return NextResponse.json({ data, error: null })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ data: null, error: message }, { status: 500 })
  }
}
