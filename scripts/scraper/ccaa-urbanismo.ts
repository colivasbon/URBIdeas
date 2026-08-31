import { XMLParser } from 'fast-xml-parser'
import { fetchWithRetry } from './fetch-with-retry'
import { logger } from './logger'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const OUTPUT_DIR = join(__dirname, '..', '..', 'data', 'raw')

interface CCAAService {
  name: string
  ccaa: string
  scope: 'estatal' | 'autonomico' | 'provincial' | 'municipal' | 'insular'
  urls: string[]
  provider: string
  theme: string
  subtheme: string
  expectedKeywords: string[]
}

interface WMSLayer {
  name: string
  title: string
  abstract?: string
  queryable: boolean
  crs: string[]
  boundingBox?: { minx: number; miny: number; maxx: number; maxy: number }
  infoFormats?: string[]
  legendUrl?: string
}

interface ProbeResult {
  ccaa: string
  serviceName: string
  url: string
  status: 'success' | 'error' | 'partial'
  layers?: WMSLayer[]
  urbanLayers?: WMSLayer[]
  error?: string
  timestamp: string
}

const CCAA_SERVICES: CCAAService[] = [
  // ESTATALES
  {
    name: 'IDEe Ocupación del Suelo',
    ccaa: 'España',
    scope: 'estatal',
    urls: [
      'https://servicios.idee.es/wms-inspire/occupacion-suelo?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
    provider: 'IGN - Instituto Geográfico Nacional',
    theme: 'land_cover',
    subtheme: 'ocupacion_suelo',
    expectedKeywords: ['siose', 'ocupacion', 'land_use', 'land_cover', 'inspire', 'suelo'],
  },
  {
    name: 'SIU Servicios OGC',
    ccaa: 'España',
    scope: 'estatal',
    urls: [
      'https://mapas.fomento.gob.es/arcgis/services/SIU/Servicios_OGC/MapServer/WFSServer?SERVICE=WFS&REQUEST=GetCapabilities',
    ],
    provider: 'Ministerio de Transportes',
    theme: 'urbanismo',
    subtheme: 'siu',
    expectedKeywords: ['siu', 'urbanismo', 'suelo'],
  },
  // AUTONÓMICOS
  {
    name: 'IDEAndalucía MTA400v',
    ccaa: 'Andalucía',
    scope: 'autonomico',
    urls: [
      'https://www.ideandalucia.es/wms/mta400v_ras?SERVICE=WMS&REQUEST=GetCapabilities',
      'https://www.ideandalucia.es/wms/mta100v?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
    provider: 'IECA',
    theme: 'clasificacion_suelo',
    subtheme: 'planeamiento',
    expectedKeywords: ['urban', 'suelo', 'clasificacion', 'planeamiento', 'suelo'],
  },
  {
    name: 'SIUa WMS Aragón',
    ccaa: 'Aragón',
    scope: 'autonomico',
    urls: [
      'https://icearagon.aragon.es/SIUa_WMS?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
    provider: 'Gobierno de Aragón / ICE',
    theme: 'urbanismo',
    subtheme: 'siua',
    expectedKeywords: ['urbanismo', 'suelo', 'siua', 'clasificacion', 'planeamiento'],
  },
  {
    name: 'SIOSE Aragón ArcGIS',
    ccaa: 'Aragón',
    scope: 'autonomico',
    urls: [
      'https://servicios.arcgis.com/rnbLGQsFGs8dmAZj/arcgis/services/SIOSE_Aragon/MapServer/WMS?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
    provider: 'Gobierno de Aragón',
    theme: 'land_cover',
    subtheme: 'siose',
    expectedKeywords: ['siose', 'suelo', 'ocupacion', 'land'],
  },
  {
    name: 'Visor RPGUR Entidades Urbanísticas Asturias',
    ccaa: 'Asturias',
    scope: 'autonomico',
    urls: [
      'http://visorrpgur.asturias.es:8090/geoserver/E79_ENTIDADES_URBANISTICAS/wms?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
    provider: 'Gobierno del Principado de Asturias',
    theme: 'urbanismo',
    subtheme: 'entidades_urbanisticas',
    expectedKeywords: ['urban', 'entidades', 'sector', 'planeamiento'],
  },
  {
    name: 'SQM CAIB Baleares',
    ccaa: 'Islas Baleares',
    scope: 'autonomico',
    urls: [
      'https://sqm.caib.es/sqms/wms?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
    provider: 'CAIB',
    theme: 'land_cover',
    subtheme: 'siose',
    expectedKeywords: ['siose', 'suelo', 'ocupacion', 'land'],
  },
  {
    name: 'IDECAN Canarias',
    ccaa: 'Canarias',
    scope: 'autonomico',
    urls: [
      'https://idelectron.canarias.es/wms/ground?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
    provider: 'Gobierno de Canarias',
    theme: 'land_cover',
    subtheme: 'ocupacion_suelo',
    expectedKeywords: ['ground', 'suelo', 'ocupacion', 'land'],
  },
  {
    name: 'IDECAN Cantabria',
    ccaa: 'Cantabria',
    scope: 'autonomico',
    urls: [
      'https://sitcantabria.cantabria.es/wms/CNT100?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
    provider: 'Gobierno de Cantabria',
    theme: 'land_cover',
    subtheme: 'cartografia',
    expectedKeywords: ['urban', 'suelo', 'cartografia'],
  },
  {
    name: 'IDECyL Urbanismo',
    ccaa: 'Castilla y León',
    scope: 'autonomico',
    urls: [
      'https://idecyl.jcyl.es/geoserver/urbanismo/wms?SERVICE=WMS&REQUEST=GetCapabilities',
      'https://servicios.jcyl.es/arcgis/services/Urbanismo/MapServer/WMSServer?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
    provider: 'Junta de Castilla y León',
    theme: 'urbanismo',
    subtheme: 'clasificacion_suelo',
    expectedKeywords: ['urbanismo', 'suelo', 'clase', 'categoria', 'calificacion', 'sector'],
  },
  {
    name: 'IDEKepler CLM',
    ccaa: 'Castilla-La Mancha',
    scope: 'autonomico',
    urls: [
      'https://idekepler.jccm.es/arcgis/services/SIGCARRETEROS/MapServer/WMS?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
    provider: 'Junta de Comunidades de Castilla-La Mancha',
    theme: 'infraestructuras',
    subtheme: 'carreteras',
    expectedKeywords: ['urban', 'suelo', 'carretera'],
  },
  {
    name: 'SIG Planejament Catalunya',
    ccaa: 'Cataluña',
    scope: 'autonomico',
    urls: [
      'https://sig.gencat.cat/ows/PLANEJAMENT/wms?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
    provider: 'ICGC / Generalitat de Catalunya',
    theme: 'urbanismo',
    subtheme: 'planeamiento',
    expectedKeywords: ['planejament', 'urban', 'suelo', 'classificacio', 'qualificacio', 'sector'],
  },
  {
    name: 'IDEEXTREMEDURA Urbanismo',
    ccaa: 'Extremadura',
    scope: 'autonomico',
    urls: [
      'https://ideextremadura.es/wms/iter?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
    provider: 'Junta de Extremadura',
    theme: 'urbanismo',
    subtheme: 'clases_categorias',
    expectedKeywords: ['urbanismo', 'clase', 'categoria', 'calificacion', 'unidad', 'actuacion', 'suelo'],
  },
  {
    name: 'SIOTUGA Galicia',
    ccaa: 'Galicia',
    scope: 'autonomico',
    urls: [
      'https://siotuga.xunta.gal/siotuga/urb?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
    provider: 'Xunta de Galicia',
    theme: 'urbanismo',
    subtheme: 'siotuga',
    expectedKeywords: ['urbanismo', 'suelo', 'planeamiento', 'municipio'],
  },
  {
    name: 'POL Planeamiento Galicia',
    ccaa: 'Galicia',
    scope: 'autonomico',
    urls: [
      'https://ideg.xunta.es/servizos/services/Ordenacion/POL_AD_PlaneamientoUrbanistico/MapServer/WmsServer?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
    provider: 'Xunta de Galicia / IDEG',
    theme: 'urbanismo',
    subtheme: 'planeamiento',
    expectedKeywords: ['planeamiento', 'urbanismo', 'pol'],
  },
  {
    name: 'POL Usos Galicia',
    ccaa: 'Galicia',
    scope: 'autonomico',
    urls: [
      'https://ideg.xunta.es/servizos/services/Ordenacion/POL_AD_Usos/MapServer/WmsServer?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
    provider: 'Xunta de Galicia / IDEG',
    theme: 'usos_suelo',
    subtheme: 'usos',
    expectedKeywords: ['usos', 'suelo', 'land'],
  },
  {
    name: 'IDEM Madrid',
    ccaa: 'Comunidad de Madrid',
    scope: 'autonomico',
    urls: [
      'https://www.comunidad.madrid/cartografia/geoserver/ows?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
    provider: 'Gobierno de la Comunidad de Madrid',
    theme: 'land_cover',
    subtheme: 'cartografia',
    expectedKeywords: ['urban', 'suelo', 'cartografia', 'planeamiento'],
  },
  {
    name: 'SIT Planeamiento Murcia',
    ccaa: 'Región de Murcia',
    scope: 'autonomico',
    urls: [
      'https://mapas-gis-inter.carm.es/geoserver/SIT_USU_PLA_URB_CARM/wms?SERVICE=WMS&REQUEST=GetCapabilities',
      'https://mapas-gis-inter.carm.es/geoserver/SIT_USU_PLU_CARM/wms?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
    provider: 'CARM',
    theme: 'urbanismo',
    subtheme: 'planeamiento',
    expectedKeywords: ['planeamiento', 'urbano', 'plu', 'suelo'],
  },
  {
    name: 'IDENA Navarra',
    ccaa: 'Comunidad Foral de Navarra',
    scope: 'autonomico',
    urls: [
      'https://idena.navarra.es/ogc/wms?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
    provider: 'Gobierno de Navarra / IDENA',
    theme: 'urbanismo',
    subtheme: 'clasificacion_suelo',
    expectedKeywords: ['suelo', 'usos', 'sector', 'urbanismo', 'clasificacion'],
  },
  {
    name: 'geoEuskadi Plangintza',
    ccaa: 'País Vasco',
    scope: 'autonomico',
    urls: [
      'https://www.geo.euskadi.eus/WMS_PLANGINTZA?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
    provider: 'Gobierno Vasco',
    theme: 'urbanismo',
    subtheme: 'planeamiento',
    expectedKeywords: ['plangintza', 'planeamiento', 'urbanismo', 'suelo'],
  },
  {
    name: 'GeneRIGV Valencia',
    ccaa: 'Comunitat Valenciana',
    scope: 'autonomico',
    urls: [
      'https://dadesobertes.gva.es/arcgis/services?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
    provider: 'Generalitat Valenciana',
    theme: 'land_cover',
    subtheme: 'datos_abiertos',
    expectedKeywords: ['urban', 'suelo', 'planeamiento'],
  },
]

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
})

function parseBoundingBox(bb: Record<string, string> | undefined): WMSLayer['boundingBox'] {
  if (!bb) return undefined
  return {
    minx: parseFloat(bb['@_minx'] || '0'),
    miny: parseFloat(bb['@_miny'] || '0'),
    maxx: parseFloat(bb['@_maxx'] || '0'),
    maxy: parseFloat(bb['@_maxy'] || '0'),
  }
}

function parseCapabilities(xml: string): WMSLayer[] {
  const parsed = parser.parse(xml)
  const wms = parsed?.WMS_Capabilities || parsed?.WMT_MS_Capabilities
  if (!wms) return []

  const capability = wms?.Capability
  if (!capability) return []

  const topLayer = capability?.Layer
  if (!topLayer) return []

  const subLayers = topLayer?.Layer
  const layerItems = Array.isArray(subLayers) ? subLayers : subLayers ? [subLayers] : []

  const layers: WMSLayer[] = []

  for (const layer of layerItems) {
    const crsList = layer?.CRS || layer?.SRS || []
    const crs = Array.isArray(crsList) ? crsList : crsList ? [crsList] : []

    const infoFormatsList = layer?.InfoFormat || []
    const infoFormats = Array.isArray(infoFormatsList) ? infoFormatsList : infoFormatsList ? [infoFormatsList] : []

    layers.push({
      name: layer?.Name || '',
      title: layer?.Title || '',
      abstract: layer?.Abstract || undefined,
      queryable: (layer as Record<string, unknown>)?.['@_queryable'] === '1',
      crs,
      boundingBox: parseBoundingBox(layer?.BoundingBox),
      infoFormats,
      legendUrl: layer?.Style?.LegendURL?.['@_xlink:href'] || undefined,
    })

    const innerLayers = layer?.Layer
    if (innerLayers) {
      const innerItems = Array.isArray(innerLayers) ? innerLayers : [innerLayers]
      for (const inner of innerItems) {
        const innerCrs = inner?.CRS || inner?.SRS || []
        const innerCrsArr = Array.isArray(innerCrs) ? innerCrs : innerCrs ? [innerCrs] : []
        const innerInfoFormats = inner?.InfoFormat || []
        const innerInfoFormatsArr = Array.isArray(innerInfoFormats) ? innerInfoFormats : innerInfoFormats ? [innerInfoFormats] : []

        layers.push({
          name: inner?.Name || '',
          title: inner?.Title || '',
          abstract: inner?.Abstract || undefined,
          queryable: (inner as Record<string, unknown>)?.['@_queryable'] === '1',
          crs: innerCrsArr,
          boundingBox: parseBoundingBox(inner?.BoundingBox),
          infoFormats: innerInfoFormatsArr,
          legendUrl: inner?.Style?.LegendURL?.['@_xlink:href'] || undefined,
        })
      }
    }
  }

  return layers
}

function filterUrbanLayers(layers: WMSLayer[], keywords: string[]): WMSLayer[] {
  return layers.filter((layer) => {
    const text = `${layer.name} ${layer.title} ${layer.abstract || ''}`.toLowerCase()
    return keywords.some((kw) => text.includes(kw.toLowerCase()))
  })
}

async function probeService(service: CCAAService): Promise<ProbeResult> {
  logger.info(`Probing ${service.name} (${service.ccaa})...`)

  for (const url of service.urls) {
    logger.debug(`  Trying: ${url}`)
    try {
      const response = await fetchWithRetry(url, {}, 2, 5000)
      const xml = await response.text()

      if (xml.includes('ServiceException') || xml.includes('Error')) {
        logger.warn(`  ServiceException from ${url}`)
        continue
      }

      const layers = parseCapabilities(xml)
      if (layers.length === 0) {
        logger.warn(`  No layers found in ${url}`)
        continue
      }

      const urbanLayers = filterUrbanLayers(layers, service.expectedKeywords)

      logger.info(`  Success: ${layers.length} total layers, ${urbanLayers.length} urban layers`)

      return {
        ccaa: service.ccaa,
        serviceName: service.name,
        url,
        status: 'success',
        layers,
        urbanLayers,
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      logger.warn(`  Failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return {
    ccaa: service.ccaa,
    serviceName: service.name,
    url: service.urls[0],
    status: 'error',
    error: 'All endpoints failed',
    timestamp: new Date().toISOString(),
  }
}

export async function discoverAllCCAA(): Promise<ProbeResult[]> {
  logger.info('Starting CCAA urbanism WMS/WFS discovery')
  ensureOutputDir()

  const results: ProbeResult[] = []

  for (const service of CCAA_SERVICES) {
    const result = await probeService(service)
    results.push(result)
  }

  const successful = results.filter((r) => r.status === 'success').length
  const failed = results.filter((r) => r.status === 'error').length
  const totalUrbanLayers = results.reduce((acc, r) => acc + (r.urbanLayers?.length || 0), 0)

  logger.info(`Discovery complete: ${successful} success, ${failed} failed, ${totalUrbanLayers} urban layers found`)

  const outputPath = join(OUTPUT_DIR, `ccaa-urbanismo-${Date.now()}.json`)
  writeFileSync(outputPath, JSON.stringify(results, null, 2))
  logger.info(`Results saved to ${outputPath}`)

  return results
}

function ensureOutputDir() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true })
  }
}

async function main() {
  const results = await discoverAllCCAA()

  console.log('\n=== CCAA URBANISM DISCOVERY RESULTS ===\n')
  for (const result of results) {
    const status = result.status === 'success' ? '✓' : '✗'
    const urbanCount = result.urbanLayers?.length || 0
    console.log(`${status} ${result.ccaa} - ${result.serviceName}: ${urbanCount} urban layers`)

    if (result.urbanLayers && result.urbanLayers.length > 0) {
      for (const layer of result.urbanLayers.slice(0, 5)) {
        console.log(`    - ${layer.name}: ${layer.title}`)
      }
      if (result.urbanLayers.length > 5) {
        console.log(`    ... and ${result.urbanLayers.length - 5} more`)
      }
    }
  }
}

if (require.main === module) {
  main().catch((err) => {
    logger.error('CCAA discovery failed', { error: err.message })
    process.exit(1)
  })
}
