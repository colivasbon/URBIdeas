import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import type { ComunidadAutonoma, FuenteGeoportal, Municipio, Provincia } from '@/lib/types'

const RATE_LIMIT = 100

interface MunicipioConProvincia extends Municipio {
  provincia: Provincia & {
    comunidad_autonoma: ComunidadAutonoma
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const supabase = createSupabaseServer()

    const { data: municipio, error: municipioError } = await supabase
      .from('municipios')
      .select(`
        *,
        provincia:provincias(
          *,
          comunidad_autonoma:comunidades_autonomas(*)
        ),
        instrumentos_planeamiento(
          id, tipo, estado, fecha_aprobacion_inicial, fecha_aprobacion_definitiva,
          enlace_documento_oficial, enlace_geoportal, fuente, created_at
        )
      `)
      .eq('id', id)
      .single()

    if (municipioError) throw municipioError
    if (!municipio) {
      return NextResponse.json({ data: null, error: 'Municipio no encontrado', count: 0 }, { status: 404 })
    }

    const typedMunicipio = municipio as MunicipioConProvincia
    const comunidadAutonomaId = typedMunicipio.provincia?.comunidad_autonoma?.id

    let fuentesGeoportales: FuenteGeoportal[] = []
    if (comunidadAutonomaId) {
      const { data: fuentes } = await supabase
        .from('fuentes_geoportales')
        .select('*')
        .eq('comunidad_autonoma_id', comunidadAutonomaId)
        .eq('activo', true)

      fuentesGeoportales = (fuentes as FuenteGeoportal[]) || []
    }

    const data = { ...municipio, fuentes_geoportales: fuentesGeoportales }

    const response = NextResponse.json({ data, error: null, count: 1 })
    response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT))
    response.headers.set('X-RateLimit-Remaining', String(RATE_LIMIT - 1))
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ data: null, error: message, count: 0 }, { status: 500 })
  }
}
