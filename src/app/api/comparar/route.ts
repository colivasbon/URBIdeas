import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

const RATE_LIMIT = 100
const MAX_IDS = 10
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const municipio_ids_param = searchParams.get('municipio_ids')

  if (!municipio_ids_param) {
    return NextResponse.json(
      { data: null, error: 'Parámetro municipio_ids requerido', count: 0 },
      { status: 400 }
    )
  }

  const ids = municipio_ids_param.split(',').map((s) => s.trim()).filter(Boolean)

  if (ids.length === 0) {
    return NextResponse.json(
      { data: null, error: 'Se requiere al menos un municipio_id', count: 0 },
      { status: 400 }
    )
  }

  if (ids.length > MAX_IDS) {
    return NextResponse.json(
      { data: null, error: `Máximo ${MAX_IDS} municipios permitidos`, count: 0 },
      { status: 400 }
    )
  }

  const invalidId = ids.find((id) => !UUID_REGEX.test(id))
  if (invalidId) {
    return NextResponse.json(
      { data: null, error: `UUID inválido: ${invalidId}`, count: 0 },
      { status: 400 }
    )
  }

  try {
    const supabase = createSupabaseServer()

    const { data: municipios, error: municipiosError } = await supabase
      .from('municipios')
      .select(`
        id, nombre, codigo_ine, poblacion,
        provincia:provincias(
          id, nombre,
          comunidad_autonoma:comunidades_autonomas(id, nombre)
        ),
        instrumentos_planeamiento(
          tipo, estado, fecha_aprobacion_definitiva,
          enlace_documento_oficial, enlace_geoportal
        )
      `)
      .in('id', ids)

    if (municipiosError) throw municipiosError

    const data = (municipios || []).map((m) => {
      const provincia = Array.isArray(m.provincia)
        ? m.provincia[0]
        : m.provincia
      const comunidad_autonoma = provincia
        ? Array.isArray(provincia.comunidad_autonoma)
          ? provincia.comunidad_autonoma[0]
          : provincia.comunidad_autonoma
        : null

      return {
        id: m.id,
        nombre: m.nombre,
        codigo_ine: m.codigo_ine,
        poblacion: m.poblacion,
        provincia: provincia?.nombre || null,
        comunidad_autonoma: comunidad_autonoma?.nombre || null,
        instrumentos_planeamiento: m.instrumentos_planeamiento || [],
      }
    })

    const response = NextResponse.json({ data, error: null, count: data.length })
    response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT))
    response.headers.set('X-RateLimit-Remaining', String(RATE_LIMIT - 1))
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ data: null, error: message, count: 0 }, { status: 500 })
  }
}
