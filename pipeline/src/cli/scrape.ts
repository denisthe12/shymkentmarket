import 'dotenv/config'
import { resolve } from 'node:path'
import { sourcesDir } from '../paths.js'
import { writeSourceFile } from '../source-file.js'
import { STORE_CODES, type SourceFile, type StoreCode } from '../types.js'
import { assertNoErrors, resolveStoreLimits, runStore } from '../scrape/core/index.js'
import { magnumModule } from '../scrape/stores/magnum/index.js'
import { assertMagnumCoverage } from '../scrape/stores/magnum/coverage.js'
import { MAGNUM_SCOPE } from '../scrape/stores/magnum/scope.js'

export type Scraper = () => Promise<SourceFile>
const SCRAPERS: Partial<Record<StoreCode, Scraper>> = {
  // Скрап Magnum ограничен MAGNUM_SCOPE
  MAGNUM: () => {
    const { concurrency, rps } = resolveStoreLimits(magnumModule.storeCode, magnumModule.limits, process.env)
    console.log(`[MAGNUM] mode: core (${MAGNUM_SCOPE.length} categories, concurrency ${concurrency}, rps ${rps})`)
    return runStore(magnumModule)
  },
}

const code = process.argv[2] as StoreCode
const scraper = STORE_CODES.includes(code) ? SCRAPERS[code] : undefined
if (!scraper) { console.error(`usage: scrape <${Object.keys(SCRAPERS).join('|')}>`); process.exit(2) }
let file: SourceFile
try {
  file = await scraper()
} catch (err) {
  console.error(`[${code}] ${(err as Error).message}`)
  process.exit(1)
}
const out = resolve(sourcesDir(), `${code.toLowerCase()}.json`)
// Любая ошибка запроса — отказ, прежний файл сохраняется
try {
  assertNoErrors(file)
  assertMagnumCoverage(file)
} catch (err) {
  console.error(`[${code}] ${(err as Error).message}`)
  process.exit(1)
}
writeSourceFile(out, file)
const withImage = file.products.filter((p) => p.imageUrl).length
console.log(`[${code}] ${file.products.length} products, images ${withImage}, errors ${file.errorCount} → ${out}`)
