import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { syncMunicipioEconomia } from '@/lib/socideas-sync-economia'
import type { EconomiaSyncInput } from '@/lib/socideas-sync-economia'
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
 * POST /api/socideas/sync-economia/[codigoINE]: sincroniza el bloque económico
 * de UN municipio (actualización parcial del JSON v2; Demografía intacta).
 * Protegida con SOCIDEAS_SYNC_TOKEN (cabecera x-sync-token). Sin token → 401.
 * Body opcional: { aeatEjercicio, aeatBaseUrl, adrhTableIds, censoAgrarioUrls, conDirce }.
 * Nunca sincronización masiva. Sin carga nacional en esta fase.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ codigoINE: string }> },
) {
  if (!tokenOk(request)) {
    return NextResponse.json({ data: null, error: 'No autorizado', count: 0 }, { status: 401 })
  }
  const { codigoINE } = await params
  const input: EconomiaSyncInput = {}
  try {
    const body = (await request.json()) as Partial<EconomiaSyncInput>
    if (body && typeof body === 'object') {
      if (typeof body.aeatEjercicio === 'number') input.aeatEjercicio = body.aeatEjercicio
      if (typeof body.aeatBaseUrl === 'string') input.aeatBaseUrl = body.aeatBaseUrl
      if (Array.isArray(body.adrhTableIds)) {
        input.adrhTableIds = body.adrhTableIds.filter(
          (t): t is number | string => typeof t === 'number' || typeof t === 'string',
        )
      }
      if (Array.isArray(body.censoAgrarioUrls)) {
        input.censoAgrarioUrls = body.censoAgrarioUrls.filter((u): u is string => typeof u === 'string')
      }
      if (typeof body.conDirce === 'boolean') input.conDirce = body.conDirce
    }
  } catch {
    // Sin body: sincronización con valores por defecto (marcas de pendiente).
  }
  try {
    const supabase = createSupabaseServer()
    const summary = await syncMunicipioEconomia(supabase, codigoINE, input)
    return NextResponse.json({ data: summary, error: null, count: summary.registros_actualizados })
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500
    const message = status === 409
      ? 'Ya hay una sincronización económica en curso para este municipio'
      : error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ data: null, error: message, count: 0 }, { status })
  }
}
