// Documentación de salida (Fase 4): KML, DXF, HTML-Word y utilidades compartidas.
// Pantalla, PDF, Word y paquete beben del mismo objeto de dictamen.
import type { DictamenResultado } from './dictamen'

export function slug(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'ambito'
}

/** Código de generación: sello de fecha + hash corto del contenido. */
export function codigoGeneracion(payload: unknown, fechaISO: string): string {
  const s = JSON.stringify(payload)
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return `URB-${fechaISO.slice(0, 10).replace(/-/g, '')}-${h.toString(16).padStart(8, '0')}`
}

/** WinAnsi (fuentes estándar PDF): sanear guiones y comillas no soportados. */
export function sanearPdf(s: string): string {
  return s.replace(/—/g, '-').replace(/[«»]/g, '"').replace(/…/g, '...').replace(/[^\x20-\x7E\xA0-\xFF€]/g, '?')
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

type Pos = [number, number]

function anillosDe(geojson: GeoJSON.FeatureCollection): Pos[][] {
  const out: Pos[][] = []
  for (const f of geojson.features) {
    const g = f.geometry
    if (!g) continue
    if (g.type === 'Polygon') out.push(...(g.coordinates as Pos[][]))
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates) out.push(...(p as Pos[][]))
    else if (g.type === 'LineString') out.push(g.coordinates as Pos[])
    else if (g.type === 'MultiLineString') out.push(...(g.coordinates as Pos[][]))
    else if (g.type === 'Point') { const [x, y] = g.coordinates; out.push([[x, y], [x, y]]) }
  }
  return out
}

export function geojsonAKml(geojson: GeoJSON.FeatureCollection, nombre: string): string {
  const aclarado: string[] = []
  for (const f of geojson.features) {
    const g = f.geometry
    if (!g) continue
    const coords = (ring: Pos[]) => ring.map(p => `${p[0]},${p[1]},0`).join(' ')
    if (g.type === 'Polygon') {
      aclarado.push(`<Placemark><name>${escXml(nombre)}</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${coords(g.coordinates[0] as Pos[])}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`)
    } else if (g.type === 'Point') {
      aclarado.push(`<Placemark><name>${escXml(nombre)}</name><Point><coordinates>${g.coordinates[0]},${g.coordinates[1]},0</coordinates></Point></Placemark>`)
    } else if (g.type === 'LineString') {
      aclarado.push(`<Placemark><name>${escXml(nombre)}</name><LineString><coordinates>${coords(g.coordinates as Pos[])}</coordinates></LineString></Placemark>`)
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${escXml(nombre)}</name>${aclarado.join('')}</Document></kml>`
}

/** DXF mínimo (R12, entidades LWPOLYLINE/POINT) centrado en el recinto. */
export function geojsonADxf(geojson: GeoJSON.FeatureCollection): string {
  const ent: string[] = []
  for (const ring of anillosDe(geojson)) {
    if (ring.length === 2 && ring[0][0] === ring[1][0] && ring[0][1] === ring[1][1]) {
      ent.push(`0\nPOINT\n8\nAMBITO\n10\n${ring[0][0]}\n20\n${ring[0][1]}\n30\n0.0`)
    } else {
      const verts = ring.map(p => `10\n${p[0]}\n20\n${p[1]}\n30\n0.0`).join('\n')
      ent.push(`0\nLWPOLYLINE\n8\nAMBITO\n90\n${ring.length}\n70\n0\n${verts}`)
    }
  }
  return `0\nSECTION\n2\nENTITIES\n${ent.join('\n')}\n0\nENDSEC\n0\nEOF\n`
}

function filaHtml(k: string, v: string): string {
  return `<tr><td style="padding:4px 8px;color:#555;font-weight:bold;vertical-align:top;white-space:nowrap;">${escXml(k)}</td><td style="padding:4px 8px;">${escXml(v)}</td></tr>`
}

/** HTML gemelo de la ficha (base del .doc de Word y del PDF textual). */
export function dictamenAHtml(nombre: string, perfilLabel: string, d: DictamenResultado, fecha: string, codigo: string): string {
  const estadoLabel = d.estado === 'compatible' ? 'Compatible' : d.estado === 'condicionado' ? 'Compatible con condicionantes' : 'Incompatible o de tramitación especial'
  const afecciones = d.afecciones.length === 0
    ? '<p>Sin solapes ni condicionantes en las fuentes consultadas.</p>'
    : `<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:11px;"><thead><tr><th>Capa</th><th>Resultado</th><th>Sentido práctico</th><th>Fuente y fecha</th></tr></thead><tbody>${
      d.afecciones.map(a => `<tr><td><b>${escXml(a.capa)}</b><br/>${escXml(a.familia)}</td><td>${escXml(a.resultado)}${a.magnitud_m2 !== null ? `<br/>${a.magnitud_m2.toLocaleString('es-ES')} m²${a.pct !== null ? ` (${a.pct} %)` : ''}` : a.distancia_m !== null ? `<br/>a ${a.distancia_m} m` : ''}</td><td>${escXml(a.frase)}</td><td>${escXml(a.fuente)} · ${escXml(a.fecha_fuente)}</td></tr>`).join('')
    }</tbody></table>`
  const instrumentos = (d.planeamiento.instrumentos as { tipo: string; estado: string }[]).map(i => `<li>${escXml(i.tipo)} — ${escXml(i.estado)}</li>`).join('')
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>Dictamen — ${escXml(nombre)}</title></head><body style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;">
<h1>Dictamen del ámbito — ${escXml(nombre)}</h1>
<p><b>Perfil:</b> ${escXml(perfilLabel)} · <b>Estado:</b> ${escXml(estadoLabel)}${d.subtitulo_pendiente ? ' — Identificado — afecciones sectoriales pendientes' : ''} · <b>Confianza:</b> ${escXml(d.confianza)} · <b>Fecha:</b> ${escXml(fecha)} · <b>Código:</b> ${escXml(codigo)}</p>
<h2>Identificación del ámbito</h2>
<table>${filaHtml('Municipio', d.ficha.municipio)}${filaHtml('Código INE', d.ficha.ine)}${filaHtml('Referencia catastral', d.ficha.ref_catastral)}${filaHtml('Superficie', d.ficha.superficie_m2 > 0 ? `${d.ficha.superficie_m2.toLocaleString('es-ES')} m²` : 'no acreditada')} ${filaHtml('Uso', d.ficha.uso)}${filaHtml('Clasificación', d.ficha.clasificacion)}${filaHtml('Calificación', d.ficha.calificacion)}</table>
<h2>Dictamen del ámbito</h2><p>${escXml(d.parrafo)}</p><ul>${d.motivos.map(m => `<li>${escXml(m)}</li>`).join('')}</ul>
<h2>Afecciones que condicionan</h2>${afecciones}
<h2>Planeamiento de referencia</h2><p>${escXml(d.planeamiento.siu_figura)}</p>${instrumentos ? `<ul>${instrumentos}</ul>` : ''}<p><i>${escXml(d.planeamiento.nota_siu)}</i></p>
<h2>Documentación de salida</h2><p>Generado el ${escXml(fecha)} con código ${escXml(codigo)}. Paquete cartográfico del mismo recinto visible en el mapa (GeoJSON, KML, Shapefile, DXF).</p>
<p><i>Consulta orientativa elaborada con información pública vigente a la fecha indicada. No sustituye al planeamiento aprobado ni a sus publicaciones oficiales; la validez jurídica reside en la sede electrónica del ayuntamiento y boletines oficiales. Verificar vigencia antes de cualquier acto con efectos jurídicos.</i></p>
</body></html>`
}
