import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { consultarSIU } from '@/lib/siu'
import { construirDictamen, type FichaAmbito } from '@/lib/dictamen'
import type { PerfilId } from '@/lib/familias'
import type { FilaCruce } from '@/lib/cruce'

const PERFILES: PerfilId[] = ['parcela', 'rustico', 'cribado', 'afecciones']

interface BodyDictamen {
  ambito: {
    nombre: string
    perfil_id: PerfilId
    geojson: GeoJSON.FeatureCollection
    preset_modificado?: boolean
  }
  filas: FilaCruce[]
  ficha?: Partial<FichaAmbito> & { superficie_m2: number }
  municipio?: { nombre?: string; ine?: string }
}

/**
 * POST /api/dictamen — endpoint único: pantalla, PDF y expediente consumen el mismo objeto.
 * El cruce (filas) lo aporta el cliente (Fase 2); aquí se añade planeamiento SIU/BD,
 * clasificación desde suelo local si existe, semáforo honesto y párrafos por perfil.
 */
export async function POST(request: NextRequest) {
  let body: BodyDictamen
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Cuerpo JSON inválido' }, { status: 400 })
  }

  const { ambito, filas } = body
  if (!ambito?.geojson?.features?.length) {
    return NextResponse.json({ data: null, error: 'Ámbito con geometría requerido' }, { status: 400 })
  }
  if (!PERFILES.includes(ambito.perfil_id)) {
    return NextResponse.json({ data: null, error: 'perfil_id no válido' }, { status: 400 })
  }
  if (!Array.isArray(filas)) {
    return NextResponse.json({ data: null, error: 'filas de cruce requeridas' }, { status: 400 })
  }

  const f = body.ficha || { superficie_m2: 0 }

  // Clasificación desde suelo local si el cruce la trae (sin inventar).
  const suelo = filas.find(r => r.capa_id === 'soil-local' && r.resultado === 'solapa' && r.detalle)
  const ficha: FichaAmbito = {
    municipio: body.municipio?.nombre || 'Municipio no identificado en fuentes consultadas',
    ine: body.municipio?.ine || '—',
    ref_catastral: f.ref_catastral || '—',
    superficie_m2: Math.round(f.superficie_m2 || 0),
    uso: f.uso || 'no disponible',
    clasificacion: f.clasificacion || (suelo?.detalle ? `Según capa de suelo: ${suelo.detalle}` : 'no disponible'),
    calificacion: f.calificacion || 'no disponible',
  }

  // Planeamiento: SIU (consulta) + instrumentos en BD si hay INE.
  let siu_figura = 'sin registro SIU'
  let instrumentos: unknown[] = []
  if (body.municipio?.ine || body.municipio?.nombre) {
    try {
      const where = body.municipio?.ine
        ? `ProvMunText = '${body.municipio.ine}'`
        : `UPPER(nombre) LIKE '%${(body.municipio?.nombre || '').toUpperCase().slice(0, 40)}%'`
      const regs = await consultarSIU(where)
      if (regs.length > 0) {
        const r = regs[0]
        siu_figura = `${r.figura_vigente || 'Figura sin denominar'} — ${r.nombre} (${r.codigo_ine})${r.url_link ? ` — ${r.url_link}` : ''}`
      }
    } catch { /* SIU caído: queda sin registro, no rompe */ }
    if (body.municipio?.nombre) {
      try {
        const supabase = createSupabaseServer()
        const { data: mun } = await supabase.from('municipios').select('id').ilike('nombre', body.municipio.nombre).limit(1).maybeSingle()
        if (mun) {
          const { data: inst } = await supabase.from('instrumentos_planeamiento')
            .select('tipo, estado, fecha_aprobacion_inicial, fecha_aprobacion_definitiva, enlace_documento_oficial, fuente')
            .eq('municipio_id', (mun as { id: string }).id)
            .order('created_at', { ascending: false }).limit(10)
          instrumentos = inst || []
        }
      } catch { /* BD: queda vacío, no rompe */ }
    }
  }

  const resultado = construirDictamen({
    perfil_id: ambito.perfil_id,
    preset_modificado: !!ambito.preset_modificado,
    filas,
    ficha,
    siu_figura,
    instrumentos,
  })

  return NextResponse.json({
    data: {
      ambito: { nombre: ambito.nombre, perfil_id: ambito.perfil_id },
      resultado,
      fecha: new Date().toISOString(),
    },
    error: null,
  })
}
