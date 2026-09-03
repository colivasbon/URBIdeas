// Dictamen territorial por perfil (Fase 3). Un solo motor; pantalla, PDF y expediente
// consumen el mismo objeto. Tono de expediente. Sin verde por omisión.
import type { PerfilId } from './familias'
import { VETO_POR_PERFIL } from './familias'
import type { FilaCruce } from './cruce'

export const NOTA_SIU =
  'El SIU ofrece información amplia de suelo y urbanismo, no es un registro de planeamiento, y la validez está en el documento aprobado y en su publicación oficial.'

export const PIE_LEGAL =
  'Consulta orientativa elaborada con información pública vigente a la fecha indicada. No sustituye al planeamiento aprobado ni a sus publicaciones oficiales; la validez jurídica reside en la sede electrónica del ayuntamiento y boletines oficiales. Verificar vigencia antes de cualquier acto con efectos jurídicos.'

export const SUBTITULO_PENDIENTE = 'Identificado — afecciones sectoriales pendientes'

export type EstadoDictamen = 'compatible' | 'condicionado' | 'incompatible'

export interface FichaAmbito {
  municipio: string
  ine: string
  ref_catastral: string
  superficie_m2: number
  uso: string
  clasificacion: string
  calificacion: string
}

export interface AfeccionDictamen {
  familia: string
  capa: string
  resultado: 'solapa' | 'borde' | 'proximo' | 'limpio' | 'sin_datos'
  magnitud_m2: number | null
  pct: number | null
  distancia_m: number | null
  frase: string
  fuente: string
  fecha_fuente: string
  estado_servicio: 'ok' | 'sin_datos'
}

export interface DictamenResultado {
  estado: EstadoDictamen
  subtitulo_pendiente: boolean
  confianza: 'alta' | 'media' | 'baja'
  parrafo: string
  motivos: string[]
  ficha: FichaAmbito
  afecciones: AfeccionDictamen[]
  planeamiento: { siu_figura: string; instrumentos: unknown[]; nota_siu: string }
  salida: { pdf_url: string | null; paquete_url: string | null }
}

function magnitudCorta(f: FilaCruce): string {
  if (f.magnitud_m2 !== null) return `${f.magnitud_m2.toLocaleString('es-ES')} m²${f.pct !== null ? ` (${f.pct} % del ámbito)` : ''}`
  if (f.distancia_m !== null) return `a ${f.distancia_m} m`
  return 'intersección sin magnitud descargable'
}

/** Frase de sentido práctico por fila: una, breve, de expediente. */
export function frasePorFila(f: FilaCruce): string {
  if (f.resultado === 'sin_datos') {
    return `${f.fuente} sin respuesta: no computa como ausencia de afección. Confianza rebajada.`
  }
  if (f.resultado === 'limpio' || f.resultado === 'proximo') {
    if (f.resultado === 'proximo') return `A ${f.distancia_m} m: sin solape. El órgano sectorial puede exigir estudio o informe en la tramitación.`
    return 'Sin intersección en las fuentes consultadas.'
  }
  if (f.familia === 'pecuarias') {
    const tipo = /cañada/i.test(f.capa + ' ' + (f.detalle || '')) ? 'cañada (máx. 75 m)'
      : /cordel/i.test(f.capa + ' ' + (f.detalle || '')) ? 'cordel (máx. 37,5 m)'
      : /vereda/i.test(f.capa + ' ' + (f.detalle || '')) ? 'vereda (máx. 20 m)'
      : 'vía pecuaria (máx. legal estatal 75 / 37,5 / 20 m según tipo)'
    return `Solapa ${tipo}${f.detalle ? ` — ${f.detalle}` : ''}. Manda el deslinde. Suelo demanial autonómico (Ley 3/1995): no ocupable.`
  }
  if (f.familia === 'inundacion') {
    return `En zona de ${f.capa} (${magnitudCorta(f)}) según mapa SNCZI (capa de fecha ${f.fecha_fuente}): limitación de usos y ocupación; verificar vigencia.`
  }
  if (f.familia === 'dominio' && /mar|dpmt|costa|servidumbre|influencia/i.test(f.capa)) {
    return `En ámbito del régimen general de la legislación de costas (${f.capa}, ${magnitudCorta(f)}): informe preceptivo; deslindes y especialidades por encima de distancias generales.`
  }
  if (f.severidad === 'veto') {
    return `No ocupable en la superficie intersectada (${magnitudCorta(f)}). Excluir o retranquear; cualquier actuación exige autorización expresa del organismo titular.`
  }
  if (f.resultado === 'borde') {
    return `Ocupación condicionada: respetar el perímetro de la capa o de la norma citada e informe previo del organismo. Proximidad inmediata según criterio interno de cruce, no distancia normativa.`
  }
  if (f.severidad === 'condicionante') {
    return `Ocupación condicionada (${magnitudCorta(f)}): respetar el perímetro de la capa o de la norma citada e informe previo del organismo.`
  }
  return 'A título informativo para el diseño; no limita por sí solo.'
}

export function etiquetaEstado(e: EstadoDictamen): string {
  return e === 'compatible' ? 'Compatible' : e === 'condicionado' ? 'Compatible con condicionantes' : 'Incompatible o de tramitación especial'
}

interface EntradaDictamen {
  perfil_id: PerfilId
  preset_modificado: boolean
  filas: FilaCruce[]
  ficha: FichaAmbito
  siu_figura: string
  instrumentos: unknown[]
  distancias?: { nucleo_m: number | null }
}

export function construirDictamen(e: EntradaDictamen): DictamenResultado {
  const filas = e.filas
  const vetoSolapa = filas.filter(f => f.severidad === 'veto' && f.resultado === 'solapa')
  const condSolapa = filas.filter(f => f.severidad === 'condicionante' && (f.resultado === 'solapa' || f.resultado === 'borde'))
  const vetoFamilias = VETO_POR_PERFIL[e.perfil_id]
  const vetoSinDatos = filas.filter(f => vetoFamilias.includes(f.familia) && f.resultado === 'sin_datos')
  // Cobertura: familias de veto con al menos una respuesta utilizable (no sin_datos).
  // Sin cobertura no hay compatible posible: techo = identificado con pendientes.
  const vetoCubiertas = new Set(
    filas.filter(f => vetoFamilias.includes(f.familia) && f.resultado !== 'sin_datos').map(f => f.familia),
  )

  const subtitulo_pendiente = vetoSinDatos.length > 0 || vetoCubiertas.size === 0
  let estado: EstadoDictamen = 'compatible'
  if (vetoSolapa.length > 0) estado = 'incompatible'
  else if (condSolapa.length > 0 || subtitulo_pendiente) estado = 'condicionado'

  let confianza: 'alta' | 'media' | 'baja' = 'alta'
  const sinDatosVeto = filas.filter(f => f.severidad === 'veto' && f.resultado === 'sin_datos').length
  const sinDatosTotal = filas.filter(f => f.resultado === 'sin_datos').length
  if (filas.length === 0 || vetoCubiertas.size === 0) confianza = 'baja'
  else if (sinDatosVeto >= 2) confianza = 'baja'
  else if (sinDatosTotal > 0) confianza = 'media'

  const afecciones: AfeccionDictamen[] = filas
    .filter(f => f.resultado !== 'limpio')
    .map(f => ({
      familia: f.familia, capa: f.capa, resultado: f.resultado,
      magnitud_m2: f.magnitud_m2, pct: f.pct, distancia_m: f.distancia_m,
      frase: frasePorFila(f), fuente: f.fuente, fecha_fuente: f.fecha_fuente, estado_servicio: f.estado_servicio,
    }))

  const motivos: string[] = []
  for (const f of vetoSolapa) motivos.push(`Veto por solape: ${f.capa} (${magnitudCorta(f)}).`)
  for (const f of condSolapa) motivos.push(`Condicionante: ${f.capa} (${magnitudCorta(f)}).`)
  for (const f of vetoSinDatos) motivos.push(`Sin datos en familia de veto (${f.capa}): no computa como verde.`)
  if (motivos.length === 0) motivos.push('Sin solapes ni condicionantes en las fuentes consultadas.')

  const parrafo = parrafoPorPerfil(e.perfil_id, e.ficha, estado, subtitulo_pendiente, vetoSolapa, condSolapa, vetoSinDatos, e.preset_modificado)

  return {
    estado, subtitulo_pendiente, confianza, parrafo, motivos,
    ficha: e.ficha, afecciones,
    planeamiento: { siu_figura: e.siu_figura, instrumentos: e.instrumentos, nota_siu: NOTA_SIU },
    salida: { pdf_url: null, paquete_url: null },
  }
}

function listaCorta(filas: FilaCruce[]): string {
  if (filas.length === 0) return 'ninguna afección con solape'
  return filas.slice(0, 4).map(f => `${f.capa} (${magnitudCorta(f)})`).join('; ')
}

function parrafoPorPerfil(
  perfil: PerfilId, ficha: FichaAmbito, estado: EstadoDictamen, pendiente: boolean,
  vetos: FilaCruce[], conds: FilaCruce[], sinDatos: FilaCruce[], presetModificado: boolean,
): string {
  const juicio = `${etiquetaEstado(estado)}${pendiente ? `. ${SUBTITULO_PENDIENTE}` : ''}`
  const sup = ficha.superficie_m2 > 0 ? `${ficha.superficie_m2.toLocaleString('es-ES')} m²` : 'superficie no acreditada'
  const extra = presetModificado ? ' El usuario modificó el preset de familias del perfil.' : ''
  const clas = ficha.clasificacion !== 'no disponible' ? ficha.clasificacion : null
  const calif = ficha.calificacion !== 'no disponible' ? ficha.calificacion : null

  if (perfil === 'parcela') {
    const base = ficha.ref_catastral !== '—' ? `la parcela ${ficha.ref_catastral} (${sup}, uso ${ficha.uso})` : `un ámbito de ${sup} sin parcela catastral asociada`
    const plan = clas || calif
      ? `Clasificación: ${clas || '—'}. Calificación: ${calif || '—'}.`
      : 'Clasificación y calificación: no disponible en fuentes consultadas — no se presume.'
    const afecta = `Condicionan: ${listaCorta([...vetos, ...conds])}.`
    return `El ámbito queda identificado sobre ${base} en ${ficha.municipio}. ${plan} ${afecta} Juicio: ${juicio}.${extra} Próximo paso: solicitar al ayuntamiento cédula urbanística o informe de usos admitidos.`
  }
  if (perfil === 'rustico') {
    const rusticoConsta = /rústico|rústica|no urbanizable|rustico/i.test(`${clas || ''} ${ficha.uso}`)
    const cond = rusticoConsta
      ? `Consta como suelo rústico en las fuentes consultadas (${clas || ficha.uso}).`
      : 'La condición de rústico no consta en las fuentes consultadas.'
    return `El ámbito se identifica en ${ficha.municipio} (${sup}). ${cond} Intersecciones: ${listaCorta([...vetos, ...conds])}${sinDatos.length ? `; pendientes: ${sinDatos.map(f => f.capa).join(', ')}` : ''}. Juicio: ${juicio}.${extra} En su caso, la ocupación exigiría informe sectorial del organismo titular, la autorización autonómica que corresponda en su caso, y la licencia municipal.`
  }
  if (perfil === 'cribado') {
    const cohe = clas
      ? `Clasificación disponible (${clas}): el ámbito resulta coherente con ella salvo las afecciones que se indican.`
      : 'Sin clasificación disponible en fuentes consultadas: el juicio se limita a afecciones y a lo pendiente de confirmar.'
    return `Para un desarrollo de ${sup} en ${ficha.municipio}: ${cohe} Condicionan: ${listaCorta([...vetos, ...conds])}. Juicio: ${juicio}.${extra} Pendiente de confirmar en ayuntamiento: aprovechamiento, cesiones y conexión a infraestructuras.`
  }
  return `A fecha de emisión se informa de las afecciones intersectadas por el ámbito (${sup}, ${ficha.municipio}), con fuente y magnitud, sin prejuzgar la calificación urbanística: ${listaCorta([...vetos, ...conds, ...sinDatos])}. Juicio: ${juicio}.${extra} Este informe es base técnica y no constituye título habilitante.`
}
