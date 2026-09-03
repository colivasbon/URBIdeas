import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { zip as shpZip } from 'shp-write'
import type { DictamenResultado } from '@/lib/dictamen'
import { geojsonAKml, geojsonADxf, slug } from '@/lib/salida'

/**
 * POST /api/dictamen/paquete — paquete cartográfico del recinto visible en el mapa:
 * GeoJSON + KML + Shapefile (.zip) + DXF + CSV de afecciones + LEEME de fuentes.
 * Body: { nombre, dictamen, geojson, fecha, codigo }
 */
export async function POST(request: NextRequest) {
  let body: { nombre: string; dictamen: DictamenResultado; geojson: GeoJSON.FeatureCollection; fecha: string; codigo: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo JSON inválido' }, { status: 400 })
  }
  const { nombre, dictamen: d, geojson, fecha, codigo } = body
  if (!geojson?.features?.length) return NextResponse.json({ error: 'geojson del recinto requerido' }, { status: 400 })

  const base = slug(nombre || 'ambito')
  const zip = new JSZip()
  zip.file(`${base}.geojson`, JSON.stringify(geojson, null, 2))
  zip.file(`${base}.kml`, geojsonAKml(geojson, nombre || 'Ámbito'))
  zip.file(`${base}.dxf`, geojsonADxf(geojson))
  try {
    const shp = await shpZip(geojson)
    const buf = shp instanceof Blob ? new Uint8Array(await shp.arrayBuffer())
      : shp instanceof Uint8Array ? shp : new Uint8Array(shp as ArrayBuffer)
    zip.file(`${base}_shp.zip`, buf)
  } catch {
    zip.file(`${base}_shp_NO_GENERADO.txt`, 'Shapefile no generable para esta geometría. Usa el GeoJSON o el DXF.')
  }
  if (d) {
    const filas = d.afecciones.map(a =>
      [a.familia, a.capa, a.resultado, a.magnitud_m2 ?? '', a.pct ?? '', a.distancia_m ?? '', a.fuente, a.fecha_fuente].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','),
    )
    zip.file(`${base}_afecciones.csv`, `familia,capa,resultado,magnitud_m2,pct,distancia_m,fuente,fecha_fuente\n${filas.join('\n')}`)
    zip.file('LEEME.txt', [
      `Urbideas — paquete cartográfico del ámbito "${nombre}".`,
      `Fecha: ${fecha} · Código: ${codigo}`,
      `Estado: ${d.estado}${d.subtitulo_pendiente ? ' — Identificado — afecciones sectoriales pendientes' : ''} · Confianza: ${d.confianza}`,
      `CRS: EPSG:4326 (WGS 84).`,
      `Fuentes: ${[...new Set(d.afecciones.map(a => `${a.fuente} (${a.fecha_fuente})`))].join('; ') || 'ver ficha'}`,
      'Consulta orientativa; la validez jurídica reside en sede electrónica y boletines oficiales.',
    ].join('\n'))
  }

  const blob = await zip.generateAsync({ type: 'uint8array' })
  return new NextResponse(blob as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="paquete_${base}.zip"`,
    },
  })
}
