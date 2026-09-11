import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { applyMunicipalUpdate, previewMunicipalUpdate } from '@/lib/socideas-ine-layers-admin'
import { isValidIneCode } from '@/lib/socideas-ine-layers'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Herramienta interna de capas INE — PROTEGIDA con `SOCIDEAS_SYNC_TOKEN`
 * (cabecera `x-sync-token`, comparación en tiempo constante). Sin token → 401.
 *
 * GET  → vista previa de solo lectura del municipio (qué capas hay, período,
 *        definitivo/provisional, última carga). No escribe.
 * POST → apply con `dryRun` por defecto. En esta versión NUNCA escribe: sin
 *        capa INE aprobada por preflight, devuelve bloqueo explícito. Nunca
 *        ejecuta carga nacional, nunca toca otro municipio, nunca Supabase.
 */
function tokenOk(request: NextRequest): boolean {
  const expected = process.env.SOCIDEAS_SYNC_TOKEN
  if (!expected) return false
  const provided = request.headers.get('x-sync-token') ?? ''
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ codigoINE: string }> },
) {
  if (!tokenOk(request)) {
    return NextResponse.json({ data: null, error: 'No autorizado', count: 0 }, { status: 401 })
  }
  const { codigoINE } = await params
  if (!isValidIneCode(codigoINE)) {
    return NextResponse.json({ data: null, error: 'Código INE inválido (se esperan 5 dígitos)', count: 0 }, { status: 400 })
  }
  try {
    const preview = await previewMunicipalUpdate(codigoINE)
    return NextResponse.json({ data: preview, error: null, count: preview.layers.length })
  } catch {
    return NextResponse.json({ data: null, error: 'No se pudo preparar la actualización.', count: 0 }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ codigoINE: string }> },
) {
  if (!tokenOk(request)) {
    return NextResponse.json({ data: null, error: 'No autorizado', count: 0 }, { status: 401 })
  }
  const { codigoINE } = await params
  if (!isValidIneCode(codigoINE)) {
    return NextResponse.json({ data: null, error: 'Código INE inválido (se esperan 5 dígitos)', count: 0 }, { status: 400 })
  }
  const url = new URL(request.url)
  // Dry-run por defecto: sin confirmación explícita nunca se intenta escribir.
  const dryRun = url.searchParams.get('dryRun') !== 'false'
  try {
    if (dryRun) {
      const preview = await previewMunicipalUpdate(codigoINE)
      return NextResponse.json({ data: { dryRun: true, preview }, error: null, count: preview.layers.length })
    }
    const result = await applyMunicipalUpdate(codigoINE)
    return NextResponse.json({ data: result, error: null, count: 0 })
  } catch {
    return NextResponse.json({ data: null, error: 'No se pudo completar la operación.', count: 0 }, { status: 500 })
  }
}
