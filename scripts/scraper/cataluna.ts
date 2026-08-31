import { XMLParser } from 'fast-xml-parser'
import { fetchWithRetry } from './fetch-with-retry'
import { logger } from './logger'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const OUTPUT_DIR = join(__dirname, '..', '..', 'data', 'raw')

const CATALONIA_WMS = 'https://sig.gencat.cat/ows/PLANEJAMENT/wms'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: true,
})

interface CataloniaLayer {
  name: string
  title: string
  abstract?: string
  queryable: boolean
  crs?: string[]
  boundingBox?: { minx: number; miny: number; maxx: number; maxy: number }
}

interface CataloniaCapabilities {
  serviceTitle?: string
  serviceAbstract?: string
  layers: CataloniaLayer[]
  onlineResource?: string
  fees?: string
  accessConstraints?: string
}

function parseBoundingBox(bb: Record<string, string> | undefined): CataloniaLayer['boundingBox'] {
  if (!bb) return undefined
  return {
    minx: parseFloat(bb['@_minx'] || '0'),
    miny: parseFloat(bb['@_miny'] || '0'),
    maxx: parseFloat(bb['@_maxx'] || '0'),
    maxy: parseFloat(bb['@_maxy'] || '0'),
  }
}

function parseCapabilities(xml: string): CataloniaCapabilities {
  const parsed = parser.parse(xml)

  const wms = parsed?.WMS_Capabilities || parsed?.WMT_MS_Capabilities || {}
  const service = wms?.Service || {}
  const capability = wms?.Capability || {}

  const serviceInfo = {
    serviceTitle: service?.Title || '',
    serviceAbstract: service?.Abstract || '',
    onlineResource: service?.OnlineResource?.['@_xlink:href'] || '',
    fees: service?.Fees || '',
    accessConstraints: service?.AccessConstraints || '',
  }

  const topLayer = capability?.Layer || {}
  const subLayers = topLayer?.Layer
  const layerItems = Array.isArray(subLayers) ? subLayers : subLayers ? [subLayers] : []

  const layers: CataloniaLayer[] = []

  for (const layer of layerItems) {
    const crsList = layer?.CRS || layer?.SRS || []
    const crs = Array.isArray(crsList) ? crsList : crsList ? [crsList] : []

    layers.push({
      name: layer?.Name || '',
      title: layer?.Title || '',
      abstract: layer?.Abstract || undefined,
      queryable: (layer as Record<string, unknown>)?.['@_queryable'] === '1',
      crs,
      boundingBox: parseBoundingBox(layer?.BoundingBox),
    })

    const innerLayers = layer?.Layer
    if (innerLayers) {
      const innerItems = Array.isArray(innerLayers) ? innerLayers : [innerLayers]
      for (const inner of innerItems) {
        const innerCrs = inner?.CRS || inner?.SRS || []
        const innerCrsArr = Array.isArray(innerCrs) ? innerCrs : innerCrs ? [innerCrs] : []

        layers.push({
          name: inner?.Name || '',
          title: inner?.Title || '',
          abstract: inner?.Abstract || undefined,
          queryable: (inner as Record<string, unknown>)?.['@_queryable'] === '1',
          crs: innerCrsArr,
          boundingBox: parseBoundingBox(inner?.BoundingBox),
        })
      }
    }
  }

  return { ...serviceInfo, layers }
}

async function fetchGetCapabilities(): Promise<string> {
  const url = `${CATALONIA_WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities`
  logger.info('Fetching Catalonia WMS GetCapabilities', { url })

  const response = await fetchWithRetry(url)
  return response.text()
}

async function probeLayer(layer: CataloniaLayer): Promise<{ ok: boolean; error?: string }> {
  if (!layer.name) return { ok: false, error: 'No layer name' }

  const url = `${CATALONIA_WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${layer.name}&CRS=EPSG:4326&BBOX=40.5,0.5,42.8,3.3&WIDTH=256&HEIGHT=256&FORMAT=image/png`

  try {
    const response = await fetchWithRetry(url, {}, 1, 500)
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` }
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length < 100) return { ok: false, error: 'Empty response' }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function scrapeCatalonia(): Promise<CataloniaCapabilities> {
  ensureOutputDir()
  logger.info('Starting Catalonia WMS scraper')

  const xml = await fetchGetCapabilities()
  const capabilities = parseCapabilities(xml)

  logger.info(`Parsed capabilities: ${capabilities.layers.length} layers`)

  if (capabilities.serviceTitle) {
    logger.info(`Service: ${capabilities.serviceTitle}`)
  }

  const urbanLayers = capabilities.layers.filter((l) => {
    const text = `${l.name} ${l.title} ${l.abstract || ''}`.toLowerCase()
    return (
      text.includes('urban') ||
      text.includes('planejament') ||
      text.includes('sòl') ||
      text.includes('parcel') ||
      text.includes('munici') ||
      text.includes('cadastr') ||
      text.includes('edific') ||
      text.includes('usos')
    )
  })

  logger.info(`Found ${urbanLayers.length} urban planning layers:`)
  for (const layer of urbanLayers) {
    logger.info(`  - ${layer.name}: ${layer.title}`)
  }

  const outputPath = join(OUTPUT_DIR, `catalonia-wms-${Date.now()}.json`)
  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        service: capabilities.serviceTitle,
        abstract: capabilities.serviceAbstract,
        url: CATALONIA_WMS,
        totalLayers: capabilities.layers.length,
        urbanLayers,
        allLayers: capabilities.layers,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  )
  logger.info(`Results saved to ${outputPath}`)

  return capabilities
}

function ensureOutputDir() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true })
  }
}

async function main() {
  const capabilities = await scrapeCatalonia()

  console.log('\n=== CATALONIA WMS CAPABILITIES ===')
  console.log(`Service: ${capabilities.serviceTitle}`)
  console.log(`Total layers: ${capabilities.layers.length}`)
  console.log('\nUrban planning layers:')
  for (const layer of capabilities.layers) {
    const urban = `${layer.name} ${layer.title} ${layer.abstract || ''}`.toLowerCase().includes('urban') ||
      `${layer.name} ${layer.title}`.toLowerCase().includes('planejament')
    const marker = urban ? ' ★' : ''
    console.log(`  [${layer.queryable ? 'Q' : ' '}] ${layer.name}: ${layer.title}${marker}`)
  }
}

if (require.main === module) {
  main().catch((err) => {
    logger.error('Catalonia scraper failed', { error: err.message })
    process.exit(1)
  })
}
