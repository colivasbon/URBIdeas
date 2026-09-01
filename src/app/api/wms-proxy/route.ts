import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  return proxyUrl(url)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.url) return NextResponse.json({ error: 'Missing url in body' }, { status: 400 })
    return proxyUrl(body.url)
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

async function proxyUrl(url: string) {
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
