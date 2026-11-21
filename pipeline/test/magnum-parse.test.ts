import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SourceProductSchema, type SourceProduct } from '../src/types.js'
import { parseMagnumPage, type MagnumPageCategory } from '../src/scrape/stores/magnum/parse.js'

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/magnum/${name}.json`, import.meta.url), 'utf8'))

const category: MagnumPageCategory = { id: 'cat-1', path: ['Мясо', 'Фарш'] }

function item(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    itemId: 11,
    name: 'Товар',
    price: 10000,
    measureUnit: { name: 'шт', isDividable: false, divideValue: 1 },
    availabilityId: 3,
    isActive: true,
    ...over,
  }
}
const page = (content: unknown[], number = 0, size = 15) => ({ content, number, size })

describe('parseMagnumPage', () => {
  it('maps a full page', () => {
    const res = parseMagnumPage(fixture('full-page'), category, 0)
    expect(res.seen).toBe(3)
    expect(res.total).toBeNull()
    expect(res.nextPage).toBe(1)
    expect(res.products.map((p) => p.price)).toEqual([1352, 5379, 6299])
    for (const p of res.products) expect(() => SourceProductSchema.parse(p)).not.toThrow()
    const [piece, discounted, weighted] = res.products as [SourceProduct, SourceProduct, SourceProduct]
    expect(piece.sourceProductId).toBe('magnum_3387089')
    expect(piece.oldPrice).toBeNull()
    expect(piece.rawPayload).toMatchObject({ isWeighted: false, priceUnit: null, orderStepGrams: null })
    expect(discounted.oldPrice).toBe(6328)
    expect(discounted.rawPayload).toMatchObject({
      isWeighted: true, priceUnit: 'kg', orderStepGrams: 700, priceTiyn: 537900, prevPriceTiyn: 632800,
      categoryId: 'cat-1', itemId: 3426711, extId: 508119, barcodes: ['2152790'],
    })
    expect(weighted.rawPayload).toMatchObject({ isWeighted: true, priceUnit: 'kg', orderStepGrams: 1100 })
    expect(piece.imageUrl).toBe('https://s3-pic.e-magnum.kz/item/349111.jpg')
    expect(piece.sourceUrl).toBeNull()
    expect(piece.brand).toBeNull()
    expect(piece.sourceCategoryPath).toEqual(['Мясо', 'Фарш'])
  })

  it('last page has no next page', () => {
    const res = parseMagnumPage(fixture('last-page'), category, 1)
    expect(res.seen).toBe(2)
    expect(res.nextPage).toBeNull()
  })

  it('skips unavailable items but counts them as seen', () => {
    const res = parseMagnumPage(fixture('unavailable-page'), category, 0)
    expect(res.products).toHaveLength(1)
    expect(res.seen).toBe(3)
    expect(res.nextPage).toBe(1)
  })

  it('handles an empty page', () => {
    const res = parseMagnumPage(fixture('empty-page'), category, 2)
    expect(res).toEqual({ products: [], seen: 0, total: null, nextPage: null })
  })

  it('skips inactive, non-positive id and zero-price items', () => {
    const res = parseMagnumPage(
      page([item({ isActive: false }), item({ itemId: 0 }), item({ price: 0 }), item({ availabilityId: 0 }), item()]),
      category,
      0,
    )
    expect(res.products).toHaveLength(1)
    expect(res.seen).toBe(5)
  })

  it('throws on an unknown measure unit', () => {
    const bad = item({ measureUnit: { name: 'л', isDividable: true, divideValue: 1000 } })
    expect(() => parseMagnumPage(page([bad]), category, 0)).toThrow(/unknown Magnum measure unit.*11/)
  })

  it('reads weightedness only from the unit, not from the name', () => {
    const res = parseMagnumPage(page([item({ name: 'Мука 1 кг' })]), category, 0)
    expect(res.products[0]!.rawPayload.isWeighted).toBe(false)
  })

  it('throws with itemId and category for an available item without a name', () => {
    expect(() => parseMagnumPage(page([item({ name: undefined })]), category, 0)).toThrow(/11.*cat-1|cat-1.*11/)
  })

  it('throws when the body is not a page', () => {
    expect(() => parseMagnumPage({ foo: 1 }, category, 0)).toThrow(/cat-1/)
    expect(() => parseMagnumPage(null, category, 0)).toThrow(/cat-1/)
  })

  it('drops oldPrice when prevPrice is not above price', () => {
    const res = parseMagnumPage(
      page([item({ discount: { prevPrice: 10000 } }), item({ itemId: 12, discount: { prevPrice: 9000 } }), item({ itemId: 13, discount: null })]),
      category,
      0,
    )
    expect(res.products.map((p) => p.oldPrice)).toEqual([null, null, null])
  })

  it('falls back to the first list image, then null', () => {
    const res = parseMagnumPage(
      page([item({ imgList: ['https://example.com/a.jpg'] }), item({ itemId: 12 })]),
      category,
      0,
    )
    expect(res.products.map((p) => p.imageUrl)).toEqual(['https://example.com/a.jpg', null])
  })

  it('computes nextPage from page size', () => {
    expect(parseMagnumPage(page([item()], 4, 1), category, 4).nextPage).toBe(5)
    expect(parseMagnumPage(page([item()], 4, 2), category, 4).nextPage).toBeNull()
  })

  it('throws when the page number differs from the requested one', () => {
    expect(() => parseMagnumPage(page([item()], 0, 1), category, 3)).toThrow(/cat-1.*3.*0/)
  })

  it('derives nextPage from the requested page', () => {
    expect(parseMagnumPage(page([item()], 7, 1), category, 7).nextPage).toBe(8)
  })

  it('throws on an unknown availabilityId and on a non-numeric one', () => {
    expect(() => parseMagnumPage(page([item({ availabilityId: 2 })]), category, 0)).toThrow(/unknown Magnum availabilityId.*11.*2/)
    expect(() => parseMagnumPage(page([item({ availabilityId: 'x' })]), category, 0)).toThrow(/unknown Magnum availabilityId/)
    expect(() => parseMagnumPage(page([item({ availabilityId: undefined })]), category, 0)).toThrow(/unknown Magnum availabilityId/)
  })

  it('keeps skipping placeholders regardless of availability', () => {
    const res = parseMagnumPage(page([item({ itemId: -5, availabilityId: 9 })]), category, 0)
    expect(res.products).toEqual([])
  })

  it('treats a null prevPrice as no discount', () => {
    const res = parseMagnumPage(page([item({ discount: { prevPrice: null } }), item({ itemId: 12, discount: {} })]), category, 0)
    expect(res.products.map((p) => p.oldPrice)).toEqual([null, null])
    expect(res.products.map((p) => p.rawPayload.prevPriceTiyn)).toEqual([null, null])
  })

  it('throws for a kg unit with divideValue other than 1000', () => {
    const bad = item({ measureUnit: { name: 'кг', isDividable: true, divideValue: 100 } })
    expect(() => parseMagnumPage(page([bad]), category, 0)).toThrow(/unknown Magnum measure unit/)
  })

  it('stores exactly the documented rawPayload keys', () => {
    const res = parseMagnumPage(page([item()]), category, 0)
    expect(Object.keys(res.products[0]!.rawPayload).sort()).toEqual(
      ['barcodes', 'categoryId', 'extId', 'isWeighted', 'itemId', 'orderStepGrams', 'prevPriceTiyn', 'priceTiyn', 'priceUnit'],
    )
  })

  it('stores a null extId when the item has none', () => {
    const res = parseMagnumPage(page([item()]), category, 0)
    expect(res.products[0]!.rawPayload.extId).toBeNull()
  })

  it('fixtures contain no sensitive or warehouse keys', () => {
    const banned = new Set(['token', 'authorization', 'cookie', 'device', 'wmsitemlocation', 'descr'])
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) return v.forEach(walk)
      if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) {
          expect(banned.has(k.toLowerCase())).toBe(false)
          walk(x)
        }
      }
    }
    for (const n of ['full-page', 'last-page', 'unavailable-page', 'empty-page']) walk(fixture(n))
  })
})
