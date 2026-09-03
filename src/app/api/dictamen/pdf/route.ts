import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { DictamenResultado } from '@/lib/dictamen'
import { etiquetaEstado, PIE_LEGAL, SUBTITULO_PENDIENTE } from '@/lib/dictamen'
import { sanearPdf, slug, codigoGeneracion } from '@/lib/salida'

const A4 = { w: 595.28, h: 841.89 }
const M = 48

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w
    if (font.widthOfTextAtSize(t, size) > maxW && cur) { lines.push(cur); cur = w }
    else cur = t
  }
  if (cur) lines.push(cur)
  return lines
}

interface Ctx {
  doc: PDFDocument
  font: PDFFont
  bold: PDFFont
  page: PDFPage
  y: number
}

function nuevaPagina(ctx: Ctx, num: number) {
  ctx.page = ctx.doc.addPage([A4.w, A4.h])
  ctx.y = A4.h - M
  ctx.page.drawText(`Urbideas — Dictamen territorial  ·  pág. ${num}`, {
    x: M, y: 30, size: 8, font: ctx.font, color: rgb(0.45, 0.45, 0.45),
  })
}

function titulo(ctx: Ctx, t: string, pag: { n: number }) {
  if (ctx.y < 120) { pag.n++; nuevaPagina(ctx, pag.n) }
  for (const l of wrap(sanearPdf(t), ctx.bold, 12, A4.w - 2 * M)) {
    ctx.page.drawText(l, { x: M, y: ctx.y, size: 12, font: ctx.bold })
    ctx.y -= 16
  }
  ctx.y -= 4
}

function parrafo(ctx: Ctx, t: string, size = 9.5, pag?: { n: number }) {
  for (const l of wrap(sanearPdf(t), ctx.font, size, A4.w - 2 * M)) {
    if (ctx.y < 70) { if (!pag) break; pag.n++; nuevaPagina(ctx, pag.n) }
    ctx.page.drawText(l, { x: M, y: ctx.y, size, font: ctx.font })
    ctx.y -= size + 3
  }
  ctx.y -= 3
}

function fila(ctx: Ctx, k: string, v: string, pag: { n: number }) {
  for (const l of wrap(`${sanearPdf(k)}: ${sanearPdf(v)}`, ctx.font, 9.5, A4.w - 2 * M)) {
    if (ctx.y < 70) { pag.n++; nuevaPagina(ctx, pag.n) }
    ctx.page.drawText(l, { x: M, y: ctx.y, size: 9.5, font: ctx.font })
    ctx.y -= 13
  }
}

function croquis(ctx: Ctx, geojson: GeoJSON.FeatureCollection, fuentes: string) {
  const boxW = A4.w - 2 * M
  const boxH = 170
  if (ctx.y - boxH < 60) return
  const y0 = ctx.y - boxH
  ctx.page.drawRectangle({ x: M, y: y0, width: boxW, height: boxH, borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1 })
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  const rings: [number, number][][] = []
  for (const f of geojson.features) {
    const g = f.geometry
    if (!g) continue
    const push = (r: [number, number][]) => { rings.push(r); for (const [x, y] of r) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y } }
    if (g.type === 'Polygon') for (const r of g.coordinates) push(r as [number, number][])
    else if (g.type === 'LineString') push(g.coordinates as [number, number][])
    else if (g.type === 'Point') { const [x, y] = g.coordinates; push([[x, y], [x, y]]) }
  }
  if (rings.length && isFinite(minX)) {
    const sc = Math.min((boxW - 40) / Math.max(maxX - minX, 1e-9), (boxH - 40) / Math.max(maxY - minY, 1e-9))
    const X = (x: number) => M + 20 + (x - minX) * sc
    const Y = (y: number) => y0 + 20 + (y - minY) * sc
    for (const r of rings) {
      for (let i = 0; i + 1 < r.length; i++) {
        ctx.page.drawLine({
          start: { x: X(r[i][0]), y: Y(r[i][1]) },
          end: { x: X(r[i + 1][0]), y: Y(r[i + 1][1]) },
          thickness: 1.6, color: rgb(0.88, 0.48, 0.22),
        })
      }
      if (r.length === 2 && r[0][0] === r[1][0]) {
        ctx.page.drawCircle({ x: X(r[0][0]), y: Y(r[0][1]), size: 4, color: rgb(0.88, 0.48, 0.22) })
      }
    }
    // Norte + escala aproximada
    const nx = M + boxW - 30
    ctx.page.drawText('N', { x: nx - 4, y: y0 + boxH - 28, size: 11, font: ctx.font })
    ctx.page.drawLine({ start: { x: nx, y: y0 + boxH - 44 }, end: { x: nx, y: y0 + boxH - 26 }, thickness: 1.4 })
    const latMed = (minY + maxY) / 2
    const mPorGrado = 111320 * Math.cos((latMed * Math.PI) / 180)
    const targetM = (boxW - 60) / sc / 4
    const pot = Math.pow(10, Math.floor(Math.log10(Math.max(targetM, 1))))
    const nice = [1, 2, 5, 10].map(k => k * pot).find(v => v <= Math.max(targetM, 1)) || pot
    const barW = (nice / mPorGrado) * sc
    ctx.page.drawLine({ start: { x: M + 20, y: y0 + 12 }, end: { x: M + 20 + barW, y: y0 + 12 }, thickness: 2 })
    ctx.page.drawText(`${nice >= 1000 ? `${nice / 1000} km` : `${nice} m`} aprox.`, { x: M + 24 + barW, y: y0 + 9, size: 8, font: ctx.font })
  }
  ctx.page.drawText(sanearPdf(`Croquis de situación del ámbito. No es ortofoto. Fuentes: ${fuentes}`), {
    x: M, y: y0 - 12, size: 7.5, font: ctx.font, color: rgb(0.4, 0.4, 0.4),
  })
  ctx.y = y0 - 26
}

/**
 * POST /api/dictamen/pdf — PDF de servidor, misma plantilla que la pantalla (máx. 4 páginas).
 * Body: { nombre, perfilLabel, dictamen, geojson, fecha }
 */
export async function POST(request: NextRequest) {
  let body: { nombre: string; perfilLabel: string; dictamen: DictamenResultado; geojson: GeoJSON.FeatureCollection; fecha: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo JSON inválido' }, { status: 400 })
  }
  const { nombre, perfilLabel, dictamen: d, geojson, fecha } = body
  if (!d || !geojson) return NextResponse.json({ error: 'dictamen y geojson requeridos' }, { status: 400 })

  const codigo = codigoGeneracion({ nombre, d }, fecha || new Date().toISOString())
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const ctx: Ctx = { doc, font, bold, page: doc.addPage([A4.w, A4.h]), y: A4.h - M }
  const pag = { n: 1 }
  ctx.page.drawText('Urbideas — Dictamen territorial  ·  pág. 1', { x: M, y: 30, size: 8, font, color: rgb(0.45, 0.45, 0.45) })

  const colorEstado = d.estado === 'compatible' ? rgb(0.15, 0.65, 0.35) : d.estado === 'condicionado' ? rgb(0.75, 0.6, 0.05) : rgb(0.85, 0.25, 0.2)
  titulo(ctx, `Dictamen del ámbito — ${nombre || 'Ámbito sin nombre'}`, pag)
  parrafo(ctx, `Perfil: ${perfilLabel}   Fecha: ${fecha}   Código: ${codigo}   Confianza: ${d.confianza}`, 9, pag)
  // Estado (3 colores, sin cuarto semáforo)
  const estTxt = sanearPdf(etiquetaEstado(d.estado))
  ctx.page.drawRectangle({ x: M, y: ctx.y - 4, width: font.widthOfTextAtSize(estTxt, 11) + 20, height: 20, color: colorEstado, opacity: 0.15 })
  ctx.page.drawText(estTxt, { x: M + 10, y: ctx.y, size: 11, font: bold, color: colorEstado })
  ctx.y -= 24
  if (d.subtitulo_pendiente) parrafo(ctx, SUBTITULO_PENDIENTE, 9.5, pag)

  titulo(ctx, 'Identificación del ámbito', pag)
  fila(ctx, 'Municipio', d.ficha.municipio, pag)
  fila(ctx, 'Código INE', d.ficha.ine, pag)
  fila(ctx, 'Referencia catastral', d.ficha.ref_catastral, pag)
  fila(ctx, 'Superficie', d.ficha.superficie_m2 > 0 ? `${d.ficha.superficie_m2.toLocaleString('es-ES')} m²` : 'no acreditada (punto o línea)', pag)
  fila(ctx, 'Uso', d.ficha.uso, pag)
  fila(ctx, 'Clasificación', d.ficha.clasificacion, pag)
  fila(ctx, 'Calificación', d.ficha.calificacion, pag)
  const fuentes = [...new Set(d.afecciones.map(a => a.fuente))].join('; ') || 'Catastro, SIU, WMS autonómicos/estatales'
  croquis(ctx, geojson, fuentes.slice(0, 160))

  titulo(ctx, 'Dictamen del ámbito', pag)
  parrafo(ctx, d.parrafo, 9.5, pag)
  for (const m of d.motivos) parrafo(ctx, `• ${m}`, 9, pag)

  titulo(ctx, 'Afecciones que condicionan', pag)
  if (d.afecciones.length === 0) parrafo(ctx, 'Sin solapes ni condicionantes en las fuentes consultadas.', 9.5, pag)
  for (const a of d.afecciones) {
    const mag = a.magnitud_m2 !== null ? ` — ${a.magnitud_m2.toLocaleString('es-ES')} m²${a.pct !== null ? ` (${a.pct} %)` : ''}` : a.distancia_m !== null ? ` — a ${a.distancia_m} m` : ''
    parrafo(ctx, `${a.capa} [${a.resultado}]${mag}: ${a.frase} (${a.fuente}, ${a.fecha_fuente}).`, 9, pag)
  }

  titulo(ctx, 'Planeamiento de referencia', pag)
  parrafo(ctx, d.planeamiento.siu_figura, 9.5, pag)
  for (const ins of d.planeamiento.instrumentos as { tipo: string; estado: string }[]) {
    parrafo(ctx, `• ${ins.tipo} — ${ins.estado}`, 9, pag)
  }
  parrafo(ctx, d.planeamiento.nota_siu, 9, pag)
  const sinDatos = [...new Set(d.afecciones.filter(a => a.estado_servicio === 'sin_datos').map(a => a.fuente))]
  parrafo(ctx, sinDatos.length ? `Servicios sin respuesta: ${sinDatos.join('; ')}. Ninguna fila sin datos computa como ausencia de afección.` : 'Todos los servicios consultados respondieron.', 9, pag)

  titulo(ctx, 'Documentación de salida', pag)
  parrafo(ctx, `Archivos: dictamen PDF (este documento), Word gemelo y paquete cartográfico del recinto (GeoJSON, KML, Shapefile, DXF). Sello: ${fecha} · ${codigo}.`, 9.5, pag)
  parrafo(ctx, PIE_LEGAL, 8.5, pag)

  const bytes = await doc.save()
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="dictamen_${slug(nombre || 'ambito')}.pdf"`,
    },
  })
}
