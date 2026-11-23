import 'dotenv/config'
import { resolve } from 'node:path'
import { sourcesDir } from '../paths.js'
import { STORE_CODES, type SourceFile, type StoreCode } from '../types.js'
import { acceptScrape, parseScrapeArgs } from '../scrape/accept.js'
import { resolveStoreLimits, runStore } from '../scrape/core/index.js'
import { magnumModule } from '../scrape/stores/magnum/index.js'
import { assertMagnumCoverage } from '../scrape/stores/magnum/coverage.js'
import { MAGNUM_SCOPE } from '../scrape/stores/magnum/scope.js'
import { GRAMAD_SECTION_CAP, createGramadModule } from '../scrape/stores/gramad/index.js'
import { assertGramadCoverage } from '../scrape/stores/gramad/coverage.js'
import { GRAMAD_SCOPE } from '../scrape/stores/gramad/scope.js'
import { summarizeGramad } from '../scrape/stores/gramad/stats.js'
import { createFmartModule } from '../scrape/stores/fmart/index.js'
import { assertFmartCoverage } from '../scrape/stores/fmart/coverage.js'
import { FMART_SECTIONS } from '../scrape/stores/fmart/scope.js'

export type Scraper = {
  run: () => Promise<SourceFile>
  assertCoverage: (file: SourceFile) => void
}
const SCRAPERS: Partial<Record<StoreCode, Scraper>> = {
  // Скрап Magnum ограничен MAGNUM_SCOPE
  MAGNUM: {
    run: () => {
      const { concurrency, rps } = resolveStoreLimits(magnumModule.storeCode, magnumModule.limits, process.env)
      console.log(`[MAGNUM] mode: core (${MAGNUM_SCOPE.length} categories, concurrency ${concurrency}, rps ${rps})`)
      return runStore(magnumModule)
    },
    assertCoverage: assertMagnumCoverage,
  },
  // Модуль Gramad создаётся при запуске: ему нужна переменная GRAMAD_REQUEST_HEADERS
  GRAMAD: {
    run: async () => {
      const module = createGramadModule(process.env)
      const { concurrency, rps } = resolveStoreLimits(module.storeCode, module.limits, process.env)
      console.log(`[GRAMAD] mode: core (${GRAMAD_SCOPE.length} sections, concurrency ${concurrency}, rps ${rps})`)
      const file = await runStore(module)
      const { weighted, weightAmbiguous, cappedSections } = summarizeGramad(file)
      file.sourceStats.weighted = weighted
      file.sourceStats.weightAmbiguous = weightAmbiguous
      file.sourceStats.cappedSections = cappedSections.length
      console.log(`[GRAMAD] weighted ${weighted}, ambiguous weight ${weightAmbiguous}`)
      if (cappedSections.length > 0) {
        console.warn(`[GRAMAD] warning: ${cappedSections.length} section(s) reached the ${GRAMAD_SECTION_CAP}-product cap: ${cappedSections.join(', ')}`)
      }
      return file
    },
    assertCoverage: assertGramadCoverage,
  },
  // Модуль F-Mart создаётся при запуске: ему нужна переменная FMART_REQUEST_HEADERS
  FMART: {
    run: async () => {
      const { module, runStats } = createFmartModule(process.env)
      const { concurrency, rps } = resolveStoreLimits(module.storeCode, module.limits, process.env)
      console.log(`[FMART] mode: core (${FMART_SECTIONS.length} sections, concurrency ${concurrency}, rps ${rps})`)
      const file = await runStore(module)
      const stats = runStats()
      Object.assign(file.sourceStats, stats)
      console.log(
        `[FMART] weighted ${stats.weightedFlag}, fresh per kg ${stats.weightedFresh}, skipped: unavailable ${stats.skippedUnavailable}, ` +
        `piece per kg ${stats.skippedUnitKg}, fresh pieces ${stats.skippedFreshPiece}, excluded leaves ${stats.skippedExcludedLeaf}`,
      )
      if (stats.unknownLeaves !== '') {
        console.warn(`[FMART] warning: ${stats.unknownLeafProducts} product(s) of unknown leaves skipped: ${stats.unknownLeaves}`)
      }
      return file
    },
    assertCoverage: assertFmartCoverage,
  },
}

const args = parseScrapeArgs(process.argv.slice(2))
const code = args?.code as StoreCode
const scraper = STORE_CODES.includes(code) ? SCRAPERS[code] : undefined
if (!args || !scraper) { console.error(`usage: scrape <${Object.keys(SCRAPERS).join('|')}> [--accept-drop]`); process.exit(2) }
let file: SourceFile
try {
  file = await scraper.run()
} catch (err) {
  console.error(`[${code}] ${(err as Error).message}`)
  process.exit(1)
}
const out = resolve(sourcesDir(), `${code.toLowerCase()}.json`)
// Ошибка запроса, неполное покрытие или падение числа товаров — отказ, прежний файл сохраняется
try {
  acceptScrape(out, file, scraper.assertCoverage, { acceptDrop: args.acceptDrop })
} catch (err) {
  console.error(`[${code}] ${(err as Error).message}`)
  process.exit(1)
}
const withImage = file.products.filter((p) => p.imageUrl).length
console.log(`[${code}] ${file.products.length} products, images ${withImage}, errors ${file.errorCount} → ${out}`)
