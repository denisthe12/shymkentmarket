import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { readDictionary, writeDictionary } from '../mapping/dictionary.js'
import { applyDecisions, validateDecisions, type MatchDecision, type MatchItem } from '../mapping/store-match.js'
import { REPO_ROOT, mappingDir } from '../paths.js'

// pnpm exec tsx src/cli/anvar-apply.ts [--check] — проверка и применение batch-NNN.decisions.json к data/mapping/dictionary.json
const USAGE = 'usage: pnpm exec tsx src/cli/anvar-apply.ts [--check]'
const fail = (msg: string): never => { console.error(`[anvar:apply] ${msg}`); process.exit(2) }
const { values, positionals } = (() => {
  try { return parseArgs({ allowPositionals: true, options: { check: { type: 'boolean', default: false } } }) }
  catch (e) { return fail(`${(e as Error).message}\n${USAGE}`) }
})()
if (positionals.length > 0) fail(USAGE)

const dir = resolve(REPO_ROOT, 'data/agent/anvar-match')
if (!existsSync(dir)) fail(`${dir} not found, run pnpm exec tsx src/cli/anvar-prepare.ts first`)
const batches = readdirSync(dir).filter((f) => /^batch-\d+\.json$/.test(f)).sort()
if (batches.length === 0) fail('no batch files, run pnpm exec tsx src/cli/anvar-prepare.ts first')

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
    else { status = 'ok'; allItems.push(...items); allDecisions.push(...(decisions as MatchDecision[])) }
  }
  if (status !== 'ok') bad++
  console.log(`${name}: ${status}`)
}
if (bad > 0) { console.error(`[anvar:apply] ${bad} of ${batches.length} batches are not ok`); process.exit(1) }
if (values.check) { console.log(`[anvar:apply] check ok: ${batches.length} batches, ${allItems.length} items`); process.exit(0) }

const path = resolve(mappingDir(), 'dictionary.json')
const { dict, stats } = applyDecisions(readDictionary(path), 'ANVAR', allItems, allDecisions)
writeDictionary(path, dict)
console.log('[anvar:apply] applied', JSON.stringify(stats))
