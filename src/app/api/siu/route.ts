import { NextRequest, NextResponse } from 'next/server'

const SIU_ARCGIS_URL = 'https://mapas.fomento.gob.es/arcgis/rest/services/SIU/Planeamiento_Vigente/MapServer/1/query'
const RATE_LIMIT = 100

interface SIUFeature {
  attributes: {
    OBJECTID: number
    ProvMunText: string
    nombre: string
    FiguraVigente: string
    FechaFigura: number | null
    observaciones: string
    ComentarioVisor: string
    textolink: string
    UrlLink: string
  }
}

async function fetchSIUData(where: string): Promise<SIUFeature[]> {
  const params = new URLSearchParams({
    where,
    outFields: '*',
    f: 'json',
    resultRecordCount: '2000',
    returnGeometry: 'false'
  })

  const response = await fetch(`${SIU_ARCGIS_URL}?${params.toString()}`)
  
  if (!response.ok) {
    throw new Error(`Error fetching SIU data: ${response.status}`)
  }

  const data = await response.json()
  return data.features || []
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const codigo_ine = searchParams.get('codigo_ine')
  const nombre = searchParams.get('nombre')
  const ambito = searchParams.get('ambito') // 'provincia' o 'municipio'

  try {
    // Construir condición WHERE
    let where = '1=1'
    
    if (codigo_ine) {
      where = `ProvMunText = '${codigo_ine}'`
    } else if (nombre) {
      where = `UPPER(nombre) LIKE '%${nombre.toUpperCase()}%'`
    }

    // Obtener datos del SIU
    const features = await fetchSIUData(where)

    // Mapear resultados
    const data = features.map(f => ({
      codigo_ine: f.attributes.ProvMunText,
      nombre: f.attributes.nombre,
      figura_vigente: f.attributes.FiguraVigente,
      fecha_figura: f.attributes.FechaFigura,
      observaciones: f.attributes.observaciones,
      comentario_visor: f.attributes.ComentarioVisor,
      texto_link: f.attributes.textolink,
      url_link: f.attributes.UrlLink
    }))

    // Si se solicita ámbito provincial, agrupar por provincia
    if (ambito === 'provincia' && data.length > 0) {
      const grouped: Record<string, typeof data> = {}
      
      data.forEach(item => {
        const provincia = item.codigo_ine.substring(0, 2)
        if (!grouped[provincia]) {
          grouped[provincia] = []
        }
        grouped[provincia].push(item)
      })

      return NextResponse.json({
        data: grouped,
        count: data.length,
        source: 'SIU_estatal',
        error: null
      })
    }

    const response = NextResponse.json({
      data,
      count: data.length,
      source: 'SIU_estatal',
      error: null
    })
    
    response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT))
    response.headers.set('X-RateLimit-Remaining', String(RATE_LIMIT - 1))
    return response

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ 
      data: null, 
      error: message, 
      count: 0,
      source: 'SIU_estatal'
    }, { status: 500 })
  }
}
