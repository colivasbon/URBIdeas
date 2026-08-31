import * as XLSX from 'xlsx'
import { fetchWithRetry } from './fetch-with-retry'
import { logger } from './logger'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const OUTPUT_DIR = join(__dirname, '..', '..', 'data', 'raw')

const SIU_URLS = [
  {
    name: 'Catálogo SIU - Generalitat de Catalunya',
    url: 'https://habitatge.gencat.cat/web/.content/home/arees-tematiques/habitatge-i-arquitectura/urbanisme/documentacio-tecnica/siu/',
  },
  {
    name: 'Actuaciones REAS - Ministerio de Vivienda',
    url: 'https://www.fomento.gob.es/MFOM/LAYES/LRRUA6_2008/mviiycob_RRC/02_Actuaciones_52_01mun_plan_esi.pdf',
  },
  {
    name: 'SIU - Portal de Datos Abiertos',
    url: 'https://datos.gob.es/dataset?q=urbanismo+SIU',
  },
  {
    name: 'Estadísticas de Urbanismo - Ministerio',
    url: 'https://www.fomento.gob.es/MFOM/LAYES/LRRUA6_2008/mviiycob_RRC/',
  },
]

interface SIUResult {
  source: string
  url: string
  status: 'success' | 'error' | 'partial'
  data?: Record<string, unknown>[]
  error?: string
  contentType?: string
  timestamp: string
}

function ensureOutputDir() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true })
  }
}

function parseExcelBuffer(buffer: Buffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const allData: Record<string, unknown>[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)
    for (const row of data) {
      allData.push({ ...row, _sheet: sheetName })
    }
  }

  return allData
}

async function fetchSIUSource(source: { name: string; url: string }): Promise<SIUResult> {
  logger.info(`Fetching: ${source.name}`, { url: source.url })

  try {
    const response = await fetchWithRetry(source.url)
    const contentType = response.headers.get('content-type') || ''
    const buffer = Buffer.from(await response.arrayBuffer())

    if (contentType.includes('spreadsheet') || contentType.includes('excel') || source.url.endsWith('.xls') || source.url.endsWith('.xlsx')) {
      const data = parseExcelBuffer(buffer)
      logger.info(`  Parsed ${data.length} rows from Excel`)
      return {
        source: source.name,
        url: source.url,
        status: 'success',
        data,
        contentType,
        timestamp: new Date().toISOString(),
      }
    }

    if (contentType.includes('pdf')) {
      logger.warn(`  PDF received (cannot parse inline)`, { size: buffer.length })
      return {
        source: source.name,
        url: source.url,
        status: 'partial',
        error: `PDF received (${buffer.length} bytes) - requires dedicated PDF parser`,
        contentType,
        timestamp: new Date().toISOString(),
      }
    }

    if (contentType.includes('json')) {
      const json = JSON.parse(buffer.toString('utf-8'))
      const data = Array.isArray(json) ? json : [json]
      logger.info(`  Parsed ${data.length} JSON records`)
      return {
        source: source.name,
        url: source.url,
        status: 'success',
        data,
        contentType,
        timestamp: new Date().toISOString(),
      }
    }

    if (contentType.includes('html')) {
      const html = buffer.toString('utf-8')
      const links = extractDownloadLinks(html)
      logger.info(`  HTML page with ${links.length} download links`)
      return {
        source: source.name,
        url: source.url,
        status: 'partial',
        data: links.map((l) => ({ link: l })) as unknown as Record<string, unknown>[],
        contentType,
        timestamp: new Date().toISOString(),
      }
    }

    const text = buffer.toString('utf-8')
    if (text.includes(',') || text.includes('\t')) {
      const workbook = XLSX.read(text, { type: 'string' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)
      logger.info(`  Parsed ${data.length} rows from CSV/text`)
      return {
        source: source.name,
        url: source.url,
        status: 'success',
        data,
        contentType,
        timestamp: new Date().toISOString(),
      }
    }

    logger.warn(`  Unknown content type: ${contentType}`)
    return {
      source: source.name,
      url: source.url,
      status: 'partial',
      error: `Unsupported content type: ${contentType}`,
      contentType,
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.error(`  Failed: ${msg}`)
    return {
      source: source.name,
      url: source.url,
      status: 'error',
      error: msg,
      timestamp: new Date().toISOString(),
    }
  }
}

function extractDownloadLinks(html: string): string[] {
  const links: string[] = []
  const regex = /href=["']([^"']*\.(pdf|xlsx?|csv|ods))["']/gi
  let match
  while ((match = regex.exec(html)) !== null) {
    links.push(match[1])
  }
  return links
}

export async function fetchAllSIU(): Promise<SIUResult[]> {
  logger.info('Starting SIU Ministerio data fetch')
  ensureOutputDir()

  const results: SIUResult[] = []

  for (const source of SIU_URLS) {
    const result = await fetchSIUSource(source)
    results.push(result)
  }

  const outputPath = join(OUTPUT_DIR, `siu-ministerio-${Date.now()}.json`)
  writeFileSync(outputPath, JSON.stringify(results, null, 2))
  logger.info(`Results saved to ${outputPath}`)

  return results
}

async function main() {
  const results = await fetchAllSIU()
  console.log(JSON.stringify(results, null, 2))
}

if (require.main === module) {
  main().catch((err) => {
    logger.error('SIU fetch failed', { error: err.message })
    process.exit(1)
  })
}
