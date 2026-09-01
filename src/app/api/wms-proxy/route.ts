import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  try {
    const targetUrl = new URL(url)

    const response = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'URBIdeas/1.0 (https://urbideas.app; contacto@urbideas.app)',
        'Accept': 'application/json, text/plain, text/xml, */*',
      },
      signal: AbortSignal.timeout(15000),
    })

    const contentType = response.headers.get('content-type') || 'text/plain'
    const body = await response.text()

    return new NextResponse(body, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (err) {
    const msg = err instanceof DOMException && err.name === 'AbortError'
      ? 'Timeout del servidor WMS'
      : 'Error al consultar el servicio WMS'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
