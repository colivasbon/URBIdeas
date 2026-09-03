import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { getPerfilDemografico } from '@/lib/socideas-perfil'

export const dynamic = 'force-dynamic'

/** GET /api/socideas/perfil/[codigoINE]: ficha demográfica desde Supabase. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ codigoINE: string }> },
) {
  const { codigoINE } = await params
  try {
    const supabase = createSupabaseServer()
    const result = await getPerfilDemografico(supabase, codigoINE)
    if (result.status === 'badRequest') {
      return NextResponse.json({ data: null, error: 'Código INE inválido', count: 0 }, { status: 400 })
    }
    if (result.status === 'notFound') {
      return NextResponse.json({ data: null, error: 'Municipio no encontrado', count: 0 }, { status: 404 })
    }
    return NextResponse.json({
      data: result.perfil,
      error: null,
      count: result.status === 'ok' ? result.perfil.valores.length : 0,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ data: null, error: message, count: 0 }, { status: 500 })
  }
}
