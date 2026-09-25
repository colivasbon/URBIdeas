/**
 * SINCRONIZACIÓN DE GRUPOS DE ACCIÓN LOCAL (GAL/GDR · LEADER/FEADER/PAC)
 * → tabla `grupos_accion_local` (migración 034).
 *
 * MODO:
 *   npx tsx scripts/sync-gal.ts --probe-only   solo sondeo de fuentes (sin parseo, sin Supabase)
 *   npx tsx scripts/sync-gal.ts                DRY-RUN (defecto): descarga, parsea, valida, informe
 *   npx tsx scripts/sync-gal.ts --write        escritura real (upsert por codigo_gal + data_sync_runs)
 *
 * FUENTES ESTRUCTURADAS (las únicas que se ingieren; ninguna se extrae de HTML):
 *   [A] Red PAC · MAPA — GeoServer WFS público (cobertura nacional)
 *       https://redpac.es/geoserver/ows?service=WFS&version=1.0.0&request=GetFeature
 *         · typeName=RRN:MUN  → codigoine (INE-5), id_gal, nombregal   (8.205 filas)
 *         · typeName=RRN:GAL  → ficha: nombre, web, email, teléfono, ccaa (254 filas)
 *       Descubierto desde el visor oficial https://redpac.es/visores_redpac/gal
 *       (el visor declara urlGeoserver=../geoserver/ows y las capas GAL/MUN).
 *       AVISO DE VIGENCIA: el campo `marca_temporal` de las fichas es de 2018 en
 *       220/254 GAL y vacío en 34; la capa de cobertura no trae fecha. Por eso
 *       `periodo_programacion` queda NULL para estas filas (NO se infiere).
 *   [B] Datos Abiertos CLM — «GRUPOS DE DESARROLLO RURAL EN CASTILLA-LA MANCHA
 *       (LEADER)» PEPAC 2023-2027 (prioridad por los pilotos del territorio):
 *         poblaciones-LEADER_0.csv  → INE provincia(2) + INE municipio(3) + grupo
 *         GDR PEPAC .csv            → cruce de validación (CODPROV/CODINE)
 *       Ambos ISO-8859-1, separador «;».
 *
 * REGLAS DE INTEGRIDAD (NUNCA se inventa cobertura):
 *   · Solo se insertan filas con respaldo de un CSV/JSON estructurado parseado aquí.
 *   · Cobertura exclusiva: los municipios publicados por CLM se QUITAN de las filas
 *     de Red PAC (cada municipio → como máximo un GAL).
 *   · `--probe-only` imprime la tabla de sondeo; el informe completo se escribe
 *     siempre en tmp/audit/gal-fuentes.txt.
 *   · Pilotos: Manzaneque = 45090 (Toledo) y Torrejoncillo del Rey = 16211 (Cuenca).
 *     El 45172 del enunciado es Torrico (Toledo): se verifica y se reporta.
 */

import { config } from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const TIMEOUT_MS = 90_000
const BATCH_SIZE = 25
const HOY = new Date().toISOString().slice(0, 10)

const WFS = 'https://redpac.es/geoserver/ows'
// propertyName evita descargar la geometría (sin él, RRN:GAL pesa ~29 MB de polígonos).
const GAL_PROPS = [
  'id_gal',
  'region',
  'nombregal',
  'nom_completo_siglas',
  'provincia',
  'municipio',
  'telefono',
  'email',
  'paginaweb',
  'marca_temporal',
  'id_ccaa',
  'poblacion',
  'num_entidades_incluidas_gal',
  'num_ayuntamientos',
].join(',')
const EP_GAL = `${WFS}?service=WFS&version=1.0.0&request=GetFeature&typeName=RRN:GAL&propertyName=${GAL_PROPS}&outputFormat=json`
const EP_MUN =
  `${WFS}?service=WFS&version=1.0.0&request=GetFeature&typeName=RRN:MUN` +
  '&propertyName=codigoine,id_gal,nombregal&outputFormat=json'
const VISOR_RED_PAC = 'https://redpac.es/visores_redpac/gal'
const CLM_POBLACIONES =
  'https://datosabiertos.castillalamancha.es/sites/datosabiertos.castillalamancha.es/files/poblaciones-LEADER_0.csv'
const CLM_GDR_PEPAC =
  'https://datosabiertos.castillalamancha.es/sites/datosabiertos.castillalamancha.es/files/GDR%20PEPAC%20.csv'
const DATASET_CLM =
  'https://datos.gob.es/catalogo/a08002880-grupos-de-accion-local-de-castilla-la-mancha-leader'

// INE de referencia de la misión (códigos verificados contra la tabla `municipios`).
const PILOTOS = [
  { ine: '45090', esperado: 'Manzaneque (Toledo)' },
  { ine: '16211', esperado: 'Torrejoncillo del Rey (Cuenca)' },
  { ine: '45172', esperado: 'Torrico (Toledo) — NO es Torrejoncillo del Rey' },
]

// ───────────────────────────── Sondeo de fuentes ─────────────────────────────

interface Sondeo {
  id: string
  url: string
  comprobacion: string
  http: string
  estructurada: 'sí' | 'no'
  decision: string
}

interface SondeoResultado extends Sondeo {
  bytes: number
  ctype: string
  ok: boolean
}

const SONDEOS: Array<Omit<Sondeo, 'http'>> = [
  {
    id: 'redpac-inicio',
    url: 'https://redpac.es/',
    comprobacion: 'GET',
    estructurada: 'no',
    decision: 'Portal de referencia; sin catálogo de GAL descargable.',
  },
  {
    id: 'redpac-ruta-gal',
    url: 'https://redpac.es/grupos-de-accion-local/',
    comprobacion: 'GET',
    estructurada: 'no',
    decision: 'Ruta inexistente (404).',
  },
  {
    id: 'redpac-visor-gal',
    url: VISOR_RED_PAC,
    comprobacion: 'GET',
    estructurada: 'no',
    decision: 'Visor HTML, NO scraping: revela urlGeoserver=../geoserver/ows y capas RRN:GAL / RRN:MUN.',
  },
  {
    id: 'redpac-wfs-caps',
    url: `${WFS}?service=WFS&version=1.0.0&request=GetCapabilities`,
    comprobacion: 'GET',
    estructurada: 'sí',
    decision: 'WFS 1.0.0 con salida JSON/CSV: fuente estructurada nacional.',
  },
  {
    id: 'redpac-wfs-gal',
    url: EP_GAL,
    comprobacion: 'GET + parseo JSON',
    estructurada: 'sí',
    decision: 'INGESTA: fichas de GAL (nombre, web, email, teléfono, ccaa).',
  },
  {
    id: 'redpac-wfs-mun',
    url: EP_MUN,
    comprobacion: 'GET + parseo JSON',
    estructurada: 'sí',
    decision: 'INGESTA: municipio (INE-5) → id_gal / nombre del GAL.',
  },
  {
    id: 'redpac-rest',
    url: 'https://redpac.es/geoserver/rest/layers/RRN:GAL.json',
    comprobacion: 'GET',
    estructurada: 'sí',
    decision: '401 (auth requerida): descartado, se usa el WFS público.',
  },
  {
    id: 'mapa-gal',
    url: 'https://www.mapa.gob.es/es/desarrollo-rural/temas/programa-desarrollo-rural-sostenible/grupos-de-accion-local/',
    comprobacion: 'GET',
    estructurada: 'no',
    decision: 'Página retirada (404): sin listado estructurado.',
  },
  {
    id: 'mapa-datos-abiertos',
    url: 'https://www.mapa.gob.es/es/ministerio/servicios/informacion/plataforma-de-datos-abiertos/',
    comprobacion: 'GET',
    estructurada: 'no',
    decision: '404; el catálogo nacional operativo es datos.gob.es (API abajo).',
  },
  {
    id: 'mapa-ide-gal',
    url: 'https://www.mapa.gob.es/es/cartografia-y-sig/ide/descargas/desarrollo-rural/gal',
    comprobacion: 'GET',
    estructurada: 'sí',
    decision: 'Shapefile de polígonos (actualización feb-2012, periodo 2007-2013): NO se ingiere (obsoleto y sin relación municipal explícita).',
  },
  {
    id: 'mapa-gal-rar',
    url: 'https://www.mapa.gob.es/app/descargas/descargafichero.aspx?f=gal.rar',
    comprobacion: 'GET',
    estructurada: 'sí',
    decision: 'Envoltorio de descarga del .rar anterior; mismo dataset obsoleto, no se ingiere.',
  },
  {
    id: 'datosgob-leader',
    url: 'https://datos.gob.es/apidata/catalog/dataset/title/leader?_pageSize=25&_format=json',
    comprobacion: 'GET + parseo JSON',
    estructurada: 'sí',
    decision: 'API DCAT: localiza el dataset de CLM (PEPAC 2023-2027).',
  },
  {
    id: 'datosgob-gdr',
    url: 'https://datos.gob.es/apidata/catalog/dataset/title/grupos%20de%20desarrollo%20rural?_pageSize=25&_format=json',
    comprobacion: 'GET + parseo JSON',
    estructurada: 'sí',
    decision: '1 único dataset en todo España: CLM. Resto de CCAA sin equivalente estructurado.',
  },
  {
    id: 'clm-poblaciones',
    url: CLM_POBLACIONES,
    comprobacion: 'GET + parseo CSV (ISO-8859-1, «;»)',
    estructurada: 'sí',
    decision: 'INGESTA (prioridad): cobertura municipal CLM 2023-2027.',
  },
  {
    id: 'clm-gdr-pepac',
    url: CLM_GDR_PEPAC,
    comprobacion: 'GET + parseo CSV (ISO-8859-1, «;»)',
    estructurada: 'sí',
    decision: 'INGESTA como cruce de validación de la cobertura CLM.',
  },
  {
    id: 'jccm-gal',
    url: 'https://www.jccm.es/economia/desarrollo-rural/programa-desarrollo-rural/grupos-accion-local/',
    comprobacion: 'GET',
    estructurada: 'no',
    decision: '404/500 en todas las variantes probadas: sin descarga estructurada; se cubre con datos.gob.es/CLM.',
  },
  {
    id: 'gva-portalagrari',
    url: 'https://portalagrari.gva.es/es/-/02-datos-de-contacto-de-los-gal',
    comprobacion: 'GET',
    estructurada: 'no',
    decision: 'Listado HTML de contactos de los 11 GAL de la CV: NO se raspa.',
  },
  {
    id: 'xunta-galp',
    url: 'https://galp.xunta.gal/mapa',
    comprobacion: 'GET',
    estructurada: 'no',
    decision: 'GALP = Grupos de Acción Costera (FEMP), no LEADER: fuera de alcance.',
  },
]

async function sondear(s: Omit<Sondeo, 'http'>): Promise<SondeoResultado> {
  const t0 = Date.now()
  try {
    const r = await fetch(s.url, {
      headers: { 'User-Agent': UA, Accept: '*/*' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
    })
    const buf = Buffer.from(await r.arrayBuffer())
    return {
      ...s,
      http: `${r.status}${r.ok ? ' OK' : ''}`,
      ok: r.ok,
      bytes: buf.length,
      ctype: (r.headers.get('content-type') ?? '').split(';')[0] ?? '',
      decision: s.decision + ` (${Math.round((Date.now() - t0) / 100) / 10}s)`,
    }
  } catch (e) {
    return {
      ...s,
      http: `ERROR ${e instanceof Error ? e.message : String(e)}`,
      ok: false,
      bytes: 0,
      ctype: '-',
      decision: s.decision,
    }
  }
}

async function sondearTodo(): Promise<SondeoResultado[]> {
  const out: SondeoResultado[] = []
  for (const s of SONDEOS) out.push(await sondear(s))
  return out
}

function tablaSondeo(res: SondeoResultado[]): string {
  const lineas = [
    'SONDEO DE FUENTES DE GAL (URL → HTTP → estructurada → decisión)',
    '='.repeat(112),
    `${'id'.padEnd(22)} ${'HTTP'.padEnd(12)} ${'bytes'.padStart(9)}  estructurada  decisión`,
    '-'.repeat(112),
  ]
  for (const r of res) {
    lineas.push(
      `${r.id.padEnd(22)} ${r.http.padEnd(12)} ${String(r.bytes).padStart(9)}  ` +
        `${r.estructurada.padEnd(13)}  ${r.decision}`,
    )
    lineas.push(`${' '.repeat(22)} ${r.url}`)
  }
  lineas.push('='.repeat(112))
  return lineas.join('\n')
}

// ─────────────────────────── Descarga y parseo ───────────────────────────────

async function descargar(url: string): Promise<{ status: number; body: Buffer; ctype: string }> {
  let ultimo: unknown = null
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: '*/*' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'follow',
      })
      const body = Buffer.from(await r.arrayBuffer())
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return { status: r.status, body, ctype: (r.headers.get('content-type') ?? '').split(';')[0] ?? '' }
    } catch (e) {
      ultimo = e
      await new Promise((x) => setTimeout(x, 800 * intento))
    }
  }
  throw new Error(`${url}: ${ultimo instanceof Error ? ultimo.message : String(ultimo)}`)
}

/** CSV tolerante: separador configurable, comillas RFC4180 («""» = comilla literal). */
export function parseCsv(texto: string, delim = ';'): string[][] {
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let enComillas = false
  let empezado = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"'
          i++
        } else enComillas = false
      } else campo += c
      continue
    }
    if (c === '"' && !empezado) {
      enComillas = true
      empezado = true
      continue
    }
    if (c === delim) {
      fila.push(campo)
      campo = ''
      empezado = false
      continue
    }
    if (c === '\n') {
      fila.push(campo)
      filas.push(fila)
      fila = []
      campo = ''
      empezado = false
      continue
    }
    if (c === '\r') continue
    campo += c
    empezado = true
  }
  if (campo !== '' || fila.length > 0) {
    fila.push(campo)
    filas.push(fila)
  }
  return filas.filter((f) => f.some((v) => v.trim() !== ''))
}

const limpia = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim()
const pad = (v: string, n: number): string => v.padStart(n, '0')

interface FilaGal {
  codigo_gal: string
  nombre: string
  ccaa_code: string | null
  ambito_territorial: string | null
  municipios_codigo_ine: string[]
  web_oficial: string | null
  email: string | null
  telefono: string | null
  periodo_programacion: string | null
  fuente_url: string
  fuente_fecha: string
  raw_data: Record<string, unknown>
}

interface WfsFeature {
  properties: Record<string, unknown>
}

// ──────────────────────── Fuente A · Red PAC (WFS) ───────────────────────────

interface FuenteRrn {
  filas: FilaGal[]
  coberturaPorIne: Map<string, string> // ine → codigo_gal RRN (solo los que tienen GAL)
  /** Todos los INE codificados por la capa RRN:MUN, con o sin GAL. */
  codigos: Set<string>
  municipiosTotales: number
  conGal: number
  errores: string[]
  avisos: string[]
}

async function cargarRedPac(): Promise<FuenteRrn> {
  const errores: string[] = []
  const avisos: string[] = []
  const [munRes, galRes] = await Promise.all([descargar(EP_MUN), descargar(EP_GAL)])
  const munJson = JSON.parse(munRes.body.toString('utf-8')) as { features: WfsFeature[] }
  const galJson = JSON.parse(galRes.body.toString('utf-8')) as { features: WfsFeature[] }
  if (!Array.isArray(munJson.features) || !Array.isArray(galJson.features)) {
    throw new Error('Respuesta WFS sin features')
  }

  const fichas = new Map<number, Record<string, unknown>>()
  for (const f of galJson.features) {
    const id = Number(f.properties.id_gal)
    if (!Number.isFinite(id)) {
      errores.push(`GAL sin id_gal: ${limpia(f.properties.nombregal)}`)
      continue
    }
    fichas.set(id, f.properties)
  }

  const porGal = new Map<number, Set<string>>()
  const coberturaPorIne = new Map<string, string>()
  const codigos = new Set<string>()
  const sinFicha = new Map<number, number>()
  let conGal = 0
  for (const f of munJson.features) {
    const ine = limpia(f.properties.codigoine)
    if (!/^\d{5}$/.test(ine)) {
      errores.push(`MUN con codigoine inválido: ${limpia(f.properties.codigoine)}`)
      continue
    }
    codigos.add(ine)
    const idGalRaw = f.properties.id_gal
    if (idGalRaw === null || idGalRaw === undefined || idGalRaw === '') continue
    const idGal = Number(idGalRaw)
    if (!Number.isFinite(idGal)) continue
    if (!fichas.has(idGal)) sinFicha.set(idGal, (sinFicha.get(idGal) ?? 0) + 1)
    const set = porGal.get(idGal) ?? new Set<string>()
    set.add(ine)
    porGal.set(idGal, set)
    coberturaPorIne.set(ine, `RRN-${idGal}`)
    conGal++
  }
  for (const [idGal, n] of sinFicha) {
    avisos.push(
      `Red PAC: id_gal=${idGal} declara ${n} municipio(s) pero no tiene ficha en RRN:GAL → no se crea fila (nunca se inventa un nombre).`,
    )
  }

  const filas: FilaGal[] = []
  for (const [idGal, set] of porGal) {
    const p = fichas.get(idGal)
    if (!p) continue // ya avisado en `avisos` (id_gal sin ficha)
    const idCcaa = limpia(p.id_ccaa)
    const ccaa = /^\d{11}$/.test(idCcaa) ? idCcaa.slice(2, 4) : null
    const nombre = limpia(p.nombregal) || `GAL ${idGal}`
    filas.push({
      codigo_gal: `RRN-${idGal}`,
      nombre,
      ccaa_code: ccaa,
      ambito_territorial: limpia(p.region) || null,
      municipios_codigo_ine: [...set].sort(),
      web_oficial: limpia(p.paginaweb) || null,
      email: limpia(p.email) || null,
      telefono: limpia(p.telefono) || null,
      // Sin periodo publicado en la fuente: NO se infiere (las fichas datan de 2018).
      periodo_programacion: null,
      fuente_url: VISOR_RED_PAC,
      fuente_fecha: HOY,
      raw_data: {
        fuente: 'redpac_wfs',
        capa_gal: 'RRN:GAL',
        capa_mun: 'RRN:MUN',
        id_gal_rrn: idGal,
        id_ccaa: idCcaa || null,
        marca_temporal: limpia(p.marca_temporal) || null,
        nombre_legal: limpia(p.nom_completo_siglas) || null,
        provincia_ficha: limpia(p.provincia) || null,
        municipio_ficha: limpia(p.municipio) || null,
        poblacion: typeof p.poblacion === 'number' ? p.poblacion : null,
        num_entidades_incluidas_gal: limpia(p.num_entidades_incluidas_gal) || null,
        num_ayuntamientos: limpia(p.num_ayuntamientos) || null,
        endpoint_gal: EP_GAL,
        endpoint_mun: EP_MUN,
        descarga: new Date().toISOString(),
      },
    })
  }
  filas.sort((a, b) => a.codigo_gal.localeCompare(b.codigo_gal))
  return {
    filas,
    coberturaPorIne,
    codigos,
    municipiosTotales: munJson.features.length,
    conGal,
    errores,
    avisos,
  }
}

// ─────────────────── Fuente B · Datos Abiertos CLM (2023-2027) ───────────────

interface GrupoClm {
  codigo: string
  siglas: string
  legal: string
  email: string
  provincia: string
  municipios: Set<string>
  nucleos: number
}

interface FuenteClm {
  filas: FilaGal[]
  ines: Set<string>
  porGrupo: Map<string, GrupoClm>
  cruce: {
    soloPoblaciones: string[]
    soloPepac: string[]
    gruposPepac: number
    reasignaciones: number
  }
  errores: string[]
  avisos: string[]
}

async function cargarClm(): Promise<FuenteClm> {
  const errores: string[] = []
  const avisos: string[] = []
  const [pobRes, pepRes] = await Promise.all([descargar(CLM_POBLACIONES), descargar(CLM_GDR_PEPAC)])
  const pobTxt = new TextDecoder('iso-8859-1').decode(pobRes.body)
  const pepTxt = new TextDecoder('iso-8859-1').decode(pepRes.body)

  const pob = parseCsv(pobTxt, ';')
  const cabPob = (pob[0] ?? []).map(limpia)
  const iProv = cabPob.indexOf('INE Provincia')
  const iCod = cabPob.indexOf('Código del GRUPO')
  const iG1 = cabPob.indexOf('Nombre del grupo (1)')
  const iG2 = cabPob.indexOf('Nombre del grupo (2)')
  const iMail = cabPob.indexOf('E-mail')
  const iMun = cabPob.indexOf('INE Municipio')
  const iNomProv = cabPob.indexOf('Nombre de la provincia')
  if (iProv < 0 || iCod < 0 || iMun < 0 || iG1 < 0) {
    throw new Error(`CLM poblaciones: cabeceras inesperadas → ${cabPob.join(' | ')}`)
  }

  const porGrupo = new Map<string, GrupoClm>()
  for (let i = 1; i < pob.length; i++) {
    const f = pob[i]
    const prov = pad(limpia(f[iProv]), 2)
    const mun = pad(limpia(f[iMun]), 3)
    const ine = `${prov}${mun}`
    if (!/^\d{5}$/.test(ine)) {
      errores.push(`CLM fila ${i + 1}: INE inválido (${prov}/${mun})`)
      continue
    }
    const codigo = limpia(f[iCod])
    if (!codigo) {
      errores.push(`CLM fila ${i + 1}: sin código de grupo`)
      continue
    }
    const g = porGrupo.get(codigo) ?? {
      codigo,
      siglas: limpia(f[iG1]),
      legal: limpia(f[iG2]),
      email: limpia(f[iMail]),
      provincia: limpia(f[iNomProv]),
      municipios: new Set<string>(),
      nucleos: 0,
    }
    g.municipios.add(ine)
    g.nucleos++
    if (!g.email && limpia(f[iMail])) g.email = limpia(f[iMail])
    porGrupo.set(codigo, g)
  }
  if (porGrupo.size === 0) throw new Error('CLM poblaciones: 0 grupos parseados')

  // Cruce con GDR PEPAC (misma campaña, otro fichero: un municipio = una fila).
  const pep = parseCsv(pepTxt, ';')
  const cabPep = (pep[0] ?? []).map(limpia)
  const iPCod = 0 // «ARINCO GDR (G____)»
  const iPGdr = cabPep.indexOf('GRUPO DE DESARROLLO RURAL')
  const iPCodProv = cabPep.indexOf('CODPROV')
  const iPCodIne = cabPep.indexOf('CODINE')
  const pepPorGrupo = new Map<string, Set<string>>()
  const pepPorIne = new Map<string, string>()
  const nombrePep = new Map<string, string>()
  const inesPepac = new Set<string>()
  for (let i = 1; i < pep.length; i++) {
    const f = pep[i]
    // CODINE puede venir sin el 0 inicial de la provincia («2001» = 02001):
    // se re-normaliza siempre contra CODPROV + las 3 últimas cifras municipales.
    const prov = iPCodProv >= 0 ? pad(limpia(f[iPCodProv]), 2) : ''
    const ineCrudo = pad(limpia(f[iPCodIne]), 5)
    const ine = prov ? `${prov}${ineCrudo.slice(-3)}` : ineCrudo
    if (!/^\d{5}$/.test(ine) || ine === '00000') {
      avisos.push(
        `CLM GDR PEPAC fila ${i + 1}: CODINE vacío o inválido (${limpia(f[iPCodIne])}) → fila ignorada en el cruce.`,
      )
      continue
    }
    const cod = limpia(f[iPCod])
    inesPepac.add(ine)
    if (pepPorIne.has(ine) && pepPorIne.get(ine) !== cod) {
      avisos.push(
        `CLM GDR PEPAC: ${ine} aparece en dos grupos (${pepPorIne.get(ine)} y ${cod}) → se conserva el primero.`,
      )
      continue
    }
    pepPorIne.set(ine, cod)
    const s = pepPorGrupo.get(cod) ?? new Set<string>()
    s.add(ine)
    pepPorGrupo.set(cod, s)
    if (iPGdr >= 0 && limpia(f[iPGdr]) && !nombrePep.has(cod)) nombrePep.set(cod, limpia(f[iPGdr]))
  }

  // ASIGNACIÓN MUNICIPAL CLM:
  //  · `poblaciones` decide QUIÉNES municipios están cubiertos (y metadatos).
  //  · `GDR PEPAC` decide A QUÉ grupo va cada municipio (una fila por municipio).
  //  · Ante discrepancias se respeta PEPAC y se deja constancia en `avisos`.
  const pobPorIne = new Map<string, string[]>()
  for (const g of porGrupo.values()) {
    for (const ine of g.municipios) {
      const lista = pobPorIne.get(ine) ?? []
      if (!lista.includes(g.codigo)) lista.push(g.codigo)
      pobPorIne.set(ine, lista)
    }
  }

  const asignacion = new Map<string, string>() // ine → código «Lxxxx» del grupo
  const reasignaciones: string[] = []
  for (const ine of pobPorIne.keys()) {
    const candidatos = [...(pobPorIne.get(ine) ?? [])].sort()
    const codPep = pepPorIne.get(ine)
    const codPepL = codPep ? codPep.replace(/^G/, 'L') : null
    const elegido = codPepL ?? candidatos[0]
    if (!porGrupo.has(elegido)) {
      porGrupo.set(elegido, {
        codigo: elegido,
        siglas: nombrePep.get(codPep ?? '') || elegido,
        legal: '',
        email: '',
        provincia: '',
        municipios: new Set<string>(),
        nucleos: 0,
      })
      avisos.push(
        `CLM: PEPAC asigna municipios al grupo ${elegido} sin metadatos en «poblaciones» → se crea fila mínima con el nombre publicado en PEPAC.`,
      )
    }
    if (candidatos.length > 1 || (codPepL && !candidatos.includes(codPepL))) {
      reasignaciones.push(
        `${ine}: poblaciones=${candidatos.join('/')} · PEPAC=${codPep ?? 'sin fila'} → se usa ${elegido}`,
      )
    }
    asignacion.set(ine, elegido)
  }
  for (const g of porGrupo.values()) g.municipios = new Set<string>()
  for (const [ine, cod] of asignacion) porGrupo.get(cod)!.municipios.add(ine)

  const ines = new Set(asignacion.keys())
  const soloPoblaciones = [...ines].filter((i) => !inesPepac.has(i)).sort()
  const soloPepac = [...inesPepac].filter((i) => !ines.has(i)).sort()
  for (const r of reasignaciones) avisos.push(`CLM reasignación: ${r}`)
  if (soloPepac.length) {
    avisos.push(
      `CLM: ${soloPepac.length} municipio(s) con fila en GDR PEPAC pero ausentes de «poblaciones» (${soloPepac.join(', ')}) → NO se ingieren (cubiertos solo si otra fuente los publica).`,
    )
  }

  const filas: FilaGal[] = []
  for (const g of [...porGrupo.values()].sort((a, b) => a.codigo.localeCompare(b.codigo))) {
    const municipios = [...g.municipios].sort()
    if (municipios.length === 0) continue // grupo sin cobertura tras la asignación
    const pepSet = pepPorGrupo.get(g.codigo.replace(/^L/, 'G')) ?? pepPorGrupo.get(g.codigo)
    const pobGrupo = [...pobPorIne].filter(([, cods]) => cods.includes(g.codigo)).length
    filas.push({
      codigo_gal: `CLM-${g.codigo.replace(/^L/, '')}`,
      nombre: g.siglas || g.legal || g.codigo,
      ccaa_code: '08',
      ambito_territorial: `Castilla-La Mancha${g.provincia ? ` · ${g.provincia}` : ''}`,
      municipios_codigo_ine: municipios,
      web_oficial: null,
      email: g.email || null,
      telefono: null,
      periodo_programacion: '2023-2027',
      fuente_url: CLM_POBLACIONES,
      fuente_fecha: HOY,
      raw_data: {
        fuente: 'datos_abiertos_clm',
        dataset: DATASET_CLM,
        codigo_grupo: g.codigo,
        nombre_legal: g.legal || null,
        fuentes: [CLM_POBLACIONES, CLM_GDR_PEPAC],
        regla_asignacion: 'cobertura=poblaciones · grupo=GDR PEPAC (desempate)',
        cobertura_nucleos: g.nucleos,
        municipios: municipios.length,
        municipios_en_poblaciones: pobGrupo,
        municipios_en_pepac: pepSet ? pepSet.size : null,
        cruce_pepac: pepSet
          ? {
              fuera_de_pepac: municipios.filter((i) => !pepSet.has(i)),
              fuera_de_poblaciones: [...pepSet].filter((i) => !g.municipios.has(i)),
            }
          : null,
        descarga: new Date().toISOString(),
      },
    })
  }

  return {
    filas,
    ines,
    porGrupo,
    cruce: {
      soloPoblaciones,
      soloPepac,
      gruposPepac: pepPorGrupo.size,
      reasignaciones: reasignaciones.length,
    },
    errores,
    avisos,
  }
}

// ─────────────────────── Composición e informe ───────────────────────────────

interface DetalleComposicion {
  rrn_municipios_codificados: number
  rrn_con_gal: number
  rrn_filas: number
  rrn_municipios_quitados_por_clm: number
  rrn_filas_sin_cobertura_tras_clm: number
  clm_filas: number
  clm_municipios: number
  clm_enriquecidas_rrn: number
  exclusividad_resueltas: number
  exclusividad_conflictos: Array<{ ine: string; conservada: string; retirada: string }>
  clm_cruce_pepac: {
    solo_poblaciones: number
    solo_pepac: number
    muestra_solo_poblaciones: string[]
    muestra_solo_pepac: string[]
    grupos_pepac: number
    reasignaciones: number
  }
}

interface CoberturaCatalogo {
  catalogo: number
  conGal: number
  pctConGal: number
  sinGal: number
  ausentesFuente: number
  municipiosDuplicados: number
}

function componer(rrn: FuenteRrn, clm: FuenteClm): {
  filas: FilaGal[]
  detalle: DetalleComposicion
  avisos: string[]
} {
  // 1. Los municipios publicados por CLM (prioridad, PEPAC 2023-2027) se quitan
  //    de las filas de Red PAC para que cada municipio tenga como máximo un GAL.
  const quitados = rrn.filas.reduce(
    (n, f) => n + f.municipios_codigo_ine.filter((i) => clm.ines.has(i)).length,
    0,
  )
  const rrnTras: FilaGal[] = rrn.filas.map((f) => ({
    ...f,
    municipios_codigo_ine: f.municipios_codigo_ine.filter((i) => !clm.ines.has(i)),
  }))
  const rrnVacias = rrnTras.filter((f) => f.municipios_codigo_ine.length === 0).length

  // 2. Enriquecimiento opcional de las filas CLM con web/teléfono de Red PAC:
  //    solo si el conjunto municipal CLM está CONTENIDO en exactamente un GAL de
  //    Red PAC (territorio idéntico ⇒ misma entidad). Nunca por nombre.
  let enriquecidas = 0
  for (const c of clm.filas) {
    const candidatos = rrn.filas.filter((r) => {
      const set = new Set(r.municipios_codigo_ine)
      return c.municipios_codigo_ine.every((i) => set.has(i))
    })
    if (candidatos.length !== 1) {
      c.raw_data.enriquecimiento_rrn = candidatos.length
        ? { motivo: 'ambiguo', candidatos: candidatos.map((x) => x.codigo_gal) }
        : { motivo: 'sin_contenedor' }
      continue
    }
    const r = candidatos[0]
    let cambio = false
    if (!c.web_oficial && r.web_oficial) {
      c.web_oficial = r.web_oficial
      cambio = true
    }
    if (!c.telefono && r.telefono) {
      c.telefono = r.telefono
      cambio = true
    }
    c.raw_data.enriquecimiento_rrn = {
      motivo: 'cobertura_contenida',
      codigo_gal_rrn: r.codigo_gal,
      nombre_rrn: r.nombre,
      web: Boolean(c.web_oficial),
      telefono: Boolean(c.telefono),
    }
    if (cambio) enriquecidas++
  }

  // 3. EXCLUSIVIDAD: un municipio pertenece como máximo a un GAL. El orden es
  //    determinista (CLM-* antes que RRN-*, y código ascendente): ante un
  //    conflicto de las propias fuentes se conserva la primera fila y se retira
  //    el municipio de las demás, dejando constancia en el informe.
  const orden = [...clm.filas, ...rrnTras].sort((a, b) => a.codigo_gal.localeCompare(b.codigo_gal))
  const dueno = new Map<string, string>()
  const conflictos: Array<{ ine: string; conservada: string; retirada: string }> = []
  const filas: FilaGal[] = orden.map((f) => {
    const mantenidos: string[] = []
    for (const ine of f.municipios_codigo_ine) {
      const previo = dueno.get(ine)
      if (previo) {
        conflictos.push({ ine, conservada: previo, retirada: f.codigo_gal })
        continue
      }
      dueno.set(ine, f.codigo_gal)
      mantenidos.push(ine)
    }
    return { ...f, municipios_codigo_ine: mantenidos }
  })
  const avisos: string[] = []
  for (const c of conflictos) {
    avisos.push(
      `Exclusividad: ${c.ine} aparece en ${c.retirada} y en ${c.conservada}; se conserva ${c.conservada} (orden CLM antes que RRN, código ascendente).`,
    )
  }

  return {
    filas,
    detalle: {
      rrn_municipios_codificados: rrn.municipiosTotales,
      rrn_con_gal: rrn.conGal,
      rrn_filas: rrn.filas.length,
      rrn_municipios_quitados_por_clm: quitados,
      rrn_filas_sin_cobertura_tras_clm: rrnVacias,
      clm_filas: clm.filas.length,
      clm_municipios: clm.ines.size,
      clm_enriquecidas_rrn: enriquecidas,
      exclusividad_resueltas: conflictos.length,
      exclusividad_conflictos: conflictos.slice(0, 20),
      clm_cruce_pepac: {
        solo_poblaciones: clm.cruce.soloPoblaciones.length,
        solo_pepac: clm.cruce.soloPepac.length,
        muestra_solo_poblaciones: clm.cruce.soloPoblaciones.slice(0, 10),
        muestra_solo_pepac: clm.cruce.soloPepac.slice(0, 10),
        grupos_pepac: clm.cruce.gruposPepac,
        reasignaciones: clm.cruce.reasignaciones,
      },
    },
    avisos,
  }
}

async function cargarCatalogoInes(sb: SupabaseClient): Promise<Set<string>> {
  const out = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('municipios')
      .select('codigo_ine')
      .order('codigo_ine')
      .range(from, from + 999)
    if (error) throw error
    for (const r of (data ?? []) as Array<{ codigo_ine: string }>) out.add(r.codigo_ine.trim())
    if ((data ?? []).length < 1000) break
  }
  return out
}

function lineaPiloto(ine: string, esperado: string, filas: FilaGal[]): string {
  const hit = filas.find((f) => f.municipios_codigo_ine.includes(ine))
  if (!hit) return `  ${ine.padEnd(6)} ${esperado.padEnd(42)} → SIN COBERTURA PUBLICADA`
  return (
    `  ${ine.padEnd(6)} ${esperado.padEnd(42)} → ${hit.codigo_gal} · ${hit.nombre}` +
    ` · periodo=${hit.periodo_programacion ?? 'no publicado'}`
  )
}

function construirInforme(
  runId: string,
  sondeos: SondeoResultado[],
  filas: FilaGal[],
  detalle: DetalleComposicion,
  errores: string[],
  avisos: string[],
  cobertura: CoberturaCatalogo | null,
): string {
  const conWeb = filas.filter((f) => f.web_oficial).length
  const conPeriodo = filas.filter((f) => f.periodo_programacion).length
  const porCcaa = new Map<string, number>()
  for (const f of filas) porCcaa.set(f.ccaa_code ?? '??', (porCcaa.get(f.ccaa_code ?? '??') ?? 0) + 1)

  const bloques: string[] = [
    `INFORME DE FUENTES GAL — ${new Date().toISOString()} — runId=${runId}`,
    '',
    tablaSondeo(sondeos),
    '',
    'DECISIÓN DE INGESTA',
    '-'.repeat(112),
    '· INGERIDAS (CSV/JSON estructurado parseado por scripts/sync-gal.ts):',
    `    [A] Red PAC · WFS RRN:MUN + RRN:GAL  → ${detalle.rrn_filas} filas, ${detalle.rrn_con_gal} municipios con GAL de ${detalle.rrn_municipios_codificados} codificados.`,
    `    [B] Datos Abiertos CLM · PEPAC 2023-2027 → ${detalle.clm_filas} filas, ${detalle.clm_municipios} municipios.`,
    '· NO INGERIDAS: MAPA shapefile IDE (feb-2012, periodo 2007-2013); HTML de redpac.es,',
    '  MAPA, JCCM, Portal Agrari GVA y visor GALP (Xunta, FEMP ≠ LEADER). Sin scraping.',
    '· Cobertura exclusiva: los municipios CLM se retiran de las filas Red PAC',
    `  (${detalle.rrn_municipios_quitados_por_clm} municipios reasignados; ${detalle.rrn_filas_sin_cobertura_tras_clm} filas RRN quedan sin cobertura propia).`,
    '',
    'RESUMEN',
    '-'.repeat(112),
    `  filas totales ............... ${filas.length}`,
    `  con web oficial ............. ${conWeb}`,
    `  con periodo publicado ....... ${conPeriodo} (solo CLM 2023-2027; Red PAC no publica periodo)`,
    `  filas por ccaa .............. ${[...porCcaa.entries()].sort().map(([k, v]) => `${k}:${v}`).join(' ')}`,
    '',
    'CRUCE CLM (poblaciones ↔ GDR PEPAC)',
    `-`.repeat(112),
    `  grupos PEPAC ............... ${detalle.clm_cruce_pepac.grupos_pepac}`,
    `  en poblaciones y no en PEPAC  ${detalle.clm_cruce_pepac.solo_poblaciones} (se ingieren igualmente: PEPAC solo desempata)`,
    `  en PEPAC y no en poblaciones  ${detalle.clm_cruce_pepac.solo_pepac} (NO se ingieren: ausentes de la cobertura publicada)`,
    `  muestra solo poblaciones ... ${JSON.stringify(detalle.clm_cruce_pepac.muestra_solo_poblaciones)}`,
    `  muestra solo PEPAC ......... ${JSON.stringify(detalle.clm_cruce_pepac.muestra_solo_pepac)}`,
    `  reasignaciones PEPAC ....... ${detalle.clm_cruce_pepac.reasignaciones} (discrepancias poblaciones↔PEPAC resueltas con PEPAC)`,
    `  enriquecidas con RRN ....... ${detalle.clm_enriquecidas_rrn} (web/teléfono por cobertura contenida)`,
    `  exclusividad resuelta ...... ${detalle.exclusividad_resueltas} (municipios en más de un GAL)`,
    '',
    'PILOTOS DE LA MISIÓN',
    '-'.repeat(112),
    ...PILOTOS.map((p) => lineaPiloto(p.ine, p.esperado, filas)),
    '  Nota: el código 45172 del enunciado corresponde a Torrico (Toledo);',
    '  Torrejoncillo del Rey es 16211 (Cuenca) según la tabla `municipios`.',
    '',
  ]

  if (cobertura) {
    bloques.push(
      'COBERTURA SOBRE EL CATÁLOGO `municipios`',
      '-'.repeat(112),
      `  municipios en catálogo ...... ${cobertura.catalogo}`,
      `  con al menos un GAL ......... ${cobertura.conGal} (${cobertura.pctConGal} %)`,
      `  sin GAL publicado ........... ${cobertura.sinGal}`,
      `  ausentes de toda fuente .... ${cobertura.ausentesFuente}`,
      `  municipios en >1 GAL ........ ${cobertura.municipiosDuplicados} (debe ser 0)`,
      '',
    )
  } else {
    bloques.push('COBERTURA SOBRE EL CATÁLOGO: no calculada (sin credenciales Supabase en la ejecución).', '')
  }

  bloques.push('AVISO', '-'.repeat(112))
  bloques.push(
    '  Las fichas de Red PAC llevan marca_temporal en 2018 (220/254) o vacía (34/254) y la',
    '  capa de cobertura no incluye periodo de programación: esas filas se publican con',
    '  periodo_programacion = NULL y con el aviso de verificación de la tabla. Los datos CLM',
    '  sí declaran PEPAC 2023-2027. Verificar siempre en la web del GAL antes de citar.',
    '',
  )

  if (avisos.length) {
    bloques.push(`AVISOS (${avisos.length})`, '-'.repeat(112))
    for (const a of avisos.slice(0, 40)) bloques.push(`  · ${a}`)
    if (avisos.length > 40) bloques.push(`  … y ${avisos.length - 40} más`)
    bloques.push('')
  }

  if (errores.length) {
    bloques.push(`ERRORES / AVISOS DE PARSEO (${errores.length})`, '-'.repeat(112))
    for (const e of errores.slice(0, 40)) bloques.push(`  · ${e}`)
    if (errores.length > 40) bloques.push(`  … y ${errores.length - 40} más`)
    bloques.push('')
  }

  return bloques.join('\n')
}

// ───────────────────────────── Escritura ─────────────────────────────────────

async function escribir(sb: SupabaseClient, filas: FilaGal[]): Promise<{ escritas: number; errores: string[] }> {
  const errores: string[] = []
  let escritas = 0
  for (let i = 0; i < filas.length; i += BATCH_SIZE) {
    const lote = filas.slice(i, i + BATCH_SIZE)
    const { error } = await sb.from('grupos_accion_local').upsert(lote, { onConflict: 'codigo_gal' })
    if (error) {
      errores.push(`lote ${i / BATCH_SIZE + 1}: ${error.message}`)
      continue
    }
    escritas += lote.length
    console.log(`  lote ${Math.floor(i / BATCH_SIZE) + 1}: ${lote.length} filas ok (${escritas}/${filas.length})`)
  }
  return { escritas, errores }
}

async function registrarRun(
  sb: SupabaseClient,
  args: {
    estado: 'ok' | 'partial' | 'error'
    leidos: number
    escritos: number
    errores: string[]
    detalle: DetalleComposicion
  },
): Promise<void> {
  const row = {
    source_id: null,
    tipo_sincronizacion: 'grupos_accion_local',
    municipio_codigo_ine: null,
    estado: args.estado,
    registros_leidos: args.leidos,
    registros_actualizados: args.escritos,
    fin: new Date().toISOString(),
    error_message: args.errores.length
      ? args.errores.slice(0, 20).join(' | ').slice(0, 1900)
      : null,
    estado_dato: 'provisional',
    bloque: 'territorio',
    periodo: '2023-2027 (CLM) / Red PAC sin periodo',
    fuente: 'redpac_wfs+datos_abiertos_clm',
    metadata: {
      modo: 'write',
      fuentes: [EP_GAL, EP_MUN, CLM_POBLACIONES, CLM_GDR_PEPAC],
      detalle: args.detalle,
      errores: args.errores.length,
      informe: 'tmp/audit/gal-fuentes.txt',
    },
  }
  const { error } = await sb.from('data_sync_runs').insert(row)
  if (error) console.error(`  Auditoría data_sync_runs no insertada: ${error.message}`)
  else console.log(`  Auditoría data_sync_runs insertada (estado=${args.estado})`)
}

// ─────────────────────────────── main ────────────────────────────────────────

function parseArgs(argv: string[]): { probeOnly: boolean; write: boolean } {
  const probeOnly = argv.includes('--probe-only')
  const write = argv.includes('--write')
  const desconocidos = argv.filter((a) => a !== '--probe-only' && a !== '--write' && !a.startsWith('--'))
  if (desconocidos.length) {
    console.error(`Flags desconocidos: ${desconocidos.join(' ')}`)
    console.error('Uso: npx tsx scripts/sync-gal.ts [--probe-only] [--write]')
    process.exit(1)
  }
  return { probeOnly, write }
}

function guardarInforme(texto: string): string {
  const dir = path.join(process.cwd(), 'tmp', 'audit')
  fs.mkdirSync(dir, { recursive: true })
  const p = path.join(dir, 'gal-fuentes.txt')
  fs.writeFileSync(p, texto, 'utf-8')
  return p
}

function clienteSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const runId =
    new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19) +
    '-' +
    Math.random().toString(36).slice(2, 7)

  console.log('=== SINCRONIZACIÓN GAL · SOCideas ===')
  console.log(`Modo: ${args.probeOnly ? 'PROBE-ONLY' : args.write ? 'ESCRITURA' : 'DRY-RUN (defecto)'} · runId=${runId}`)

  console.log('\n--- Sondeo de fuentes ---')
  const sondeos = await sondearTodo()
  console.log(tablaSondeo(sondeos))

  if (args.probeOnly) {
    const p = guardarInforme(
      [
        `SONDEO GAL — ${new Date().toISOString()} — runId=${runId}`,
        '',
        tablaSondeo(sondeos),
        '',
        'Modo --probe-only: no se descarga ni parsean datasets, no se toca Supabase.',
        '',
      ].join('\n'),
    )
    console.log(`\nInforme de sondeo: ${path.relative(process.cwd(), p)}`)
    return
  }

  // Descarga + parseo de las dos fuentes estructuradas.
  console.log('\n--- Descarga y parseo ---')
  const [rrn, clm] = await Promise.all([cargarRedPac(), cargarClm()])
  console.log(
    `  Red PAC: ${rrn.filas.length} GAL · ${rrn.conGal}/${rrn.municipiosTotales} municipios con GAL · errores=${rrn.errores.length}`,
  )
  console.log(
    `  CLM: ${clm.filas.length} GDR · ${clm.ines.size} municipios · cruce PEPAC soloPob=${clm.cruce.soloPoblaciones.length} soloPep=${clm.cruce.soloPepac.length}`,
  )

  const { filas, detalle, avisos: avisosExclusividad } = componer(rrn, clm)
  const errores = [...rrn.errores, ...clm.errores]
  const avisos = [...rrn.avisos, ...clm.avisos, ...avisosExclusividad]

  // Cobertura sobre el catálogo municipal (lectura; también en dry-run).
  const sb = clienteSupabase()
  let cobertura: CoberturaCatalogo | null = null
  if (sb) {
    try {
      const catalogo = await cargarCatalogoInes(sb)
      // Invariante de la misión: ningún municipio en más de un GAL.
      const vistos = new Map<string, string>()
      let duplicados = 0
      for (const f of filas) {
        for (const i of f.municipios_codigo_ine) {
          if (vistos.has(i)) duplicados++
          else vistos.set(i, f.codigo_gal)
        }
      }
      const conGal = [...catalogo].filter((i) => vistos.has(i)).length
      const enFuentes = new Set<string>([...clm.ines, ...rrn.codigos])
      cobertura = {
        catalogo: catalogo.size,
        conGal,
        pctConGal: Math.round((conGal / Math.max(1, catalogo.size)) * 1000) / 10,
        sinGal: catalogo.size - conGal,
        ausentesFuente: [...catalogo].filter((i) => !enFuentes.has(i)).length,
        municipiosDuplicados: duplicados,
      }
      if (duplicados > 0) errores.push(`INVARIANTE ROTO: ${duplicados} municipios en más de un GAL`)
      else console.log('  Invariante OK: ningún municipio en más de un GAL')
    } catch (e) {
      console.error(`  Cobertura no calculada: ${e instanceof Error ? e.message : e}`)
      errores.push(`cobertura: ${e instanceof Error ? e.message : String(e)}`)
    }
  } else {
    console.log('  Sin credenciales Supabase: cobertura no calculada (dry-run sigue siendo válido)')
  }

  const texto = construirInforme(runId, sondeos, filas, detalle, errores, avisos, cobertura)
  const informePath = guardarInforme(texto)
  console.log(`\n${texto}`)
  console.log(`Informe: ${path.relative(process.cwd(), informePath)}`)

  if (!args.write) {
    console.log('=== DRY-RUN COMPLETADO — sin escritura (usa --write para insertar) ===')
    return
  }
  if (!sb) {
    console.error('ABORTO: --write requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local')
    process.exit(2)
  }

  console.log('\n--- Escritura (upsert por codigo_gal) ---')
  const { escritas, errores: erroresWrite } = await escribir(sb, filas)
  const estado: 'ok' | 'partial' | 'error' =
    escritas === filas.length && errores.length === 0 ? 'ok' : escritas > 0 ? 'partial' : 'error'
  await registrarRun(sb, { estado, leidos: filas.length, escritos: escritas, errores: [...errores, ...erroresWrite], detalle })

  // Read-back mínimo.
  const { count } = await sb
    .from('grupos_accion_local')
    .select('id', { count: 'exact', head: true })
  console.log(`  Read-back: count(*) = ${count}`)
  for (const ine of PILOTOS.map((p) => p.ine)) {
    const { data } = await sb
      .from('grupos_accion_local')
      .select('codigo_gal, nombre, periodo_programacion')
      .contains('municipios_codigo_ine', [ine])
      .limit(1)
    const row = (data ?? [])[0]
    console.log(`  ${ine}: ${row ? `${row.codigo_gal} · ${row.nombre} · ${row.periodo_programacion ?? 'sin periodo'}` : 'sin cobertura'}`)
  }

  console.log(
    `\n=== ESCRITURA COMPLETADA: ${escritas}/${filas.length} filas · estado=${estado} · runId=${runId} ===`,
  )
  if (erroresWrite.length) {
    console.error(`  Errores de escritura: ${erroresWrite.join(' | ')}`)
    process.exit(3)
  }
}

void main().catch((e) => {
  console.error('ERROR FATAL:', e instanceof Error ? e.stack ?? e.message : e)
  process.exit(1)
})
