import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { getPerfilDemografico } from '@/lib/socideas-perfil'
import type { FiltrosPerfil } from '@/lib/socideas-perfil'
import { AMBITOS, SOCIDEAS_INDICATORS } from '@/lib/socideas'
import type { AmbitoTerritorial } from '@/lib/socideas'

export const dynamic = 'force-dynamic'

function parseYear(raw: string | null): number | undefined {
  if (!raw || !/^\d{4}$/.test(raw)) return undefined
  const n = parseInt(raw, 10)
  return n >= 1900 && n <= 2100 ? n : undefined
}

/** GET /api/socideas/perfil/[codigoINE]: ficha demográfica desde Supabase.
 * Parámetros opcionales (todos validados; lo inválido se ignora):
 * anio, desde, hasta, pir_anio (AAAA), sexo (total|hombres|mujeres|comparar),
 * pir_modo (abs|pct), comparar (csv de municipio|provincia|ccaa|espana),
 * indicadores (csv de slugs). Sin escritura; lectura Supabase. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ codigoINE: string }> },
) {
  const { codigoINE } = await params
  const sp = new URL(request.url).searchParams

  const comparar = (sp.get('comparar') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is AmbitoTerritorial => (AMBITOS as string[]).includes(s))
  const indicadores = (sp.get('indicadores') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => (SOCIDEAS_INDICATORS as readonly string[]).includes(s))
  const sexo = sp.get('sexo')
  const pirModo = sp.get('pir_modo')

  const filtros: FiltrosPerfil = {}
  const anio = parseYear(sp.get('anio'))
  const desde = parseYear(sp.get('desde'))
  const hasta = parseYear(sp.get('hasta'))
  const pirAnio = parseYear(sp.get('pir_anio'))
  if (anio !== undefined) filtros.anio = anio
  if (desde !== undefined) filtros.desde = desde
  if (hasta !== undefined) filtros.hasta = hasta
  if (pirAnio !== undefined) filtros.pirAnio = pirAnio
  if (comparar.length > 0) filtros.ambitos = comparar
  if (indicadores.length > 0) filtros.indicadores = indicadores

  try {
    const supabase = createSupabaseServer()
    const result = await getPerfilDemografico(supabase, codigoINE, filtros)
    if (result.status === 'badRequest') {
      return NextResponse.json({ data: null, error: 'Código INE inválido', count: 0 }, { status: 400 })
    }
    if (result.status === 'notFound') {
      return NextResponse.json({ data: null, error: 'Municipio no encontrado', count: 0 }, { status: 404 })
    }
    // sexo y pir_modo son presentación del cliente: se devuelven validados
    // como eco para que la UI los refleje en la URL sin revalidar.
    const vista = {
      sexo: sexo === 'hombres' || sexo === 'mujeres' || sexo === 'comparar' ? sexo : 'total',
      pir_modo: pirModo === 'pct' ? 'pct' : 'abs',
    }
    return NextResponse.json({
      data: result.perfil,
      vista,
      error: null,
      count: result.status === 'ok' ? result.perfil.valores.length : 0,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ data: null, error: message, count: 0 }, { status: 500 })
  }
}
