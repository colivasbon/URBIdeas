// Consulta GetFeatureInfo WMS compartida (visor puntual + cruce en lote).
// Un servicio caído o sin respuesta produce error tipado: nunca se pinta verde por omisión.

export interface AtributosFeatureInfo {
  atributos: Record<string, string>
}

export function parseWmsResponse(text: string, contentType: string): Record<string, string> {
  const atributos: Record<string, string> = {}

  if (contentType.includes('application/json')) {
    try {
      const json = JSON.parse(text)
      if (json.features?.length > 0) return json.features[0].properties || {}
    } catch { /* ignore */ }
    return atributos
  }

  if (contentType.includes('text/html')) {
    if (typeof DOMParser === 'undefined') return atributos
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/html')
    const rows = doc.querySelectorAll('tr')
    for (const row of rows) {
      const cells = row.querySelectorAll('td')
      if (cells.length >= 2) {
        const key = cells[0].textContent?.trim() || ''
        const val = cells[1].textContent?.trim() || ''
        if (key) atributos[key] = val
      }
    }
    if (Object.keys(atributos).length > 0) return atributos
  }

  if (contentType.includes('text/plain') || contentType.includes('text/xml') || contentType.includes('application/vnd.ogc.gml')) {
    const t = text.trim()
    // Plano "clave = valor" típico de MapServer/GeoServer
    for (const line of t.split('\n')) {
      const eqIdx = line.indexOf('=')
      if (eqIdx > 0) {
        const key = line.substring(0, eqIdx).trim()
        const val = line.substring(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '')
        if (key && val && !/^no (features|data)|^empty$/i.test(val)) atributos[key] = val
      }
    }
    if (Object.keys(atributos).length > 0) return atributos
    if (typeof DOMParser === 'undefined') return atributos
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(text, 'text/xml')
      const featureMembers = doc.querySelectorAll('gml\\:featureMember, featureMember')
      if (featureMembers.length > 0) {
        for (const fm of featureMembers) {
          const children = fm.children
          if (children.length > 0) {
            const attrs = children[0].children
            for (const attr of attrs) {
              const name = attr.localName || attr.tagName?.split(':').pop() || ''
              const value = attr.textContent?.trim() || ''
              if (name && value) atributos[name] = value
            }
            if (Object.keys(atributos).length > 0) return atributos
          }
        }
      }
    } catch { /* ignore */ }
  }

  return atributos
}

export interface PuntoMuestra {
  lat: number
  lng: number
  bbox: [number, number, number, number] // west, south, east, north
}

export async function consultarPuntoWMS(
  urlServicio: string,
  nombreCapa: string,
  p: PuntoMuestra,
  size = 256,
  timeoutMs = 15000,
): Promise<{ atributos: Record<string, string>; error?: string }> {
  const [w, s, e, n] = p.bbox
  const x = Math.floor(((p.lng - w) / Math.max(e - w, 1e-9)) * size)
  const y = Math.floor(((n - p.lat) / Math.max(n - s, 1e-9)) * size)
  const params = new URLSearchParams({
    service: 'WMS',
    version: '1.1.1',
    request: 'GetFeatureInfo',
    layers: nombreCapa,
    query_layers: nombreCapa,
    info_format: 'text/plain',
    feature_count: '10',
    srs: 'EPSG:4326',
    bbox: `${w},${s},${e},${n}`,
    width: String(size),
    height: String(size),
    x: String(Math.min(Math.max(x, 0), size - 1)),
    y: String(Math.min(Math.max(y, 0), size - 1)),
    styles: '',
  })
  const wmsUrl = `${urlServicio}?${params.toString()}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let response: Response
    if (wmsUrl.length > 2000) {
      response = await fetch('/api/wms-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: wmsUrl }),
        signal: controller.signal,
      })
    } else {
      response = await fetch(`/api/wms-proxy?url=${encodeURIComponent(wmsUrl)}`, { signal: controller.signal })
    }
    clearTimeout(timeout)
    if (!response.ok) return { atributos: {}, error: `HTTP ${response.status}` }
    const ct = response.headers.get('content-type') || ''
    const text = await response.text()
    return { atributos: parseWmsResponse(text, ct) }
  } catch (err) {
    clearTimeout(timeout)
    const msg = err instanceof DOMException && err.name === 'AbortError' ? 'Tiempo de espera agotado' : 'No disponible (CORS o red)'
    return { atributos: {}, error: msg }
  }
}
