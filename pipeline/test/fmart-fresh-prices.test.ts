import { describe, expect, it } from 'vitest'
import type { SourceFile } from '../src/types.js'
import { assertFmartFreshPrices } from '../src/scrape/stores/fmart/fresh-prices.js'
import { fmartFreshId } from '../src/scrape/stores/fmart/parse.js'

type Item = { name: string; price: number; source?: 'fresh500' | 'flag' }
const file = (items: Item[]): SourceFile => ({
  storeCode: 'FMART',
  city: 'Shymkent',
  capturedAt: '2026-11-23T00:00:00.000Z',
  errorCount: 0,
  sourceStats: {},
  products: items.map((it) => ({
    sourceProductId: fmartFreshId(it.name),
    name: it.name,
    price: it.price,
    oldPrice: null,
    imageUrl: null,
    sourceUrl: null,
    brand: null,
    sourceCategoryPath: [],
    rawPayload: { weightSource: it.source ?? 'fresh500', unitPrice: it.price },
  })),
})
const names = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `Овощ ${from + i}`)
const set = (n: number, price: number, from = 0): Item[] => names(n, from).map((name) => ({ name, price }))

describe('assertFmartFreshPrices', () => {
  it('refuses a median ratio of 2.0', () => {
    expect(() => assertFmartFreshPrices(file(set(20, 100)), file(set(20, 200)))).toThrow(/keeping previous file/)
  })
  it('refuses a median ratio of 0.5', () => {
    expect(() => assertFmartFreshPrices(file(set(20, 200)), file(set(20, 100)))).toThrow(/ratio/)
  })
  it('accepts exactly 1.6 and exactly 0.625', () => {
    assertFmartFreshPrices(file(set(20, 100)), file(set(20, 160)))
    assertFmartFreshPrices(file(set(20, 160)), file(set(20, 100)))
  })
  it('accepts growth of 30%', () => {
    assertFmartFreshPrices(file(set(20, 100)), file(set(20, 130)))
  })
  it('uses the median, so a few outliers do not refuse', () => {
    const now = [...set(15, 100), ...set(5, 1000, 15)]
    assertFmartFreshPrices(file(set(20, 100)), file(now))
  })
  it('refuses when only 4 match with 15 on each side', () => {
    expect(() => assertFmartFreshPrices(file(set(15, 100)), file(set(15, 100, 11)))).toThrow(/match/)
  })
  it('accepts 4 common when one side has 10', () => {
    assertFmartFreshPrices(file(set(10, 100)), file(set(15, 100, 6)))
  })
  it('does not check the ratio without common products', () => {
    assertFmartFreshPrices(file(set(10, 100)), file(set(10, 900, 50)))
  })
  it('ignores explicit-weight products', () => {
    const flag = (n: number, price: number): Item[] => set(n, price).map((i) => ({ ...i, source: 'flag' as const }))
    assertFmartFreshPrices(file(flag(20, 100)), file(flag(20, 900)))
  })
  it('ignores previous products without a positive unit price', () => {
    const prev = file(set(20, 100))
    for (const p of prev.products) p.rawPayload = { weightSource: 'fresh500', unitPrice: 0 }
    assertFmartFreshPrices(prev, file(set(20, 900)))
  })
})
