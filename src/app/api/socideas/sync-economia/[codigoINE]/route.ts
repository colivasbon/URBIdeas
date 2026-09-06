import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
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
  const url = new URL(request.url)
  const dryRunParam = url.searchParams.get('dryRun')
  const provisionalParam = url.searchParams.get('provisional')
  const input: EconomiaSyncInput = {
    // Por defecto dry-run hasta autorización expresa para escribir en R2
    dryRun: dryRunParam ? dryRunParam !== 'false' : true,
    provisional: provisionalParam === 'true',
  }
  try {
    const body = (await request.json()) as Partial<EconomiaSyncInput & { dryRun?: boolean; provisional?: boolean }>
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
      if (typeof body.dryRun === 'boolean') input.dryRun = body.dryRun
      if (typeof body.provisional === 'boolean') input.provisional = body.provisional
    }
  } catch {
    // Sin body: sincronización con valores por defecto (marcas de pendiente).
  }
  // En batch 1, "Comprobar provisionales" debe indicar que no hay fuente provisional configurada
  if (input.provisional) {
    return NextResponse.json(
      { data: { provisional: false, motivo: 'No hay fuente provisional configurada para economía (ADRH provisional 2024 excluido)' }, error: null, count: 0 },
      { status: 200 },
    )
  }
  try {
    const supabase = createSupabaseServer()
    const summary = await syncMunicipioEconomia(supabase, codigoINE, input)
    // Hot-update: invalida el Data Cache R2 de la ficha para que recargue
    // inmediatamente el JSON nuevo (solo en escritura real, no en dry-run).
    if (!input.dryRun) {
      try {
        revalidateTag(`socideas-muni-${codigoINE}`, { expire: 0 })
      } catch {
        // La sincronización ya ha terminado: un fallo de invalidación
        // nunca debe tumbar la respuesta.
      }
    }
    return NextResponse.json({ data: summary, error: null, count: summary.registros_actualizados })
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500
    const message = status === 409
      ? 'Ya hay una sincronización económica en curso para este municipio'
      : error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ data: null, error: message, count: 0 }, { status })
  }
}
