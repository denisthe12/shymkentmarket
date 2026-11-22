import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { CATEGORIES } from '../agent/taxonomy.js'
import { buildBarcodeIndex, findBarcodePairs } from '../mapping/barcode-match.js'
import { weightedCardKeys } from '../mapping/card-weight.js'
import { identity, readDictionary } from '../mapping/dictionary.js'
import { DEFAULT_PUBLISH_CATEGORIES } from '../mapping/scope.js'
import { buildCandidates, type MatchItem } from '../mapping/store-match.js'
import { isVariableWeight } from '../mapping/weight.js'
import { agentDir, mappingDir, sourcesDir } from '../paths.js'
import { readSourceFile } from '../source-file.js'
import { STORE_CODES, type SourceFile, type StoreCode } from '../types.js'

// pnpm dict:prepare <STORE> — задания для субагентов: data/agent/<store>-match/batch-NNN.json + prompt.md
const USAGE = `usage: pnpm dict:prepare <${STORE_CODES.join('|')}> [--force]`
const fail = (msg: string): never => { console.error(`[dict:prepare] ${msg}`); process.exit(2) }
const { values, positionals } = (() => {
  try { return parseArgs({ allowPositionals: true, options: { force: { type: 'boolean', default: false } } }) } catch (e) { return fail(`${(e as Error).message}\n${USAGE}`) }
})()
const store = positionals[0] as StoreCode
if (positionals.length !== 1 || !STORE_CODES.includes(store)) fail(USAGE)

const BATCH_SIZE = 40
const PAIRS_FILE = 'barcode-pairs.json'
const lower = store.toLowerCase()
const sourcePath = resolve(sourcesDir(), `${lower}.json`)
const dictPath = resolve(mappingDir(), 'dictionary.json')
if (!existsSync(sourcePath)) fail(`${sourcePath} not found`)
if (!existsSync(dictPath)) fail(`${dictPath} not found`)

const file = readSourceFile(sourcePath)
if (file.storeCode !== store) fail(`${file.storeCode} source file, expected ${store}`)
const dict = readDictionary(dictPath)
const scope = new Set(DEFAULT_PUBLISH_CATEGORIES)

// Файлы источников других сетей, у которых есть товары в словаре, обязательны: по ним строятся штрихкоды и весовые карточки
const otherChains = STORE_CODES.filter((c) => c !== store && Object.keys(dict.products).some((id) => id.startsWith(`${c}:`)))
const others: SourceFile[] = otherChains.map((c) => {
  const p = resolve(sourcesDir(), `${c.toLowerCase()}.json`)
  if (!existsSync(p)) return fail(`${p} not found (${c} products are in the dictionary)`)
  const f = readSourceFile(p)
  if (f.storeCode !== c) return fail(`${f.storeCode} source file, expected ${c}: ${p}`)
  return f
})
const weightedCards = weightedCardKeys(dict, [file, ...others])

// Повторный запуск готовит только новые товары: уже сопоставленные (<STORE>:* в словаре) пропускаются
const fresh = file.products.filter((p) => !(identity(store, p.sourceProductId) in dict.products))
const { pairs, stats: barcodeStats } = findBarcodePairs(dict, store, fresh, buildBarcodeIndex(dict, others), weightedCards)
const paired = new Set(pairs.map((p) => p.id))
const items: MatchItem[] = fresh
  .filter((p) => !paired.has(identity(store, p.sourceProductId)))
  .map((p) => ({
    id: identity(store, p.sourceProductId), name: p.name, sourceCategoryPath: p.sourceCategoryPath,
    candidates: buildCandidates(dict, p.name, scope, 8, weightedCards), weighted: isVariableWeight(store, p),
  }))

const dir = resolve(agentDir(), `${lower}-match`)
mkdirSync(dir, { recursive: true })
// Готовые решения субагентов не удаляем молча: перезапись только с --force
const decisionFiles = readdirSync(dir).filter((f) => /^batch-\d+\.decisions\.json$/.test(f))
if (decisionFiles.length > 0 && !values.force) {
  fail(`${decisionFiles.length} decisions files already exist in ${dir}; apply them with pnpm dict:apply-decisions ${store}, or pass --force to delete them and re-prepare`)
}
for (const f of readdirSync(dir)) if (/^batch-\d+(\.decisions)?\.json$/.test(f) || f === PAIRS_FILE) rmSync(resolve(dir, f))
writeFileSync(resolve(dir, PAIRS_FILE), JSON.stringify(pairs, null, 2), 'utf8')
if (decisionFiles.length > 0) console.log(`[dict:prepare] --force: removed ${decisionFiles.length} decisions files`)

let batches = 0
for (let i = 0; i < items.length; i += BATCH_SIZE) {
  batches++
  writeFileSync(resolve(dir, `batch-${String(batches).padStart(3, '0')}.json`), JSON.stringify(items.slice(i, i + BATCH_SIZE), null, 2), 'utf8')
}
const promptTemplate = readFileSync(resolve(import.meta.dirname, '../mapping/store-match-prompt.md'), 'utf8')
writeFileSync(resolve(dir, 'prompt.md'), promptTemplate.replace('{{CATEGORIES}}', CATEGORIES.map((c) => `- ${c.slug} — ${c.name}`).join('\n')), 'utf8')

const noCandidates = items.filter((i) => i.candidates.length === 0).length
console.log(`[dict:prepare] ${items.length} items (skipped ${file.products.length - fresh.length} already in the dictionary), ${batches} batches → ${dir}`)
console.log(`[dict:prepare] items without candidates: ${noCandidates} (${items.length ? ((noCandidates / items.length) * 100).toFixed(1) : '0.0'}%)`)
console.log(`[dict:prepare] ${pairs.length} barcode pairs → ${resolve(dir, PAIRS_FILE)}`)
console.log(`[dict:prepare] ${JSON.stringify(barcodeStats)}`)
