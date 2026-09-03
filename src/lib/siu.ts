// Acceso al SIU estatal (consulta, no registro). Compartido por /api/siu y /api/dictamen.
const SIU_ARCGIS_URL = 'https://mapas.fomento.gob.es/arcgis/rest/services/SIU/Planeamiento_Vigente/MapServer/1/query'

export interface SiuRegistro {
  codigo_ine: string
  nombre: string
  figura_vigente: string
  fecha_figura: number | null
  observaciones: string
  comentario_visor: string
  texto_link: string
  url_link: string
}

export async function consultarSIU(where: string): Promise<SiuRegistro[]> {
  const params = new URLSearchParams({
    where, outFields: '*', f: 'json', resultRecordCount: '2000', returnGeometry: 'false',
  })
  const res = await fetch(`${SIU_ARCGIS_URL}?${params.toString()}`, {
    headers: { 'User-Agent': 'URBIdeas/1.0' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`SIU HTTP ${res.status}`)
  const data = await res.json()
  return (data.features || []).map((f: { attributes: Record<string, string | number | null> }) => ({
    codigo_ine: f.attributes.ProvMunText,
    nombre: f.attributes.nombre,
    figura_vigente: f.attributes.FiguraVigente,
    fecha_figura: f.attributes.FechaFigura,
    observaciones: f.attributes.observaciones,
    comentario_visor: f.attributes.ComentarioVisor,
    texto_link: f.attributes.textolink,
    url_link: f.attributes.UrlLink,
  }))
}
