import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase-server'
import { syncMunicipioDemografico } from '@/lib/socideas-sync'
import { muniCacheTag } from '@/lib/socideas-revalidate'
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
    // Escritura R2 confirmada (la lib solo devuelve summary si putMunicipioJson
    // terminó): invalidación selectiva de la tag municipal. Si la invalidación
    // falla NO se revierte R2; se audita como degradación en la respuesta y en
    // metadata del run (nunca se oculta el fallo).
    let revalidation: {
      solicitados: number
      invalidados: number
      errores: number
      modo: 'directo'
      degradado: boolean
      timestamp: string
      error?: string
    } | null = null
    if (summary.r2_key) {
      const ine = summary.municipio_codigo_ine
      try {
        revalidateTag(muniCacheTag(ine), { expire: 0 })
        revalidation = {
          solicitados: 1, invalidados: 1, errores: 0,
          modo: 'directo', degradado: false, timestamp: new Date().toISOString(),
        }
      } catch (e) {
        revalidation = {
          solicitados: 1, invalidados: 0, errores: 1,
          modo: 'directo', degradado: true, timestamp: new Date().toISOString(),
          error: (e instanceof Error ? e.message : 'error desconocido').slice(0, 200),
        }
      }
      // Auditoría: fusiona el resultado de revalidación en el run ya abierto,
      // preservando las claves de trazabilidad existentes.
      try {
        const { data: runRow } = await supabase
          .from('data_sync_runs')
          .select('metadata')
          .eq('id', summary.run_id)
          .maybeSingle()
        const previo = (runRow as { metadata: Record<string, unknown> | null } | null)?.metadata ?? {}
        await supabase
          .from('data_sync_runs')
          .update({ metadata: { ...previo, revalidation } })
          .eq('id', summary.run_id)
      } catch {
        // La invalidación ya se intentó: un fallo de auditoría no revierte R2
        // ni debe tumbar la respuesta (queda en el resumen HTTP).
      }
    }
    return NextResponse.json({
      data: { ...summary, revalidation },
      error: null,
      count: summary.registros_actualizados,
    })
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
