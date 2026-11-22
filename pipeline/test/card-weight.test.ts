import { describe, expect, it } from 'vitest'
import { DictionarySchema } from '../src/mapping/dictionary.js'
import { weightedCardKeys } from '../src/mapping/card-weight.js'
import type { SourceFile, SourceProduct } from '../src/types.js'

const card = (name: string) => ({ name, brand: null, category: 'milk', attributes: {}, method: 'deterministic', confidence: 1, review: 'approved' })
const dict = DictionarySchema.parse({
  version: 1, generatedAt: '2026-10-05T20:42:51.173Z',
  canonicals: { c_loose: card('Яблоки'), c_pack: card('Молоко 1 л'), c_nofile: card('Сыр') },
  products: { 'MAGNUM:m1': 'c_loose', 'MAGNUM:m2': 'c_pack', 'GRAMAD:g1': 'c_pack', 'MAGNUM:gone': 'c_nofile' },
  storeCategories: {},
})
const product = (id: string, isWeighted: boolean): SourceProduct => ({
  sourceProductId: id, name: 'Товар', price: 100, oldPrice: null, imageUrl: null, sourceUrl: null, brand: null,
  sourceCategoryPath: [], rawPayload: { isWeighted },
})
const file = (storeCode: 'MAGNUM' | 'GRAMAD', products: SourceProduct[]): SourceFile =>
  ({ storeCode, city: 'Shymkent', capturedAt: '2026-11-22T00:00:00.000Z', errorCount: 0, sourceStats: {}, products })

describe('weightedCardKeys', () => {
  it('marks a card weighted when one of its source products is weighted', () => {
    const keys = weightedCardKeys(dict, [file('MAGNUM', [product('m1', true), product('m2', false)])])
    expect([...keys]).toEqual(['c_loose'])
  })
  it('one weighted product makes the whole card weighted', () => {
    const keys = weightedCardKeys(dict, [file('MAGNUM', [product('m2', false)]), file('GRAMAD', [product('g1', true)])])
    expect(keys.has('c_pack')).toBe(true)
  })
  it('does not treat products without a source file entry as weighted', () => {
    const keys = weightedCardKeys(dict, [file('MAGNUM', [product('m1', false)])])
    expect(keys.size).toBe(0)
  })
  it('ignores source products that are not in the dictionary', () => {
    expect(weightedCardKeys(dict, [file('MAGNUM', [product('new', true)])]).size).toBe(0)
  })
})
