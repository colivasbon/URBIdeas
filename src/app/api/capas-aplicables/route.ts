import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

const RATE_LIMIT = 100

interface CapaWMS {
  id: string
  nombre_capa: string
  url_servicio: string
  tipo_servicio: string
  formato_soportado: string
  sistema_referencia: string
  fecha_verificacion: string
  categoria: string
  activo: boolean
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const municipio_id = searchParams.get('municipio_id')

  if (!municipio_id) {
    return NextResponse.json(
      { data: null, error: 'Parámetro municipio_id requerido', count: 0 },
      { status: 400 }
    )
  }

  try {
    const supabase = createSupabaseServer()

    // 1. Get municipio → provincia → comunidad_autonoma_id
    const { data: municipio, error: municipioError } = await supabase
      .from('municipios')
      .select('id, nombre, provincia_id, provincias(id, nombre, comunidad_autonoma_id)')
      .eq('id', municipio_id)
      .single()

    if (municipioError || !municipio) {
      return NextResponse.json(
        { data: null, error: 'Municipio no encontrado', count: 0 },
        { status: 404 }
      )
    }

    const provincia = Array.isArray(municipio.provincias)
      ? municipio.provincias[0] as { id: string; nombre: string; comunidad_autonoma_id: string } | null
      : municipio.provincias as { id: string; nombre: string; comunidad_autonoma_id: string } | null
    if (!provincia) {
      return NextResponse.json(
        { data: null, error: 'Provincia no encontrada para el municipio', count: 0 },
        { status: 404 }
      )
    }

    const comunidad_autonoma_id = provincia.comunidad_autonoma_id

    // 2. Fetch capas_wms for this comunidad autónoma, activas
    const { data: capas, error: capasError } = await supabase
      .from('capas_wms')
      .select('*')
      .eq('comunidad_autonoma_id', comunidad_autonoma_id)
      .eq('activo', true)
      .order('categoria')
      .order('nombre_capa')

    if (capasError) throw capasError

    // 3. Group by categoria
    const grouped: Record<string, CapaWMS[]> = {}
    for (const capa of (capas || []) as CapaWMS[]) {
      const cat = capa.categoria || 'planeamiento_general'
      if (!grouped[cat]) {
        grouped[cat] = []
      }
      grouped[cat].push(capa)
    }

    // 4. Return grouped result
    const response = NextResponse.json({
      data: grouped,
      count: (capas || []).length,
      municipio: {
        id: municipio.id,
        nombre: municipio.nombre,
      },
      provincia: {
        id: provincia.id,
        nombre: provincia.nombre,
      },
      comunidad_autonoma_id,
      error: null,
    })

    response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT))
    response.headers.set('X-RateLimit-Remaining', String(RATE_LIMIT - 1))
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ data: null, error: message, count: 0 }, { status: 500 })
  }
}
