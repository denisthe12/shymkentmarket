import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { readDictionary, writeDictionary } from '../mapping/dictionary.js'
import { applyDecisions, MatchDecisionSchema, validateDecisions, type MatchDecision, type MatchItem } from '../mapping/store-match.js'
import { agentDir, mappingDir } from '../paths.js'
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
if (batches.length === 0) fail(`no batch files, run ${prepare} first`)

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
if (values.check) { console.log(`[dict:apply-decisions] check ok: ${batches.length} batches, ${allItems.length} items`); process.exit(0) }

const path = resolve(mappingDir(), 'dictionary.json')
const { dict, stats } = applyDecisions(readDictionary(path), store, allItems, allDecisions)
writeDictionary(path, dict)
console.log('[dict:apply-decisions] applied', JSON.stringify(stats))
