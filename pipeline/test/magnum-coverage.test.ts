import { describe, expect, it } from 'vitest'
import type { SourceFile, SourceProduct } from '../src/types.js'
import { assertMagnumCoverage } from '../src/scrape/stores/magnum/coverage.js'
import { MAGNUM_SCOPE } from '../src/scrape/stores/magnum/scope.js'

const product = (categoryId: string, n: number): SourceProduct => ({
  sourceProductId: `magnum_${n}`,
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
  storeCode: 'MAGNUM', city: 'Shymkent', capturedAt: '2026-11-21T00:00:00.000Z', errorCount: 0, sourceStats: {}, products,
})

describe('assertMagnumCoverage', () => {
  it('passes when every scope slug has a product', () => {
    const slugs = new Set<string>()
    const products: SourceProduct[] = []
    MAGNUM_SCOPE.forEach((c, i) => {
      if (slugs.has(c.slug)) return
      slugs.add(c.slug)
      products.push(product(c.id, i))
    })
    expect(() => assertMagnumCoverage(file(products))).not.toThrow()
  })

  it('throws on an empty file', () => {
    expect(() => assertMagnumCoverage(file([]))).toThrow(/no products/i)
  })

  it('names the slug that has no products', () => {
    const products = MAGNUM_SCOPE.filter(c => c.slug !== 'fish').map((c, i) => product(c.id, i))
    expect(() => assertMagnumCoverage(file(products))).toThrow(/fish/)
  })

  it('ignores products whose category is outside the scope', () => {
    expect(() => assertMagnumCoverage(file([product('999999', 1)]))).toThrow(/milk/)
  })
})
