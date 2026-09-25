// Lectura del registro autonómico de asociaciones para la ficha municipal
// (hoja «07 Asociaciones»). SOLO servidor: el cliente Supabase lo inyecta el
// caller (misma convención que socideas-gal.ts / socideas-perfil.ts).
//
// Fuente: tabla `asociaciones` (migración 033), poblada por
// scripts/sync-asociaciones.ts desde 5 descargas directas (CLM, Comunitat
// Valenciana, Galicia, La Rioja, Navarra). Las CCAA sin descarga estructurada
// tienen UNA fila de metadatos con estado `sin_datos_abiertos` y las que no
// tienen fuente identificada, `no_disponible`; esas filas no llevan
// `codigo_ine` y por eso nunca aparecen en una ficha municipal.
//
// Contrato de estados:
//   · `con_datos` — hay filas con `codigo_ine` = el municipio consultado.
//   · `sin_datos` — tabla ausente/inconsultable, municipio sin filas, o
//     error inesperado. La ficha NUNCA se rompe y NUNCA se muestra «0» como
//     si fuera un hecho: el bloque lo reformula como «Sin datos publicados».
//
// Esta función NUNCA lanza.
import type { SupabaseClient } from '@supabase/supabase-js'

export interface AsociacionItem {
  nombre: string
  tipo: string | null
  estado: string | null
  fecha_inscripcion: string | null
  fuente_url: string
  fuente_fecha: string
  aviso_verificacion: string
}

export interface AsociacionesMunicipio {
  codigoINE: string
  total: number
  porTipo: { tipo: string; total: number }[]
  items: AsociacionItem[]
  fuenteUrl: string | null
  fuenteFecha: string | null
  aviso: string
  estado: 'con_datos' | 'sin_datos'
  /** Solo en `sin_datos`: buscador/registro oficial de la CCAA del municipio. */
  buscadorCcaa?: { nombre: string; url: string }
}

/** Aviso de verificación: mismo texto que el DEFAULT de la columna (033). */
export const ASOC_AVISO_POR_DEFECTO =
  'Datos procedentes del registro autonómico. Pueden no reflejar bajas, nuevas inscripciones o cambios de estado posteriores a la fecha de descarga. Verificar en el registro autonómico antes de cualquier uso oficial.'

/**
 * Buscadores/registros oficiales por nombre de CCAA (tal y como figuran en la
 * tabla `comunidades_autonomas`).
 *
 * TODO verificado con sonda HTTP 200 el 2026-09-25. Marcados con «raíz»
 * aquellos en los que NO existe un buscador online verificable del registro y
 * se apunta a la raíz oficial (sede / portal del registro o de datos abiertos)
 * de la comunidad, que es el enlace estable que sí se ha podido comprobar.
 */
export const BUSCADORES_CCAA: Record<string, string> = {
  // Buscador/página oficial del registro verificados:
  Andalucía:
    'https://www.juntadeandalucia.es/organismos/turismojusticiadesregulacionyadministracionlocal/areas/asociaciones/registro.html',
  Aragón: 'https://www.aragon.es/-/asociaciones',
  'Comunidad Foral de Navarra':
    'https://www.navarra.es/es/registro-de-asociaciones-fundaciones-y-colegios-profesionales',
  Galicia: 'https://abertos.xunta.gal/catalogo/administracion-publica/-/dataset/0050/rexistro-asociacions',
  'La Rioja': 'https://web.larioja.org/dato-abierto/datoabierto?n=opd-853',
  'Castilla-La Mancha':
    'https://datosabiertos.castillalamancha.es/dataset/registro-de-asociaciones-de-castilla-la-mancha',
  'Comunitat Valenciana': 'https://dadesobertes.gva.es/es/dataset/soc-asociaciones',
  // Raíz oficial (sin buscador de registro verificable):
  Asturias: 'https://www.asturias.es/',
  'Islas Baleares': 'https://www.caib.es/',
  Canarias: 'https://www.gobiernodecanarias.org/principal/',
  Cantabria: 'https://sede.cantabria.es/sede/',
  'Castilla y León': 'https://datosabiertos.jcyl.es/web/es/datos-abiertos-castilla-leon.html',
  Cataluña: 'https://web.gencat.cat/ca/inici',
  'Comunidad de Madrid': 'https://sede.comunidad.madrid/',
  Extremadura: 'https://www.juntaex.es/',
  'Región de Murcia': 'https://www.carm.es/',
  'País Vasco': 'https://opendata.euskadi.eus/',
  Ceuta: 'https://sede.ceuta.es/',
  Melilla: 'https://sede.melilla.es/',
}

interface AsocRow {
  nombre: string | null
  tipo: string | null
  estado: string | null
  fecha_inscripcion: string | null
  fuente_url: string | null
  fuente_fecha: string | null
  aviso_verificacion: string | null
}

/** Tope duro de filas recuperadas (la API de Supabase devuelve como mucho
 *  1.000 filas por consulta, así que se pagina); evita respuestas gigantes.
 *  El recuento exacto siempre lo da `total` (count de la base). */
const LIMITE_FILAS = 5000
const LOTE_API = 1000

function sinDatos(codigoINE: string, aviso: string): AsociacionesMunicipio {
  return {
    codigoINE,
    total: 0,
    porTipo: [],
    items: [],
    fuenteUrl: null,
    fuenteFecha: null,
    aviso,
    estado: 'sin_datos',
  }
}

/** CCAA del municipio → buscador oficial, si está en el mapa verificado. */
async function buscadorDeCcaa(
  supabase: SupabaseClient,
  codigoINE: string,
): Promise<{ nombre: string; url: string } | undefined> {
  try {
    const { data, error } = await supabase
      .from('municipios')
      .select('provincia:provincias(comunidad_autonoma:comunidades_autonomas(nombre))')
      .eq('codigo_ine', codigoINE)
      .maybeSingle()
    if (error || !data) return undefined
    const prov = Array.isArray(data.provincia) ? data.provincia[0] : data.provincia
    const ccaa = ((prov as { comunidad_autonoma?: { nombre?: string } | null } | null)?.comunidad_autonoma)
      ?.nombre
    if (!ccaa) return undefined
    const url = BUSCADORES_CCAA[ccaa]
    if (!url) return undefined
    return { nombre: ccaa, url }
  } catch {
    return undefined
  }
}

export async function readAsociacionesMunicipio(
  supabase: SupabaseClient,
  codigoINE: string,
): Promise<AsociacionesMunicipio> {
  const ine = (codigoINE ?? '').trim()
  if (!/^\d{5}$/.test(ine)) return sinDatos(ine, ASOC_AVISO_POR_DEFECTO)

  try {
    // 1. ¿Hay filas publicadas para este municipio? (tabla ausente → error →
    //    `sin_datos`: la ficha no se rompe si la migración 033 no está aplicada).
    const { count, error: countError } = await supabase
      .from('asociaciones')
      .select('id', { count: 'exact', head: true })
      .eq('codigo_ine', ine)
    if (countError || count === null || count === 0) {
      const buscador = await buscadorDeCcaa(supabase, ine)
      return { ...sinDatos(ine, ASOC_AVISO_POR_DEFECTO), ...(buscador ? { buscadorCcaa: buscador } : {}) }
    }

    // 2. Filas: orden por tipo (contrato de la hoja) con `nombre` como
    //    desempate para que la paginación sea estable. La API corta a 1.000
    //    filas por consulta, así que se pagina hasta `LIMITE_FILAS`.
    const filas: AsocRow[] = []
    let desde = 0
    for (;;) {
      const { data, error } = await supabase
        .from('asociaciones')
        .select(
          'nombre, tipo, estado, fecha_inscripcion, fuente_url, fuente_fecha, aviso_verificacion',
        )
        .eq('codigo_ine', ine)
        .order('tipo', { ascending: true })
        .order('nombre', { ascending: true })
        .range(desde, desde + LOTE_API - 1)
      if (error || !data) {
        const buscador = await buscadorDeCcaa(supabase, ine)
        return { ...sinDatos(ine, ASOC_AVISO_POR_DEFECTO), ...(buscador ? { buscadorCcaa: buscador } : {}) }
      }
      filas.push(...(data as unknown as AsocRow[]))
      if (data.length < LOTE_API) break
      desde += LOTE_API
      if (filas.length >= LIMITE_FILAS || desde >= count) break
    }

    const validas = filas.filter((r) => (r.nombre ?? '').trim() !== '')
    if (validas.length === 0) {
      const buscador = await buscadorDeCcaa(supabase, ine)
      return { ...sinDatos(ine, ASOC_AVISO_POR_DEFECTO), ...(buscador ? { buscadorCcaa: buscador } : {}) }
    }

    const items: AsociacionItem[] = validas.map((r) => ({
      nombre: (r.nombre ?? '').trim(),
      tipo: r.tipo,
      estado: r.estado,
      fecha_inscripcion: r.fecha_inscripcion,
      fuente_url: r.fuente_url ?? '',
      fuente_fecha: r.fuente_fecha ?? '',
      aviso_verificacion: r.aviso_verificacion || ASOC_AVISO_POR_DEFECTO,
    }))

    // Distribución por tipo: «Sin tipo publicado» agrupa los nulos.
    const cuenta = new Map<string, number>()
    for (const it of items) {
      const clave = it.tipo && it.tipo.trim() !== '' ? it.tipo.trim() : 'Sin tipo publicado'
      cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1)
    }
    const porTipo = [...cuenta.entries()]
      .map(([tipo, total]) => ({ tipo, total: Math.max(0, total) }))
      .sort((a, b) => b.total - a.total || a.tipo.localeCompare(b.tipo, 'es'))

    // Recuento exacto de la base (no la longitud de la lista: la lista puede
    // quedar recortada en LIMITE_FILAS y el nombre vacío ya se ha filtrado).
    const total = Math.max(0, count)
    const avisoBase = items[0].aviso_verificacion || ASOC_AVISO_POR_DEFECTO
    // Si la lista ha quedado recortada, se dice explícitamente: la distribución
    // por tipo deja de ser exhaustiva y no debe presentarse como total.
    const aviso =
      items.length < total
        ? `${avisoBase} La distribución por tipo y el listado se calculan sobre los ${items.length.toLocaleString('es-ES')} primeros de ${total.toLocaleString('es-ES')} registros.`
        : avisoBase

    return {
      codigoINE: ine,
      total,
      porTipo,
      items,
      fuenteUrl: items[0].fuente_url || null,
      fuenteFecha: items[0].fuente_fecha || null,
      aviso,
      estado: 'con_datos',
    }
  } catch {
    return sinDatos(ine, ASOC_AVISO_POR_DEFECTO)
  }
}
