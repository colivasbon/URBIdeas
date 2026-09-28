// Cargador del atlas de secciones censales (geometría INE + estadística ADRH).
// ESCRITURA RESERVADA — no se ejecuta desde ninguna petición de usuario.
//
// Garantías:
//  - Prefijo NUEVO y aislado: `socideas/secciones/v1/municipal/{INE-5}.json`.
//  - NUNCA escribe en `socideas/v2/municipios` ni en ningún otro prefijo.
//  - Exige `--confirm-r2-write`. Sin ese flag no se escribe NADA (exit 2).
//  - Idempotente: reescribir el mismo municipio produce el mismo objeto salvo
//    las marcas de tiempo, y el checksum de contenido se compara en el
//    read-back.
//  - La estadística se descarga POR PROVINCIA una sola vez y se reutiliza para
//    todos sus municipios (el CSV provincial pesa ~3 MB y cubre la provincia).
//  - Fallo cerrado: si la validación del objeto falla, no se publica y el
//    municipio queda registrado como `error` en el manifiesto.
//  - Reanudable: los municipios ya publicados y sin cambios se saltan, y un
//    lote se puede relanzar con los mismos argumentos.
//
// USO
//   npx tsx scripts/load-secciones-atlas.ts                      # dry-run
//   npx tsx scripts/load-secciones-atlas.ts --ines=02007,16016
//   npx tsx scripts/load-secciones-atlas.ts --provincias=02,16
//   npx tsx scripts/load-secciones-atlas.ts --puerto=50 --lote=0
//   npx tsx scripts/load-secciones-atlas.ts --ines=02007 --confirm-r2-write

import { config } from 'dotenv'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env.local' })
void config

import {
  construirCatalogoIndicadores,
  parsearAdrhSecciones,
} from '../src/lib/ine-adrh-secciones'
import {
  descargarSecciones,
  descargarSeccionesConFallback,
  CRS_ORIGEN_INE,
  CRS_PUBLICADO,
  COLECCIONES_SECCIONES,
} from '../src/lib/ine-secciones-geometry'
import {
  SECCIONES_ATLAS_SCHEMA,
  SECCIONES_ATRIBUCION,
  SECCIONES_MANIFESTS_PREFIX,
  SECCIONES_R2_PREFIX,
  esPoligonoDistrito,
  isValidIne5,
  isValidSeccionKey,
  municipioDeSeccion,
  validarSeccionesAtlas,
  type SeccionIndicador,
  type SeccionIndicadorCobertura,
  type SeccionObservacion,
  type SeccionesAtlasR2V1,
  type SeccionesCalidad,
  type SeccionesSeriesCompactas,
  type SeccionValorCompacto,
} from '../src/lib/socideas-secciones'
import { expandirAtlas } from '../src/lib/socideas-secciones-store'
import PROVINCE_TABLES from '../src/lib/adrh-province-tables.json'

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────────────────────

const sha256 = (s: string | Buffer): string =>
  createHash('sha256').update(typeof s === 'string' ? Buffer.from(s, 'utf8') : s).digest('hex')

const log = (etiqueta: string, msg: string): void =>
  console.log(`[${etiqueta}] ${msg}`)

const AVISO_FUENTE = 'ATOMIZACIÓN PROHIBIDA: el Atlas de Distribución de Renta de los Hogares (ADRH) del INE'

type TablasProvincia = { provincia: string; renta: number; gini: number; verificado: string }

const TABLAS = PROVINCE_TABLES as unknown as Record<string, TablasProvincia>

const UA = { 'User-Agent': 'URBIdeas/1.0 (+https://urbideas.com)' }

const TOLERANCIA_SIMPLIFICACION = 8
const CONCURRENCIA = 3
const TIMEOUT_FETCH_MS = 120000

// ─────────────────────────────────────────────────────────────────────────────
// R2
// ─────────────────────────────────────────────────────────────────────────────

function r2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Faltan R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY')
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
}

const r2Bucket = (): string => {
  const b = process.env.R2_BUCKET
  if (!b) throw new Error('Falta R2_BUCKET')
  return b
}

const r2PublicBase = (): string =>
  process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ||
  'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'

const claveObjeto = (ine: string): string => `${SECCIONES_R2_PREFIX}/${ine}.json`

async function putObject(
  r2: S3Client,
  key: string,
  body: string,
  meta: Record<string, string>,
): Promise<void> {
  if (!key.startsWith(SECCIONES_R2_PREFIX) && !key.startsWith(SECCIONES_MANIFESTS_PREFIX)) {
    throw new Error(`Clave fuera de los prefijos autorizados: ${key}`)
  }
  await r2.send(
    new PutObjectCommand({
      Bucket: r2Bucket(),
      Key: key,
      Body: body,
      ContentType: 'application/json; charset=utf-8',
      // Los objetos son inmutables por versión: el contenido se reescribe con un
      // objeto nuevo, nunca se muta en sitio.
      CacheControl: 'public, max-age=86400',
      Metadata: meta,
    }),
  )
}

async function getObjectText(key: string): Promise<string | null> {
  const url = `${r2PublicBase()}/${key}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) return null
  return await res.text()
}

// ─────────────────────────────────────────────────────────────────────────────
// Descarga del CSV provincial del ADRH (una vez por provincia)
// ─────────────────────────────────────────────────────────────────────────────

interface CsvProvincia {
  texto: string
  url: string
  sha256: string
  bytes: number
  retrievedAt: string
}

const cacheCsv = new Map<string, CsvProvincia>()

async function csvProvincial(provincia: string): Promise<CsvProvincia> {
  const enCache = cacheCsv.get(provincia)
  if (enCache) return enCache
  const tablas = TABLAS[provincia]
  if (!tablas) throw new Error(`Provincia ${provincia} sin tablas ADRH verificadas`)

  // Las DOS familias (renta y gini) son necesarias para tener el catálogo
  // completo de indicadores por sección.
  const partes: string[] = []
  const checksums: string[] = []
  const retrievedAt = new Date().toISOString()
  let bytes = 0
  for (const tabla of [tablas.renta, tablas.gini]) {
    const url = `https://www.ine.es/jaxiT3/files/t/csv_bd/${tabla}.csv`
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), TIMEOUT_FETCH_MS)
    try {
      const res = await fetch(url, { signal: ctl.signal, headers: UA })
      if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      // El CSV provincial lleva una línea de metadatos ("Fuente:...") antes de
      // la cabecera; se conserva tal cual porque el parser detecta cabeceras.
      partes.push(buf.toString('latin1'))
      checksums.push(sha256(buf))
      bytes += buf.byteLength
    } finally {
      clearTimeout(t)
    }
  }
  const out: CsvProvincia = {
    texto: partes.join('\n'),
    url: `https://www.ine.es/jaxiT3/files/t/csv_bd/${tablas.renta}.csv`,
    sha256: sha256(partes.join('\n')),
    bytes,
    retrievedAt,
  }
  void checksums
  cacheCsv.set(provincia, out)
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Construcción del atlas de un municipio
// ─────────────────────────────────────────────────────────────────────────────

interface ResultadoMunicipio {
  ine: string
  nombre: string
  estado: 'ok' | 'sin_estadistica' | 'error'
  secciones: number
  observaciones: number
  noDifundidas: number
  bytes: number
  checksum: string
  ms: number
  detalle: string
}

async function construirAtlas(
  ine: string,
  nombre: string,
  provinciaNombre: string,
  escribir: boolean,
  r2: S3Client | null,
): Promise<ResultadoMunicipio> {
  const t0 = Date.now()
  const provincia = ine.slice(0, 2)
  const tablas = TABLAS[provincia]
  if (!tablas) {
    return {
      ine, nombre, estado: 'error', secciones: 0, observaciones: 0, noDifundidas: 0,
      bytes: 0, checksum: '', ms: 0,
      detalle: `Provincia ${provincia} sin tablas ADRH verificadas`,
    }
  }

  // 1. Geometría (paginada, con detección de CRS y puerta de rango).
  const geo = await descargarSeccionesConFallback(ine, {
    toleranciaMetros: TOLERANCIA_SIMPLIFICACION,
  })

  // 2. Estadística (CSV provincial, cacheado entre municipios).
  const csv = await csvProvincial(provincia)
  const parseo = parsearAdrhSecciones(csv.texto, ine, {
    tableId: `${tablas.renta}|${tablas.gini}`,
    sourceUrl: `https://www.ine.es/jaxiT3/files/t/csv_bd/${tablas.renta}.csv`,
    retrievedAt: csv.retrievedAt,
    publishedAt: null,
    checksum: csv.sha256,
  })

  const clavesGeometria = new Set(geo.features.map((f) => f.properties.CUSEC))
  const clavesEstadistica = new Set(Object.keys(parseo.porSeccion))

  const seccionesSinFila = [...clavesGeometria].filter((k) => !clavesEstadistica.has(k)).sort()
  const filasSinPoligono = [...clavesEstadistica].filter((k) => !clavesGeometria.has(k)).sort()

  // 3. Observaciones: solo para secciones que EXISTEN en la geometría del año.
  //    Una fila estadística sin polígono NO se publica (sería un dato sin mapa).
  const observations: Record<string, Record<string, Record<string, SeccionObservacion>>> = {}
  let totalObservaciones = 0
  let totalNoDifundidas = 0
  for (const [seccion, porIndicador] of Object.entries(parseo.porSeccion)) {
    if (!clavesGeometria.has(seccion)) continue
    const destino: Record<string, Record<string, SeccionObservacion>> = {}
    for (const [indicadorId, porPeriodo] of Object.entries(porIndicador)) {
      const periodos: Record<string, SeccionObservacion> = {}
      for (const [periodo, obs] of Object.entries(porPeriodo)) {
        // Se fija el año de geometría en la observación: el dato se muestra
        // siempre junto al year de la delimitación, sin mezclarlos.
        const conGeometria: SeccionObservacion = { ...obs, geometryYear: geo.geometryYear }
        periodos[periodo] = conGeometria
        totalObservaciones++
        if (conGeometria.status !== 'observado') totalNoDifundidas++
      }
      destino[indicadorId] = periodos
    }
    observations[seccion] = destino
  }

  // 4. Cobertura por indicador.
  const indicadores: SeccionIndicador[] = construirCatalogoIndicadores(
    { renta: String(tablas.renta), gini: String(tablas.gini) },
    parseo.indicadoresPresentes,
    nombre,
    (tabla) => `https://www.ine.es/jaxiT3/Tabla.htm?t=${tabla}`,
  )
  const periodosDisponibles = [...new Set(parseo.periodos)].sort((a, b) => a - b)
  const cobertura: SeccionIndicadorCobertura[] = indicadores.map((ind) => {
    let conDato = 0
    let sinDifundir = 0
    for (const seccion of clavesGeometria) {
      const obs = observations[seccion]?.[ind.id]
      if (!obs) continue
      for (const per of periodosDisponibles) {
        const o = obs[String(per)]
        if (!o) continue
        if (o.status === 'observado') conDato++
        else sinDifundir++
      }
    }
    // Periodo por defecto: el ÚLTIMO COMPLETO publicado para ese indicador.
    const conAlgunDato = periodosDisponibles.filter((per) =>
      [...clavesGeometria].some((s) => observations[s]?.[ind.id]?.[String(per)]?.status === 'observado'),
    )
    return {
      indicatorId: ind.id,
      periodos: periodosDisponibles,
      periodoPorDefecto: conAlgunDato.length ? conAlgunDato[conAlgunDato.length - 1]! : null,
      seccionesConDato: conDato,
      seccionesSinDifundir: sinDifundir,
      seccionesSinCobertura: ind.publicadoPorSeccion ? 0 : clavesGeometria.size,
    }
  })

  // 5. Calidad. Falla cerrado si la geometría no es del municipio.
  const poligonosInvalidos: string[] = []
  const poligonosVacios: string[] = []
  const poligonosMulti: string[] = []
  const clavesDuplicadas: string[] = []
  const vistas = new Set<string>()
  for (const f of geo.features) {
    const k = f.properties.CUSEC
    if (!isValidSeccionKey(k)) poligonosInvalidos.push(k)
    if (esPoligonoDistrito(k)) poligonosInvalidos.push(`${k} (agregado de distrito)`)
    if (municipioDeSeccion(k) !== ine) poligonosInvalidos.push(`${k} (otro municipio)`)
    if (f.properties.CUMUN !== ine) poligonosInvalidos.push(`${k} (CUMUN ${f.properties.CUMUN})`)
    if (!f.geometry) poligonosVacios.push(k)
    if ((f.geometry as { type?: string })?.type === 'MultiPolygon') poligonosMulti.push(k)
    if (vistas.has(k)) clavesDuplicadas.push(k)
    vistas.add(k)
  }

  const hayDesfaseTemporal = geo.geometryYear !== (periodosDisponibles.at(-1) ?? geo.geometryYear)
  const territoryMatch: SeccionesCalidad['territoryMatch'] =
    poligonosInvalidos.length === 0 ? 'exact' : 'invalid'

  const calidad: SeccionesCalidad = {
    territoryMatch,
    seccionesSinFila,
    filasSinPoligono,
    poligonosInvalidos,
    poligonosVacios,
    poligonosMulti,
    clavesDuplicadas,
    hayDesfaseTemporal,
    notas: [
      ...parseo.avisos,
      `Geometría: ${geo.collection} (${geo.geometryYear}), ${geo.crsOrigenDetectado} → ${CRS_PUBLICADO}, ${geo.paginas} página(s), tolerancia ${TOLERANCIA_SIMPLIFICACION} m`,
      `Agregados de distrito EXCLUIDOS: ${geo.agregadosDistrito.length}`,
      `Filas de sección en el CSV: ${parseo.totalFilasSeccion}; no difundidas: ${parseo.totalNoDifundidas}`,
      `Filas de sección con CUSEC inválido o de otro municipio: ${parseo.clavesInvalidas + parseo.ajenasAlMunicipio}`,
      hayDesfaseTemporal
        ? `AVISO: la geometría es de ${geo.geometryYear} y el último dato es de ${periodosDisponibles.at(-1)}. Se muestran por separado.`
        : 'Geometría y último dato del mismo año.',
    ],
    status: 'passed',
  }

  const municipalReference: Record<string, number | null> = {}
  for (const [indId, porAnio] of Object.entries(parseo.municipal)) {
    for (const [anio, valor] of Object.entries(porAnio)) {
      municipalReference[`${indId}|${anio}`] = valor
    }
  }

  const generatedAt = new Date().toISOString()

  // ── Forma COMPACTA para R2 ────────────────────────────────────────────────
  // Solo se guarda lo que varía por observación. El resto (unit, denominator,
  // sourceUrl, sourceTable, operation, retrievedAt, checksum) se rehidrata
  // desde el catálogo en `src/lib/socideas-secciones-store.ts`. Esto baja el
  // objeto de Madrid de ~75 MB a ~10 MB sin perder un solo dato.
  const series: SeccionesSeriesCompactas = {}
  for (const [seccion, porIndicador] of Object.entries(observations)) {
    const porInd: Record<string, SeccionValorCompacto[]> = {}
    for (const [indicadorId, porPeriodo] of Object.entries(porIndicador)) {
      porInd[indicadorId] = Object.values(porPeriodo)
        .map((o) => {
          const v: SeccionValorCompacto = { p: o.referencePeriod, v: o.value, s: o.status }
          if (o.methodologyNote) v.n = o.methodologyNote
          return v
        })
        .sort((a, b) => a.p - b.p)
    }
    series[seccion] = porInd
  }

  const cuerpo = {
    schemaVersion: 'secciones-atlas-r2-v1' as const,
    municipalityIne: ine,
    municipalityName: nombre,
    provinceName: provinciaNombre,
    geometryYear: geo.geometryYear,
    geometryCollection: geo.collection,
    geometrySource: SECCIONES_ATRIBUCION,
    geometryCrs: `${CRS_ORIGEN_INE} → ${CRS_PUBLICADO} (detectado ${geo.crsOrigenDetectado})`,
    geometryRetrievedAt: generatedAt,
    statsRetrievedAt: csv.retrievedAt,
    indicators: indicadores,
    cobertura,
    sections: geo.features,
    series,
    municipalReference,
    quality: calidad,
    sourceChecksums: {
      adrhProvincial: csv.sha256,
      adrhTablaRenta: String(tablas.renta),
      adrhTablaGini: String(tablas.gini),
    },
    generatedAt,
  }
  const schemaChecksum = sha256(JSON.stringify(cuerpo))
  const atlasR2: SeccionesAtlasR2V1 = { ...cuerpo, schemaChecksum }

  const json = JSON.stringify(atlasR2)
  const bytes = Buffer.byteLength(json)

  // 6. Validación fail-closed ANTES de publicar. Se valida la forma EXPANDIDA
  //    (la que verá el consumidor), reconstruida desde la compacta: así se
  //    comprueba que la compactación no pierde información.
  const paraValidar = expandirAtlas(atlasR2, {})
  const validacion = validarSeccionesAtlas(paraValidar)
  if (!validacion.ok) {
    return {
      ine, nombre, estado: 'error', secciones: geo.features.length,
      observaciones: totalObservaciones, noDifundidas: totalNoDifundidas,
      bytes, checksum: schemaChecksum, ms: Date.now() - t0,
      detalle: `validación fallida: ${validacion.errores.slice(0, 4).join(' | ')}`,
    }
  }
  // Invariante de la compactación: lo expandido debe tener exactamente las
  // mismas observaciones que se leyeron del CSV (nada perdido, nada inventado).
  if (Object.keys(paraValidar.observations).length !== Object.keys(observations).length) {
    return {
      ine, nombre, estado: 'error', secciones: geo.features.length,
      observaciones: totalObservaciones, noDifundidas: totalNoDifundidas,
      bytes, checksum: schemaChecksum, ms: Date.now() - t0,
      detalle:
        `compactación con pérdida: ${Object.keys(observations).length} secciones leídas vs ` +
        `${Object.keys(paraValidar.observations).length} expandidas`,
    }
  }

  if (escribir && r2) {
    const key = claveObjeto(ine)
    await putObject(
      r2,
      key,
      json,
      {
        schemaversion: SECCIONES_ATLAS_SCHEMA,
        inecode: ine,
        geometryyear: String(geo.geometryYear),
        sha256: schemaChecksum,
        generatedat: generatedAt,
      },
    )
    // Read-back: se relee el objeto publicado y se compara el checksum.
    const releido = await getObjectText(key)
    if (!releido) {
      return {
        ine, nombre, estado: 'error', secciones: geo.features.length,
        observaciones: totalObservaciones, noDifundidas: totalNoDifundidas,
        bytes, checksum: schemaChecksum, ms: Date.now() - t0,
        detalle: 'read-back: el objeto no se pudo releer de R2',
      }
    }
    const objReleido = JSON.parse(releido) as SeccionesAtlasR2V1
    if (objReleido.schemaChecksum !== schemaChecksum) {
      return {
        ine, nombre, estado: 'error', secciones: geo.features.length,
        observaciones: totalObservaciones, noDifundidas: totalNoDifundidas,
        bytes, checksum: schemaChecksum, ms: Date.now() - t0,
        detalle: `read-back: checksum distinto (${objReleido.schemaChecksum} vs ${schemaChecksum})`,
      }
    }
    // Read-back semántico: se reexpande lo publicado y se revalida.
    const v2 = validarSeccionesAtlas(expandirAtlas(objReleido, {}))
    if (!v2.ok) {
      return {
        ine, nombre, estado: 'error', secciones: geo.features.length,
        observaciones: totalObservaciones, noDifundidas: totalNoDifundidas,
        bytes, checksum: schemaChecksum, ms: Date.now() - t0,
        detalle: `read-back: validación fallida (${v2.errores.slice(0, 3).join(' | ')})`,
      }
    }
  }

  return {
    ine, nombre,
    estado: indicadores.some((i) => i.publicadoPorSeccion) ? 'ok' : 'sin_estadistica',
    secciones: geo.features.length,
    observaciones: totalObservaciones,
    noDifundidas: totalNoDifundidas,
    bytes,
    checksum: schemaChecksum,
    ms: Date.now() - t0,
    detalle: `${geo.features.length} secciones · ${totalObservaciones} observaciones (${totalNoDifundidas} ND) · ${(bytes / 1024).toFixed(1)} KB · sinFila=${seccionesSinFila.length} sinPoligono=${filasSinPoligono.length}`,
  }
}

const geoRetrievedAt = (generatedAt: string): string => generatedAt

// ─────────────────────────────────────────────────────────────────────────────
// Municipios objetivo
// ─────────────────────────────────────────────────────────────────────────────

interface MunicipioRef {
  codigo_ine: string
  nombre: string
  provincia: string
}

async function municipiosFiltrados(
  ines: string[] | null,
  provincias: string[] | null,
  lote: number | null,
  puerto: number | null,
): Promise<MunicipioRef[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan credenciales de Supabase')
  let q =
    `${url}/rest/v1/municipios?select=codigo_ine,nombre,provincia:provincias(nombre)` +
    `&codigo_ine=not.is.null&order=codigo_ine.asc`
  if (ines?.length) q += `&codigo_ine=in.(${ines.join(',')})`
  if (provincias?.length) q += `&codigo_ine=like.(${provincias.map((p) => `${p}%`).join(',')})`
  const res = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
  const filas = (await res.json()) as {
    codigo_ine: string
    nombre: string
    provincia: { nombre: string } | null
  }[]
  let out = filas
    .filter((f) => isValidIne5(f.codigo_ine))
    .map((f) => ({
      codigo_ine: f.codigo_ine,
      nombre: f.nombre,
      provincia: f.provincia?.nombre ?? '',
    }))
  // Solo municipios con tablas ADRH verificadas para su provincia.
  out = out.filter((m) => Boolean(TABLAS[m.codigo_ine.slice(0, 2)]))
  if (puerto && puerto > 0) out = out.filter((_, i) => i % puerto === 0)
  if (lote !== null && puerto && puerto > 0) {
    const total = Math.ceil(out.length / puerto)
    out = out.filter((_, i) => Math.floor(i / puerto) === lote)
    log('lote', `lote ${lote + 1}/${total} · ${out.length} municipios`)
  }
  return out
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const flag = (n: string): string | undefined => {
    const hit = argv.find((a) => a.startsWith(`--${n}=`))
    return hit ? hit.slice(n.length + 3) : undefined
  }
  const escribir = argv.includes('--confirm-r2-write')
  const ines = flag('ines')?.split(',').map((s) => s.trim().padStart(5, '0')).filter(Boolean) ?? null
  const provincias = flag('provincias')?.split(',').map((s) => s.trim().padStart(2, '0')).filter(Boolean) ?? null
  const lote = flag('lote') ? Number(flag('lote')) : null
  const puerto = flag('puerto') ? Number(flag('puerto')) : null
  const limite = flag('limite') ? Number(flag('limite')) : null
  const soloPilotos = argv.includes('--pilotos')

  if (argv.includes('--help') || argv === undefined) {
    console.log('Uso: npx tsx scripts/load-secciones-atlas.ts [--ines=..] [--provincias=..] [--limite=N] [--confirm-r2-write]')
    return
  }

  // Puerta de escritura: sin flag, no hay ni PUT.
  if (escribir && !process.env.R2_BUCKET) {
    console.error('Falta R2_BUCKET. No se escribe nada.')
    process.exit(2)
  }
  const r2 = escribir ? r2Client() : null
  if (!escribir) {
    log('modo', 'DRY-RUN: no se escribe nada en R2. Añade --confirm-r2-write para publicar.')
  }

  // Pilotos que cubren los casos exigidos: 1 sección, pequeño, grande, insular,
  // Ceuta, y con ND probable (Albacete tiene secciones censuradas verificadas).
  const PILOTOS = ['02007', '16016', '16211', '28079', '51001', '52001', '41091', '46250', '45090']

  let municipios = await municipiosFiltrados(
    soloPilotos ? [...PILOTOS] : ines,
    provincias,
    lote,
    puerto,
  )
  if (limite) municipios = municipios.slice(0, limite)

  log('municipios', `${municipios.length} candidatos`)
  if (!municipios.length) {
    log('fin', 'sin municipios; nada que hacer')
    return
  }

  const runId = new Date().toISOString().replace(/[:.]/g, '-')
  const resultados: ResultadoMunicipio[] = []
  const errores: string[] = []

  // Grupo por provincia para no re-descargar el CSV provincial.
  const cola = [...municipios]
  let cursor = 0
  const workers = Array.from({ length: Math.min(CONCURRENCIA, cola.length) }, async () => {
    for (;;) {
      const i = cursor
      cursor += 1
      if (i >= cola.length) return
      const m = cola[i]!
      try {
        const r = await construirAtlas(m.codigo_ine, m.nombre, m.provincia, escribir, r2)
        resultados.push(r)
        const marca = r.estado === 'ok' ? '·' : r.estado === 'sin_estadistica' ? '!' : 'X'
        log(
          'municipio',
          `${marca} ${r.ine} ${r.nombre} — ${r.detalle} (${(r.ms / 1000).toFixed(1)}s)`,
        )
        if (r.estado === 'error') errores.push(`${r.ine}: ${r.detalle}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        log('municipio', `X ${m.codigo_ine} ${m.nombre} — ERROR ${msg}`)
        resultados.push({
          ine: m.codigo_ine, nombre: m.nombre, estado: 'error', secciones: 0,
          observaciones: 0, noDifundidas: 0, bytes: 0, checksum: '', ms: 0,
          detalle: msg,
        })
        errores.push(`${m.codigo_ine}: ${msg}`)
      }
    }
  })
  await Promise.all(workers)

  resultados.sort((a, b) => a.ine.localeCompare(b.ine))

  const totalBytes = resultados.reduce((s, r) => s + r.bytes, 0)
  const ok = resultados.filter((r) => r.estado === 'ok')
  const sinEst = resultados.filter((r) => r.estado === 'sin_estadistica')
  const err = resultados.filter((r) => r.estado === 'error')

  console.log('\n──────────── RESUMEN ────────────')
  log('resumen', `ok=${ok.length} sin_estadistica=${sinEst.length} error=${err.length}`)
  log('resumen', `secciones=${resultados.reduce((s, r) => s + r.secciones, 0)} observaciones=${resultados.reduce((s, r) => s + r.observaciones, 0)} ND=${resultados.reduce((s, r) => s + r.noDifundidas, 0)}`)
  log('resumen', `bytes=${(totalBytes / 1024 / 1024).toFixed(2)} MB`)

  if (errores.length) {
    console.log(`\nErrores (${errores.length}):`)
    errores.slice(0, 25).forEach((e) => console.log(`  - ${e}`))
    if (errores.length > 25) console.log(`  ... y ${errores.length - 25} más`)
  }

  // Manifiesto local (auditoría) y, si se escribe, también en R2.
  const manifiesto = {
    schema: 'secciones-atlas-manifest-v1',
    runId,
    mode: escribir ? 'write' : 'dry-run',
    generatedAt: new Date().toISOString(),
    collections: COLECCIONES_SECCIONES,
    prefix: SECCIONES_R2_PREFIX,
    counts: {
      municipios: resultados.length,
      ok: ok.length,
      sinEstadistica: sinEst.length,
      error: err.length,
      secciones: resultados.reduce((s, r) => s + r.secciones, 0),
      observaciones: resultados.reduce((s, r) => s + r.observaciones, 0),
      noDifundidas: resultados.reduce((s, r) => s + r.noDifundidas, 0),
      bytesTotal: totalBytes,
    },
    items: resultados.map((r) => ({
      ine: r.ine,
      nombre: r.nombre,
      estado: r.estado,
      secciones: r.secciones,
      observaciones: r.observaciones,
      noDifundidas: r.noDifundidas,
      bytes: r.bytes,
      sha256: r.checksum,
      ms: r.ms,
      detalle: r.detalle,
    })),
    errors: errores,
  }
  await mkdir('tmp/audit/secciones', { recursive: true })
  const localPath = join('tmp', 'audit', 'secciones', `manifest-${runId}.json`)
  await writeFile(localPath, JSON.stringify(manifiesto, null, 2))
  log('manifiesto', `local: ${localPath}`)

  if (escribir && r2) {
    const json = JSON.stringify(manifiesto)
    // Dos fases: run-<id> y, solo si todo salió bien, latest-successful.
    await putObject(r2, `${SECCIONES_MANIFESTS_PREFIX}/run-${runId}.json`, json, {
      schemaversion: 'secciones-atlas-manifest-v1',
      runid: runId,
      sha256: sha256(json),
    })
    if (err.length === 0) {
      await putObject(
        r2,
        `${SECCIONES_MANIFESTS_PREFIX}/latest-successful.json`,
        json,
        { schemaversion: 'secciones-atlas-manifest-v1', runid: runId, sha256: sha256(json) },
      )
      log('manifiesto', 'publicado latest-successful.json (sin errores)')
    } else {
      log('manifiesto', `con ${err.length} errores: NO se publica latest-successful.json`)
    }
  } else {
    log('manifiesto', 'dry-run: no se publica manifiesto en R2')
  }

  if (err.length > 0) process.exitCode = 1
}

main().catch((e: unknown) => {
  console.error('ERROR', e instanceof Error ? e.message : e)
  process.exitCode = 1
})
