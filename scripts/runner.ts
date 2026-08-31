// Main runner script for scheduled scraping tasks
// Run with: npx tsx scripts/runner.ts
import { discoverWmsEndpoints } from './scraper/wms-discovery'
import { logger } from './scraper/logger'

async function main() {
  logger.info('Starting scheduled scraping tasks...')
  
  try {
    logger.info('Running WMS discovery...')
    await discoverWmsEndpoints()
    logger.info('WMS discovery completed.')
  } catch (error) {
    logger.error('WMS discovery failed:', error)
  }
  
  logger.info('All tasks completed.')
}

main()
