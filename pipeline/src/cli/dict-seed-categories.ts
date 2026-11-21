import { resolve } from 'node:path'
import { readDictionary, writeDictionary } from '../mapping/dictionary.js'
import { seedStoreCategories } from '../mapping/magnum-categories.js'
import { mappingDir } from '../paths.js'
import { MAGNUM_SCOPE } from '../scrape/stores/magnum/scope.js'

const path = resolve(mappingDir(), 'dictionary.json')
const dict = readDictionary(path)
const next = seedStoreCategories(dict, 'MAGNUM', MAGNUM_SCOPE)
writeDictionary(path, next)
const before = Object.keys(dict.storeCategories).length
const after = Object.keys(next.storeCategories).length
console.log(`[dict:seed-categories] storeCategories ${before} → ${after}`)
