import { XMLParser } from 'fast-xml-parser'
import { fetchWithRetry } from './fetch-with-retry'
import { logger } from './logger'

interface CCAAEndpoint {
  name: string
  urls: string[]
}

interface WMSLayer {
  name: string
  title: string
  abstract?: string
  queryable?: boolean
}

interface DiscoveryResult {
  ccaa: string
  url: string
  status: 'success' | 'error'
  layers?: WMSLayer[]
  error?: string
  timestamp: string
}

const CCAA_ENDPOINTS: CCAAEndpoint[] = [
  {
    name: 'Andalucía',
    urls: [
      'https://www.ideandalucia.es/wms/mta400v_ras?SERVICE=WMS&REQUEST=GetCapabilities',
      'https://www.ideandalucia.es/wms/mta100v?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
  },
  {
    name: 'Aragón',
    urls: [
      'https://servicios.arcgis.com/rnbLGQsFGs8dmAZj/arcgis/services/SIOSE_Aragon/MapServer/WMS?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
  },
  {
    name: 'Asturias',
    urls: [
      'https://www.asturias.es/sigiea/arcgis/services?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
  },
  {
    name: 'Baleares',
    urls: [
      'https://sqm.caib.es/sqms/wms?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
  },
  {
    name: 'Canarias',
    urls: [
      'https://idelectron.canarias.es/wms/ground?q=&SERVICE=WMS&REQUEST=GetCapabilities',
    ],
  },
  {
    name: 'Cantabria',
    urls: [
      'https://sitcantabria.cantabria.es/wms/CNT100?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
  },
  {
    name: 'Castilla y León',
    urls: [
      'https://servicios.jcyl.es/arcgis/services/Urbanismo/MapServer/WMSServer?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
  },
  {
    name: 'Castilla-La Mancha',
    urls: [
      'https://idekepler.jccm.es/arcgis/services/SIGCARRETEROS/MapServer/WMS?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
  },
  {
    name: 'Cataluña',
    urls: [
      'https://sig.gencat.cat/ows/PLANEJAMENT/wms?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
  },
  {
    name: 'Extremadura',
    urls: [
      'https://ideextremadura.es/wms/iter?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
  },
  {
    name: 'Galicia',
    urls: [
      'https://servizos.xunta.es/gw/wms/ign?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
  },
  {
    name: 'La Rioja',
    urls: [
      'https://www.larioja SIG.es/wms/8d5f7c8a-44c0-4626-8e39-4f41c051e1e2?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
  },
  {
    name: 'Madrid',
    urls: [
      'https://www.comunidad.madrid/cartografia/geoserver/ows?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
  },
  {
    name: 'Murcia',
    urls: [
      'https://mapas-gis-inter.carm.es/arcgis/services/SIGPAS/MapServer/WMS?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
  },
  {
    name: 'Navarra',
    urls: [
      'https://idena.navarra.es/ogc/wms?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
  },
  {
    name: 'País Vasco',
    urls: [
      'https://www.geo.euskadi.eus/mapserver/serviciossrs?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
  },
  {
    name: 'Valencia',
    urls: [
      'https://dadesobertes.gva.es/arcgis/services?SERVICE=WMS&REQUEST=GetCapabilities',
    ],
  },
]

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
})

function parseLayers(capabilitiesXml: string): WMSLayer[] {
  const parsed = parser.parse(capabilitiesXml)
  const layers: WMSLayer[] = []

  const capabilities = parsed?.WMS_Capabilities || parsed?.WMT_MS_Capabilities
  if (!capabilities) return layers

  const layerList =
    capabilities?.Capability?.Layer?.Layer ||
    capabilities?.Capability?.Layer

  if (!layerList) return layers

  const items = Array.isArray(layerList) ? layerList : [layerList]

  for (const layer of items) {
    const layerItems = layer?.Layer
    if (layerItems) {
      const subItems = Array.isArray(layerItems) ? layerItems : [layerItems]
      for (const sub of subItems) {
        layers.push({
          name: sub?.Name || 'unknown',
          title: sub?.Title || 'unknown',
          abstract: sub?.Abstract,
          queryable: (sub as Record<string, unknown>)?.['@_queryable'] === '1',
        })
      }
    } else {
      layers.push({
        name: layer?.Name || 'unknown',
        title: layer?.Title || 'unknown',
        abstract: layer?.Abstract,
        queryable: (layer as Record<string, unknown>)?.['@_queryable'] === '1',
      })
    }
  }

  return layers
}

async function probeWMSUrl(url: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetchWithRetry(url, {}, 2, 2000)
    const text = await response.text()
    if (text.includes('ServiceException') || text.includes('Error')) {
      return { ok: false, error: 'WMS ServiceException returned' }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function discoverCCAA(ccaa: CCAAEndpoint): Promise<DiscoveryResult> {
  logger.info(`Probing ${ccaa.name}...`)

  for (const url of ccaa.urls) {
    logger.debug(`  Trying: ${url}`)
    const probe = await probeWMSUrl(url)

    if (!probe.ok) {
      logger.warn(`  Failed: ${probe.error}`)
      continue
    }

    try {
      const response = await fetchWithRetry(url)
      const xml = await response.text()
      const layers = parseLayers(xml)

      logger.info(`  Success: ${layers.length} layers found`, { url })
      return {
        ccaa: ccaa.name,
        url,
        status: 'success',
        layers,
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      logger.warn(`  Parse failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return {
    ccaa: ccaa.name,
    url: ccaa.urls[0],
    status: 'error',
    error: 'All endpoints failed',
    timestamp: new Date().toISOString(),
  }
}

export async function discoverAllWMS(): Promise<DiscoveryResult[]> {
  logger.info('Starting WMS discovery for all autonomous communities')
  const results: DiscoveryResult[] = []

  for (const ccaa of CCAA_ENDPOINTS) {
    const result = await discoverCCAA(ccaa)
    results.push(result)
  }

  const successful = results.filter((r) => r.status === 'success').length
  const failed = results.filter((r) => r.status === 'error').length
  logger.info(`Discovery complete: ${successful} success, ${failed} failed`)

  return results
}

async function main() {
  const results = await discoverAllWMS()
  console.log(JSON.stringify(results, null, 2))
}

if (require.main === module) {
  main().catch((err) => {
    logger.error('WMS discovery failed', { error: err.message })
    process.exit(1)
  })
}
