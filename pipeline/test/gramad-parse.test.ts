import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SourceProductSchema } from '../src/types.js'
import { gramadWeight, parseGramadSection, type GramadPageCategory } from '../src/scrape/stores/gramad/parse.js'

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/gramad/${name}.json`, import.meta.url), 'utf8'))

const category: GramadPageCategory = { id: 'sec-1', path: ['Овощи', 'Корнеплоды'] }

function product(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { storeProductId: '4870000000017', name: 'Товар', price: 100, promotions: [], outOfStock: false, ...over }
}
const section = (products: unknown[]) => ({
  type: 'GRID_VIEW_LAYOUT',
  data: { body: [{ id: 's.1', type: 'GRID', data: { elements: products.map((data) => ({ type: 'PRODUCT_TILE', data })) } }] },
})

describe('gramadWeight', () => {
  it('marks loose goods named with a trailing kg and a short code', () => {
    expect(gramadWeight('КАРТОФЕЛЬ КГ', '2701372')).toEqual({ isWeighted: true, weightAmbiguous: false })
    expect(gramadWeight('томаты розовые кг', '2701372')).toEqual({ isWeighted: true, weightAmbiguous: false })
  })
  it('leaves packaged goods alone', () => {
    for (const name of ['Сахар 1 КГ', 'Мука 2 кг', 'Рис 0,5кг']) {
      expect(gramadWeight(name, '4870000000017')).toEqual({ isWeighted: false, weightAmbiguous: false })
    }
  })
  it('treats 11 to 13 digit codes as packaged', () => {
    expect(gramadWeight('Сыр брынза 250 гр', '796500000017')).toEqual({ isWeighted: false, weightAmbiguous: false })
    expect(gramadWeight('Сыр брынза 250 гр', '79650000001')).toEqual({ isWeighted: false, weightAmbiguous: false })
    expect(gramadWeight('ОРЕХИ КГ', '796500000017')).toEqual({ isWeighted: false, weightAmbiguous: true })
    expect(gramadWeight('ОРЕХИ КГ', '7965000001')).toEqual({ isWeighted: true, weightAmbiguous: false })
  })
  it('flags disagreement between name and code as ambiguous', () => {
    expect(gramadWeight('ТОМАТЫ КГ', '4870000000017')).toEqual({ isWeighted: false, weightAmbiguous: true })
    expect(gramadWeight('Груша Конференция', '2700084')).toEqual({ isWeighted: false, weightAmbiguous: true })
    expect(gramadWeight('КГ', '2700084')).toEqual({ isWeighted: false, weightAmbiguous: true })
  })
})

describe('parseGramadSection', () => {
  it('maps a section', () => {
    const res = parseGramadSection(fixture('section'), category)
    expect(res.seen).toBe(6)
    expect(res.products).toHaveLength(5)
    for (const p of res.products) expect(() => SourceProductSchema.parse(p)).not.toThrow()
    const [loose, promo, noPromo, egg, pear] = res.products as [any, any, any, any, any]
    expect(loose.sourceProductId).toBe('gramad_2700001')
    expect(loose.price).toBe(210)
    expect(loose.oldPrice).toBeNull()
    expect(loose.sourceCategoryPath).toEqual(['Овощи', 'Корнеплоды'])
    expect(loose.rawPayload).toMatchObject({ code: '2700001', isWeighted: true, priceUnit: 'kg', barcode: null, categoryId: 'sec-1' })
    expect(promo.price).toBe(855)
    expect(promo.oldPrice).toBe(1273)
    expect(promo.rawPayload).toMatchObject({ barcode: '4870000000017', regularPrice: 1273, promoPrice: 855, priceUnit: null })
    expect(noPromo.price).toBe(700)
    expect(noPromo.oldPrice).toBeNull()
    expect(egg.price).toBe(51)
    expect(egg.rawPayload).toMatchObject({ barcode: '2900000000011', isWeighted: false, weightAmbiguous: false })
    expect(pear.imageUrl).toBeNull()
    expect(pear.rawPayload).toMatchObject({ weightAmbiguous: true, isWeighted: false })
  })

  it('gives a null barcode to a 12-digit code and ignores non-positive promo prices', () => {
    const res = parseGramadSection(
      section([
        product({ storeProductId: '796500000017', name: 'Сыр', price: 500 }),
        product({ storeProductId: '4870000000024', price: 300, promotions: [{ price: 0 }, { price: -4 }] }),
      ]),
      category,
    )
    const [upc, zeroPromo] = res.products as [any, any]
    expect(upc.rawPayload).toMatchObject({ barcode: null, isWeighted: false, weightAmbiguous: false })
    expect(zeroPromo.price).toBe(300)
    expect(zeroPromo.oldPrice).toBeNull()
  })

  it('takes the minimum over positive promo prices only', () => {
    const res = parseGramadSection(
      section([
        product({ price: 706, promotions: [{ price: 0 }, { price: 640 }] }),
        product({ storeProductId: '4870000000024', price: 300, promotions: [{ price: 0 }] }),
      ]),
      category,
    )
    const [promo, zeroOnly] = res.products as [any, any]
    expect(promo.price).toBe(640)
    expect(promo.oldPrice).toBe(706)
    expect(promo.rawPayload).toMatchObject({ promoPrice: 640 })
    expect(zeroOnly.price).toBe(300)
    expect(zeroOnly.rawPayload).toMatchObject({ promoPrice: null })
  })

  it('drops image urls that are not absolute http(s)', () => {
    const res = parseGramadSection(
      section([
        product({ imageUrl: '/img/a.png' }),
        product({ storeProductId: '4870000000024', imageUrl: '//cdn.example.com/a.png' }),
        product({ storeProductId: '4870000000031', imageUrl: 'ftp://cdn.example.com/a.png' }),
        product({ storeProductId: '4870000000048', imageUrl: 'https://cdn.example.com/a.png' }),
      ]),
      category,
    )
    expect(res.products.map((p) => p.imageUrl)).toEqual([null, null, null, 'https://cdn.example.com/a.png'])
  })

  it('accepts an empty section', () => {
    expect(parseGramadSection(fixture('empty-section'), category)).toEqual({ products: [], seen: 0 })
  })

  it('rejects non-positive prices naming the product code', () => {
    expect(() => parseGramadSection(section([product({ storeProductId: '2799999', price: 0 })]), category)).toThrow(/2799999/)
    expect(() => parseGramadSection(section([product({ storeProductId: '2799998', price: -5 })]), category)).toThrow(/2799998/)
    expect(() => parseGramadSection(section([product({ storeProductId: '2799997', price: 0.2 })]), category)).toThrow(/2799997/)
  })

  it('rejects unknown shapes naming the category', () => {
    expect(() => parseGramadSection({ nope: 1 }, category)).toThrow(/sec-1/)
    expect(() => parseGramadSection(null, category)).toThrow(/sec-1/)
    const badBlock = { type: 'X', data: { body: [{ id: 'a', type: 'CAROUSEL', data: {} }] } }
    expect(() => parseGramadSection(badBlock, category)).toThrow(/sec-1/)
    const badTile = { type: 'X', data: { body: [{ id: 'a', type: 'GRID', data: { elements: [{ type: 'BANNER', data: {} }] } }] } }
    expect(() => parseGramadSection(badTile, category)).toThrow(/sec-1/)
    expect(() => parseGramadSection(section([{ name: 'no code', price: 5 }]), category)).toThrow(/sec-1/)
  })
})
