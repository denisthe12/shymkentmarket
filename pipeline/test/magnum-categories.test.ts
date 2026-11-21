import { describe, expect, it } from 'vitest'
import { seedStoreCategories } from '../src/mapping/magnum-categories.js'
import { DictionarySchema, storeCategoryKey, type Dictionary } from '../src/mapping/dictionary.js'
import { MAGNUM_SCOPE } from '../src/scrape/stores/magnum/scope.js'

const empty = (): Dictionary =>
  DictionarySchema.parse({ version: 1, generatedAt: '2026-11-21T00:00:00.000Z', canonicals: {}, products: {}, storeCategories: {} })

describe('seedStoreCategories', () => {
  it('fills an empty dictionary with every Magnum scope leaf', () => {
    const d = seedStoreCategories(empty(), 'MAGNUM', MAGNUM_SCOPE)
    expect(Object.keys(d.storeCategories)).toHaveLength(38)
    expect(d.storeCategories['MAGNUM|Продукты / Молочные продукты, яйцо / Яйцо']).toBe('eggs')
    expect(d.storeCategories[storeCategoryKey('MAGNUM', ['Продукты', 'Мясо, птица', 'Говядина'])]).toBe('meat')
    expect(Object.keys(d.storeCategories).some((k) => k.endsWith(' '))).toBe(false)
  })
  it('does not overwrite an existing key and does not mutate the input', () => {
    const base = empty()
    const key = storeCategoryKey('MAGNUM', ['Продукты', 'Молочные продукты, яйцо', 'Яйцо'])
    base.storeCategories[key] = 'dairy'
    const d = seedStoreCategories(base, 'MAGNUM', MAGNUM_SCOPE)
    expect(d.storeCategories[key]).toBe('dairy')
    expect(Object.keys(d.storeCategories)).toHaveLength(38)
    expect(Object.keys(base.storeCategories)).toHaveLength(1)
  })
})
