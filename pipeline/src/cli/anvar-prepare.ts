import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { CATEGORIES } from '../agent/taxonomy.js'
import { identity, readDictionary } from '../mapping/dictionary.js'
import { DEFAULT_PUBLISH_CATEGORIES } from '../mapping/scope.js'
import { buildCandidates, type MatchItem } from '../mapping/store-match.js'
import { REPO_ROOT, mappingDir, sourcesDir } from '../paths.js'
import { readSourceFile } from '../source-file.js'

// pnpm exec tsx src/cli/anvar-prepare.ts — задания для субагентов Haiku: data/agent/anvar-match/batch-NNN.json + prompt.md
const USAGE = 'usage: pnpm exec tsx src/cli/anvar-prepare.ts'
const fail = (msg: string): never => { console.error(`[anvar:prepare] ${msg}`); process.exit(2) }
try { if (parseArgs({ allowPositionals: true, options: {} }).positionals.length > 0) fail(USAGE) } catch (e) { fail(`${(e as Error).message}\n${USAGE}`) }

const BATCH_SIZE = 40
const matchDir = () => resolve(REPO_ROOT, 'data/agent/anvar-match')

const file = readSourceFile(resolve(sourcesDir(), 'anvar.json'))
if (file.storeCode !== 'ANVAR') fail(`${file.storeCode} source file, expected ANVAR`)
const dict = readDictionary(resolve(mappingDir(), 'dictionary.json'))
const scope = new Set(DEFAULT_PUBLISH_CATEGORIES)

// Повторный запуск готовит только новые товары: уже сопоставленные (ANVAR:* в словаре) пропускаются
const items: MatchItem[] = file.products
  .filter((p) => !(identity('ANVAR', p.sourceProductId) in dict.products))
  .map((p) => ({ id: identity('ANVAR', p.sourceProductId), name: p.name, sourceCategoryPath: p.sourceCategoryPath, candidates: buildCandidates(dict, p.name, scope) }))

const dir = matchDir()
mkdirSync(dir, { recursive: true })
for (const f of readdirSync(dir)) if (/^batch-\d+(\.decisions)?\.json$/.test(f)) rmSync(resolve(dir, f))

let batches = 0
for (let i = 0; i < items.length; i += BATCH_SIZE) {
  batches++
  writeFileSync(resolve(dir, `batch-${String(batches).padStart(3, '0')}.json`), JSON.stringify(items.slice(i, i + BATCH_SIZE), null, 2), 'utf8')
}
const promptTemplate = readFileSync(resolve(import.meta.dirname, '../mapping/store-match-prompt.md'), 'utf8')
writeFileSync(resolve(dir, 'prompt.md'), promptTemplate.replace('{{CATEGORIES}}', CATEGORIES.map((c) => `- ${c.slug} — ${c.name}`).join('\n')), 'utf8')

const noCandidates = items.filter((i) => i.candidates.length === 0).length
console.log(`[anvar:prepare] ${items.length} items (skipped ${file.products.length - items.length} already in the dictionary), ${batches} batches → ${dir}`)
console.log(`[anvar:prepare] items without candidates: ${noCandidates} (${items.length ? ((noCandidates / items.length) * 100).toFixed(1) : '0.0'}%)`)
