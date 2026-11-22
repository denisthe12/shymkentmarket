import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { applyBarcodePairs, BarcodePairSchema, type BarcodePair } from '../mapping/barcode-match.js'
import { readDictionary, writeDictionary } from '../mapping/dictionary.js'
import { applyDecisions, MatchDecisionSchema, validateDecisions, type MatchDecision, type MatchItem } from '../mapping/store-match.js'
import { agentDir, mappingDir, sourcesDir } from '../paths.js'
import { readSourceFile } from '../source-file.js'
import { STORE_CODES, type StoreCode } from '../types.js'

// pnpm dict:apply-decisions <STORE> [--check] — проверка и применение batch-NNN.decisions.json к data/mapping/dictionary.json
const USAGE = `usage: pnpm dict:apply-decisions <${STORE_CODES.join('|')}> [--check]`
const fail = (msg: string): never => { console.error(`[dict:apply-decisions] ${msg}`); process.exit(2) }
const { values, positionals } = (() => {
  try { return parseArgs({ allowPositionals: true, options: { check: { type: 'boolean', default: false } } }) }
  catch (e) { return fail(`${(e as Error).message}\n${USAGE}`) }
})()
const store = positionals[0] as StoreCode
if (positionals.length !== 1 || !STORE_CODES.includes(store)) fail(USAGE)

const lower = store.toLowerCase()
const prepare = `pnpm dict:prepare ${store}`
const dir = resolve(agentDir(), `${lower}-match`)
if (!existsSync(dir)) fail(`${dir} not found, run ${prepare} first`)
const batches = readdirSync(dir).filter((f) => /^batch-\d+\.json$/.test(f)).sort()

// Пары по штрихкоду (их готовит dict:prepare); нет файла — пар нет
const pairsPath = resolve(dir, 'barcode-pairs.json')
let pairs: BarcodePair[] = []
if (existsSync(pairsPath)) {
  try { pairs = BarcodePairSchema.array().parse(JSON.parse(readFileSync(pairsPath, 'utf8'))) }
  catch (e) { fail(`barcode-pairs.json is invalid: ${(e as Error).message}`) }
}
if (batches.length === 0 && pairs.length === 0) fail(`no batch files, run ${prepare} first`)

const allItems: MatchItem[] = []
const allDecisions: MatchDecision[] = []
let bad = 0
for (const name of batches) {
  const items = JSON.parse(readFileSync(resolve(dir, name), 'utf8')) as MatchItem[]
  const decisionsPath = resolve(dir, name.replace('.json', '.decisions.json'))
  let status: string
  if (!existsSync(decisionsPath)) status = 'missing'
  else {
    let decisions: unknown
    try { decisions = JSON.parse(readFileSync(decisionsPath, 'utf8')) } catch (e) { decisions = (e as Error).message }
    const problem = typeof decisions === 'string' ? `invalid JSON: ${decisions}` : validateDecisions(items, decisions)
    if (problem) status = `invalid: ${problem}`
    else {
      status = 'ok'
      allItems.push(...items)
      // повторный разбор схемой применяет trim и "" → null для brand
      allDecisions.push(...(decisions as unknown[]).map((d) => MatchDecisionSchema.parse(d)))
    }
  }
  if (status !== 'ok') bad++
  console.log(`${name}: ${status}`)
}
if (bad > 0) { console.error(`[dict:apply-decisions] ${bad} of ${batches.length} batches are not ok`); process.exit(1) }

// Пары и решения применяются в памяти до записи: любая ошибка проверки оставляет словарь нетронутым
const path = resolve(mappingDir(), 'dictionary.json')
const sourcePath = resolve(sourcesDir(), `${lower}.json`)
if (pairs.length > 0) {
  if (!existsSync(sourcePath)) fail(`${sourcePath} not found, cannot verify barcode-pairs.json`)
  const current = new Set(readSourceFile(sourcePath).products.map((p) => `${store}:${p.sourceProductId}`))
  const stale = pairs.filter((p) => !current.has(p.id)).map((p) => p.id)
  if (stale.length > 0) { console.error(`[dict:apply-decisions] barcode-pairs.json: not products of the current ${store} source: ${stale.join(', ')}`); process.exit(1) }
}
let result
try {
  const withPairs = applyBarcodePairs(readDictionary(path), store, pairs)
  const decided = applyDecisions(withPairs.dict, store, allItems, allDecisions)
  result = { dict: decided.dict, barcodeAttached: withPairs.attached, stats: decided.stats }
} catch (e) {
  console.error(`[dict:apply-decisions] barcode-pairs.json / decisions do not apply: ${(e as Error).message}`)
  process.exit(1)
}
if (values.check) { console.log(`[dict:apply-decisions] check ok: ${batches.length} batches, ${allItems.length} items, ${pairs.length} barcode pairs`); process.exit(0) }

writeDictionary(path, result.dict)
console.log('[dict:apply-decisions] applied barcode pairs', JSON.stringify({ barcodeAttached: result.barcodeAttached }))
console.log('[dict:apply-decisions] applied', JSON.stringify(result.stats))
