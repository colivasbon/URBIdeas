import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

const RATE_LIMIT = 50

function escapeCsvField(value: string | number | null): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function arrayToCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const lines = [
    headers.map(escapeCsvField).join(','),
    ...rows.map((row) => headers.map((h) => escapeCsvField(row[h])).join(',')),
  ]
  return lines.join('\n')
}

interface PlaneamientoRecord {
  municipio_nombre: string
  municipio_codigo_ine: string
  provincia_nombre: string
  comunidad_autonoma_nombre: string
  instrumento_tipo: string
  instrumento_estado: string
  fecha_aprobacion_inicial: string
  fecha_aprobacion_definitiva: string
  enlace_documento_oficial: string
  enlace_geoportal: string
  fuente: string
}

interface LegislacionRecord {
  ambito: string
  comunidad_autonoma_nombre: string
  titulo: string
  referencia_legal: string
  fecha_publicacion: string
  enlace_boe_boletin: string
  estado_vigencia: string
}

interface MunicipioNested {
  id?: string
  nombre?: string
  codigo_ine?: string
  poblacion?: number
  provincia?: {
    id?: string
    nombre?: string
    codigo_ine?: string
    comunidad_autonoma?: {
      id?: string
      nombre?: string
    }
  }
}

interface NormativaNested {
  comunidad_autonoma?: {
    id?: string
    nombre?: string
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const format = searchParams.get('format') || 'json'
  const tipo = searchParams.get('tipo') || 'planeamiento'
  const municipio_ids = searchParams.get('municipio_ids')
  const comunidad_autonoma_id = searchParams.get('comunidad_autonoma_id')

  try {
    const supabase = createSupabaseServer()
    let data: PlaneamientoRecord[] | LegislacionRecord[] = []

    if (tipo === 'planeamiento') {
      let query = supabase
        .from('instrumentos_planeamiento')
        .select(`
          id, tipo, estado, fecha_aprobacion_inicial, fecha_aprobacion_definitiva,
          enlace_documento_oficial, enlace_geoportal, fuente,
          municipio:municipios(
            id, nombre, codigo_ine, poblacion,
            provincia:provincias(
              id, nombre, codigo_ine,
              comunidad_autonoma:comunidades_autonomas(id, nombre)
            )
          )
        `)
        .order('created_at', { ascending: false })

      if (municipio_ids) {
        const ids = municipio_ids.split(',').map((s) => s.trim()).filter(Boolean)
        query = query.in('municipio_id', ids)
      }

      const { data: planeamiento, error } = await query
      if (error) throw error

      data = (planeamiento || []).map((p) => {
        const municipio = p.municipio as unknown as MunicipioNested
        return {
          municipio_nombre: municipio?.nombre || '',
          municipio_codigo_ine: municipio?.codigo_ine || '',
          provincia_nombre: municipio?.provincia?.nombre || '',
          comunidad_autonoma_nombre: municipio?.provincia?.comunidad_autonoma?.nombre || '',
          instrumento_tipo: p.tipo,
          instrumento_estado: p.estado,
          fecha_aprobacion_inicial: p.fecha_aprobacion_inicial || '',
          fecha_aprobacion_definitiva: p.fecha_aprobacion_definitiva || '',
          enlace_documento_oficial: p.enlace_documento_oficial || '',
          enlace_geoportal: p.enlace_geoportal || '',
          fuente: p.fuente || '',
        }
      })
    } else if (tipo === 'legislacion') {
      let query = supabase
        .from('normativa_vigente')
        .select(`
          id, ambito, titulo, referencia_legal, fecha_publicacion,
          enlace_boe_boletin, estado_vigencia,
          comunidad_autonoma:comunidades_autonomas(id, nombre)
        `)
        .order('fecha_publicacion', { ascending: false })

      if (comunidad_autonoma_id) {
        query = query.eq('comunidad_autonoma_id', comunidad_autonoma_id)
      }

      const { data: legislacion, error } = await query
      if (error) throw error

      data = (legislacion || []).map((l) => {
        const normativa = l as unknown as NormativaNested
        return {
          ambito: l.ambito,
          comunidad_autonoma_nombre: normativa?.comunidad_autonoma?.nombre || '',
          titulo: l.titulo,
          referencia_legal: l.referencia_legal,
          fecha_publicacion: l.fecha_publicacion || '',
          enlace_boe_boletin: l.enlace_boe_boletin || '',
          estado_vigencia: l.estado_vigencia,
        }
      })
    } else {
      return NextResponse.json(
        { data: null, error: 'Tipo no válido. Use "planeamiento" o "legislacion"', count: 0 },
        { status: 400 }
      )
    }

    if (format === 'csv') {
      const csv = arrayToCsv(data as unknown as Record<string, string | number>[])
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="urideas_${tipo}_${new Date().toISOString().slice(0, 10)}.csv"`,
          'X-RateLimit-Limit': String(RATE_LIMIT),
          'X-RateLimit-Remaining': String(RATE_LIMIT - 1),
        },
      })
    }

    const response = NextResponse.json({ data, error: null, count: data.length })
    response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT))
    response.headers.set('X-RateLimit-Remaining', String(RATE_LIMIT - 1))
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ data: null, error: message, count: 0 }, { status: 500 })
  }
}
