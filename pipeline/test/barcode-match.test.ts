import { describe, expect, it } from 'vitest'
import { applyBarcodePairs, buildBarcodeIndex, findBarcodePairs } from '../src/mapping/barcode-match.js'
import { DictionarySchema } from '../src/mapping/dictionary.js'
import type { SourceFile, SourceProduct } from '../src/types.js'

const card = (name: string, attributes: Record<string, number> = {}) => ({ name, brand: null, category: 'milk', attributes, method: 'deterministic', confidence: 1, review: 'approved' })
const dict = DictionarySchema.parse({
  version: 1, generatedAt: '2026-10-05T20:42:51.173Z',
  canonicals: { c_a: card('Молоко 1 л', { volumeMl: 1000 }), c_b: card('Кефир'), c_loose: card('Яблоки'), c_taken: card('Сок') },
  products: { 'MAGNUM:m1': 'c_a', 'MAGNUM:m2': 'c_b', 'MAGNUM:m3': 'c_b', 'MAGNUM:m4': 'c_loose', 'MAGNUM:m5': 'c_taken', 'GRAMAD:g-old': 'c_taken' },
  storeCategories: {},
})
const mp = (id: string, barcodes: unknown, weighted = false): SourceProduct => ({
  sourceProductId: id, name: 'Товар', price: 100, oldPrice: null, imageUrl: null, sourceUrl: null, brand: null,
  sourceCategoryPath: [], rawPayload: { barcodes, ...(weighted ? { isWeighted: true } : {}) },
})
const gp = (id: string, name: string, barcode: unknown, weighted = false): SourceProduct => ({
  sourceProductId: id, name, price: 100, oldPrice: null, imageUrl: null, sourceUrl: null, brand: null,
  sourceCategoryPath: [], rawPayload: { barcode, ...(weighted ? { isWeighted: true } : {}) },
})
const magnum: SourceFile = {
  storeCode: 'MAGNUM', city: 'Shymkent', capturedAt: '2026-11-22T00:00:00.000Z', errorCount: 0, sourceStats: {},
  products: [
    mp('m1', ['4870000000011', '2900800020254', '123456789012']), mp('m2', ['4870000000028']), mp('m3', ['4870000000028', '4870000000035']),
    mp('m4', ['4870000000042'], true), mp('m5', ['4870000000059']), mp('unmapped', ['4870000000066']),
  ],
}
const index = buildBarcodeIndex(dict, [magnum])
const weighted = new Set(['c_loose'])
const find = (products: SourceProduct[]) => findBarcodePairs(dict, 'GRAMAD', products, index, weighted)

describe('buildBarcodeIndex', () => {
  it('skips 20-29 prefixes, non-13-digit codes and products outside the dictionary', () => {
    expect([...index.keys()].sort()).toEqual(['4870000000011', '4870000000028', '4870000000035', '4870000000042', '4870000000059'])
  })
  it('maps a barcode to sorted unique cards', () => {
    expect(index.get('4870000000028')).toEqual(['c_b'])
    const two = buildBarcodeIndex(dict, [{ ...magnum, products: [mp('m1', ['4870000000011']), mp('m2', ['4870000000011'])] }])
    expect(two.get('4870000000011')).toEqual(['c_a', 'c_b'])
  })
  it('reads Gramad barcode', () => {
    const idx = buildBarcodeIndex(dict, [{ ...magnum, storeCode: 'GRAMAD', products: [gp('g-old', 'Сок', '4870000000077')] }])
    expect(idx.get('4870000000077')).toEqual(['c_taken'])
  })
})

describe('findBarcodePairs', () => {
  it('pairs a product with a single matching card', () => {
    const r = find([gp('g1', 'Молоко 1 л', '4870000000011')])
    expect(r.pairs).toEqual([{ id: 'GRAMAD:g1', name: 'Молоко 1 л', barcode: '4870000000011', card: 'c_a' }])
    expect(r.stats.barcodeAttached).toBe(1)
  })
  it('does not pair a product with an unknown or invalid barcode', () => {
    const r = find([gp('g1', 'Молоко', '9999999999999'), gp('g2', 'Молоко', null), gp('g3', 'Молоко', '2900800020254')])
    expect(r.pairs).toEqual([])
  })
  it('counts an ambiguous barcode set', () => {
    const idx = buildBarcodeIndex(dict, [{ ...magnum, products: [mp('m1', ['4870000000011']), mp('m2', ['4870000000011'])] }])
    const r = findBarcodePairs(dict, 'GRAMAD', [gp('g1', 'Молоко', '4870000000011')], idx, weighted)
    expect(r.pairs).toEqual([])
    expect(r.stats.barcodeAmbiguous).toBe(1)
  })
  it('rejects a size conflict', () => {
    const r = find([gp('g1', 'Молоко 2 л', '4870000000011')])
    expect(r.pairs).toEqual([])
    expect(r.stats.barcodeRejectedSize).toBe(1)
  })
  it('rejects a weight mismatch in both directions', () => {
    const r = find([gp('g1', 'Яблоки', '4870000000042', false), gp('g2', 'Кефир', '4870000000028', true)])
    expect(r.pairs).toEqual([])
    expect(r.stats.barcodeRejectedWeight).toBe(2)
  })
  it('pairs weighted with weighted', () => {
    expect(find([gp('g1', 'Яблоки', '4870000000042', true)]).stats.barcodeAttached).toBe(1)
  })
  it('counts a card that already has a product of this store', () => {
    const r = find([gp('g1', 'Сок', '4870000000059')])
    expect(r.pairs).toEqual([])
    expect(r.stats.barcodeSameStore).toBe(1)
  })
  it('does not attach two new products to one card', () => {
    const r = find([gp('g1', 'Кефир', '4870000000028'), gp('g2', 'Кефир', '4870000000028')])
    expect(r.pairs.map((p) => p.id)).toEqual(['GRAMAD:g1'])
    expect(r.stats.barcodeSameStore).toBe(1)
  })
})

describe('applyBarcodePairs', () => {
  const pair = { id: 'GRAMAD:g1', name: 'Молоко 1 л', barcode: '4870000000011', card: 'c_a' }
  it('adds products[id] = card and leaves cards untouched', () => {
    const r = applyBarcodePairs(dict, 'GRAMAD', [pair])
    expect(r.attached).toBe(1)
    expect(r.dict.products['GRAMAD:g1']).toBe('c_a')
    expect(r.dict.canonicals).toEqual(dict.canonicals)
    expect(dict.products['GRAMAD:g1']).toBeUndefined()
  })
  it('throws on an id already in the dictionary', () => {
    expect(() => applyBarcodePairs(dict, 'GRAMAD', [{ ...pair, id: 'GRAMAD:g-old', card: 'c_a' }])).toThrow(/already in the dictionary/)
  })
  it('rechecks size, same store, unknown card and foreign store', () => {
    expect(() => applyBarcodePairs(dict, 'GRAMAD', [{ ...pair, name: 'Молоко 2 л' }])).toThrow(/size/)
    expect(() => applyBarcodePairs(dict, 'GRAMAD', [{ ...pair, card: 'c_taken' }])).toThrow(/already has a GRAMAD/)
    expect(() => applyBarcodePairs(dict, 'GRAMAD', [{ ...pair, card: 'c_nope' }])).toThrow(/not found/)
    expect(() => applyBarcodePairs(dict, 'GRAMAD', [{ ...pair, id: 'MAGNUM:x' }])).toThrow(/not a GRAMAD/)
  })
})
