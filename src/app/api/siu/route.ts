import { NextRequest, NextResponse } from 'next/server'
import { consultarSIU } from '@/lib/siu'

const RATE_LIMIT = 100

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
    const data = await consultarSIU(where)

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
