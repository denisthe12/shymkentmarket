import { resolve } from 'node:path'
import type { CategorySlug } from '../agent/taxonomy.js'
import { readDictionary, writeDictionary } from '../mapping/dictionary.js'
import { seedStoreCategories } from '../mapping/magnum-categories.js'
import { mappingDir } from '../paths.js'
import { FMART_SCOPE } from '../scrape/stores/fmart/scope.js'
import { GRAMAD_SCOPE } from '../scrape/stores/gramad/scope.js'
import { MAGNUM_SCOPE } from '../scrape/stores/magnum/scope.js'
import { STORE_CODES, type StoreCode } from '../types.js'

// pnpm dict:seed-categories <STORE> — добавляет в data/mapping/dictionary.json ключи категорий сети из её scope (существующие не меняет)
const USAGE = `usage: pnpm dict:seed-categories <${STORE_CODES.join('|')}>`
const store = process.argv[2] as StoreCode
if (process.argv.length !== 3 || !STORE_CODES.includes(store)) { console.error(`[dict:seed-categories] ${USAGE}`); process.exit(2) }

const SCOPES: Record<StoreCode, readonly { path: readonly string[]; slug: CategorySlug }[]> = { MAGNUM: MAGNUM_SCOPE, GRAMAD: GRAMAD_SCOPE, FMART: FMART_SCOPE }

const path = resolve(mappingDir(), 'dictionary.json')
const dict = readDictionary(path)
const next = seedStoreCategories(dict, store, SCOPES[store])
writeDictionary(path, next)
const before = Object.keys(dict.storeCategories).length
const after = Object.keys(next.storeCategories).length
console.log(`[dict:seed-categories] ${store} storeCategories ${before} → ${after}`)
