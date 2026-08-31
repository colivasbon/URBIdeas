import { XMLParser } from 'fast-xml-parser'
import { fetchWithRetry } from './fetch-with-retry'
import { logger } from './logger'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'

const OUTPUT_DIR = join(__dirname, '..', '..', 'data', 'raw')

interface QualityCheckResult {
  source_type: 'legal' | 'geospatial'
  source_id: string
  source_name: string
  url: string
  url_responsive: boolean
  getcapabilities_valid: boolean
  layers_found: number
  layers_expected: number
  layers_added: string[]
  layers_removed: string[]
  http_status?: number
  error?: string
  timestamp: string
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
})

function parseLayerNames(xml: string): string[] {
  const parsed = parser.parse(xml)
  const wms = parsed?.WMS_Capabilities || parsed?.WMT_MS_Capabilities
  if (!wms) return []

  const capability = wms?.Capability
  if (!capability) return []

  const topLayer = capability?.Layer
  if (!topLayer) return []

  const subLayers = topLayer?.Layer
  const layerItems = Array.isArray(subLayers) ? subLayers : subLayers ? [subLayers] : []

  const names: string[] = []

  for (const layer of layerItems) {
    if (layer?.Name) names.push(layer.Name)
    const innerLayers = layer?.Layer
    if (innerLayers) {
      const innerItems = Array.isArray(innerLayers) ? innerLayers : [innerLayers]
      for (const inner of innerItems) {
        if (inner?.Name) names.push(inner.Name)
      }
    }
  }

  return names
}

async function checkURLResponsive(url: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const response = await fetchWithRetry(url, {}, 1, 5000)
    return { ok: response.ok, status: response.status }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function checkGetCapabilities(url: string): Promise<{ valid: boolean; layerCount: number; layers?: string[]; error?: string }> {
  try {
    const response = await fetchWithRetry(url, {}, 2, 5000)
    const xml = await response.text()

    if (xml.includes('ServiceException')) {
      return { valid: false, layerCount: 0, error: 'ServiceException returned' }
    }

    const layers = parseLayerNames(xml)
    return { valid: true, layerCount: layers.length, layers }
  } catch (error) {
    return { valid: false, layerCount: 0, error: error instanceof Error ? error.message : String(error) }
  }
}

function loadPreviousResults(): Map<string, string[]> {
  const map = new Map<string, string[]>()
  try {
    const files = join(OUTPUT_DIR, 'quality-check-history.json')
    if (existsSync(files)) {
      const data = JSON.parse(readFileSync(files, 'utf-8'))
      for (const entry of data) {
        map.set(entry.source_id, entry.layers || [])
      }
    }
  } catch {
    // Ignore errors
  }
  return map
}

function saveHistory(results: QualityCheckResult[]) {
  const historyPath = join(OUTPUT_DIR, 'quality-check-history.json')
  writeFileSync(historyPath, JSON.stringify(results, null, 2))
}

export async function runQualityCheck(services?: Array<{ id: string; name: string; url: string; capabilitiesUrl?: string }>): Promise<QualityCheckResult[]> {
  logger.info('Starting quality check')
  ensureOutputDir()

  const previousLayers = loadPreviousResults()

  const defaultServices = [
    { id: 'idee-ocupacion', name: 'IDEe Ocupación del Suelo', url: 'https://servicios.idee.es/wms-inspire/occupacion-suelo', capabilitiesUrl: 'https://servicios.idee.es/wms-inspire/occupacion-suelo?SERVICE=WMS&REQUEST=GetCapabilities' },
    { id: 'siu-ogc', name: 'SIU Servicios OGC', url: 'https://mapas.fomento.gob.es/arcgis/services/SIU/Servicios_OGC/MapServer/WFSServer', capabilitiesUrl: 'https://mapas.fomento.gob.es/arcgis/services/SIU/Servicios_OGC/MapServer/WFSServer?SERVICE=WFS&REQUEST=GetCapabilities' },
    { id: 'cataluna-planejament', name: 'SIG Planejament Catalunya', url: 'https://sig.gencat.cat/ows/PLANEJAMENT/wms', capabilitiesUrl: 'https://sig.gencat.cat/ows/PLANEJAMENT/wms?SERVICE=WMS&REQUEST=GetCapabilities' },
    { id: 'navarra-idena', name: 'IDENA Navarra', url: 'https://idena.navarra.es/ogc/wms', capabilitiesUrl: 'https://idena.navarra.es/ogc/wms?SERVICE=WMS&REQUEST=GetCapabilities' },
    { id: 'aragon-siua', name: 'SIUa WMS Aragón', url: 'https://icearagon.aragon.es/SIUa_WMS', capabilitiesUrl: 'https://icearagon.aragon.es/SIUa_WMS?SERVICE=WMS&REQUEST=GetCapabilities' },
    { id: 'asturias-rpgur', name: 'Visor RPGUR Asturias', url: 'http://visorrpgur.asturias.es:8090/geoserver/E79_ENTIDADES_URBANISTICAS/wms', capabilitiesUrl: 'http://visorrpgur.asturias.es:8090/geoserver/E79_ENTIDADES_URBANISTICAS/wms?SERVICE=WMS&REQUEST=GetCapabilities' },
    { id: 'cyl-idecyl', name: 'IDECyL Urbanismo', url: 'https://idecyl.jcyl.es/geoserver/urbanismo/wms', capabilitiesUrl: 'https://idecyl.jcyl.es/geoserver/urbanismo/wms?SERVICE=WMS&REQUEST=GetCapabilities' },
    { id: 'extremadura-iter', name: 'IDEEXTREMEDURA Urbanismo', url: 'https://ideextremadura.es/wms/iter', capabilitiesUrl: 'https://ideextremadura.es/wms/iter?SERVICE=WMS&REQUEST=GetCapabilities' },
    { id: 'galicia-siotuga', name: 'SIOTUGA Galicia', url: 'https://siotuga.xunta.gal/siotuga/urb', capabilitiesUrl: 'https://siotuga.xunta.gal/siotuga/urb?SERVICE=WMS&REQUEST=GetCapabilities' },
    { id: 'galicia-pol-planeamiento', name: 'POL Planeamiento Galicia', url: 'https://ideg.xunta.es/servizos/services/Ordenacion/POL_AD_PlaneamientoUrbanistico/MapServer/WmsServer', capabilitiesUrl: 'https://ideg.xunta.es/servizos/services/Ordenacion/POL_AD_PlaneamientoUrbanistico/MapServer/WmsServer?SERVICE=WMS&REQUEST=GetCapabilities' },
    { id: 'galicia-pol-usos', name: 'POL Usos Galicia', url: 'https://ideg.xunta.es/servizos/services/Ordenacion/POL_AD_Usos/MapServer/WmsServer', capabilitiesUrl: 'https://ideg.xunta.es/servizos/services/Ordenacion/POL_AD_Usos/MapServer/WmsServer?SERVICE=WMS&REQUEST=GetCapabilities' },
    { id: 'madrid-idem', name: 'IDEM Madrid', url: 'https://www.comunidad.madrid/cartografia/geoserver/ows', capabilitiesUrl: 'https://www.comunidad.madrid/cartografia/geoserver/ows?SERVICE=WMS&REQUEST=GetCapabilities' },
    { id: 'murcia-pla-urb', name: 'SIT Planeamiento Murcia', url: 'https://mapas-gis-inter.carm.es/geoserver/SIT_USU_PLA_URB_CARM/wms', capabilitiesUrl: 'https://mapas-gis-inter.carm.es/geoserver/SIT_USU_PLA_URB_CARM/wms?SERVICE=WMS&REQUEST=GetCapabilities' },
    { id: 'murcia-plu', name: 'SIT PLU Murcia', url: 'https://mapas-gis-inter.carm.es/geoserver/SIT_USU_PLU_CARM/wms', capabilitiesUrl: 'https://mapas-gis-inter.carm.es/geoserver/SIT_USU_PLU_CARM/wms?SERVICE=WMS&REQUEST=GetCapabilities' },
    { id: 'pais-vasco-plangintza', name: 'geoEuskadi Plangintza', url: 'https://www.geo.euskadi.eus/WMS_PLANGINTZA', capabilitiesUrl: 'https://www.geo.euskadi.eus/WMS_PLANGINTZA?SERVICE=WMS&REQUEST=GetCapabilities' },
  ]

  const servicesToCheck = services || defaultServices
  const results: QualityCheckResult[] = []

  for (const service of servicesToCheck) {
    logger.info(`Checking ${service.name}...`)

    const urlCheck = await checkURLResponsive(service.url)
    let capCheck = { valid: false, layerCount: 0, layers: [] as string[] | undefined, error: undefined as string | undefined }

    if (service.capabilitiesUrl) {
      capCheck = await checkGetCapabilities(service.capabilitiesUrl)
    }

    const previousLayerNames = previousLayers.get(service.id) || []
    const currentLayerNames = capCheck.layers || []

    const layersAdded = currentLayerNames.filter((l) => !previousLayerNames.includes(l))
    const layersRemoved = previousLayerNames.filter((l) => !currentLayerNames.includes(l))

    const result: QualityCheckResult = {
      source_type: 'geospatial',
      source_id: service.id,
      source_name: service.name,
      url: service.url,
      url_responsive: urlCheck.ok,
      getcapabilities_valid: capCheck.valid,
      layers_found: capCheck.layerCount,
      layers_expected: previousLayerNames.length,
      layers_added: layersAdded,
      layers_removed: layersRemoved,
      http_status: urlCheck.status,
      error: urlCheck.error || capCheck.error,
      timestamp: new Date().toISOString(),
    }

    results.push(result)

    const status = capCheck.valid ? '✓' : '✗'
    logger.info(`  ${status} ${service.name}: ${capCheck.layerCount} layers, URL ${urlCheck.ok ? 'OK' : 'FAIL'}`)
  }

  saveHistory(results)

  const outputPath = join(OUTPUT_DIR, `quality-check-${Date.now()}.json`)
  writeFileSync(outputPath, JSON.stringify(results, null, 2))
  logger.info(`Quality check results saved to ${outputPath}`)

  return results
}

function ensureOutputDir() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true })
  }
}

async function main() {
  const results = await runQualityCheck()

  console.log('\n=== QUALITY CHECK RESULTS ===\n')
  let issues = 0
  for (const result of results) {
    const status = result.getcapabilities_valid ? '✓' : '✗'
    const urlStatus = result.url_responsive ? 'URL OK' : 'URL FAIL'
    console.log(`${status} ${result.source_name}: ${result.layers_found} layers, ${urlStatus}`)

    if (result.layers_added.length > 0) {
      console.log(`    + ${result.layers_added.length} new layers`)
    }
    if (result.layers_removed.length > 0) {
      console.log(`    - ${result.layers_removed.length} removed layers`)
    }
    if (result.error) {
      console.log(`    ! Error: ${result.error}`)
      issues++
    }
  }

  console.log(`\nTotal issues: ${issues}/${results.length}`)
}

if (require.main === module) {
  main().catch((err) => {
    logger.error('Quality check failed', { error: err.message })
    process.exit(1)
  })
}
