import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { syncMunicipioDemografico } from '@/lib/socideas-sync'
import { timingSafeEqual } from 'crypto'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

function tokenOk(request: NextRequest): boolean {
  const expected = process.env.SOCIDEAS_SYNC_TOKEN
  if (!expected) return false
  const provided = request.headers.get('x-sync-token') ?? ''
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * POST /api/socideas/sync/[codigoINE]: sincroniza UN municipio (DPOP + edad/sexo).
 * Protegida con SOCIDEAS_SYNC_TOKEN (cabecera x-sync-token). Sin token → 401.
 * Nunca sincronización masiva. Los errores internos no se exponen al navegador.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ codigoINE: string }> },
) {
  if (!tokenOk(request)) {
    return NextResponse.json({ data: null, error: 'No autorizado', count: 0 }, { status: 401 })
  }
  const { codigoINE } = await params
  try {
    const supabase = createSupabaseServer()
    const summary = await syncMunicipioDemografico(supabase, codigoINE)
    return NextResponse.json({ data: summary, error: null, count: summary.registros_actualizados })
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500
    // Resumen seguro: sin trazas internas ni URLs sensibles.
    const message = status === 409
      ? 'Ya hay una sincronización en curso para este municipio'
      : error instanceof Error
        ? error.message
        : 'Error interno del servidor'
    return NextResponse.json({ data: null, error: message, count: 0 }, { status })
  }
}
