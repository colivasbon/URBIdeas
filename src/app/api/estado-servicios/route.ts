import { NextResponse } from 'next/server'

async function ping(nombre: string, url: string, fuente: string): Promise<{ nombre: string; estado: 'ok' | 'caido'; fuente: string; ms: number }> {
  const t0 = Date.now()
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'URBIdeas/1.0', Accept: '*/*' },
      signal: AbortSignal.timeout(10000),
    })
    const ms = Date.now() - t0
    return { nombre, estado: res.ok ? 'ok' : 'caido', fuente, ms }
  } catch {
    return { nombre, estado: 'caido', fuente, ms: Date.now() - t0 }
  }
}

/** Estado de servicios externos: se muestra antes de fiarse del semáforo. */
export async function GET() {
  const [catastro, siu] = await Promise.all([
    ping('Catastro', 'https://ovc.catastro.meh.es/ovcservweb/ovcswlocalizacionrc/ovccoordenadas.asmx?WSDL', 'OVC Catastro'),
    ping('SIU', 'https://mapas.fomento.gob.es/arcgis/rest/services/SIU/Planeamiento_Vigente/MapServer?f=json', 'MIVAU / SIU'),
  ])
  return NextResponse.json({ data: [catastro, siu], error: null, fecha: new Date().toISOString() })
}
