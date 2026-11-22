import { describe, expect, it } from 'vitest'
import type { SourceFile, SourceProduct } from '../src/types.js'
import { assertGramadCoverage } from '../src/scrape/stores/gramad/coverage.js'
import { GRAMAD_SCOPE } from '../src/scrape/stores/gramad/scope.js'

const product = (categoryId: string, n: number): SourceProduct => ({
  sourceProductId: `gramad_${n}`,
  name: 'Товар',
  price: 100,
  oldPrice: null,
  imageUrl: null,
  sourceUrl: null,
  brand: null,
  sourceCategoryPath: [],
  rawPayload: { categoryId },
})

const file = (products: SourceProduct[]): SourceFile => ({
  storeCode: 'GRAMAD', city: 'Shymkent', capturedAt: '2026-11-22T00:00:00.000Z', errorCount: 0, sourceStats: {}, products,
})

describe('assertGramadCoverage', () => {
  it('passes when every scope slug has a product', () => {
    const slugs = new Set<string>()
    const products: SourceProduct[] = []
    GRAMAD_SCOPE.forEach((c, i) => {
      if (slugs.has(c.slug)) return
      slugs.add(c.slug)
      products.push(product(c.id, i))
    })
    expect(() => assertGramadCoverage(file(products))).not.toThrow()
  })

  it('throws on an empty file', () => {
    expect(() => assertGramadCoverage(file([]))).toThrow(/no products/i)
  })

  it('names the slug that has no products', () => {
    const products = GRAMAD_SCOPE.filter(c => c.slug !== 'fish').map((c, i) => product(c.id, i))
    expect(() => assertGramadCoverage(file(products))).toThrow(/fish/)
  })

  it('ignores products whose category is outside the scope', () => {
    expect(() => assertGramadCoverage(file([product('1', 1)]))).toThrow(/milk/)
  })
})
