import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildBundle } from '../src/agent/bundle.js'
import { buildDictionary, canonicalKey, identity, readDictionary, resolveCategory, storeCategoryKey, writeDictionary } from '../src/mapping/dictionary.js'
import { cp, STORE_A, STORE_B, STORE_C } from './helpers.js'

const a = cp(STORE_B, '1', 'Молоко FoodMaster 3.2% 1 л', { volumeMl: 1000, fatPercent: 3.2 })
const b = cp(STORE_A, 'a_2', 'FoodMaster молоко 3,2% 1л', { volumeMl: 1000, fatPercent: 3.2 })
const s = cp(STORE_B, '3', 'Сахар 1 кг', { weightGrams: 1000 }, null, 'сахар')
a.product.sourceCategoryPath = ['Молоко, яйца, масло', 'Молоко']
b.product.sourceCategoryPath = ['Продукты питания']
s.product.sourceCategoryPath = ['Бакалея']
const sources = ([STORE_B, STORE_A, STORE_C]).map((x) => ({ storeCode: x, city: 'Shymkent' as const, capturedAt: '2026-10-06T06:00:00.000Z', errorCount: 0, sourceStats: {} }))
const bundle = buildBundle([
  { members: [a, b], method: 'ai', confidence: 0.97, review: 'approved' },
  { members: [s], method: 'deterministic', confidence: 1, review: 'approved' },
], sources, '2026-10-06T07:00:00.000Z')

describe('dictionary', () => {
  it('canonical key does not depend on member order', () => {
    expect(canonicalKey(['STORE_B:1', 'STORE_A:a_2'])).toBe(canonicalKey(['STORE_A:a_2', 'STORE_B:1']))
    expect(canonicalKey(['STORE_B:1'])).toMatch(/^c_[0-9a-f]{16}$/)
  })
  it('maps every bundle raw to its canonical, word order in names does not matter', () => {
    const d = buildDictionary(bundle)
    expect(Object.keys(d.products)).toHaveLength(3)
    expect(d.products[identity(STORE_B, '1')]).toBe(d.products[identity(STORE_A, 'a_2')])
    const milk = d.canonicals[d.products[identity(STORE_B, '1')]!]!
    expect(milk).toMatchObject({ name: bundle.canonicalProducts[0]!.canonicalName, category: 'milk', method: 'ai', review: 'approved', attributes: { volumeMl: 1000, fatPercent: 3.2 } })
  })
  it('learns store category → slug', () => {
    const d = buildDictionary(bundle)
    expect(d.storeCategories[storeCategoryKey(STORE_B, ['Молоко, яйца, масло', 'Молоко'])]).toBe('milk')
    expect(d.storeCategories[storeCategoryKey(STORE_B, ['Бакалея'])]).toBe('sugar')
  })
  it('writes a deterministic, diff-friendly file and reads it back', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'dict-')), 'dictionary.json')
    const d = buildDictionary(bundle)
    writeDictionary(path, d)
    const first = readFileSync(path, 'utf8')
    writeDictionary(path, readDictionary(path))
    expect(readFileSync(path, 'utf8')).toBe(first)
    expect(first.split('\n').filter((l) => l.includes('"STORE_B:1"'))).toHaveLength(1)
  })
  it('rejects a product pointing to a missing canonical', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'dict-')), 'dictionary.json')
    const d = buildDictionary(bundle)
    d.products['STORE_B:999'] = 'c_0000000000000000'
    writeDictionary(path, d)
    expect(() => readDictionary(path)).toThrow(/missing canonical/)
  })
})

describe('resolveCategory', () => {
  const d = buildDictionary(buildBundle([{ members: [a], method: 'deterministic', confidence: 1, review: 'approved' }], sources, '2026-10-06T06:00:00.000Z'))
  const base = { sourceProductId: 'new', sourceCategoryPath: ['Молоко, яйца, масло', 'Молоко'], name: 'Молоко FoodMaster 3.2% 1 л' }

  it('takes the canonical card first', () => {
    const r = resolveCategory(d, STORE_B, { sourceProductId: '1', sourceCategoryPath: ['Бакалея'], name: 'Молоко FoodMaster 3.2% 1 л' })
    expect(r.category).toBe('milk')
    expect(r.card?.name).toBeTruthy()
  })

  it('falls back to the store category, then to other', () => {
    expect(resolveCategory(d, STORE_B, base)).toEqual({ category: 'milk' })
    expect(resolveCategory(d, STORE_B, { ...base, sourceCategoryPath: ['Бакалея'] })).toEqual({ category: 'other' })
  })

  it('refines a milk store section by product name', () => {
    expect(resolveCategory(d, STORE_B, { ...base, name: 'Сливки Простоквашино 20% 500 г' }).category).toBe('dairy')
  })

  it('ignores a product entry whose canonical is missing', () => {
    const broken = { ...d, products: { ...d.products, 'STORE_B:new': 'c_missing' } }
    expect(resolveCategory(broken, STORE_B, base)).toEqual({ category: 'milk' })
  })
})
