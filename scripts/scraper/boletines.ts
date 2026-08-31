import { fetchWithRetry } from './fetch-with-retry'
import { logger } from './logger'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const OUTPUT_DIR = join(__dirname, '..', '..', 'data', 'raw')

const BOE_BASE = 'https://www.boe.es/datosabiertos/api/boe/leyes/'
const BOE_BROWSE = 'https://www.boe.es/boe/dias/'

const URBAN_KEYWORDS = [
  'urbanismo',
  'urbanística',
  'urbanístico',
  'planeamiento',
  'suelo',
  'edificación',
  'vivienda',
  'licencia',
  'avalúo',
  'expropiación',
  'plusvalía',
  'infraestructuras',
  'ordenación',
  'territorial',
  'ciudad',
  'municipal',
  'conservación',
  'rehabilitación',
  'regeneración',
  'renovación',
]

interface BOELaw {
  id: string
  titulo?: string | null
  fecha?: string | null
  uri?: string
}

interface ScrapeResult {
  totalLaws: number
  urbanLaws: BOELaw[]
  errors: string[]
  timestamp: string
}

function matchesUrbanKeywords(text: string): boolean {
  const lower = text.toLowerCase()
  return URBAN_KEYWORDS.some((kw) => lower.includes(kw))
}

async function fetchLawList(): Promise<BOELaw[]> {
  const allLaws: BOELaw[] = []

  logger.info('Fetching laws from BOE API...')

  try {
    const response = await fetchWithRetry(BOE_BASE)
    const contentType = response.headers.get('content-type') || ''

    if (contentType.includes('json')) {
      const data = await response.json()
      if (Array.isArray(data)) {
        for (const item of data) {
          allLaws.push({
            id: item.id || item.ID || '',
            titulo: item.titulo || item.Titulo || item.descripcion || '',
            fecha: item.fecha || item.Fecha || '',
            uri: item.uri || item.URI || '',
          })
        }
      }
    } else {
      const text = await response.text()
      logger.warn(`Non-JSON response from BOE API`, { contentType, preview: text.slice(0, 200) })
    }
  } catch (error) {
    logger.error(`BOE API failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  return allLaws
}

async function fetchBOEPage(date: string): Promise<string[]> {
  const url = `${BOE_BROWSE}${date}/boe_a.htm`
  try {
    const response = await fetchWithRetry(url)
    const html = await response.text()
    const links: string[] = []
    const regex = /href=["'](\/boe\/diario_boe\/[^"']+)["']/gi
    let match
    while ((match = regex.exec(html)) !== null) {
      links.push(`https://www.boe.es${match[1]}`)
    }
    return links
  } catch {
    return []
  }
}

async function fetchRecentBOEDays(days = 7): Promise<string[]> {
  const allLinks: string[] = []
  const now = new Date()

  for (let i = 0; i < days; i++) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
    const formatted = `${date.toISOString().slice(0, 4)}/${date.toISOString().slice(5, 7)}/${date.toISOString().slice(8, 10)}`

    logger.debug(`Fetching BOE page for ${formatted}`)
    const links = await fetchBOEPage(formatted)
    allLinks.push(...links)
    logger.debug(`  Found ${links.length} documents`)
  }

  return allLinks
}

function filterUrbanLaws(laws: BOELaw[]): BOELaw[] {
  return laws.filter((law) => {
    const text = [law.titulo, law.id].filter(Boolean).join(' ')
    return matchesUrbanKeywords(text)
  })
}

export async function scrapeBOE(): Promise<ScrapeResult> {
  logger.info('Starting BOE legislation scraper')
  ensureOutputDir()

  const errors: string[] = []
  const allLaws: BOELaw[] = []

  // Method 1: BOE API
  try {
    const apiLaws = await fetchLawList()
    allLaws.push(...apiLaws)
    logger.info(`API returned ${apiLaws.length} laws`)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    errors.push(`API: ${msg}`)
    logger.error(`API fetch failed: ${msg}`)
  }

  // Method 2: Direct page scraping
  try {
    const pageLinks = await fetchRecentBOEDays(7)
    for (const link of pageLinks) {
      if (!allLaws.some((l) => l.uri === link)) {
        allLaws.push({
          id: link.split('/').pop() || '',
          titulo: link,
          uri: link,
        })
      }
    }
    logger.info(`Page scraping found ${pageLinks.length} additional links`)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    errors.push(`Pages: ${msg}`)
    logger.error(`Page scraping failed: ${msg}`)
  }

  const urbanLaws = filterUrbanLaws(allLaws)
  logger.info(`Found ${urbanLaws.length} urban planning related laws out of ${allLaws.length} total`)

  const result: ScrapeResult = {
    totalLaws: allLaws.length,
    urbanLaws,
    errors,
    timestamp: new Date().toISOString(),
  }

  const outputPath = join(OUTPUT_DIR, `boe-urbanismo-${Date.now()}.json`)
  writeFileSync(outputPath, JSON.stringify(result, null, 2))
  logger.info(`Results saved to ${outputPath}`)

  return result
}

function ensureOutputDir() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true })
  }
}

async function main() {
  const result = await scrapeBOE()
  console.log(JSON.stringify(result, null, 2))
}

if (require.main === module) {
  main().catch((err) => {
    logger.error('BOE scraper failed', { error: err.message })
    process.exit(1)
  })
}
