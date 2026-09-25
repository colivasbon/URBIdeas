import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const OGC_BASE = 'https://www.ine.es/geoserver/ogc/features/v1'
const WFS_BASE = 'https://www.ine.es/geoserver/WMS_INE_SECCIONES_G01/wfs'
const ATRIBUCION = 'Seccionado cedido por el Instituto Nacional de Estadística'

// Colecciones verificadas (más reciente primero). El año de la colección es el
// año de delimitación que se devuelve y muestra en la UI.
const COLECCIONES = ['Secciones_2025', 'Secciones_2024'] as const

function trimPrecision(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(trimPrecision)
  if (typeof obj === 'number') return Math.round(obj * 100000) / 100000
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) out[k] = trimPrecision(v)
    return out
  }
  return obj
}

async function fetchTimeout(url: string, ms = 20000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { signal: controller.signal, headers: { Accept: 'application/geo+json, application/json' } })
  } finally {
    clearTimeout(timer)
  }
}

/** Log de rendimiento solo en desarrollo: duración, colección y conteo.
 * Sin tokens, geometrías ni datos personales. */
function devLogSecciones(msg: string): void {
  if (process.env.NODE_ENV !== 'production') {
    console.debug(`[socideas][secciones] ${msg}`)
  }
}

/** GET /api/socideas/secciones/[codigoINE]: geometría de secciones censales del
 * municipio (proxy servidor; el navegador nunca llama al INE directamente).
 * Solo el municipio solicitado, colección más reciente disponible. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ codigoINE: string }> },
) {
  const { codigoINE } = await params
  if (!/^\d{5}$/.test((codigoINE ?? '').trim())) {
    return NextResponse.json({ data: null, error: 'Código INE inválido', count: 0 }, { status: 400 })
  }
  const ine = codigoINE.trim()
  const t0 = Date.now()

  try {
    const supabase = createSupabaseServer()
    const { data: muni } = await supabase
      .from('municipios')
      .select('nombre, provincia:provincias(nombre, comunidad_autonoma:comunidades_autonomas(nombre))')
      .eq('codigo_ine', ine)
      .single()
    if (!muni) {
      return NextResponse.json({ data: null, error: 'Municipio no encontrado', count: 0 }, { status: 404 })
    }

    let lastError = 'sin respuesta del INE'
    for (const coleccion of COLECCIONES) {
      const collectionId = `WMS_INE_SECCIONES_G01:${coleccion}`
      // 1. OGC API Features con filtro CQL por municipio.
      try {
        const url =
          `${OGC_BASE}/collections/${encodeURIComponent(collectionId)}/items` +
          `?f=json&limit=1000&filter-lang=cql-text&filter=${encodeURIComponent(`CUMUN='${ine}'`)}`
        const res = await fetchTimeout(url)
        if (res.ok) {
          const geo = (await res.json()) as { features?: unknown[] }
          if (Array.isArray(geo.features)) {
            devLogSecciones(`ine=${ine} via=OGC coleccion=${coleccion} n=${geo.features.length} ms=${Date.now() - t0}`)
            return NextResponse.json({
              data: {
                codigo_ine: ine,
                anio_delimitacion: parseInt(coleccion.replace('Secciones_', ''), 10),
                fuente: ATRIBUCION,
                n_secciones: geo.features.length,
                geojson: trimPrecision({ type: 'FeatureCollection', features: geo.features }),
              },
              error: null,
              count: geo.features.length,
            })
          }
        } else {
          lastError = `OGC ${coleccion}: HTTP ${res.status}`
        }
      } catch {
        lastError = `OGC ${coleccion}: fallo de red`
      }
      // 2. WFS clásico con CQL_FILTER (fallback).
      try {
        const wfs =
          `${WFS_BASE}?service=WFS&version=2.0.0&request=GetFeature` +
          `&typeName=${encodeURIComponent(collectionId)}&outputFormat=application%2Fjson` +
          `&CQL_FILTER=${encodeURIComponent(`CUMUN='${ine}'`)}`
        const res = await fetchTimeout(wfs)
        if (res.ok) {
          const geo = (await res.json()) as { features?: unknown[] }
          if (Array.isArray(geo.features)) {
            devLogSecciones(`ine=${ine} via=WFS coleccion=${coleccion} n=${geo.features.length} ms=${Date.now() - t0}`)
            return NextResponse.json({
              data: {
                codigo_ine: ine,
                anio_delimitacion: parseInt(coleccion.replace('Secciones_', ''), 10),
                fuente: ATRIBUCION,
                n_secciones: geo.features.length,
                geojson: trimPrecision({ type: 'FeatureCollection', features: geo.features }),
              },
              error: null,
              count: geo.features.length,
            })
          }
        } else {
          lastError = `WFS ${coleccion}: HTTP ${res.status}`
        }
      } catch {
        lastError = `WFS ${coleccion}: fallo de red`
      }
    }
    devLogSecciones(`ine=${ine} fallo (${lastError}) ms=${Date.now() - t0}`)
    return NextResponse.json({ data: null, error: `Secciones no disponibles (${lastError})`, count: 0 }, { status: 502 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ data: null, error: message, count: 0 }, { status: 500 })
  }
}
