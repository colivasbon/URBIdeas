import { NextRequest, NextResponse } from 'next/server'

/**
 * Búsqueda por referencia catastral vía OVC (servidor, evita CORS).
 * Si Catastro no responde, devuelve {error} sin romper: el ámbito sigue siendo dibujable.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const rc = (searchParams.get('rc') || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase()
  if (rc.length < 14) {
    return NextResponse.json({ data: null, error: 'Referencia incompleta (se esperan 14–20 caracteres).' }, { status: 400 })
  }
  try {
    const url = `https://ovc.catastro.meh.es/ovcservweb/ovcswlocalizacionrc/ovccoordenadas.asmx/Consulta_CPMRC?ProvinciaMunicipio=&RC=${encodeURIComponent(rc)}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'URBIdeas/1.0', Accept: 'text/xml' },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) throw new Error(`Catastro HTTP ${res.status}`)
    const xml = await res.text()
    const pick = (tag: string) => {
      const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))
      return m ? m[1].trim() : ''
    }
    const err = pick('err')
    if (err && err !== '0') {
      return NextResponse.json({ data: null, error: 'Catastro no localiza esa referencia.' }, { status: 404 })
    }
    const x = parseFloat(pick('xcen').replace(',', '.'))
    const y = parseFloat(pick('ycen').replace(',', '.'))
    const srs = pick('SRS') || pick('srs')
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Sin coordenadas')
    return NextResponse.json({
      data: {
        x, y, srs,
        municipio: pick('nm') || pick('municipio'),
        provincia: pick('np') || '',
        direccion: pick('ldt') || '',
      },
      error: null,
      fuente: 'Sede Electrónica del Catastro (OVC)',
      fecha: new Date().toISOString().slice(0, 10),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Catastro sin respuesta'
    return NextResponse.json({ data: null, error: `Catastro sin respuesta (${msg}). Puedes dibujar el ámbito a mano.` }, { status: 502 })
  }
}
